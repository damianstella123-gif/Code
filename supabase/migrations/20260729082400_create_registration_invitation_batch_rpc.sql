/*
# Create Registration Invitation Batch RPC

## Summary
Creates a SECURITY DEFINER RPC that atomically validates, deduplicates, and inserts
an invitation batch with its recipients. No emails are sent — this only persists the
draft batch for a subsequent worker to process.

## New Function
- `create_registration_invitation_batch(p_event_id, p_site_id, p_email_subject, p_email_message, p_recipients)`
  - Validates auth, permission, site ownership/status, subject/message lengths,
    and recipient data (names, email format, intra-batch uniqueness).
  - Excludes recipients already registered for the same event (by email).
  - Inserts one `invitation_batches` row (status = 'draft') and N `invitation_recipients` rows.
  - Returns `{ batch_id, recipient_count, skipped_registered }`.

## Security
- SECURITY DEFINER with locked search_path.
- Requires authenticated session via `auth.uid()`.
- Requires `has_event_permission(p_event_id, 'can_manage_registration')`.
- REVOKE from PUBLIC and anon; GRANT EXECUTE only to authenticated.

## Error Codes
AUTH_REQUIRED, NOT_AUTHORIZED, SITE_NOT_FOUND, SITE_NOT_PUBLISHED,
INVALID_SUBJECT, INVALID_MESSAGE, INVALID_RECIPIENTS, DUPLICATE_EMAIL,
NO_NEW_RECIPIENTS.

## Important Notes
1. No PII is logged — errors reference position indices only.
2. No emails are sent by this function.
3. No changes to existing tables, RLS policies, or data.
*/

CREATE OR REPLACE FUNCTION public.create_registration_invitation_batch(
  p_event_id     text,
  p_site_id      uuid,
  p_email_subject text,
  p_email_message text,
  p_recipients   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid           uuid := auth.uid();
  v_site_status   text;
  v_arr_len       integer;
  v_elem          jsonb;
  v_fn            text;
  v_ln            text;
  v_em            text;
  v_seen_emails   text[] := '{}';
  v_clean         jsonb[] := '{}';
  v_registered    text[];
  v_new           jsonb[];
  v_batch_id      uuid;
  v_inserted      integer;
  v_skipped       integer;
  i               integer;
BEGIN
  -- ── 1. Auth ────────────────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT has_event_permission(p_event_id, 'can_manage_registration') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- ── 2. Site validation ─────────────────────────────────────────────
  IF p_event_id IS NULL OR trim(p_event_id) = '' OR p_site_id IS NULL THEN
    RAISE EXCEPTION 'SITE_NOT_FOUND';
  END IF;

  SELECT rs.status INTO v_site_status
    FROM registration_sites rs
   WHERE rs.id = p_site_id AND rs.event_id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SITE_NOT_FOUND';
  END IF;

  IF v_site_status <> 'published' THEN
    RAISE EXCEPTION 'SITE_NOT_PUBLISHED';
  END IF;

  -- ── 3. Subject & message ───────────────────────────────────────────
  IF p_email_subject IS NULL
     OR length(trim(p_email_subject)) < 1
     OR length(trim(p_email_subject)) > 200 THEN
    RAISE EXCEPTION 'INVALID_SUBJECT';
  END IF;

  IF p_email_message IS NULL THEN
    p_email_message := '';
  END IF;

  IF length(p_email_message) > 10000 THEN
    RAISE EXCEPTION 'INVALID_MESSAGE';
  END IF;

  -- ── 4. Recipients array validation ─────────────────────────────────
  IF p_recipients IS NULL
     OR jsonb_typeof(p_recipients) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_RECIPIENTS';
  END IF;

  v_arr_len := jsonb_array_length(p_recipients);

  IF v_arr_len < 1 OR v_arr_len > 5000 THEN
    RAISE EXCEPTION 'INVALID_RECIPIENTS';
  END IF;

  -- ── 5. Parse and validate each recipient ───────────────────────────
  FOR i IN 0 .. v_arr_len - 1 LOOP
    v_elem := p_recipients -> i;

    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_RECIPIENTS';
    END IF;

    v_fn := trim(COALESCE(v_elem ->> 'first_name', ''));
    v_ln := trim(COALESCE(v_elem ->> 'last_name', ''));
    v_em := lower(trim(COALESCE(v_elem ->> 'email', '')));

    IF v_fn = '' OR v_ln = '' THEN
      RAISE EXCEPTION 'INVALID_RECIPIENTS';
    END IF;

    IF v_em = '' OR v_em !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      RAISE EXCEPTION 'INVALID_RECIPIENTS';
    END IF;

    IF v_em = ANY(v_seen_emails) THEN
      RAISE EXCEPTION 'DUPLICATE_EMAIL';
    END IF;

    v_seen_emails := array_append(v_seen_emails, v_em);
    v_clean := array_append(v_clean,
      jsonb_build_object('first_name', v_fn, 'last_name', v_ln, 'email', v_em)
    );
  END LOOP;

  -- ── 6. Exclude already-registered emails ───────────────────────────
  SELECT array_agg(lower(trim(er.email)))
    INTO v_registered
    FROM event_registrations er
   WHERE er.event_id = p_event_id
     AND er.email IS NOT NULL
     AND lower(trim(er.email)) = ANY(v_seen_emails);

  IF v_registered IS NULL THEN
    v_registered := '{}';
  END IF;

  v_new := '{}';
  FOR i IN 1 .. array_length(v_clean, 1) LOOP
    IF NOT ((v_clean[i] ->> 'email') = ANY(v_registered)) THEN
      v_new := array_append(v_new, v_clean[i]);
    END IF;
  END LOOP;

  v_skipped := array_length(v_clean, 1) - COALESCE(array_length(v_new, 1), 0);

  IF COALESCE(array_length(v_new, 1), 0) = 0 THEN
    RAISE EXCEPTION 'NO_NEW_RECIPIENTS';
  END IF;

  -- ── 7. Insert batch ────────────────────────────────────────────────
  INSERT INTO invitation_batches (
    event_id, site_id, created_by, status,
    email_subject, email_message, total_count
  ) VALUES (
    p_event_id, p_site_id, v_uid, 'draft',
    trim(p_email_subject), p_email_message, array_length(v_new, 1)
  )
  RETURNING id INTO v_batch_id;

  -- ── 8. Insert recipients ───────────────────────────────────────────
  INSERT INTO invitation_recipients (batch_id, first_name, last_name, email)
  SELECT v_batch_id,
         r ->> 'first_name',
         r ->> 'last_name',
         r ->> 'email'
    FROM unnest(v_new) AS r;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- ── 9. Return summary ─────────────────────────────────────────────
  RETURN jsonb_build_object(
    'batch_id',           v_batch_id,
    'recipient_count',    v_inserted,
    'skipped_registered', v_skipped
  );
END;
$fn$;

-- ── Grants ──────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_registration_invitation_batch(text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_registration_invitation_batch(text, uuid, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_registration_invitation_batch(text, uuid, text, text, jsonb) TO authenticated;
