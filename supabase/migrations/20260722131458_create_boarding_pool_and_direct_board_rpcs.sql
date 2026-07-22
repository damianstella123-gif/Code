/*
# Create transport boarding pool and direct-board RPCs

## Purpose
Allow event participants to appear in the boarding workflow even when they
have NOT been pre-assigned to a vehicle. The vehicle is chosen at boarding
time.

## New Functions

1. `get_transport_boarding_pool(p_movement_id uuid)`
   - Returns all non-cancelled registrations of the movement's event.
   - Enriches each row with any existing assignment info (vehicle, status, boarded_at).
   - Requires `can_access_onsite` OR `can_manage_registration` event permission.
   - Returns: registration_id, first_name, last_name, company, phone,
     registration_status, assignment_id, vehicle_id, vehicle_label,
     assignment_status, boarded_at.

2. `board_transport_participant_direct(p_movement_id, p_vehicle_id, p_registration_id)`
   - Atomic boarding: creates assignment if missing, then marks boarded.
   - Uses SELECT FOR UPDATE to prevent race conditions and double boarding.
   - Verifies same event, movement open, vehicle capacity not exceeded.
   - Returns: first_name, last_name, company, phone, vehicle_label, boarded_at.

## Security
- Both are SECURITY DEFINER with search_path = public, pg_temp.
- EXECUTE revoked from PUBLIC and anon; granted only to authenticated.
- Authorization via auth.uid() + has_event_permission().
- Phone is returned only to authorized callers, never logged or notified.

## Realtime
- transport_assignments, transport_vehicles, transport_movements already in supabase_realtime — no changes needed.

## Data Safety
- No tables created, altered, or dropped.
- No existing data modified.
*/

-- =============================================================================
-- RPC 1: get_transport_boarding_pool
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_transport_boarding_pool(p_movement_id uuid)
RETURNS TABLE(
  registration_id uuid,
  first_name text,
  last_name text,
  company text,
  phone text,
  registration_status text,
  assignment_id uuid,
  vehicle_id uuid,
  vehicle_label text,
  assignment_status text,
  boarded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_event_id text;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta.' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve event from movement
  SELECT m.event_id INTO v_event_id
  FROM transport_movements m
  WHERE m.id = p_movement_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Movimento non trovato.' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization check
  IF NOT has_event_permission(v_event_id, 'can_access_onsite')
     AND NOT has_event_permission(v_event_id, 'can_manage_registration') THEN
    RAISE EXCEPTION 'Permessi insufficienti per questa operazione.' USING ERRCODE = 'P0003';
  END IF;

  RETURN QUERY
  SELECT
    er.id AS registration_id,
    er.first_name,
    er.last_name,
    er.company,
    er.phone,
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
  ORDER BY er.last_name, er.first_name;
END;
$$;

-- Revoke/grant
REVOKE ALL ON FUNCTION public.get_transport_boarding_pool(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_transport_boarding_pool(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_transport_boarding_pool(uuid) TO authenticated;


-- =============================================================================
-- RPC 2: board_transport_participant_direct
-- =============================================================================

CREATE OR REPLACE FUNCTION public.board_transport_participant_direct(
  p_movement_id uuid,
  p_vehicle_id uuid,
  p_registration_id uuid
)
RETURNS TABLE(
  first_name text,
  last_name text,
  company text,
  phone text,
  vehicle_label text,
  boarded_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
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
  -- Require authentication
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta.' USING ERRCODE = 'P0001';
  END IF;

  -- Lock and validate movement
  SELECT m.event_id, m.movement_status INTO v_event_id, v_movement_status
  FROM transport_movements m
  WHERE m.id = p_movement_id
  FOR UPDATE;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Movimento non trovato.' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization
  IF NOT has_event_permission(v_event_id, 'can_access_onsite')
     AND NOT has_event_permission(v_event_id, 'can_manage_registration') THEN
    RAISE EXCEPTION 'Permessi insufficienti per questa operazione.' USING ERRCODE = 'P0003';
  END IF;

  -- Movement must be open
  IF v_movement_status <> 'open' THEN
    RAISE EXCEPTION 'Il movimento non è aperto per imbarco.' USING ERRCODE = 'P0004';
  END IF;

  -- Lock and validate vehicle belongs to same movement/event
  SELECT tv.event_id, tv.movement_id, tv.capacity, tv.label
  INTO v_vehicle_event, v_vehicle_movement, v_vehicle_capacity, v_vehicle_label
  FROM transport_vehicles tv
  WHERE tv.id = p_vehicle_id
  FOR UPDATE;

  IF v_vehicle_event IS NULL OR v_vehicle_event <> v_event_id
     OR v_vehicle_movement <> p_movement_id THEN
    RAISE EXCEPTION 'Veicolo non valido per questo movimento.' USING ERRCODE = 'P0005';
  END IF;

  -- Validate registration belongs to same event and not cancelled
  SELECT er.event_id, er.first_name, er.last_name, er.company, er.phone
  INTO v_reg_event, v_first, v_last, v_company, v_phone
  FROM event_registrations er
  WHERE er.id = p_registration_id
    AND er.registration_status <> 'cancelled';

  IF v_reg_event IS NULL OR v_reg_event <> v_event_id THEN
    RAISE EXCEPTION 'Partecipante non trovato o non confermato.' USING ERRCODE = 'P0006';
  END IF;

  -- Check for existing assignment on this movement (lock row)
  SELECT ta.id, ta.assignment_status INTO v_existing_id, v_existing_status
  FROM transport_assignments ta
  WHERE ta.movement_id = p_movement_id
    AND ta.registration_id = p_registration_id
    AND ta.assignment_status <> 'cancelled'
  FOR UPDATE;

  -- Prevent double boarding
  IF v_existing_status = 'boarded' THEN
    RAISE EXCEPTION 'Partecipante già imbarcato.' USING ERRCODE = 'P0007';
  END IF;

  -- Check capacity (count active assignments on this vehicle)
  SELECT count(*) INTO v_current_load
  FROM transport_assignments ta2
  WHERE ta2.vehicle_id = p_vehicle_id
    AND ta2.movement_id = p_movement_id
    AND ta2.assignment_status IN ('assigned', 'boarded');

  IF v_vehicle_capacity IS NOT NULL AND v_current_load >= v_vehicle_capacity THEN
    RAISE EXCEPTION 'Capienza veicolo raggiunta.' USING ERRCODE = 'P0008';
  END IF;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing assignment: set vehicle and mark boarded
    UPDATE transport_assignments
    SET vehicle_id = p_vehicle_id,
        assignment_status = 'boarded',
        boarded_at = v_now,
        boarded_by = v_uid,
        updated_at = v_now
    WHERE id = v_existing_id;
  ELSE
    -- Create new assignment directly as boarded
    INSERT INTO transport_assignments (
      event_id, movement_id, vehicle_id, registration_id,
      assignment_status, boarded_at, boarded_by, created_by
    ) VALUES (
      v_event_id, p_movement_id, p_vehicle_id, p_registration_id,
      'boarded', v_now, v_uid, v_uid
    );
  END IF;

  -- Return safe result
  RETURN QUERY
  SELECT v_first, v_last, v_company, v_phone, v_vehicle_label, v_now;
END;
$$;

-- Revoke/grant
REVOKE ALL ON FUNCTION public.board_transport_participant_direct(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.board_transport_participant_direct(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.board_transport_participant_direct(uuid, uuid, uuid) TO authenticated;
