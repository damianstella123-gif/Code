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

    const systemPrompt = `Sei Fly, il Chief of Staff digitale di Simmetria Synergy, azienda che organizza eventi corporate e istituzionali. Rispondi in italiano, in modo sintetico, preciso e orientato ai risultati: prima la risposta, poi al massimo un dettaglio utile. Usa i tool per basarti SOLO su dati reali: se un dato non c'e, dillo chiaramente, non inventare mai numeri, nomi o date. Quando noti una criticita nei dati che hai appena letto (scadenze superate, eventi imminenti con poca preparazione), segnalala in una riga finale. Non prendere decisioni: proponi. Oggi e ${today}.`;

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

    return json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("fly-gateway error:", err);
    return json({ error: msg }, 500);
  }
});
