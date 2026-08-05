/*
# Dual-write plaintext and encrypted PII in registration RPCs

Transition step: `submit_event_registration` and
`update_registration_by_manage_token` now write both the plaintext columns
(unchanged) and the new encrypted / hashed sibling columns. The plaintext
columns are still authoritative for reads; the encrypted columns are being
populated so that a future cutover can flip readers over to the view.

External behaviour of both functions is preserved: same parameter list,
same return shape, same rate limiting, same validation, same allow-list,
same length limits, same XSS filter, same row lock.

## submit_event_registration
- Adds `email_lookup_hash` computation via `public._hmac_email_lookup`.
- Duplicate detection now checks BOTH `lower(email) = v_email` (existing
  behaviour, still index-backed by `idx_er_event_email_unique`) AND the
  new hash-based match, so no submission can bypass either code path
  during the transition.
- INSERT now writes the six `_enc` columns and `email_lookup_hash`
  alongside the plaintext columns. Empty/whitespace-only plaintext maps
  to NULL in the `_enc` column (matching the migration convention).

## update_registration_by_manage_token
- For each of the three PII fields it can edit (`phone`,
  `dietary_requirements`, `accessibility_requirements`), the UPDATE now
  also writes the corresponding `_enc` column.
- Allow-list, length limits, XSS filter and row lock are unchanged.
*/

CREATE OR REPLACE FUNCTION public.submit_event_registration(
  p_slug text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text DEFAULT ''::text,
  p_company text DEFAULT ''::text,
  p_job_title text DEFAULT ''::text,
  p_dietary_requirements text DEFAULT ''::text,
  p_accessibility_requirements text DEFAULT ''::text,
  p_custom_answers jsonb DEFAULT '{}'::jsonb,
  p_privacy_accepted boolean DEFAULT false,
  p_marketing_consent boolean DEFAULT false,
  p_honeypot text DEFAULT ''::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_slug text;
  v_site record;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_company text;
  v_job_title text;
  v_dietary text;
  v_accessibility text;
  v_confirmed_count integer;
  v_reg_status text;
  v_reg_id uuid;
  v_qr uuid;
  v_field record;
  v_answer_key text;
  v_answer_val jsonb;
  v_answer_text text;
  v_valid_keys text[];
  v_clean_answers jsonb := '{}';
  v_self_service_enabled boolean;
  v_edit_until timestamptz;
  v_raw_token_bytes bytea;
  v_raw_token_hex text;
  v_token_hash bytea;
  v_token_expires timestamptz;
  v_max_short  int := 500;
  v_max_long   int := 1000;
  v_max_custom int := 2000;
  v_unsafe_pattern text := '(<\s*script|<\s*iframe|javascript\s*:|on\w+\s*=)';
  v_rl_window timestamptz;
  v_rl_count  int;
  v_hmac_key text;
  v_issued_at bigint;
  v_email_signature text;
  v_email_hash bytea;
  v_pii_key text;
BEGIN
  IF coalesce(trim(p_honeypot), '') <> '' THEN
    RETURN jsonb_build_object('error', 'REGISTRATION_REJECTED');
  END IF;

  v_slug := lower(trim(p_slug));

  SELECT id, event_id, slug, confirmation_message, capacity, waitlist_enabled,
         settings, closes_at
  INTO v_site
  FROM registration_sites
  WHERE slug = v_slug
    AND status = 'published'
    AND (opens_at IS NULL OR opens_at <= now())
    AND (closes_at IS NULL OR closes_at > now())
  FOR UPDATE;

  IF v_site IS NULL THEN
    RETURN jsonb_build_object('error', 'SITE_NOT_AVAILABLE');
  END IF;

  BEGIN
    v_rl_window := date_trunc('minute', now());

    DELETE FROM registration_rate_limits
    WHERE site_id = v_site.id
      AND window_start < now() - interval '1 hour';

    SELECT count INTO v_rl_count
    FROM registration_rate_limits
    WHERE site_id = v_site.id
      AND window_start = v_rl_window
    FOR UPDATE;

    IF v_rl_count IS NOT NULL AND v_rl_count >= 30 THEN
      RETURN jsonb_build_object('error', 'REGISTRATION_NOT_COMPLETED');
    END IF;

    INSERT INTO registration_rate_limits (site_id, window_start, count)
    VALUES (v_site.id, v_rl_window, 1)
    ON CONFLICT (site_id, window_start)
    DO UPDATE SET count = registration_rate_limits.count + 1;

  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;

  v_first_name    := trim(p_first_name);
  v_last_name     := trim(p_last_name);
  v_email         := lower(trim(p_email));
  v_phone         := coalesce(trim(p_phone), '');
  v_company       := coalesce(trim(p_company), '');
  v_job_title     := coalesce(trim(p_job_title), '');
  v_dietary       := coalesce(trim(p_dietary_requirements), '');
  v_accessibility := coalesce(trim(p_accessibility_requirements), '');

  IF v_first_name = '' OR v_last_name = '' THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Nome e cognome sono obbligatori.');
  END IF;

  IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Indirizzo email non valido.');
  END IF;

  IF p_privacy_accepted IS NOT TRUE THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'L''accettazione della privacy è obbligatoria.');
  END IF;

  IF length(v_first_name)    > v_max_short THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo nome è troppo lungo.'); END IF;
  IF length(v_last_name)     > v_max_short THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo cognome è troppo lungo.'); END IF;
  IF length(v_email)         > v_max_short THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Indirizzo email troppo lungo.'); END IF;
  IF length(v_phone)         > v_max_short THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo telefono è troppo lungo.'); END IF;
  IF length(v_company)       > v_max_short THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo azienda è troppo lungo.'); END IF;
  IF length(v_job_title)     > v_max_short THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo ruolo è troppo lungo.'); END IF;
  IF length(v_dietary)       > v_max_long  THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo esigenze alimentari è troppo lungo.'); END IF;
  IF length(v_accessibility) > v_max_long  THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo esigenze di accessibilità è troppo lungo.'); END IF;

  IF v_first_name    ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo nome contiene contenuto non consentito.'); END IF;
  IF v_last_name     ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo cognome contiene contenuto non consentito.'); END IF;
  IF v_phone         ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo telefono contiene contenuto non consentito.'); END IF;
  IF v_company       ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo azienda contiene contenuto non consentito.'); END IF;
  IF v_job_title     ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo ruolo contiene contenuto non consentito.'); END IF;
  IF v_dietary       ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo esigenze alimentari contiene contenuto non consentito.'); END IF;
  IF v_accessibility ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo esigenze di accessibilità contiene contenuto non consentito.'); END IF;

  IF jsonb_typeof(p_custom_answers) <> 'object' THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Formato risposte personalizzate non valido.');
  END IF;

  SELECT array_agg(f.field_key)
  INTO v_valid_keys
  FROM registration_form_fields f
  WHERE f.site_id = v_site.id AND f.is_active = true;

  v_valid_keys := coalesce(v_valid_keys, ARRAY[]::text[]);

  FOR v_answer_key IN SELECT jsonb_object_keys(p_custom_answers) LOOP
    IF NOT (v_answer_key = ANY(v_valid_keys)) THEN
      RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message',
        format('Campo personalizzato non riconosciuto: %s', v_answer_key));
    END IF;
  END LOOP;

  FOR v_field IN
    SELECT f.field_key, f.field_type, f.required
    FROM registration_form_fields f
    WHERE f.site_id = v_site.id AND f.is_active = true AND f.required = true
  LOOP
    v_answer_val := p_custom_answers -> v_field.field_key;

    IF v_field.field_type = 'checkbox' THEN
      IF v_answer_val IS NULL OR v_answer_val <> 'true'::jsonb THEN
        RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message',
          format('Il campo "%s" è obbligatorio.', v_field.field_key));
      END IF;
    ELSE
      IF v_answer_val IS NULL
         OR jsonb_typeof(v_answer_val) = 'null'
         OR (jsonb_typeof(v_answer_val) = 'string' AND trim(v_answer_val #>> '{}') = '') THEN
        RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message',
          format('Il campo "%s" è obbligatorio.', v_field.field_key));
      END IF;
    END IF;
  END LOOP;

  FOR v_answer_key IN SELECT jsonb_object_keys(p_custom_answers) LOOP
    IF v_answer_key = ANY(v_valid_keys) THEN
      v_answer_val := p_custom_answers -> v_answer_key;

      IF jsonb_typeof(v_answer_val) = 'string' THEN
        v_answer_text := trim(v_answer_val #>> '{}');
        IF length(v_answer_text) > v_max_custom THEN
          RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message',
            format('Il campo "%s" è troppo lungo.', v_answer_key));
        END IF;
        IF v_answer_text ~* v_unsafe_pattern THEN
          RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message',
            format('Il campo "%s" contiene contenuto non consentito.', v_answer_key));
        END IF;
        v_answer_val := to_jsonb(v_answer_text);
      END IF;

      v_clean_answers := v_clean_answers || jsonb_build_object(v_answer_key, v_answer_val);
    END IF;
  END LOOP;

  -- ══ Duplicate detection: check BOTH the legacy plaintext-lowered path
  --    (backed by idx_er_event_email_unique on (event_id, lower(email))) AND
  --    the new email_lookup_hash path. During transition either must
  --    catch a re-submission — neither can be bypassed. ══
  v_email_hash := public._hmac_email_lookup(v_email);

  IF EXISTS (
    SELECT 1 FROM event_registrations
    WHERE site_id = v_site.id
      AND (
        lower(email) = v_email
        OR (v_email_hash IS NOT NULL AND email_lookup_hash = v_email_hash)
      )
  ) THEN
    RETURN jsonb_build_object('error', 'REGISTRATION_NOT_COMPLETED');
  END IF;

  IF v_site.capacity IS NOT NULL THEN
    SELECT count(*)
    INTO v_confirmed_count
    FROM event_registrations
    WHERE site_id = v_site.id AND registration_status = 'confirmed';

    IF v_confirmed_count >= v_site.capacity THEN
      IF v_site.waitlist_enabled THEN
        v_reg_status := 'waitlist';
      ELSE
        RETURN jsonb_build_object('error', 'EVENT_FULL');
      END IF;
    ELSE
      v_reg_status := 'confirmed';
    END IF;
  ELSE
    v_reg_status := 'confirmed';
  END IF;

  v_self_service_enabled := coalesce(
    (v_site.settings ->> 'self_service_edit_enabled')::boolean,
    false
  );

  IF v_self_service_enabled THEN
    v_raw_token_bytes := extensions.gen_random_bytes(32);
    v_raw_token_hex   := encode(v_raw_token_bytes, 'hex');
    v_token_hash      := extensions.digest(v_raw_token_bytes, 'sha256');

    BEGIN
      v_edit_until := (v_site.settings ->> 'self_service_edit_until')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_edit_until := NULL;
    END;

    IF v_edit_until IS NOT NULL AND v_edit_until > now() THEN
      v_token_expires := v_edit_until;
    ELSIF v_site.closes_at IS NOT NULL AND v_site.closes_at > now() THEN
      v_token_expires := v_site.closes_at;
    ELSE
      v_token_expires := now() + interval '30 days';
    END IF;
  END IF;

  -- Fetch the PII key once (avoids one SECURITY DEFINER call per column).
  v_pii_key := public.pii_key();

  BEGIN
    INSERT INTO event_registrations (
      site_id, event_id, registration_status,
      first_name, last_name, email,
      phone, company, job_title,
      dietary_requirements, accessibility_requirements,
      custom_answers, privacy_accepted, marketing_consent,
      manage_token_hash, manage_token_expires_at, manage_token_revoked_at,
      first_name_enc, last_name_enc, email_enc, phone_enc,
      dietary_requirements_enc, accessibility_requirements_enc,
      email_lookup_hash
    ) VALUES (
      v_site.id, v_site.event_id, v_reg_status,
      v_first_name, v_last_name, v_email,
      v_phone, v_company, v_job_title,
      v_dietary, v_accessibility,
      v_clean_answers, true, coalesce(p_marketing_consent, false),
      v_token_hash, v_token_expires, NULL,
      CASE WHEN v_first_name    = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_first_name,    v_pii_key) END,
      CASE WHEN v_last_name     = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_last_name,     v_pii_key) END,
      CASE WHEN v_email         = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_email,         v_pii_key) END,
      CASE WHEN v_phone         = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_phone,         v_pii_key) END,
      CASE WHEN v_dietary       = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_dietary,       v_pii_key) END,
      CASE WHEN v_accessibility = '' THEN NULL ELSE extensions.pgp_sym_encrypt(v_accessibility, v_pii_key) END,
      v_email_hash
    )
    RETURNING id, qr_token INTO v_reg_id, v_qr;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('error', 'REGISTRATION_NOT_COMPLETED');
  END;

  v_issued_at := extract(epoch FROM now())::bigint;

  BEGIN
    SELECT value INTO v_hmac_key
    FROM internal_secrets
    WHERE name = 'registration_email_hmac_key';

    IF v_hmac_key IS NOT NULL THEN
      v_email_signature := encode(
        extensions.hmac(
          v_reg_id::text || ':' || v_qr::text || ':' || v_issued_at::text,
          v_hmac_key,
          'sha256'
        ),
        'hex'
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'registration_id', v_reg_id,
    'registration_status', v_reg_status,
    'qr_token', v_qr,
    'confirmation_message', v_site.confirmation_message,
    'manage_token', v_raw_token_hex,
    'manage_token_expires_at', v_token_expires,
    'email_signature', v_email_signature,
    'email_issued_at', v_issued_at
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.update_registration_by_manage_token(
  p_manage_token text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token_bytes     bytea;
  v_hash            bytea;
  v_reg             record;
  v_key             text;
  v_val             jsonb;
  v_text_val        text;
  v_changed_fields  text[] := '{}';
  v_allowed_keys    text[] := ARRAY[
    'phone', 'company', 'job_title',
    'dietary_requirements', 'accessibility_requirements',
    'marketing_consent', 'custom_answers'
  ];
  v_max_text_len    int := 500;
  v_valid_keys      text[];
  v_answer_key      text;
  v_answer_val      jsonb;
  v_field           record;
  v_clean_answers   jsonb;
  v_old_answers     jsonb;
  v_new_phone       text;
  v_new_company     text;
  v_new_job_title   text;
  v_new_dietary     text;
  v_new_accessibility text;
  v_new_marketing   boolean;
  v_new_custom      jsonb;
  v_has_change      boolean := false;
  v_unsafe_pattern  text := '(<\s*script|<\s*iframe|javascript\s*:|on\w+\s*=)';
  v_pii_key         text;
BEGIN
  IF p_manage_token IS NULL
     OR length(p_manage_token) <> 64
     OR p_manage_token !~ '^[0-9a-fA-F]{64}$'
  THEN
    RETURN jsonb_build_object('error', 'INVALID_TOKEN');
  END IF;

  v_token_bytes := decode(p_manage_token, 'hex');
  v_hash := extensions.digest(v_token_bytes, 'sha256');

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN jsonb_build_object('error', 'INVALID_PATCH');
  END IF;

  IF (SELECT count(*) FROM jsonb_object_keys(p_patch) k) = 0 THEN
    RETURN jsonb_build_object('error', 'NOTHING_TO_UPDATE');
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY(v_allowed_keys)) THEN
      RETURN jsonb_build_object('error', 'UNKNOWN_FIELD');
    END IF;
  END LOOP;

  SELECT r.id, r.site_id, r.phone, r.company, r.job_title,
         r.dietary_requirements, r.accessibility_requirements,
         r.marketing_consent, r.custom_answers
  INTO v_reg
  FROM event_registrations r
  WHERE r.manage_token_hash = v_hash
    AND r.manage_token_revoked_at IS NULL
    AND (r.manage_token_expires_at IS NULL OR r.manage_token_expires_at > now())
  FOR UPDATE;

  IF v_reg IS NULL THEN
    RETURN jsonb_build_object('error', 'INVALID_TOKEN');
  END IF;

  v_new_phone         := v_reg.phone;
  v_new_company       := v_reg.company;
  v_new_job_title     := v_reg.job_title;
  v_new_dietary       := v_reg.dietary_requirements;
  v_new_accessibility := v_reg.accessibility_requirements;
  v_new_marketing     := v_reg.marketing_consent;
  v_new_custom        := v_reg.custom_answers;

  IF p_patch ? 'phone' THEN
    v_val := p_patch -> 'phone';
    IF jsonb_typeof(v_val) <> 'string' THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    v_text_val := trim(v_val #>> '{}');
    IF length(v_text_val) > v_max_text_len THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    IF v_text_val ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    IF v_text_val IS DISTINCT FROM v_reg.phone THEN
      v_new_phone := v_text_val;
      v_changed_fields := array_append(v_changed_fields, 'phone');
      v_has_change := true;
    END IF;
  END IF;

  IF p_patch ? 'company' THEN
    v_val := p_patch -> 'company';
    IF jsonb_typeof(v_val) <> 'string' THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    v_text_val := trim(v_val #>> '{}');
    IF length(v_text_val) > v_max_text_len THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    IF v_text_val ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    IF v_text_val IS DISTINCT FROM v_reg.company THEN
      v_new_company := v_text_val;
      v_changed_fields := array_append(v_changed_fields, 'company');
      v_has_change := true;
    END IF;
  END IF;

  IF p_patch ? 'job_title' THEN
    v_val := p_patch -> 'job_title';
    IF jsonb_typeof(v_val) <> 'string' THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    v_text_val := trim(v_val #>> '{}');
    IF length(v_text_val) > v_max_text_len THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    IF v_text_val ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    IF v_text_val IS DISTINCT FROM v_reg.job_title THEN
      v_new_job_title := v_text_val;
      v_changed_fields := array_append(v_changed_fields, 'job_title');
      v_has_change := true;
    END IF;
  END IF;

  IF p_patch ? 'dietary_requirements' THEN
    v_val := p_patch -> 'dietary_requirements';
    IF jsonb_typeof(v_val) <> 'string' THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    v_text_val := trim(v_val #>> '{}');
    IF length(v_text_val) > 1000 THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    IF v_text_val ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    IF v_text_val IS DISTINCT FROM v_reg.dietary_requirements THEN
      v_new_dietary := v_text_val;
      v_changed_fields := array_append(v_changed_fields, 'dietary_requirements');
      v_has_change := true;
    END IF;
  END IF;

  IF p_patch ? 'accessibility_requirements' THEN
    v_val := p_patch -> 'accessibility_requirements';
    IF jsonb_typeof(v_val) <> 'string' THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    v_text_val := trim(v_val #>> '{}');
    IF length(v_text_val) > 1000 THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    IF v_text_val ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    IF v_text_val IS DISTINCT FROM v_reg.accessibility_requirements THEN
      v_new_accessibility := v_text_val;
      v_changed_fields := array_append(v_changed_fields, 'accessibility_requirements');
      v_has_change := true;
    END IF;
  END IF;

  IF p_patch ? 'marketing_consent' THEN
    v_val := p_patch -> 'marketing_consent';
    IF jsonb_typeof(v_val) <> 'boolean' THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
    IF (v_val = 'true'::jsonb) IS DISTINCT FROM v_reg.marketing_consent THEN
      v_new_marketing := (v_val = 'true'::jsonb);
      v_changed_fields := array_append(v_changed_fields, 'marketing_consent');
      v_has_change := true;
    END IF;
  END IF;

  IF p_patch ? 'custom_answers' THEN
    v_val := p_patch -> 'custom_answers';
    IF jsonb_typeof(v_val) <> 'object' THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;

    SELECT coalesce(array_agg(f.field_key), ARRAY[]::text[])
    INTO v_valid_keys
    FROM registration_form_fields f
    WHERE f.site_id = v_reg.site_id AND f.is_active = true;

    FOR v_answer_key IN SELECT jsonb_object_keys(v_val) LOOP
      IF NOT (v_answer_key = ANY(v_valid_keys)) THEN
        RETURN jsonb_build_object('error', 'UNKNOWN_FIELD');
      END IF;
    END LOOP;

    v_old_answers := coalesce(v_reg.custom_answers, '{}'::jsonb);
    v_clean_answers := v_old_answers;

    FOR v_answer_key IN SELECT jsonb_object_keys(v_val) LOOP
      v_answer_val := v_val -> v_answer_key;

      IF jsonb_typeof(v_answer_val) = 'object' OR jsonb_typeof(v_answer_val) = 'array' THEN
        PERFORM 1 FROM registration_form_fields f
          WHERE f.site_id = v_reg.site_id
            AND f.field_key = v_answer_key
            AND f.is_active = true
            AND f.field_type IN ('checkbox_group', 'multi_select');

        IF NOT FOUND THEN
          RETURN jsonb_build_object('error', 'INVALID_VALUE');
        END IF;

        IF jsonb_typeof(v_answer_val) = 'array' THEN
          IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_answer_val) elem
            WHERE jsonb_typeof(elem) NOT IN ('string', 'number', 'boolean')
          ) THEN
            RETURN jsonb_build_object('error', 'INVALID_VALUE');
          END IF;
        END IF;
      END IF;

      IF jsonb_typeof(v_answer_val) = 'string' THEN
        v_text_val := trim(v_answer_val #>> '{}');
        IF length(v_text_val) > 2000 THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
        IF v_text_val ~* v_unsafe_pattern THEN RETURN jsonb_build_object('error', 'INVALID_VALUE'); END IF;
        v_answer_val := to_jsonb(v_text_val);
      END IF;

      v_clean_answers := v_clean_answers || jsonb_build_object(v_answer_key, v_answer_val);
    END LOOP;

    FOR v_field IN
      SELECT f.field_key, f.field_type
      FROM registration_form_fields f
      WHERE f.site_id = v_reg.site_id AND f.is_active = true AND f.required = true
    LOOP
      v_answer_val := v_clean_answers -> v_field.field_key;

      IF v_field.field_type = 'checkbox' THEN
        IF v_answer_val IS NULL OR v_answer_val <> 'true'::jsonb THEN
          RETURN jsonb_build_object('error', 'INVALID_VALUE');
        END IF;
      ELSE
        IF v_answer_val IS NULL
           OR jsonb_typeof(v_answer_val) = 'null'
           OR (jsonb_typeof(v_answer_val) = 'string' AND trim(v_answer_val #>> '{}') = '')
        THEN
          RETURN jsonb_build_object('error', 'INVALID_VALUE');
        END IF;
      END IF;
    END LOOP;

    IF v_clean_answers IS DISTINCT FROM v_old_answers THEN
      v_new_custom := v_clean_answers;
      v_changed_fields := array_append(v_changed_fields, 'custom_answers');
      v_has_change := true;
    END IF;
  END IF;

  IF NOT v_has_change THEN
    RETURN jsonb_build_object('error', 'NOTHING_TO_UPDATE');
  END IF;

  v_pii_key := public.pii_key();

  UPDATE event_registrations
     SET phone                          = v_new_phone,
         company                        = v_new_company,
         job_title                      = v_new_job_title,
         dietary_requirements           = v_new_dietary,
         accessibility_requirements     = v_new_accessibility,
         marketing_consent              = v_new_marketing,
         custom_answers                 = v_new_custom,
         phone_enc                      = CASE
                                            WHEN v_new_phone IS NULL OR v_new_phone = '' THEN NULL
                                            ELSE extensions.pgp_sym_encrypt(v_new_phone, v_pii_key)
                                          END,
         dietary_requirements_enc       = CASE
                                            WHEN v_new_dietary IS NULL OR v_new_dietary = '' THEN NULL
                                            ELSE extensions.pgp_sym_encrypt(v_new_dietary, v_pii_key)
                                          END,
         accessibility_requirements_enc = CASE
                                            WHEN v_new_accessibility IS NULL OR v_new_accessibility = '' THEN NULL
                                            ELSE extensions.pgp_sym_encrypt(v_new_accessibility, v_pii_key)
                                          END,
         updated_at                     = now()
   WHERE id = v_reg.id;

  INSERT INTO registration_edit_log (registration_id, changed_fields, source)
  VALUES (v_reg.id, v_changed_fields, 'participant');

  RETURN jsonb_build_object('ok', true);
END;
$function$;
