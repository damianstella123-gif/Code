/*
  Creates the missing RPC: admin_link_invoice_to_request
  Links an admin_fatture invoice to a payment request, validates constraints,
  and updates request_status based on coverage.
*/

CREATE OR REPLACE FUNCTION public.admin_link_invoice_to_request(
  p_payment_request_id uuid,
  p_invoice_id uuid,
  p_allocated_amount numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid;
  v_role text;
  v_req record;
  v_inv record;
  v_existing_sum numeric;
  v_new_total numeric;
  v_link_id uuid;
BEGIN
  -- Auth check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role NOT IN ('Admin', 'Super Admin', 'Amministrazione') THEN RAISE EXCEPTION 'ROLE_NOT_ALLOWED'; END IF;

  -- Validate amount
  IF p_allocated_amount IS NULL OR p_allocated_amount <= 0 THEN RAISE EXCEPTION 'INVALID_ALLOCATION'; END IF;

  -- Lock and fetch request
  SELECT id, tipo, request_status, importo, supplier_id, event_id
    INTO v_req
    FROM event_payments
   WHERE id = p_payment_request_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.tipo != 'pagamento_fornitore' THEN RAISE EXCEPTION 'INVALID_REQUEST_TYPE'; END IF;
  IF v_req.request_status NOT IN ('in_verifica', 'in_attesa_fattura', 'parzialmente_coperta') THEN
    RAISE EXCEPTION 'REQUEST_NOT_EDITABLE';
  END IF;

  -- Fetch and validate invoice
  SELECT id, tipo, soggetto_id, evento_id
    INTO v_inv
    FROM admin_fatture
   WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
  IF v_inv.tipo != 'uscita' THEN RAISE EXCEPTION 'INVOICE_NOT_USCITA'; END IF;

  -- Check not already linked
  IF EXISTS (
    SELECT 1 FROM payment_request_invoice_links
     WHERE payment_request_id = p_payment_request_id AND invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'INVOICE_ALREADY_LINKED';
  END IF;

  -- Supplier compatibility
  IF v_req.supplier_id IS NOT NULL AND v_inv.soggetto_id IS NOT NULL
     AND v_req.supplier_id != v_inv.soggetto_id THEN
    RAISE EXCEPTION 'SUPPLIER_MISMATCH';
  END IF;

  -- Event compatibility (both must match when both are valued)
  IF v_req.event_id IS NOT NULL AND v_inv.evento_id IS NOT NULL
     AND v_req.event_id != v_inv.evento_id THEN
    RAISE EXCEPTION 'EVENT_MISMATCH';
  END IF;

  -- Allocation cap check
  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_existing_sum
    FROM payment_request_invoice_links
   WHERE payment_request_id = p_payment_request_id;

  v_new_total := v_existing_sum + p_allocated_amount;
  IF v_new_total > (v_req.importo + 0.01) THEN
    RAISE EXCEPTION 'ALLOCATION_EXCEEDS_REQUEST';
  END IF;

  -- Insert link
  v_link_id := gen_random_uuid();
  INSERT INTO payment_request_invoice_links (id, payment_request_id, invoice_id, allocated_amount, created_by, created_at)
  VALUES (v_link_id, p_payment_request_id, p_invoice_id, p_allocated_amount, v_uid, now());

  -- Update request status based on coverage
  IF v_new_total >= (v_req.importo - 0.01) THEN
    UPDATE event_payments
       SET request_status = 'approvata',
           reviewed_by = v_uid,
           reviewed_at = now()
     WHERE id = p_payment_request_id;
  ELSE
    UPDATE event_payments
       SET request_status = 'parzialmente_coperta',
           reviewed_by = v_uid,
           reviewed_at = now()
     WHERE id = p_payment_request_id;
  END IF;

  RETURN v_link_id;
END;
$function$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.admin_link_invoice_to_request(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_link_invoice_to_request(uuid, uuid, numeric) TO authenticated;
