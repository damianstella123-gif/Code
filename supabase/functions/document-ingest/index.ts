import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const CHUNK_TARGET = 1500; // ~1200-1800 chars
const CHUNK_OVERLAP = 200;

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

async function sha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
  return (
    fileType.startsWith("text/") ||
    fileType === "text/csv" ||
    fileType === "text/plain"
  );
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

// ─── Claude API call ────────────────────────────────────────────────────────

async function analyzeWithClaude(
  fileBytes: Uint8Array,
  fileType: string,
  fileName: string
): Promise<ClaudeAnalysis> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const base64 = btoa(
    Array.from(fileBytes)
      .map((b) => String.fromCharCode(b))
      .join("")
  );

  const mediaType = getMediaType(fileType);
  const isPdf = fileType === "application/pdf";
  const isImage = fileType.startsWith("image/");

  let content: unknown[];

  if (isPdf) {
    content = [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      },
      {
        type: "text",
        text: `Analizza questo documento PDF ("${fileName}"). Rispondi ESCLUSIVAMENTE con un JSON valido senza markdown. Non inventare informazioni non presenti nel documento.

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
}`,
      },
    ];
  } else if (isImage && mediaType) {
    content = [
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      },
      {
        type: "text",
        text: `Analizza questa immagine ("${fileName}"). Estrai tutto il testo visibile e descrivi il contenuto. Rispondi ESCLUSIVAMENTE con un JSON valido senza markdown. Non inventare informazioni non presenti.

Schema JSON richiesto:
{
  "extracted_text": "tutto il testo visibile nell'immagine",
  "summary": "descrizione del contenuto in italiano",
  "sections": [{"label": "descrizione area", "content": "testo/contenuto di quell'area"}],
  "entities": ["entita rilevanti"],
  "dates": ["date trovate"],
  "amounts": ["importi trovati"],
  "companies": ["aziende/organizzazioni"],
  "people": ["persone"],
  "action_items": ["azioni identificate"],
  "language": "lingua del contenuto"
}`,
      },
    ];
  } else {
    throw new Error("File type not supported for Claude analysis");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const result = await response.json();
  const textBlock = result.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("No text response from Claude");

  let parsed: ClaudeAnalysis;
  try {
    let raw = textBlock.text.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Failed to parse Claude JSON response");
  }

  return {
    extracted_text: parsed.extracted_text || "",
    summary: parsed.summary || "",
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    dates: Array.isArray(parsed.dates) ? parsed.dates : [],
    amounts: Array.isArray(parsed.amounts) ? parsed.amounts : [],
    companies: Array.isArray(parsed.companies) ? parsed.companies : [],
    people: Array.isArray(parsed.people) ? parsed.people : [],
    action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
    language: parsed.language || "it",
  };
}

// ─── Text extraction for local types ────────────────────────────────────────

function extractTextLocal(fileBytes: Uint8Array, fileType: string): string {
  if (isTextFile(fileType)) {
    return new TextDecoder("utf-8").decode(fileBytes);
  }
  return "";
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
  const sheetFiles = Object.keys(zip.files).filter((f) =>
    f.match(/^xl\/worksheets\/sheet\d+\.xml$/)
  );
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

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Authorization required", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const body = await req.json();
    const { document_id, force } = body;
    if (!document_id) return errorResponse("document_id is required");

    // Load document (through user's RLS)
    const { data: doc, error: docErr } = await userClient
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .maybeSingle();

    if (docErr || !doc) return errorResponse("Document not found or access denied", 404);

    // Service client for writes (bypasses RLS)
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Set in_elaborazione
    await serviceClient
      .from("documents")
      .update({ analysis_status: "in_elaborazione", analysis_error: null })
      .eq("id", document_id);

    // Download file from storage
    const { data: fileData, error: storageErr } = await serviceClient.storage
      .from("documents")
      .download(doc.file_path);

    if (storageErr || !fileData) {
      await serviceClient
        .from("documents")
        .update({ analysis_status: "errore", analysis_error: "File non scaricabile dal bucket" })
        .eq("id", document_id);
      return errorResponse("Failed to download file from storage");
    }

    const fileBytes = new Uint8Array(await fileData.arrayBuffer());

    // Check size
    if (fileBytes.length > MAX_FILE_SIZE) {
      await serviceClient
        .from("documents")
        .update({ analysis_status: "errore", analysis_error: "File troppo grande (max 25 MB)" })
        .eq("id", document_id);
      return errorResponse("File exceeds 25 MB limit");
    }

    // Compute hash
    const hash = await sha256(fileBytes);
    if (doc.content_hash === hash && !force) {
      await serviceClient
        .from("documents")
        .update({ analysis_status: "elaborato" })
        .eq("id", document_id);
      return jsonResponse({ status: "already_processed", document_id });
    }

    const fileType = (doc.file_type || "").toLowerCase();

    // Legacy office: mark as non_supportato
    if (isLegacyOffice(fileType)) {
      await serviceClient
        .from("documents")
        .update({
          analysis_status: "non_supportato",
          analysis_error: "Formato legacy (DOC/XLS/PPT) non supportato. Convertire in formato OOXML.",
          content_hash: hash,
        })
        .eq("id", document_id);
      return jsonResponse({ status: "non_supportato", document_id, reason: "legacy_format" });
    }

    let extractedText = "";
    let summary = "";
    let sections: { label: string; content: string; page?: number }[] = [];
    let metadata: Record<string, unknown> = {};

    if (isPdfOrImage(fileType)) {
      // Use Claude for PDF and images
      const analysis = await analyzeWithClaude(fileBytes, fileType, doc.file_name);
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
      extractedText = extractTextLocal(fileBytes, fileType);
      summary = extractedText.slice(0, 500) + (extractedText.length > 500 ? "..." : "");
    } else if (isOfficeFile(fileType)) {
      if (fileType.includes("wordprocessingml")) {
        extractedText = await extractDocx(fileBytes);
      } else if (fileType.includes("spreadsheetml")) {
        extractedText = await extractXlsx(fileBytes);
      } else if (fileType.includes("presentationml")) {
        extractedText = await extractPptx(fileBytes);
      }
      if (!extractedText) {
        await serviceClient
          .from("documents")
          .update({
            analysis_status: "errore",
            analysis_error: "Impossibile estrarre testo dal file Office",
            content_hash: hash,
          })
          .eq("id", document_id);
        return errorResponse("Could not extract text from Office file");
      }
      summary = extractedText.slice(0, 500) + (extractedText.length > 500 ? "..." : "");
    } else {
      await serviceClient
        .from("documents")
        .update({
          analysis_status: "non_supportato",
          analysis_error: `Tipo file non supportato: ${fileType}`,
          content_hash: hash,
        })
        .eq("id", document_id);
      return jsonResponse({ status: "non_supportato", document_id, reason: "unsupported_type" });
    }

    // Create chunks
    const chunks = chunkText(extractedText, sections.length > 0 ? sections : undefined);

    // Atomic replacement: delete old chunks then insert new
    await serviceClient
      .from("document_chunks")
      .delete()
      .eq("document_id", document_id);

    if (chunks.length > 0) {
      const rows = chunks.map((c, i) => ({
        document_id,
        chunk_index: i,
        content: c.content,
        section_label: c.section_label,
        page_number: c.page_number,
        metadata: {},
      }));

      const { error: insertErr } = await serviceClient
        .from("document_chunks")
        .insert(rows);

      if (insertErr) {
        await serviceClient
          .from("documents")
          .update({ analysis_status: "errore", analysis_error: "Errore inserimento chunk: " + insertErr.message })
          .eq("id", document_id);
        return errorResponse("Failed to insert chunks");
      }
    }

    // Update document as elaborato
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
      .eq("id", document_id);

    return jsonResponse({
      status: "elaborato",
      document_id,
      chunks_created: chunks.length,
      summary_length: summary.length,
    });
  } catch (err) {
    // Try to update status to errore if we have the document_id
    try {
      const body = await req.clone().json().catch(() => null);
      if (body?.document_id) {
        const serviceClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await serviceClient
          .from("documents")
          .update({
            analysis_status: "errore",
            analysis_error: (err as Error).message?.slice(0, 500) || "Errore sconosciuto",
          })
          .eq("id", body.document_id);
      }
    } catch { /* best effort */ }

    return errorResponse((err as Error).message || "Internal error", 500);
  }
});
