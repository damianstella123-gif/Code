/*
# Create Public Event Registration RPCs

## Purpose
Two SECURITY DEFINER functions that allow anonymous/authenticated visitors
to view published registration sites and submit registrations without
direct table access.

## New Functions

### 1. get_public_registration_site(p_slug text) → jsonb
- Returns site metadata + active form fields for a published, currently-open site.
- Returns NULL if site is draft, closed, or outside its open window.
- Does not leak existence of non-public sites.
- Exposes no internal metadata (created_by, registrations, counts).

### 2. submit_event_registration(...) → jsonb
- Validates honeypot, site availability, required fields, email format,
  privacy acceptance, custom field rules, capacity, and duplicate email.
- Locks site row FOR UPDATE for concurrency safety.
- Determines confirmed vs waitlist vs full based on current confirmed count.
- Returns registration_id, registration_status, qr_token, confirmation_message.
- Converts unique-violation race to ALREADY_REGISTERED.

## Security
- Both functions: SECURITY DEFINER, search_path = public, pg_temp.
- EXECUTE revoked from PUBLIC.
- EXECUTE granted to anon and authenticated only.
- No direct table access granted.
- No existing RLS policies or table definitions changed.

## Important Notes
1. Honeypot field rejects bots silently with a generic error code.
2. Email validation uses a basic regex (local@domain.tld pattern).
3. Custom answers are validated against active form fields only.
4. Capacity check uses SELECT ... FOR UPDATE on the site row to serialize.
5. The unique index idx_er_site_email catches race conditions on duplicate email.
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC 1: get_public_registration_site
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_public_registration_site(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text;
  v_site record;
  v_fields jsonb;
BEGIN
  v_slug := lower(trim(p_slug));
  IF v_slug IS NULL OR v_slug = '' THEN
    RETURN NULL;
  END IF;

  SELECT id, event_id, slug, title, subtitle, description,
         logo_url, hero_image_url, theme, content, settings,
         privacy_url, privacy_text, confirmation_message,
         capacity, waitlist_enabled, opens_at, closes_at
  INTO v_site
  FROM registration_sites
  WHERE slug = v_slug
    AND status = 'published'
    AND (opens_at IS NULL OR opens_at <= now())
    AND (closes_at IS NULL OR closes_at > now());

  IF v_site IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'field_key', f.field_key,
      'label', f.label,
      'field_type', f.field_type,
      'required', f.required,
      'options', f.options,
      'placeholder', f.placeholder,
      'help_text', f.help_text,
      'sort_order', f.sort_order
    ) ORDER BY f.sort_order, f.id
  ), '[]'::jsonb)
  INTO v_fields
  FROM registration_form_fields f
  WHERE f.site_id = v_site.id
    AND f.is_active = true;

  RETURN jsonb_build_object(
    'id', v_site.id,
    'event_id', v_site.event_id,
    'slug', v_site.slug,
    'title', v_site.title,
    'subtitle', v_site.subtitle,
    'description', v_site.description,
    'logo_url', v_site.logo_url,
    'hero_image_url', v_site.hero_image_url,
    'theme', v_site.theme,
    'content', v_site.content,
    'settings', v_site.settings,
    'privacy_url', v_site.privacy_url,
    'privacy_text', v_site.privacy_text,
    'confirmation_message', v_site.confirmation_message,
    'capacity', v_site.capacity,
    'waitlist_enabled', v_site.waitlist_enabled,
    'opens_at', v_site.opens_at,
    'closes_at', v_site.closes_at,
    'fields', v_fields
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC 2: submit_event_registration
-- ══════════════════════════════════════════════════════════════════════════════

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
BEGIN
  -- Honeypot check
  IF coalesce(trim(p_honeypot), '') <> '' THEN
    RETURN jsonb_build_object('error', 'REGISTRATION_REJECTED');
  END IF;

  -- Normalize slug and lock site
  v_slug := lower(trim(p_slug));

  SELECT id, event_id, slug, confirmation_message, capacity, waitlist_enabled
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

  -- Validate required fields
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

  -- Insert registration
  BEGIN
    INSERT INTO event_registrations (
      site_id, event_id, registration_status,
      first_name, last_name, email,
      phone, company, job_title,
      dietary_requirements, accessibility_requirements,
      custom_answers, privacy_accepted, marketing_consent
    ) VALUES (
      v_site.id, v_site.event_id, v_reg_status,
      v_first_name, v_last_name, v_email,
      v_phone, v_company, v_job_title,
      v_dietary, v_accessibility,
      v_clean_answers, true, coalesce(p_marketing_consent, false)
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
    'confirmation_message', v_site.confirmation_message
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- PERMISSIONS
-- ══════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION get_public_registration_site(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_registration_site(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION submit_event_registration(text,text,text,text,text,text,text,text,text,jsonb,boolean,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_event_registration(text,text,text,text,text,text,text,text,text,jsonb,boolean,boolean,text) TO anon, authenticated;
