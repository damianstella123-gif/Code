/*
# Lock profiles.role column — fix privilege-escalation vulnerability

## Problem
Any authenticated user can UPDATE their own profiles.role to 'Super Admin'
because the RLS UPDATE policy allows auth.uid() = id (self-update) and
authenticated has table-level UPDATE on ALL columns including role.

## Changes

1. **Revoke table-level UPDATE** from both authenticated and anon on profiles.
2. **Grant column-level UPDATE** to authenticated on exactly 6 proven safe
   self-editable columns: theme_preference, settings, pinned_conversation_ids,
   onboarding_completed, onboarding_step, force_password_change.
3. **Grant nothing** to anon (no write access).
4. **Replace the UPDATE RLS policy** so self-updates require auth.uid() = id
   in both USING and WITH CHECK, and admin updates remain gated by
   get_my_role() returning Admin or Super Admin.
5. **Create a BEFORE UPDATE OF role trigger** as defense-in-depth. The trigger
   function rejects role changes unless the statement is running as a
   superuser or the service role (current_setting('role') = the
   service-role name used by Edge Functions). This blocks escalation even if
   a future grant accidentally re-exposes the column.

## Security
- authenticated cannot UPDATE role, ruolo, id, created_at, email, nome,
  first_name, last_name, avatar_url, is_active, attivo, reparto, stato,
  updated_at via the Data API.
- The admin-users Edge Function uses the service role client, which is the
  table owner and bypasses both column grants and RLS — unaffected.
- Trigger function has a fixed search_path and EXECUTE is revoked from
  PUBLIC and anon.

## Important notes
1. The migration is fully idempotent (DROP IF EXISTS before CREATE).
2. No data is modified — only privileges, policies, and a trigger.
3. The six safe columns were derived by auditing every frontend call that
   does .from('profiles').update(...).
*/

-- ══════════════════════════════════════════════════════════════════
-- 1. Revoke table-level UPDATE from authenticated and anon
-- ══════════════════════════════════════════════════════════════════
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;

-- ══════════════════════════════════════════════════════════════════
-- 2. Grant column-level UPDATE on proven safe self-editable columns
-- ══════════════════════════════════════════════════════════════════
GRANT UPDATE (
  theme_preference,
  settings,
  pinned_conversation_ids,
  onboarding_completed,
  onboarding_step,
  force_password_change
) ON public.profiles TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- 3. Replace the UPDATE policy — self-update only for safe columns,
--    admin update for any column they can reach (still limited by
--    column grants above for authenticated role)
-- ══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "profiles_update_self_admin" ON public.profiles;

CREATE POLICY "profiles_update_self_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    (auth.uid() = id)
    OR (get_my_role() = ANY (ARRAY['Admin'::text, 'Super Admin'::text]))
  )
  WITH CHECK (
    (auth.uid() = id)
    OR (get_my_role() = ANY (ARRAY['Admin'::text, 'Super Admin'::text]))
  );

-- ══════════════════════════════════════════════════════════════════
-- 4. Defense-in-depth: BEFORE UPDATE OF role trigger
--    Rejects role changes unless running as a privileged database role
--    (the service-role session used by Edge Functions, or superuser).
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.guard_role_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT (
      current_setting('role') = 'service_role'
      OR current_setting('is_superuser', true) = 'on'
    ) THEN
      RAISE EXCEPTION 'ROLE_CHANGE_FORBIDDEN'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Revoke EXECUTE from PUBLIC and anon (defense-in-depth)
REVOKE EXECUTE ON FUNCTION public.guard_role_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_role_change() FROM anon;

-- Drop if exists for idempotency, then create trigger
DROP TRIGGER IF EXISTS trg_guard_role_change ON public.profiles;

CREATE TRIGGER trg_guard_role_change
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_role_change();
