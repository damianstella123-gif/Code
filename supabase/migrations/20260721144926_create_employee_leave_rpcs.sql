/*
# Create employee leave management RPCs

1. New Functions
   - update_pending_leave_request: edit own pending request (dates, times, motivo)
   - withdraw_pending_leave_request: self-cancel own pending request (sets stato='annullata')
   - request_approved_leave_change: submit a change request against an approved leave

2. Security
   - All SECURITY DEFINER, search_path = public, pg_temp
   - All require auth.uid() (AUTH_REQUIRED on null)
   - EXECUTE revoked from PUBLIC and anon; granted to authenticated only

3. Behavior
   - Row-level FOR UPDATE locking to prevent races
   - Ownership validation (user_id = auth.uid())
   - Overlap detection excludes the request being modified
   - Administrative notifications on every action
   - No physical deletes

4. Error codes
   - AUTH_REQUIRED, NOT_FOUND, NOT_OWNER, WRONG_STATUS, INVALID_DATES,
     INVALID_TIMES, OVERLAP, INVALID_CHANGE_TYPE, REASON_TOO_SHORT,
     PENDING_CHANGE_EXISTS
*/

-- ============================================================
-- 1. update_pending_leave_request
-- ============================================================
CREATE OR REPLACE FUNCTION update_pending_leave_request(
  p_request_id uuid,
  p_data_inizio date,
  p_data_fine date,
  p_ora_inizio time DEFAULT NULL,
  p_ora_fine time DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_req leave_requests%ROWTYPE;
  v_overlap boolean;
  v_giorni integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.user_id <> v_uid THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;
  IF v_req.stato <> 'in_attesa' THEN RAISE EXCEPTION 'WRONG_STATUS'; END IF;

  -- Date validation
  IF p_data_fine < p_data_inizio THEN RAISE EXCEPTION 'INVALID_DATES'; END IF;

  -- Time validation for permesso
  IF v_req.tipo = 'permesso' THEN
    IF p_ora_inizio IS NULL OR p_ora_fine IS NULL THEN RAISE EXCEPTION 'INVALID_TIMES'; END IF;
    IF p_ora_fine <= p_ora_inizio THEN RAISE EXCEPTION 'INVALID_TIMES'; END IF;
  ELSE
    p_ora_inizio := NULL;
    p_ora_fine := NULL;
  END IF;

  -- Overlap check excluding self
  SELECT EXISTS (
    SELECT 1 FROM leave_requests
    WHERE user_id = v_uid
      AND id <> p_request_id
      AND data_inizio <= p_data_fine
      AND data_fine >= p_data_inizio
      AND stato IN ('in_attesa', 'approvata')
  ) INTO v_overlap;
  IF v_overlap THEN RAISE EXCEPTION 'OVERLAP'; END IF;

  v_giorni := (p_data_fine - p_data_inizio) + 1;

  UPDATE leave_requests SET
    data_inizio = p_data_inizio,
    data_fine = p_data_fine,
    ora_inizio = p_ora_inizio,
    ora_fine = p_ora_fine,
    motivo = p_motivo,
    giorni_richiesti = v_giorni
  WHERE id = p_request_id;

  -- Notify admins
  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  SELECT p.id,
    'Richiesta ferie modificata',
    (SELECT coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '') FROM profiles pr WHERE pr.id = v_uid)
      || ' ha modificato la richiesta di ' || v_req.tipo
      || ' → ' || to_char(p_data_inizio, 'DD/MM/YYYY') || '-' || to_char(p_data_fine, 'DD/MM/YYYY'),
    'leave_request',
    'leave_request',
    p_request_id::text
  FROM profiles p
  WHERE p.role IN ('Admin', 'Super Admin', 'Amministrazione') AND p.id <> v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_pending_leave_request(uuid, date, date, time, time, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_pending_leave_request(uuid, date, date, time, time, text) FROM anon;
GRANT EXECUTE ON FUNCTION update_pending_leave_request(uuid, date, date, time, time, text) TO authenticated;

-- ============================================================
-- 2. withdraw_pending_leave_request
-- ============================================================
CREATE OR REPLACE FUNCTION withdraw_pending_leave_request(
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_req leave_requests%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.user_id <> v_uid THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;
  IF v_req.stato <> 'in_attesa' THEN RAISE EXCEPTION 'WRONG_STATUS'; END IF;

  UPDATE leave_requests SET stato = 'annullata' WHERE id = p_request_id;

  -- Notify admins
  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  SELECT p.id,
    'Richiesta ferie annullata',
    (SELECT coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '') FROM profiles pr WHERE pr.id = v_uid)
      || ' ha annullato la richiesta di ' || v_req.tipo
      || ' dal ' || to_char(v_req.data_inizio, 'DD/MM/YYYY') || ' al ' || to_char(v_req.data_fine, 'DD/MM/YYYY'),
    'leave_request',
    'leave_request',
    p_request_id::text
  FROM profiles p
  WHERE p.role IN ('Admin', 'Super Admin', 'Amministrazione') AND p.id <> v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION withdraw_pending_leave_request(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION withdraw_pending_leave_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION withdraw_pending_leave_request(uuid) TO authenticated;

-- ============================================================
-- 3. request_approved_leave_change
-- ============================================================
CREATE OR REPLACE FUNCTION request_approved_leave_change(
  p_request_id uuid,
  p_change_type text,
  p_data_inizio date DEFAULT NULL,
  p_data_fine date DEFAULT NULL,
  p_ora_inizio time DEFAULT NULL,
  p_ora_fine time DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_employee_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_req leave_requests%ROWTYPE;
  v_overlap boolean;
  v_change_id uuid;
  v_pending boolean;
  v_di date;
  v_df date;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  IF p_change_type NOT IN ('modifica', 'annullamento') THEN
    RAISE EXCEPTION 'INVALID_CHANGE_TYPE';
  END IF;

  IF p_employee_reason IS NULL OR length(trim(p_employee_reason)) < 5 THEN
    RAISE EXCEPTION 'REASON_TOO_SHORT';
  END IF;

  SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.user_id <> v_uid THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;
  IF v_req.stato <> 'approvata' THEN RAISE EXCEPTION 'WRONG_STATUS'; END IF;

  -- Reject if pending change already exists
  SELECT EXISTS (
    SELECT 1 FROM leave_request_changes
    WHERE leave_request_id = p_request_id AND change_status = 'in_attesa'
  ) INTO v_pending;
  IF v_pending THEN RAISE EXCEPTION 'PENDING_CHANGE_EXISTS'; END IF;

  IF p_change_type = 'modifica' THEN
    -- Validate proposed dates
    IF p_data_inizio IS NULL OR p_data_fine IS NULL THEN
      RAISE EXCEPTION 'INVALID_DATES';
    END IF;
    IF p_data_fine < p_data_inizio THEN RAISE EXCEPTION 'INVALID_DATES'; END IF;

    -- Time validation for permesso
    IF v_req.tipo = 'permesso' THEN
      IF p_ora_inizio IS NULL OR p_ora_fine IS NULL THEN RAISE EXCEPTION 'INVALID_TIMES'; END IF;
      IF p_ora_fine <= p_ora_inizio THEN RAISE EXCEPTION 'INVALID_TIMES'; END IF;
    ELSE
      p_ora_inizio := NULL;
      p_ora_fine := NULL;
    END IF;

    v_di := p_data_inizio;
    v_df := p_data_fine;

    -- Overlap check excluding original request
    SELECT EXISTS (
      SELECT 1 FROM leave_requests
      WHERE user_id = v_uid
        AND id <> p_request_id
        AND data_inizio <= v_df
        AND data_fine >= v_di
        AND stato IN ('in_attesa', 'approvata')
    ) INTO v_overlap;
    IF v_overlap THEN RAISE EXCEPTION 'OVERLAP'; END IF;
  ELSE
    -- annullamento: null proposed fields
    p_data_inizio := NULL;
    p_data_fine := NULL;
    p_ora_inizio := NULL;
    p_ora_fine := NULL;
    p_motivo := NULL;
  END IF;

  INSERT INTO leave_request_changes (
    leave_request_id, requested_by, change_type,
    proposed_data_inizio, proposed_data_fine, proposed_ora_inizio, proposed_ora_fine,
    proposed_motivo, employee_reason, change_status
  ) VALUES (
    p_request_id, v_uid, p_change_type,
    p_data_inizio, p_data_fine, p_ora_inizio, p_ora_fine,
    p_motivo, trim(p_employee_reason), 'in_attesa'
  ) RETURNING id INTO v_change_id;

  -- Notify admins
  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  SELECT p.id,
    CASE p_change_type
      WHEN 'modifica' THEN 'Richiesta modifica ferie'
      ELSE 'Richiesta annullamento ferie'
    END,
    (SELECT coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '') FROM profiles pr WHERE pr.id = v_uid)
      || CASE p_change_type
           WHEN 'modifica' THEN ' chiede di modificare '
           ELSE ' chiede di annullare '
         END
      || v_req.tipo || ' ' || to_char(v_req.data_inizio, 'DD/MM/YYYY') || '-' || to_char(v_req.data_fine, 'DD/MM/YYYY'),
    'leave_request',
    'leave_request_change',
    v_change_id::text
  FROM profiles p
  WHERE p.role IN ('Admin', 'Super Admin', 'Amministrazione') AND p.id <> v_uid;

  RETURN v_change_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION request_approved_leave_change(uuid, text, date, date, time, time, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION request_approved_leave_change(uuid, text, date, date, time, time, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION request_approved_leave_change(uuid, text, date, date, time, time, text, text) TO authenticated;
