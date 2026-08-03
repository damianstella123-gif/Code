import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ADMIN_ROLES = ["Super Admin", "Admin"];

const VALID_ACTIONS = new Set([
  "list-users",
  "create-user",
  "update-user",
  "reset-password",
]);

const VALID_APP_ROLES = new Set([
  "Super Admin",
  "Admin",
  "Senior PM",
  "Project Manager",
  "Junior Event Assistant",
  "Amministrazione",
  "Regista",
  "Commerciale",
  "Partner",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_STR = 200;

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeStr(v: unknown, maxLen = MAX_STR): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") return undefined;
  return v.slice(0, maxLen).trim();
}

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function authorize(
  adminClient: ReturnType<typeof createClient>,
  req: Request
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResp({ error: "AUTH_REQUIRED" }, 401);

  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return jsonResp({ error: "AUTH_REQUIRED" }, 401);

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    return jsonResp({ error: "ROLE_NOT_ALLOWED" }, 403);
  }

  return { userId: user.id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResp({ error: "INVALID_ACTION" }, 405);
  }

  try {
    const adminClient = getAdminClient();
    const auth = await authorize(adminClient, req);
    if (auth instanceof Response) return auth;

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (!action || !VALID_ACTIONS.has(action)) {
      return jsonResp({ error: "INVALID_ACTION" }, 400);
    }

    // ─── LIST USERS ────────────────────────────────────────────
    if (action === "list-users") {
      if (req.method !== "GET") return jsonResp({ error: "INVALID_ACTION" }, 405);

      const { data, error } = await adminClient
        .from("profiles")
        .select(
          "id, first_name, last_name, email, role, avatar_url, is_active, created_at, updated_at"
        )
        .order("created_at", { ascending: true });

      if (error) return jsonResp({ error: "INTERNAL_ERROR" }, 500);
      return jsonResp({ users: data });
    }

    // All remaining actions require POST
    if (req.method !== "POST") return jsonResp({ error: "INVALID_ACTION" }, 405);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResp({ error: "INVALID_INPUT" }, 400);
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return jsonResp({ error: "INVALID_INPUT" }, 400);
    }

    // ─── CREATE USER ───────────────────────────────────────────
    if (action === "create-user") {
      const email = safeStr(body.email);
      const password = safeStr(body.password, 128);
      const first_name = safeStr(body.first_name);
      const last_name = safeStr(body.last_name);
      const role = safeStr(body.role);

      if (!email || !password || !first_name || !last_name || !role) {
        return jsonResp({ error: "INVALID_INPUT" }, 400);
      }

      if (!EMAIL_RE.test(email)) {
        return jsonResp({ error: "INVALID_INPUT" }, 400);
      }

      if (password.length < 6) {
        return jsonResp({ error: "INVALID_INPUT" }, 400);
      }

      if (!VALID_APP_ROLES.has(role)) {
        return jsonResp({ error: "INVALID_INPUT" }, 400);
      }

      const { data: newUser, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { first_name, last_name, role },
        });

      if (createError) {
        if (createError.message?.includes("already been registered")) {
          return jsonResp({ error: "EMAIL_IN_USE" }, 409);
        }
        return jsonResp({ error: "INTERNAL_ERROR" }, 500);
      }

      const userId = newUser.user.id;

      await new Promise((r) => setTimeout(r, 500));

      const profilePayload = {
        id: userId,
        email,
        first_name,
        last_name,
        role,
        nome: `${first_name} ${last_name}`.trim(),
        ruolo: role,
        reparto: "",
        is_active: true,
        attivo: true,
        force_password_change: true,
      };

      const { error: updateError } = await adminClient
        .from("profiles")
        .update(profilePayload)
        .eq("id", userId);

      if (updateError) {
        await adminClient
          .from("profiles")
          .upsert(profilePayload, { onConflict: "id" });
      }

      await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { first_name, last_name, role },
      });

      return jsonResp({ user: { id: userId, email } });
    }

    // ─── UPDATE USER ───────────────────────────────────────────
    if (action === "update-user") {
      const user_id = safeStr(body.user_id);
      if (!user_id || !UUID_RE.test(user_id)) {
        return jsonResp({ error: "INVALID_INPUT" }, 400);
      }

      const first_name = safeStr(body.first_name);
      const last_name = safeStr(body.last_name);
      const role = safeStr(body.role);
      const email = safeStr(body.email);
      const avatar_url = body.avatar_url === null ? null : safeStr(body.avatar_url, 2048);
      const is_active = typeof body.is_active === "boolean" ? body.is_active : undefined;

      if (role !== undefined && !VALID_APP_ROLES.has(role)) {
        return jsonResp({ error: "INVALID_INPUT" }, 400);
      }

      if (email !== undefined && !EMAIL_RE.test(email)) {
        return jsonResp({ error: "INVALID_INPUT" }, 400);
      }

      const { data: currentProfile } = await adminClient
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user_id)
        .maybeSingle();

      const finalFirstName = first_name ?? currentProfile?.first_name ?? "";
      const finalLastName = last_name ?? currentProfile?.last_name ?? "";

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

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

      if (email !== undefined) {
        const { data: existingUser } = await adminClient
          .from("profiles")
          .select("id")
          .eq("email", email)
          .neq("id", user_id)
          .maybeSingle();

        if (existingUser) {
          return jsonResp({ error: "EMAIL_IN_USE" }, 409);
        }

        const { error: authEmailError } =
          await adminClient.auth.admin.updateUserById(user_id, {
            email,
            email_confirm: true,
          });

        if (authEmailError) {
          return jsonResp({ error: "INTERNAL_ERROR" }, 500);
        }

        patch.email = email;
      }

      const { error: updateError } = await adminClient
        .from("profiles")
        .update(patch)
        .eq("id", user_id);

      if (updateError) {
        return jsonResp({ error: "INTERNAL_ERROR" }, 500);
      }

      if (is_active === false) {
        await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "876000h",
        });
      } else if (is_active === true) {
        await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "none",
        });
      }

      if (
        first_name !== undefined ||
        last_name !== undefined ||
        role !== undefined
      ) {
        const metaUpdate: Record<string, string> = {};
        if (first_name !== undefined) metaUpdate.first_name = first_name;
        if (last_name !== undefined) metaUpdate.last_name = last_name;
        if (role !== undefined) metaUpdate.role = role;
        await adminClient.auth.admin.updateUserById(user_id, {
          user_metadata: metaUpdate,
        });
      }

      return jsonResp({ success: true });
    }

    // ─── RESET PASSWORD ────────────────────────────────────────
    if (action === "reset-password") {
      const user_id = safeStr(body.user_id);
      const new_password = safeStr(body.new_password, 128);

      if (!user_id || !UUID_RE.test(user_id)) {
        return jsonResp({ error: "INVALID_INPUT" }, 400);
      }

      if (!new_password || new_password.length < 6) {
        return jsonResp({ error: "INVALID_INPUT" }, 400);
      }

      const { error: resetError } =
        await adminClient.auth.admin.updateUserById(user_id, {
          password: new_password,
        });

      if (resetError) {
        return jsonResp({ error: "INTERNAL_ERROR" }, 500);
      }

      await adminClient
        .from("profiles")
        .update({ force_password_change: true })
        .eq("id", user_id);

      return jsonResp({ success: true });
    }

    return jsonResp({ error: "INVALID_ACTION" }, 400);
  } catch {
    return jsonResp({ error: "INTERNAL_ERROR" }, 500);
  }
});
