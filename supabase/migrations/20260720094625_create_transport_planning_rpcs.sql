/*
# Create transport planning RPCs

## Summary
Four SECURITY DEFINER RPCs for transport planning: creating/editing movements,
managing vehicles, assigning participants to vehicles, and moving participants
between vehicles. All enforce authorization, state-machine guards, and capacity checks.

## New Functions

### save_transport_movement(p_movement_id, p_event_id, p_label, p_movement_type, p_departure_at, p_origin, p_destination)
- Creates or updates a transport movement.
- Insert creates a draft; update only allowed on draft/open movements.
- Returns the movement uuid.

### save_transport_vehicle(p_vehicle_id, p_movement_id, p_label, p_vehicle_type, p_capacity, p_plate, p_driver_name, p_driver_phone, p_sort_order)
- Creates or updates a vehicle within a movement.
- Derives event_id from the parent movement.
- Enforces unique label per movement.
- Returns the vehicle uuid.

### assign_transport_participant(p_movement_id, p_vehicle_id, p_registration_id, p_notes)
- Assigns a participant to a vehicle within a movement.
- Checks capacity, prevents duplicate assignment, rejects cancelled registrations.
- Returns the assignment uuid.

### move_transport_participant(p_assignment_id, p_target_vehicle_id)
- Moves an assigned participant to a different vehicle.
- Enforces capacity on target, records audit trail.
- Returns void.

## Security
- All functions are SECURITY DEFINER with search_path = public, pg_temp.
- EXECUTE revoked from PUBLIC and anon.
- EXECUTE granted only to authenticated.
- Authorization: caller must have can_access_onsite OR can_manage_registration for the event.

## Important Notes
1. No tables, RLS policies, or existing RPCs are modified.
2. No dynamic SQL is used.
3. All error codes are business-safe constants returned via RAISE EXCEPTION.
4. Row-level locking (FOR UPDATE) prevents concurrent race conditions.
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. save_transport_movement
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION save_transport_movement(
  p_movement_id  uuid DEFAULT NULL,
  p_event_id     text DEFAULT NULL,
  p_label        text DEFAULT NULL,
  p_movement_type text DEFAULT 'transfer',
  p_departure_at timestamptz DEFAULT NULL,
  p_origin       text DEFAULT '',
  p_destination  text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text;
  v_result_id uuid;
  v_current_status text;
BEGIN
  -- Auth check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Input validation
  IF trim(coalesce(p_label, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  IF p_movement_type NOT IN ('arrival','departure','transfer','shuttle','other') THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  -- INSERT path
  IF p_movement_id IS NULL THEN
    IF trim(coalesce(p_event_id, '')) = '' THEN
      RAISE EXCEPTION 'INVALID_INPUT';
    END IF;

    -- Verify event exists
    IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN
      RAISE EXCEPTION 'EVENT_NOT_FOUND';
    END IF;

    -- Authorization
    IF NOT (has_event_permission(p_event_id, 'can_access_onsite')
            OR has_event_permission(p_event_id, 'can_manage_registration')) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    INSERT INTO transport_movements (event_id, label, movement_type, departure_at, origin, destination, movement_status, created_by)
    VALUES (p_event_id, trim(p_label), p_movement_type, p_departure_at, coalesce(p_origin, ''), coalesce(p_destination, ''), 'draft', v_uid)
    RETURNING id INTO v_result_id;

    RETURN v_result_id;
  END IF;

  -- UPDATE path: lock and load
  SELECT id, event_id, movement_status
    INTO v_result_id, v_event_id, v_current_status
    FROM transport_movements
    WHERE id = p_movement_id
    FOR UPDATE;

  IF v_result_id IS NULL THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_FOUND';
  END IF;

  -- Authorization using movement's event_id
  IF NOT (has_event_permission(v_event_id, 'can_access_onsite')
          OR has_event_permission(v_event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Caller cannot pass a different event_id on update
  IF p_event_id IS NOT NULL AND trim(p_event_id) <> '' AND p_event_id <> v_event_id THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  IF v_current_status NOT IN ('draft', 'open') THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_EDITABLE';
  END IF;

  UPDATE transport_movements
  SET label = trim(p_label),
      movement_type = p_movement_type,
      departure_at = p_departure_at,
      origin = coalesce(p_origin, ''),
      destination = coalesce(p_destination, '')
  WHERE id = p_movement_id;

  RETURN v_result_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION save_transport_movement FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_transport_movement FROM anon;
GRANT EXECUTE ON FUNCTION save_transport_movement TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. save_transport_vehicle
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION save_transport_vehicle(
  p_vehicle_id   uuid DEFAULT NULL,
  p_movement_id  uuid DEFAULT NULL,
  p_label        text DEFAULT NULL,
  p_vehicle_type text DEFAULT 'bus',
  p_capacity     integer DEFAULT NULL,
  p_plate        text DEFAULT '',
  p_driver_name  text DEFAULT '',
  p_driver_phone text DEFAULT '',
  p_sort_order   integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text;
  v_movement_status text;
  v_result_id uuid;
  v_existing_movement uuid;
BEGIN
  -- Auth check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Input validation
  IF p_movement_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  IF trim(coalesce(p_label, '')) = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  IF p_vehicle_type NOT IN ('bus','minibus','van','car','other') THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  IF p_capacity IS NOT NULL AND p_capacity <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  IF p_sort_order < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  -- Lock parent movement
  SELECT id, event_id, movement_status
    INTO v_existing_movement, v_event_id, v_movement_status
    FROM transport_movements
    WHERE id = p_movement_id
    FOR UPDATE;

  IF v_existing_movement IS NULL THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_FOUND';
  END IF;

  -- Authorization
  IF NOT (has_event_permission(v_event_id, 'can_access_onsite')
          OR has_event_permission(v_event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  IF v_movement_status NOT IN ('draft', 'open') THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_EDITABLE';
  END IF;

  -- INSERT path
  IF p_vehicle_id IS NULL THEN
    -- Check duplicate label
    IF EXISTS (SELECT 1 FROM transport_vehicles WHERE movement_id = p_movement_id AND label = trim(p_label)) THEN
      RAISE EXCEPTION 'VEHICLE_LABEL_EXISTS';
    END IF;

    INSERT INTO transport_vehicles (event_id, movement_id, label, vehicle_type, capacity, plate, driver_name, driver_phone, sort_order)
    VALUES (v_event_id, p_movement_id, trim(p_label), p_vehicle_type, p_capacity, coalesce(p_plate, ''), coalesce(p_driver_name, ''), coalesce(p_driver_phone, ''), p_sort_order)
    RETURNING id INTO v_result_id;

    RETURN v_result_id;
  END IF;

  -- UPDATE path: verify vehicle belongs to movement
  SELECT id INTO v_result_id
    FROM transport_vehicles
    WHERE id = p_vehicle_id AND movement_id = p_movement_id
    FOR UPDATE;

  IF v_result_id IS NULL THEN
    RAISE EXCEPTION 'VEHICLE_NOT_FOUND';
  END IF;

  -- Check duplicate label excluding self
  IF EXISTS (SELECT 1 FROM transport_vehicles WHERE movement_id = p_movement_id AND label = trim(p_label) AND id <> p_vehicle_id) THEN
    RAISE EXCEPTION 'VEHICLE_LABEL_EXISTS';
  END IF;

  UPDATE transport_vehicles
  SET label = trim(p_label),
      vehicle_type = p_vehicle_type,
      capacity = p_capacity,
      plate = coalesce(p_plate, ''),
      driver_name = coalesce(p_driver_name, ''),
      driver_phone = coalesce(p_driver_phone, ''),
      sort_order = p_sort_order
  WHERE id = p_vehicle_id;

  RETURN v_result_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION save_transport_vehicle FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_transport_vehicle FROM anon;
GRANT EXECUTE ON FUNCTION save_transport_vehicle TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. assign_transport_participant
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION assign_transport_participant(
  p_movement_id     uuid DEFAULT NULL,
  p_vehicle_id      uuid DEFAULT NULL,
  p_registration_id uuid DEFAULT NULL,
  p_notes           text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text;
  v_movement_status text;
  v_vehicle_event text;
  v_vehicle_movement uuid;
  v_vehicle_capacity integer;
  v_reg_event text;
  v_reg_status text;
  v_active_count integer;
  v_result_id uuid;
BEGIN
  -- Auth check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Input validation
  IF p_movement_id IS NULL OR p_vehicle_id IS NULL OR p_registration_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

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

  IF v_movement_status NOT IN ('draft', 'open') THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_EDITABLE';
  END IF;

  -- Lock vehicle; verify belongs to movement
  SELECT event_id, movement_id, capacity
    INTO v_vehicle_event, v_vehicle_movement, v_vehicle_capacity
    FROM transport_vehicles
    WHERE id = p_vehicle_id
    FOR UPDATE;

  IF v_vehicle_movement IS NULL OR v_vehicle_movement <> p_movement_id THEN
    RAISE EXCEPTION 'VEHICLE_NOT_FOUND';
  END IF;

  -- Lock participant; verify event match
  SELECT event_id, registration_status
    INTO v_reg_event, v_reg_status
    FROM event_registrations
    WHERE id = p_registration_id
    FOR UPDATE;

  IF v_reg_event IS NULL THEN
    RAISE EXCEPTION 'PARTICIPANT_NOT_FOUND';
  END IF;

  IF v_reg_event <> v_event_id THEN
    RAISE EXCEPTION 'PARTICIPANT_EVENT_MISMATCH';
  END IF;

  IF v_reg_status = 'cancelled' THEN
    RAISE EXCEPTION 'PARTICIPANT_CANCELLED';
  END IF;

  -- Check existing active assignment in same movement
  IF EXISTS (
    SELECT 1 FROM transport_assignments
    WHERE movement_id = p_movement_id
      AND registration_id = p_registration_id
      AND assignment_status IN ('assigned', 'boarded')
  ) THEN
    RAISE EXCEPTION 'PARTICIPANT_ALREADY_ASSIGNED';
  END IF;

  -- Capacity check
  IF v_vehicle_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_active_count
      FROM transport_assignments
      WHERE vehicle_id = p_vehicle_id
        AND assignment_status IN ('assigned', 'boarded');

    IF v_active_count >= v_vehicle_capacity THEN
      RAISE EXCEPTION 'VEHICLE_FULL';
    END IF;
  END IF;

  -- Insert assignment
  INSERT INTO transport_assignments (
    event_id, movement_id, vehicle_id, registration_id,
    assignment_status, notes, created_by
  )
  VALUES (
    v_event_id, p_movement_id, p_vehicle_id, p_registration_id,
    'assigned', coalesce(p_notes, ''), v_uid
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION assign_transport_participant FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION assign_transport_participant FROM anon;
GRANT EXECUTE ON FUNCTION assign_transport_participant TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. move_transport_participant
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION move_transport_participant(
  p_assignment_id    uuid DEFAULT NULL,
  p_target_vehicle_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text;
  v_movement_id uuid;
  v_current_vehicle uuid;
  v_assignment_status text;
  v_movement_status text;
  v_target_movement uuid;
  v_target_capacity integer;
  v_active_count integer;
BEGIN
  -- Auth check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Input validation
  IF p_assignment_id IS NULL OR p_target_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  -- Lock assignment
  SELECT event_id, movement_id, vehicle_id, assignment_status
    INTO v_event_id, v_movement_id, v_current_vehicle, v_assignment_status
    FROM transport_assignments
    WHERE id = p_assignment_id
    FOR UPDATE;

  IF v_movement_id IS NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND';
  END IF;

  -- Authorization
  IF NOT (has_event_permission(v_event_id, 'can_access_onsite')
          OR has_event_permission(v_event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Assignment must be 'assigned'
  IF v_assignment_status <> 'assigned' THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_MOVABLE';
  END IF;

  -- Same vehicle guard
  IF v_current_vehicle = p_target_vehicle_id THEN
    RAISE EXCEPTION 'SAME_VEHICLE';
  END IF;

  -- Lock movement; verify editable
  SELECT movement_status INTO v_movement_status
    FROM transport_movements
    WHERE id = v_movement_id
    FOR UPDATE;

  IF v_movement_status NOT IN ('draft', 'open') THEN
    RAISE EXCEPTION 'MOVEMENT_NOT_EDITABLE';
  END IF;

  -- Lock target vehicle; verify belongs to same movement
  SELECT movement_id, capacity
    INTO v_target_movement, v_target_capacity
    FROM transport_vehicles
    WHERE id = p_target_vehicle_id
    FOR UPDATE;

  IF v_target_movement IS NULL OR v_target_movement <> v_movement_id THEN
    RAISE EXCEPTION 'VEHICLE_NOT_FOUND';
  END IF;

  -- Capacity check on target
  IF v_target_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_active_count
      FROM transport_assignments
      WHERE vehicle_id = p_target_vehicle_id
        AND assignment_status IN ('assigned', 'boarded');

    IF v_active_count >= v_target_capacity THEN
      RAISE EXCEPTION 'VEHICLE_FULL';
    END IF;
  END IF;

  -- Perform move
  UPDATE transport_assignments
  SET vehicle_id = p_target_vehicle_id,
      previous_vehicle_id = v_current_vehicle,
      last_moved_at = now(),
      last_moved_by = v_uid
  WHERE id = p_assignment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION move_transport_participant FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION move_transport_participant FROM anon;
GRANT EXECUTE ON FUNCTION move_transport_participant TO authenticated;