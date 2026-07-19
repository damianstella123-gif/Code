/*
# Harden event_members helpers and add management RPCs

1. Removed Functions (old spoofable signatures)
   - can_access_event(text, uuid) — dropped after removing dependent policy
   - has_event_permission(text, text, uuid)
   - can_manage_event_members(text, uuid)

2. New/Replaced Functions (authenticated-safe, auth.uid() only)
   - can_access_event(p_event_id text) → boolean
   - has_event_permission(p_event_id text, p_permission text) → boolean
   - can_manage_event_members(p_event_id text) → boolean
   - _is_valid_uuid(val text) → boolean (internal only)
   - _can_access_event_internal(p_event_id text, p_user_id uuid) → boolean (internal only)

3. New RPCs
   - upsert_event_member(10 params) → uuid
   - remove_event_member(p_event_id text, p_user_id uuid) → void

4. Security Changes
   - All SECURITY DEFINER with search_path = public, pg_temp
   - Internal helpers not executable by any app role
   - Public helpers + RPCs: revoked PUBLIC+anon, granted authenticated
   - RLS SELECT policies updated to 1-param can_access_event
   - No write RLS policies

5. Anti-escalation
   - Non-admin cannot grant permissions they don't personally hold
   - Only can_manage_members holders can grant can_manage_members
   - Owner is treated as having all permissions

6. Protection Rules
   - Non-admin cannot remove the event owner
   - Nobody can remove the last manager (responsabile or can_manage_members=true)
*/

-- ─── Step 1: Drop dependent policies first ──────────────────────────────────

DROP POLICY IF EXISTS "member_select_event_members" ON event_members;
DROP POLICY IF EXISTS "admin_select_event_members" ON event_members;

-- ─── Step 2: Drop old spoofable signatures ──────────────────────────────────

DROP FUNCTION IF EXISTS can_access_event(text, uuid);
DROP FUNCTION IF EXISTS has_event_permission(text, text, uuid);
DROP FUNCTION IF EXISTS can_manage_event_members(text, uuid);

-- ─── Internal: UUID validation ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _is_valid_uuid(val text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF val IS NULL OR val = '' THEN RETURN false; END IF;
  PERFORM val::uuid;
  RETURN true;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION _is_valid_uuid(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION _is_valid_uuid(text) FROM anon;
REVOKE EXECUTE ON FUNCTION _is_valid_uuid(text) FROM authenticated;

-- ─── Internal: access check with explicit user (trusted DB functions only) ──

CREATE OR REPLACE FUNCTION _can_access_event_internal(
  p_event_id text,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_pm_id text;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
  IF v_role IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RETURN true;
  END IF;

  SELECT project_manager_id INTO v_pm_id FROM events WHERE id = p_event_id;
  IF v_pm_id IS NOT NULL AND _is_valid_uuid(v_pm_id) AND v_pm_id::uuid = p_user_id THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM event_members WHERE event_id = p_event_id AND user_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = p_event_id
      AND p_user_id::text = ANY(e.team_member_ids)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION _can_access_event_internal(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION _can_access_event_internal(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION _can_access_event_internal(text, uuid) FROM authenticated;

-- ─── Public helper: can_access_event (auth.uid() only) ──────────────────────

CREATE OR REPLACE FUNCTION can_access_event(p_event_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN _can_access_event_internal(p_event_id, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION can_access_event(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION can_access_event(text) FROM anon;
GRANT EXECUTE ON FUNCTION can_access_event(text) TO authenticated;

-- ─── Public helper: has_event_permission (auth.uid() only) ──────────────────

CREATE OR REPLACE FUNCTION has_event_permission(
  p_event_id text,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_pm_id text;
  v_uid uuid := auth.uid();
  v_result boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  IF p_permission NOT IN (
    'can_manage_members', 'can_manage_budget', 'can_manage_documents',
    'can_manage_payments', 'can_manage_creative', 'can_manage_registration',
    'can_access_onsite'
  ) THEN
    RETURN false;
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RETURN true;
  END IF;

  SELECT project_manager_id INTO v_pm_id FROM events WHERE id = p_event_id;
  IF v_pm_id IS NOT NULL AND _is_valid_uuid(v_pm_id) AND v_pm_id::uuid = v_uid THEN
    RETURN true;
  END IF;

  CASE p_permission
    WHEN 'can_manage_members' THEN
      SELECT em.can_manage_members INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_manage_budget' THEN
      SELECT em.can_manage_budget INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_manage_documents' THEN
      SELECT em.can_manage_documents INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_manage_payments' THEN
      SELECT em.can_manage_payments INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_manage_creative' THEN
      SELECT em.can_manage_creative INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_manage_registration' THEN
      SELECT em.can_manage_registration INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_access_onsite' THEN
      SELECT em.can_access_onsite INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    ELSE
      RETURN false;
  END CASE;

  RETURN COALESCE(v_result, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION has_event_permission(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION has_event_permission(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION has_event_permission(text, text) TO authenticated;

-- ─── Public helper: can_manage_event_members (auth.uid() only) ──────────────

CREATE OR REPLACE FUNCTION can_manage_event_members(p_event_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_pm_id text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RETURN true;
  END IF;

  SELECT project_manager_id INTO v_pm_id FROM events WHERE id = p_event_id;
  IF v_pm_id IS NOT NULL AND _is_valid_uuid(v_pm_id) AND v_pm_id::uuid = v_uid THEN
    RETURN true;
  END IF;

  RETURN COALESCE(
    (SELECT em.can_manage_members FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid),
    false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION can_manage_event_members(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION can_manage_event_members(text) FROM anon;
GRANT EXECUTE ON FUNCTION can_manage_event_members(text) TO authenticated;

-- ─── Recreate RLS policies with new 1-param helper ──────────────────────────

CREATE POLICY "admin_select_event_members" ON event_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('Admin', 'Super Admin', 'Amministrazione')
    )
  );

CREATE POLICY "member_select_event_members" ON event_members FOR SELECT
  TO authenticated
  USING (
    can_access_event(event_members.event_id)
  );

-- ─── RPC: upsert_event_member ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_event_member(
  p_event_id text,
  p_user_id uuid,
  p_member_role text,
  p_can_manage_members boolean,
  p_can_manage_budget boolean,
  p_can_manage_documents boolean,
  p_can_manage_payments boolean,
  p_can_manage_creative boolean,
  p_can_manage_registration boolean,
  p_can_access_onsite boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_is_admin boolean;
  v_is_owner boolean := false;
  v_existing_id uuid;
  v_result_id uuid;
  v_pm_id text;
  v_caller_members boolean;
  v_caller_budget boolean;
  v_caller_documents boolean;
  v_caller_payments boolean;
  v_caller_creative boolean;
  v_caller_registration boolean;
  v_caller_onsite boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  IF p_member_role NOT IN ('responsabile', 'collaboratore', 'operativo', 'sola_lettura') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED';
  END IF;

  SELECT role INTO v_caller_role FROM profiles WHERE id = v_uid;
  v_is_admin := v_caller_role IN ('Admin', 'Super Admin', 'Amministrazione');

  SELECT project_manager_id INTO v_pm_id FROM events WHERE id = p_event_id;
  IF v_pm_id IS NOT NULL AND _is_valid_uuid(v_pm_id) AND v_pm_id::uuid = v_uid THEN
    v_is_owner := true;
  END IF;

  -- Authorization check
  IF NOT v_is_admin AND NOT v_is_owner THEN
    IF NOT COALESCE(
      (SELECT em.can_manage_members FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid),
      false
    ) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
  END IF;

  -- Anti-escalation for non-admin, non-owner
  IF NOT v_is_admin AND NOT v_is_owner THEN
    SELECT
      COALESCE(em.can_manage_members, false),
      COALESCE(em.can_manage_budget, false),
      COALESCE(em.can_manage_documents, false),
      COALESCE(em.can_manage_payments, false),
      COALESCE(em.can_manage_creative, false),
      COALESCE(em.can_manage_registration, false),
      COALESCE(em.can_access_onsite, false)
    INTO
      v_caller_members, v_caller_budget, v_caller_documents,
      v_caller_payments, v_caller_creative, v_caller_registration, v_caller_onsite
    FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;

    IF p_can_manage_members AND NOT COALESCE(v_caller_members, false) THEN
      RAISE EXCEPTION 'PERMISSION_ESCALATION';
    END IF;
    IF p_can_manage_budget AND NOT COALESCE(v_caller_budget, false) THEN
      RAISE EXCEPTION 'PERMISSION_ESCALATION';
    END IF;
    IF p_can_manage_documents AND NOT COALESCE(v_caller_documents, false) THEN
      RAISE EXCEPTION 'PERMISSION_ESCALATION';
    END IF;
    IF p_can_manage_payments AND NOT COALESCE(v_caller_payments, false) THEN
      RAISE EXCEPTION 'PERMISSION_ESCALATION';
    END IF;
    IF p_can_manage_creative AND NOT COALESCE(v_caller_creative, false) THEN
      RAISE EXCEPTION 'PERMISSION_ESCALATION';
    END IF;
    IF p_can_manage_registration AND NOT COALESCE(v_caller_registration, false) THEN
      RAISE EXCEPTION 'PERMISSION_ESCALATION';
    END IF;
    IF p_can_access_onsite AND NOT COALESCE(v_caller_onsite, false) THEN
      RAISE EXCEPTION 'PERMISSION_ESCALATION';
    END IF;
  END IF;

  -- Upsert
  SELECT id INTO v_existing_id FROM event_members WHERE event_id = p_event_id AND user_id = p_user_id;

  IF v_existing_id IS NOT NULL THEN
    UPDATE event_members SET
      member_role = p_member_role,
      can_manage_members = p_can_manage_members,
      can_manage_budget = p_can_manage_budget,
      can_manage_documents = p_can_manage_documents,
      can_manage_payments = p_can_manage_payments,
      can_manage_creative = p_can_manage_creative,
      can_manage_registration = p_can_manage_registration,
      can_access_onsite = p_can_access_onsite,
      updated_at = now()
    WHERE id = v_existing_id;
    RETURN v_existing_id;
  ELSE
    INSERT INTO event_members (
      event_id, user_id, member_role,
      can_manage_members, can_manage_budget, can_manage_documents,
      can_manage_payments, can_manage_creative, can_manage_registration,
      can_access_onsite, invited_by
    ) VALUES (
      p_event_id, p_user_id, p_member_role,
      p_can_manage_members, p_can_manage_budget, p_can_manage_documents,
      p_can_manage_payments, p_can_manage_creative, p_can_manage_registration,
      p_can_access_onsite, v_uid
    ) RETURNING id INTO v_result_id;
    RETURN v_result_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION upsert_event_member(text, uuid, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION upsert_event_member(text, uuid, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION upsert_event_member(text, uuid, text, boolean, boolean, boolean, boolean, boolean, boolean, boolean) TO authenticated;

-- ─── RPC: remove_event_member ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION remove_event_member(
  p_event_id text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_is_admin boolean;
  v_member_id uuid;
  v_pm_id text;
  v_manager_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND';
  END IF;

  SELECT id INTO v_member_id FROM event_members WHERE event_id = p_event_id AND user_id = p_user_id;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'MEMBER_NOT_FOUND';
  END IF;

  SELECT role INTO v_caller_role FROM profiles WHERE id = v_uid;
  v_is_admin := v_caller_role IN ('Admin', 'Super Admin', 'Amministrazione');

  -- Authorization
  IF NOT v_is_admin THEN
    SELECT project_manager_id INTO v_pm_id FROM events WHERE id = p_event_id;
    IF NOT (v_pm_id IS NOT NULL AND _is_valid_uuid(v_pm_id) AND v_pm_id::uuid = v_uid) THEN
      IF NOT COALESCE(
        (SELECT em.can_manage_members FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid),
        false
      ) THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
      END IF;
    END IF;
  END IF;

  -- Owner protection: non-admin cannot remove the project_manager
  IF NOT v_is_admin THEN
    SELECT project_manager_id INTO v_pm_id FROM events WHERE id = p_event_id;
    IF v_pm_id IS NOT NULL AND _is_valid_uuid(v_pm_id) AND v_pm_id::uuid = p_user_id THEN
      RAISE EXCEPTION 'EVENT_OWNER_PROTECTED';
    END IF;
  END IF;

  -- Last manager protection (applies to everyone including admins)
  SELECT count(*) INTO v_manager_count
  FROM event_members em
  WHERE em.event_id = p_event_id
    AND em.user_id != p_user_id
    AND (em.member_role = 'responsabile' OR em.can_manage_members = true);

  IF v_manager_count = 0 THEN
    RAISE EXCEPTION 'LAST_EVENT_MANAGER';
  END IF;

  DELETE FROM event_members WHERE id = v_member_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION remove_event_member(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION remove_event_member(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION remove_event_member(text, uuid) TO authenticated;
