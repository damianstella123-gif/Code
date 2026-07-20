import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { calcRowEconomics, calcRowCommission, calcRowNetto, type RawRow } from "../_shared/event-economics.ts";

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
      "Vista unificata di tutto cio che scade nei prossimi N giorni: task, dossier, fatture.",
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
  {
    name: "get_team_members",
    description:
      "Restituisce l'elenco dei membri del team attivi (profili) con id, nome e reparto. Usa per risolvere nomi parziali ('Giulia') in profile id.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "propose_create_task",
    description:
      "PROPONE la creazione di un task. NON scrive nulla nel database. Restituisce un oggetto strutturato che l'utente dovra confermare prima dell'esecuzione. Usa quando l'utente chiede di creare un task/attivita.",
    input_schema: {
      type: "object" as const,
      properties: {
        titolo: { type: "string", description: "Titolo del task." },
        assegnatario_nome: { type: "string", description: "Nome della persona a cui assegnare (verra risolto in profile id)." },
        scadenza: { type: "string", description: "Data di scadenza (formato YYYY-MM-DD)." },
        evento_nome: { type: "string", description: "Nome dell'evento collegato (verra risolto in event id)." },
        priorita: { type: "string", description: "alta, media, bassa." },
        descrizione: { type: "string", description: "Descrizione opzionale." },
      },
      required: ["titolo"] as string[],
    },
  },
  {
    name: "propose_create_memo",
    description:
      "PROPONE la creazione di un promemoria nel calendario. NON scrive nulla nel database. Restituisce un oggetto strutturato che l'utente dovra confermare.",
    input_schema: {
      type: "object" as const,
      properties: {
        titolo: { type: "string", description: "Titolo del promemoria." },
        data: { type: "string", description: "Data (formato YYYY-MM-DD)." },
        ora: { type: "string", description: "Ora opzionale (formato HH:MM)." },
        alert: { type: "boolean", description: "Se true, invia notifica." },
        descrizione: { type: "string", description: "Note aggiuntive." },
      },
      required: ["titolo", "data"] as string[],
    },
  },
  {
    name: "propose_update_task_status",
    description:
      "PROPONE l'aggiornamento dello stato di un task esistente. NON scrive nulla nel database. Restituisce un oggetto strutturato che l'utente dovra confermare.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "UUID del task da aggiornare." },
        riferimento_task: { type: "string", description: "Nome/descrizione del task per conferma visiva." },
        nuovo_stato: { type: "string", description: "Nuovo stato: da_fare, in_lavorazione, completato." },
      },
      required: ["task_id", "nuovo_stato"] as string[],
    },
  },
  {
    name: "generate_green_report",
    description:
      "Genera un report ambientale per un evento, includendo CO2 trasporti, fornitori e contributo digitale Synergy. Restituisce dati strutturati per la visualizzazione del Green Report.",
    input_schema: {
      type: "object" as const,
      properties: {
        event_id: { type: "string", description: "UUID/ID dell'evento." },
      },
      required: ["event_id"] as string[],
    },
  },
  {
    name: "get_wellness_status",
    description:
      "Controlla lo stato wellness dell'utente: mood recente, pause prese, tempo di lavoro, riconoscimenti. Usa per suggerire pause, celebrare win, o fare check-in sul morale. Chiama quando l'utente sembra stressato, chiede come sta, o quando vuoi aggiungere un tocco wellness alla conversazione.",
    input_schema: {
      type: "object" as const,
      properties: {
        include_team: {
          type: "boolean",
          description: "Se true, include anche il mood medio del team (solo Admin).",
        },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_creative_presentation_context",
    description:
      "Recupera il contesto completo per preparare una bozza di presentazione PPTX: progetto creativo, evento collegato, cliente, e template compatibili con i relativi placeholder. Usa PRIMA di preparare qualsiasi bozza di presentazione.",
    input_schema: {
      type: "object" as const,
      properties: {
        creative_project_id: {
          type: "string",
          description: "UUID del progetto creativo di tipo presentazione.",
        },
      },
      required: ["creative_project_id"] as string[],
    },
  },
  {
    name: "search_documents",
    description:
      "Cerca testo esatto indicizzato nei documenti accessibili dall'utente autenticato. Usa quando l'utente chiede informazioni su file caricati, brief, contratti, preventivi, presentazioni, PDF, fatture, requisiti o altri contenuti documentali.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Testo di ricerca.",
        },
        event_id: {
          type: "string",
          description: "Filtra per evento specifico (UUID). Ometti per cercare in tutti i documenti visibili.",
        },
        client_id: {
          type: "string",
          description: "Filtra per cliente (UUID).",
        },
        supplier_id: {
          type: "string",
          description: "Filtra per fornitore (UUID).",
        },
        limit: {
          type: "number",
          description: "Numero massimo di risultati (1-10, default 8).",
        },
      },
      required: ["query"] as string[],
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

const idCache = new Map<string, string>();
async function getName(table: string, id: string | null | undefined, sb: ReturnType<typeof createClient>): Promise<string> {
  if (!id) return "—";
  const key = `${table}:${id}`;
  if (idCache.has(key)) return idCache.get(key)!;
  try {
    const { data } = await sb.from(table).select("title,name,first_name,last_name").eq("id", id).maybeSingle();
    if (!data) { idCache.set(key, id); return id; }
    const n = (data as any).title || (data as any).name || ((data as any).first_name && (data as any).last_name ? `${(data as any).first_name} ${(data as any).last_name}` : (data as any).first_name) || id;
    idCache.set(key, n);
    return n;
  } catch { idCache.set(key, id); return id; }
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
        .select("id, title, start_date, end_date, location, status, budget, attendees, client, project_manager_id")
        .or("archiviato.is.null,archiviato.eq.false")
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
      const enriched = await Promise.all(
        data.map(async (e) => ({
          id: e.id,
          nome: e.title,
          data_inizio: e.start_date,
          data_fine: e.end_date,
          luogo: e.location,
          stato: e.status,
          budget: e.budget,
          partecipanti: e.attendees,
          cliente: e.client,
          cliente_nome: await getName("clients", e.client, supabase),
          pm_nome: await getName("profiles", e.project_manager_id, supabase),
        }))
      );
      return JSON.stringify(enriched);
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
      const enriched = await Promise.all(
        data.map(async (t) => ({
          id: t.id,
          titolo: t.title,
          scadenza: t.due_date,
          stato: t.status,
          priorita: t.priority,
          assegnatario: t.assigned_to,
          assegnato_a_nome: await getName("profiles", t.assigned_to, supabase),
          evento_id: t.event_id,
          evento_nome: await getName("events", t.event_id, supabase),
          fase: t.fase,
        }))
      );
      return JSON.stringify(enriched);
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
        .select("id, name, category, categorie, city, rating, status, contract_status, contract_expiry, email, phone")
        .order("name")
        .limit(30);

      if (input.ricerca) {
        q = q.ilike("name", `%${input.ricerca}%`);
      }
      if (input.categoria) {
        q = q.contains("categorie", [input.categoria]);
      }

      const { data, error } = await q;
      if (error) return JSON.stringify({ error: error.message });
      if (!data || data.length === 0) {
        // Fallback: try ilike on legacy category field
        if (input.categoria) {
          const { data: fallback } = await supabase
            .from("suppliers")
            .select("id, name, category, categorie, city, rating, status, contract_status, contract_expiry, email, phone")
            .ilike("category", `%${input.categoria}%`)
            .order("name")
            .limit(30);
          if (fallback && fallback.length > 0) {
            const supplierIds = fallback.map((s: any) => s.id);
            const { data: contacts } = await supabase
              .from("supplier_contacts")
              .select("supplier_id, nome, ruolo, email, telefono, is_primary")
              .in("supplier_id", supplierIds);
            const contactsMap: Record<string, any[]> = {};
            for (const c of contacts || []) {
              if (!contactsMap[c.supplier_id]) contactsMap[c.supplier_id] = [];
              contactsMap[c.supplier_id]!.push(c);
            }
            return JSON.stringify(
              fallback.map((s: any) => ({
                id: s.id,
                nome: s.name,
                categorie: (s.categorie && s.categorie.length > 0) ? s.categorie : (s.category ? [s.category] : []),
                citta: s.city,
                rating: s.rating,
                stato: s.status,
                contratto: s.contract_status,
                scadenza_contratto: s.contract_expiry,
                contacts: (contactsMap[s.id] || []).map((c: any) => ({ nome: c.nome, ruolo: c.ruolo, email: c.email, telefono: c.telefono, is_primary: c.is_primary })),
              }))
            );
          }
        }
        return "Nessun fornitore trovato.";
      }
      const supplierIds = data.map((s) => s.id);
      const { data: contacts } = await supabase
        .from("supplier_contacts")
        .select("supplier_id, nome, ruolo, email, telefono, is_primary")
        .in("supplier_id", supplierIds);
      const contactsMap: Record<string, typeof contacts> = {};
      for (const c of contacts || []) {
        if (!contactsMap[c.supplier_id]) contactsMap[c.supplier_id] = [];
        contactsMap[c.supplier_id]!.push(c);
      }
      return JSON.stringify(
        data.map((s) => ({
          id: s.id,
          nome: s.name,
          categorie: (s.categorie && s.categorie.length > 0) ? s.categorie : (s.category ? [s.category] : []),
          citta: s.city,
          rating: s.rating,
          stato: s.status,
          contratto: s.contract_status,
          scadenza_contratto: s.contract_expiry,
          contacts: (contactsMap[s.id] || []).map((c) => ({ nome: c.nome, ruolo: c.ruolo, email: c.email, telefono: c.telefono, is_primary: c.is_primary })),
        }))
      );
    }

    case "get_scadenze": {
      const days = (input.giorni as number) || 7;
      const limit = futureISO(days);

      const [tasksRes, practicesRes, fattureRes, paymentsRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, due_date, status, priority, assigned_to")
          .neq("status", "completato")
          .lte("due_date", limit)
          .order("due_date", { ascending: true })
          .limit(20),
        supabase
          .from("dossiers")
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
        supabase
          .from("event_payments")
          .select("id, event_id, tipo, descrizione, importo, data_scadenza, stato")
          .is("data_pagamento", null)
          .lte("data_scadenza", limit)
          .order("data_scadenza", { ascending: true })
          .limit(20),
      ]);

      const results: unknown[] = [];

      if (tasksRes.data?.length) {
        for (const t of tasksRes.data) {
          results.push({
            tipo: "task",
            titolo: t.title,
            scadenza: t.due_date,
            stato: t.status,
            priorita: t.priority,
            assegnatario: t.assigned_to,
            assegnato_a_nome: await getName("profiles", t.assigned_to, supabase),
            scaduto: t.due_date < today,
          });
        }
      }

      if (practicesRes.data?.length) {
        for (const p of practicesRes.data) {
          results.push({
            tipo: "dossier",
            titolo: p.title,
            scadenza: p.due_date,
            stato: p.status,
            priorita: p.priority,
            responsabile: p.responsible,
            responsabile_nome: await getName("profiles", p.responsible, supabase),
            scaduto: p.due_date < today,
          });
        }
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

      if (paymentsRes.data?.length) {
        for (const p of paymentsRes.data) {
          results.push({
            tipo: p.tipo === "incasso_cliente" ? "incasso_evento" : "pagamento_fornitore_evento",
            descrizione: p.descrizione,
            importo: p.importo,
            scadenza: p.data_scadenza,
            stato: p.data_scadenza < today ? "in_ritardo" : p.stato,
            event_id: p.event_id,
            evento_nome: await getName("events", p.event_id, supabase),
            scaduto: p.data_scadenza < today,
          });
        }
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
        const righe: { fornitore: string; categoria: string; dmc_categoria: string | null; costo: number; venduto: number; margine: number; margine_pct: number }[] = [];

        for (const { category, rows } of catTables) {
          for (const row of rows) {
            const econ = calcRowEconomics(row, category);
            if (!econ.venduto && !econ.costo) continue;
            const { vendutoNetto, costoNetto } = calcRowNetto(row, econ.venduto, econ.costo);
            const comm = calcRowCommission(row, costoNetto);
            const suppId = (row.supplier_id as string) || (row.profile_id as string) || "";
            const margine = vendutoNetto - costoNetto;
            const marginePct = vendutoNetto > 0 ? (margine / vendutoNetto) * 100 : 0;
            righe.push({
              fornitore: suppMap[suppId] || suppId || "(interno)",
              categoria: category,
              dmc_categoria: (row.dmc_categoria as string) || null,
              costo: Math.round(costoNetto * 100) / 100,
              venduto: Math.round(vendutoNetto * 100) / 100,
              margine: Math.round(margine * 100) / 100,
              margine_pct: Math.round(marginePct * 10) / 10,
            });
            totVenduto += vendutoNetto;
            totCosto += costoNetto;
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

        // Attach budget versions summary
        const { data: bvRows } = await supabase
          .from("budget_versions")
          .select("id, nome, tipo, stato, approvato_at, created_at")
          .eq("event_id", eventId)
          .order("created_at", { ascending: true });

        const versionsInfo = (bvRows ?? []).map((v: any) => ({
          id: v.id, nome: v.nome, tipo: v.tipo, stato: v.stato,
        }));
        const approved = versionsInfo.find((v: any) => v.stato === "approvato") || null;
        const consuntivo = versionsInfo.find((v: any) => v.tipo === "consuntivo") || null;

        return JSON.stringify({ ...result, versions: versionsInfo, approved_version: approved, consuntivo });
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
          const { vendutoNetto, costoNetto } = calcRowNetto(row, econ.venduto, econ.costo);
          if (!byEvent[eid]) byEvent[eid] = { venduto: 0, costo: 0, commissioni: 0 };
          byEvent[eid].venduto += vendutoNetto;
          byEvent[eid].costo += costoNetto;
          byEvent[eid].commissioni += calcRowCommission(row, costoNetto);
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

    case "get_team_members": {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, reparto, stato")
        .eq("stato", "attivo")
        .order("last_name");

      if (error) return JSON.stringify({ error: error.message });
      if (!data || data.length === 0) return "Nessun membro del team trovato.";

      const { data: rolesData } = await supabase
        .from("event_team_roles")
        .select("profile_id, event_id, ruoli_operativi");

      const rolesMap: Record<string, { event_id: string; ruoli: string[] }[]> = {};
      if (rolesData) {
        for (const r of rolesData) {
          if (!rolesMap[r.profile_id]) rolesMap[r.profile_id] = [];
          if (r.ruoli_operativi && r.ruoli_operativi.length > 0) {
            rolesMap[r.profile_id].push({ event_id: r.event_id, ruoli: r.ruoli_operativi });
          }
        }
      }

      return JSON.stringify(
        data.map((p) => ({
          id: p.id,
          nome: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
          reparto: p.reparto,
          ruoli_operativi: rolesMap[p.id] || [],
        }))
      );
    }

    case "propose_create_task": {
      const proposal = {
        action: "create_task",
        params: {
          titolo: input.titolo,
          assegnatario_nome: input.assegnatario_nome || null,
          scadenza: input.scadenza || null,
          evento_nome: input.evento_nome || null,
          priorita: input.priorita || "media",
          descrizione: input.descrizione || null,
        },
      };
      return `__PROPOSAL__${JSON.stringify(proposal)}`;
    }

    case "propose_create_memo": {
      const proposal = {
        action: "create_memo",
        params: {
          titolo: input.titolo,
          data: input.data,
          ora: input.ora || null,
          alert: input.alert || false,
          descrizione: input.descrizione || null,
        },
      };
      return `__PROPOSAL__${JSON.stringify(proposal)}`;
    }

    case "propose_update_task_status": {
      const proposal = {
        action: "update_task_status",
        params: {
          task_id: input.task_id,
          riferimento_task: input.riferimento_task || null,
          nuovo_stato: input.nuovo_stato,
        },
      };
      return `__PROPOSAL__${JSON.stringify(proposal)}`;
    }

    case "generate_green_report": {
      const eventId = input.event_id;

      // Load green data for the event
      const { data: greenRow } = await supabase
        .from("event_green_data")
        .select("*")
        .eq("event_id", eventId)
        .maybeSingle();

      // Load Synergy CO2 savings for this event
      const { data: synergyCO2 } = await supabase
        .from("impact_co2_log")
        .select("kg_co2_risparmiati, fonte, descrizione")
        .eq("event_id", eventId);

      const totalSynergyCO2 = synergyCO2?.reduce(
        (sum: number, r: any) => sum + Number(r.kg_co2_risparmiati), 0
      ) || 0;

      const byFonte = synergyCO2?.reduce(
        (acc: Record<string, number>, r: any) => {
          acc[r.fonte] = (acc[r.fonte] || 0) + Number(r.kg_co2_risparmiati);
          return acc;
        }, {} as Record<string, number>
      ) || {};

      // Load event basic info
      const { data: evt } = await supabase
        .from("events")
        .select("id, nome, start_date, end_date, location")
        .eq("id", eventId)
        .maybeSingle();

      // Load event suppliers with details
      const { data: evtSuppliers } = await supabase
        .from("event_suppliers")
        .select("supplier_id, service_category")
        .eq("event_id", eventId);

      let supplierNames: { id: string; nome: string; categoria: string }[] = [];
      if (evtSuppliers && evtSuppliers.length > 0) {
        const ids = evtSuppliers.map((es: any) => es.supplier_id);
        const { data: sups } = await supabase
          .from("suppliers")
          .select("id, nome, categoria")
          .in("id", ids);
        supplierNames = sups || [];
      }

      // Load event documents - search for guest list
      const { data: docs } = await supabase
        .from("documents")
        .select("id, file_name, file_path")
        .eq("event_id", eventId);

      const guestListDoc = docs?.find((d: any) =>
        d.file_name.toLowerCase().match(
          /ospiti|guests|partecipanti|participant|attendees|lista|list|registr|delegate|delegati|invitati|pd.disease|pd_disease/
        )
      );

      let guestText = "";
      let guestDocName: string | null = null;
      if (guestListDoc) {
        guestDocName = guestListDoc.file_name;
        try {
          const { data: fileData } = await supabase
            .storage
            .from("documents")
            .download(guestListDoc.file_path);
          if (fileData) {
            const ext = guestListDoc.file_name.split(".").pop()?.toLowerCase();
            if (ext === "csv" || ext === "txt") {
              guestText = await fileData.text();
            } else {
              guestText = await fileData.text();
            }
            if (guestText.length > 3000) guestText = guestText.slice(0, 3000);
          }
        } catch (_e) {
          guestText = "";
        }
      }

      // Build context for Claude with web_search
      const pax = greenRow?.pax || 0;
      const distanza = greenRow?.distanza_km || 0;
      const mezzo = greenRow?.mezzo_prevalente || "misto";
      const citta = greenRow?.citta_provenienza || "";
      const location = evt?.location || "";
      const supplierScores = (greenRow?.supplier_scores as Record<string, number>) || {};

      const suppliersList = supplierNames.map((s: any) => {
        const score = supplierScores[s.id] ?? 3;
        return `- ${s.nome} (${s.categoria}), carbon score: ${score}/5`;
      }).join("\n");

      const synergyContext = `
CO2 RISPARMIATA DA SYNERGY: ${totalSynergyCO2.toFixed(0)} kg totali
- Documenti digitali: ${(byFonte.documento_digitale || 0).toFixed(0)} kg
- Comunicazioni interne: ${(byFonte.comunicazione_interna || 0).toFixed(0)} kg
- Riunioni evitate: ${(byFonte.riunione_evitata || 0).toFixed(0)} kg`;

      const guestContext = guestText
        ? `\nLISTA OSPITI (da documento "${guestDocName}"):\n${guestText}\n\nAnalizza questo documento per estrarre:\n- Numero ospiti per citta di provenienza\n- Mezzo di trasporto se indicato\n- Qualsiasi info utile per il calcolo CO2\n\nSe il documento non contiene info di provenienza, ignoralo.`
        : "\nNessun documento ospiti trovato. Usa i dati manuali inseriti.";

      const greenPrompt = `Sei un consulente ambientale. Genera un Green Report JSON per questo evento.

REGOLA FONDAMENTALE: Ogni numero deve avere accanto il suo termine di paragone. Mai un numero da solo senza contesto. Ogni sezione del report deve includere un campo "confronto" che spiega rispetto a cosa viene calcolato il risparmio.

DATI EVENTO:
- Nome: ${evt?.nome || eventId}
- Location: ${location}
- Pax: ${pax}
- Citta provenienza (manuale): ${citta}
- Distanza media (manuale): ${distanza} km
- Mezzo prevalente: ${mezzo}

FORNITORI EVENTO:
${suppliersList || "Nessun fornitore collegato"}

${synergyContext}
${guestContext}

ISTRUZIONI:
1. Usa i fattori di emissione DEFRA 2024 standard per calcolare la CO2:
   - Auto: 0.170 kg CO2/km/pax
   - Treno: 0.041 kg CO2/km/pax
   - Aereo: 0.255 kg CO2/km/pax
   - Misto: 0.105 kg CO2/km/pax
   Per ogni rotta segnala "fonte_distanza: DEFRA 2024 standard".

2. CONFRONTO TRASPORTI: Per ogni rotta, calcola anche lo scenario alternativo realistico.
   Esempio: se il mezzo scelto e treno, l'alternativa e aereo (per >500km) o auto (per <500km).
   Il campo "confronto" nella sezione trasporti deve dire: "Rispetto a [alternativa realistica]: risparmiati X kg CO2 (Y% in meno)".
   Formato: "Treno vs aereo Roma-Milano: 12 kg vs 72 kg CO2 per pax (-83%)"

3. Per i fornitori, assegna stime di CO2 basate sulla categoria e il carbon_score fornito (1=ottimo, 5=pessimo).
   Non inventare certificazioni. Se non conosci con certezza una certificazione reale, lascia il campo vuoto.
   CONFRONTO FORNITORI: L'alternativa e un fornitore standard non certificato (score 4/5) della stessa categoria.
   Formato campo confronto: "Fornitore certificato vs standard: X kg vs Y kg CO2 (-Z%)"

4. Se hai la lista ospiti, calcola le rotte per citta. Altrimenti usa i dati manuali.

5. Includi nella narrativa un paragrafo dedicato al contributo digitale di Synergy nella riduzione dell'impatto, presentandolo come valore aggiunto dell'approccio tecnologico di Simmetria.

6. CONFRONTO SYNERGY: L'alternativa e il workflow tradizionale (email stampate, documenti cartacei, riunioni in presenza con spostamenti).
   Formato: "Piattaforma digitale vs gestione tradizionale: X kg CO2 risparmiati (equivalente a Y fogli A4 non stampati, Z riunioni in presenza evitate)"

7. TOTALE E BENCHMARK: Confronta le emissioni totali dell'evento con la media MICE Italia.
   Benchmark: media eventi MICE Italia = 150-200 kg CO2/partecipante (fonte: DEFRA 2024 + ICCA Statistics Report).
   Formato campo confronto totale: "Questo evento: X kg/pax vs media MICE Italia: 175 kg/pax (-Y%)"

8. EQUIVALENTI CONTESTUALIZZATI: Non solo numeri ma descrizioni comprensibili.
   Formato: "X alberi = la CO2 assorbita da X alberi in un anno (un parco urbano di circa Y mq)"
   "X km auto = Y viaggi Roma-Milano in auto"
   "X voli = Y volte il tragitto Roma-Milano in aereo"

RISPONDI SOLO con JSON valido (senza markdown, senza backtick) con questa struttura esatta:
{
  "trasporti": {
    "fonte_dati": "lista_ospiti" oppure "stima_manuale",
    "documento_usato": "nome file" oppure null,
    "rotte": [
      {
        "citta_origine": "string",
        "n_partecipanti": number,
        "distanza_km": number,
        "mezzo": "auto|treno|aereo",
        "co2_kg": number,
        "fonte_distanza": "string (URL o 'DEFRA 2024 standard')",
        "alternativa_mezzo": "string (il mezzo alternativo realistico)",
        "co2_alternativa_kg": number,
        "risparmio_pct": number
      }
    ],
    "totale_co2_kg": number,
    "totale_alternativa_kg": number,
    "confronto": "string (es: 'Scelta treno vs aereo per le tratte >500km: 320 kg vs 1840 kg CO2 totali, -83%')",
    "nota": "string"
  },
  "fornitori": [
    {
      "nome": "string",
      "categoria": "string",
      "carbon_score": number,
      "certificazioni_trovate": ["string"] oppure [],
      "fonte_certificazione": "string URL" oppure null,
      "co2_kg": number,
      "co2_alternativa_standard_kg": number,
      "confronto": "string (es: 'Fornitore certificato vs standard: 45 kg vs 120 kg CO2, -62%')",
      "alternativa_green": "string suggerimento" oppure null
    }
  ],
  "synergy_impact": {
    "co2_risparmiata_kg": ${Math.round(totalSynergyCO2)},
    "breakdown": {
      "documenti_digitali_kg": ${Math.round(byFonte.documento_digitale || 0)},
      "comunicazioni_interne_kg": ${Math.round(byFonte.comunicazione_interna || 0)},
      "riunioni_evitate_kg": ${Math.round(byFonte.riunione_evitata || 0)}
    },
    "equivalente_fogli_carta": ${Math.round(totalSynergyCO2 * 120)},
    "confronto": "string (es: 'Piattaforma digitale vs gestione tradizionale: 85 kg CO2 risparmiati, equivalente a 10200 fogli A4 non stampati e 12 riunioni in presenza evitate')",
    "alternativa_tradizionale_kg": number,
    "descrizione_it": "string (2 righe, tono positivo, con confronto esplicito)",
    "descrizione_en": "string"
  },
  "totale_co2_kg": number,
  "impatto_netto_kg": number (= totale_co2_kg - synergy_impact.co2_risparmiata_kg),
  "benchmark": {
    "media_mice_italia_kg_pax": 175,
    "questo_evento_kg_pax": number (= totale_co2_kg / pax),
    "differenza_pct": number,
    "confronto": "string (es: 'Questo evento: 62 kg/pax vs media MICE Italia: 175 kg/pax (-65%). Fonte: DEFRA 2024 + ICCA Statistics Report')",
    "fonte": "DEFRA 2024 + ICCA Statistics Report"
  },
  "equivalenti": {
    "alberi_salvati": number (impatto_netto_kg / 21),
    "alberi_descrizione": "string (es: 'La CO2 assorbita da 8 alberi in un anno, un parco urbano di circa 50 mq')",
    "km_auto": number (impatto_netto_kg * 6),
    "km_auto_descrizione": "string (es: '3 viaggi Roma-Milano in auto')",
    "voli_roma_milano": number (impatto_netto_kg / 45),
    "voli_descrizione": "string (es: '2 volte il tragitto Roma-Milano in aereo')"
  },
  "narrativa_it": "string (3-4 paragrafi con sezione Synergy e confronti espliciti in ogni sezione)",
  "narrativa_en": "string",
  "fonti": ["string - tutte le URL e fonti consultate"]
}`;

      // Make dedicated Claude call with web_search
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) return JSON.stringify({ error: "ANTHROPIC_API_KEY non configurata" });

      try {
        const greenRes = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODEL_HAIKU,
            max_tokens: 4096,
            system: "Sei un consulente ambientale esperto. Rispondi SOLO con JSON valido, senza markdown o backtick.",
            messages: [{ role: "user", content: greenPrompt }],
          }),
        });

        if (!greenRes.ok) {
          const errText = await greenRes.text();
          throw new Error(`Anthropic ${greenRes.status}: ${errText}`);
        }

        const result = await greenRes.json();

        // Extract text from final result
        const textBlocks = (result.content || []).filter((b: any) => b.type === "text");
        const rawText = textBlocks.map((b: any) => b.text).join("\n").trim();

        // Try to parse as JSON, handling possible markdown wrapping
        let jsonStr = rawText;
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }

        try {
          JSON.parse(jsonStr);
          return jsonStr;
        } catch (_e) {
          // Return a fallback structured response
          const factors: Record<string, number> = { auto: 0.170, treno: 0.041, aereo: 0.255, misto: 0.105 };
          const co2Trasporti = pax * distanza * 2 * (factors[mezzo] || 0.105);
          const co2Fornitori = supplierNames.length * pax * 2;
          const co2Totale = co2Trasporti + co2Fornitori;
          const impattoNetto = Math.max(0, co2Totale - totalSynergyCO2);
          const kgPax = pax > 0 ? Math.round(co2Totale / pax) : 0;
          const altFactor = mezzo === "treno" ? 0.255 : mezzo === "aereo" ? 0.041 : 0.170;
          const co2Alt = pax * distanza * 2 * altFactor;
          const altMezzo = mezzo === "treno" ? "aereo" : mezzo === "aereo" ? "treno" : "aereo";

          return JSON.stringify({
            trasporti: {
              fonte_dati: "stima_manuale",
              documento_usato: null,
              rotte: citta ? [{ citta_origine: citta, n_partecipanti: pax, distanza_km: distanza, mezzo, co2_kg: Math.round(co2Trasporti), fonte_distanza: "DEFRA 2024 standard", alternativa_mezzo: altMezzo, co2_alternativa_kg: Math.round(co2Alt), risparmio_pct: Math.round((1 - co2Trasporti / co2Alt) * 100) }] : [],
              totale_co2_kg: Math.round(co2Trasporti),
              totale_alternativa_kg: Math.round(co2Alt),
              confronto: `Scelta ${mezzo} vs ${altMezzo}: ${Math.round(co2Trasporti)} kg vs ${Math.round(co2Alt)} kg CO2 totali (${Math.round((1 - co2Trasporti / co2Alt) * 100)}%)`,
              nota: "Stima basata su dati inseriti manualmente",
            },
            fornitori: supplierNames.map((s: any) => {
              const score = supplierScores[s.id] ?? 3;
              const co2F = Math.round(pax * 2);
              const co2Std = Math.round(pax * 2 * (4 / Math.max(score, 1)));
              return {
                nome: s.nome,
                categoria: s.categoria,
                carbon_score: score,
                certificazioni_trovate: [],
                fonte_certificazione: null,
                co2_kg: co2F,
                co2_alternativa_standard_kg: co2Std,
                confronto: `Fornitore score ${score}/5 vs standard 4/5: ${co2F} kg vs ${co2Std} kg CO2`,
                alternativa_green: null,
              };
            }),
            synergy_impact: {
              co2_risparmiata_kg: Math.round(totalSynergyCO2),
              breakdown: {
                documenti_digitali_kg: Math.round(byFonte.documento_digitale || 0),
                comunicazioni_interne_kg: Math.round(byFonte.comunicazione_interna || 0),
                riunioni_evitate_kg: Math.round(byFonte.riunione_evitata || 0),
              },
              equivalente_fogli_carta: Math.round(totalSynergyCO2 * 120),
              confronto: `Piattaforma digitale vs gestione tradizionale: ${Math.round(totalSynergyCO2)} kg CO2 risparmiati (equivalente a ${Math.round(totalSynergyCO2 * 120)} fogli A4 non stampati)`,
              alternativa_tradizionale_kg: Math.round(totalSynergyCO2),
              descrizione_it: `Gestendo questo evento con Synergy invece del workflow tradizionale, il team ha risparmiato ${Math.round(totalSynergyCO2)} kg CO2, equivalenti a ${Math.round(totalSynergyCO2 * 120)} fogli A4 non stampati.`,
              descrizione_en: `By managing this event with Synergy instead of traditional workflow, the team saved ${Math.round(totalSynergyCO2)} kg CO2.`,
            },
            totale_co2_kg: Math.round(co2Totale),
            impatto_netto_kg: Math.round(impattoNetto),
            benchmark: {
              media_mice_italia_kg_pax: 175,
              questo_evento_kg_pax: kgPax,
              differenza_pct: Math.round((1 - kgPax / 175) * 100),
              confronto: `Questo evento: ${kgPax} kg/pax vs media MICE Italia: 175 kg/pax (${Math.round((1 - kgPax / 175) * 100)}%). Fonte: DEFRA 2024 + ICCA Statistics Report`,
              fonte: "DEFRA 2024 + ICCA Statistics Report",
            },
            equivalenti: {
              alberi_salvati: Math.ceil(impattoNetto / 21),
              alberi_descrizione: `La CO2 assorbita da ${Math.ceil(impattoNetto / 21)} alberi in un anno`,
              km_auto: Math.round(impattoNetto * 6),
              km_auto_descrizione: `${Math.round(impattoNetto * 6 / 580)} viaggi Roma-Milano in auto`,
              voli_roma_milano: Number((impattoNetto / 45).toFixed(1)),
              voli_descrizione: `${(impattoNetto / 45).toFixed(1)} volte il tragitto Roma-Milano in aereo`,
            },
            narrativa_it: rawText || "Report non generato correttamente.",
            narrativa_en: "",
            fonti: ["DEFRA 2024 standard", "ICCA Statistics Report"],
          });
        }
      } catch (err: any) {
        // Fallback if Claude call fails entirely
        const factors: Record<string, number> = { auto: 0.170, treno: 0.041, aereo: 0.255, misto: 0.105 };
        const co2Trasporti = pax * distanza * 2 * (factors[mezzo] || 0.105);
        const co2Totale = co2Trasporti;
        const impattoNetto = Math.max(0, co2Totale - totalSynergyCO2);
        const kgPax = pax > 0 ? Math.round(co2Totale / pax) : 0;

        return JSON.stringify({
          trasporti: { fonte_dati: "stima_manuale", documento_usato: null, rotte: [], totale_co2_kg: Math.round(co2Trasporti), totale_alternativa_kg: 0, confronto: "Dati insufficienti per confronto", nota: "Errore nella generazione AI: " + err.message },
          fornitori: [],
          synergy_impact: { co2_risparmiata_kg: Math.round(totalSynergyCO2), breakdown: { documenti_digitali_kg: Math.round(byFonte.documento_digitale || 0), comunicazioni_interne_kg: Math.round(byFonte.comunicazione_interna || 0), riunioni_evitate_kg: Math.round(byFonte.riunione_evitata || 0) }, equivalente_fogli_carta: Math.round(totalSynergyCO2 * 120), confronto: `Piattaforma digitale vs gestione tradizionale: ${Math.round(totalSynergyCO2)} kg CO2 risparmiati`, alternativa_tradizionale_kg: Math.round(totalSynergyCO2), descrizione_it: "", descrizione_en: "" },
          totale_co2_kg: Math.round(co2Totale),
          impatto_netto_kg: Math.round(impattoNetto),
          benchmark: { media_mice_italia_kg_pax: 175, questo_evento_kg_pax: kgPax, differenza_pct: Math.round((1 - kgPax / 175) * 100), confronto: `Questo evento: ${kgPax} kg/pax vs media MICE Italia: 175 kg/pax`, fonte: "DEFRA 2024 + ICCA Statistics Report" },
          equivalenti: { alberi_salvati: Math.ceil(impattoNetto / 21), alberi_descrizione: `La CO2 assorbita da ${Math.ceil(impattoNetto / 21)} alberi in un anno`, km_auto: Math.round(impattoNetto * 6), km_auto_descrizione: `${Math.round(impattoNetto * 6 / 580)} viaggi Roma-Milano in auto`, voli_roma_milano: Number((impattoNetto / 45).toFixed(1)), voli_descrizione: `${(impattoNetto / 45).toFixed(1)} volte il tragitto Roma-Milano in aereo` },
          narrativa_it: "",
          narrativa_en: "",
          fonti: ["DEFRA 2024 standard", "ICCA Statistics Report"],
        });
      }
    }

    case "get_wellness_status": {
      const includeTeam = input.include_team === true;

      // Get user's recent moods (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: moods } = await supabase
        .from("wellness_logs")
        .select("mood, created_at")
        .eq("tipo", "mood_emoji")
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false })
        .limit(10);

      // Get breaks taken today
      const todayStart = todayISO() + "T00:00:00Z";
      const { data: breaksToday } = await supabase
        .from("wellness_logs")
        .select("break_type, break_duration_minutes, break_effectiveness")
        .eq("tipo", "break_taken")
        .gte("created_at", todayStart);

      // Get recent recognitions received
      const { data: recognitions } = await supabase
        .from("recognition_logs")
        .select("tipo, message, created_at, given_by")
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false })
        .limit(5);

      // Get last break recommendation
      const { data: lastRec } = await supabase
        .from("break_recommendations")
        .select("recommendation_type, recommendation_text, triggered_at, break_taken")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get latest wellness pulse
      const { data: pulse } = await supabase
        .from("wellness_logs")
        .select("energy_level, work_life_balance, team_support, burnout_risk_self_reported, created_at")
        .eq("tipo", "wellness_pulse")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const moodScores: Record<string, number> = { '😍': 5, '😊': 4, '😐': 3, '😕': 2, '😠': 1 };
      const moodList = (moods || []).filter(m => m.mood).map(m => ({ mood: m.mood, score: moodScores[m.mood!] || 3, when: m.created_at }));
      const avgMood = moodList.length > 0 ? moodList.reduce((a, b) => a + b.score, 0) / moodList.length : 0;

      const result: Record<string, unknown> = {
        mood_recente: {
          entries: moodList.slice(0, 5),
          media_7gg: Math.round(avgMood * 10) / 10,
          trend: moodList.length >= 2 ? (moodList[0].score > moodList[moodList.length - 1].score ? "miglioramento" : moodList[0].score < moodList[moodList.length - 1].score ? "calo" : "stabile") : "insufficiente",
        },
        pause_oggi: {
          totale: (breaksToday || []).length,
          minuti_totali: (breaksToday || []).reduce((s, b) => s + (b.break_duration_minutes || 0), 0),
          efficacia_media: (() => {
            const rated = (breaksToday || []).filter(b => b.break_effectiveness);
            return rated.length > 0 ? Math.round(rated.reduce((s, b) => s + b.break_effectiveness!, 0) / rated.length * 10) / 10 : null;
          })(),
        },
        ultima_raccomandazione: lastRec ? {
          tipo: lastRec.recommendation_type,
          testo: lastRec.recommendation_text,
          seguita: lastRec.break_taken,
        } : null,
        riconoscimenti_settimana: (recognitions || []).length,
        pulse: pulse ? {
          energia: pulse.energy_level,
          work_life: pulse.work_life_balance,
          supporto_team: pulse.team_support,
          rischio_burnout: pulse.burnout_risk_self_reported,
          data: pulse.created_at,
        } : null,
      };

      // Team mood (admin only)
      if (includeTeam) {
        const { data: teamSnapshot } = await supabase
          .from("team_mood_snapshot")
          .select("avg_mood_score, total_breaks_taken, burnout_risk_count, snapshot_date")
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        result.team = teamSnapshot || { nota: "Nessun snapshot team disponibile" };
      }

      return JSON.stringify(result);
    }

    case "get_creative_presentation_context": {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const projectId =
        typeof input.creative_project_id === "string" ? input.creative_project_id.trim() : "";
      if (!projectId || !UUID_RE.test(projectId)) {
        return JSON.stringify({ error: "creative_project_id deve essere un UUID valido." });
      }

      const { data: project, error: projErr } = await supabase
        .from("creative_projects")
        .select("id, title, type, status, notes, event_id, client_id")
        .eq("id", projectId)
        .maybeSingle();
      if (projErr || !project) {
        return JSON.stringify({ error: "Progetto creativo non trovato o accesso negato." });
      }
      if (project.type !== "presentazione") {
        return JSON.stringify({ error: "Questo strumento è riservato a progetti di tipo presentazione." });
      }

      if (project.event_id) {
        const { data: perm } = await supabase.rpc("has_event_permission", {
          p_event_id: project.event_id,
          p_permission: "can_manage_creative",
        });
        if (!perm) {
          return JSON.stringify({ error: "Non hai i permessi creativi su questo evento." });
        }
      } else {
        const { data: globalPerm } = await supabase.rpc("can_manage_global_creative");
        if (!globalPerm) {
          return JSON.stringify({ error: "Non hai i permessi per gestire i creativi globali." });
        }
      }

      let eventCtx: Record<string, unknown> | null = null;
      if (project.event_id) {
        const { data: ev, error: evErr } = await supabase
          .from("events")
          .select("id, title, start_date, end_date, location")
          .eq("id", project.event_id)
          .maybeSingle();
        if (evErr || !ev) {
          return JSON.stringify({ error: "Impossibile caricare l'evento collegato al progetto." });
        }
        eventCtx = {
          id: ev.id,
          nome: ev.title,
          data_inizio: ev.start_date,
          data_fine: ev.end_date,
          location: ev.location ?? null,
        };
      }

      let clientCtx: Record<string, unknown> | null = null;
      if (project.client_id) {
        const { data: cl, error: clErr } = await supabase
          .from("clients")
          .select("id, name, company")
          .eq("id", project.client_id)
          .maybeSingle();
        if (clErr || !cl) {
          return JSON.stringify({ error: "Impossibile caricare il cliente collegato al progetto." });
        }
        clientCtx = { id: cl.id, nome: cl.name, settore: cl.company ?? null };
      }

      const { data: tpls } = await supabase
        .from("creative_templates")
        .select("id, name, description, client_id, placeholder_keys")
        .eq("is_active", true)
        .eq("template_type", "pptx");
      const compatibleTemplates = (tpls ?? []).filter(
        (t: { client_id: string | null }) =>
          t.client_id === null || t.client_id === project.client_id,
      );

      return JSON.stringify({
        project: {
          id: project.id,
          title: project.title,
          type: project.type,
          status: project.status,
          notes: project.notes,
          event_id: project.event_id,
          client_id: project.client_id,
        },
        event: eventCtx,
        client: clientCtx,
        compatible_templates: compatibleTemplates,
      });
    }

    case "search_documents": {
      const query = typeof input.query === "string" ? input.query.trim() : "";
      if (!query) return JSON.stringify({ error: "Parametro query obbligatorio." });
      const searchQuery = query.slice(0, 500);

      if (
        (input.event_id !== undefined && typeof input.event_id !== "string") ||
        (input.client_id !== undefined && typeof input.client_id !== "string") ||
        (input.supplier_id !== undefined && typeof input.supplier_id !== "string")
      ) {
        return JSON.stringify({ error: "Filtri documentali non validi" });
      }

      const rawLimit = typeof input.limit === "number" && Number.isFinite(input.limit) ? input.limit : 8;
      const limit = Math.max(1, Math.min(10, Math.round(rawLimit)));

      const eventId = typeof input.event_id === "string" ? input.event_id : null;
      const clientId = typeof input.client_id === "string" ? input.client_id : null;
      const supplierId = typeof input.supplier_id === "string" ? input.supplier_id : null;

      const { data, error: rpcErr } = await supabase.rpc("search_document_chunks", {
        p_query: searchQuery,
        p_event_id: eventId,
        p_client_id: clientId,
        p_supplier_id: supplierId,
        p_limit: limit,
      });

      if (rpcErr) {
        return JSON.stringify({ error: "Ricerca documentale temporaneamente non disponibile" });
      }

      if (!data || data.length === 0) {
        return JSON.stringify({ found: false, result_count: 0, sources: [] });
      }

      const sources = data.slice(0, 8).map((row: Record<string, unknown>) => ({
        citation_id: `DOC:${row.document_id}:${row.chunk_index}`,
        document_id: row.document_id,
        document_name: row.document_name,
        file_name: row.file_name,
        categoria: row.categoria,
        chunk_index: row.chunk_index,
        section_label: row.section_label || null,
        page_number: row.page_number || null,
        exact_content: row.content,
        relevance: row.rank,
      }));

      return JSON.stringify({ found: true, result_count: sources.length, sources });
    }

    default:
      return `Tool sconosciuto: ${name}`;
  }
}

// ─── ANTHROPIC API CALL WITH TOOL LOOP ─────────────────────────────────

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL_SONNET = "claude-sonnet-4-6";
const MODEL_HAIKU = "claude-haiku-4-5-20251001";
const MAX_TOOL_ROUNDS = 8;
const DAILY_LIMIT = 50;

const COMPLEX_KEYWORDS = ["proponi", "analizza", "confronta", "calcola", "crea", "genera", "pianifica", "budget", "margine", "economics", "preventivo", "benchmark"];

function pickModel(message: string): string {
  const msg = message.toLowerCase().trim();
  if (msg.length > 50) return MODEL_SONNET;
  if (COMPLEX_KEYWORDS.some(kw => msg.includes(kw))) return MODEL_SONNET;
  return MODEL_HAIKU;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: unknown;
}

interface FlyProposal {
  action: string;
  params: Record<string, unknown>;
}

interface CallResult {
  text: string;
  proposal?: FlyProposal;
  inputTokens: number;
  outputTokens: number;
  toolsCalled: string[];
}

async function callAnthropic(
  messages: AnthropicMessage[],
  systemPrompt: string,
  supabase: ReturnType<typeof createClient>,
  model: string = MODEL_SONNET
): Promise<CallResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY non configurata");

  let currentMessages = [...messages];
  let capturedProposal: FlyProposal | undefined;
  let totalInput = 0;
  let totalOutput = 0;
  const toolsUsed = new Set<string>();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body = {
      model: model,
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

    if (result.usage) {
      totalInput += result.usage.input_tokens || 0;
      totalOutput += result.usage.output_tokens || 0;
    }

    if (result.stop_reason === "end_turn" || result.stop_reason === "max_tokens") {
      const textBlocks = (result.content || []).filter(
        (b: any) => b.type === "text"
      );
      return { text: textBlocks.map((b: any) => b.text).join("\n") || "(nessuna risposta)", proposal: capturedProposal, inputTokens: totalInput, outputTokens: totalOutput, toolsCalled: [...toolsUsed] };
    }

    if (result.stop_reason === "tool_use") {
      const toolUseBlocks = (result.content || []).filter(
        (b: any) => b.type === "tool_use"
      );

      currentMessages.push({ role: "assistant", content: result.content });

      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        toolsUsed.add(toolBlock.name);
        const toolResult = await executeTool(
          toolBlock.name,
          toolBlock.input || {},
          supabase
        );

        if (toolResult.startsWith("__PROPOSAL__")) {
          const proposalJson = toolResult.slice("__PROPOSAL__".length);
          capturedProposal = JSON.parse(proposalJson);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: `Proposta generata. Presenta all'utente un riepilogo dell'azione proposta e chiedi conferma esplicita prima di procedere. Dati proposta: ${proposalJson}`,
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: toolResult,
          });
        }
      }

      currentMessages.push({ role: "user", content: toolResults });
      continue;
    }

    const textBlocks = (result.content || []).filter(
      (b: any) => b.type === "text"
    );
    return { text: textBlocks.map((b: any) => b.text).join("\n") || "(nessuna risposta)", proposal: capturedProposal, inputTokens: totalInput, outputTokens: totalOutput, toolsCalled: [...toolsUsed] };
  }

  return { text: "Ho raggiunto il limite di consultazioni. Prova a riformulare la domanda in modo piu specifico.", inputTokens: totalInput, outputTokens: totalOutput, toolsCalled: [...toolsUsed] };
}

// ─── INPUT VALIDATION ─────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const VALID_PRIORITA = ["alta", "media", "bassa"];
const VALID_TASK_STATO = ["da_fare", "in_lavorazione", "completato"];

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

interface ValidationError {
  campo: string;
  motivo: string;
}

function validateText(value: unknown, campo: string, maxLen = 500, required = true): ValidationError | null {
  if (value == null || value === "") {
    return required ? { campo, motivo: "campo obbligatorio, non puo essere vuoto" } : null;
  }
  if (typeof value !== "string") return { campo, motivo: "deve essere una stringa" };
  const clean = stripHtml(value);
  if (required && clean.length === 0) return { campo, motivo: "non puo essere vuoto dopo la rimozione dei tag HTML" };
  if (clean.length > maxLen) return { campo, motivo: `troppo lungo (max ${maxLen} caratteri, ricevuti ${clean.length})` };
  return null;
}

function validateDate(value: unknown, campo: string, required = false): ValidationError | null {
  if (value == null || value === "") {
    return required ? { campo, motivo: "data obbligatoria" } : null;
  }
  if (typeof value !== "string") return { campo, motivo: "deve essere una stringa" };
  if (!DATE_RE.test(value)) return { campo, motivo: "formato non valido, atteso YYYY-MM-DD" };
  const ts = Date.parse(value + "T00:00:00Z");
  if (isNaN(ts)) return { campo, motivo: "data non valida" };
  return null;
}

function validateTime(value: unknown, campo: string): ValidationError | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return { campo, motivo: "deve essere una stringa" };
  if (!TIME_RE.test(value)) return { campo, motivo: "formato non valido, atteso HH:MM" };
  const [h, m] = value.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return { campo, motivo: "ora non valida" };
  return null;
}

function validateEnum(value: unknown, campo: string, allowed: string[], required = true): ValidationError | null {
  if (value == null || value === "") {
    return required ? { campo, motivo: `obbligatorio, valori ammessi: ${allowed.join(", ")}` } : null;
  }
  if (typeof value !== "string") return { campo, motivo: "deve essere una stringa" };
  if (!allowed.includes(value)) return { campo, motivo: `valore non ammesso "${value}", valori validi: ${allowed.join(", ")}` };
  return null;
}

function validateUuid(value: unknown, campo: string, required = true): ValidationError | null {
  if (value == null || value === "") {
    return required ? { campo, motivo: "UUID obbligatorio" } : null;
  }
  if (typeof value !== "string") return { campo, motivo: "deve essere una stringa" };
  if (!UUID_RE.test(value)) return { campo, motivo: "formato UUID non valido" };
  return null;
}

function validateProposalParams(action: string, params: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (action) {
    case "create_task": {
      const te = validateText(params.titolo, "titolo", 500, true);
      if (te) errors.push(te);
      const de = validateDate(params.scadenza, "scadenza", false);
      if (de) errors.push(de);
      const pe = validateEnum(params.priorita, "priorita", VALID_PRIORITA, false);
      if (pe) errors.push(pe);
      const desc = validateText(params.descrizione, "descrizione", 500, false);
      if (desc) errors.push(desc);
      const an = validateText(params.assegnatario_nome, "assegnatario_nome", 200, false);
      if (an) errors.push(an);
      const en = validateText(params.evento_nome, "evento_nome", 200, false);
      if (en) errors.push(en);
      break;
    }
    case "create_memo": {
      const te = validateText(params.titolo, "titolo", 500, true);
      if (te) errors.push(te);
      const de = validateDate(params.data, "data", true);
      if (de) errors.push(de);
      const ti = validateTime(params.ora, "ora");
      if (ti) errors.push(ti);
      const desc = validateText(params.descrizione, "descrizione", 500, false);
      if (desc) errors.push(desc);
      break;
    }
    case "update_task_status": {
      const ue = validateUuid(params.task_id, "task_id", true);
      if (ue) errors.push(ue);
      const se = validateEnum(params.nuovo_stato, "nuovo_stato", VALID_TASK_STATO, true);
      if (se) errors.push(se);
      break;
    }
    case "create_event_draft": {
      const ne = validateText(params.nome, "nome", 200, true);
      if (ne) errors.push(ne);
      break;
    }
    default:
      errors.push({ campo: "action", motivo: `azione sconosciuta: ${action}` });
  }

  return errors;
}

function sanitizeString(value: unknown): string {
  if (typeof value !== "string") return "";
  return stripHtml(value).slice(0, 500);
}

// ─── EXECUTE CONFIRMED PROPOSALS ──────────────────────────────────────

async function executeProposal(
  proposal: { action: string; params: Record<string, unknown> },
  supabaseClient: ReturnType<typeof createClient>,
  userId: string
): Promise<{ success: boolean; message: string; data?: unknown }> {
  const { action, params } = proposal;

  // ─── Validate inputs ────────────────────────────────────────────────
  const validationErrors = validateProposalParams(action, params);
  if (validationErrors.length > 0) {
    const errorMsg = validationErrors
      .map(e => `parametro non valido: ${e.campo} — ${e.motivo}`)
      .join("; ");

    await supabaseClient.from("fly_actions_log").insert({
      user_id: userId,
      action_type: action,
      payload: params,
      status: "failed",
      error: errorMsg,
    });

    return { success: false, message: errorMsg };
  }

  // ─── Sanitize string fields ─────────────────────────────────────────
  if (params.titolo) params.titolo = sanitizeString(params.titolo);
  if (params.descrizione) params.descrizione = sanitizeString(params.descrizione);
  if (params.assegnatario_nome) params.assegnatario_nome = sanitizeString(params.assegnatario_nome);
  if (params.evento_nome) params.evento_nome = sanitizeString(params.evento_nome);

  try {
    let result: unknown = null;

    switch (action) {
      case "create_task": {
        // Resolve assegnatario name to profile id
        let assignedTo: string | null = null;
        if (params.assegnatario_nome) {
          const { data: profiles } = await supabaseClient
            .from("profiles")
            .select("id, first_name, last_name")
            .eq("stato", "attivo");
          const nome = (params.assegnatario_nome as string).toLowerCase();
          const match = (profiles || []).find(
            (p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(nome) ||
                   (p.first_name || "").toLowerCase().includes(nome)
          );
          if (match) assignedTo = match.id;
        }

        // Resolve event name to event id
        let eventId: string | null = null;
        if (params.evento_nome) {
          const { data: evts } = await supabaseClient
            .from("events")
            .select("id, title")
            .ilike("title", `%${params.evento_nome}%`)
            .limit(1);
          if (evts && evts.length > 0) eventId = evts[0].id;
        }

        const { data, error } = await supabaseClient
          .from("tasks")
          .insert({
            title: params.titolo,
            assigned_to: assignedTo,
            due_date: params.scadenza || null,
            event_id: eventId,
            priority: params.priorita || "media",
            description: params.descrizione || null,
            status: "da_fare",
          })
          .select("id, title")
          .maybeSingle();

        if (error) throw new Error(error.message);
        result = data;
        break;
      }

      case "create_memo": {
        const { data, error } = await supabaseClient
          .from("calendar_items")
          .insert({
            title: params.titolo,
            start_date: params.data,
            start_time: params.ora || null,
            description: params.descrizione || "",
            item_type: "promemoria",
            user_id: userId,
          })
          .select("id, title")
          .maybeSingle();

        if (error) throw new Error(error.message);
        result = data;
        break;
      }

      case "update_task_status": {
        const { data, error } = await supabaseClient
          .from("tasks")
          .update({ status: params.nuovo_stato })
          .eq("id", params.task_id as string)
          .select("id, title, status")
          .maybeSingle();

        if (error) throw new Error(error.message);
        result = data;
        break;
      }

      case "create_event_draft": {
        const nome = sanitizeString(params.nome);
        const location = params.location ? sanitizeString(params.location) : "";
        const pax = typeof params.pax === "number" ? params.pax : 0;
        const budget = typeof params.budget === "number" ? params.budget : 0;

        const { data: evData, error: evErr } = await supabaseClient
          .from("events")
          .insert({
            id: crypto.randomUUID(),
            title: nome || "Nuovo evento",
            location: location,
            attendees: pax,
            budget: budget,
            status: "bozza",
            start_date: new Date().toISOString().split("T")[0],
            end_date: new Date().toISOString().split("T")[0],
            project_manager_id: userId,
          })
          .select("id, title")
          .maybeSingle();

        if (evErr) throw new Error(evErr.message);
        if (!evData) throw new Error("Evento non creato");

        // Link suppliers
        const fornitori = Array.isArray(params.fornitori) ? params.fornitori : [];
        let linkedCount = 0;
        for (const f of fornitori.slice(0, 20)) {
          const fObj = f as { id?: string; categoria?: string };
          if (!fObj.id) continue;
          const { error: linkErr } = await supabaseClient
            .from("event_suppliers")
            .insert({
              event_id: evData.id,
              supplier_id: fObj.id,
              service_category: fObj.categoria || null,
            });
          if (!linkErr) linkedCount++;
        }

        result = { event_id: evData.id, nome: evData.title, fornitori_collegati: linkedCount };
        break;
      }

      default:
        throw new Error(`Azione sconosciuta: ${action}`);
    }

    // Log success
    await supabaseClient.from("fly_actions_log").insert({
      user_id: userId,
      action_type: action,
      payload: params,
      status: "executed",
    });

    return { success: true, message: "Azione eseguita.", data: result };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Errore sconosciuto";

    // Log failure
    await supabaseClient.from("fly_actions_log").insert({
      user_id: userId,
      action_type: action,
      payload: params,
      status: "failed",
      error: errMsg,
    });

    return { success: false, message: errMsg };
  }
}

// ─── CONTEXT SUMMARIZATION ────────────────────────────────────────────

async function summarizeOldMessages(
  messages: AnthropicMessage[]
): Promise<AnthropicMessage[]> {
  if (messages.length <= 20) return messages;

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return messages.slice(-20);

  const toSummarize = messages.slice(0, messages.length - 10);
  const toKeep = messages.slice(messages.length - 10);

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: 512,
        system: "Riassumi questa conversazione in 3 righe in italiano, preservando i dati chiave citati (nomi, date, importi, decisioni prese). Restituisci SOLO il riassunto, nient'altro.",
        messages: [{ role: "user", content: toSummarize.map((m) => `[${m.role}]: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`).join("\n") }],
      }),
    });

    if (!res.ok) return messages.slice(-20);

    const result = await res.json();
    const summary = (result.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");

    if (!summary) return messages.slice(-20);

    return [
      { role: "user", content: `[Riassunto conversazione precedente]: ${summary}` },
      { role: "assistant", content: "Ho presente il contesto. Procediamo." },
      ...toKeep,
    ];
  } catch {
    return messages.slice(-20);
  }
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  let logOutcome = "success";
  let logError: string | undefined;
  let logUserId: string | undefined;
  let logInputTokens = 0;
  let logOutputTokens = 0;
  let logToolsCalled: string[] = [];

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

    logUserId = user.id;
    const userClient = getUserClient(token);

    // ─── FETCH USER ROLE ────────────────────────────────────────────────
    const { data: userProfile } = await adminClient
      .from("profiles")
      .select("role, first_name")
      .eq("id", user.id)
      .maybeSingle();
    const userRole = userProfile?.role || "User";
    const userFirstName = userProfile?.first_name || "";

    // ─── RATE LIMITING (20 req/min per user) ────────────────────────────
    const windowStart = new Date();
    windowStart.setSeconds(0, 0);
    const windowIso = windowStart.toISOString();

    await userClient
      .from("fly_rate_limits")
      .delete()
      .eq("user_id", user.id)
      .lt("window_start", new Date(Date.now() - 3600000).toISOString());

    const { data: rateRow } = await userClient
      .from("fly_rate_limits")
      .select("count")
      .eq("user_id", user.id)
      .eq("window_start", windowIso)
      .maybeSingle();

    if (rateRow && rateRow.count >= 20) {
      logOutcome = "rate_limited";
      return json(
        { error: "Fly ha bisogno di riprendere fiato: riprova tra qualche istante." },
        429
      );
    }

    if (rateRow) {
      await userClient
        .from("fly_rate_limits")
        .update({ count: rateRow.count + 1 })
        .eq("user_id", user.id)
        .eq("window_start", windowIso);
    } else {
      await userClient
        .from("fly_rate_limits")
        .insert({ user_id: user.id, window_start: windowIso, count: 1 });
    }

    // ─── DAILY RATE LIMITING (50 req/day per user) ──────────────────────
    const todayDate = todayISO();
    const { data: dayRow } = await userClient
      .from("fly_rate_limits")
      .select("day_count, day_date")
      .eq("user_id", user.id)
      .eq("window_start", windowIso)
      .maybeSingle();

    let currentDayCount = dayRow?.day_count ?? 0;
    const storedDate = dayRow?.day_date ?? null;

    if (storedDate !== todayDate) {
      currentDayCount = 0;
      await userClient
        .from("fly_rate_limits")
        .update({ day_count: 1, day_date: todayDate })
        .eq("user_id", user.id)
        .eq("window_start", windowIso);
    } else if (currentDayCount >= DAILY_LIMIT) {
      logOutcome = "daily_limit";
      return json(
        { error: "Hai raggiunto il limite giornaliero di 50 richieste a Fly. Riprova domani." },
        429
      );
    } else {
      await userClient
        .from("fly_rate_limits")
        .update({ day_count: currentDayCount + 1 })
        .eq("user_id", user.id)
        .eq("window_start", windowIso);
    }

    const { message, history, action, proposal: incomingProposal } = await req.json();

    // ─── EXECUTE CONFIRMED PROPOSAL ─────────────────────────────────────
    if (action === "execute" && incomingProposal) {
      const result = await executeProposal(incomingProposal, userClient, user.id);

      // Log to journal
      await userClient.from("fly_journal").insert({
        user_id: user.id,
        action_type: incomingProposal.action,
        proposal: incomingProposal,
        outcome: result.success ? "accepted" : "rejected",
        modification_note: null,
      }).then(() => {});

      return json(result);
    }

    // ─── JOURNAL: track modifications (user rephrase within 2 msgs) ────
    if (action === "journal" && incomingProposal) {
      await userClient.from("fly_journal").insert({
        user_id: user.id,
        action_type: incomingProposal.action_type || "correction",
        proposal: incomingProposal.proposal || null,
        outcome: incomingProposal.outcome || "modified",
        modification_note: incomingProposal.note || null,
      }).then(() => {});

      // Also update memory corrections
      const { data: mem } = await userClient
        .from("fly_memory")
        .select("corrections")
        .eq("user_id", user.id)
        .maybeSingle();

      if (mem) {
        const corrections = Array.isArray(mem.corrections) ? mem.corrections : [];
        corrections.push({ note: incomingProposal.note, at: new Date().toISOString() });
        const trimmed = corrections.slice(-20);
        await userClient.from("fly_memory").update({ corrections: trimmed, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      } else {
        await userClient.from("fly_memory").insert({
          user_id: user.id,
          corrections: [{ note: incomingProposal.note, at: new Date().toISOString() }],
        });
      }

      return json({ ok: true });
    }

    // ─── NORMAL CHAT FLOW ───────────────────────────────────────────────
    if (!message || typeof message !== "string") {
      return json({ error: "Campo 'message' obbligatorio" }, 400);
    }

    // ─── LOAD USER MEMORY ───────────────────────────────────────────────
    const { data: memory } = await userClient
      .from("fly_memory")
      .select("preferences, corrections, context")
      .eq("user_id", user.id)
      .maybeSingle();

    // ─── LOAD PERSISTENT ORGANIZATIONAL MEMORY ──────────────────────────
    const { data: persistentMemories } = await userClient
      .from("fly_persistent_memory")
      .select("categoria, chiave, valore")
      .order("categoria", { ascending: true })
      .order("chiave", { ascending: true });

    let memorySection = "";
    if (memory) {
      const parts: string[] = [];
      if (memory.preferences && Object.keys(memory.preferences).length > 0) {
        parts.push(`PREFERENZE UTENTE: ${JSON.stringify(memory.preferences)}`);
      }
      if (Array.isArray(memory.corrections) && memory.corrections.length > 0) {
        const recent = memory.corrections.slice(-3);
        parts.push(`CORREZIONI RECENTI: ${recent.map((c: any) => c.note || JSON.stringify(c)).join("; ")}`);
      }
      if (memory.context && Object.keys(memory.context).length > 0) {
        parts.push(`MAPPATURE NOTE: ${JSON.stringify(memory.context)}`);
      }
      if (parts.length > 0) {
        memorySection = `\n\nMEMORIA UTENTE:\n${parts.join("\n")}`;
      }
    }

    // Build persistent organizational memory section
    let persistentMemorySection = "";
    if (persistentMemories && persistentMemories.length > 0) {
      const grouped: Record<string, string[]> = {};
      for (const m of persistentMemories) {
        if (!grouped[m.categoria]) grouped[m.categoria] = [];
        grouped[m.categoria].push(`- ${m.chiave}: ${m.valore}`);
      }
      const sections = Object.entries(grouped).map(
        ([cat, items]) => `[${cat.toUpperCase()}]\n${items.join("\n")}`,
      );
      persistentMemorySection = `\n\nMEMORIA PERSISTENTE (conoscenza organizzativa):\n${sections.join("\n\n")}`;
    }

    const today = new Date().toLocaleDateString("it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const systemPrompt = `Sei Fly, Chief of Staff digitale di Simmetria Synergy (agenzia eventi corporate) E contemporaneamente il Chief Wellness Officer del team — ma in modo FUN, mai sterile.

PERSONALITA WELLNESS: Sei quel collega che:
- Roasta affettuosamente quando non prendi pause ("3 ore senza alzarti? Nemmeno la sedia ti sopporta piu")
- Celebra i win come fossero suoi ("BOOM! Margine al 28%? Champagne digitale per tutti!")
- Suggerisce pause con ironia ("Il tuo cervello sta inviando un SOS. Rispondi con 5 minuti di aria fresca")
- Nota quando il team e sotto pressione e interviene con leggerezza
- Usa metafore divertenti, mai il linguaggio HR corporate noioso
- Se il mood e basso, non fa il coach motivazionale — fa il collega che ti porta il caffe

QUANDO USARE IL TONO WELLNESS:
- Se l'utente chiede "come stai" o simili -> rispondi con check-in wellness divertente
- Se noti molti task urgenti / scadenze imminenti -> aggiungi una battuta di supporto
- Se l'utente lavora da molto -> suggerisci pausa con stile
- Se ci sono buone notizie (margini alti, task completati) -> celebra esageratamente
- MAI quando l'utente chiede dati precisi e ha fretta — li capisci dal tono

TONO GENERALE: Rispondi in italiano, sintetico e preciso. Usa i tool per dati reali, non inventare mai. Segnala criticita. Non decidere: proponi. Aggiungi personalita senza sacrificare la sostanza.

STILE: max 5 voci negli elenchi, chiudi con "...e altri N". No tabelle, no markdown pesante. Una frase di risposta, poi solo dettagli utili. Usa sempre i campi *_nome (cliente_nome, pm_nome, assegnato_a_nome, evento_nome, responsabile_nome) al posto degli ID nelle risposte all'utente.

AZIONI: usa tool propose_* per proposte. Presenta riepilogo e chiedi conferma. Mai scrivere nel DB senza conferma.

ENTITIES_JSON: chiudi la risposta con ENTITIES_JSON: [...] se citi entita specifiche (max 5, type: event/supplier/task/client).
PROPOSAL_JSON: dopo propose_event, chiudi con PROPOSAL_JSON:{...} (nome, location, pax, budget, giorni, fornitori).

Dossier = processi burocratici (tabella "dossiers"), non confondere con eventi.
Oggi: ${today}.

RUOLO UTENTE: ${userRole}${userFirstName ? ` (${userFirstName})` : ""}.
REGOLE PER RUOLO:
- Commerciale: focalizzati su clienti, opportunita, presentazioni, lead, deal. NON mostrare costi interni, margini, budget fornitori, fee agenzia. Se chiede dati economici interni, rispondi che non ha accesso a queste informazioni.
- Amministrazione: focalizzati su liquidita, pagamenti in scadenza, incassi, DSO/DPO, fatture, cash flow. Mostra tutti i numeri economici.
- Regista: focalizzati su programma, scaletta, fornitori tecnici (AV, allestimenti, staff), timeline dell'evento. Non mostrare dati finanziari o commerciali.
- Project Manager / Senior PM: focalizzati su eventi assegnati, task, fornitori, budget del loro evento, programma, team. Possono vedere i numeri dei loro eventi.
- Admin / Super Admin: accesso completo a tutto, nessuna restrizione.
- User / altri: accesso base, non mostrare dati finanziari sensibili.

REGOLE DOCUMENTI:
- Usa search_documents quando l'utente chiede cosa dice un documento caricato, un brief, contratto, preventivo, presentazione, PDF o allegato.
- Non affermare mai di aver letto un documento senza aver usato il tool.
- Rispondi solo basandoti su exact_content quando discuti fatti documentali.
- Cita ogni affermazione materiale derivata da un documento inline.
- Formato citazione con pagina: [Fonte: <file_name>, pag. <page_number>]
- Formato citazione senza pagina: [Fonte: <file_name>, contenuto <chunk_index>]
- Non inventare numeri di pagina, nomi di sezione o citazioni.
- Distingui chiaramente fatti dalle deduzioni.
- Se i risultati non bastano: "Non trovo questa informazione nei documenti accessibili."
- Non colmare lacune con conoscenza generale salvo esplicito avviso che si tratta di un suggerimento generico.
- Non rivelare documenti non restituiti dal tool user-scoped.
- Non citare testi eccessivamente lunghi; usa brevi estratti e parafrasi concise con citazione.
- Se documenti diversi sono in conflitto, segnala il conflitto e cita entrambe le fonti.

REGOLE PRESENTAZIONI CREATIVE:
- Quando l'utente chiede a Fly di preparare una presentazione per un progetto Creative Studio esistente, chiama PRIMA get_creative_presentation_context.
- Se nessun progetto e identificabile dal contesto, chiedi all'utente quale progetto usare.
- Seleziona UNO SOLO dei compatible_templates restituiti dallo strumento.
- Puoi usare search_documents con event_id/client_id restituiti quando servono evidenze documentali.
- Prepara valori SOLO per le chiavi in placeholder_keys del template selezionato.
- Identifica chiaramente le informazioni mancanti invece di inventarle.
- Restituisci sempre una bozza strutturata contenente: selected_template_id, selected_template_name, draft_values, missing_information, sources_used.
- NON invocare mai creative-generate-pptx e NON dichiarare mai che un PPTX e stato generato.
- La conferma umana resta OBBLIGATORIA prima di qualsiasi generazione.${memorySection}${persistentMemorySection}`;

    // ─── BUILD MESSAGES WITH CONTEXT MANAGEMENT ─────────────────────────
    const messages: AnthropicMessage[] = [];

    if (Array.isArray(history)) {
      for (const h of history) {
        if (h.role === "user" || h.role === "assistant") {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }

    messages.push({ role: "user", content: message });

    // ─── CACHE CHECK ────────────────────────────────────────────────────
    const DOC_QUERY_KEYWORDS = ["documento", "file", "allegato", "pdf", "contratto", "brief", "presentazione", "cosa dice", "caricato", "preventivo", "fattura"];
    const CREATIVE_PRES_KEYWORDS = ["presentazione", "pptx", "slide", "template creativo", "genera presentazione", "prepara presentazione", "bozza presentazione"];
    const messageLower = message.toLowerCase();
    const isDocumentQuery = DOC_QUERY_KEYWORDS.some(kw => messageLower.includes(kw));
    const isCreativePresentationQuery = CREATIVE_PRES_KEYWORDS.some(kw => messageLower.includes(kw));

    const queryHash = btoa(unescape(encodeURIComponent(message.slice(0, 100))));
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

    // Clean stale cache entries (> 2 hours)
    userClient
      .from("fly_cache")
      .delete()
      .eq("user_id", user.id)
      .lt("created_at", new Date(Date.now() - 7200000).toISOString())
      .then(() => {});

    let cached: { response: string } | null = null;
    if (!isDocumentQuery && !isCreativePresentationQuery) {
      const { data } = await userClient
        .from("fly_cache")
        .select("response")
        .eq("user_id", user.id)
        .eq("query_hash", queryHash)
        .gte("created_at", oneHourAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      cached = data;
    }

    if (cached?.response && (!Array.isArray(history) || history.length === 0)) {
      // Return cached response as SSE stream
      const encoder = new TextEncoder();
      const cachedStream = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: cached.response })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "meta", entities: [], proposal: null, eventProposal: null })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(cachedStream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // ─── MODEL ROUTING ──────────────────────────────────────────────────
    const selectedModel = pickModel(message);

    // Summarize if history is too long
    const processedMessages = await summarizeOldMessages(messages);

    const { text: reply, proposal, inputTokens, outputTokens, toolsCalled } =
      await callAnthropic(processedMessages, systemPrompt, userClient, selectedModel);

    logInputTokens = inputTokens;
    logOutputTokens = outputTokens;
    logToolsCalled = toolsCalled;

    // Parse ENTITIES_JSON and PROPOSAL_JSON from the reply
    let textReply = reply;
    let entities: unknown[] = [];
    let eventProposal: unknown = null;

    // Extract PROPOSAL_JSON first (it comes after ENTITIES_JSON)
    const proposalJsonMatch = textReply.match(/\n?PROPOSAL_JSON:(\{[\s\S]*?\})\s*$/);
    if (proposalJsonMatch) {
      textReply = textReply.slice(0, proposalJsonMatch.index).trimEnd();
      try {
        eventProposal = JSON.parse(proposalJsonMatch[1]);
      } catch {}
    }

    const entitiesMatch = textReply.match(/\nENTITIES_JSON:\s*(\[[\s\S]*?\])\s*$/);
    if (entitiesMatch) {
      textReply = textReply.slice(0, entitiesMatch.index).trimEnd();
      try {
        entities = JSON.parse(entitiesMatch[1]);
      } catch {}
    }

    // ─── SAVE TO CACHE (fire-and-forget) ─────────────────────────────────
    const usedDocSearch = logToolsCalled.includes("search_documents");
    const usedCreativePresContext = logToolsCalled.includes("get_creative_presentation_context");
    if (textReply && !proposal && !isDocumentQuery && !usedDocSearch && !isCreativePresentationQuery && !usedCreativePresContext) {
      userClient
        .from("fly_cache")
        .insert({ user_id: user.id, query_hash: queryHash, response: textReply })
        .then(() => {});
    }

    // ─── SSE STREAMING RESPONSE ──────────────────────────────────────────
    const words = textReply.split(/(\s+)/);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Stream words in small chunks
        const chunkSize = 3;
        for (let i = 0; i < words.length; i += chunkSize) {
          const chunk = words.slice(i, i + chunkSize).join("");
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: chunk })}\n\n`));
          await new Promise(r => setTimeout(r, 30));
        }
        // Send metadata (entities + proposal) as a final event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "meta", entities, proposal: proposal || null, eventProposal: eventProposal || null })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("fly-gateway error:", err);
    logOutcome = "error";
    logError = msg;
    return json({ error: msg }, 500);
  } finally {
    // ─── WRITE LOG (fire-and-forget) ──────────────────────────────────
    const durationMs = Date.now() - startTime;
    const costInput = logInputTokens * 0.000003;
    const costOutput = logOutputTokens * 0.000015;
    const estimatedCost = Math.round((costInput + costOutput) * 1_000_000) / 1_000_000;

    if (logUserId) {
      const adminUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const logClient = createClient(adminUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      logClient.from("fly_logs").insert({
        user_id: logUserId,
        duration_ms: durationMs,
        input_tokens: logInputTokens,
        output_tokens: logOutputTokens,
        estimated_cost_eur: estimatedCost,
        tools_called: logToolsCalled,
        outcome: logOutcome,
        error: logError || null,
      }).then(() => {});
    }
  }
});
