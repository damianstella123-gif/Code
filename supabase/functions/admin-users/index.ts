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

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function verifyPartner(
  adminClient: ReturnType<typeof createClient>,
  req: Request
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return json({ error: "Token mancante" }, 401);
  }

  const {
    data: { user },
    error,
  } = await adminClient.auth.getUser(token);

  if (error || !user) {
    return json({ error: "Non autenticato: " + (error?.message ?? "utente non trovato") }, 401);
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return json({ error: "Profilo non trovato" }, 403);
  }

  if (profile.role !== "Partner") {
    return json({ error: "Accesso negato: solo Partner (" + profile.role + ")" }, 403);
  }

  return { userId: user.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const adminClient = getAdminClient();
    const auth = await verifyPartner(adminClient, req);
    if (auth instanceof Response) return auth;

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ─── LIST USERS ────────────────────────────────────────────
    if (action === "list-users") {
      const { data, error } = await adminClient
        .from("profiles")
        .select(
          "id, first_name, last_name, email, role, avatar_url, is_active, created_at, updated_at"
        )
        .order("created_at", { ascending: true });

      if (error) return json({ error: error.message }, 500);
      return json({ users: data });
    }

    // ─── CREATE USER ───────────────────────────────────────────
    if (action === "create-user" && req.method === "POST") {
      const body = await req.json();
      const { email, password, first_name, last_name, role } = body;

      if (!email || !password || !first_name || !last_name || !role) {
        return json({ error: "Campi obbligatori: email, password, first_name, last_name, role" }, 400);
      }

      if (password.length < 6) {
        return json({ error: "Password minima 6 caratteri" }, 400);
      }

      const { data: newUser, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { first_name, last_name, role },
        });

      if (createError) {
        return json({ error: createError.message }, 400);
      }

      // Ensure profile exists with correct data (trigger may have created it)
      await adminClient.from("profiles").upsert({
        id: newUser.user.id,
        email,
        first_name,
        last_name,
        role,
        nome: `${first_name} ${last_name}`,
        ruolo: role,
        is_active: true,
        attivo: true,
      }, { onConflict: "id" });

      return json({ user: { id: newUser.user.id, email } });
    }

    // ─── UPDATE USER ───────────────────────────────────────────
    if (action === "update-user" && req.method === "POST") {
      const body = await req.json();
      const { user_id, first_name, last_name, role, is_active, email, avatar_url } = body;

      if (!user_id) {
        return json({ error: "user_id obbligatorio" }, 400);
      }

      // Fetch current profile for computing nome
      const { data: currentProfile } = await adminClient
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user_id)
        .maybeSingle();

      const finalFirstName = first_name ?? currentProfile?.first_name ?? "";
      const finalLastName = last_name ?? currentProfile?.last_name ?? "";

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (first_name !== undefined) patch.first_name = first_name;
      if (last_name !== undefined) patch.last_name = last_name;
      if (first_name !== undefined || last_name !== undefined) {
        patch.nome = `${finalFirstName} ${finalLastName}`.trim();
      }
      if (role !== undefined) {
        patch.role = role;
        patch.ruolo = role;
      }
      if (is_active !== undefined) {
        patch.is_active = is_active;
        patch.attivo = is_active;
      }
      if (avatar_url !== undefined) {
        patch.avatar_url = avatar_url;
      }

      // Handle email change - sync profiles AND Supabase Auth
      if (email !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return json({ error: "Formato email non valido" }, 400);
        }

        const { data: existingUser } = await adminClient
          .from("profiles")
          .select("id")
          .eq("email", email)
          .neq("id", user_id)
          .maybeSingle();

        if (existingUser) {
          return json({ error: "Questa email è già in uso da un altro utente" }, 409);
        }

        // Update email in Supabase Auth (admin privilege)
        const { error: authEmailError } = await adminClient.auth.admin.updateUserById(
          user_id,
          { email, email_confirm: true }
        );

        if (authEmailError) {
          return json({ error: "Errore aggiornamento email: " + authEmailError.message }, 500);
        }

        patch.email = email;
      }

      // Apply profile update
      const { error: updateError } = await adminClient
        .from("profiles")
        .update(patch)
        .eq("id", user_id);

      if (updateError) {
        return json({ error: updateError.message }, 400);
      }

      // Ban/unban in auth
      if (is_active === false) {
        await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "876000h",
        });
      } else if (is_active === true) {
        await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "none",
        });
      }

      // Sync user_metadata in auth for name/role changes
      if (first_name !== undefined || last_name !== undefined || role !== undefined) {
        const metaUpdate: Record<string, string> = {};
        if (first_name !== undefined) metaUpdate.first_name = first_name;
        if (last_name !== undefined) metaUpdate.last_name = last_name;
        if (role !== undefined) metaUpdate.role = role;
        await adminClient.auth.admin.updateUserById(user_id, {
          user_metadata: metaUpdate,
        });
      }

      return json({ success: true });
    }

    // ─── RESET PASSWORD ────────────────────────────────────────
    if (action === "reset-password" && req.method === "POST") {
      const body = await req.json();
      const { user_id, new_password } = body;

      if (!user_id || !new_password) {
        return json({ error: "user_id e new_password obbligatori" }, 400);
      }

      if (new_password.length < 6) {
        return json({ error: "Password minima 6 caratteri" }, 400);
      }

      const { error: resetError } =
        await adminClient.auth.admin.updateUserById(user_id, {
          password: new_password,
        });

      if (resetError) {
        return json({ error: resetError.message }, 400);
      }

      return json({ success: true });
    }

    return json({ error: `Azione non valida: ${action}` }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    return json({ error: msg }, 500);
  }
});
