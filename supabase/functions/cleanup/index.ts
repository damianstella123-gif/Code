import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results: { tabella: string; righe_eliminate: number }[] = [];

  try {
    // 1. Fly logs: keep 90 days
    const flyLogsCutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: flyDel } = await supabase
      .from("fly_logs")
      .delete()
      .lt("created_at", flyLogsCutoff)
      .select("id");
    results.push({ tabella: "fly_logs", righe_eliminate: flyDel?.length ?? 0 });

    // 2. Fly cache: expired entries (> 2 hours)
    const cacheCutoff = new Date(Date.now() - 2 * 3600000).toISOString();
    const { data: cacheDel } = await supabase
      .from("fly_cache")
      .delete()
      .lt("created_at", cacheCutoff)
      .select("id");
    results.push({ tabella: "fly_cache", righe_eliminate: cacheDel?.length ?? 0 });

    // 3. Rate limits older than 7 days
    const rateCutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const { data: rateDel } = await supabase
      .from("fly_rate_limits")
      .delete()
      .lt("day_date", rateCutoff)
      .select("id");
    results.push({ tabella: "fly_rate_limits", righe_eliminate: rateDel?.length ?? 0 });

    // 4. Read notifications older than 30 days
    const notifCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: notifDel } = await supabase
      .from("notifications")
      .delete()
      .eq("is_read", true)
      .lt("created_at", notifCutoff)
      .select("id");
    results.push({ tabella: "notifications", righe_eliminate: notifDel?.length ?? 0 });

    // 5. Impact log: aggregate old entries (> 6 months) into monthly reports
    const impactCutoff = new Date(Date.now() - 180 * 86400000).toISOString();
    const { data: oldImpact } = await supabase
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
        await supabase
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
        await supabase.from("impact_actions_log").delete().in("id", batch);
      }
      results.push({ tabella: "impact_actions_log", righe_eliminate: oldImpact.length });
    } else {
      results.push({ tabella: "impact_actions_log", righe_eliminate: 0 });
    }

    // 6. Resolved sentinel alerts older than 30 days
    const sentinelCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: sentDel } = await supabase
      .from("sentinel_alerts")
      .delete()
      .eq("status", "resolved")
      .lt("resolved_at", sentinelCutoff)
      .select("id");
    results.push({ tabella: "sentinel_alerts", righe_eliminate: sentDel?.length ?? 0 });

    // 7. Audit log: keep 1 year
    const auditCutoff = new Date(Date.now() - 365 * 86400000).toISOString();
    const { data: auditDel } = await supabase
      .from("audit_log")
      .delete()
      .lt("created_at", auditCutoff)
      .select("id");
    results.push({ tabella: "audit_log", righe_eliminate: auditDel?.length ?? 0 });

    // 8. Error log: keep 60 days
    const errorCutoff = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data: errorDel } = await supabase
      .from("error_log")
      .delete()
      .lt("created_at", errorCutoff)
      .select("id");
    results.push({ tabella: "error_log", righe_eliminate: errorDel?.length ?? 0 });

    // Log completion
    const totalDeleted = results.reduce((sum, r) => sum + r.righe_eliminate, 0);
    await supabase.from("error_log").insert({
      pagina: "cleanup",
      azione: "scheduled",
      messaggio: "Cleanup domenicale completato",
      dettaglio: JSON.stringify({ tabelle: results, totale_righe_eliminate: totalDeleted }),
    });

    return new Response(
      JSON.stringify({ success: true, results, totale_righe_eliminate: totalDeleted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    console.error("Cleanup error:", err);

    await supabase.from("error_log").insert({
      pagina: "cleanup",
      azione: "scheduled",
      messaggio: `Cleanup fallito: ${msg}`,
      dettaglio: JSON.stringify({ partial_results: results }),
    });

    return new Response(
      JSON.stringify({ error: msg, partial_results: results }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
