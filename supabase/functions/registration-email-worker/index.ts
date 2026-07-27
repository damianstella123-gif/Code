import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import QRCode from "npm:qrcode@1.5.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function isUUID(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(d: string | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function buildConfirmedHtml(params: {
  firstName: string;
  siteTitle: string;
  eventTitle: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  confirmationMessage: string | null;
  logoUrl: string | null;
  primaryColor: string;
}): string {
  const name = escapeHtml(params.firstName);
  const title = escapeHtml(params.siteTitle || params.eventTitle);
  const color = escapeHtml(params.primaryColor);
  const start = formatDate(params.startDate);
  const end = formatDate(params.endDate);
  const loc = params.location ? escapeHtml(params.location) : "";
  const confMsg = params.confirmationMessage
    ? `<p style="margin:16px 0;padding:12px;background:#f3f4f6;border-radius:8px;font-size:14px;line-height:1.5;">${escapeHtml(params.confirmationMessage)}</p>`
    : "";
  const logoBlock = params.logoUrl
    ? `<img src="${escapeHtml(params.logoUrl)}" alt="" style="max-height:48px;margin-bottom:16px;" />`
    : "";
  const dateBlock = start
    ? `<p style="margin:4px 0;font-size:14px;color:#374151;"><strong>Date:</strong> ${escapeHtml(start)}${end && end !== start ? ` – ${escapeHtml(end)}` : ""}</p>`
    : "";
  const locBlock = loc
    ? `<p style="margin:4px 0;font-size:14px;color:#374151;"><strong>Luogo:</strong> ${loc}</p>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="background:${color};padding:24px;text-align:center;">
${logoBlock}
<h1 style="margin:0;color:#ffffff;font-size:20px;">Registrazione confermata</h1>
</td></tr>
<tr><td style="padding:24px 32px;">
<p style="margin:0 0 16px;font-size:16px;color:#111827;">Ciao <strong>${name}</strong>,</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.5;">La tua registrazione a <strong>${title}</strong> è stata confermata.</p>
${dateBlock}${locBlock}${confMsg}
<p style="margin:16px 0 4px;font-size:14px;color:#374151;">In allegato trovi il tuo codice QR per l'accredito.</p>
</td></tr>
<tr><td style="padding:16px 32px 24px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
Questa email è stata inviata automaticamente. Non rispondere a questo messaggio.<br/>I tuoi dati sono trattati nel rispetto della normativa sulla privacy.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function buildWaitlistHtml(params: {
  firstName: string;
  siteTitle: string;
  eventTitle: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  logoUrl: string | null;
  primaryColor: string;
}): string {
  const name = escapeHtml(params.firstName);
  const title = escapeHtml(params.siteTitle || params.eventTitle);
  const color = escapeHtml(params.primaryColor);
  const start = formatDate(params.startDate);
  const end = formatDate(params.endDate);
  const loc = params.location ? escapeHtml(params.location) : "";
  const logoBlock = params.logoUrl
    ? `<img src="${escapeHtml(params.logoUrl)}" alt="" style="max-height:48px;margin-bottom:16px;" />`
    : "";
  const dateBlock = start
    ? `<p style="margin:4px 0;font-size:14px;color:#374151;"><strong>Date:</strong> ${escapeHtml(start)}${end && end !== start ? ` – ${escapeHtml(end)}` : ""}</p>`
    : "";
  const locBlock = loc
    ? `<p style="margin:4px 0;font-size:14px;color:#374151;"><strong>Luogo:</strong> ${loc}</p>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%;">
<tr><td style="background:${color};padding:24px;text-align:center;">
${logoBlock}
<h1 style="margin:0;color:#ffffff;font-size:20px;">Lista d'attesa</h1>
</td></tr>
<tr><td style="padding:24px 32px;">
<p style="margin:0 0 16px;font-size:16px;color:#111827;">Ciao <strong>${name}</strong>,</p>
<p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.5;">Ti confermiamo che sei stato inserito nella lista d'attesa per <strong>${title}</strong>.</p>
${dateBlock}${locBlock}
<p style="margin:16px 0 0;font-size:14px;color:#374151;line-height:1.5;">Ti contatteremo se si libera un posto. Non è necessaria alcuna azione da parte tua.</p>
</td></tr>
<tr><td style="padding:16px 32px 24px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
Questa email è stata inviata automaticamente. Non rispondere a questo messaggio.<br/>I tuoi dati sono trattati nel rispetto della normativa sulla privacy.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!RESEND_API_KEY || !RESEND_FROM_EMAIL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ status: "failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || !isUUID(body.registration_id) || !isUUID(body.qr_token)) {
      return new Response(
        JSON.stringify({ status: "failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const registrationId: string = body.registration_id;
    const suppliedQrToken: string = body.qr_token;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load registration and verify qr_token
    const { data: reg, error: regErr } = await supabase
      .from("event_registrations")
      .select("id, first_name, last_name, email, registration_status, qr_token, site_id, event_id")
      .eq("id", registrationId)
      .maybeSingle();

    if (regErr || !reg || reg.qr_token !== suppliedQrToken) {
      return new Response(
        JSON.stringify({ status: "failed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load outbox row
    const template =
      reg.registration_status === "confirmed"
        ? "registration_confirmed"
        : reg.registration_status === "waitlist"
          ? "registration_waitlist"
          : null;

    if (!template) {
      return new Response(
        JSON.stringify({ status: "failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: outbox, error: outboxErr } = await supabase
      .from("registration_email_outbox")
      .select("id, status, attempts")
      .eq("registration_id", registrationId)
      .eq("template", template)
      .maybeSingle();

    if (outboxErr || !outbox) {
      return new Response(
        JSON.stringify({ status: "failed" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (outbox.status === "sent") {
      return new Response(
        JSON.stringify({ status: "already_sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (outbox.status === "processing") {
      return new Response(
        JSON.stringify({ status: "processing" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atomically claim: only pending/failed with attempts < 3
    const { data: claimed, error: claimErr } = await supabase
      .from("registration_email_outbox")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", outbox.id)
      .in("status", ["pending", "failed"])
      .lt("attempts", 3)
      .select("id")
      .maybeSingle();

    if (claimErr || !claimed) {
      return new Response(
        JSON.stringify({ status: "processing" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load site
    const { data: site } = await supabase
      .from("registration_sites")
      .select("title, subtitle, confirmation_message, logo_url, theme")
      .eq("id", reg.site_id)
      .maybeSingle();

    // Load event
    const { data: event } = await supabase
      .from("events")
      .select("title, start_date, end_date, location")
      .eq("id", reg.event_id)
      .maybeSingle();

    const primaryColor =
      (site?.theme && typeof (site.theme as Record<string, unknown>).primary_color === "string"
        ? (site.theme as Record<string, unknown>).primary_color
        : "#2563eb") as string;

    // Build email
    let html: string;
    let subject: string;
    const emailParams = {
      firstName: reg.first_name || "",
      siteTitle: site?.title || "",
      eventTitle: event?.title || "",
      startDate: event?.start_date || null,
      endDate: event?.end_date || null,
      location: event?.location || null,
      logoUrl: site?.logo_url || null,
      primaryColor,
    };

    if (template === "registration_confirmed") {
      html = buildConfirmedHtml({
        ...emailParams,
        confirmationMessage: site?.confirmation_message || null,
      });
      subject = `Registrazione confermata – ${escapeHtml(site?.title || event?.title || "Evento")}`;
    } else {
      html = buildWaitlistHtml(emailParams);
      subject = `Lista d'attesa – ${escapeHtml(site?.title || event?.title || "Evento")}`;
    }

    // Generate QR attachment for confirmed
    const attachments: Array<{ filename: string; content: string }> = [];
    if (template === "registration_confirmed") {
      try {
        const qrDataUrl: string = await QRCode.toDataURL(reg.qr_token, {
          type: "image/png",
          width: 300,
          margin: 2,
        });
        const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
        attachments.push({ filename: "qr-code.png", content: base64 });
      } catch {
        // QR generation failed — send without attachment
      }
    }

    // Send via Resend
    let sendSuccess = false;
    let errorCode = "SEND_FAILED";

    try {
      const resendPayload: Record<string, unknown> = {
        from: RESEND_FROM_EMAIL,
        to: [reg.email],
        subject,
        html,
      };

      if (attachments.length > 0) {
        resendPayload.attachments = attachments;
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resendPayload),
      });

      if (res.ok) {
        sendSuccess = true;
      } else if (res.status === 429) {
        errorCode = "RATE_LIMITED";
      } else if (res.status >= 500) {
        errorCode = "PROVIDER_ERROR";
      } else {
        errorCode = "SEND_REJECTED";
      }
    } catch {
      errorCode = "NETWORK_ERROR";
    }

    // Update outbox
    if (sendSuccess) {
      await supabase
        .from("registration_email_outbox")
        .update({
          status: "sent",
          attempts: outbox.attempts + 1,
          sent_at: new Date().toISOString(),
          last_error_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", outbox.id);

      return new Response(
        JSON.stringify({ status: "sent" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const retryMinutes = Math.min(5 * Math.pow(2, outbox.attempts), 60);
      const nextAttempt = new Date(Date.now() + retryMinutes * 60 * 1000).toISOString();

      await supabase
        .from("registration_email_outbox")
        .update({
          status: "failed",
          attempts: outbox.attempts + 1,
          next_attempt_at: nextAttempt,
          last_error_code: errorCode,
          updated_at: new Date().toISOString(),
        })
        .eq("id", outbox.id);

      return new Response(
        JSON.stringify({ status: "failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ status: "failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
