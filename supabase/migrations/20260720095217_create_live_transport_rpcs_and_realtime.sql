/*
# Create live transport RPCs and Realtime foundation

## Summary
Five RPCs for live transport operations: reading a manifest, boarding via assignment ID,
boarding via QR scan, transitioning assignment status, and transitioning movement lifecycle.
Also adds transport tables to the supabase_realtime publication for live UI updates.

## New Functions

### get_transport_manifest(p_movement_id uuid) -> jsonb
- Read-only: returns movement details, vehicles with counts, assignments with safe
  participant identity (first_name, last_name, company only).
- No locking required.

### board_transport_assignment(p_assignment_id uuid) -> jsonb
- Atomic boarding: locks assignment + movement, enforces open status and assigned state,
  sets boarded_at/boarded_by, returns updated counts.

### board_transport_participant_by_qr(p_movement_id uuid, p_qr_token text) -> jsonb
- QR-based boarding: validates token as UUID, finds registration + assignment within
  the movement, applies same atomic boarding logic.

### transition_transport_assignment(p_assignment_id uuid, p_target_status text) -> jsonb
- Status transitions: assigned->no_show, no_show->assigned, boarded->assigned (undo).
- Never allows direct transition to boarded.
- Returns updated counts.

### transition_transport_movement(p_movement_id uuid, p_target_status text) -> void
- Movement lifecycle: draft->open, open->closed, closed->open, closed->departed,
  draft/open->cancelled.
- Enforces vehicle/participant/manifest prerequisites.

## Realtime
- transport_movements, transport_vehicles, transport_assignments added to supabase_realtime.

## Security
- All SECURITY DEFINER, search_path = public, pg_temp.
- EXECUTE revoked from PUBLIC/anon, granted to authenticated only.
- Authorization via has_event_permission (can_access_onsite OR can_manage_registration).

## Important Notes
1. No table structure changes.
2. No RLS policy changes.
3. No existing RPCs modified.
4. Privacy: manifest excludes email, phone, dietary, accessibility, custom_answers,
   qr_token, driver_phone, and internal audit user IDs.
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- Helper: compute counts for a movement (used by multiple RPCs)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _transport_counts(p_movement_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'expected', count(*) FILTER (WHERE assignment_status IN ('assigned','boarded')),
    'boarded', count(*) FILTER (WHERE assignment_status = 'boarded'),
    'missing', count(*) FILTER (WHERE assignment_status = 'assigned'),
    'no_show', count(*) FILTER (WHERE assignment_status = 'no_show')
  )
  FROM transport_assignments
  WHERE movement_id = p_movement_id
    AND assignment_status <> 'cancelled';
$$;

REVOKE EXECUTE ON FUNCTION _transport_counts FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION _transport_counts FROM anon;
GRANT EXECUTE ON FUNCTION _transport_counts TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Helper: per-vehicle counts
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _transport_vehicle_counts(p_movement_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_object_agg(vehicle_id, counts), '{}'::jsonb)
  FROM (
    SELECT vehicle_id,
      jsonb_build_object(
        'expected', count(*) FILTER (WHERE assignment_status IN ('assigned','boarded')),
        'boarded', count(*) FILTER (WHERE assignment_status = 'boarded'),
        'missing', count(*) FILTER (WHERE assignment_status = 'assigned'),
        'no_show', count(*) FILTER (WHERE assignment_status = 'no_show')
      ) as counts
    FROM transport_assignments
    WHERE movement_id = p_movement_id
      AND assignment_status <> 'cancelled'
    GROUP BY vehicle_id
  ) sub;
$$;

REVOKE EXECUTE ON FUNCTION _transport_vehicle_counts FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION _transport_vehicle_counts FROM anon;
GRANT EXECUTE ON FUNCTION _transport_vehicle_counts TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. get_transport_manifest
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_transport_manifest(p_movement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- Global counts
  v_global_counts := _transport_counts(p_movement_id);
  v_vehicle_counts := _transport_vehicle_counts(p_movement_id);

  -- Vehicles
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', tv.id,
      'label', tv.label,
      'vehicle_type', tv.vehicle_type,
      'capacity', tv.capacity,
      'expected_count', coalesce((v_vehicle_counts->tv.id::text)->>'expected', '0')::int,
      'boarded_count', coalesce((v_vehicle_counts->tv.id::text)->>'boarded', '0')::int,
      'missing_count', coalesce((v_vehicle_counts->tv.id::text)->>'missing', '0')::int,
      'no_show_count', coalesce((v_vehicle_counts->tv.id::text)->>'no_show', '0')::int
    ) ORDER BY tv.sort_order, tv.label
  ), '[]'::jsonb)
  INTO v_vehicles
  FROM transport_vehicles tv
  WHERE tv.movement_id = p_movement_id;

  -- Assignments with safe participant data
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'assignment_id', ta.id,
      'registration_id', ta.registration_id,
      'vehicle_id', ta.vehicle_id,
      'first_name', er.first_name,
      'last_name', er.last_name,
      'company', er.company,
      'assignment_status', ta.assignment_status,
      'boarded_at', ta.boarded_at
    ) ORDER BY er.last_name, er.first_name
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
$$;

REVOKE EXECUTE ON FUNCTION get_transport_manifest FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_transport_manifest FROM anon;
GRANT EXECUTE ON FUNCTION get_transport_manifest TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. board_transport_assignment
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION board_transport_assignment(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- Lock assignment
  SELECT ta.id, ta.event_id, ta.movement_id, ta.vehicle_id, ta.registration_id, ta.assignment_status
    INTO v_assignment
    FROM transport_assignments ta
    WHERE ta.id = p_assignment_id
    FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND';
  END IF;

  v_event_id := v_assignment.event_id;

  -- Authorization
  IF NOT (has_event_permission(v_event_id, 'can_access_onsite')
          OR has_event_permission(v_event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Lock movement
  SELECT movement_status INTO v_movement_status
    FROM transport_movements
    WHERE id = v_assignment.movement_id
    FOR UPDATE;

  IF v_movement_status <> 'open' THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_OPEN';
  END IF;

  -- Status checks
  IF v_assignment.assignment_status = 'boarded' THEN
    RAISE EXCEPTION 'ALREADY_BOARDED';
  END IF;

  IF v_assignment.assignment_status NOT IN ('assigned') THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_BOARDABLE';
  END IF;

  -- Perform boarding
  UPDATE transport_assignments
  SET assignment_status = 'boarded',
      boarded_at = now(),
      boarded_by = v_uid
  WHERE id = p_assignment_id;

  -- Fetch safe participant data
  SELECT er.first_name, er.last_name, er.company
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
$$;

REVOKE EXECUTE ON FUNCTION board_transport_assignment FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION board_transport_assignment FROM anon;
GRANT EXECUTE ON FUNCTION board_transport_assignment TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. board_transport_participant_by_qr
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION board_transport_participant_by_qr(
  p_movement_id uuid,
  p_qr_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- Safe UUID cast
  BEGIN
    v_token_uuid := p_qr_token::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'INVALID_QR';
  END;

  -- Lock movement
  SELECT event_id, movement_status
    INTO v_event_id, v_movement_status
    FROM transport_movements
    WHERE id = p_movement_id
    FOR UPDATE;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_FOUND';
  END IF;

  -- Authorization
  IF NOT (has_event_permission(v_event_id, 'can_access_onsite')
          OR has_event_permission(v_event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  IF v_movement_status <> 'open' THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_OPEN';
  END IF;

  -- Find registration by QR token within this event
  SELECT id INTO v_registration_id
    FROM event_registrations
    WHERE qr_token = v_token_uuid
      AND event_id = v_event_id
    FOR UPDATE;

  IF v_registration_id IS NULL THEN
    RAISE EXCEPTION 'PARTICIPANT_NOT_FOUND';
  END IF;

  -- Find assignment for this participant in this movement
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

  -- Perform boarding
  UPDATE transport_assignments
  SET assignment_status = 'boarded',
      boarded_at = now(),
      boarded_by = v_uid
  WHERE id = v_assignment.id;

  -- Fetch safe participant data
  SELECT er.first_name, er.last_name, er.company
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
$$;

REVOKE EXECUTE ON FUNCTION board_transport_participant_by_qr FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION board_transport_participant_by_qr FROM anon;
GRANT EXECUTE ON FUNCTION board_transport_participant_by_qr TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. transition_transport_assignment
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION transition_transport_assignment(
  p_assignment_id uuid,
  p_target_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_assignment record;
  v_movement_status text;
  v_event_id text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  -- Validate target status (never allow 'boarded' through this RPC)
  IF p_target_status NOT IN ('assigned', 'no_show') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  -- Lock assignment
  SELECT ta.id, ta.event_id, ta.movement_id, ta.assignment_status
    INTO v_assignment
    FROM transport_assignments ta
    WHERE ta.id = p_assignment_id
    FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND';
  END IF;

  v_event_id := v_assignment.event_id;

  -- Authorization
  IF NOT (has_event_permission(v_event_id, 'can_access_onsite')
          OR has_event_permission(v_event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Lock movement
  SELECT movement_status INTO v_movement_status
    FROM transport_movements
    WHERE id = v_assignment.movement_id
    FOR UPDATE;

  IF v_movement_status <> 'open' THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_OPEN';
  END IF;

  -- Validate transitions
  IF p_target_status = 'no_show' THEN
    IF v_assignment.assignment_status <> 'assigned' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
    UPDATE transport_assignments
    SET assignment_status = 'no_show'
    WHERE id = p_assignment_id;

  ELSIF p_target_status = 'assigned' THEN
    IF v_assignment.assignment_status = 'no_show' THEN
      UPDATE transport_assignments
      SET assignment_status = 'assigned'
      WHERE id = p_assignment_id;
    ELSIF v_assignment.assignment_status = 'boarded' THEN
      -- Undo boarding
      UPDATE transport_assignments
      SET assignment_status = 'assigned',
          boarded_at = NULL,
          boarded_by = NULL
      WHERE id = p_assignment_id;
    ELSE
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'assignment_id', p_assignment_id,
    'new_status', p_target_status,
    'totals', _transport_counts(v_assignment.movement_id),
    'vehicle_counts', _transport_vehicle_counts(v_assignment.movement_id)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION transition_transport_assignment FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION transition_transport_assignment FROM anon;
GRANT EXECUTE ON FUNCTION transition_transport_assignment TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. transition_transport_movement
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION transition_transport_movement(
  p_movement_id uuid,
  p_target_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_movement record;
  v_vehicle_count integer;
  v_active_assignment_count integer;
  v_still_assigned_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_movement_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  IF p_target_status NOT IN ('open','closed','departed','cancelled') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  -- Lock movement
  SELECT id, event_id, movement_status
    INTO v_movement
    FROM transport_movements
    WHERE id = p_movement_id
    FOR UPDATE;

  IF v_movement.id IS NULL THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_FOUND';
  END IF;

  -- Authorization
  IF NOT (has_event_permission(v_movement.event_id, 'can_access_onsite')
          OR has_event_permission(v_movement.event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Validate transition
  CASE
    WHEN v_movement.movement_status = 'draft' AND p_target_status = 'open' THEN
      -- Requires at least one vehicle
      SELECT count(*) INTO v_vehicle_count
        FROM transport_vehicles WHERE movement_id = p_movement_id;
      IF v_vehicle_count = 0 THEN
        RAISE EXCEPTION 'NO_VEHICLES';
      END IF;
      UPDATE transport_movements
      SET movement_status = 'open'
      WHERE id = p_movement_id;

    WHEN v_movement.movement_status = 'open' AND p_target_status = 'closed' THEN
      -- Requires at least one non-cancelled assignment
      SELECT count(*) INTO v_active_assignment_count
        FROM transport_assignments
        WHERE movement_id = p_movement_id
          AND assignment_status <> 'cancelled';
      IF v_active_assignment_count = 0 THEN
        RAISE EXCEPTION 'NO_PARTICIPANTS';
      END IF;
      -- Requires zero assignments still in 'assigned' status
      SELECT count(*) INTO v_still_assigned_count
        FROM transport_assignments
        WHERE movement_id = p_movement_id
          AND assignment_status = 'assigned';
      IF v_still_assigned_count > 0 THEN
        RAISE EXCEPTION 'MANIFEST_INCOMPLETE';
      END IF;
      UPDATE transport_movements
      SET movement_status = 'closed',
          closed_at = now(),
          closed_by = v_uid
      WHERE id = p_movement_id;

    WHEN v_movement.movement_status = 'closed' AND p_target_status = 'open' THEN
      UPDATE transport_movements
      SET movement_status = 'open',
          closed_at = NULL,
          closed_by = NULL
      WHERE id = p_movement_id;

    WHEN v_movement.movement_status = 'closed' AND p_target_status = 'departed' THEN
      -- Preserve closure audit
      UPDATE transport_movements
      SET movement_status = 'departed'
      WHERE id = p_movement_id;

    WHEN v_movement.movement_status = 'draft' AND p_target_status = 'cancelled' THEN
      UPDATE transport_movements
      SET movement_status = 'cancelled'
      WHERE id = p_movement_id;

    WHEN v_movement.movement_status = 'open' AND p_target_status = 'cancelled' THEN
      UPDATE transport_movements
      SET movement_status = 'cancelled'
      WHERE id = p_movement_id;

    ELSE
      RAISE EXCEPTION 'INVALID_TRANSITION';
  END CASE;
END;
$$;

REVOKE EXECUTE ON FUNCTION transition_transport_movement FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION transition_transport_movement FROM anon;
GRANT EXECUTE ON FUNCTION transition_transport_movement TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- REALTIME: add transport tables to supabase_realtime publication
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'transport_movements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transport_movements;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'transport_vehicles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transport_vehicles;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'transport_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transport_assignments;
  END IF;
END $$;