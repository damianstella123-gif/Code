/*
# Create secure RPCs for payment request line linking and submission

## Purpose
Two SECURITY DEFINER RPCs that allow PMs to safely:
1. Link economic lines to their draft payment requests (bypasses RLS INSERT restriction
   on payment_request_line_links which cannot express polymorphic source_table validation)
2. Submit a validated payment request to Administration

## New Functions

### public.add_payment_request_line(p_payment_request_id, p_budget_version_id, p_source_table, p_source_line_id, p_allocated_amount)
- Returns uuid (the created link ID)
- Validates: auth, role, request ownership, request status, source_table whitelist,
  source line existence, event match, version match, supplier match, allocation cap
- Uses dynamic SQL ONLY after source_table is validated against a fixed whitelist
- SECURITY DEFINER: required because payment_request_line_links INSERT policy
  is admin-only (polymorphic check cannot be expressed in RLS)

### public.submit_payment_request(p_payment_request_id)
- Returns void
- Validates: auth, role, ownership, status=bozza, lines exist, allocation matches importo,
  importo > 0, supplier_id present for pagamento_fornitore, client_id for incasso_cliente,
  descrizione not empty, data_scadenza present
- Sets: request_status='inviata', submitted_at=now(), submitted_by=auth.uid()
- SECURITY DEFINER: required to atomically update the request bypassing
  PM UPDATE policy (which allows bozza->inviata transition via WITH CHECK
  but the function ensures all validations pass first)

## Security
- Both functions: SECURITY DEFINER, SET search_path = public
- EXECUTE revoked from PUBLIC, anon; granted to authenticated
- No RLS policies modified
- No tables/columns modified
- Error codes are machine-readable for frontend handling

## Important Notes
1. Budget version must be: (tipo='preventivo' AND stato='approvato')
   OR (tipo='consuntivo' AND stato='bozza')
2. Allocation tolerance: sum of existing + new <= importo + 0.01
3. Supplier match: if request has supplier_id AND source line has supplier_id,
   they must be equal; staff_interno lines with NULL supplier_id are exempt
4. No notifications created (deferred to frontend/trigger prompt)
5. Idempotent: CREATE OR REPLACE
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 1: add_payment_request_line
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.add_payment_request_line(
  p_payment_request_id uuid,
  p_budget_version_id uuid,
  p_source_table text,
  p_source_line_id text,
  p_allocated_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_req record;
  v_bv record;
  v_line_event_id text;
  v_line_bv_id uuid;
  v_line_supplier_id text;
  v_existing_sum numeric;
  v_link_id uuid;
  v_allowed_tables text[] := ARRAY[
    'event_supplier_services',
    'event_hotel_details',
    'event_restaurant_details',
    'event_experience_details',
    'event_catering_details',
    'event_staff_interno_details',
    'event_staff_esterno_details',
    'event_varie_details',
    'event_audio_video_details',
    'event_allestimenti_details',
    'event_grafica_stampa_details'
  ];
BEGIN
  -- Auth check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Role check
  v_role := get_my_role();
  IF v_role NOT IN ('Project Manager', 'Senior PM', 'Admin', 'Super Admin', 'Amministrazione') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED';
  END IF;

  -- Validate amount
  IF p_allocated_amount IS NULL OR p_allocated_amount <= 0 OR p_allocated_amount = 'NaN'::numeric THEN
    RAISE EXCEPTION 'INVALID_ALLOCATION';
  END IF;

  -- Validate source_table against fixed whitelist
  IF NOT (p_source_table = ANY(v_allowed_tables)) THEN
    RAISE EXCEPTION 'INVALID_SOURCE_TABLE';
  END IF;

  -- Load the request
  SELECT id, event_id, request_status, created_by, importo, supplier_id
    INTO v_req
    FROM public.event_payments
    WHERE id = p_payment_request_id;

  IF v_req IS NULL THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;

  -- Status + ownership check
  IF v_role IN ('Project Manager', 'Senior PM') THEN
    IF v_req.created_by != v_uid THEN
      RAISE EXCEPTION 'REQUEST_NOT_FOUND';
    END IF;
    IF v_req.request_status IS DISTINCT FROM 'bozza' THEN
      RAISE EXCEPTION 'REQUEST_NOT_EDITABLE';
    END IF;
  ELSE
    -- Admin roles: reject completed/cancelled
    IF v_req.request_status IN ('completata', 'annullata') THEN
      RAISE EXCEPTION 'REQUEST_NOT_EDITABLE';
    END IF;
  END IF;

  -- Check for duplicate link
  IF EXISTS (
    SELECT 1 FROM public.payment_request_line_links
    WHERE payment_request_id = p_payment_request_id
      AND source_table = p_source_table
      AND source_line_id = p_source_line_id
  ) THEN
    RAISE EXCEPTION 'LINE_ALREADY_LINKED';
  END IF;

  -- Validate budget_version
  SELECT id, event_id, tipo, stato
    INTO v_bv
    FROM public.budget_versions
    WHERE id = p_budget_version_id;

  IF v_bv IS NULL THEN
    RAISE EXCEPTION 'VERSION_MISMATCH';
  END IF;

  IF v_bv.event_id != v_req.event_id THEN
    RAISE EXCEPTION 'VERSION_MISMATCH';
  END IF;

  IF NOT (
    (v_bv.tipo = 'preventivo' AND v_bv.stato = 'approvato')
    OR (v_bv.tipo = 'consuntivo' AND v_bv.stato = 'bozza')
  ) THEN
    RAISE EXCEPTION 'VERSION_NOT_ALLOWED';
  END IF;

  -- Load source line via dynamic SQL (table already validated against whitelist)
  EXECUTE format(
    'SELECT event_id, budget_version_id, supplier_id FROM %I WHERE id::text = $1',
    p_source_table
  )
  INTO v_line_event_id, v_line_bv_id, v_line_supplier_id
  USING p_source_line_id;

  IF v_line_event_id IS NULL THEN
    RAISE EXCEPTION 'SOURCE_LINE_NOT_FOUND';
  END IF;

  -- Event match
  IF v_line_event_id != v_req.event_id THEN
    RAISE EXCEPTION 'EVENT_MISMATCH';
  END IF;

  -- Budget version match on the line
  IF v_line_bv_id IS DISTINCT FROM p_budget_version_id THEN
    RAISE EXCEPTION 'VERSION_MISMATCH';
  END IF;

  -- Supplier match (skip if line has no supplier — e.g. staff_interno)
  IF v_req.supplier_id IS NOT NULL AND v_line_supplier_id IS NOT NULL THEN
    IF v_req.supplier_id != v_line_supplier_id THEN
      RAISE EXCEPTION 'SUPPLIER_MISMATCH';
    END IF;
  END IF;

  -- Allocation cap: existing sum + new must not exceed importo + 0.01
  SELECT COALESCE(SUM(allocated_amount), 0)
    INTO v_existing_sum
    FROM public.payment_request_line_links
    WHERE payment_request_id = p_payment_request_id;

  IF (v_existing_sum + p_allocated_amount) > (v_req.importo + 0.01) THEN
    RAISE EXCEPTION 'ALLOCATION_EXCEEDS_REQUEST';
  END IF;

  -- Insert the link
  INSERT INTO public.payment_request_line_links (
    payment_request_id, budget_version_id, source_table, source_line_id,
    allocated_amount, created_by
  ) VALUES (
    p_payment_request_id, p_budget_version_id, p_source_table, p_source_line_id,
    p_allocated_amount, v_uid
  )
  RETURNING id INTO v_link_id;

  RETURN v_link_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_payment_request_line(uuid, uuid, text, text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_payment_request_line(uuid, uuid, text, text, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_payment_request_line(uuid, uuid, text, text, numeric) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- RPC 2: submit_payment_request
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_payment_request(
  p_payment_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_req record;
  v_line_count integer;
  v_alloc_sum numeric;
BEGIN
  -- Auth check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Role check
  v_role := get_my_role();
  IF v_role NOT IN ('Project Manager', 'Senior PM', 'Admin', 'Super Admin', 'Amministrazione') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED';
  END IF;

  -- Load the request
  SELECT id, event_id, request_status, created_by, importo, tipo,
         supplier_id, client_id, descrizione, data_scadenza
    INTO v_req
    FROM public.event_payments
    WHERE id = p_payment_request_id;

  IF v_req IS NULL THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;

  -- Ownership check for PM
  IF v_role IN ('Project Manager', 'Senior PM') THEN
    IF v_req.created_by != v_uid THEN
      RAISE EXCEPTION 'REQUEST_NOT_FOUND';
    END IF;
  END IF;

  -- Status must be bozza
  IF v_req.request_status IS DISTINCT FROM 'bozza' THEN
    RAISE EXCEPTION 'REQUEST_NOT_EDITABLE';
  END IF;

  -- Importo validation
  IF v_req.importo IS NULL OR v_req.importo <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Must have at least one line linked
  SELECT count(*), COALESCE(sum(allocated_amount), 0)
    INTO v_line_count, v_alloc_sum
    FROM public.payment_request_line_links
    WHERE payment_request_id = p_payment_request_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'NO_LINES';
  END IF;

  -- Allocation must match importo within tolerance
  IF ABS(v_alloc_sum - v_req.importo) > 0.01 THEN
    RAISE EXCEPTION 'ALLOCATION_MISMATCH';
  END IF;

  -- Tipo-specific validations
  IF v_req.tipo = 'pagamento_fornitore' AND (v_req.supplier_id IS NULL OR v_req.supplier_id = '') THEN
    RAISE EXCEPTION 'SUPPLIER_REQUIRED';
  END IF;

  IF v_req.tipo = 'incasso_cliente' AND (v_req.client_id IS NULL OR v_req.client_id = '') THEN
    RAISE EXCEPTION 'CLIENT_REQUIRED';
  END IF;

  -- Descrizione must not be empty
  IF v_req.descrizione IS NULL OR TRIM(v_req.descrizione) = '' THEN
    RAISE EXCEPTION 'DESCRIPTION_REQUIRED';
  END IF;

  -- Data scadenza must be present
  IF v_req.data_scadenza IS NULL THEN
    RAISE EXCEPTION 'DUE_DATE_REQUIRED';
  END IF;

  -- All validations passed — submit the request
  UPDATE public.event_payments
    SET request_status = 'inviata',
        submitted_at = now(),
        submitted_by = v_uid
    WHERE id = p_payment_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_payment_request(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_payment_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_payment_request(uuid) TO authenticated;
