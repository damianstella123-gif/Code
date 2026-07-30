import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALLOWED_ROLES = ["Admin", "Super Admin"];

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(status: number) {
  return jsonResponse({ error: "INTERNAL_ERROR" }, status);
}

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface CheckResult {
  severity: "info" | "warning" | "critical";
  category: string;
  message: string;
  detail?: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // --- Authorization: resolve caller identity server-side ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "UNAUTHORIZED" }, 401);
  }

  const sb = getServiceClient();

  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);

  if (authErr || !user) {
    return jsonResponse({ error: "UNAUTHORIZED" }, 401);
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return jsonResponse({ error: "FORBIDDEN" }, 403);
  }

  // --- Run checks ---
  try {
    const alerts: CheckResult[] = [];

    // a) FLY COSTS — check if costs exceed 5 EUR in last 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: costRows } = await sb
      .from("fly_logs")
      .select("estimated_cost_eur")
      .gte("created_at", since24h);

    if (costRows && costRows.length > 0) {
      const totalCost = costRows.reduce(
        (sum: number, r: { estimated_cost_eur: number | null }) =>
          sum + (r.estimated_cost_eur || 0),
        0,
      );
      if (totalCost > 5) {
        alerts.push({
          severity: "critical",
          category: "fly_costs",
          message: `Costi Fly elevati: €${totalCost.toFixed(2)} nelle ultime 24h`,
          detail: { total_eur: totalCost, rows: costRows.length },
        });
      }
    }

    // b) ERROR SPIKE — more than 20 errors in last hour
    const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: errorCount } = await sb
      .from("error_log")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since1h);

    if (errorCount && errorCount > 20) {
      alerts.push({
        severity: "warning",
        category: "error_spike",
        message: `Picco errori: ${errorCount} nell'ultima ora`,
        detail: { count: errorCount },
      });
    }

    // c) RATE LIMIT — users hitting >= 20 requests in last hour
    const { data: rateLimitRows } = await sb
      .from("fly_rate_limits")
      .select("user_id, count")
      .gte("window_start", since1h)
      .gte("count", 20);

    if (rateLimitRows && rateLimitRows.length > 0) {
      for (const row of rateLimitRows) {
        alerts.push({
          severity: "info",
          category: "rate_limit",
          message: `Utente ha raggiunto il rate limit (${row.count} richieste)`,
          detail: { user_id: row.user_id, count: row.count },
        });
      }
    }

    // d) ORPHAN TASKS — tasks referencing non-existent events
    const { data: orphanData } = await sb.rpc("sentinel_count_orphan_tasks");
    const orphanCount =
      orphanData !== null && orphanData !== undefined
        ? typeof orphanData === "number"
          ? orphanData
          : (orphanData as { count: number })?.count ?? 0
        : 0;

    if (orphanCount > 0) {
      alerts.push({
        severity: "warning",
        category: "orphan_tasks",
        message: `${orphanCount} task orfani senza evento collegato`,
        detail: { count: orphanCount },
      });
    }

    // e) FLY ERRORS — more than 5 fly errors in last hour
    const { count: flyErrorCount } = await sb
      .from("fly_logs")
      .select("*", { count: "exact", head: true })
      .eq("outcome", "error")
      .gte("created_at", since1h);

    if (flyErrorCount && flyErrorCount > 5) {
      alerts.push({
        severity: "critical",
        category: "fly_errors",
        message: `Fly in errore: ${flyErrorCount} fallimenti nell'ultima ora`,
        detail: { count: flyErrorCount },
      });
    }

    // --- Insert alerts (deduplicate against existing 'new' alerts) ---
    let inserted = 0;
    for (const alert of alerts) {
      const { data: existing } = await sb
        .from("sentinel_alerts")
        .select("id")
        .eq("category", alert.category)
        .eq("status", "new")
        .limit(1)
        .maybeSingle();

      if (existing) continue;

      const { error: insertErr } = await sb
        .from("sentinel_alerts")
        .insert({
          severity: alert.severity,
          category: alert.category,
          message: alert.message,
          detail: alert.detail || {},
        });

      if (insertErr) {
        console.error(`sentinel_insert_fail: ${alert.category}`);
        continue;
      }

      inserted++;

      // For CRITICAL alerts, notify all Admin/Super Admin users
      if (alert.severity === "critical") {
        const { data: admins } = await sb
          .from("profiles")
          .select("id")
          .in("role", ALLOWED_ROLES);

        if (admins && admins.length > 0) {
          const notifications = admins.map((a: { id: string }) => ({
            user_id: a.id,
            title: `SENTINEL: ${alert.message}`,
            message: alert.message,
            type: "sentinel",
            related_entity_type: "sentinel",
            related_entity_id: null,
            is_read: false,
          }));

          await sb.from("notifications").insert(notifications);
        }
      }
    }

    return jsonResponse({
      ok: true,
      checks_run: 5,
      alerts_found: alerts.length,
      alerts_inserted: inserted,
    });
  } catch (_err) {
    console.error("sentinel_check_failure");
    return errorResponse(500);
  }
});
