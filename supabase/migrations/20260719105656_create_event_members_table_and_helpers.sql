/*
# Create event_members table and access helpers

Foundation for granular event sharing. Replaces implicit team_member_ids
with explicit membership rows carrying per-capability permissions.

1. New Tables
   - `event_members`
     - `id` uuid PK
     - `event_id` text FK → events(id) ON DELETE CASCADE
     - `user_id` uuid FK → profiles(id) ON DELETE CASCADE
     - `member_role` text NOT NULL (responsabile|collaboratore|operativo|sola_lettura)
     - 7 boolean permission columns
     - `invited_by` uuid FK → profiles(id) ON DELETE SET NULL
     - `created_at`, `updated_at` timestamptz
     - UNIQUE(event_id, user_id)

2. Indexes
   - idx_event_members_event_id (event_id)
   - idx_event_members_user_id (user_id)

3. New Functions (SECURITY DEFINER, search_path = public, pg_temp)
   - `can_access_event(text, uuid)` → boolean
   - `has_event_permission(text, text, uuid)` → boolean
   - `can_manage_event_members(text, uuid)` → boolean

4. Security
   - RLS enabled on event_members
   - SELECT for admin/super admin/amministrazione: all rows
   - SELECT for authenticated: only events they can access
   - No INSERT/UPDATE/DELETE policies (writes via future RPCs)
   - No anon access
   - Helper functions: revoked from PUBLIC, anon; granted to authenticated

5. Data Migration
   - project_manager_id → responsabile (all permissions true)
   - team_member_ids entries → collaboratore (docs, creative, registration, onsite)
   - No duplicates; skips invalid/null profile references
   - Does NOT modify events.team_member_ids

6. Important Notes
   - events.id is text, profiles.id is uuid
   - project_manager_id stores uuid strings in a text column
   - Existing team_member_ids remain untouched for backward compatibility
   - Admin roles checked via profiles.role text column
*/

-- ─── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_role text NOT NULL CHECK (member_role IN ('responsabile', 'collaboratore', 'operativo', 'sola_lettura')),
  can_manage_members boolean NOT NULL DEFAULT false,
  can_manage_budget boolean NOT NULL DEFAULT false,
  can_manage_documents boolean NOT NULL DEFAULT true,
  can_manage_payments boolean NOT NULL DEFAULT false,
  can_manage_creative boolean NOT NULL DEFAULT false,
  can_manage_registration boolean NOT NULL DEFAULT false,
  can_access_onsite boolean NOT NULL DEFAULT true,
  invited_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_members_event_id ON event_members(event_id);
CREATE INDEX IF NOT EXISTS idx_event_members_user_id ON event_members(user_id);

-- ─── Helper: can_access_event ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION can_access_event(
  p_event_id text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  -- Admin/Super Admin/Amministrazione bypass
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
  IF v_role IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RETURN true;
  END IF;

  -- Event owner (project_manager_id)
  IF EXISTS (
    SELECT 1 FROM events WHERE id = p_event_id AND project_manager_id = p_user_id::text
  ) THEN
    RETURN true;
  END IF;

  -- Explicit membership
  IF EXISTS (
    SELECT 1 FROM event_members WHERE event_id = p_event_id AND user_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  -- Legacy: team_member_ids compatibility
  IF EXISTS (
    SELECT 1 FROM events WHERE id = p_event_id AND p_user_id::text = ANY(team_member_ids)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ─── Helper: has_event_permission ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION has_event_permission(
  p_event_id text,
  p_permission text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_result boolean;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  -- Validate permission name
  IF p_permission NOT IN (
    'can_manage_members', 'can_manage_budget', 'can_manage_documents',
    'can_manage_payments', 'can_manage_creative', 'can_manage_registration',
    'can_access_onsite'
  ) THEN
    RETURN false;
  END IF;

  -- Admin/Super Admin/Amministrazione have all permissions
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
  IF v_role IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RETURN true;
  END IF;

  -- Event owner has all permissions
  IF EXISTS (
    SELECT 1 FROM events WHERE id = p_event_id AND project_manager_id = p_user_id::text
  ) THEN
    RETURN true;
  END IF;

  -- Check membership permission via dynamic column
  EXECUTE format(
    'SELECT %I FROM event_members WHERE event_id = $1 AND user_id = $2',
    p_permission
  ) INTO v_result USING p_event_id, p_user_id;

  RETURN COALESCE(v_result, false);
END;
$$;

-- ─── Helper: can_manage_event_members ───────────────────────────────────────

CREATE OR REPLACE FUNCTION can_manage_event_members(
  p_event_id text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  -- Admin/Super Admin/Amministrazione can always manage
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
  IF v_role IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RETURN true;
  END IF;

  -- Event owner can manage
  IF EXISTS (
    SELECT 1 FROM events WHERE id = p_event_id AND project_manager_id = p_user_id::text
  ) THEN
    RETURN true;
  END IF;

  -- Explicit can_manage_members permission
  RETURN COALESCE(
    (SELECT em.can_manage_members FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = p_user_id),
    false
  );
END;
$$;

-- ─── Permissions on helpers ─────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION can_access_event(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION can_access_event(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION can_access_event(text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION has_event_permission(text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION has_event_permission(text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION has_event_permission(text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION can_manage_event_members(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION can_manage_event_members(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION can_manage_event_members(text, uuid) TO authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_event_members" ON event_members;
CREATE POLICY "admin_select_event_members" ON event_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'Super Admin', 'Amministrazione')
    )
  );

DROP POLICY IF EXISTS "member_select_event_members" ON event_members;
CREATE POLICY "member_select_event_members" ON event_members FOR SELECT
  TO authenticated
  USING (
    can_access_event(event_members.event_id, auth.uid())
  );

-- ─── Data migration: existing assignments ───────────────────────────────────

-- Migrate project_manager_id → responsabile
INSERT INTO event_members (event_id, user_id, member_role,
  can_manage_members, can_manage_budget, can_manage_documents,
  can_manage_payments, can_manage_creative, can_manage_registration,
  can_access_onsite)
SELECT
  e.id,
  e.project_manager_id::uuid,
  'responsabile',
  true, true, true, true, true, true, true
FROM events e
WHERE e.project_manager_id IS NOT NULL
  AND e.project_manager_id != ''
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = e.project_manager_id::uuid)
ON CONFLICT (event_id, user_id) DO NOTHING;

-- Migrate team_member_ids → collaboratore
INSERT INTO event_members (event_id, user_id, member_role,
  can_manage_members, can_manage_budget, can_manage_documents,
  can_manage_payments, can_manage_creative, can_manage_registration,
  can_access_onsite)
SELECT
  e.id,
  member_id::uuid,
  'collaboratore',
  false, false, true, false, true, true, true
FROM events e,
  LATERAL unnest(e.team_member_ids) AS member_id
WHERE member_id IS NOT NULL
  AND member_id != ''
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = member_id::uuid)
ON CONFLICT (event_id, user_id) DO NOTHING;
