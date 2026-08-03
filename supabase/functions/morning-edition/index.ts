import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResp({ error: "INVALID_ACTION" }, 405);
  }

  // ─── Authorize: only service_role JWTs ─────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResp({ error: "AUTH_REQUIRED" }, 401);

  const claims = decodeJwtPayload(token);
  if (!claims || claims.role !== "service_role") {
    return jsonResp({ error: "ROLE_NOT_ALLOWED" }, 403);
  }

  // ─── Validate body ────────────────────────────────────────────────
  try {
    const rawBody = await req.text();
    if (rawBody.length > 0) {
      const parsed = JSON.parse(rawBody);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return jsonResp({ error: "INVALID_INPUT" }, 400);
      }
    }
  } catch {
    return jsonResp({ error: "INVALID_INPUT" }, 400);
  }

  try {
    const sb = getServiceClient();

    const { data: users } = await sb
      .from("profiles")
      .select("id, first_name, last_name, settings, is_active")
      .eq("is_active", true);

    if (!users || users.length === 0) {
      return jsonResp({ ok: true, processed: 0, leave_alerts: 0 });
    }

    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000)
      .toISOString()
      .split("T")[0];
    const in72h = new Date(Date.now() + 72 * 3600000).toISOString();

    // ─── Leave alerts for admins ─────────────────────────────────────
    const in7days = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .split("T")[0];

    const { data: admins } = await sb
      .from("profiles")
      .select("id")
      .in("role", ["Admin", "Super Admin", "Amministrazione"]);

    const adminIds = (admins ?? []).map((a: { id: string }) => a.id);

    const { data: leaves7 } = await sb
      .from("leave_requests")
      .select("id, tipo, data_inizio, data_fine, profiles(first_name, last_name)")
      .eq("stato", "approvata")
      .eq("data_inizio", in7days);

    const { data: leaves1 } = await sb
      .from("leave_requests")
      .select("id, tipo, data_inizio, data_fine, profiles(first_name, last_name)")
      .eq("stato", "approvata")
      .eq("data_inizio", tomorrow);

    const { data: leavesToday } = await sb
      .from("leave_requests")
      .select("id, tipo, data_inizio, data_fine, profiles(first_name, last_name)")
      .eq("stato", "approvata")
      .lte("data_inizio", today)
      .gte("data_fine", today);

    const EMOJI: Record<string, string> = {
      ferie: "\u{1F3D6}\uFE0F",
      permesso: "\u23F0",
      malattia: "\u{1F912}",
      recupero: "\u{1F4A4}",
    };

    let leaveAlerts = 0;

    for (const l of leaves7 ?? []) {
      const prof = l.profiles as unknown as {
        first_name: string;
        last_name: string;
      };
      const nome = `${prof.first_name} ${prof.last_name}`;
      const nots = adminIds.map((aid: string) => ({
        user_id: aid,
        is_read: false,
        title: "\u{1F4C5} Ferie in arrivo",
        message: `${nome} ha ${l.tipo} tra 7 giorni (${l.data_inizio} \u2192 ${l.data_fine}). Verifica la copertura.`,
        type: "leave_reminder",
        related_entity_type: "leave_request",
        related_entity_id: l.id,
      }));
      if (nots.length > 0) {
        await sb.from("notifications").insert(nots);
        leaveAlerts += nots.length;
      }
    }

    for (const l of leaves1 ?? []) {
      const prof = l.profiles as unknown as {
        first_name: string;
        last_name: string;
      };
      const nome = `${prof.first_name} ${prof.last_name}`;
      const nots = adminIds.map((aid: string) => ({
        user_id: aid,
        is_read: false,
        title: "\u26A0\uFE0F Ferie domani",
        message: `Domani ${nome} \u00E8 in ${l.tipo} (fino al ${l.data_fine}). Verifica la copertura.`,
        type: "leave_reminder",
        related_entity_type: "leave_request",
        related_entity_id: l.id,
      }));
      if (nots.length > 0) {
        await sb.from("notifications").insert(nots);
        leaveAlerts += nots.length;
      }
    }

    for (const l of leavesToday ?? []) {
      const prof = l.profiles as unknown as {
        first_name: string;
        last_name: string;
      };
      const nome = `${prof.first_name} ${prof.last_name}`;
      const em = EMOJI[l.tipo] || "\u{1F4C5}";
      const nots = adminIds.map((aid: string) => ({
        user_id: aid,
        is_read: false,
        title: "\u{1F3D6}\uFE0F In ferie oggi",
        message: `${em} Oggi ${nome} \u00E8 in ${l.tipo} (rientra il ${l.data_fine})`,
        type: "leave_reminder",
        related_entity_type: "leave_request",
        related_entity_id: l.id,
      }));
      if (nots.length > 0) {
        await sb.from("notifications").insert(nots);
        leaveAlerts += nots.length;
      }
    }

    // ─── Per-user morning briefs ─────────────────────────────────────
    let processed = 0;

    for (const user of users) {
      const settings = (user.settings || {}) as Record<string, unknown>;
      if (settings.morningEdition === false) continue;

      const { data: overdueTasks } = await sb
        .from("tasks")
        .select("id, titolo, scadenza, priorita, stato")
        .eq("assegnatario", user.id)
        .neq("stato", "completato")
        .lt("scadenza", today);

      const { data: upcomingTasks } = await sb
        .from("tasks")
        .select("id, titolo, scadenza, priorita, stato")
        .eq("assegnatario", user.id)
        .neq("stato", "completato")
        .in("scadenza", [today, tomorrow]);

      const { data: upcomingEvents } = await sb
        .from("events")
        .select("id, nome, data_inizio, location, stato")
        .gte("data_inizio", new Date().toISOString())
        .lte("data_inizio", in72h)
        .neq("stato", "completato");

      const { data: budgetEvents } = await sb
        .from("events")
        .select("id, nome, budget")
        .neq("stato", "completato")
        .gt("budget", 0);

      const budgetWarnings: { nome: string }[] = [];
      if (budgetEvents) {
        for (const ev of budgetEvents.slice(0, 10)) {
          const { data: budgetRows } = await sb
            .from("budgets")
            .select("costo_unitario, quantita")
            .eq("evento", ev.id);
          if (budgetRows) {
            const spent = budgetRows.reduce(
              (
                s: number,
                r: { costo_unitario: number | null; quantita: number | null }
              ) => s + (r.costo_unitario || 0) * (r.quantita || 1),
              0
            );
            if (spent > ev.budget * 0.9) {
              budgetWarnings.push({ nome: ev.nome });
            }
          }
        }
      }

      const { data: paymentsDue } = await sb
        .from("event_payments")
        .select("id, data_scadenza")
        .is("data_pagamento", null)
        .lte("data_scadenza", tomorrow);

      const overduePayments = (paymentsDue ?? []).filter(
        (p) => p.data_scadenza < today
      );
      const duePayments = (paymentsDue ?? []).filter(
        (p) => p.data_scadenza >= today
      );

      const overdueCount = (overdueTasks ?? []).length;
      const upcomingCount = (upcomingTasks ?? []).length;
      const eventsCount = (upcomingEvents ?? []).length;
      const budgetCount = budgetWarnings.length;
      const overduePayCount = overduePayments.length;
      const duePayCount = duePayments.length;

      const hasContent =
        overdueCount > 0 ||
        upcomingCount > 0 ||
        eventsCount > 0 ||
        budgetCount > 0 ||
        overduePayCount > 0 ||
        duePayCount > 0;

      if (!hasContent) continue;

      const lines: string[] = [];
      if (overdueCount > 0)
        lines.push(
          `${overdueCount} task in ritardo richiedono attenzione immediata.`
        );
      if (upcomingCount > 0)
        lines.push(`${upcomingCount} task in scadenza oggi/domani.`);
      if (eventsCount > 0)
        lines.push(`${eventsCount} eventi nelle prossime 72 ore.`);
      if (budgetCount > 0)
        lines.push(`${budgetCount} budget in zona critica (>90%).`);
      if (overduePayCount > 0)
        lines.push(`${overduePayCount} pagamenti in ritardo.`);
      if (duePayCount > 0)
        lines.push(`${duePayCount} pagamenti in scadenza oggi/domani.`);

      await sb.from("notifications").insert({
        user_id: user.id,
        title: "Edizione del Mattino",
        message: lines.join(" "),
        type: "morning_edition",
        related_entity_type: "morning_edition",
        is_read: false,
      });

      processed++;
    }

    return jsonResp({ ok: true, processed, leave_alerts: leaveAlerts });
  } catch {
    return jsonResp({ error: "INTERNAL_ERROR" }, 500);
  }
});
