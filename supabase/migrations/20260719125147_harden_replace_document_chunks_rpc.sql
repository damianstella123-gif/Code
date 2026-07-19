/*
# Harden replace_document_chunks RPC

1. Modified Function
   - `replace_document_chunks(p_document_id uuid, p_chunks jsonb)`
   - Safely handles empty JSON arrays (deletes old chunks, inserts zero, returns 0)
   - Validates non-empty arrays:
     - every element must be a JSON object
     - chunk_index must be an integer >= 0
     - chunk indexes must be unique
     - content must be non-empty after trim
     - page_number, if present, must be integer > 0
   - Validation aborts BEFORE deleting existing chunks on invalid input

2. Security (preserved)
   - SECURITY DEFINER
   - search_path = public, pg_temp
   - EXECUTE only service_role
   - PUBLIC/anon/authenticated denied

3. Important Notes
   - No table structure changes
   - No data modifications
   - Atomic delete + insert preserved
   - Empty array safely deletes all existing chunks and returns 0
   - Invalid 0..-1 loop eliminated
*/

CREATE OR REPLACE FUNCTION public.replace_document_chunks(p_document_id uuid, p_chunks jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_doc_exists boolean;
  v_chunk jsonb;
  v_idx integer;
  v_count integer := 0;
  v_arr_len integer;
  v_chunk_index integer;
  v_page_number integer;
  v_seen_indexes integer[] := '{}';
BEGIN
  -- Validate document exists
  SELECT EXISTS(SELECT 1 FROM documents WHERE id = p_document_id) INTO v_doc_exists;
  IF NOT v_doc_exists THEN
    RAISE EXCEPTION 'Documento non trovato: %', p_document_id;
  END IF;

  -- Validate p_chunks is an array
  IF p_chunks IS NULL OR jsonb_typeof(p_chunks) != 'array' THEN
    RAISE EXCEPTION 'p_chunks deve essere un array JSON';
  END IF;

  v_arr_len := jsonb_array_length(p_chunks);

  -- Validate each chunk BEFORE any delete (only if non-empty)
  IF v_arr_len > 0 THEN
    FOR v_idx IN 0..v_arr_len - 1 LOOP
      v_chunk := p_chunks->v_idx;

      -- Must be a JSON object
      IF jsonb_typeof(v_chunk) != 'object' THEN
        RAISE EXCEPTION 'Elemento % non e un oggetto JSON', v_idx;
      END IF;

      -- chunk_index must be present and integer >= 0
      IF (v_chunk->>'chunk_index') IS NULL THEN
        RAISE EXCEPTION 'Elemento % manca di chunk_index', v_idx;
      END IF;
      BEGIN
        v_chunk_index := (v_chunk->>'chunk_index')::integer;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Elemento % ha chunk_index non intero', v_idx;
      END;
      IF v_chunk_index < 0 THEN
        RAISE EXCEPTION 'Elemento % ha chunk_index negativo: %', v_idx, v_chunk_index;
      END IF;

      -- chunk_index must be unique
      IF v_chunk_index = ANY(v_seen_indexes) THEN
        RAISE EXCEPTION 'chunk_index % duplicato', v_chunk_index;
      END IF;
      v_seen_indexes := v_seen_indexes || v_chunk_index;

      -- content must be non-empty after trim
      IF v_chunk->>'content' IS NULL OR trim(v_chunk->>'content') = '' THEN
        RAISE EXCEPTION 'Elemento % ha content vuoto o mancante', v_idx;
      END IF;

      -- page_number, if present, must be integer > 0
      IF v_chunk->>'page_number' IS NOT NULL AND v_chunk->>'page_number' != '' THEN
        BEGIN
          v_page_number := (v_chunk->>'page_number')::integer;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'Elemento % ha page_number non intero', v_idx;
        END;
        IF v_page_number <= 0 THEN
          RAISE EXCEPTION 'Elemento % ha page_number <= 0: %', v_idx, v_page_number;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Atomic: delete old chunks
  DELETE FROM document_chunks WHERE document_id = p_document_id;

  -- Insert new chunks only if array is non-empty
  IF v_arr_len > 0 THEN
    INSERT INTO document_chunks (document_id, chunk_index, content, section_label, page_number, metadata)
    SELECT
      p_document_id,
      (elem->>'chunk_index')::integer,
      elem->>'content',
      NULLIF(trim(COALESCE(elem->>'section_label', '')), ''),
      (NULLIF(elem->>'page_number', ''))::integer,
      COALESCE(elem->'metadata', '{}'::jsonb)
    FROM jsonb_array_elements(p_chunks) AS elem;

    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$function$;

-- Permissions: service_role only
REVOKE EXECUTE ON FUNCTION replace_document_chunks(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION replace_document_chunks(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION replace_document_chunks(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION replace_document_chunks(uuid, jsonb) TO service_role;
