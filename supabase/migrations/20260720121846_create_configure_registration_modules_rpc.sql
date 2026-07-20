/*
# Create configure_registration_modules RPC

## Description
Idempotent RPC that activates/deactivates preset registration form fields
by module name (transport, accommodation, program) for a given registration site.

## Behavior
- Validates input modules against allowed list.
- For selected modules: inserts missing preset fields (ON CONFLICT sets is_active=true).
- For unselected modules: sets their preset fields to is_active=false.
- Never deletes fields or modifies custom fields.
- Empty p_modules deactivates all preset fields.
- Atomic within a single function call.

## Security
- SECURITY DEFINER with search_path locked.
- Requires authenticated user (auth.uid()).
- Requires has_event_permission(event_id, 'can_manage_registration').
- PUBLIC and anon cannot execute.

## Return
jsonb: { site_id, active_modules, active_preset_fields }

## Notes
1. Does not create or alter any tables.
2. Does not modify RLS policies.
3. Uses existing UNIQUE(site_id, field_key) constraint for ON CONFLICT.
*/

CREATE OR REPLACE FUNCTION public.configure_registration_modules(
  p_site_id uuid,
  p_modules text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid;
  v_site record;
  v_allowed text[] := ARRAY['transport', 'accommodation', 'program'];
  v_module text;
  v_active_count int;
  v_active_modules text[];
BEGIN
  -- Auth check
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Validate input
  IF p_modules IS NULL THEN
    RAISE EXCEPTION 'INVALID_MODULES';
  END IF;

  -- Check for nulls, duplicates, unknowns
  FOREACH v_module IN ARRAY p_modules LOOP
    IF v_module IS NULL THEN
      RAISE EXCEPTION 'INVALID_MODULES';
    END IF;
    IF v_module != ALL(v_allowed) THEN
      RAISE EXCEPTION 'INVALID_MODULES';
    END IF;
  END LOOP;

  IF (SELECT count(DISTINCT m) FROM unnest(p_modules) m) != array_length(p_modules, 1) THEN
    RAISE EXCEPTION 'INVALID_MODULES';
  END IF;

  -- Load and lock site
  SELECT * INTO v_site
  FROM registration_sites
  WHERE id = p_site_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SITE_NOT_FOUND';
  END IF;

  -- Permission check
  IF NOT has_event_permission(v_site.event_id, 'can_manage_registration') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- ═══ TRANSPORT module fields ═══
  IF 'transport' = ANY(p_modules) THEN
    INSERT INTO registration_form_fields (site_id, field_key, label, field_type, required, options, sort_order)
    VALUES
      (p_site_id, 'travel_mode', 'Come raggiungerai l''evento?', 'select', true,
       '["Pullman organizzato","Auto propria","Treno","Aereo","Altro"]'::jsonb, 100),
      (p_site_id, 'departure_city', 'Città di partenza', 'text', false, '[]'::jsonb, 110),
      (p_site_id, 'travel_details', 'Dettagli del viaggio', 'textarea', false, '[]'::jsonb, 120)
    ON CONFLICT (site_id, field_key) DO UPDATE SET is_active = true;

    -- Set help_text only on fresh insert (not overwrite existing)
    UPDATE registration_form_fields
    SET help_text = 'Inserisci eventuali orari, stazioni, aeroporti o altre informazioni utili.'
    WHERE site_id = p_site_id AND field_key = 'travel_details' AND help_text = '';
  ELSE
    UPDATE registration_form_fields
    SET is_active = false
    WHERE site_id = p_site_id AND field_key IN ('travel_mode', 'departure_city', 'travel_details');
  END IF;

  -- ═══ ACCOMMODATION module fields ═══
  IF 'accommodation' = ANY(p_modules) THEN
    INSERT INTO registration_form_fields (site_id, field_key, label, field_type, required, options, sort_order)
    VALUES
      (p_site_id, 'overnight_required', 'Hai bisogno del pernottamento?', 'select', true,
       '["Sì","No"]'::jsonb, 200),
      (p_site_id, 'room_preference', 'Preferenza camera', 'select', false,
       '["Singola","Doppia","Nessuna preferenza"]'::jsonb, 210),
      (p_site_id, 'accommodation_notes', 'Note sul pernottamento', 'textarea', false, '[]'::jsonb, 220)
    ON CONFLICT (site_id, field_key) DO UPDATE SET is_active = true;
  ELSE
    UPDATE registration_form_fields
    SET is_active = false
    WHERE site_id = p_site_id AND field_key IN ('overnight_required', 'room_preference', 'accommodation_notes');
  END IF;

  -- ═══ PROGRAM module fields ═══
  IF 'program' = ANY(p_modules) THEN
    INSERT INTO registration_form_fields (site_id, field_key, label, field_type, required, options, sort_order)
    VALUES
      (p_site_id, 'attendance_days', 'A quali giornate parteciperai?', 'textarea', false, '[]'::jsonb, 300),
      (p_site_id, 'activity_preferences', 'Preferenze sulle attività', 'textarea', false, '[]'::jsonb, 310)
    ON CONFLICT (site_id, field_key) DO UPDATE SET is_active = true;

    UPDATE registration_form_fields
    SET help_text = 'Indica le giornate o le sessioni a cui prevedi di partecipare.'
    WHERE site_id = p_site_id AND field_key = 'attendance_days' AND help_text = '';
  ELSE
    UPDATE registration_form_fields
    SET is_active = false
    WHERE site_id = p_site_id AND field_key IN ('attendance_days', 'activity_preferences');
  END IF;

  -- ═══ Compute result ═══
  SELECT count(*) INTO v_active_count
  FROM registration_form_fields
  WHERE site_id = p_site_id
    AND is_active = true
    AND field_key IN (
      'travel_mode','departure_city','travel_details',
      'overnight_required','room_preference','accommodation_notes',
      'attendance_days','activity_preferences'
    );

  SELECT array_agg(DISTINCT m) INTO v_active_modules
  FROM (
    SELECT CASE
      WHEN field_key IN ('travel_mode','departure_city','travel_details') THEN 'transport'
      WHEN field_key IN ('overnight_required','room_preference','accommodation_notes') THEN 'accommodation'
      WHEN field_key IN ('attendance_days','activity_preferences') THEN 'program'
    END AS m
    FROM registration_form_fields
    WHERE site_id = p_site_id
      AND is_active = true
      AND field_key IN (
        'travel_mode','departure_city','travel_details',
        'overnight_required','room_preference','accommodation_notes',
        'attendance_days','activity_preferences'
      )
  ) sub
  WHERE m IS NOT NULL;

  RETURN jsonb_build_object(
    'site_id', p_site_id,
    'active_modules', COALESCE(to_jsonb(v_active_modules), '[]'::jsonb),
    'active_preset_fields', v_active_count
  );
END;
$fn$;

-- Security: revoke from PUBLIC and anon, grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.configure_registration_modules(uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.configure_registration_modules(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.configure_registration_modules(uuid, text[]) TO authenticated;
