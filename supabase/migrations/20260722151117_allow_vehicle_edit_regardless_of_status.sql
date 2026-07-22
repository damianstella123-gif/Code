/*
# Allow vehicle edit/create regardless of movement or vehicle status

## Summary
Replaces `save_transport_vehicle` RPC to:
- Remove the block that prevented edits when movement_status is 'departed' or 'cancelled'.
- Allow authorized users to always create or modify vehicle fields:
  label, vehicle_type, capacity, plate, driver_name, driver_phone, sort_order.
- Use SELECT FOR UPDATE on both movement and vehicle rows.
- Validate that capacity (if set) is >= number of currently boarded passengers.
- Prevent changing movement_id/event_id during an update.

## Security
- Same auth + permission checks as before.
- Same REVOKE/GRANT pattern (authenticated only).

## Important notes
1. A vehicle can now be edited even after departure — this preserves operational flexibility.
2. Capacity validation ensures data consistency: you cannot shrink capacity below boarded count.
3. No data loss — this is a function replacement only.
*/

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
  v_boarded_count integer;
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

  -- Lock parent movement (SELECT FOR UPDATE)
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

  -- No movement status restriction: edits are always allowed.

  -- INSERT path
  IF p_vehicle_id IS NULL THEN
    -- Check duplicate label
    IF EXISTS (SELECT 1 FROM transport_vehicles WHERE movement_id = p_movement_id AND label = trim(p_label)) THEN
      RAISE EXCEPTION 'VEHICLE_LABEL_EXISTS';
    END IF;

    -- Capacity validation for insert: no boarded passengers yet, so any positive capacity is fine.

    INSERT INTO transport_vehicles (event_id, movement_id, label, vehicle_type, capacity, plate, driver_name, driver_phone, sort_order)
    VALUES (v_event_id, p_movement_id, trim(p_label), p_vehicle_type, p_capacity, coalesce(p_plate, ''), coalesce(p_driver_name, ''), coalesce(p_driver_phone, ''), p_sort_order)
    RETURNING id INTO v_result_id;

    RETURN v_result_id;
  END IF;

  -- UPDATE path: verify vehicle belongs to the SAME movement (cannot change movement)
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

  -- Capacity validation: cannot set capacity below currently boarded count
  IF p_capacity IS NOT NULL THEN
    SELECT count(*)::integer INTO v_boarded_count
      FROM transport_assignments
      WHERE vehicle_id = p_vehicle_id AND assignment_status = 'boarded';

    IF p_capacity < v_boarded_count THEN
      RAISE EXCEPTION 'CAPACITY_BELOW_BOARDED';
    END IF;
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
