/*
# Allow save/transition on departed vehicles

## Modified functions

### save_transport_vehicle
- Removed movement-status and vehicle operational_status blocks.
- Create/edit now allowed regardless of movement or vehicle state.
- Capacity must be a positive integer and never below boarded count.
- Permissions, SECURITY DEFINER, search_path, grants unchanged.

### transition_transport_vehicle
- `cancel` action now allowed from `departed` (previously only from `boarding`).
- `depart` still requires `boarding`; `reopen` still requires non-`boarding`.
- Signature, security, grants unchanged.

## Important notes
1. No DELETE of assignments or data.
2. No test data inserted.
3. SELECT FOR UPDATE maintained.
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- save_transport_vehicle: allow create/edit at any movement/vehicle status
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
  v_boarded_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  IF p_movement_id IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF trim(coalesce(p_label, '')) = '' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF p_vehicle_type NOT IN ('bus','minibus','van','car','other') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF p_capacity IS NOT NULL AND p_capacity <= 0 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF p_sort_order < 0 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;

  SELECT id, event_id, movement_status
    INTO v_existing_movement, v_event_id, v_movement_status
    FROM transport_movements WHERE id = p_movement_id FOR UPDATE;

  IF v_existing_movement IS NULL THEN RAISE EXCEPTION 'MOVEMENT_NOT_FOUND'; END IF;

  IF NOT (has_event_permission(v_event_id, 'can_access_onsite')
          OR has_event_permission(v_event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- No movement/vehicle status restriction: always allowed

  IF p_vehicle_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM transport_vehicles WHERE movement_id = p_movement_id AND label = trim(p_label)) THEN
      RAISE EXCEPTION 'VEHICLE_LABEL_EXISTS';
    END IF;

    INSERT INTO transport_vehicles (event_id, movement_id, label, vehicle_type, capacity, plate, driver_name, driver_phone, sort_order)
    VALUES (v_event_id, p_movement_id, trim(p_label), p_vehicle_type, p_capacity, coalesce(p_plate,''), coalesce(p_driver_name,''), coalesce(p_driver_phone,''), p_sort_order)
    RETURNING id INTO v_result_id;
    RETURN v_result_id;
  END IF;

  SELECT id INTO v_result_id FROM transport_vehicles
    WHERE id = p_vehicle_id AND movement_id = p_movement_id FOR UPDATE;

  IF v_result_id IS NULL THEN RAISE EXCEPTION 'VEHICLE_NOT_FOUND'; END IF;

  IF EXISTS (SELECT 1 FROM transport_vehicles WHERE movement_id = p_movement_id AND label = trim(p_label) AND id <> p_vehicle_id) THEN
    RAISE EXCEPTION 'VEHICLE_LABEL_EXISTS';
  END IF;

  IF p_capacity IS NOT NULL THEN
    SELECT count(*)::integer INTO v_boarded_count
      FROM transport_assignments WHERE vehicle_id = p_vehicle_id AND assignment_status = 'boarded';
    IF p_capacity < v_boarded_count THEN
      RAISE EXCEPTION 'CAPACITY_BELOW_BOARDED';
    END IF;
  END IF;

  UPDATE transport_vehicles
  SET label = trim(p_label), vehicle_type = p_vehicle_type, capacity = p_capacity,
      plate = coalesce(p_plate,''), driver_name = coalesce(p_driver_name,''),
      driver_phone = coalesce(p_driver_phone,''), sort_order = p_sort_order
  WHERE id = p_vehicle_id;

  RETURN v_result_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION save_transport_vehicle FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_transport_vehicle FROM anon;
GRANT EXECUTE ON FUNCTION save_transport_vehicle TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- transition_transport_vehicle: allow cancel from departed
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION transition_transport_vehicle(
  p_vehicle_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_event_id text; v_movement_id uuid; v_current_status text;
  v_label text; v_capacity int; v_occupants int;
  v_all_departed boolean; v_movement_status text; v_time_str text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticazione richiesta.' USING ERRCODE = 'P0001'; END IF;

  IF p_action IS NULL OR p_action NOT IN ('depart', 'cancel', 'reopen') THEN
    RAISE EXCEPTION 'Azione non valida.' USING ERRCODE = 'P0002';
  END IF;

  SELECT tv.event_id, tv.movement_id, tv.operational_status, tv.label, tv.capacity
  INTO v_event_id, v_movement_id, v_current_status, v_label, v_capacity
  FROM transport_vehicles tv WHERE tv.id = p_vehicle_id FOR UPDATE;

  IF v_event_id IS NULL THEN RAISE EXCEPTION 'Veicolo non trovato.' USING ERRCODE = 'P0003'; END IF;

  IF NOT has_event_permission(v_event_id, 'can_access_onsite')
     AND NOT has_event_permission(v_event_id, 'can_manage_registration') THEN
    RAISE EXCEPTION 'Permessi insufficienti per questa operazione.' USING ERRCODE = 'P0004';
  END IF;

  SELECT count(*) INTO v_occupants FROM transport_assignments
  WHERE vehicle_id = p_vehicle_id AND movement_id = v_movement_id AND assignment_status = 'boarded';

  IF p_action = 'depart' THEN
    IF v_current_status <> 'boarding' THEN
      RAISE EXCEPTION 'Il mezzo non è in fase di imbarco.' USING ERRCODE = 'P0005';
    END IF;
    UPDATE transport_vehicles SET operational_status='departed', departed_at=v_now, departed_by=v_uid, updated_at=v_now
    WHERE id = p_vehicle_id;

  ELSIF p_action = 'cancel' THEN
    -- Allow cancel from any status except already cancelled
    IF v_current_status = 'cancelled' THEN
      RAISE EXCEPTION 'Il mezzo è già annullato.' USING ERRCODE = 'P0006';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
      RAISE EXCEPTION 'Motivo annullamento obbligatorio (min 5 caratteri).' USING ERRCODE = 'P0007';
    END IF;
    UPDATE transport_vehicles SET operational_status='cancelled', departed_at=NULL, departed_by=NULL,
      cancelled_at=v_now, cancelled_by=v_uid, cancellation_reason=trim(p_reason), updated_at=v_now
    WHERE id = p_vehicle_id;

  ELSIF p_action = 'reopen' THEN
    IF v_current_status = 'boarding' THEN
      RAISE EXCEPTION 'Il mezzo è già in imbarco.' USING ERRCODE = 'P0008';
    END IF;
    UPDATE transport_vehicles SET operational_status='boarding', departed_at=NULL, departed_by=NULL,
      cancelled_at=NULL, cancelled_by=NULL, cancellation_reason=NULL, updated_at=v_now
    WHERE id = p_vehicle_id;
  END IF;

  SELECT tm.movement_status INTO v_movement_status FROM transport_movements tm WHERE tm.id = v_movement_id FOR UPDATE;

  IF p_action = 'depart' OR p_action = 'cancel' THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM transport_vehicles WHERE movement_id = v_movement_id
        AND operational_status NOT IN ('departed','cancelled')
    ) INTO v_all_departed;
    IF v_all_departed AND v_movement_status NOT IN ('departed','cancelled') THEN
      UPDATE transport_movements SET movement_status='departed', closed_at=v_now, closed_by=v_uid, updated_at=v_now
      WHERE id = v_movement_id;
    END IF;
  ELSIF p_action = 'reopen' THEN
    IF v_movement_status = 'departed' THEN
      UPDATE transport_movements SET movement_status='open', closed_at=NULL, closed_by=NULL, updated_at=v_now
      WHERE id = v_movement_id;
    END IF;
  END IF;

  v_time_str := to_char(v_now AT TIME ZONE 'Europe/Rome', 'HH24:MI');
  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  SELECT em.user_id,
    CASE p_action WHEN 'depart' THEN 'Mezzo partito' WHEN 'cancel' THEN 'Mezzo annullato' WHEN 'reopen' THEN 'Mezzo riaperto' END,
    CASE p_action
      WHEN 'depart' THEN v_label||' partito alle '||v_time_str||' con '||v_occupants||' partecipanti a bordo.'
      WHEN 'cancel' THEN v_label||' annullato alle '||v_time_str||'.'
      WHEN 'reopen' THEN v_label||' riaperto alle '||v_time_str||'.'
    END,
    'transport_vehicle_status', 'transport_vehicle', p_vehicle_id::text
  FROM event_members em WHERE em.event_id = v_event_id AND em.user_id <> v_uid;

  RETURN jsonb_build_object(
    'vehicle_label', v_label, 'action', p_action,
    'operational_status', CASE p_action WHEN 'depart' THEN 'departed' WHEN 'cancel' THEN 'cancelled' WHEN 'reopen' THEN 'boarding' END,
    'departed_at', CASE WHEN p_action = 'depart' THEN v_now ELSE NULL END,
    'occupants', v_occupants, 'capacity', v_capacity
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION transition_transport_vehicle FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION transition_transport_vehicle FROM anon;
GRANT EXECUTE ON FUNCTION transition_transport_vehicle TO authenticated;
