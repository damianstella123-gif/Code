/*
# Create administrative leave RPCs

1. New Functions
   - review_leave_change: approve/reject a pending leave_request_change
   - admin_cancel_approved_leave: admin cancels an approved leave request
   - admin_delete_closed_leave: physically delete negata/annullata requests

2. Security
   - All SECURITY DEFINER, search_path = public, pg_temp
   - Auth required; internal role check (Admin/Super Admin/Amministrazione or Admin/Super Admin only)
   - EXECUTE revoked from PUBLIC and anon; granted to authenticated

3. Error codes
   - AUTH_REQUIRED, ROLE_NOT_ALLOWED, INVALID_DECISION, NOT_FOUND,
     CHANGE_NOT_PENDING, REQUEST_NOT_APPROVED, NOTE_REQUIRED,
     INVALID_DATES, INVALID_TIMES, OVERLAP, PENDING_CHANGE_EXISTS,
     REQUEST_NOT_CLOSED, DELETION_NOT_ALLOWED
*/

-- ============================================================
-- 1. review_leave_change
-- ============================================================
CREATE OR REPLACE FUNCTION review_leave_change(
  p_change_id uuid,
  p_decision text,
  p_admin_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_change leave_request_changes%ROWTYPE;
  v_req leave_requests%ROWTYPE;
  v_overlap boolean;
  v_giorni integer;
  v_msg text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED';
  END IF;

  IF p_decision NOT IN ('approvata', 'negata') THEN
    RAISE EXCEPTION 'INVALID_DECISION';
  END IF;

  -- Lock change row
  SELECT * INTO v_change FROM leave_request_changes WHERE id = p_change_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_change.change_status <> 'in_attesa' THEN RAISE EXCEPTION 'CHANGE_NOT_PENDING'; END IF;

  -- Lock original request
  SELECT * INTO v_req FROM leave_requests WHERE id = v_change.leave_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.stato <> 'approvata' THEN RAISE EXCEPTION 'REQUEST_NOT_APPROVED'; END IF;

  -- Rejection requires note
  IF p_decision = 'negata' THEN
    IF p_admin_note IS NULL OR length(trim(p_admin_note)) < 5 THEN
      RAISE EXCEPTION 'NOTE_REQUIRED';
    END IF;
  END IF;

  IF p_decision = 'approvata' THEN
    IF v_change.change_type = 'modifica' THEN
      -- Validate proposed dates
      IF v_change.proposed_data_inizio IS NULL OR v_change.proposed_data_fine IS NULL THEN
        RAISE EXCEPTION 'INVALID_DATES';
      END IF;
      IF v_change.proposed_data_fine < v_change.proposed_data_inizio THEN
        RAISE EXCEPTION 'INVALID_DATES';
      END IF;

      -- Validate times for permesso
      IF v_req.tipo = 'permesso' THEN
        IF v_change.proposed_ora_inizio IS NULL OR v_change.proposed_ora_fine IS NULL THEN
          RAISE EXCEPTION 'INVALID_TIMES';
        END IF;
        IF v_change.proposed_ora_fine <= v_change.proposed_ora_inizio THEN
          RAISE EXCEPTION 'INVALID_TIMES';
        END IF;
      END IF;

      -- Overlap check excluding original
      SELECT EXISTS (
        SELECT 1 FROM leave_requests
        WHERE user_id = v_req.user_id
          AND id <> v_req.id
          AND data_inizio <= v_change.proposed_data_fine
          AND data_fine >= v_change.proposed_data_inizio
          AND stato IN ('in_attesa', 'approvata')
      ) INTO v_overlap;
      IF v_overlap THEN RAISE EXCEPTION 'OVERLAP'; END IF;

      v_giorni := (v_change.proposed_data_fine - v_change.proposed_data_inizio) + 1;

      -- Apply modification to original
      UPDATE leave_requests SET
        data_inizio = v_change.proposed_data_inizio,
        data_fine = v_change.proposed_data_fine,
        ora_inizio = CASE WHEN v_req.tipo = 'permesso' THEN v_change.proposed_ora_inizio ELSE NULL END,
        ora_fine = CASE WHEN v_req.tipo = 'permesso' THEN v_change.proposed_ora_fine ELSE NULL END,
        motivo = coalesce(v_change.proposed_motivo, v_req.motivo),
        giorni_richiesti = v_giorni
      WHERE id = v_req.id;

      v_msg := 'La tua richiesta di modifica ferie è stata approvata. Nuove date: '
        || to_char(v_change.proposed_data_inizio, 'DD/MM/YYYY') || '-'
        || to_char(v_change.proposed_data_fine, 'DD/MM/YYYY');

    ELSE
      -- annullamento approved: cancel original
      UPDATE leave_requests SET
        stato = 'annullata',
        note_admin = coalesce(trim(p_admin_note), 'Annullamento approvato su richiesta dipendente')
      WHERE id = v_req.id;

      v_msg := 'La tua richiesta di annullamento ferie ('
        || to_char(v_req.data_inizio, 'DD/MM/YYYY') || '-'
        || to_char(v_req.data_fine, 'DD/MM/YYYY') || ') è stata approvata.';
    END IF;
  ELSE
    -- Rejection: original stays unchanged
    v_msg := 'La tua richiesta di ' ||
      CASE v_change.change_type WHEN 'modifica' THEN 'modifica' ELSE 'annullamento' END
      || ' ferie è stata negata. Motivo: ' || trim(p_admin_note);
  END IF;

  -- Update change record
  UPDATE leave_request_changes SET
    change_status = p_decision,
    reviewed_by = v_uid,
    reviewed_at = now(),
    admin_note = CASE WHEN p_decision = 'negata' THEN trim(p_admin_note) ELSE p_admin_note END
  WHERE id = p_change_id;

  -- Notify employee
  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  VALUES (
    v_req.user_id,
    CASE p_decision
      WHEN 'approvata' THEN 'Modifica ferie approvata'
      ELSE 'Modifica ferie negata'
    END,
    v_msg,
    'leave_request',
    'leave_request_change',
    p_change_id::text
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION review_leave_change(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION review_leave_change(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION review_leave_change(uuid, text, text) TO authenticated;

-- ============================================================
-- 2. admin_cancel_approved_leave
-- ============================================================
CREATE OR REPLACE FUNCTION admin_cancel_approved_leave(
  p_request_id uuid,
  p_admin_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_req leave_requests%ROWTYPE;
  v_pending boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED';
  END IF;

  IF p_admin_note IS NULL OR length(trim(p_admin_note)) < 5 THEN
    RAISE EXCEPTION 'NOTE_REQUIRED';
  END IF;

  SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.stato <> 'approvata' THEN RAISE EXCEPTION 'REQUEST_NOT_APPROVED'; END IF;

  -- Reject if pending change exists
  SELECT EXISTS (
    SELECT 1 FROM leave_request_changes
    WHERE leave_request_id = p_request_id AND change_status = 'in_attesa'
  ) INTO v_pending;
  IF v_pending THEN RAISE EXCEPTION 'PENDING_CHANGE_EXISTS'; END IF;

  UPDATE leave_requests SET
    stato = 'annullata',
    approvato_da = v_uid,
    approvato_at = now(),
    note_admin = trim(p_admin_note)
  WHERE id = p_request_id;

  -- Notify employee
  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  VALUES (
    v_req.user_id,
    'Ferie annullate dall''amministrazione',
    'La tua ' || v_req.tipo || ' dal ' || to_char(v_req.data_inizio, 'DD/MM/YYYY')
      || ' al ' || to_char(v_req.data_fine, 'DD/MM/YYYY')
      || ' è stata annullata. Motivo: ' || trim(p_admin_note),
    'leave_request',
    'leave_request',
    p_request_id::text
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_cancel_approved_leave(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_cancel_approved_leave(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION admin_cancel_approved_leave(uuid, text) TO authenticated;

-- ============================================================
-- 3. admin_delete_closed_leave
-- ============================================================
CREATE OR REPLACE FUNCTION admin_delete_closed_leave(
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_req leave_requests%ROWTYPE;
  v_pending boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('Admin', 'Super Admin') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED';
  END IF;

  SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_req.stato IN ('in_attesa', 'approvata') THEN
    RAISE EXCEPTION 'DELETION_NOT_ALLOWED';
  END IF;

  IF v_req.stato NOT IN ('negata', 'annullata') THEN
    RAISE EXCEPTION 'REQUEST_NOT_CLOSED';
  END IF;

  -- Reject if pending change exists
  SELECT EXISTS (
    SELECT 1 FROM leave_request_changes
    WHERE leave_request_id = p_request_id AND change_status = 'in_attesa'
  ) INTO v_pending;
  IF v_pending THEN RAISE EXCEPTION 'PENDING_CHANGE_EXISTS'; END IF;

  DELETE FROM leave_requests WHERE id = p_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_delete_closed_leave(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_delete_closed_leave(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION admin_delete_closed_leave(uuid) TO authenticated;
