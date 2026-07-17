/*
# Create clone_budget_version RPC function

## Purpose
Provides a transactional, atomic duplication of budget version rows across
all 11 economic detail tables. If any single table copy fails, the entire
operation rolls back automatically (including the new budget_version row).

## Function Signature
  public.clone_budget_version(
    p_source_version_id uuid,
    p_target_type text,        -- 'preventivo' or 'consuntivo'
    p_target_name text
  ) RETURNS uuid

## Validations
  1. auth.uid() must be non-null (authenticated user required)
  2. Source version must exist
  3. p_target_type must be 'preventivo' or 'consuntivo'
  4. For consuntivo: source must be tipo=preventivo, stato=approvato,
     and no existing consuntivo with same source_version_id
  5. Empty name gets a safe default

## Behavior
  - Creates new budget_version row
  - Copies rows from 11 detail tables using dynamic SQL (column list
    from information_schema, excluding id/created_at/updated_at/budget_version_id)
  - Returns the new version's id on success
  - Any failure propagates as exception, rolling back everything

## Security
  - SECURITY INVOKER (respects caller's RLS)
  - REVOKE from PUBLIC and anon
  - GRANT to authenticated only
*/

CREATE OR REPLACE FUNCTION public.clone_budget_version(
  p_source_version_id uuid,
  p_target_type text,
  p_target_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_source RECORD;
  v_new_id uuid;
  v_safe_name text;
  v_table text;
  v_cols text;
  v_tables text[] := ARRAY[
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
  -- 1. Require authenticated user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: utente non autenticato';
  END IF;

  -- 2. Validate target type
  IF p_target_type NOT IN ('preventivo', 'consuntivo') THEN
    RAISE EXCEPTION 'INVALID_TYPE: tipo deve essere preventivo o consuntivo';
  END IF;

  -- 3. Load source version
  SELECT * INTO v_source
  FROM budget_versions
  WHERE id = p_source_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOURCE_NOT_FOUND: versione sorgente non trovata';
  END IF;

  -- 4. Consuntivo-specific validations
  IF p_target_type = 'consuntivo' THEN
    IF v_source.tipo <> 'preventivo' THEN
      RAISE EXCEPTION 'NOT_PREVENTIVO: la sorgente deve essere un preventivo';
    END IF;
    IF v_source.stato <> 'approvato' THEN
      RAISE EXCEPTION 'NOT_APPROVED: il preventivo deve essere approvato';
    END IF;
    IF EXISTS (
      SELECT 1 FROM budget_versions
      WHERE source_version_id = p_source_version_id
        AND tipo = 'consuntivo'
    ) THEN
      RAISE EXCEPTION 'CONSUNTIVO_EXISTS: esiste gia un consuntivo per questo preventivo';
    END IF;
  END IF;

  -- 5. Safe name
  v_safe_name := NULLIF(TRIM(p_target_name), '');
  IF v_safe_name IS NULL THEN
    IF p_target_type = 'consuntivo' THEN
      v_safe_name := 'Consuntivo';
    ELSE
      v_safe_name := v_source.nome || ' (copia)';
    END IF;
  END IF;

  -- 6. Create new version
  INSERT INTO budget_versions (event_id, nome, tipo, stato, created_by, source_version_id)
  VALUES (
    v_source.event_id,
    v_safe_name,
    p_target_type,
    'bozza',
    auth.uid(),
    CASE WHEN p_target_type = 'consuntivo' THEN p_source_version_id ELSE NULL END
  )
  RETURNING id INTO v_new_id;

  -- 7. Copy rows from each table using dynamic column list
  FOREACH v_table IN ARRAY v_tables
  LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = v_table
      AND column_name NOT IN ('id', 'created_at', 'updated_at', 'budget_version_id');

    IF v_cols IS NOT NULL THEN
      EXECUTE format(
        'INSERT INTO %I (budget_version_id, %s) SELECT %L::uuid, %s FROM %I WHERE budget_version_id = %L',
        v_table,
        v_cols,
        v_new_id,
        v_cols,
        v_table,
        p_source_version_id
      );
    END IF;
  END LOOP;

  RETURN v_new_id;
END;
$$;

-- Security: restrict access
REVOKE EXECUTE ON FUNCTION public.clone_budget_version(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clone_budget_version(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.clone_budget_version(uuid, text, text) TO authenticated;
