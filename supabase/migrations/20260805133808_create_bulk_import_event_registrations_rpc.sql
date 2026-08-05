/*
# Batch import RPC for participants with dual-write encryption

Server-side helper that keeps the encryption / hashing logic in one
place (the DB). Callers pass a JSONB array of participant rows and the
RPC dual-writes plaintext + `_enc` columns and `email_lookup_hash` using
the existing `public.pii_key()` and `public._hmac_email_lookup(text)`
helpers — the same primitives `submit_event_registration` uses. Callers
never have to know how encryption works.

Authorization: matches the client-side gate used in
`participant-import-service.ts` and `fly-gateway/index.ts` — the caller
must hold `can_manage_registration` on the target event. The RPC also
runs `SECURITY DEFINER` so it can write the encrypted columns even when
column privileges are tightened for the anon/authenticated roles.

Skipped rows:
- rows whose `email` collides with an existing registration for the
  same event (by `lower(email)` OR the new `email_lookup_hash`) are
  silently skipped, mirroring the dedupe strategy the two caller sites
  already do client-side. This gives the caller idempotent behaviour.

Returned shape: `TABLE(id uuid)` so callers can use the standard
`.select` chain and read `data.length` + `data[i].id`.
*/

CREATE OR REPLACE FUNCTION public.bulk_import_event_registrations(
  p_event_id text,
  p_rows     jsonb
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_pii_key  text;
  v_row      jsonb;
  v_first    text;
  v_last     text;
  v_email    text;
  v_phone    text;
  v_company  text;
  v_job      text;
  v_diet     text;
  v_acc      text;
  v_answers  jsonb;
  v_hash     bytea;
  v_new_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_event_id IS NULL OR trim(p_event_id) = '' THEN
    RAISE EXCEPTION 'INVALID_EVENT_ID';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_ROWS';
  END IF;

  IF NOT has_event_permission(p_event_id, 'can_manage_registration') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  v_pii_key := public.pii_key();

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_first   := coalesce(trim(v_row ->> 'first_name'), '');
    v_last    := coalesce(trim(v_row ->> 'last_name'),  '');

    IF v_first = '' OR v_last = '' THEN
      CONTINUE;
    END IF;

    v_email   := lower(coalesce(trim(v_row ->> 'email'), ''));
    v_phone   := coalesce(v_row ->> 'phone', '');
    v_company := coalesce(v_row ->> 'company', '');
    v_job     := coalesce(v_row ->> 'job_title', '');
    v_diet    := coalesce(v_row ->> 'dietary_requirements', '');
    v_acc     := coalesce(v_row ->> 'accessibility_requirements', '');

    IF (v_row -> 'custom_answers') IS NOT NULL
       AND jsonb_typeof(v_row -> 'custom_answers') = 'object'
    THEN
      v_answers := v_row -> 'custom_answers';
    ELSE
      v_answers := '{}'::jsonb;
    END IF;

    v_hash := CASE WHEN v_email = '' THEN NULL
                   ELSE public._hmac_email_lookup(v_email) END;

    -- Skip duplicates: same event, matching plaintext-lowered email or hash.
    IF v_email <> '' AND EXISTS (
      SELECT 1 FROM event_registrations er
      WHERE er.event_id = p_event_id
        AND (
          lower(er.email) = v_email
          OR (v_hash IS NOT NULL AND er.email_lookup_hash = v_hash)
        )
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO event_registrations (
        site_id, event_id, source, registration_status,
        first_name, last_name, email,
        phone, company, job_title,
        dietary_requirements, accessibility_requirements,
        custom_answers, privacy_accepted, marketing_consent,
        first_name_enc, last_name_enc, email_enc, phone_enc,
        dietary_requirements_enc, accessibility_requirements_enc,
        email_lookup_hash
      ) VALUES (
        NULL, p_event_id, 'import', 'confirmed',
        v_first, v_last, NULLIF(v_email, ''),
        v_phone, v_company, v_job,
        v_diet, v_acc,
        v_answers, false, false,
        CASE WHEN v_first = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_first, v_pii_key) END,
        CASE WHEN v_last  = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_last,  v_pii_key) END,
        CASE WHEN v_email = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_email, v_pii_key) END,
        CASE WHEN v_phone = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_phone, v_pii_key) END,
        CASE WHEN v_diet  = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_diet,  v_pii_key) END,
        CASE WHEN v_acc   = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_acc,   v_pii_key) END,
        v_hash
      )
      RETURNING event_registrations.id INTO v_new_id;

      id := v_new_id;
      RETURN NEXT;
    EXCEPTION
      WHEN unique_violation THEN
        CONTINUE;
    END;
  END LOOP;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_import_event_registrations(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_import_event_registrations(text, jsonb) TO authenticated;
