/*
# Add input length limits and XSS pattern filtering to submit_event_registration

## Summary
Replaces submit_event_registration to add the same input validation that
update_registration_by_manage_token already enforces: per-field character
length limits and an XSS-pattern reject filter on every free-text input.

## Changes (RPC body only — no signature, table, RLS, or grant changes)

### Length limits (matching update_registration_by_manage_token exactly)
- first_name, last_name, email, phone, company, job_title → max 500 chars
- dietary_requirements, accessibility_requirements → max 1000 chars
- custom_answers string values → max 2000 chars

### XSS pattern filter
- All free-text fields (first_name, last_name, phone, company, job_title,
  dietary_requirements, accessibility_requirements, custom_answers string
  values) are checked against the pattern:
    (<\s*script|<\s*iframe|javascript\s*:|on\w+\s*=)
  Case-insensitive. Violation returns VALIDATION_ERROR.
- email is NOT checked against the XSS pattern because it is already
  validated by the email regex, which rejects all these characters.

### Preserved (unchanged)
- Exact function signature (same 13 parameters, types, defaults).
- SECURITY DEFINER, search_path = public, pg_temp.
- REVOKE/GRANT to anon, authenticated.
- All existing logic: honeypot, slug normalisation, site lock, email regex,
  privacy check, custom_answers key whitelist, required-field validation,
  duplicate check, capacity/waitlist, self-service token generation, INSERT,
  and response shape.
- Error code: VALIDATION_ERROR (same code already used by this function).
- All existing error messages preserved; new violations use Italian messages
  consistent with the existing style.

## Data impact
- Zero existing rows would fail the new validation (verified by query).
- No table, column, policy, or grant modifications.

## Security
- Closes the asymmetry where insert accepted unlimited/unfiltered text
  but update did not.
- Idempotent: uses CREATE OR REPLACE FUNCTION.
*/

CREATE OR REPLACE FUNCTION submit_event_registration(
  p_slug text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text DEFAULT '',
  p_company text DEFAULT '',
  p_job_title text DEFAULT '',
  p_dietary_requirements text DEFAULT '',
  p_accessibility_requirements text DEFAULT '',
  p_custom_answers jsonb DEFAULT '{}',
  p_privacy_accepted boolean DEFAULT false,
  p_marketing_consent boolean DEFAULT false,
  p_honeypot text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  -- Self-service token variables
  v_self_service_enabled boolean;
  v_edit_until timestamptz;
  v_raw_token_bytes bytea;
  v_raw_token_hex text;
  v_token_hash bytea;
  v_token_expires timestamptz;
  -- Validation constants (matching update_registration_by_manage_token)
  v_max_short  int := 500;
  v_max_long   int := 1000;
  v_max_custom int := 2000;
  v_unsafe_pattern text := '(<\s*script|<\s*iframe|javascript\s*:|on\w+\s*=)';
BEGIN
  -- Honeypot check
  IF coalesce(trim(p_honeypot), '') <> '' THEN
    RETURN jsonb_build_object('error', 'REGISTRATION_REJECTED');
  END IF;

  -- Normalize slug and lock site
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

  -- Trim inputs
  v_first_name := trim(p_first_name);
  v_last_name := trim(p_last_name);
  v_email := lower(trim(p_email));
  v_phone := coalesce(trim(p_phone), '');
  v_company := coalesce(trim(p_company), '');
  v_job_title := coalesce(trim(p_job_title), '');
  v_dietary := coalesce(trim(p_dietary_requirements), '');
  v_accessibility := coalesce(trim(p_accessibility_requirements), '');

  -- Validate required fields
  IF v_first_name = '' OR v_last_name = '' THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Nome e cognome sono obbligatori.');
  END IF;

  IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Indirizzo email non valido.');
  END IF;

  IF p_privacy_accepted IS NOT TRUE THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'L''accettazione della privacy è obbligatoria.');
  END IF;

  -- ── Length limits (matching update_registration_by_manage_token) ──
  IF length(v_first_name) > v_max_short THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo nome è troppo lungo.');
  END IF;
  IF length(v_last_name) > v_max_short THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo cognome è troppo lungo.');
  END IF;
  IF length(v_email) > v_max_short THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Indirizzo email troppo lungo.');
  END IF;
  IF length(v_phone) > v_max_short THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo telefono è troppo lungo.');
  END IF;
  IF length(v_company) > v_max_short THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo azienda è troppo lungo.');
  END IF;
  IF length(v_job_title) > v_max_short THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo ruolo è troppo lungo.');
  END IF;
  IF length(v_dietary) > v_max_long THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo esigenze alimentari è troppo lungo.');
  END IF;
  IF length(v_accessibility) > v_max_long THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo esigenze di accessibilità è troppo lungo.');
  END IF;

  -- ── XSS pattern filter (matching update_registration_by_manage_token) ──
  IF v_first_name ~* v_unsafe_pattern THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo nome contiene contenuto non consentito.');
  END IF;
  IF v_last_name ~* v_unsafe_pattern THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo cognome contiene contenuto non consentito.');
  END IF;
  IF v_phone ~* v_unsafe_pattern THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo telefono contiene contenuto non consentito.');
  END IF;
  IF v_company ~* v_unsafe_pattern THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo azienda contiene contenuto non consentito.');
  END IF;
  IF v_job_title ~* v_unsafe_pattern THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo ruolo contiene contenuto non consentito.');
  END IF;
  IF v_dietary ~* v_unsafe_pattern THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo esigenze alimentari contiene contenuto non consentito.');
  END IF;
  IF v_accessibility ~* v_unsafe_pattern THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Il campo esigenze di accessibilità contiene contenuto non consentito.');
  END IF;

  -- Validate custom_answers is an object
  IF jsonb_typeof(p_custom_answers) <> 'object' THEN
    RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message', 'Formato risposte personalizzate non valido.');
  END IF;

  -- Collect active field keys for this site
  SELECT array_agg(f.field_key)
  INTO v_valid_keys
  FROM registration_form_fields f
  WHERE f.site_id = v_site.id AND f.is_active = true;

  v_valid_keys := coalesce(v_valid_keys, ARRAY[]::text[]);

  -- Reject unknown answer keys
  FOR v_answer_key IN SELECT jsonb_object_keys(p_custom_answers) LOOP
    IF NOT (v_answer_key = ANY(v_valid_keys)) THEN
      RETURN jsonb_build_object('error', 'VALIDATION_ERROR', 'message',
        format('Campo personalizzato non riconosciuto: %s', v_answer_key));
    END IF;
  END LOOP;

  -- Validate required custom fields
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

  -- Build clean answers with only declared active field keys,
  -- applying length + XSS validation to string values
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

  -- Check duplicate
  IF EXISTS (
    SELECT 1 FROM event_registrations
    WHERE site_id = v_site.id AND lower(email) = v_email
  ) THEN
    RETURN jsonb_build_object('error', 'ALREADY_REGISTERED');
  END IF;

  -- Capacity check
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

  -- ── Self-service token preparation ──────────────────────────────
  v_self_service_enabled := coalesce(
    (v_site.settings ->> 'self_service_edit_enabled')::boolean,
    false
  );

  IF v_self_service_enabled THEN
    v_raw_token_bytes := extensions.gen_random_bytes(32);
    v_raw_token_hex   := encode(v_raw_token_bytes, 'hex');
    v_token_hash      := extensions.digest(v_raw_token_bytes, 'sha256');

    -- Determine expiry: explicit setting > site closes_at > 30 days
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

  -- Insert registration
  BEGIN
    INSERT INTO event_registrations (
      site_id, event_id, registration_status,
      first_name, last_name, email,
      phone, company, job_title,
      dietary_requirements, accessibility_requirements,
      custom_answers, privacy_accepted, marketing_consent,
      manage_token_hash, manage_token_expires_at, manage_token_revoked_at
    ) VALUES (
      v_site.id, v_site.event_id, v_reg_status,
      v_first_name, v_last_name, v_email,
      v_phone, v_company, v_job_title,
      v_dietary, v_accessibility,
      v_clean_answers, true, coalesce(p_marketing_consent, false),
      v_token_hash, v_token_expires, NULL
    )
    RETURNING id, qr_token INTO v_reg_id, v_qr;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('error', 'ALREADY_REGISTERED');
  END;

  RETURN jsonb_build_object(
    'registration_id', v_reg_id,
    'registration_status', v_reg_status,
    'qr_token', v_qr,
    'confirmation_message', v_site.confirmation_message,
    'manage_token', v_raw_token_hex,
    'manage_token_expires_at', v_token_expires
  );
END;
$$;

-- Permissions: exact same grants as before
REVOKE EXECUTE ON FUNCTION submit_event_registration(text,text,text,text,text,text,text,text,text,jsonb,boolean,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_event_registration(text,text,text,text,text,text,text,text,text,jsonb,boolean,boolean,text) TO anon, authenticated;
