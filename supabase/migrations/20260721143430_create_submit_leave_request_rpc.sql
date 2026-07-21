/*
# Create submit_leave_request RPC (with corrected overlap rule)

1. Purpose
   - Allows any authenticated user to submit a new leave request.
   - Validates inputs, checks for date overlap only against active requests
     (in_attesa, approvata), and inserts the row + admin notification.

2. Overlap fix
   - Only rows with stato IN ('in_attesa', 'approvata') block new submissions.
   - Rows with stato = 'negata' or 'annullata' never block, even with
     identical dates.
   - Uses correct interval overlap: existing.data_inizio <= p_data_fine
     AND existing.data_fine >= p_data_inizio.

3. Security
   - SECURITY DEFINER, search_path = public, pg_temp.
   - REVOKE from PUBLIC and anon; GRANT only to authenticated.
*/

CREATE OR REPLACE FUNCTION submit_leave_request(
  p_tipo text,
  p_data_inizio date,
  p_data_fine date,
  p_ora_inizio time DEFAULT NULL,
  p_ora_fine time DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_overlap boolean;
  v_new_id uuid;
  v_giorni integer;
  v_row jsonb;
BEGIN
  -- Auth check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Input validation
  IF p_tipo NOT IN ('ferie', 'permesso', 'malattia', 'recupero') THEN
    RAISE EXCEPTION 'INVALID_TIPO';
  END IF;

  IF p_data_fine < p_data_inizio THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF p_tipo = 'permesso' THEN
    IF p_ora_inizio IS NULL OR p_ora_fine IS NULL THEN
      RAISE EXCEPTION 'PERMESSO_REQUIRES_TIMES';
    END IF;
    IF p_ora_fine <= p_ora_inizio THEN
      RAISE EXCEPTION 'INVALID_TIMES';
    END IF;
  END IF;

  -- Overlap check: only in_attesa and approvata block
  SELECT EXISTS (
    SELECT 1 FROM leave_requests
    WHERE user_id = v_uid
      AND data_inizio <= p_data_fine
      AND data_fine >= p_data_inizio
      AND stato IN ('in_attesa', 'approvata')
  ) INTO v_overlap;

  IF v_overlap THEN
    RAISE EXCEPTION 'OVERLAP_EXISTING_REQUEST';
  END IF;

  -- Compute duration
  v_giorni := (p_data_fine - p_data_inizio) + 1;

  -- Insert
  INSERT INTO leave_requests (user_id, tipo, data_inizio, data_fine, ora_inizio, ora_fine, motivo, giorni_richiesti)
  VALUES (v_uid, p_tipo, p_data_inizio, p_data_fine, p_ora_inizio, p_ora_fine, p_motivo, v_giorni)
  RETURNING id INTO v_new_id;

  -- Notify admins
  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  SELECT p.id,
    'Nuova richiesta ' || p_tipo,
    (SELECT coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '') FROM profiles pr WHERE pr.id = v_uid)
      || ' ha richiesto ' || p_tipo || ' dal '
      || to_char(p_data_inizio, 'DD/MM/YYYY') || ' al ' || to_char(p_data_fine, 'DD/MM/YYYY'),
    'leave_request',
    'leave_request',
    v_new_id::text
  FROM profiles p
  WHERE p.role IN ('Admin', 'Super Admin', 'Amministrazione')
    AND p.id <> v_uid;

  -- Return created row as jsonb
  SELECT to_jsonb(lr.*) INTO v_row
  FROM leave_requests lr
  WHERE lr.id = v_new_id;

  RETURN v_row;
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION submit_leave_request(text, date, date, time, time, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION submit_leave_request(text, date, date, time, time, text) FROM anon;
GRANT EXECUTE ON FUNCTION submit_leave_request(text, date, date, time, time, text) TO authenticated;
