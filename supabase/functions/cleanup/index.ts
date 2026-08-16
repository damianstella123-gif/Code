import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ADMIN_ROLES = ["Super Admin", "Admin"];

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function authorize(
  adminClient: ReturnType<typeof createClient>,
  req: Request
): Promise<{ ok: true } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResp({ error: "AUTH_REQUIRED" }, 401);

  const claims = decodeJwtPayload(token);
  if (claims && claims.role === "service_role") {
    return { ok: true };
  }
  // New sb_secret_ service key is not a JWT: accept a direct match instead.
  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return { ok: true };
  }

  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return jsonResp({ error: "AUTH_REQUIRED" }, 401);

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    return jsonResp({ error: "ROLE_NOT_ALLOWED" }, 403);
  }

  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResp({ error: "INVALID_ACTION" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const auth = await authorize(adminClient, req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // pg_cron sends '{}' which is fine; no body is also fine for cron
  }

  if (body.confirm !== true && body.confirm !== "true") {
    // Allow pg_cron (empty body / no confirm) only from service_role
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const claims = decodeJwtPayload(token);
    if (!claims || claims.role !== "service_role") {
      return jsonResp({ error: "INVALID_INPUT", detail: "Confirmation required." }, 400);
    }
  }

  const results: { table: string; deleted: number }[] = [];

  try {
    // 1. Fly logs: keep 90 days
    const flyLogsCutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: flyDel } = await adminClient
      .from("fly_logs")
      .delete()
      .lt("created_at", flyLogsCutoff)
      .select("id");
    results.push({ table: "fly_logs", deleted: flyDel?.length ?? 0 });

    // 2. Fly cache: expired entries (> 2 hours)
    const cacheCutoff = new Date(Date.now() - 2 * 3600000).toISOString();
    const { data: cacheDel } = await adminClient
      .from("fly_cache")
      .delete()
      .lt("created_at", cacheCutoff)
      .select("id");
    results.push({ table: "fly_cache", deleted: cacheDel?.length ?? 0 });

    // 3. Rate limits older than 7 days
    const rateCutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const { data: rateDel } = await adminClient
      .from("fly_rate_limits")
      .delete()
      .lt("day_date", rateCutoff)
      .select("id");
    results.push({ table: "fly_rate_limits", deleted: rateDel?.length ?? 0 });

    // 4. Read notifications older than 30 days
    const notifCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: notifDel } = await adminClient
      .from("notifications")
      .delete()
      .eq("is_read", true)
      .lt("created_at", notifCutoff)
      .select("id");
    results.push({ table: "notifications", deleted: notifDel?.length ?? 0 });

    // 5. Impact log: aggregate old entries (> 6 months) into monthly reports
    const impactCutoff = new Date(Date.now() - 180 * 86400000).toISOString();
    const { data: oldImpact } = await adminClient
      .from("impact_actions_log")
      .select("id, user_id, minuti_risparmiati, valore_eur, created_at")
      .lt("created_at", impactCutoff);

    if (oldImpact && oldImpact.length > 0) {
      const groups: Record<string, { user_id: string; mese: number; anno: number; minuti: number; valore: number }> = {};
      for (const row of oldImpact) {
        const d = new Date(row.created_at);
        const key = `${row.user_id}_${d.getMonth() + 1}_${d.getFullYear()}`;
        if (!groups[key]) {
          groups[key] = {
            user_id: row.user_id,
            mese: d.getMonth() + 1,
            anno: d.getFullYear(),
            minuti: 0,
            valore: 0,
          };
        }
        groups[key].minuti += Number(row.minuti_risparmiati) || 0;
        groups[key].valore += Number(row.valore_eur) || 0;
      }

      for (const g of Object.values(groups)) {
        await adminClient
          .from("impact_monthly_reports")
          .upsert(
            {
              user_id: g.user_id,
              mese: g.mese,
              anno: g.anno,
              ore_risparmiate: g.minuti / 60,
              valore_eur: g.valore,
              kg_co2_risparmiati: 0,
            },
            { onConflict: "user_id,mese,anno" }
          );
      }

      const idsToDelete = oldImpact.map((r) => r.id);
      for (let i = 0; i < idsToDelete.length; i += 100) {
        const batch = idsToDelete.slice(i, i + 100);
        await adminClient.from("impact_actions_log").delete().in("id", batch);
      }
      results.push({ table: "impact_actions_log", deleted: oldImpact.length });
    } else {
      results.push({ table: "impact_actions_log", deleted: 0 });
    }

    // 6. Resolved sentinel alerts older than 30 days
    const sentinelCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: sentDel } = await adminClient
      .from("sentinel_alerts")
      .delete()
      .eq("status", "resolved")
      .lt("resolved_at", sentinelCutoff)
      .select("id");
    results.push({ table: "sentinel_alerts", deleted: sentDel?.length ?? 0 });

    // 7. Audit log: keep 1 year
    const auditCutoff = new Date(Date.now() - 365 * 86400000).toISOString();
    const { data: auditDel } = await adminClient
      .from("audit_log")
      .delete()
      .lt("created_at", auditCutoff)
      .select("id");
    results.push({ table: "audit_log", deleted: auditDel?.length ?? 0 });

    // 8. Error log: keep 60 days
    const errorCutoff = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data: errorDel } = await adminClient
      .from("error_log")
      .delete()
      .lt("created_at", errorCutoff)
      .select("id");
    results.push({ table: "error_log", deleted: errorDel?.length ?? 0 });

    const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);

    await adminClient.from("error_log").insert({
      pagina: "cleanup",
      azione: "scheduled",
      messaggio: "Cleanup completato",
      dettaglio: JSON.stringify({ total_deleted: totalDeleted }),
    });

    return jsonResp({ success: true, results, total_deleted: totalDeleted });
  } catch {
    await adminClient.from("error_log").insert({
      pagina: "cleanup",
      azione: "scheduled",
      messaggio: "Cleanup fallito",
    }).catch(() => {});

    return jsonResp({ error: "INTERNAL_ERROR" }, 500);
  }
});
