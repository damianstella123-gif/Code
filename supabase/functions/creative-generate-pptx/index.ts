import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_VALUE_LENGTH = 20_000;
const MAX_VALUES_BYTES = 200 * 1024;
const MAX_OUTPUT_SIZE = 50 * 1024 * 1024;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errJson(message: string, status: number) {
  return json({ error: message }, status);
}

function getUserClient(token: string) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function replacePlaceholders(
  xml: string,
  values: Record<string, string>,
  replacementCounts: Record<string, number>,
): string {
  const placeholderPattern = /(<a:t(?:\s[^>]*)?>)(.*?)(<\/a:t>)/gs;

  return xml.replace(placeholderPattern, (_match, open, text, close) => {
    let replaced = text as string;
    for (const [key, val] of Object.entries(values)) {
      const token = `{{${key}}}`;
      if (replaced.includes(token)) {
        const before = replaced;
        replaced = replaced.replaceAll(token, escapeXml(val));
        const occurrences =
          (before.split(token).length - 1);
        replacementCounts[key] = (replacementCounts[key] ?? 0) + occurrences;
      }
    }
    return `${open}${replaced}${close}`;
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errJson("Metodo non supportato.", 400);
  }

  // ── Authentication ──────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return errJson("Autenticazione richiesta.", 401);
  }

  const userClient = getUserClient(token);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return errJson("Autenticazione non valida.", 401);
  }
  const userId = user.id;

  // ── Parse and validate input ────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errJson("Corpo della richiesta non valido.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errJson("Corpo della richiesta non valido.", 400);
  }

  const { creative_project_id, template_id, values } = body as Record<
    string,
    unknown
  >;

  if (
    typeof creative_project_id !== "string" ||
    !UUID_RE.test(creative_project_id)
  ) {
    return errJson("creative_project_id non valido.", 400);
  }
  if (typeof template_id !== "string" || !UUID_RE.test(template_id)) {
    return errJson("template_id non valido.", 400);
  }
  if (
    !values ||
    typeof values !== "object" ||
    Array.isArray(values) ||
    values === null
  ) {
    return errJson("values deve essere un oggetto.", 400);
  }

  const valuesObj = values as Record<string, unknown>;
  const serialized = JSON.stringify(valuesObj);
  if (new TextEncoder().encode(serialized).length > MAX_VALUES_BYTES) {
    return errJson("Payload values troppo grande (max 200 KB).", 400);
  }

  for (const [_key, val] of Object.entries(valuesObj)) {
    if (typeof val !== "string") {
      return errJson("Ogni valore deve essere una stringa.", 400);
    }
    if (val.length > MAX_VALUE_LENGTH) {
      return errJson(
        `Ogni valore non può superare ${MAX_VALUE_LENGTH} caratteri.`,
        400,
      );
    }
  }

  // ── Load project (user-scoped) ──────────────────────────────────────
  const { data: project, error: projErr } = await userClient
    .from("creative_projects")
    .select("id, event_id, client_id")
    .eq("id", creative_project_id)
    .maybeSingle();

  if (projErr || !project) {
    return errJson("Progetto creativo non trovato o non accessibile.", 404);
  }

  // ── Load template (user-scoped) ─────────────────────────────────────
  const { data: template, error: tmplErr } = await userClient
    .from("creative_templates")
    .select(
      "id, template_type, file_path, placeholder_keys, is_active, client_id",
    )
    .eq("id", template_id)
    .maybeSingle();

  if (tmplErr || !template) {
    return errJson("Template non trovato o non accessibile.", 404);
  }

  // ── Template validations ────────────────────────────────────────────
  if (!template.is_active) {
    return errJson("Il template selezionato non è attivo.", 400);
  }
  if (template.template_type !== "pptx") {
    return errJson("Solo template PPTX sono supportati.", 400);
  }
  if (
    template.client_id &&
    project.client_id &&
    template.client_id !== project.client_id
  ) {
    return errJson(
      "Il template non è compatibile con il cliente del progetto.",
      400,
    );
  }

  // ── Placeholder key validation ──────────────────────────────────────
  const requiredKeys: string[] = template.placeholder_keys ?? [];
  const providedKeys = Object.keys(valuesObj);

  for (const key of requiredKeys) {
    if (!(key in valuesObj)) {
      return errJson(`Placeholder mancante: ${key}`, 400);
    }
  }
  for (const key of providedKeys) {
    if (!requiredKeys.includes(key)) {
      return errJson(`Placeholder sconosciuto: ${key}`, 400);
    }
  }

  // ── Authorization check ─────────────────────────────────────────────
  if (project.event_id) {
    const { data: hasPerm } = await userClient.rpc("has_event_permission", {
      p_event_id: project.event_id,
      p_permission: "can_manage_creative",
    });
    if (hasPerm !== true) {
      return errJson(
        "Non hai i permessi per generare documenti per questo evento.",
        403,
      );
    }
  } else {
    const { data: canGlobal } = await userClient.rpc(
      "can_manage_global_creative",
    );
    if (canGlobal !== true) {
      return errJson(
        "Non hai i permessi per generare documenti creativi globali.",
        403,
      );
    }
  }

  // ── Authorization passed — switch to service client ─────────────────
  const serviceClient = getServiceClient();

  // ── Create generation row ───────────────────────────────────────────
  const { data: generation, error: genInsertErr } = await serviceClient
    .from("creative_generations")
    .insert({
      creative_project_id,
      template_id,
      event_id: project.event_id ?? null,
      client_id: project.client_id ?? null,
      generation_status: "generating",
      input_payload: valuesObj,
      created_by: userId,
    })
    .select("id")
    .single();

  if (genInsertErr || !generation) {
    return errJson("Errore nell'avvio della generazione.", 500);
  }

  const generationId: string = generation.id;

  // ── Helper to mark error ────────────────────────────────────────────
  async function markError(safeMessage: string) {
    try {
      await serviceClient
        .from("creative_generations")
        .update({
          generation_status: "error",
          error_message: safeMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId);
    } catch {
      // best-effort
    }
  }

  async function cleanupOutput(path: string) {
    try {
      await serviceClient.storage.from("creative-files").remove([path]);
    } catch {
      // best-effort
    }
  }

  // ── Download template file ──────────────────────────────────────────
  let templateBytes: Uint8Array;
  try {
    const { data: fileData, error: dlErr } = await serviceClient.storage
      .from("templates")
      .download(template.file_path);
    if (dlErr || !fileData) {
      await markError("Errore nel download del template.");
      return errJson("Errore nella generazione del documento.", 500);
    }
    templateBytes = new Uint8Array(await fileData.arrayBuffer());
  } catch {
    await markError("Errore nel download del template.");
    return errJson("Errore nella generazione del documento.", 500);
  }

  // ── Open and process PPTX ──────────────────────────────────────────
  let outputBytes: Uint8Array;
  try {
    const zip = await JSZip.loadAsync(templateBytes);

    const validValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(valuesObj)) {
      validValues[k] = v as string;
    }

    const slidePattern = /^ppt\/slides\/slide\d+\.xml$/;
    const slideNames = Object.keys(zip.files).filter((name) =>
      slidePattern.test(name),
    );

    if (slideNames.length === 0) {
      await markError("Il template non contiene slide valide.");
      return errJson("Errore nella generazione del documento.", 500);
    }

    const replacementCounts: Record<string, number> = {};

    for (const slideName of slideNames) {
      const file = zip.file(slideName);
      if (!file) continue;
      const xmlContent = await file.async("string");
      const processed = replacePlaceholders(xmlContent, validValues, replacementCounts);
      zip.file(slideName, processed);
    }

    for (const key of requiredKeys) {
      if (!replacementCounts[key] || replacementCounts[key] === 0) {
        await markError("Uno o più placeholder non sono presenti nel template.");
        return errJson("Errore nella generazione del documento.", 500);
      }
    }

    outputBytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    if (outputBytes.length > MAX_OUTPUT_SIZE) {
      await markError("File generato troppo grande.");
      return errJson("Errore nella generazione del documento.", 500);
    }
  } catch {
    await markError("Errore nella costruzione del documento.");
    return errJson("Errore nella generazione del documento.", 500);
  }

  // ── Upload output ───────────────────────────────────────────────────
  const outputPath = `${creative_project_id}/${generationId}/presentation.pptx`;
  try {
    const { error: uploadErr } = await serviceClient.storage
      .from("creative-files")
      .upload(outputPath, outputBytes, {
        contentType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        upsert: false,
      });

    if (uploadErr) {
      await markError("Errore nel salvataggio del file generato.");
      return errJson("Errore nella generazione del documento.", 500);
    }
  } catch {
    await markError("Errore nel salvataggio del file generato.");
    return errJson("Errore nella generazione del documento.", 500);
  }

  // ── Mark completed ──────────────────────────────────────────────────
  try {
    const { error: updateErr } = await serviceClient
      .from("creative_generations")
      .update({
        generation_status: "completed",
        output_path: outputPath,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", generationId);

    if (updateErr) {
      await cleanupOutput(outputPath);
      await markError("Errore nel completamento della generazione.");
      return errJson("Errore nella generazione del documento.", 500);
    }
  } catch {
    await cleanupOutput(outputPath);
    await markError("Errore nel completamento della generazione.");
    return errJson("Errore nella generazione del documento.", 500);
  }

  return json({ generation_id: generationId, status: "completed" });
});
