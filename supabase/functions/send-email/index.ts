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

  try {
    const { email_id } = await req.json();
    if (!email_id) {
      return new Response(
        JSON.stringify({ error: "email_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: email, error: fetchError } = await supabase
      .from("email_messages")
      .select("*")
      .eq("id", email_id)
      .maybeSingle();

    if (fetchError || !email) {
      return new Response(
        JSON.stringify({ error: "Email not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!resendApiKey) {
      await supabase
        .from("email_messages")
        .update({ status: "errore" })
        .eq("id", email_id);

      return new Response(
        JSON.stringify({
          error: "RESEND_API_KEY not configured. Configure it in Supabase Edge Function secrets to enable email sending.",
          status_info: "The email has been saved but cannot be sent until RESEND_API_KEY is configured.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM_EMAIL") || "Simmetria HUB <noreply@resend.dev>",
        to: [email.recipient_email],
        subject: email.subject,
        html: email.body,
      }),
    });

    if (!resendResponse.ok) {
      const resendError = await resendResponse.text();
      await supabase
        .from("email_messages")
        .update({ status: "errore" })
        .eq("id", email_id);

      return new Response(
        JSON.stringify({ error: `Resend API error: ${resendError}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("email_messages")
      .update({ status: "inviata", sent_at: new Date().toISOString() })
      .eq("id", email_id);

    return new Response(
      JSON.stringify({ success: true, message: "Email inviata con successo" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
