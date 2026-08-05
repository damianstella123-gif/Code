/*
# Read RPCs source PII from encrypted columns, plaintext as fallback

Internal read RPCs that project first_name / last_name / email / phone /
dietary_requirements / accessibility_requirements from event_registrations
now read them as `COALESCE(_dec_pii(<col>_enc), <col>)`, matching the
compatibility pattern used by `event_registrations_readable`. External
behaviour of every function — parameters, return shape, permissions,
locking, transitions, ordering — is unchanged. Because dual-write already
populates the _enc columns for every new/updated row and every existing
row was backfilled, the fallback is only exercised on legacy data whose
_enc column happens to be NULL (e.g. an empty-string plaintext, which
keeps returning empty).

Functions updated:
- lookup_onsite_registration_by_qr
- onsite_check_in_by_qr
- get_transport_manifest
- get_transport_boarding_pool
- board_transport_assignment
- board_transport_participant_by_qr
- board_transport_participant_direct
- get_registration_by_manage_token

`get_registration_by_manage_token` reads only phone / dietary /
accessibility from the PII set (name and email are intentionally not
exposed through the manage-token flow). Those three now decrypt with
fallback; everything else is untouched.

The two write RPCs are NOT modified in this migration.
*/

-- ─────────────────────────────────────────────────────────────────────
-- lookup_onsite_registration_by_qr
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lookup_onsite_registration_by_qr(
  p_event_id text, p_qr_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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

  SELECT er.id,
         COALESCE(public._dec_pii(er.first_name_enc),                 er.first_name)                 AS first_name,
         COALESCE(public._dec_pii(er.last_name_enc),                  er.last_name)                  AS last_name,
         er.company,
         er.job_title,
         er.registration_status,
         er.checked_in_at,
         COALESCE(public._dec_pii(er.dietary_requirements_enc),       er.dietary_requirements)       AS dietary_requirements,
         COALESCE(public._dec_pii(er.accessibility_requirements_enc), er.accessibility_requirements) AS accessibility_requirements
  INTO v_reg
  FROM event_registrations er
  WHERE er.event_id = p_event_id AND er.qr_token = v_token;

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
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- onsite_check_in_by_qr
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.onsite_check_in_by_qr(
  p_event_id text, p_qr_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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

  SELECT er.id,
         COALESCE(public._dec_pii(er.first_name_enc),                 er.first_name)                 AS first_name,
         COALESCE(public._dec_pii(er.last_name_enc),                  er.last_name)                  AS last_name,
         er.company,
         er.job_title,
         er.registration_status,
         er.checked_in_at,
         COALESCE(public._dec_pii(er.dietary_requirements_enc),       er.dietary_requirements)       AS dietary_requirements,
         COALESCE(public._dec_pii(er.accessibility_requirements_enc), er.accessibility_requirements) AS accessibility_requirements
  INTO v_reg
  FROM event_registrations er
  WHERE er.event_id = p_event_id AND er.qr_token = v_token
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
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- get_transport_manifest
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_transport_manifest(
  p_movement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_movement record;
  v_vehicles jsonb;
  v_assignments jsonb;
  v_global_counts jsonb;
  v_vehicle_counts jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_movement_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  SELECT id, event_id, label, movement_type, departure_at, origin, destination, movement_status
  INTO v_movement
  FROM transport_movements
  WHERE id = p_movement_id;

  IF v_movement.id IS NULL THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_FOUND';
  END IF;

  IF NOT (has_event_permission(v_movement.event_id, 'can_access_onsite')
       OR has_event_permission(v_movement.event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  v_global_counts := _transport_counts(p_movement_id);
  v_vehicle_counts := _transport_vehicle_counts(p_movement_id);

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', tv.id,
      'label', tv.label,
      'vehicle_type', tv.vehicle_type,
      'capacity', tv.capacity,
      'expected_count', coalesce((v_vehicle_counts->tv.id::text)->>'expected', '0')::int,
      'boarded_count',  coalesce((v_vehicle_counts->tv.id::text)->>'boarded',  '0')::int,
      'missing_count',  coalesce((v_vehicle_counts->tv.id::text)->>'missing',  '0')::int,
      'no_show_count',  coalesce((v_vehicle_counts->tv.id::text)->>'no_show',  '0')::int
    ) ORDER BY tv.sort_order, tv.label
  ), '[]'::jsonb)
  INTO v_vehicles
  FROM transport_vehicles tv
  WHERE tv.movement_id = p_movement_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'assignment_id', ta.id,
      'registration_id', ta.registration_id,
      'vehicle_id', ta.vehicle_id,
      'first_name', COALESCE(public._dec_pii(er.first_name_enc), er.first_name),
      'last_name',  COALESCE(public._dec_pii(er.last_name_enc),  er.last_name),
      'company', er.company,
      'assignment_status', ta.assignment_status,
      'boarded_at', ta.boarded_at
    ) ORDER BY
      COALESCE(public._dec_pii(er.last_name_enc),  er.last_name),
      COALESCE(public._dec_pii(er.first_name_enc), er.first_name)
  ), '[]'::jsonb)
  INTO v_assignments
  FROM transport_assignments ta
  JOIN event_registrations er ON er.id = ta.registration_id
  WHERE ta.movement_id = p_movement_id
    AND ta.assignment_status <> 'cancelled';

  RETURN jsonb_build_object(
    'movement', jsonb_build_object(
      'id', v_movement.id,
      'event_id', v_movement.event_id,
      'label', v_movement.label,
      'movement_type', v_movement.movement_type,
      'departure_at', v_movement.departure_at,
      'origin', v_movement.origin,
      'destination', v_movement.destination,
      'movement_status', v_movement.movement_status
    ),
    'vehicles', v_vehicles,
    'assignments', v_assignments,
    'totals', v_global_counts
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- get_transport_boarding_pool
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_transport_boarding_pool(
  p_movement_id uuid
)
RETURNS TABLE(
  registration_id uuid, first_name text, last_name text, company text,
  phone text, registration_status text, assignment_id uuid, vehicle_id uuid,
  vehicle_label text, assignment_status text, boarded_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta.' USING ERRCODE = 'P0001';
  END IF;

  SELECT m.event_id INTO v_event_id
  FROM transport_movements m
  WHERE m.id = p_movement_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Movimento non trovato.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT has_event_permission(v_event_id, 'can_access_onsite')
     AND NOT has_event_permission(v_event_id, 'can_manage_registration') THEN
    RAISE EXCEPTION 'Permessi insufficienti per questa operazione.' USING ERRCODE = 'P0003';
  END IF;

  RETURN QUERY
  SELECT
    er.id AS registration_id,
    COALESCE(public._dec_pii(er.first_name_enc), er.first_name) AS first_name,
    COALESCE(public._dec_pii(er.last_name_enc),  er.last_name)  AS last_name,
    er.company,
    COALESCE(public._dec_pii(er.phone_enc),      er.phone)      AS phone,
    er.registration_status,
    ta.id AS assignment_id,
    ta.vehicle_id,
    tv.label AS vehicle_label,
    COALESCE(ta.assignment_status, 'unassigned') AS assignment_status,
    ta.boarded_at
  FROM event_registrations er
  LEFT JOIN transport_assignments ta
         ON ta.registration_id = er.id
        AND ta.movement_id = p_movement_id
        AND ta.assignment_status <> 'cancelled'
  LEFT JOIN transport_vehicles tv
         ON tv.id = ta.vehicle_id
  WHERE er.event_id = v_event_id
    AND er.registration_status <> 'cancelled'
  ORDER BY
    COALESCE(public._dec_pii(er.last_name_enc),  er.last_name),
    COALESCE(public._dec_pii(er.first_name_enc), er.first_name);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- board_transport_assignment
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.board_transport_assignment(
  p_assignment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_assignment record;
  v_movement_status text;
  v_event_id text;
  v_participant record;
  v_vehicle_label text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  SELECT ta.id, ta.event_id, ta.movement_id, ta.vehicle_id, ta.registration_id, ta.assignment_status
  INTO v_assignment
  FROM transport_assignments ta
  WHERE ta.id = p_assignment_id
  FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND';
  END IF;

  v_event_id := v_assignment.event_id;

  IF NOT (has_event_permission(v_event_id, 'can_access_onsite')
       OR has_event_permission(v_event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT movement_status INTO v_movement_status
  FROM transport_movements
  WHERE id = v_assignment.movement_id
  FOR UPDATE;

  IF v_movement_status <> 'open' THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_OPEN';
  END IF;

  IF v_assignment.assignment_status = 'boarded' THEN
    RAISE EXCEPTION 'ALREADY_BOARDED';
  END IF;

  IF v_assignment.assignment_status NOT IN ('assigned') THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_BOARDABLE';
  END IF;

  UPDATE transport_assignments
     SET assignment_status = 'boarded',
         boarded_at = now(),
         boarded_by = v_uid
   WHERE id = p_assignment_id;

  SELECT COALESCE(public._dec_pii(er.first_name_enc), er.first_name) AS first_name,
         COALESCE(public._dec_pii(er.last_name_enc),  er.last_name)  AS last_name,
         er.company
  INTO v_participant
  FROM event_registrations er
  WHERE er.id = v_assignment.registration_id;

  SELECT tv.label INTO v_vehicle_label
  FROM transport_vehicles tv
  WHERE tv.id = v_assignment.vehicle_id;

  RETURN jsonb_build_object(
    'assignment_id', p_assignment_id,
    'first_name', v_participant.first_name,
    'last_name', v_participant.last_name,
    'company', v_participant.company,
    'vehicle_label', v_vehicle_label,
    'boarded_at', now(),
    'totals', _transport_counts(v_assignment.movement_id),
    'vehicle_counts', _transport_vehicle_counts(v_assignment.movement_id)
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- board_transport_participant_by_qr
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.board_transport_participant_by_qr(
  p_movement_id uuid, p_qr_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_token_uuid uuid;
  v_event_id text;
  v_movement_status text;
  v_registration_id uuid;
  v_assignment record;
  v_participant record;
  v_vehicle_label text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_movement_id IS NULL OR trim(coalesce(p_qr_token, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  BEGIN
    v_token_uuid := p_qr_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'INVALID_QR';
  END;

  SELECT event_id, movement_status
  INTO v_event_id, v_movement_status
  FROM transport_movements
  WHERE id = p_movement_id
  FOR UPDATE;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_FOUND';
  END IF;

  IF NOT (has_event_permission(v_event_id, 'can_access_onsite')
       OR has_event_permission(v_event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  IF v_movement_status <> 'open' THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_OPEN';
  END IF;

  SELECT id INTO v_registration_id
  FROM event_registrations
  WHERE qr_token = v_token_uuid
    AND event_id = v_event_id
  FOR UPDATE;

  IF v_registration_id IS NULL THEN
    RAISE EXCEPTION 'PARTICIPANT_NOT_FOUND';
  END IF;

  SELECT ta.id, ta.vehicle_id, ta.assignment_status
  INTO v_assignment
  FROM transport_assignments ta
  WHERE ta.movement_id = p_movement_id
    AND ta.registration_id = v_registration_id
  FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'PARTICIPANT_NOT_ASSIGNED';
  END IF;

  IF v_assignment.assignment_status = 'boarded' THEN
    RAISE EXCEPTION 'ALREADY_BOARDED';
  END IF;

  IF v_assignment.assignment_status <> 'assigned' THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_BOARDABLE';
  END IF;

  UPDATE transport_assignments
     SET assignment_status = 'boarded',
         boarded_at = now(),
         boarded_by = v_uid
   WHERE id = v_assignment.id;

  SELECT COALESCE(public._dec_pii(er.first_name_enc), er.first_name) AS first_name,
         COALESCE(public._dec_pii(er.last_name_enc),  er.last_name)  AS last_name,
         er.company
  INTO v_participant
  FROM event_registrations er
  WHERE er.id = v_registration_id;

  SELECT tv.label INTO v_vehicle_label
  FROM transport_vehicles tv
  WHERE tv.id = v_assignment.vehicle_id;

  RETURN jsonb_build_object(
    'assignment_id', v_assignment.id,
    'first_name', v_participant.first_name,
    'last_name', v_participant.last_name,
    'company', v_participant.company,
    'vehicle_label', v_vehicle_label,
    'boarded_at', now(),
    'totals', _transport_counts(p_movement_id),
    'vehicle_counts', _transport_vehicle_counts(p_movement_id)
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- board_transport_participant_direct
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.board_transport_participant_direct(
  p_movement_id uuid, p_vehicle_id uuid, p_registration_id uuid
)
RETURNS TABLE(
  first_name text, last_name text, company text, phone text,
  vehicle_label text, boarded_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event_id text;
  v_movement_status text;
  v_vehicle_event text;
  v_vehicle_movement uuid;
  v_vehicle_capacity int;
  v_vehicle_label text;
  v_current_load int;
  v_reg_event text;
  v_existing_id uuid;
  v_existing_status text;
  v_now timestamptz := now();
  v_uid uuid := auth.uid();
  v_first text;
  v_last text;
  v_company text;
  v_phone text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta.' USING ERRCODE = 'P0001';
  END IF;

  SELECT m.event_id, m.movement_status INTO v_event_id, v_movement_status
  FROM transport_movements m
  WHERE m.id = p_movement_id
  FOR UPDATE;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Movimento non trovato.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT has_event_permission(v_event_id, 'can_access_onsite')
     AND NOT has_event_permission(v_event_id, 'can_manage_registration') THEN
    RAISE EXCEPTION 'Permessi insufficienti per questa operazione.' USING ERRCODE = 'P0003';
  END IF;

  IF v_movement_status <> 'open' THEN
    RAISE EXCEPTION 'Il movimento non è aperto per imbarco.' USING ERRCODE = 'P0004';
  END IF;

  SELECT tv.event_id, tv.movement_id, tv.capacity, tv.label
  INTO v_vehicle_event, v_vehicle_movement, v_vehicle_capacity, v_vehicle_label
  FROM transport_vehicles tv
  WHERE tv.id = p_vehicle_id
  FOR UPDATE;

  IF v_vehicle_event IS NULL OR v_vehicle_event <> v_event_id
     OR v_vehicle_movement <> p_movement_id THEN
    RAISE EXCEPTION 'Veicolo non valido per questo movimento.' USING ERRCODE = 'P0005';
  END IF;

  SELECT er.event_id,
         COALESCE(public._dec_pii(er.first_name_enc), er.first_name),
         COALESCE(public._dec_pii(er.last_name_enc),  er.last_name),
         er.company,
         COALESCE(public._dec_pii(er.phone_enc),      er.phone)
  INTO v_reg_event, v_first, v_last, v_company, v_phone
  FROM event_registrations er
  WHERE er.id = p_registration_id
    AND er.registration_status <> 'cancelled';

  IF v_reg_event IS NULL OR v_reg_event <> v_event_id THEN
    RAISE EXCEPTION 'Partecipante non trovato o non confermato.' USING ERRCODE = 'P0006';
  END IF;

  SELECT ta.id, ta.assignment_status INTO v_existing_id, v_existing_status
  FROM transport_assignments ta
  WHERE ta.movement_id = p_movement_id
    AND ta.registration_id = p_registration_id
    AND ta.assignment_status <> 'cancelled'
  FOR UPDATE;

  IF v_existing_status = 'boarded' THEN
    RAISE EXCEPTION 'Partecipante già imbarcato.' USING ERRCODE = 'P0007';
  END IF;

  SELECT count(*) INTO v_current_load
  FROM transport_assignments ta2
  WHERE ta2.vehicle_id = p_vehicle_id
    AND ta2.movement_id = p_movement_id
    AND ta2.assignment_status IN ('assigned', 'boarded');

  IF v_vehicle_capacity IS NOT NULL AND v_current_load >= v_vehicle_capacity THEN
    RAISE EXCEPTION 'Capienza veicolo raggiunta.' USING ERRCODE = 'P0008';
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE transport_assignments
       SET vehicle_id = p_vehicle_id,
           assignment_status = 'boarded',
           boarded_at = v_now,
           boarded_by = v_uid,
           updated_at = v_now
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO transport_assignments (
      event_id, movement_id, vehicle_id, registration_id,
      assignment_status, boarded_at, boarded_by, created_by
    ) VALUES (
      v_event_id, p_movement_id, p_vehicle_id, p_registration_id,
      'boarded', v_now, v_uid, v_uid
    );
  END IF;

  RETURN QUERY
  SELECT v_first, v_last, v_company, v_phone, v_vehicle_label, v_now;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- get_registration_by_manage_token
-- Only phone / dietary / accessibility require decryption; name and email
-- are intentionally not exposed through this flow.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_registration_by_manage_token(
  p_manage_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token_bytes bytea;
  v_hash        bytea;
  v_reg         record;
  v_site        record;
  v_event_title text;
  v_fields      jsonb;
BEGIN
  IF p_manage_token IS NULL
     OR length(p_manage_token) <> 64
     OR p_manage_token !~ '^[0-9a-fA-F]{64}$'
  THEN
    RETURN NULL;
  END IF;

  v_token_bytes := decode(p_manage_token, 'hex');
  v_hash := extensions.digest(v_token_bytes, 'sha256');

  SELECT r.id, r.site_id, r.event_id, r.registration_status,
         COALESCE(public._dec_pii(r.phone_enc),                     r.phone)                     AS phone,
         r.company, r.job_title,
         COALESCE(public._dec_pii(r.dietary_requirements_enc),      r.dietary_requirements)      AS dietary_requirements,
         COALESCE(public._dec_pii(r.accessibility_requirements_enc),r.accessibility_requirements)AS accessibility_requirements,
         r.marketing_consent, r.custom_answers,
         r.manage_token_expires_at
  INTO v_reg
  FROM event_registrations r
  WHERE r.manage_token_hash = v_hash
    AND r.manage_token_revoked_at IS NULL
    AND (r.manage_token_expires_at IS NULL OR r.manage_token_expires_at > now())
  LIMIT 1;

  IF v_reg IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.title, s.logo_url, s.theme
  INTO v_site
  FROM registration_sites s
  WHERE s.id = v_reg.site_id;

  SELECT e.title INTO v_event_title
  FROM events e
  WHERE e.id = v_reg.event_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'field_key', f.field_key,
      'label', f.label,
      'field_type', f.field_type,
      'required', f.required,
      'options', f.options,
      'placeholder', coalesce(f.placeholder, ''),
      'help_text', coalesce(f.help_text, '')
    ) ORDER BY f.sort_order
  ), '[]'::jsonb)
  INTO v_fields
  FROM registration_form_fields f
  WHERE f.site_id = v_reg.site_id
    AND f.is_active = true;

  RETURN jsonb_build_object(
    'registration_id',            v_reg.id,
    'registration_status',        v_reg.registration_status,
    'phone',                      v_reg.phone,
    'company',                    v_reg.company,
    'job_title',                  v_reg.job_title,
    'dietary_requirements',       v_reg.dietary_requirements,
    'accessibility_requirements', v_reg.accessibility_requirements,
    'marketing_consent',          v_reg.marketing_consent,
    'custom_answers',             v_reg.custom_answers,
    'manage_token_expires_at',    v_reg.manage_token_expires_at,
    'site_title',                 coalesce(v_site.title, ''),
    'site_logo_url',              v_site.logo_url,
    'site_theme',                 coalesce(v_site.theme, '{}'::jsonb),
    'event_title',                coalesce(v_event_title, ''),
    'fields',                     v_fields
  );
END;
$function$;
