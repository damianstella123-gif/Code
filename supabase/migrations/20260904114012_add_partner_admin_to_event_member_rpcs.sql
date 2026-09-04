/*
# Grant Partner role admin-equivalent access in event team management RPCs

1. Modified Functions
   - `upsert_event_member` — Partner is now treated as admin-equivalent
   - `remove_event_member` — Partner is now treated as admin-equivalent

2. Changes
   - In both functions, the `v_is_admin` check now includes 'Partner' alongside
     'Admin', 'Super Admin', and 'Amministrazione'.

3. Security
   - SECURITY DEFINER, search_path = public, pg_temp — unchanged
   - EXECUTE revoked from PUBLIC and anon, granted to authenticated — unchanged
   - All other validations (anti-escalation, owner protection, last-manager
     protection, role whitelist, role consistency) are unchanged.

4. Important Notes
   - No table, RLS policy, or data changes.
   - Only these two functions are affected — no other admin checks are modified.
*/

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
  v_target_is_pm boolean := false;
  v_existing_is_manager boolean;
  v_would_remain_manager boolean;
  v_other_managers integer;
  v_caller_members boolean;
  v_caller_budget boolean;
  v_caller_documents boolean;
  v_caller_payments boolean;
  v_caller_creative boolean;
  v_caller_registration boolean;
  v_caller_onsite boolean;
BEGIN
  -- ── Authentication ────────────────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- ── Event exists ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND';
  END IF;

  -- ── Profile exists ────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  -- ── Role whitelist ────────────────────────────────────────────────────────
  IF p_member_role NOT IN ('responsabile', 'collaboratore', 'operativo', 'sola_lettura') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED';
  END IF;

  -- ── Role consistency: responsabile must have can_manage_members ────────────
  IF p_member_role = 'responsabile' AND p_can_manage_members IS NOT TRUE THEN
    RAISE EXCEPTION 'INVALID_RESPONSABILE_PERMISSIONS';
  END IF;

  -- ── Role consistency: sola_lettura must have all permissions false ─────────
  IF p_member_role = 'sola_lettura' AND (
    p_can_manage_members OR p_can_manage_budget OR p_can_manage_documents OR
    p_can_manage_payments OR p_can_manage_creative OR p_can_manage_registration OR
    p_can_access_onsite
  ) THEN
    RAISE EXCEPTION 'INVALID_READONLY_PERMISSIONS';
  END IF;

  -- ── Caller identity ───────────────────────────────────────────────────────
  SELECT role INTO v_caller_role FROM profiles WHERE id = v_uid;
  v_is_admin := v_caller_role IN ('Admin', 'Super Admin', 'Amministrazione', 'Partner');

  SELECT project_manager_id INTO v_pm_id FROM events WHERE id = p_event_id;
  IF v_pm_id IS NOT NULL AND _is_valid_uuid(v_pm_id) AND v_pm_id::uuid = v_uid THEN
    v_is_owner := true;
  END IF;

  -- ── Authorization: caller can manage members ──────────────────────────────
  IF NOT v_is_admin AND NOT v_is_owner THEN
    IF NOT COALESCE(
      (SELECT em.can_manage_members FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid),
      false
    ) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
  END IF;

  -- ── Anti-escalation for non-admin, non-owner ──────────────────────────────
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

  -- ── Determine if target is the project manager ────────────────────────────
  IF v_pm_id IS NOT NULL AND _is_valid_uuid(v_pm_id) AND v_pm_id::uuid = p_user_id THEN
    v_target_is_pm := true;
  END IF;

  -- ── Check if membership already exists (update path) ──────────────────────
  SELECT id INTO v_existing_id FROM event_members WHERE event_id = p_event_id AND user_id = p_user_id;

  IF v_existing_id IS NOT NULL THEN
    -- ── EVENT OWNER PROTECTION on update ──────────────────────────────────
    IF v_target_is_pm THEN
      IF NOT v_is_admin AND v_uid != p_user_id THEN
        RAISE EXCEPTION 'EVENT_OWNER_PROTECTED';
      END IF;
    END IF;

    -- ── LAST MANAGER PROTECTION on update ─────────────────────────────────
    SELECT (em.member_role = 'responsabile' OR em.can_manage_members = true)
    INTO v_existing_is_manager
    FROM event_members em WHERE em.id = v_existing_id;

    v_would_remain_manager := (p_member_role = 'responsabile' OR p_can_manage_members = true);

    IF v_existing_is_manager AND NOT v_would_remain_manager THEN
      SELECT count(*) INTO v_other_managers
      FROM event_members em
      WHERE em.event_id = p_event_id
        AND em.user_id != p_user_id
        AND (em.member_role = 'responsabile' OR em.can_manage_members = true);

      IF v_other_managers = 0 THEN
        RAISE EXCEPTION 'LAST_EVENT_MANAGER';
      END IF;
    END IF;

    -- ── Perform update ────────────────────────────────────────────────────
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
    -- ── Insert new membership ─────────────────────────────────────────────
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

-- Permissions (idempotent re-grant)
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
  v_is_admin := v_caller_role IN ('Admin', 'Super Admin', 'Amministrazione', 'Partner');

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
