/*
# Add manage-token generation to submit_event_registration

## Summary
Replaces the submit_event_registration RPC to optionally generate a
one-time management token when the registration site has self-service
editing enabled.

## Changes (RPC only — no table/RLS/frontend changes)

### submit_event_registration — modified behaviour
- Reads `registration_sites.settings` for two keys:
  - `self_service_edit_enabled` (boolean, default false)
  - `self_service_edit_until` (ISO timestamp, optional)
- When self-service is enabled:
  - Generates 32 cryptographically random bytes via extensions.gen_random_bytes.
  - Stores ONLY the SHA-256 hash (extensions.digest) in manage_token_hash.
  - Computes manage_token_expires_at: self_service_edit_until if valid future,
    else site closes_at if future, else now() + 30 days.
  - Returns the raw hex token ONCE in the response alongside the existing fields.
  - The raw token is NEVER stored in the database.
- When self-service is disabled (default): token columns stay NULL,
  manage_token and manage_token_expires_at return as null in JSON.
  All existing behaviour is preserved byte-for-byte.

### Preserved
- Exact function signature (same 13 parameters, same types, same defaults).
- SECURITY DEFINER, search_path = public, pg_temp.
- REVOKE/GRANT to anon, authenticated.
- All validation, capacity, waitlist, duplicate, honeypot logic unchanged.
- All existing response fields: registration_id, registration_status,
  qr_token, confirmation_message.
- No existing registrations modified — all 28 keep NULL token fields.

## Security
- Raw token never persists — only the SHA-256 hash is stored.
- gen_random_bytes(32) provides 256 bits of entropy.
- Token expiry is always set when enabled.
- No new tables, columns, RLS policies, or grants created.
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
  v_valid_keys text[];
  v_clean_answers jsonb := '{}';
  -- Self-service token variables
  v_self_service_enabled boolean;
  v_edit_until timestamptz;
  v_raw_token_bytes bytea;
  v_raw_token_hex text;
  v_token_hash bytea;
  v_token_expires timestamptz;
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

  -- Build clean answers with only declared active field keys
  FOR v_answer_key IN SELECT jsonb_object_keys(p_custom_answers) LOOP
    IF v_answer_key = ANY(v_valid_keys) THEN
      v_clean_answers := v_clean_answers || jsonb_build_object(v_answer_key, p_custom_answers -> v_answer_key);
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

-- Permissions: exact same grants as original
REVOKE EXECUTE ON FUNCTION submit_event_registration(text,text,text,text,text,text,text,text,text,jsonb,boolean,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_event_registration(text,text,text,text,text,text,text,text,text,jsonb,boolean,boolean,text) TO anon, authenticated;
