/*
# Harden document analysis RPC permissions

1. New Functions
   - `replace_document_chunks(p_document_id uuid, p_chunks jsonb)` RETURNS integer
     - SECURITY DEFINER with safe search_path
     - Atomic delete + insert inside a single SQL block
     - Validates document exists
     - Validates each chunk has content and chunk_index
     - Revoked from PUBLIC, anon, authenticated
     - Granted only to service_role
     - Returns number of chunks inserted

2. Security Changes
   - `search_document_chunks`: REVOKE from PUBLIC and anon, GRANT authenticated only, clamp limit 1..20
   - `replace_document_chunks`: REVOKE from PUBLIC, anon, authenticated; GRANT service_role only

3. Important Notes
   - replace_document_chunks is ATOMIC: if any insert fails, old chunks remain unchanged
   - No data migration — existing documents/chunks are not modified
   - search_document_chunks is recreated with clamped limit enforcement
*/

-- ─── replace_document_chunks: atomic chunk replacement ──────────────────────

CREATE OR REPLACE FUNCTION replace_document_chunks(
  p_document_id uuid,
  p_chunks jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_exists boolean;
  v_chunk jsonb;
  v_idx integer;
  v_count integer := 0;
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

  -- Validate each chunk
  FOR v_idx IN 0..jsonb_array_length(p_chunks) - 1 LOOP
    v_chunk := p_chunks->v_idx;
    IF v_chunk->>'content' IS NULL OR trim(v_chunk->>'content') = '' THEN
      RAISE EXCEPTION 'Chunk indice % ha content vuoto o mancante', v_idx;
    END IF;
    IF (v_chunk->>'chunk_index') IS NULL THEN
      RAISE EXCEPTION 'Chunk indice % manca di chunk_index', v_idx;
    END IF;
  END LOOP;

  -- Atomic: delete old, insert new (all inside this transaction)
  DELETE FROM document_chunks WHERE document_id = p_document_id;

  INSERT INTO document_chunks (document_id, chunk_index, content, section_label, page_number, metadata)
  SELECT
    p_document_id,
    (elem->>'chunk_index')::integer,
    elem->>'content',
    elem->>'section_label',
    (elem->>'page_number')::integer,
    COALESCE(elem->'metadata', '{}'::jsonb)
  FROM jsonb_array_elements(p_chunks) AS elem;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Permissions for replace_document_chunks
REVOKE EXECUTE ON FUNCTION replace_document_chunks(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION replace_document_chunks(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION replace_document_chunks(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION replace_document_chunks(uuid, jsonb) TO service_role;

-- ─── Fix search_document_chunks: recreate with clamped limit ────────────────

CREATE OR REPLACE FUNCTION search_document_chunks(
  p_query text,
  p_event_id text DEFAULT NULL,
  p_client_id text DEFAULT NULL,
  p_supplier_id text DEFAULT NULL,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (
  document_id uuid,
  document_name text,
  file_name text,
  categoria text,
  chunk_index integer,
  section_label text,
  page_number integer,
  content text,
  rank real
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tsquery tsquery;
  v_effective_limit integer;
BEGIN
  IF p_query IS NULL OR trim(p_query) = '' THEN
    RETURN;
  END IF;

  v_tsquery := websearch_to_tsquery('italian', p_query);
  v_effective_limit := GREATEST(1, LEAST(COALESCE(p_limit, 8), 20));

  RETURN QUERY
  SELECT
    d.id AS document_id,
    d.nome AS document_name,
    d.file_name,
    d.categoria,
    dc.chunk_index,
    dc.section_label,
    dc.page_number,
    dc.content,
    ts_rank(dc.search_vector, v_tsquery) AS rank
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE dc.search_vector @@ v_tsquery
    AND (p_event_id IS NULL OR d.event_id = p_event_id)
    AND (p_client_id IS NULL OR d.cliente_id = p_client_id)
    AND (p_supplier_id IS NULL OR d.supplier_id = p_supplier_id)
  ORDER BY rank DESC
  LIMIT v_effective_limit;
END;
$$;

-- Permissions for search_document_chunks
REVOKE EXECUTE ON FUNCTION search_document_chunks(text, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION search_document_chunks(text, text, text, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION search_document_chunks(text, text, text, text, integer) TO authenticated;
