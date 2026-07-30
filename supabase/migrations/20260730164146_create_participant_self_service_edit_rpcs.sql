/*
# Create participant self-service registration editing RPCs

1. New Functions
   - `get_registration_by_manage_token(p_manage_token text)` → jsonb
     Looks up a registration by its self-service manage token.
     Returns registration editable fields, site branding, event title,
     configured form fields, and token expiry.
     Returns NULL for any invalid/expired/revoked/unknown token.

   - `update_registration_by_manage_token(p_manage_token text, p_patch jsonb)` → jsonb
     Updates editable registration fields using the manage token.
     Validates every patch key and value, rejects unknowns, enforces
     length limits, validates custom_answers against configured form
     fields, strips HTML/scripts.
     Logs changed field names to registration_edit_log (no PII).
     Returns safe success/error codes only.

2. Security
   - Both functions are SECURITY DEFINER with search_path = public, pg_temp.
   - EXECUTE revoked from PUBLIC, granted to anon and authenticated only.
   - Token validated as exactly 64 hex chars, hashed with
     extensions.digest(decode(token,'hex'),'sha256') matching the
     submit_event_registration pattern.
   - Malformed, unknown, expired and revoked tokens are indistinguishable
     (all return NULL / INVALID_TOKEN uniformly).
   - No direct table policies for anon — access is token-gated via RPCs.
   - No service-role dependency.
   - No PII in error messages or audit log.

3. Audit
   - registration_edit_log receives one row per successful update.
   - source = 'participant' (matching existing column default).
   - changed_fields contains only field names, never values.
   - No row inserted when nothing changed.

4. Error codes (no personal data)
   - INVALID_TOKEN — any token failure
   - INVALID_PATCH — p_patch is not a JSON object
   - UNKNOWN_FIELD — patch contains a non-editable key
   - INVALID_VALUE — value fails validation
   - NOTHING_TO_UPDATE — patch is empty or no fields changed

5. Important Notes
   - Idempotent: uses CREATE OR REPLACE FUNCTION.
   - Does not modify existing tables, columns, RLS policies, or RPCs.
   - Does not extend token expiry on read or write.
   - updated_at set to now() on successful update.
   - Editable fields: phone, company, job_title, dietary_requirements,
     accessibility_requirements, marketing_consent, custom_answers.
   - Non-editable: first_name, last_name, email, privacy_accepted,
     status, qr_token, and all internal/audit fields.
*/


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. get_registration_by_manage_token
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_registration_by_manage_token(
  p_manage_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token_bytes bytea;
  v_hash        bytea;
  v_reg         record;
  v_site        record;
  v_event_title text;
  v_fields      jsonb;
BEGIN
  -- ── Token format validation: exactly 64 hex characters ──
  IF p_manage_token IS NULL
     OR length(p_manage_token) <> 64
     OR p_manage_token !~ '^[0-9a-fA-F]{64}$'
  THEN
    RETURN NULL;
  END IF;

  -- ── Hash the token ──
  v_token_bytes := decode(p_manage_token, 'hex');
  v_hash := extensions.digest(v_token_bytes, 'sha256');

  -- ── Look up registration ──
  SELECT r.id, r.site_id, r.event_id, r.registration_status,
         r.phone, r.company, r.job_title,
         r.dietary_requirements, r.accessibility_requirements,
         r.marketing_consent, r.custom_answers,
         r.manage_token_expires_at
  INTO v_reg
  FROM event_registrations r
  WHERE r.manage_token_hash = v_hash
    AND r.manage_token_revoked_at IS NULL
    AND (r.manage_token_expires_at IS NULL OR r.manage_token_expires_at > now())
  LIMIT 1;

  IF v_reg IS NULL THEN
    RETURN NULL;
  END IF;

  -- ── Load site branding ──
  SELECT s.title, s.logo_url, s.theme
  INTO v_site
  FROM registration_sites s
  WHERE s.id = v_reg.site_id;

  -- ── Load event title ──
  SELECT e.title INTO v_event_title
  FROM events e
  WHERE e.id = v_reg.event_id;

  -- ── Load configured form fields (safe public info only) ──
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'field_key', f.field_key,
      'label', f.label,
      'field_type', f.field_type,
      'required', f.required,
      'options', f.options,
      'placeholder', coalesce(f.placeholder, ''),
      'help_text', coalesce(f.help_text, '')
    ) ORDER BY f.sort_order
  ), '[]'::jsonb)
  INTO v_fields
  FROM registration_form_fields f
  WHERE f.site_id = v_reg.site_id
    AND f.is_active = true;

  RETURN jsonb_build_object(
    'registration_id',            v_reg.id,
    'registration_status',        v_reg.registration_status,
    'phone',                      v_reg.phone,
    'company',                    v_reg.company,
    'job_title',                  v_reg.job_title,
    'dietary_requirements',       v_reg.dietary_requirements,
    'accessibility_requirements', v_reg.accessibility_requirements,
    'marketing_consent',          v_reg.marketing_consent,
    'custom_answers',             v_reg.custom_answers,
    'manage_token_expires_at',    v_reg.manage_token_expires_at,
    'site_title',                 coalesce(v_site.title, ''),
    'site_logo_url',              v_site.logo_url,
    'site_theme',                 coalesce(v_site.theme, '{}'::jsonb),
    'event_title',                coalesce(v_event_title, ''),
    'fields',                     v_fields
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. update_registration_by_manage_token
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_registration_by_manage_token(
  p_manage_token text,
  p_patch        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  -- custom_answers validation
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
  -- Unsafe content pattern: <script, <iframe, javascript:, on-event handlers
  v_unsafe_pattern  text := '(<\s*script|<\s*iframe|javascript\s*:|on\w+\s*=)';
BEGIN
  -- ══ Token validation ══
  IF p_manage_token IS NULL
     OR length(p_manage_token) <> 64
     OR p_manage_token !~ '^[0-9a-fA-F]{64}$'
  THEN
    RETURN jsonb_build_object('error', 'INVALID_TOKEN');
  END IF;

  v_token_bytes := decode(p_manage_token, 'hex');
  v_hash := extensions.digest(v_token_bytes, 'sha256');

  -- ══ Patch validation ══
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN jsonb_build_object('error', 'INVALID_PATCH');
  END IF;

  -- Check for empty patch
  IF (SELECT count(*) FROM jsonb_object_keys(p_patch) k) = 0 THEN
    RETURN jsonb_build_object('error', 'NOTHING_TO_UPDATE');
  END IF;

  -- Reject unknown keys
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY(v_allowed_keys)) THEN
      RETURN jsonb_build_object('error', 'UNKNOWN_FIELD');
    END IF;
  END LOOP;

  -- ══ Lock registration row ══
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

  -- ══ Initialize new values from current row ══
  v_new_phone         := v_reg.phone;
  v_new_company       := v_reg.company;
  v_new_job_title     := v_reg.job_title;
  v_new_dietary       := v_reg.dietary_requirements;
  v_new_accessibility := v_reg.accessibility_requirements;
  v_new_marketing     := v_reg.marketing_consent;
  v_new_custom        := v_reg.custom_answers;

  -- ══ Validate and apply each scalar field ══

  -- phone
  IF p_patch ? 'phone' THEN
    v_val := p_patch -> 'phone';
    IF jsonb_typeof(v_val) <> 'string' THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    v_text_val := trim(v_val #>> '{}');
    IF length(v_text_val) > v_max_text_len THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    IF v_text_val ~* v_unsafe_pattern THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    IF v_text_val IS DISTINCT FROM v_reg.phone THEN
      v_new_phone := v_text_val;
      v_changed_fields := array_append(v_changed_fields, 'phone');
      v_has_change := true;
    END IF;
  END IF;

  -- company
  IF p_patch ? 'company' THEN
    v_val := p_patch -> 'company';
    IF jsonb_typeof(v_val) <> 'string' THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    v_text_val := trim(v_val #>> '{}');
    IF length(v_text_val) > v_max_text_len THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    IF v_text_val ~* v_unsafe_pattern THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    IF v_text_val IS DISTINCT FROM v_reg.company THEN
      v_new_company := v_text_val;
      v_changed_fields := array_append(v_changed_fields, 'company');
      v_has_change := true;
    END IF;
  END IF;

  -- job_title
  IF p_patch ? 'job_title' THEN
    v_val := p_patch -> 'job_title';
    IF jsonb_typeof(v_val) <> 'string' THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    v_text_val := trim(v_val #>> '{}');
    IF length(v_text_val) > v_max_text_len THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    IF v_text_val ~* v_unsafe_pattern THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    IF v_text_val IS DISTINCT FROM v_reg.job_title THEN
      v_new_job_title := v_text_val;
      v_changed_fields := array_append(v_changed_fields, 'job_title');
      v_has_change := true;
    END IF;
  END IF;

  -- dietary_requirements
  IF p_patch ? 'dietary_requirements' THEN
    v_val := p_patch -> 'dietary_requirements';
    IF jsonb_typeof(v_val) <> 'string' THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    v_text_val := trim(v_val #>> '{}');
    IF length(v_text_val) > 1000 THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    IF v_text_val ~* v_unsafe_pattern THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    IF v_text_val IS DISTINCT FROM v_reg.dietary_requirements THEN
      v_new_dietary := v_text_val;
      v_changed_fields := array_append(v_changed_fields, 'dietary_requirements');
      v_has_change := true;
    END IF;
  END IF;

  -- accessibility_requirements
  IF p_patch ? 'accessibility_requirements' THEN
    v_val := p_patch -> 'accessibility_requirements';
    IF jsonb_typeof(v_val) <> 'string' THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    v_text_val := trim(v_val #>> '{}');
    IF length(v_text_val) > 1000 THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    IF v_text_val ~* v_unsafe_pattern THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    IF v_text_val IS DISTINCT FROM v_reg.accessibility_requirements THEN
      v_new_accessibility := v_text_val;
      v_changed_fields := array_append(v_changed_fields, 'accessibility_requirements');
      v_has_change := true;
    END IF;
  END IF;

  -- marketing_consent
  IF p_patch ? 'marketing_consent' THEN
    v_val := p_patch -> 'marketing_consent';
    IF jsonb_typeof(v_val) <> 'boolean' THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;
    IF (v_val = 'true'::jsonb) IS DISTINCT FROM v_reg.marketing_consent THEN
      v_new_marketing := (v_val = 'true'::jsonb);
      v_changed_fields := array_append(v_changed_fields, 'marketing_consent');
      v_has_change := true;
    END IF;
  END IF;

  -- ══ custom_answers ══
  IF p_patch ? 'custom_answers' THEN
    v_val := p_patch -> 'custom_answers';
    IF jsonb_typeof(v_val) <> 'object' THEN
      RETURN jsonb_build_object('error', 'INVALID_VALUE');
    END IF;

    -- Load valid field keys for this site
    SELECT coalesce(array_agg(f.field_key), ARRAY[]::text[])
    INTO v_valid_keys
    FROM registration_form_fields f
    WHERE f.site_id = v_reg.site_id AND f.is_active = true;

    -- Reject unknown answer keys
    FOR v_answer_key IN SELECT jsonb_object_keys(v_val) LOOP
      IF NOT (v_answer_key = ANY(v_valid_keys)) THEN
        RETURN jsonb_build_object('error', 'UNKNOWN_FIELD');
      END IF;
    END LOOP;

    -- Start from current answers and merge patch
    v_old_answers := coalesce(v_reg.custom_answers, '{}'::jsonb);
    v_clean_answers := v_old_answers;

    FOR v_answer_key IN SELECT jsonb_object_keys(v_val) LOOP
      v_answer_val := v_val -> v_answer_key;

      -- Reject nested objects/arrays unless field_type is 'checkbox_group' or 'multi_select'
      IF jsonb_typeof(v_answer_val) = 'object' OR jsonb_typeof(v_answer_val) = 'array' THEN
        -- Check if field definition allows arrays
        PERFORM 1 FROM registration_form_fields f
        WHERE f.site_id = v_reg.site_id
          AND f.field_key = v_answer_key
          AND f.is_active = true
          AND f.field_type IN ('checkbox_group', 'multi_select');

        IF NOT FOUND THEN
          RETURN jsonb_build_object('error', 'INVALID_VALUE');
        END IF;

        -- For arrays, validate each element is a scalar string
        IF jsonb_typeof(v_answer_val) = 'array' THEN
          IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_answer_val) elem
            WHERE jsonb_typeof(elem) NOT IN ('string', 'number', 'boolean')
          ) THEN
            RETURN jsonb_build_object('error', 'INVALID_VALUE');
          END IF;
        END IF;
      END IF;

      -- String value validation: length and XSS
      IF jsonb_typeof(v_answer_val) = 'string' THEN
        v_text_val := trim(v_answer_val #>> '{}');
        IF length(v_text_val) > 2000 THEN
          RETURN jsonb_build_object('error', 'INVALID_VALUE');
        END IF;
        IF v_text_val ~* v_unsafe_pattern THEN
          RETURN jsonb_build_object('error', 'INVALID_VALUE');
        END IF;
        v_answer_val := to_jsonb(v_text_val);
      END IF;

      v_clean_answers := v_clean_answers || jsonb_build_object(v_answer_key, v_answer_val);
    END LOOP;

    -- Validate required custom fields against the full merged result
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

  -- ══ Nothing changed? ══
  IF NOT v_has_change THEN
    RETURN jsonb_build_object('error', 'NOTHING_TO_UPDATE');
  END IF;

  -- ══ Apply update ══
  UPDATE event_registrations
  SET phone                      = v_new_phone,
      company                    = v_new_company,
      job_title                  = v_new_job_title,
      dietary_requirements       = v_new_dietary,
      accessibility_requirements = v_new_accessibility,
      marketing_consent          = v_new_marketing,
      custom_answers             = v_new_custom,
      updated_at                 = now()
  WHERE id = v_reg.id;

  -- ══ Audit log (field names only, no values, no PII) ══
  INSERT INTO registration_edit_log (registration_id, changed_fields, source)
  VALUES (v_reg.id, v_changed_fields, 'participant');

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Grants
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.get_registration_by_manage_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_registration_by_manage_token(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.update_registration_by_manage_token(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_registration_by_manage_token(text, jsonb) TO anon, authenticated;
