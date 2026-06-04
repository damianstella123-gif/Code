import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is authenticated and is a Partner
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: caller },
      error: authError,
    } = await adminClient.auth.getUser(token);
    if (authError || !caller) {
      return jsonResponse({ error: "Non autenticato" }, 401);
    }

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "Partner") {
      return jsonResponse({ error: "Accesso negato: solo Partner" }, 403);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (req.method === "POST" && action === "create-user") {
      const { email, password, first_name, last_name, role } = await req.json();
      if (!email || !password || !first_name || !last_name || !role) {
        return jsonResponse({ error: "Campi obbligatori mancanti" }, 400);
      }

      const { data: newUser, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { first_name, last_name, role },
        });

      if (createError) {
        return jsonResponse({ error: createError.message }, 400);
      }

      return jsonResponse({ user: newUser.user });
    }

    if (req.method === "POST" && action === "update-user") {
      const { user_id, first_name, last_name, role, is_active } =
        await req.json();
      if (!user_id) {
        return jsonResponse({ error: "user_id obbligatorio" }, 400);
      }

      const updatePayload: Record<string, unknown> = {};
      if (first_name !== undefined) updatePayload.first_name = first_name;
      if (last_name !== undefined) updatePayload.last_name = last_name;
      if (role !== undefined) updatePayload.role = role;
      if (is_active !== undefined) updatePayload.is_active = is_active;

      // Update profile
      const { error: profileError } = await adminClient
        .from("profiles")
        .update(updatePayload)
        .eq("id", user_id);

      if (profileError) {
        return jsonResponse({ error: profileError.message }, 400);
      }

      // If deactivating, also ban the user in auth; if reactivating, unban
      if (is_active === false) {
        await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "876000h",
        });
      } else if (is_active === true) {
        await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "none",
        });
      }

      return jsonResponse({ success: true });
    }

    if (req.method === "POST" && action === "reset-password") {
      const { user_id, new_password } = await req.json();
      if (!user_id || !new_password) {
        return jsonResponse(
          { error: "user_id e new_password obbligatori" },
          400
        );
      }

      const { error: resetError } =
        await adminClient.auth.admin.updateUserById(user_id, {
          password: new_password,
        });

      if (resetError) {
        return jsonResponse({ error: resetError.message }, 400);
      }

      return jsonResponse({ success: true });
    }

    if (req.method === "GET" && action === "list-users") {
      const { data: profiles, error: listError } = await adminClient
        .from("profiles")
        .select("id, first_name, last_name, email, role, avatar_url, is_active, created_at, updated_at")
        .order("created_at", { ascending: true });

      if (listError) {
        return jsonResponse({ error: listError.message }, 500);
      }

      return jsonResponse({ users: profiles });
    }

    return jsonResponse({ error: "Azione non valida" }, 400);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Errore interno" },
      500
    );
  }
});
