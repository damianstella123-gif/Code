/*
# Create unboard_transport_assignment RPC

## Summary
Adds an atomic RPC to revert a boarded passenger back to "assigned" status,
enabling reversible check-in without deleting the assignment record.

## New function: unboard_transport_assignment(p_assignment_id uuid)
- Locks the assignment row with SELECT FOR UPDATE.
- Validates assignment exists and is currently "boarded".
- Checks authorization via has_event_permission (can_access_onsite OR can_manage_registration).
- Sets assignment_status = 'assigned', clears boarded_at and boarded_by.
- Updates updated_at timestamp.
- Returns the assignment_id on success.

## Security
- SECURITY DEFINER with restricted search_path.
- EXECUTE granted only to authenticated role.
- No personal data logged.

## Important notes
1. This preserves the assignment row (no DELETE) to maintain history.
2. Only assignments with status 'boarded' can be unboarded.
3. The vehicle's boarded_count is derived from live queries, so it updates automatically.
*/

CREATE OR REPLACE FUNCTION unboard_transport_assignment(
  p_assignment_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text;
  v_status text;
  v_assignment_id uuid;
BEGIN
  -- Auth check
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_assignment_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  -- Lock and fetch assignment
  SELECT id, event_id, assignment_status
    INTO v_assignment_id, v_event_id, v_status
    FROM transport_assignments
    WHERE id = p_assignment_id
    FOR UPDATE;

  IF v_assignment_id IS NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND';
  END IF;

  -- Authorization
  IF NOT (has_event_permission(v_event_id, 'can_access_onsite')
          OR has_event_permission(v_event_id, 'can_manage_registration')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Only boarded assignments can be unboarded
  IF v_status <> 'boarded' THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_BOARDED';
  END IF;

  -- Revert to assigned
  UPDATE transport_assignments
  SET assignment_status = 'assigned',
      boarded_at = NULL,
      boarded_by = NULL,
      updated_at = now()
  WHERE id = p_assignment_id;

  RETURN v_assignment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION unboard_transport_assignment FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION unboard_transport_assignment FROM anon;
GRANT EXECUTE ON FUNCTION unboard_transport_assignment TO authenticated;
