import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const sb = getServiceClient();
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get all active users
    const { data: users } = await sb
      .from("profiles")
      .select("id, first_name, last_name, settings, is_active")
      .eq("is_active", true);

    if (!users || users.length === 0) {
      return json({ ok: true, message: "No active users", processed: 0 });
    }

    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const in72h = new Date(Date.now() + 72 * 3600000).toISOString();

    let processed = 0;

    for (const user of users) {
      // Check morningEdition setting (default: true)
      const settings = (user.settings || {}) as Record<string, unknown>;
      if (settings.morningEdition === false) continue;

      // a) Overdue tasks assigned to this user
      const { data: overdueTasks } = await sb
        .from("tasks")
        .select("id, titolo, scadenza, priorita, stato")
        .eq("assegnatario", user.id)
        .neq("stato", "completato")
        .lt("scadenza", today);

      // b) Tasks due today/tomorrow
      const { data: upcomingTasks } = await sb
        .from("tasks")
        .select("id, titolo, scadenza, priorita, stato")
        .eq("assegnatario", user.id)
        .neq("stato", "completato")
        .in("scadenza", [today, tomorrow]);

      // c) Events in next 72h
      const { data: upcomingEvents } = await sb
        .from("events")
        .select("id, nome, data_inizio, location, stato")
        .gte("data_inizio", new Date().toISOString())
        .lte("data_inizio", in72h)
        .neq("stato", "completato");

      // d) Budget warnings — events where cost > 90% of budget
      const { data: budgetEvents } = await sb
        .from("events")
        .select("id, nome, budget")
        .neq("stato", "completato")
        .gt("budget", 0);

      const budgetWarnings: { nome: string; budget: number; spent: number }[] = [];
      if (budgetEvents) {
        for (const ev of budgetEvents.slice(0, 10)) {
          const { data: budgetRows } = await sb
            .from("budgets")
            .select("costo_unitario, quantita")
            .eq("evento", ev.id);
          if (budgetRows) {
            const spent = budgetRows.reduce(
              (s: number, r: { costo_unitario: number | null; quantita: number | null }) =>
                s + (r.costo_unitario || 0) * (r.quantita || 1),
              0
            );
            if (spent > ev.budget * 0.9) {
              budgetWarnings.push({ nome: ev.nome, budget: ev.budget, spent });
            }
          }
        }
      }

      // e) Payments due today/tomorrow or overdue
      const { data: paymentsDue } = await sb
        .from("event_payments")
        .select("id, event_id, tipo, descrizione, importo, data_scadenza")
        .is("data_pagamento", null)
        .lte("data_scadenza", tomorrow);

      const paymentAlerts: { descrizione: string; importo: number; scadenza: string; in_ritardo: boolean }[] = [];
      if (paymentsDue) {
        for (const p of paymentsDue) {
          paymentAlerts.push({
            descrizione: p.descrizione,
            importo: p.importo,
            scadenza: p.data_scadenza,
            in_ritardo: p.data_scadenza < today,
          });
        }
      }

      // Build data payload for Fly
      const datiUtente = {
        task_scaduti: (overdueTasks || []).map((t) => ({
          titolo: t.titolo,
          scadenza: t.scadenza,
          priorita: t.priorita,
        })),
        task_oggi_domani: (upcomingTasks || []).map((t) => ({
          titolo: t.titolo,
          scadenza: t.scadenza,
          priorita: t.priorita,
        })),
        eventi_72h: (upcomingEvents || []).map((e) => ({
          nome: e.nome,
          data: e.data_inizio,
          location: e.location,
        })),
        budget_warning: budgetWarnings,
        pagamenti_scadenza: paymentAlerts,
      };

      // Skip if there's nothing to report
      const hasContent =
        datiUtente.task_scaduti.length > 0 ||
        datiUtente.task_oggi_domani.length > 0 ||
        datiUtente.eventi_72h.length > 0 ||
        datiUtente.budget_warning.length > 0 ||
        datiUtente.pagamenti_scadenza.length > 0;

      if (!hasContent) continue;

      // Call fly-gateway to generate the brief
      const flyPayload = {
        message: `Genera l'Edizione del mattino per ${user.first_name || "l'utente"}: sintesi operativa in max 5 punti, tono da Chief of Staff, priorità urgenti prima, italiano. Dati: ${JSON.stringify(datiUtente)}`,
        history: [],
      };

      let briefText = "";
      try {
        const flyRes = await fetch(`${url}/functions/v1/fly-gateway`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(flyPayload),
        });

        if (flyRes.ok) {
          const flyData = await flyRes.json();
          briefText = flyData.reply || flyData.message || "";
        }
      } catch (flyErr) {
        console.error(`Fly call failed for user ${user.id}:`, flyErr);
      }

      // Fallback: if Fly didn't respond, generate a simple summary
      if (!briefText) {
        const lines: string[] = [];
        if (datiUtente.task_scaduti.length > 0)
          lines.push(`${datiUtente.task_scaduti.length} task in ritardo richiedono attenzione immediata.`);
        if (datiUtente.task_oggi_domani.length > 0)
          lines.push(`${datiUtente.task_oggi_domani.length} task in scadenza oggi/domani.`);
        if (datiUtente.eventi_72h.length > 0)
          lines.push(`${datiUtente.eventi_72h.length} eventi nelle prossime 72 ore.`);
        if (datiUtente.budget_warning.length > 0)
          lines.push(`${datiUtente.budget_warning.length} budget in zona critica (>90%).`);
        const overdue = datiUtente.pagamenti_scadenza.filter(p => p.in_ritardo);
        const due = datiUtente.pagamenti_scadenza.filter(p => !p.in_ritardo);
        if (overdue.length > 0)
          lines.push(`${overdue.length} pagamenti in ritardo.`);
        if (due.length > 0)
          lines.push(`${due.length} pagamenti in scadenza oggi/domani.`);
        briefText = lines.join(" ");
      }

      // Insert notification
      await sb.from("notifications").insert({
        user_id: user.id,
        title: "Edizione del Mattino",
        message: briefText,
        type: "morning_edition",
        related_entity_type: "morning_edition",
        is_read: false,
      });

      processed++;
    }

    return json({ ok: true, processed });
  } catch (err) {
    console.error("Morning edition error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
