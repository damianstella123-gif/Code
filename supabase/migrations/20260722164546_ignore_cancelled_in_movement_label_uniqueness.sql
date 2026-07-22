/*
# Ignore cancelled movements in duplicate-label check

## Summary
Updates the `save_transport_movement` RPC to enforce unique labels per event,
but only among non-cancelled movements. This allows creating a new active
transfer with the same label as an old cancelled transfer.

## Modified Functions
- `save_transport_movement` — adds duplicate-label guard on INSERT and UPDATE
  paths that skips rows where `movement_status = 'cancelled'`.

## Security
- No changes to signature, SECURITY DEFINER, search_path, REVOKE/GRANT.

## Important Notes
1. Cancelled records are preserved for audit — no data is modified or deleted.
2. Existing behaviour (auth, validation, status checks) is unchanged.
3. The function is replaced via CREATE OR REPLACE with identical signature.
*/

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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  IF trim(coalesce(p_label, '')) = '' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF p_movement_type NOT IN ('arrival','departure','transfer','shuttle','other') THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  -- INSERT path
  IF p_movement_id IS NULL THEN
    IF trim(coalesce(p_event_id, '')) = '' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id) THEN RAISE EXCEPTION 'EVENT_NOT_FOUND'; END IF;
    IF NOT (has_event_permission(p_event_id, 'can_access_onsite')
            OR has_event_permission(p_event_id, 'can_manage_registration')) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    -- Duplicate label check: ignore cancelled movements
    IF EXISTS (
      SELECT 1 FROM transport_movements
      WHERE event_id = p_event_id
        AND label = trim(p_label)
        AND movement_status <> 'cancelled'
    ) THEN
      RAISE EXCEPTION 'MOVEMENT_LABEL_EXISTS';
    END IF;

    INSERT INTO transport_movements (event_id, label, movement_type, departure_at, origin, destination, movement_status, created_by)
    VALUES (p_event_id, trim(p_label), p_movement_type, p_departure_at, coalesce(p_origin,''), coalesce(p_destination,''), 'draft', v_uid)
    RETURNING id INTO v_result_id;
    RETURN v_result_id;
  END IF;

  -- UPDATE path: lock row
  SELECT id, event_id, movement_status INTO v_result_id, v_event_id, v_current_status
  FROM transport_movements WHERE id = p_movement_id FOR UPDATE;

  IF v_result_id IS NULL THEN RAISE EXCEPTION 'MOVEMENT_NOT_FOUND'; END IF;
  IF NOT (has_event_permission(v_event_id, 'can_access_onsite')
          OR has_event_permission(v_event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_event_id IS NOT NULL AND trim(p_event_id) <> '' AND p_event_id <> v_event_id THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  -- No status restriction: edits always allowed

  -- Duplicate label check on update: ignore cancelled and self
  IF EXISTS (
    SELECT 1 FROM transport_movements
    WHERE event_id = v_event_id
      AND label = trim(p_label)
      AND movement_status <> 'cancelled'
      AND id <> p_movement_id
  ) THEN
    RAISE EXCEPTION 'MOVEMENT_LABEL_EXISTS';
  END IF;

  UPDATE transport_movements
  SET label = trim(p_label), movement_type = p_movement_type,
      departure_at = p_departure_at, origin = coalesce(p_origin,''), destination = coalesce(p_destination,'')
  WHERE id = p_movement_id;
  RETURN v_result_id;
END;
$$;