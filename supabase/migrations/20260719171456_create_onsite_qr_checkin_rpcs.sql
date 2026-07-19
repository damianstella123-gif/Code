/*
# On-Site QR Check-In RPCs

## Summary
Creates 3 SECURITY DEFINER RPCs for on-site QR-based check-in flow.
All require auth.uid() and event-level permission
(can_manage_registration OR can_access_onsite).

## New Functions
1. lookup_onsite_registration_by_qr(p_event_id, p_qr_token)
   - Validates QR token format, finds registration by event_id + qr_token.
   - Returns safe participant fields (no email, phone, custom_answers, marketing).
2. onsite_check_in_by_qr(p_event_id, p_qr_token)
   - Same validation + locks row FOR UPDATE.
   - Requires status = confirmed; rejects already-checked-in.
   - Sets checked_in_at = now(), checked_in_by = auth.uid().
3. onsite_undo_check_in(p_registration_id)
   - Locks and clears checked_in_at / checked_in_by.
   - Authorizes via the registration's event_id.

## Security
- All SECURITY DEFINER with search_path = public, pg_temp.
- REVOKE EXECUTE from PUBLIC, anon.
- GRANT EXECUTE to authenticated only.
- No RLS policy changes on event_registrations.
*/

-- 1. lookup_onsite_registration_by_qr
CREATE OR REPLACE FUNCTION lookup_onsite_registration_by_qr(
  p_event_id text,
  p_qr_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_token uuid;
  v_reg record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT has_event_permission(p_event_id, 'can_manage_registration')
     AND NOT has_event_permission(p_event_id, 'can_access_onsite') THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  IF p_qr_token IS NULL OR trim(p_qr_token) = '' THEN
    RETURN jsonb_build_object('error', 'INVALID_QR');
  END IF;

  BEGIN
    v_token := p_qr_token::uuid;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('error', 'INVALID_QR');
  END;

  SELECT id, first_name, last_name, company, job_title,
         registration_status, checked_in_at,
         dietary_requirements, accessibility_requirements
    INTO v_reg
    FROM event_registrations
   WHERE event_id = p_event_id AND qr_token = v_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'REGISTRATION_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object(
    'registration_id', v_reg.id,
    'first_name', v_reg.first_name,
    'last_name', v_reg.last_name,
    'company', v_reg.company,
    'job_title', v_reg.job_title,
    'registration_status', v_reg.registration_status,
    'checked_in_at', v_reg.checked_in_at,
    'dietary_requirements', v_reg.dietary_requirements,
    'accessibility_requirements', v_reg.accessibility_requirements
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION lookup_onsite_registration_by_qr(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION lookup_onsite_registration_by_qr(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION lookup_onsite_registration_by_qr(text, text) TO authenticated;


-- 2. onsite_check_in_by_qr
CREATE OR REPLACE FUNCTION onsite_check_in_by_qr(
  p_event_id text,
  p_qr_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_token uuid;
  v_reg record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT has_event_permission(p_event_id, 'can_manage_registration')
     AND NOT has_event_permission(p_event_id, 'can_access_onsite') THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  IF p_qr_token IS NULL OR trim(p_qr_token) = '' THEN
    RETURN jsonb_build_object('error', 'INVALID_QR');
  END IF;

  BEGIN
    v_token := p_qr_token::uuid;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('error', 'INVALID_QR');
  END;

  SELECT id, first_name, last_name, company, job_title,
         registration_status, checked_in_at,
         dietary_requirements, accessibility_requirements
    INTO v_reg
    FROM event_registrations
   WHERE event_id = p_event_id AND qr_token = v_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'REGISTRATION_NOT_FOUND');
  END IF;

  IF v_reg.registration_status <> 'confirmed' THEN
    RETURN jsonb_build_object('error', 'NOT_CONFIRMED');
  END IF;

  IF v_reg.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', 'ALREADY_CHECKED_IN',
      'checked_in_at', v_reg.checked_in_at
    );
  END IF;

  UPDATE event_registrations
     SET checked_in_at = now(),
         checked_in_by = v_uid
   WHERE id = v_reg.id;

  RETURN jsonb_build_object(
    'registration_id', v_reg.id,
    'first_name', v_reg.first_name,
    'last_name', v_reg.last_name,
    'company', v_reg.company,
    'job_title', v_reg.job_title,
    'registration_status', 'confirmed',
    'checked_in_at', now(),
    'dietary_requirements', v_reg.dietary_requirements,
    'accessibility_requirements', v_reg.accessibility_requirements
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION onsite_check_in_by_qr(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION onsite_check_in_by_qr(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION onsite_check_in_by_qr(text, text) TO authenticated;


-- 3. onsite_undo_check_in
CREATE OR REPLACE FUNCTION onsite_undo_check_in(
  p_registration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_reg record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  SELECT id, event_id
    INTO v_reg
    FROM event_registrations
   WHERE id = p_registration_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'REGISTRATION_NOT_FOUND');
  END IF;

  IF NOT has_event_permission(v_reg.event_id, 'can_manage_registration')
     AND NOT has_event_permission(v_reg.event_id, 'can_access_onsite') THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  UPDATE event_registrations
     SET checked_in_at = NULL,
         checked_in_by = NULL
   WHERE id = p_registration_id;

  RETURN jsonb_build_object(
    'registration_id', p_registration_id,
    'status', 'CHECK_IN_REMOVED'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION onsite_undo_check_in(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION onsite_undo_check_in(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION onsite_undo_check_in(uuid) TO authenticated;
