/*
# Add HMAC signature to registration email flow

## Summary
Adds an HMAC-SHA256 signature to the submit_event_registration response so the
registration-email-worker edge function can verify that email-send requests
originate from a legitimate registration submission.

## 1. New Tables
- `internal_secrets` — key-value table for server-side secrets used by
  SECURITY DEFINER functions. Not accessible via the Data API (RLS enabled,
  no policies, privileges revoked from anon/authenticated).
  - `name` (text, PRIMARY KEY) — secret identifier
  - `value` (text, NOT NULL) — the secret value
  - `description` (text) — human-readable description
  - `created_at` (timestamptz) — creation timestamp

## 2. Modified Functions
- `submit_event_registration` — CREATE OR REPLACE, same signature.
  - After the INSERT, reads the HMAC key from internal_secrets, computes
    `HMAC-SHA256(registration_id || ':' || qr_token || ':' || issued_at_unix, key)`,
    and returns two new fields:
      - `email_signature` (hex-encoded HMAC)
      - `email_issued_at` (integer, Unix epoch seconds)
  - If secret is missing, fields are NULL — the edge function will reject
    the call, but registration itself still succeeds.
  - All existing fields and logic are unchanged.

## Important Notes
1. The shared secret must also be set as `REGISTRATION_EMAIL_HMAC_KEY` in
   edge function secrets with the EXACT same value.
2. The frontend never sees the raw secret — only the opaque signature.
3. 24-hour validity window, enforced by the edge function.
4. Idempotent: table uses IF NOT EXISTS, secret insert uses ON CONFLICT,
   function uses CREATE OR REPLACE.
*/

-- ─── 1. Internal secrets table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS internal_secrets (
  name        text        PRIMARY KEY,
  value       text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE internal_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON internal_secrets FROM PUBLIC;
REVOKE ALL ON internal_secrets FROM anon;
REVOKE ALL ON internal_secrets FROM authenticated;

-- ─── 2. Provision HMAC secret ────────────────────────────────────────────

INSERT INTO internal_secrets (name, value, description)
VALUES (
  'registration_email_hmac_key',
  encode(extensions.gen_random_bytes(32), 'hex'),
  'HMAC-SHA256 key shared between submit_event_registration RPC and registration-email-worker edge function'
)
ON CONFLICT (name) DO NOTHING;

-- ─── 3. Replace submit_event_registration with HMAC signature ────────────

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
  -- Rate-limit variables
  v_rl_window timestamptz;
  v_rl_count  int;
  -- HMAC signature variables
  v_hmac_key text;
  v_issued_at bigint;
  v_email_signature text;
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

  -- ── Per-site rate limiting (30 submissions / minute) ───────────────────
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

  -- ── Length limits ──
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

  -- ── XSS pattern filter ──
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

  -- Build clean answers
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
    RETURN jsonb_build_object('error', 'REGISTRATION_NOT_COMPLETED');
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
      RETURN jsonb_build_object('error', 'REGISTRATION_NOT_COMPLETED');
  END;

  -- ── Compute HMAC signature for email-worker authentication ─────
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
$$;

REVOKE EXECUTE ON FUNCTION submit_event_registration(text,text,text,text,text,text,text,text,text,jsonb,boolean,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_event_registration(text,text,text,text,text,text,text,text,text,jsonb,boolean,boolean,text) TO anon, authenticated;
