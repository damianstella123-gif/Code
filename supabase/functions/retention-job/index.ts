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

type EventRow = { id: string };
type RegistrationRow = { id: string };
type DocRow = { id: string; path: string };

interface PerEventCounters {
  registrations_deleted: number;
  documents_deleted: number;
  notices_sent: number;
  notices_failed: number;
}

async function sendRetentionNotice(
  supabaseUrl: string,
  serviceKey: string,
  registrationId: string,
): Promise<boolean> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/registration-email-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        registration_id: registrationId,
        template: "retention_notice",
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function processEvent(
  sb: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  event: EventRow,
): Promise<PerEventCounters> {
  const counters: PerEventCounters = {
    registrations_deleted: 0,
    documents_deleted: 0,
    notices_sent: 0,
    notices_failed: 0,
  };

  // 1. Load registrations and dispatch retention_notice emails
  const { data: regs } = await sb
    .from("event_registrations")
    .select("id")
    .eq("event_id", event.id);

  const registrationIds: string[] = ((regs ?? []) as RegistrationRow[]).map((r) => r.id);

  for (const regId of registrationIds) {
    // Idempotent outbox insert (unique on registration_id, template)
    const { error: outboxErr } = await sb
      .from("registration_email_outbox")
      .insert({ registration_id: regId, template: "retention_notice" });
    // 23505 = unique_violation, treat as already-queued: continue anyway
    if (outboxErr && (outboxErr as { code?: string }).code !== "23505") {
      counters.notices_failed += 1;
      continue;
    }

    const sent = await sendRetentionNotice(supabaseUrl, serviceKey, regId);
    if (sent) counters.notices_sent += 1;
    else counters.notices_failed += 1;
  }

  // 2. Collect participant-data documents from both tables, delete storage + rows
  const { data: docsBucketRows } = await sb
    .from("documents")
    .select("id, file_path")
    .eq("event_id", event.id)
    .eq("is_participant_data", true);

  const docsBucket: DocRow[] = ((docsBucketRows ?? []) as { id: string; file_path: string | null }[])
    .filter((r) => !!r.file_path)
    .map((r) => ({ id: r.id, path: r.file_path as string }));

  const { data: eventDocsRows } = await sb
    .from("event_documents")
    .select("id, storage_path")
    .eq("event_id", event.id)
    .eq("is_participant_data", true);

  const eventDocs: DocRow[] = ((eventDocsRows ?? []) as { id: string; storage_path: string | null }[])
    .filter((r) => !!r.storage_path)
    .map((r) => ({ id: r.id, path: r.storage_path as string }));

  if (docsBucket.length > 0) {
    const paths = docsBucket.map((d) => d.path);
    await sb.storage.from("documents").remove(paths);
    const ids = docsBucket.map((d) => d.id);
    const { data: deleted } = await sb
      .from("documents")
      .delete()
      .in("id", ids)
      .select("id");
    counters.documents_deleted += (deleted ?? []).length;
  }

  if (eventDocs.length > 0) {
    const paths = eventDocs.map((d) => d.path);
    await sb.storage.from("event-documents").remove(paths);
    const ids = eventDocs.map((d) => d.id);
    const { data: deleted } = await sb
      .from("event_documents")
      .delete()
      .in("id", ids)
      .select("id");
    counters.documents_deleted += (deleted ?? []).length;
  }

  // 3. Delete registrations (transport_assignments cascade)
  if (registrationIds.length > 0) {
    const { data: delRegs } = await sb
      .from("event_registrations")
      .delete()
      .in("id", registrationIds)
      .select("id");
    counters.registrations_deleted = (delRegs ?? []).length;
  }

  return counters;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "INVALID_ACTION" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResp({ error: "AUTH_REQUIRED" }, 401);
  const claims = decodeJwtPayload(token);
  if (!claims || claims.role !== "service_role") {
    return jsonResp({ error: "ROLE_NOT_ALLOWED" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Find qualifying events: ended >= 30 days ago, not yet processed
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: events, error: evErr } = await sb
      .from("events")
      .select("id")
      .not("end_date", "is", null)
      .lte("end_date", cutoff)
      .is("retention_processed_at", null);

    if (evErr) {
      return jsonResp({ error: "QUERY_FAILED" }, 500);
    }

    const eventList = (events ?? []) as EventRow[];
    const perEvent: Array<{ event_id: string } & PerEventCounters> = [];

    for (const ev of eventList) {
      try {
        const c = await processEvent(sb, supabaseUrl, serviceKey, ev);
        await sb.from("retention_job_log").insert({
          event_id: ev.id,
          registrations_deleted: c.registrations_deleted,
          documents_deleted: c.documents_deleted,
          notices_sent: c.notices_sent,
          notices_failed: c.notices_failed,
        });
        await sb
          .from("events")
          .update({ retention_processed_at: new Date().toISOString() })
          .eq("id", ev.id);
        perEvent.push({ event_id: ev.id, ...c });
      } catch {
        await sb.from("retention_job_log").insert({
          event_id: ev.id,
          registrations_deleted: 0,
          documents_deleted: 0,
          notices_sent: 0,
          notices_failed: 0,
          note: "processing_error",
        });
        perEvent.push({
          event_id: ev.id,
          registrations_deleted: 0,
          documents_deleted: 0,
          notices_sent: 0,
          notices_failed: 0,
        });
      }
    }

    return jsonResp({
      ok: true,
      events_considered: eventList.length,
      events_processed: perEvent.length,
    });
  } catch {
    return jsonResp({ error: "INTERNAL_ERROR" }, 500);
  }
});
