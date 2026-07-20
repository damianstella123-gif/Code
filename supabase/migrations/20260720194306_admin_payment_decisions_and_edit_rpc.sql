/*
# Admin Payment Decisions and Safe Edit RPC

## Summary
Replace `admin_transition_payment_request` to add new approval/rejection transitions,
and create a new `admin_update_payment_request` RPC for safe field editing.

## Changes

### 1. Replaced: admin_transition_payment_request
- Preserves all existing transitions:
  - inviata -> in_verifica
  - in_verifica -> in_attesa_fattura (note required)
  - in_verifica -> respinta (note required)
  - in_attesa_fattura -> in_verifica
  - in_attesa_fattura -> respinta (note required)
  - parzialmente_coperta -> in_attesa_fattura
  - approvata -> annullata (with CANNOT_CANCEL_WITH_EXECUTIONS check, note required)
- New transitions added:
  - inviata -> approvata (no invoice required, note optional)
  - inviata -> respinta (note required >= 5 chars)
  - in_verifica -> approvata (no invoice required, note optional)
  - in_attesa_fattura -> approvata (no invoice required, note optional)
- Authorization unchanged: Admin, Super Admin, Amministrazione roles only.
- Audit fields (reviewed_by, reviewed_at) updated on every transition.
- Notification to requester on every transition.

### 2. New: admin_update_payment_request
- Allows editing description, due date, and admin note on editable requests.
- Editable statuses: inviata, in_verifica, in_attesa_fattura.
- NEVER updates: importo, supplier_id, client_id, event_id, created_by,
  request_status, line allocations, invoice links, or financial state.
- Updates reviewed_by and reviewed_at for audit trail.
- No notification sent for edits.

### 3. Security
- Both RPCs: SECURITY DEFINER, search_path = public, pg_temp.
- Revoke from PUBLIC and anon; grant to authenticated only.
- Role check inside the function body (Admin, Super Admin, Amministrazione).

### 4. Error Codes
- AUTH_REQUIRED, ROLE_NOT_ALLOWED, REQUEST_NOT_FOUND
- REQUEST_NOT_EDITABLE, DESCRIPTION_REQUIRED, DUE_DATE_REQUIRED
- NOTE_REQUIRED_MIN_5, CANNOT_CANCEL_WITH_EXECUTIONS, INVALID_TRANSITION
*/

-- 1. Replace admin_transition_payment_request with new transitions
CREATE OR REPLACE FUNCTION public.admin_transition_payment_request(
  p_payment_request_id uuid,
  p_target_status text,
  p_admin_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid;
  v_role text;
  v_current_status text;
  v_created_by uuid;
  v_descrizione text;
  v_valid boolean := false;
  v_note_required boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED';
  END IF;

  SELECT request_status, created_by, descrizione
    INTO v_current_status, v_created_by, v_descrizione
    FROM event_payments
   WHERE id = p_payment_request_id
     FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_current_status IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_EDITABLE'; END IF;

  -- Existing transitions
  IF v_current_status = 'inviata' AND p_target_status = 'in_verifica' THEN
    v_valid := true;
  ELSIF v_current_status = 'in_verifica' AND p_target_status = 'in_attesa_fattura' THEN
    v_valid := true; v_note_required := true;
  ELSIF v_current_status = 'in_verifica' AND p_target_status = 'respinta' THEN
    v_valid := true; v_note_required := true;
  ELSIF v_current_status = 'in_attesa_fattura' AND p_target_status = 'in_verifica' THEN
    v_valid := true;
  ELSIF v_current_status = 'in_attesa_fattura' AND p_target_status = 'respinta' THEN
    v_valid := true; v_note_required := true;
  ELSIF v_current_status = 'parzialmente_coperta' AND p_target_status = 'in_attesa_fattura' THEN
    v_valid := true;
  ELSIF v_current_status = 'approvata' AND p_target_status = 'annullata' THEN
    IF EXISTS (
      SELECT 1 FROM payment_executions
       WHERE payment_request_id = p_payment_request_id
         AND execution_status IN ('autorizzato', 'eseguito')
    ) THEN
      RAISE EXCEPTION 'CANNOT_CANCEL_WITH_EXECUTIONS';
    END IF;
    v_valid := true; v_note_required := true;

  -- New transitions: approval (note optional, no invoice required)
  ELSIF v_current_status = 'inviata' AND p_target_status = 'approvata' THEN
    v_valid := true;
  ELSIF v_current_status = 'in_verifica' AND p_target_status = 'approvata' THEN
    v_valid := true;
  ELSIF v_current_status = 'in_attesa_fattura' AND p_target_status = 'approvata' THEN
    v_valid := true;

  -- New transition: rejection from inviata (note required)
  ELSIF v_current_status = 'inviata' AND p_target_status = 'respinta' THEN
    v_valid := true; v_note_required := true;
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: % -> %', v_current_status, p_target_status;
  END IF;

  IF v_note_required AND (p_admin_note IS NULL OR length(trim(p_admin_note)) < 5) THEN
    RAISE EXCEPTION 'NOTE_REQUIRED_MIN_5';
  END IF;

  UPDATE event_payments
     SET request_status = p_target_status,
         admin_note = COALESCE(p_admin_note, admin_note),
         reviewed_by = v_uid,
         reviewed_at = now()
   WHERE id = p_payment_request_id;

  -- Notification to requester
  IF v_created_by IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, is_read)
    VALUES (
      v_created_by,
      CASE p_target_status
        WHEN 'in_verifica' THEN 'Richiesta presa in carico'
        WHEN 'in_attesa_fattura' THEN 'Richiesta: fattura necessaria'
        WHEN 'respinta' THEN 'Richiesta respinta'
        WHEN 'approvata' THEN 'Richiesta approvata'
        WHEN 'completata' THEN 'Pagamento completato'
        WHEN 'annullata' THEN 'Richiesta annullata'
        ELSE 'Aggiornamento richiesta'
      END,
      COALESCE(v_descrizione, '') || ' - ' || COALESCE(p_admin_note, ''),
      'payment_status_change',
      'event_payment',
      p_payment_request_id::text,
      false
    );
  END IF;
END;
$function$;

-- 2. Create admin_update_payment_request
CREATE OR REPLACE FUNCTION public.admin_update_payment_request(
  p_payment_request_id uuid,
  p_description text,
  p_due_date date,
  p_admin_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid;
  v_role text;
  v_current_status text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED';
  END IF;

  SELECT request_status INTO v_current_status
    FROM event_payments
   WHERE id = p_payment_request_id
     FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;

  IF v_current_status NOT IN ('inviata', 'in_verifica', 'in_attesa_fattura') THEN
    RAISE EXCEPTION 'REQUEST_NOT_EDITABLE';
  END IF;

  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION 'DESCRIPTION_REQUIRED';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'DUE_DATE_REQUIRED';
  END IF;

  UPDATE event_payments
     SET descrizione = trim(p_description),
         data_scadenza = p_due_date,
         admin_note = COALESCE(p_admin_note, admin_note),
         reviewed_by = v_uid,
         reviewed_at = now()
   WHERE id = p_payment_request_id;
END;
$function$;

-- 3. Permissions for transition RPC (idempotent)
REVOKE EXECUTE ON FUNCTION public.admin_transition_payment_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transition_payment_request(uuid, text, text) TO authenticated;

-- 4. Permissions for edit RPC
REVOKE EXECUTE ON FUNCTION public.admin_update_payment_request(uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_payment_request(uuid, text, date, text) TO authenticated;
