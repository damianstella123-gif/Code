import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { calcRowEconomics, calcRowCommission, type RawRow } from "../_shared/event-economics.ts";

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

function getUserClient(token: string) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── TOOL DEFINITIONS ──────────────────────────────────────────────────

const TOOLS = [
  {
    name: "get_events",
    description:
      "Recupera eventi dal database. Filtri opzionali per stato e per finestra temporale (entro N giorni da oggi).",
    input_schema: {
      type: "object" as const,
      properties: {
        filtro_stato: {
          type: "string",
          description:
            "Filtra per stato: pianificazione, in_corso, completato, bozza. Ometti per tutti.",
        },
        entro_giorni: {
          type: "number",
          description:
            "Se presente, restituisce solo eventi con start_date entro i prossimi N giorni da oggi.",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_tasks",
    description:
      "Recupera task/attivita. Filtra per stato aperto, per evento specifico, o per scadenza entro N giorni.",
    input_schema: {
      type: "object" as const,
      properties: {
        solo_aperti: {
          type: "boolean",
          description: "Se true, esclude task con status completato.",
        },
        evento_id: {
          type: "string",
          description: "Filtra per evento specifico (UUID).",
        },
        entro_giorni: {
          type: "number",
          description:
            "Se presente, restituisce solo task con due_date entro i prossimi N giorni da oggi.",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_clients",
    description: "Cerca clienti nel CRM per nome o restituisce tutti.",
    input_schema: {
      type: "object" as const,
      properties: {
        ricerca: {
          type: "string",
          description:
            "Testo di ricerca parziale sul nome del cliente. Ometti per tutti.",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_suppliers",
    description: "Cerca fornitori per nome o categoria.",
    input_schema: {
      type: "object" as const,
      properties: {
        ricerca: {
          type: "string",
          description: "Testo di ricerca parziale sul nome.",
        },
        categoria: {
          type: "string",
          description: "Filtra per categoria fornitore.",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_scadenze",
    description:
      "Vista unificata di tutto cio che scade nei prossimi N giorni: task, pratiche, fatture.",
    input_schema: {
      type: "object" as const,
      properties: {
        giorni: {
          type: "number",
          description: "Finestra temporale in giorni da oggi (default 7).",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_event_economics",
    description:
      "Analisi economica dettagliata di un evento (costi, ricavi, margine per fornitore/categoria) oppure riepilogo aggregato di tutti gli eventi se chiamato senza parametri. Usa per domande su budget, margini, costi, ricavi.",
    input_schema: {
      type: "object" as const,
      properties: {
        event_id: {
          type: "string",
          description: "UUID dell'evento specifico.",
        },
        nome_evento: {
          type: "string",
          description: "Nome (anche parziale) dell'evento da cercare. Se ambiguo restituisce le corrispondenze per disambiguare.",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "propose_event",
    description:
      "Genera una proposta economica per un nuovo evento basandosi sui dati storici di eventi simili. NON crea nulla nel database: produce solo un benchmark con costi/ricavi medi per categoria e fornitori suggeriti nella citta indicata. Usa quando l'utente chiede stime, preventivi, proposte per eventi futuri.",
    input_schema: {
      type: "object" as const,
      properties: {
        citta: {
          type: "string",
          description: "Citta dove si terra l'evento.",
        },
        pax: {
          type: "number",
          description: "Numero di partecipanti previsti.",
        },
        budget_target: {
          type: "number",
          description: "Budget target opzionale in euro.",
        },
        giorni: {
          type: "number",
          description: "Durata dell'evento in giorni (default 1).",
        },
        tipo: {
          type: "string",
          description: "Tipologia evento (corporate, istituzionale, convention, etc.).",
        },
      },
      required: ["citta", "pax"] as string[],
    },
  },
];

// ─── TOOL EXECUTION ────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function futureISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const today = todayISO();

  switch (name) {
    case "get_events": {
      let q = supabase
        .from("events")
        .select("id, title, start_date, end_date, location, status, budget, attendees, client")
        .order("start_date", { ascending: true })
        .limit(30);

      if (input.filtro_stato) {
        q = q.eq("status", input.filtro_stato as string);
      }
      if (input.entro_giorni) {
        const limit = futureISO(input.entro_giorni as number);
        q = q.gte("start_date", today).lte("start_date", limit);
      }

      const { data, error } = await q;
      if (error) return JSON.stringify({ error: error.message });
      if (!data || data.length === 0) return "Nessun evento trovato con questi filtri.";
      return JSON.stringify(
        data.map((e) => ({
          id: e.id,
          nome: e.title,
          data_inizio: e.start_date,
          data_fine: e.end_date,
          luogo: e.location,
          stato: e.status,
          budget: e.budget,
          partecipanti: e.attendees,
          cliente: e.client,
        }))
      );
    }

    case "get_tasks": {
      let q = supabase
        .from("tasks")
        .select("id, title, due_date, status, priority, assigned_to, event_id, fase")
        .order("due_date", { ascending: true })
        .limit(40);

      if (input.solo_aperti) {
        q = q.neq("status", "completato");
      }
      if (input.evento_id) {
        q = q.eq("event_id", input.evento_id as string);
      }
      if (input.entro_giorni) {
        const limit = futureISO(input.entro_giorni as number);
        q = q.lte("due_date", limit).gte("due_date", today);
      }

      const { data, error } = await q;
      if (error) return JSON.stringify({ error: error.message });
      if (!data || data.length === 0) return "Nessun task trovato con questi filtri.";
      return JSON.stringify(
        data.map((t) => ({
          id: t.id,
          titolo: t.title,
          scadenza: t.due_date,
          stato: t.status,
          priorita: t.priority,
          assegnatario: t.assigned_to,
          evento_id: t.event_id,
          fase: t.fase,
        }))
      );
    }

    case "get_clients": {
      let q = supabase
        .from("clients")
        .select("id, name, company, email, phone, status, city, source, revenue, deal_stage, referente")
        .order("name")
        .limit(30);

      if (input.ricerca) {
        q = q.ilike("name", `%${input.ricerca}%`);
      }

      const { data, error } = await q;
      if (error) return JSON.stringify({ error: error.message });
      if (!data || data.length === 0) return "Nessun cliente trovato.";
      return JSON.stringify(
        data.map((c) => ({
          id: c.id,
          nome: c.name,
          azienda: c.company,
          email: c.email,
          telefono: c.phone,
          stato: c.status,
          citta: c.city,
          fonte: c.source,
          fatturato: c.revenue,
          fase_deal: c.deal_stage,
          referente: c.referente,
        }))
      );
    }

    case "get_suppliers": {
      let q = supabase
        .from("suppliers")
        .select("id, name, category, city, rating, status, contract_status, contract_expiry, email, phone")
        .order("name")
        .limit(30);

      if (input.ricerca) {
        q = q.ilike("name", `%${input.ricerca}%`);
      }
      if (input.categoria) {
        q = q.ilike("category", `%${input.categoria}%`);
      }

      const { data, error } = await q;
      if (error) return JSON.stringify({ error: error.message });
      if (!data || data.length === 0) return "Nessun fornitore trovato.";
      return JSON.stringify(
        data.map((s) => ({
          id: s.id,
          nome: s.name,
          categoria: s.category,
          citta: s.city,
          rating: s.rating,
          stato: s.status,
          contratto: s.contract_status,
          scadenza_contratto: s.contract_expiry,
        }))
      );
    }

    case "get_scadenze": {
      const days = (input.giorni as number) || 7;
      const limit = futureISO(days);

      const [tasksRes, practicesRes, fattureRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, due_date, status, priority, assigned_to")
          .neq("status", "completato")
          .lte("due_date", limit)
          .order("due_date", { ascending: true })
          .limit(20),
        supabase
          .from("practices")
          .select("id, title, due_date, status, priority, responsible")
          .neq("status", "completata")
          .lte("due_date", limit)
          .order("due_date", { ascending: true })
          .limit(20),
        supabase
          .from("admin_fatture")
          .select("id, numero, soggetto, importo, scadenza, stato")
          .neq("stato", "pagata")
          .lte("scadenza", limit)
          .order("scadenza", { ascending: true })
          .limit(20),
      ]);

      const results: unknown[] = [];

      if (tasksRes.data?.length) {
        results.push(
          ...tasksRes.data.map((t) => ({
            tipo: "task",
            titolo: t.title,
            scadenza: t.due_date,
            stato: t.status,
            priorita: t.priority,
            assegnatario: t.assigned_to,
            scaduto: t.due_date < today,
          }))
        );
      }

      if (practicesRes.data?.length) {
        results.push(
          ...practicesRes.data.map((p) => ({
            tipo: "pratica",
            titolo: p.title,
            scadenza: p.due_date,
            stato: p.status,
            priorita: p.priority,
            responsabile: p.responsible,
            scaduto: p.due_date < today,
          }))
        );
      }

      if (fattureRes.data?.length) {
        results.push(
          ...fattureRes.data.map((f) => ({
            tipo: "fattura",
            numero: f.numero,
            soggetto: f.soggetto,
            importo: f.importo,
            scadenza: f.scadenza,
            stato: f.stato,
            scaduta: f.scadenza < today,
          }))
        );
      }

      if (results.length === 0)
        return `Nessuna scadenza nei prossimi ${days} giorni.`;

      results.sort((a: any, b: any) => (a.scadenza ?? "").localeCompare(b.scadenza ?? ""));
      return JSON.stringify(results);
    }

    case "get_event_economics": {
      const eventId = input.event_id as string | undefined;
      const nomeEvento = input.nome_evento as string | undefined;

      // Helper to compute economics for a single event
      async function computeForEvent(eid: string, supabaseClient: ReturnType<typeof createClient>) {
        const { data: ev } = await supabaseClient
          .from("events")
          .select("id, title, start_date, end_date, fee_agenzia_pct, status, client")
          .eq("id", eid)
          .maybeSingle();

        if (!ev) return null;

        const feePct = (ev.fee_agenzia_pct as number) || 6;

        const [svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes, suppliersRes] = await Promise.all([
          supabaseClient.from("event_supplier_services").select("*").eq("event_id", eid),
          supabaseClient.from("event_hotel_details").select("*").eq("event_id", eid),
          supabaseClient.from("event_restaurant_details").select("*").eq("event_id", eid),
          supabaseClient.from("event_experience_details").select("*").eq("event_id", eid),
          supabaseClient.from("event_catering_details").select("*").eq("event_id", eid),
          supabaseClient.from("event_staff_interno_details").select("*").eq("event_id", eid),
          supabaseClient.from("event_staff_esterno_details").select("*").eq("event_id", eid),
          supabaseClient.from("event_varie_details").select("*").eq("event_id", eid),
          supabaseClient.from("event_audio_video_details").select("*").eq("event_id", eid),
          supabaseClient.from("event_allestimenti_details").select("*").eq("event_id", eid),
          supabaseClient.from("event_grafica_stampa_details").select("*").eq("event_id", eid),
          supabaseClient.from("event_suppliers").select("supplier_id, service_category").eq("event_id", eid),
        ]);

        // Get supplier names
        const supplierIds = [...new Set((suppliersRes.data ?? []).map((s: any) => s.supplier_id).filter(Boolean))];
        let suppMap: Record<string, string> = {};
        if (supplierIds.length > 0) {
          const { data: supps } = await supabaseClient
            .from("suppliers")
            .select("id, name")
            .in("id", supplierIds);
          for (const s of (supps ?? [])) {
            suppMap[s.id] = s.name;
          }
        }

        const catTables: { category: string; rows: RawRow[] }[] = [
          { category: "transfer", rows: (svcRes.data ?? []) as RawRow[] },
          { category: "hotel", rows: (hotelRes.data ?? []) as RawRow[] },
          { category: "ristorante", rows: (restRes.data ?? []) as RawRow[] },
          { category: "experience", rows: (expRes.data ?? []) as RawRow[] },
          { category: "catering", rows: (catRes.data ?? []) as RawRow[] },
          { category: "staff_interno", rows: (staffIntRes.data ?? []) as RawRow[] },
          { category: "staff_esterno", rows: (staffExtRes.data ?? []) as RawRow[] },
          { category: "varie", rows: (varieRes.data ?? []) as RawRow[] },
          { category: "audio_video", rows: (avRes.data ?? []) as RawRow[] },
          { category: "allestimenti", rows: (allestRes.data ?? []) as RawRow[] },
          { category: "grafica_stampa", rows: (graficaRes.data ?? []) as RawRow[] },
        ];

        let totVenduto = 0, totCosto = 0, totCommissioni = 0;
        const righe: { fornitore: string; categoria: string; costo: number; venduto: number; margine: number; margine_pct: number }[] = [];

        for (const { category, rows } of catTables) {
          for (const row of rows) {
            const econ = calcRowEconomics(row, category);
            if (!econ.venduto && !econ.costo) continue;
            const comm = calcRowCommission(row, econ.costo);
            const suppId = (row.supplier_id as string) || (row.profile_id as string) || "";
            const margine = econ.venduto - econ.costo;
            const marginePct = econ.venduto > 0 ? (margine / econ.venduto) * 100 : 0;
            righe.push({
              fornitore: suppMap[suppId] || suppId || "(interno)",
              categoria: category,
              costo: Math.round(econ.costo * 100) / 100,
              venduto: Math.round(econ.venduto * 100) / 100,
              margine: Math.round(margine * 100) / 100,
              margine_pct: Math.round(marginePct * 10) / 10,
            });
            totVenduto += econ.venduto;
            totCosto += econ.costo;
            totCommissioni += comm;
          }
        }

        const fee = totVenduto * feePct / 100;
        const ricavi = totVenduto + fee + totCommissioni;
        const margine = ricavi - totCosto;
        const marginePct = ricavi > 0 ? (margine / ricavi) * 100 : 0;

        return {
          evento: { id: ev.id, nome: ev.title, data_inizio: ev.start_date, data_fine: ev.end_date, fee_pct: feePct, stato: ev.status, cliente: ev.client },
          righe,
          totali: {
            costo: Math.round(totCosto * 100) / 100,
            venduto: Math.round(totVenduto * 100) / 100,
            fee: Math.round(fee * 100) / 100,
            commissioni: Math.round(totCommissioni * 100) / 100,
            ricavi: Math.round(ricavi * 100) / 100,
            margine: Math.round(margine * 100) / 100,
            margine_pct: Math.round(marginePct * 10) / 10,
          },
        };
      }

      // Single event by ID
      if (eventId) {
        const result = await computeForEvent(eventId, supabase);
        if (!result) return "Evento non trovato con questo ID.";
        return JSON.stringify(result);
      }

      // Search by name
      if (nomeEvento) {
        const { data: matches } = await supabase
          .from("events")
          .select("id, title, start_date, status")
          .ilike("title", `%${nomeEvento}%`)
          .limit(5);

        if (!matches || matches.length === 0) return `Nessun evento trovato con nome "${nomeEvento}".`;
        if (matches.length > 1) {
          return JSON.stringify({
            disambiguazione: true,
            messaggio: `Ho trovato ${matches.length} eventi corrispondenti. Specifica quale:`,
            eventi: matches.map(m => ({ id: m.id, nome: m.title, data: m.start_date, stato: m.status })),
          });
        }

        const result = await computeForEvent(matches[0].id, supabase);
        if (!result) return "Errore nel calcolo economico.";
        return JSON.stringify(result);
      }

      // Aggregated view for all events
      const { data: allEvents } = await supabase
        .from("events")
        .select("id, title, start_date, fee_agenzia_pct, status")
        .order("start_date", { ascending: false })
        .limit(50);

      if (!allEvents || allEvents.length === 0) return "Nessun evento trovato.";

      const feePctByEvent: Record<string, number> = {};
      for (const ev of allEvents) {
        feePctByEvent[ev.id] = (ev.fee_agenzia_pct as number) || 6;
      }

      // Fetch all detail tables at once (same logic as src/lib/event-economics.ts)
      const [svcR, hotelR, restR, expR, catR, siR, seR, varR, avR, allR, grR] = await Promise.all([
        supabase.from("event_supplier_services").select("event_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo"),
        supabase.from("event_hotel_details").select("event_id, tipo, payment_mode, rooms_client_count, room_rate_client, rooms_simmetria_count, room_cost_simmetria, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, check_in_date, data, ora_inizio, commissione_pct, commissione_importo"),
        supabase.from("event_restaurant_details").select("event_id, budget_totale, budget_per_persona, pax_confermati, pax_previsti, costo_totale_reale, costo_per_persona, data, ora_inizio, commissione_pct, commissione_importo"),
        supabase.from("event_experience_details").select("event_id, venduto_totale, venduto_per_persona, costo_totale, costo_per_persona, pax, data, ora_inizio, ora, commissione_pct, commissione_importo"),
        supabase.from("event_catering_details").select("event_id, venduto_totale, venduto_per_persona, costo_totale, costo_per_persona, pax, data, ora_inizio, ora, commissione_pct, commissione_importo"),
        supabase.from("event_staff_interno_details").select("event_id, venduto_totale, costo_totale, costo_giornaliero, data, ora_inizio, commissione_pct, commissione_importo"),
        supabase.from("event_staff_esterno_details").select("event_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo"),
        supabase.from("event_varie_details").select("event_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo"),
        supabase.from("event_audio_video_details").select("event_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo"),
        supabase.from("event_allestimenti_details").select("event_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo"),
        supabase.from("event_grafica_stampa_details").select("event_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo"),
      ]);

      const catToRows: { category: string; rows: RawRow[] }[] = [
        { category: "transfer", rows: (svcR.data ?? []) as RawRow[] },
        { category: "hotel", rows: (hotelR.data ?? []) as RawRow[] },
        { category: "ristorante", rows: (restR.data ?? []) as RawRow[] },
        { category: "experience", rows: (expR.data ?? []) as RawRow[] },
        { category: "catering", rows: (catR.data ?? []) as RawRow[] },
        { category: "staff_interno", rows: (siR.data ?? []) as RawRow[] },
        { category: "staff_esterno", rows: (seR.data ?? []) as RawRow[] },
        { category: "varie", rows: (varR.data ?? []) as RawRow[] },
        { category: "audio_video", rows: (avR.data ?? []) as RawRow[] },
        { category: "allestimenti", rows: (allR.data ?? []) as RawRow[] },
        { category: "grafica_stampa", rows: (grR.data ?? []) as RawRow[] },
      ];

      const byEvent: Record<string, { venduto: number; costo: number; commissioni: number }> = {};
      for (const { category, rows } of catToRows) {
        for (const row of rows) {
          const eid = row.event_id as string;
          if (!eid) continue;
          const econ = calcRowEconomics(row, category);
          if (!econ.venduto && !econ.costo) continue;
          if (!byEvent[eid]) byEvent[eid] = { venduto: 0, costo: 0, commissioni: 0 };
          byEvent[eid].venduto += econ.venduto;
          byEvent[eid].costo += econ.costo;
          byEvent[eid].commissioni += calcRowCommission(row, econ.costo);
        }
      }

      const nameMap: Record<string, { title: string; date: string; status: string }> = {};
      for (const ev of allEvents) {
        nameMap[ev.id] = { title: ev.title, date: ev.start_date, status: ev.status };
      }

      const summaries = Object.entries(byEvent)
        .filter(([eid]) => nameMap[eid])
        .map(([eid, d]) => {
          const feePct = feePctByEvent[eid] ?? 6;
          const fee = d.venduto * feePct / 100;
          const ricavi = d.venduto + fee + d.commissioni;
          const margine = ricavi - d.costo;
          const marginePct = ricavi > 0 ? (margine / ricavi) * 100 : 0;
          return {
            id: eid,
            nome: nameMap[eid].title,
            data: nameMap[eid].date,
            stato: nameMap[eid].status,
            costo: Math.round(d.costo),
            ricavi: Math.round(ricavi),
            margine: Math.round(margine),
            margine_pct: Math.round(marginePct * 10) / 10,
          };
        })
        .sort((a, b) => b.margine - a.margine);

      if (summaries.length === 0) return "Nessun dato economico trovato per gli eventi.";
      return JSON.stringify(summaries);
    }

    case "propose_event": {
      const citta = (input.citta as string) || "";
      const pax = (input.pax as number) || 50;
      const budgetTarget = input.budget_target as number | undefined;
      const giorni = (input.giorni as number) || 1;
      const tipo = input.tipo as string | undefined;

      // 1. Find similar events (0.5x - 2x pax)
      const paxMin = Math.floor(pax * 0.5);
      const paxMax = Math.ceil(pax * 2);

      let evQ = supabase
        .from("events")
        .select("id, title, attendees, status, start_date, fee_agenzia_pct")
        .gte("attendees", paxMin)
        .lte("attendees", paxMax)
        .order("start_date", { ascending: false })
        .limit(20);

      const { data: similarEvents } = await evQ;
      if (!similarEvents || similarEvents.length === 0) {
        return JSON.stringify({ base_dati: 0, messaggio: "Nessun evento simile trovato per costruire il benchmark." });
      }

      // 2. For each similar event, compute economics per category
      const CATEGORIES = ["hotel", "ristorante", "catering", "audio_video", "allestimenti", "staff_interno", "staff_esterno", "transfer", "varie", "grafica_stampa", "experience"] as const;
      const CAT_TABLES: Record<string, string> = {
        hotel: "event_hotel_details",
        ristorante: "event_restaurant_details",
        catering: "event_catering_details",
        audio_video: "event_audio_video_details",
        allestimenti: "event_allestimenti_details",
        staff_interno: "event_staff_interno_details",
        staff_esterno: "event_staff_esterno_details",
        transfer: "event_supplier_services",
        varie: "event_varie_details",
        grafica_stampa: "event_grafica_stampa_details",
        experience: "event_experience_details",
      };

      const eventIds = similarEvents.map(e => e.id);
      const statusMap: Record<string, string> = {};
      const paxMap: Record<string, number> = {};
      for (const ev of similarEvents) {
        statusMap[ev.id] = ev.status;
        paxMap[ev.id] = ev.attendees || pax;
      }

      // Fetch all category data in parallel
      const catFetches = await Promise.all(
        CATEGORIES.map(cat =>
          supabase.from(CAT_TABLES[cat]).select("event_id, venduto_totale, venduto_unitario, venduto_per_persona, costo_totale, costo_unitario, costo_per_persona, costo_totale_reale, quantita, pax, pax_confermati, pax_previsti, budget_totale, budget_per_persona, rooms_client_count, room_rate_client, rooms_simmetria_count, room_cost_simmetria, tipo, payment_mode, costo_giornaliero, commissione_pct, commissione_importo").in("event_id", eventIds)
        )
      );

      // 3. Build benchmark per category
      interface CatBenchmark {
        costo_per_persona: number;
        venduto_per_persona: number;
        margine_pct: number;
        eventi_contribuenti: number;
      }
      const benchmark: Record<string, CatBenchmark> = {};

      for (let ci = 0; ci < CATEGORIES.length; ci++) {
        const cat = CATEGORIES[ci];
        const rows = (catFetches[ci].data ?? []) as RawRow[];
        if (rows.length === 0) continue;

        // Group by event
        const byEvent: Record<string, { venduto: number; costo: number }> = {};
        for (const row of rows) {
          const eid = row.event_id as string;
          if (!eid || !eventIds.includes(eid)) continue;
          const econ = calcRowEconomics(row, cat);
          if (!econ.venduto && !econ.costo) continue;
          if (!byEvent[eid]) byEvent[eid] = { venduto: 0, costo: 0 };
          byEvent[eid].venduto += econ.venduto;
          byEvent[eid].costo += econ.costo;
        }

        const eventEntries = Object.entries(byEvent);
        if (eventEntries.length === 0) continue;

        // Weighted average: completato events count double
        let totalWeight = 0;
        let weightedCostoPP = 0;
        let weightedVendutoPP = 0;

        for (const [eid, totals] of eventEntries) {
          const evPax = paxMap[eid] || pax;
          const weight = statusMap[eid] === "completato" ? 2 : 1;
          weightedCostoPP += (totals.costo / evPax) * weight;
          weightedVendutoPP += (totals.venduto / evPax) * weight;
          totalWeight += weight;
        }

        const avgCostoPP = weightedCostoPP / totalWeight;
        const avgVendutoPP = weightedVendutoPP / totalWeight;
        const marginePct = avgVendutoPP > 0 ? ((avgVendutoPP - avgCostoPP) / avgVendutoPP) * 100 : 0;

        benchmark[cat] = {
          costo_per_persona: Math.round(avgCostoPP * 100) / 100,
          venduto_per_persona: Math.round(avgVendutoPP * 100) / 100,
          margine_pct: Math.round(marginePct * 10) / 10,
          eventi_contribuenti: eventEntries.length,
        };
      }

      // 4. Suggested suppliers by city
      const supplierCategories = Object.keys(benchmark);
      // Always include hotel/ristorante/catering if not already there
      for (const must of ["hotel", "ristorante", "catering"]) {
        if (!supplierCategories.includes(must)) supplierCategories.push(must);
      }

      interface SuggestedSupplier {
        id: string;
        nome: string;
        categoria: string;
        citta: string;
        rating: number;
        nota_geo?: string;
      }
      const fornitori_suggeriti: SuggestedSupplier[] = [];

      for (const cat of supplierCategories) {
        // Map internal category names to supplier category values
        const catSearch = cat.replace(/_/g, " ");

        // Try city first
        let { data: citySupp } = await supabase
          .from("suppliers")
          .select("id, name, category, city, rating, province, region")
          .or(`city.ilike.%${citta}%,province.ilike.%${citta}%`)
          .ilike("category", `%${catSearch}%`)
          .order("rating", { ascending: false })
          .limit(3);

        if (citySupp && citySupp.length > 0) {
          for (const s of citySupp) {
            fornitori_suggeriti.push({
              id: s.id,
              nome: s.name,
              categoria: s.category,
              citta: s.city || s.province || "",
              rating: s.rating || 0,
            });
          }
        } else {
          // Widen to region
          const { data: regionSupp } = await supabase
            .from("suppliers")
            .select("id, name, category, city, rating, region")
            .ilike("category", `%${catSearch}%`)
            .not("city", "is", null)
            .order("rating", { ascending: false })
            .limit(3);

          if (regionSupp && regionSupp.length > 0) {
            for (const s of regionSupp) {
              fornitori_suggeriti.push({
                id: s.id,
                nome: s.name,
                categoria: s.category,
                citta: s.city || "",
                rating: s.rating || 0,
                nota_geo: `Non trovato a ${citta}, suggerito dalla stessa regione`,
              });
            }
          }
        }
      }

      // 5. Build projected budget for the requested pax
      const proiezione_budget: Record<string, { costo_stimato: number; venduto_stimato: number }> = {};
      let totCostoStimato = 0;
      let totVendutoStimato = 0;

      for (const [cat, bm] of Object.entries(benchmark)) {
        const costoStimato = Math.round(bm.costo_per_persona * pax * giorni);
        const vendutoStimato = Math.round(bm.venduto_per_persona * pax * giorni);
        proiezione_budget[cat] = { costo_stimato: costoStimato, venduto_stimato: vendutoStimato };
        totCostoStimato += costoStimato;
        totVendutoStimato += vendutoStimato;
      }

      const margineStimato = totVendutoStimato - totCostoStimato;
      const marginePctStimato = totVendutoStimato > 0 ? (margineStimato / totVendutoStimato) * 100 : 0;

      const result = {
        base_dati: similarEvents.length,
        parametri: { citta, pax, giorni, tipo: tipo || null, budget_target: budgetTarget || null },
        benchmark_per_categoria: benchmark,
        proiezione: {
          per_categoria: proiezione_budget,
          totale_costo_stimato: totCostoStimato,
          totale_venduto_stimato: totVendutoStimato,
          margine_stimato: margineStimato,
          margine_pct_stimato: Math.round(marginePctStimato * 10) / 10,
          ...(budgetTarget ? { budget_target: budgetTarget, delta_vs_target: budgetTarget - totCostoStimato } : {}),
        },
        fornitori_suggeriti,
      };

      return JSON.stringify(result);
    }

    default:
      return `Tool sconosciuto: ${name}`;
  }
}

// ─── ANTHROPIC API CALL WITH TOOL LOOP ─────────────────────────────────

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 8;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: unknown;
}

async function callAnthropic(
  messages: AnthropicMessage[],
  systemPrompt: string,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurata");

  let currentMessages = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body = {
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages: currentMessages,
    };

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${errText}`);
    }

    const result = await res.json();

    if (result.stop_reason === "end_turn" || result.stop_reason === "max_tokens") {
      const textBlocks = (result.content || []).filter(
        (b: any) => b.type === "text"
      );
      return textBlocks.map((b: any) => b.text).join("\n") || "(nessuna risposta)";
    }

    if (result.stop_reason === "tool_use") {
      const toolUseBlocks = (result.content || []).filter(
        (b: any) => b.type === "tool_use"
      );

      currentMessages.push({ role: "assistant", content: result.content });

      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const toolResult = await executeTool(
          toolBlock.name,
          toolBlock.input || {},
          supabase
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: toolResult,
        });
      }

      currentMessages.push({ role: "user", content: toolResults });
      continue;
    }

    const textBlocks = (result.content || []).filter(
      (b: any) => b.type === "text"
    );
    return textBlocks.map((b: any) => b.text).join("\n") || "(nessuna risposta)";
  }

  return "Ho raggiunto il limite di consultazioni. Prova a riformulare la domanda in modo piu specifico.";
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return json({ error: "Token mancante" }, 401);
    }

    const adminUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(adminUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return json({ error: "Non autenticato" }, 401);
    }

    const userClient = getUserClient(token);

    const { message, history } = await req.json();
    if (!message || typeof message !== "string") {
      return json({ error: "Campo 'message' obbligatorio" }, 400);
    }

    const today = new Date().toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const systemPrompt = `Sei Fly, il Chief of Staff digitale di Simmetria Synergy, azienda che organizza eventi corporate e istituzionali. Rispondi in italiano, in modo sintetico, preciso e orientato ai risultati: prima la risposta in una frase, poi solo i dettagli utili. Usa i tool per basarti SOLO su dati reali: se un dato non c'e, dillo chiaramente, non inventare mai numeri, nomi o date.

REGOLE DI STILE: rispondi come un collega sintetico. Quando elenchi entita (eventi, fornitori, task, clienti): massimo 5 voci con solo le informazioni rilevanti alla domanda, chiudi con il conteggio dei restanti ("...e altri N"). Mai riversare tutti i campi di un record. Niente markdown pesante: no tabelle, no titoli; al massimo elenchi brevi con trattini.

Per domande su costi, ricavi, margini o budget degli eventi usa get_event_economics. Riporta i numeri esatti che ricevi, indicando che sono valori previsionali dai servizi censiti; non stimare mai importi non presenti nei dati.

Quando noti una criticita nei dati che hai appena letto (scadenze superate, eventi imminenti con poca preparazione), segnalala in una riga finale. Non prendere decisioni: proponi.

PRINCIPI COMPORTAMENTALI:
- Chiarezza prima dell'eleganza: usa il linguaggio piu semplice che trasmette il significato corretto.
- Dichiara sempre l'incertezza: distingui tra cio che risulta dai dati, cio che deduci e cio che ipotizzi. Preferisci "con le informazioni disponibili..." a certezze non giustificate.
- Evita "sempre", "mai", "certamente", "ovviamente".
- Tono calmo e costruttivo anche su criticita: orientamento, mai allarmismo.
- Parla come un collega esperto: competente, pragmatico, mai paternalistico. Ogni suggerimento deve poter spiegare il proprio perche in una riga.
- Se il valore di un'informazione non supera il costo dell'interruzione, ometti l'informazione.

ENTITIES_JSON: quando la tua risposta cita entita specifiche (eventi, fornitori, task, clienti), DEVI chiudere la risposta con una riga separata nel formato esatto:
ENTITIES_JSON: [{"type":"event","id":"uuid","nome":"...","data":"...","stato":"..."},...]
I type ammessi sono: event, supplier, task, client. Includi solo entita effettivamente citate nella risposta, max 5. Se non citi entita specifiche, NON aggiungere la riga ENTITIES_JSON.

Oggi e ${today}.`;

    const messages: AnthropicMessage[] = [];

    if (Array.isArray(history)) {
      for (const h of history) {
        if (h.role === "user" || h.role === "assistant") {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }

    messages.push({ role: "user", content: message });

    const reply = await callAnthropic(messages, systemPrompt, userClient);

    // Parse ENTITIES_JSON from the reply
    let textReply = reply;
    let entities: unknown[] = [];
    const entitiesMatch = reply.match(/\nENTITIES_JSON:\s*(\[[\s\S]*?\])\s*$/);
    if (entitiesMatch) {
      textReply = reply.slice(0, entitiesMatch.index).trimEnd();
      try {
        entities = JSON.parse(entitiesMatch[1]);
      } catch {
        // If parsing fails, just return text without entities
      }
    }

    return json({ reply: textReply, entities });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("fly-gateway error:", err);
    return json({ error: msg }, 500);
  }
});
