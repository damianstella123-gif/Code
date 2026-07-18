/*
  Migration: 20260718202548_create_admin_payment_rpcs
  
  Already applied to Supabase. This file restores local repository alignment.
  
  Contents:
  1. Add admin_note, reviewed_by, reviewed_at columns to event_payments (idempotent)
  2. Create admin_transition_payment_request RPC
  3. Create admin_create_payment_execution RPC
  4. Create admin_transition_payment_execution RPC
  5. Revoke/grant EXECUTE permissions
*/

-- 1. Idempotent column additions
ALTER TABLE event_payments ADD COLUMN IF NOT EXISTS admin_note text;
ALTER TABLE event_payments ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE event_payments ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- 2. admin_transition_payment_request
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
v_uid uuid; v_role text; v_current_status text; v_created_by uuid; v_descrizione text;
v_valid boolean := false; v_note_required boolean := false;
BEGIN
v_uid := auth.uid();
IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
SELECT role INTO v_role FROM profiles WHERE id = v_uid;
IF v_role NOT IN ('Admin', 'Super Admin', 'Amministrazione') THEN RAISE EXCEPTION 'ROLE_NOT_ALLOWED'; END IF;

SELECT request_status, created_by, descrizione INTO v_current_status, v_created_by, v_descrizione
FROM event_payments WHERE id = p_payment_request_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
IF v_current_status IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_EDITABLE'; END IF;

IF v_current_status = 'inviata' AND p_target_status = 'in_verifica' THEN v_valid := true;
ELSIF v_current_status = 'in_verifica' AND p_target_status = 'in_attesa_fattura' THEN v_valid := true; v_note_required := true;
ELSIF v_current_status = 'in_verifica' AND p_target_status = 'respinta' THEN v_valid := true; v_note_required := true;
ELSIF v_current_status = 'in_attesa_fattura' AND p_target_status = 'in_verifica' THEN v_valid := true;
ELSIF v_current_status = 'in_attesa_fattura' AND p_target_status = 'respinta' THEN v_valid := true; v_note_required := true;
ELSIF v_current_status = 'parzialmente_coperta' AND p_target_status = 'in_attesa_fattura' THEN v_valid := true;
ELSIF v_current_status = 'approvata' AND p_target_status = 'annullata' THEN
IF EXISTS (SELECT 1 FROM payment_executions WHERE payment_request_id = p_payment_request_id AND execution_status IN ('autorizzato','eseguito')) THEN
RAISE EXCEPTION 'CANNOT_CANCEL_WITH_EXECUTIONS';
END IF;
v_valid := true; v_note_required := true;
END IF;

IF NOT v_valid THEN RAISE EXCEPTION 'INVALID_TRANSITION: % -> %', v_current_status, p_target_status; END IF;
IF v_note_required AND (p_admin_note IS NULL OR length(trim(p_admin_note)) < 5) THEN RAISE EXCEPTION 'NOTE_REQUIRED_MIN_5'; END IF;

UPDATE event_payments SET request_status = p_target_status, admin_note = COALESCE(p_admin_note, admin_note), reviewed_by = v_uid, reviewed_at = now()
WHERE id = p_payment_request_id;

IF v_created_by IS NOT NULL THEN
INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, is_read)
VALUES (v_created_by,
CASE p_target_status WHEN 'in_verifica' THEN 'Richiesta presa in carico' WHEN 'in_attesa_fattura' THEN 'Richiesta: fattura necessaria' WHEN 'respinta' THEN 'Richiesta respinta' WHEN 'approvata' THEN 'Richiesta approvata' WHEN 'completata' THEN 'Pagamento completato' WHEN 'annullata' THEN 'Richiesta annullata' ELSE 'Aggiornamento richiesta' END,
COALESCE(v_descrizione, '') || ' - ' || COALESCE(p_admin_note, ''), 'payment_status_change', 'event_payment', p_payment_request_id::text, false);
END IF;
END;
$function$;

-- 3. admin_create_payment_execution
CREATE OR REPLACE FUNCTION public.admin_create_payment_execution(
  p_payment_request_id uuid,
  p_amount numeric,
  p_invoice_id uuid DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
v_uid uuid; v_role text; v_req record; v_exec_sum numeric; v_exec_id uuid;
BEGIN
v_uid := auth.uid();
IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
SELECT role INTO v_role FROM profiles WHERE id = v_uid;
IF v_role NOT IN ('Admin', 'Super Admin', 'Amministrazione') THEN RAISE EXCEPTION 'ROLE_NOT_ALLOWED'; END IF;

SELECT id, event_id, supplier_id, importo, request_status INTO v_req FROM event_payments WHERE id = p_payment_request_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
IF v_req.request_status != 'approvata' THEN RAISE EXCEPTION 'REQUEST_NOT_APPROVED'; END IF;
IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

IF p_invoice_id IS NOT NULL THEN
IF NOT EXISTS (SELECT 1 FROM payment_request_invoice_links WHERE payment_request_id = p_payment_request_id AND invoice_id = p_invoice_id) THEN
RAISE EXCEPTION 'INVOICE_NOT_LINKED';
END IF;
END IF;

SELECT COALESCE(SUM(amount), 0) INTO v_exec_sum FROM payment_executions WHERE payment_request_id = p_payment_request_id AND execution_status != 'annullato';
IF (v_exec_sum + p_amount) > (v_req.importo + 0.01) THEN RAISE EXCEPTION 'EXECUTION_EXCEEDS_REQUEST'; END IF;

v_exec_id := gen_random_uuid();
INSERT INTO payment_executions (id, payment_request_id, invoice_id, event_id, supplier_id, amount, execution_status, due_date, note, created_by, created_at, updated_at)
VALUES (v_exec_id, p_payment_request_id, p_invoice_id, v_req.event_id, v_req.supplier_id, p_amount, 'da_pianificare', p_due_date, p_note, v_uid, now(), now());

RETURN v_exec_id;
END;
$function$;

-- 4. admin_transition_payment_execution
CREATE OR REPLACE FUNCTION public.admin_transition_payment_execution(
  p_execution_id uuid,
  p_target_status text,
  p_scheduled_date date DEFAULT NULL,
  p_executed_date date DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_bank_reference text DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
v_uid uuid; v_role text; v_exec record; v_valid boolean := false;
v_total_executed numeric; v_req_importo numeric; v_req_id uuid; v_max_date date;
BEGIN
v_uid := auth.uid();
IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
SELECT role INTO v_role FROM profiles WHERE id = v_uid;
IF v_role NOT IN ('Admin', 'Super Admin', 'Amministrazione') THEN RAISE EXCEPTION 'ROLE_NOT_ALLOWED'; END IF;

SELECT id, execution_status, payment_request_id INTO v_exec FROM payment_executions WHERE id = p_execution_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;

IF v_exec.execution_status = 'da_pianificare' AND p_target_status = 'pianificato' THEN v_valid := true;
ELSIF v_exec.execution_status = 'pianificato' AND p_target_status = 'autorizzato' THEN v_valid := true;
ELSIF v_exec.execution_status = 'autorizzato' AND p_target_status = 'eseguito' THEN v_valid := true;
ELSIF v_exec.execution_status IN ('da_pianificare','pianificato','autorizzato') AND p_target_status = 'annullato' THEN v_valid := true;
END IF;

IF NOT v_valid THEN RAISE EXCEPTION 'INVALID_TRANSITION: % -> %', v_exec.execution_status, p_target_status; END IF;
IF p_target_status = 'pianificato' AND p_scheduled_date IS NULL THEN RAISE EXCEPTION 'SCHEDULED_DATE_REQUIRED'; END IF;
IF p_target_status = 'eseguito' AND p_executed_date IS NULL THEN RAISE EXCEPTION 'EXECUTED_DATE_REQUIRED'; END IF;
IF p_target_status = 'eseguito' AND (p_payment_method IS NULL OR length(trim(p_payment_method)) = 0) THEN RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED'; END IF;
IF p_target_status = 'annullato' AND (p_note IS NULL OR length(trim(p_note)) < 5) THEN RAISE EXCEPTION 'NOTE_REQUIRED_MIN_5'; END IF;

UPDATE payment_executions SET
execution_status = p_target_status,
scheduled_date = COALESCE(p_scheduled_date, scheduled_date),
executed_date = CASE WHEN p_target_status = 'eseguito' THEN p_executed_date ELSE executed_date END,
payment_method = COALESCE(p_payment_method, payment_method),
bank_reference = COALESCE(p_bank_reference, bank_reference),
note = COALESCE(p_note, note),
authorized_by = CASE WHEN p_target_status = 'autorizzato' THEN v_uid ELSE authorized_by END,
authorized_at = CASE WHEN p_target_status = 'autorizzato' THEN now() ELSE authorized_at END,
executed_by = CASE WHEN p_target_status = 'eseguito' THEN v_uid ELSE executed_by END,
executed_at = CASE WHEN p_target_status = 'eseguito' THEN now() ELSE executed_at END,
updated_at = now()
WHERE id = p_execution_id;

IF p_target_status = 'eseguito' THEN
v_req_id := v_exec.payment_request_id;
SELECT COALESCE(SUM(amount), 0) INTO v_total_executed FROM payment_executions WHERE payment_request_id = v_req_id AND execution_status = 'eseguito';
SELECT importo INTO v_req_importo FROM event_payments WHERE id = v_req_id;
IF v_total_executed >= (v_req_importo - 0.01) THEN
SELECT MAX(executed_date) INTO v_max_date FROM payment_executions WHERE payment_request_id = v_req_id AND execution_status = 'eseguito';
UPDATE event_payments SET request_status = 'completata', stato = 'pagato', data_pagamento = v_max_date, reviewed_by = v_uid, reviewed_at = now() WHERE id = v_req_id;
END IF;
END IF;
END;
$function$;

-- 5. Permissions
REVOKE EXECUTE ON FUNCTION public.admin_transition_payment_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transition_payment_request(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_create_payment_execution(uuid, numeric, uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_payment_execution(uuid, numeric, uuid, date, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_transition_payment_execution(uuid, text, date, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transition_payment_execution(uuid, text, date, date, text, text, text) TO authenticated;
