import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const CHUNK_TARGET = 1500;
const CHUNK_OVERLAP = 200;
const CLAUDE_MODEL = "claude-sonnet-4-6";
const CLAUDE_TEXT_CAP = 80_000; // max chars sent to Claude for office text analysis

// ─── Types ──────────────────────────────────────────────────────────────────

interface ClaudeAnalysis {
  extracted_text: string;
  summary: string;
  sections: { label: string; content: string; page?: number }[];
  entities: string[];
  dates: string[];
  amounts: string[];
  companies: string[];
  people: string[];
  action_items: string[];
  language: string;
}

// ─── Response helpers ───────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

// ─── Base64 encoding (chunked, no per-byte array) ───────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 32768;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

// ─── SHA-256 ────────────────────────────────────────────────────────────────

async function sha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Chunking ───────────────────────────────────────────────────────────────

function chunkText(
  text: string,
  sections?: { label: string; content: string; page?: number }[]
): { content: string; section_label: string | null; page_number: number | null }[] {
  const chunks: { content: string; section_label: string | null; page_number: number | null }[] = [];

  if (sections && sections.length > 0) {
    for (const section of sections) {
      const sectionChunks = splitIntoChunks(section.content);
      for (const c of sectionChunks) {
        if (c.trim().length > 0) {
          chunks.push({
            content: c.trim(),
            section_label: section.label || null,
            page_number: section.page ?? null,
          });
        }
      }
    }
  } else {
    const rawChunks = splitIntoChunks(text);
    for (const c of rawChunks) {
      if (c.trim().length > 0) {
        chunks.push({ content: c.trim(), section_label: null, page_number: null });
      }
    }
  }

  return chunks;
}

function splitIntoChunks(text: string): string[] {
  if (!text || text.trim().length === 0) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_TARGET + 300, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastParagraph = slice.lastIndexOf("\n\n");
      const lastSentence = slice.lastIndexOf(". ");
      const lastNewline = slice.lastIndexOf("\n");
      if (lastParagraph > CHUNK_TARGET * 0.6) {
        end = start + lastParagraph + 2;
      } else if (lastSentence > CHUNK_TARGET * 0.6) {
        end = start + lastSentence + 2;
      } else if (lastNewline > CHUNK_TARGET * 0.6) {
        end = start + lastNewline + 1;
      }
    }
    const chunk = text.slice(start, end);
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
    start = end - CHUNK_OVERLAP;
    if (start < 0) start = 0;
    if (end >= text.length) break;
  }
  return chunks;
}

// ─── File type detection ────────────────────────────────────────────────────

function getMediaType(fileType: string): string | null {
  const map: Record<string, string> = {
    "application/pdf": "application/pdf",
    "image/jpeg": "image/jpeg",
    "image/png": "image/png",
    "image/jpg": "image/jpeg",
  };
  return map[fileType.toLowerCase()] || null;
}

function isTextFile(fileType: string): boolean {
  return fileType.startsWith("text/") || fileType === "text/csv" || fileType === "text/plain";
}

function isOfficeFile(fileType: string): boolean {
  return (
    fileType.includes("wordprocessingml") ||
    fileType.includes("spreadsheetml") ||
    fileType.includes("presentationml") ||
    fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    fileType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );
}

function isLegacyOffice(fileType: string): boolean {
  return (
    fileType === "application/msword" ||
    fileType === "application/vnd.ms-excel" ||
    fileType === "application/vnd.ms-powerpoint"
  );
}

function isPdfOrImage(fileType: string): boolean {
  return fileType === "application/pdf" || fileType.startsWith("image/");
}

// ─── Claude API: PDF/Image analysis ────────────────────────────────────────

async function analyzeFileWithClaude(
  fileBytes: Uint8Array,
  fileType: string,
  fileName: string
): Promise<ClaudeAnalysis> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Chiave ANTHROPIC_API_KEY non configurata sul server");

  const base64 = uint8ToBase64(fileBytes);
  const mediaType = getMediaType(fileType);
  const isPdf = fileType === "application/pdf";
  const isImage = fileType.startsWith("image/");

  const prompt = isPdf
    ? `Analizza questo documento PDF ("${fileName}"). Rispondi ESCLUSIVAMENTE con un JSON valido senza markdown. Non inventare informazioni non presenti nel documento.`
    : `Analizza questa immagine ("${fileName}"). Estrai tutto il testo visibile e descrivi il contenuto. Rispondi ESCLUSIVAMENTE con un JSON valido senza markdown. Non inventare informazioni non presenti.`;

  const schema = `
Schema JSON richiesto:
{
  "extracted_text": "testo completo estratto dal documento",
  "summary": "sintesi del contenuto in italiano, massimo 500 parole",
  "sections": [{"label": "nome sezione", "content": "testo della sezione", "page": 1}],
  "entities": ["entita rilevanti menzionate"],
  "dates": ["date trovate nel documento"],
  "amounts": ["importi monetari trovati"],
  "companies": ["aziende/organizzazioni menzionate"],
  "people": ["persone menzionate"],
  "action_items": ["azioni o impegni identificati"],
  "language": "lingua principale del documento"
}`;

  let content: unknown[];
  if (isPdf) {
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
      { type: "text", text: prompt + "\n" + schema },
    ];
  } else if (isImage && mediaType) {
    content = [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      { type: "text", text: prompt + "\n" + schema },
    ];
  } else {
    throw new Error("Tipo file non supportato per analisi Claude");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Errore API Claude (${response.status}): ${errText.slice(0, 300)}`);
  }

  const result = await response.json();

  // Check for stop reason indicating truncation
  if (result.stop_reason === "max_tokens") {
    throw new Error("Analisi interrotta: il documento e troppo lungo e Claude ha raggiunto il limite di token. Provare con un documento piu breve.");
  }

  const textBlock = result.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("Nessuna risposta testuale ricevuta da Claude");

  return parseClaudeJson(textBlock.text);
}

// ─── Claude API: Text analysis (for Office documents) ───────────────────────

async function analyzeTextWithClaude(
  text: string,
  fileName: string
): Promise<Omit<ClaudeAnalysis, "extracted_text">> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Chiave ANTHROPIC_API_KEY non configurata sul server");

  const cappedText = text.length > CLAUDE_TEXT_CAP ? text.slice(0, CLAUDE_TEXT_CAP) : text;

  const prompt = `Analizza il seguente testo estratto dal file "${fileName}" (${cappedText.length} caratteri${text.length > CLAUDE_TEXT_CAP ? ", troncato per limiti di elaborazione" : ""}). Rispondi ESCLUSIVAMENTE con un JSON valido senza markdown. Non inventare informazioni non presenti nel testo.

Schema JSON richiesto:
{
  "summary": "sintesi del contenuto in italiano, massimo 500 parole",
  "sections": [{"label": "nome sezione", "content": "testo della sezione"}],
  "entities": ["entita rilevanti menzionate"],
  "dates": ["date trovate"],
  "amounts": ["importi monetari trovati"],
  "companies": ["aziende/organizzazioni menzionate"],
  "people": ["persone menzionate"],
  "action_items": ["azioni o impegni identificati"],
  "language": "lingua principale del testo"
}

TESTO:
${cappedText}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Errore API Claude (${response.status}): ${errText.slice(0, 300)}`);
  }

  const result = await response.json();

  if (result.stop_reason === "max_tokens") {
    throw new Error("Analisi interrotta: il testo e troppo lungo e Claude ha raggiunto il limite di token.");
  }

  const textBlock = result.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("Nessuna risposta testuale ricevuta da Claude");

  const parsed = parseClaudeJson(textBlock.text);
  return {
    summary: parsed.summary,
    sections: parsed.sections,
    entities: parsed.entities,
    dates: parsed.dates,
    amounts: parsed.amounts,
    companies: parsed.companies,
    people: parsed.people,
    action_items: parsed.action_items,
    language: parsed.language,
  };
}

// ─── Parse Claude JSON safely ───────────────────────────────────────────────

function parseClaudeJson(raw: string): ClaudeAnalysis {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Risposta Claude non e un JSON valido. L'analisi potrebbe essere stata troncata.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Risposta Claude non e un oggetto JSON valido.");
  }

  return {
    extracted_text: typeof parsed.extracted_text === "string" ? parsed.extracted_text : "",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    dates: Array.isArray(parsed.dates) ? parsed.dates : [],
    amounts: Array.isArray(parsed.amounts) ? parsed.amounts : [],
    companies: Array.isArray(parsed.companies) ? parsed.companies : [],
    people: Array.isArray(parsed.people) ? parsed.people : [],
    action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
    language: typeof parsed.language === "string" ? parsed.language : "it",
  };
}

// ─── Office text extraction (local) ────────────────────────────────────────

function extractTextLocal(fileBytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(fileBytes);
}

async function extractDocx(fileBytes: Uint8Array): Promise<string> {
  const { default: JSZip } = await import("npm:jszip@3.10.1");
  const zip = await JSZip.loadAsync(fileBytes);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) return "";
  return docXml
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractXlsx(fileBytes: Uint8Array): Promise<string> {
  const { default: JSZip } = await import("npm:jszip@3.10.1");
  const zip = await JSZip.loadAsync(fileBytes);

  const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const strings: string[] = [];
  if (sharedStringsXml) {
    const matches = sharedStringsXml.matchAll(/<t[^>]*>([^<]*)<\/t>/g);
    for (const m of matches) {
      strings.push(m[1]);
    }
  }

  const lines: string[] = [];
  const sheetFiles = Object.keys(zip.files)
    .filter((f) => f.match(/^xl\/worksheets\/sheet\d+\.xml$/))
    .sort();
  for (const sheetFile of sheetFiles.slice(0, 5)) {
    const xml = await zip.file(sheetFile)?.async("string");
    if (!xml) continue;
    const rows = xml.matchAll(/<row[^>]*>(.*?)<\/row>/gs);
    for (const row of rows) {
      const cells = row[1].matchAll(/<c[^>]*(?:t="s"[^>]*)?>(.*?)<\/c>/gs);
      const rowValues: string[] = [];
      for (const cell of cells) {
        const vMatch = cell[1].match(/<v>(\d+)<\/v>/);
        if (vMatch && cell[0].includes('t="s"')) {
          const idx = parseInt(vMatch[1]);
          rowValues.push(strings[idx] || "");
        } else if (vMatch) {
          rowValues.push(vMatch[1]);
        }
      }
      if (rowValues.length > 0) lines.push(rowValues.join("\t"));
    }
  }
  return lines.join("\n").trim();
}

async function extractPptx(fileBytes: Uint8Array): Promise<string> {
  const { default: JSZip } = await import("npm:jszip@3.10.1");
  const zip = await JSZip.loadAsync(fileBytes);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort();

  const parts: string[] = [];
  for (const slideFile of slideFiles) {
    const xml = await zip.file(slideFile)?.async("string");
    if (!xml) continue;
    const text = xml
      .replace(/<a:br[^>]*\/>/g, "\n")
      .replace(/<\/a:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .trim();
    if (text) parts.push(text);
  }
  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Mark error helper ──────────────────────────────────────────────────────

async function markError(
  serviceClient: ReturnType<typeof createClient>,
  documentId: string,
  message: string
): Promise<void> {
  await serviceClient
    .from("documents")
    .update({
      analysis_status: "errore",
      analysis_error: message.slice(0, 500),
    })
    .eq("id", documentId);
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Parse body ONCE, keep documentId available for error handling
  let documentId: string | null = null;
  let force = false;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    documentId = typeof body.document_id === "string" ? body.document_id : null;
    force = body.force === true;
  } catch {
    return errorResponse("Corpo della richiesta non valido");
  }

  if (!documentId) return errorResponse("document_id e obbligatorio");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceKey);

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Autenticazione richiesta", 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return errorResponse("Non autorizzato", 401);

    // Load document through user RLS
    const { data: doc, error: docErr } = await userClient
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();

    if (docErr || !doc) return errorResponse("Documento non trovato o accesso negato", 404);

    // Mark in_elaborazione
    await serviceClient
      .from("documents")
      .update({ analysis_status: "in_elaborazione", analysis_error: null })
      .eq("id", documentId);

    // Download from storage
    const { data: fileData, error: storageErr } = await serviceClient.storage
      .from("documents")
      .download(doc.file_path);

    if (storageErr || !fileData) {
      await markError(serviceClient, documentId, "File non scaricabile dal bucket di archiviazione");
      return errorResponse("Impossibile scaricare il file");
    }

    const fileBytes = new Uint8Array(await fileData.arrayBuffer());

    // Size check
    if (fileBytes.length > MAX_FILE_SIZE) {
      await markError(serviceClient, documentId, "File troppo grande (limite: 25 MB)");
      return errorResponse("Il file supera il limite di 25 MB");
    }

    // Hash
    const hash = await sha256(fileBytes);
    if (doc.content_hash === hash && !force) {
      await serviceClient
        .from("documents")
        .update({ analysis_status: "elaborato" })
        .eq("id", documentId);
      return jsonResponse({ status: "already_processed", document_id: documentId });
    }

    const fileType = (doc.file_type || "").toLowerCase();

    // Legacy Office: not supported
    if (isLegacyOffice(fileType)) {
      await serviceClient
        .from("documents")
        .update({
          analysis_status: "non_supportato",
          analysis_error: "Formato legacy (DOC/XLS/PPT) non supportato. Convertire in formato OOXML (DOCX/XLSX/PPTX).",
          content_hash: hash,
        })
        .eq("id", documentId);
      return jsonResponse({ status: "non_supportato", document_id: documentId, reason: "Formato legacy non supportato" });
    }

    let extractedText = "";
    let summary = "";
    let sections: { label: string; content: string; page?: number }[] = [];
    let metadata: Record<string, unknown> = {};

    if (isPdfOrImage(fileType)) {
      // Claude vision/document analysis
      const analysis = await analyzeFileWithClaude(fileBytes, fileType, doc.file_name);
      extractedText = analysis.extracted_text;
      summary = analysis.summary;
      sections = analysis.sections;
      metadata = {
        entities: analysis.entities,
        dates: analysis.dates,
        amounts: analysis.amounts,
        companies: analysis.companies,
        people: analysis.people,
        action_items: analysis.action_items,
        language: analysis.language,
      };
    } else if (isTextFile(fileType)) {
      // Local text extraction + Claude analysis
      extractedText = extractTextLocal(fileBytes);
      if (extractedText.trim().length > 0) {
        const analysis = await analyzeTextWithClaude(extractedText, doc.file_name);
        summary = analysis.summary;
        sections = analysis.sections;
        metadata = {
          entities: analysis.entities,
          dates: analysis.dates,
          amounts: analysis.amounts,
          companies: analysis.companies,
          people: analysis.people,
          action_items: analysis.action_items,
          language: analysis.language,
        };
      }
    } else if (isOfficeFile(fileType)) {
      // Local extraction then Claude analysis on text
      if (fileType.includes("wordprocessingml")) {
        extractedText = await extractDocx(fileBytes);
      } else if (fileType.includes("spreadsheetml")) {
        extractedText = await extractXlsx(fileBytes);
      } else if (fileType.includes("presentationml")) {
        extractedText = await extractPptx(fileBytes);
      }

      if (!extractedText || extractedText.trim().length === 0) {
        await markError(serviceClient, documentId, "Impossibile estrarre testo dal file Office");
        return errorResponse("Impossibile estrarre testo dal file Office");
      }

      const analysis = await analyzeTextWithClaude(extractedText, doc.file_name);
      summary = analysis.summary;
      sections = analysis.sections;
      metadata = {
        entities: analysis.entities,
        dates: analysis.dates,
        amounts: analysis.amounts,
        companies: analysis.companies,
        people: analysis.people,
        action_items: analysis.action_items,
        language: analysis.language,
      };
    } else {
      await serviceClient
        .from("documents")
        .update({
          analysis_status: "non_supportato",
          analysis_error: `Tipo file non supportato: ${fileType}`,
          content_hash: hash,
        })
        .eq("id", documentId);
      return jsonResponse({ status: "non_supportato", document_id: documentId, reason: `Tipo non supportato: ${fileType}` });
    }

    // Build chunks
    const chunks = chunkText(extractedText, sections.length > 0 ? sections : undefined);

    // Atomic chunk replacement via RPC
    if (chunks.length > 0) {
      const chunksPayload = chunks.map((c, i) => ({
        chunk_index: i,
        content: c.content,
        section_label: c.section_label,
        page_number: c.page_number,
        metadata: {},
      }));

      const { error: rpcErr } = await serviceClient.rpc("replace_document_chunks", {
        p_document_id: documentId,
        p_chunks: chunksPayload,
      });

      if (rpcErr) {
        await markError(serviceClient, documentId, "Errore durante il salvataggio dei chunk: " + (rpcErr.message || "sconosciuto").slice(0, 400));
        return errorResponse("Errore durante il salvataggio dei chunk");
      }
    }

    // Mark as elaborato
    await serviceClient
      .from("documents")
      .update({
        analysis_status: "elaborato",
        analysis_error: null,
        analyzed_at: new Date().toISOString(),
        content_hash: hash,
        summary,
        extracted_text: extractedText,
        analysis_metadata: metadata,
      })
      .eq("id", documentId);

    return jsonResponse({
      status: "elaborato",
      document_id: documentId,
      chunks_created: chunks.length,
      summary_length: summary.length,
    });
  } catch (err) {
    const message = (err as Error).message || "Errore interno sconosciuto";
    // Always mark errore so we never leave in_elaborazione
    await markError(serviceClient, documentId!, message);
    return errorResponse(message, 500);
  }
});
