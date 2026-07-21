/*
# Create/Replace review_leave_request RPC

1. Purpose
   - Allows Admin, Super Admin or Amministrazione roles to approve or reject
     a pending leave request in a single atomic operation.

2. Behavior
   - Validates caller is authenticated and has an allowed role.
   - Validates p_decision is 'approvata' or 'negata'.
   - Locks the target leave_requests row FOR UPDATE.
   - Requires the row exists and is currently in stato='in_attesa'.
   - For rejections, requires at least 5 characters of admin note.
   - Updates stato, approvato_da, approvato_at, note_admin.
   - Inserts a notification for the requesting user with details.

3. Security
   - SECURITY DEFINER with search_path = public, pg_temp.
   - REVOKE from PUBLIC and anon; GRANT only to authenticated.
*/

CREATE OR REPLACE FUNCTION review_leave_request(
  p_request_id uuid,
  p_decision text,
  p_note_admin text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_request leave_requests%ROWTYPE;
  v_title text;
  v_message text;
BEGIN
  -- Auth check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Role check
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED';
  END IF;

  -- Decision validation
  IF p_decision NOT IN ('approvata', 'negata') THEN
    RAISE EXCEPTION 'INVALID_DECISION';
  END IF;

  -- Lock and fetch
  SELECT * INTO v_request
  FROM leave_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;

  IF v_request.stato <> 'in_attesa' THEN
    RAISE EXCEPTION 'REQUEST_NOT_REVIEWABLE';
  END IF;

  -- Rejection note validation
  IF p_decision = 'negata' THEN
    IF p_note_admin IS NULL OR length(trim(p_note_admin)) < 5 THEN
      RAISE EXCEPTION 'REJECTION_NOTE_REQUIRED';
    END IF;
  END IF;

  -- Update the request
  UPDATE leave_requests SET
    stato = p_decision,
    approvato_da = v_uid,
    approvato_at = now(),
    note_admin = CASE
      WHEN p_decision = 'negata' THEN trim(p_note_admin)
      ELSE NULL
    END
  WHERE id = p_request_id;

  -- Build notification
  IF p_decision = 'approvata' THEN
    v_title := 'Richiesta approvata';
    v_message := 'La tua richiesta di ' || v_request.tipo
      || ' dal ' || to_char(v_request.data_inizio, 'DD/MM/YYYY')
      || ' al ' || to_char(v_request.data_fine, 'DD/MM/YYYY');
    IF v_request.ora_inizio IS NOT NULL AND v_request.ora_fine IS NOT NULL THEN
      v_message := v_message || ' (' || to_char(v_request.ora_inizio, 'HH24:MI') || '-' || to_char(v_request.ora_fine, 'HH24:MI') || ')';
    END IF;
    v_message := v_message || ' è stata approvata.';
  ELSE
    v_title := 'Richiesta negata';
    v_message := 'La tua richiesta di ' || v_request.tipo
      || ' dal ' || to_char(v_request.data_inizio, 'DD/MM/YYYY')
      || ' al ' || to_char(v_request.data_fine, 'DD/MM/YYYY')
      || ' è stata negata. Motivo: ' || trim(p_note_admin);
  END IF;

  -- Insert notification
  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  VALUES (
    v_request.user_id,
    v_title,
    v_message,
    'leave_request',
    'leave_request',
    p_request_id::text
  );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION review_leave_request(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION review_leave_request(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION review_leave_request(uuid, text, text) TO authenticated;
