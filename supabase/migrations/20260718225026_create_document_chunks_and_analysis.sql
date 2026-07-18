/*
# Document Analysis Infrastructure

1. Modified Tables
   - `documents`: added analysis columns for tracking processing state
     - `analysis_status` (text, NOT NULL, default 'non_elaborato') — processing state
     - `analysis_error` (text, nullable) — error message if processing failed
     - `analyzed_at` (timestamptz, nullable) — when analysis completed
     - `content_hash` (text, nullable) — SHA-256 of file to avoid reprocessing
     - `summary` (text, nullable) — AI-generated summary
     - `extracted_text` (text, nullable) — full extracted text
     - `analysis_metadata` (jsonb, NOT NULL, default '{}') — structured AI output

2. New Tables
   - `document_chunks`
     - `id` (uuid, PK)
     - `document_id` (uuid, FK → documents ON DELETE CASCADE)
     - `chunk_index` (integer, NOT NULL)
     - `content` (text, NOT NULL)
     - `section_label` (text, nullable)
     - `page_number` (integer, nullable)
     - `metadata` (jsonb, default '{}')
     - `search_vector` (tsvector, generated from content with 'italian' config)
     - `created_at` (timestamptz, default now())
     - UNIQUE(document_id, chunk_index)

3. Indexes
   - GIN index on `document_chunks.search_vector`
   - btree index on `document_chunks.document_id`

4. Security
   - RLS enabled on `document_chunks`
   - SELECT only for authenticated users who can access the parent document
   - No direct INSERT/UPDATE/DELETE from frontend (service role only)
   - No anon access

5. RPC
   - `search_document_chunks(p_query, p_event_id, p_client_id, p_supplier_id, p_limit)`
   - SECURITY INVOKER, authenticated only
   - Uses websearch_to_tsquery('italian', p_query)
   - Returns ranked results with document metadata
   - Max 20 results regardless of p_limit

6. Important Notes
   - Existing documents are NOT automatically processed (remain non_elaborato)
   - CHECK constraint enforces valid analysis_status values
   - All columns added with IF NOT EXISTS for idempotency
*/

-- ─── Extend documents table ─────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'analysis_status') THEN
    ALTER TABLE documents ADD COLUMN analysis_status text NOT NULL DEFAULT 'non_elaborato';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'analysis_error') THEN
    ALTER TABLE documents ADD COLUMN analysis_error text NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'analyzed_at') THEN
    ALTER TABLE documents ADD COLUMN analyzed_at timestamptz NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'content_hash') THEN
    ALTER TABLE documents ADD COLUMN content_hash text NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'summary') THEN
    ALTER TABLE documents ADD COLUMN summary text NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'extracted_text') THEN
    ALTER TABLE documents ADD COLUMN extracted_text text NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'analysis_metadata') THEN
    ALTER TABLE documents ADD COLUMN analysis_metadata jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- CHECK constraint on analysis_status
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'documents_analysis_status_check') THEN
    ALTER TABLE documents ADD CONSTRAINT documents_analysis_status_check
      CHECK (analysis_status IN ('non_elaborato', 'in_elaborazione', 'elaborato', 'errore', 'non_supportato'));
  END IF;
END $$;

-- ─── Create document_chunks table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  section_label text NULL,
  page_number integer NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('italian', content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_document_chunks_search_vector ON document_chunks USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks (document_id);

-- ─── RLS on document_chunks ─────────────────────────────────────────────────

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_document_chunks" ON document_chunks;
CREATE POLICY "auth_select_document_chunks" ON document_chunks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents d WHERE d.id = document_chunks.document_id
    )
  );

-- No INSERT/UPDATE/DELETE policies for frontend — only service role can write

-- ─── RPC: search_document_chunks ────────────────────────────────────────────

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
  v_effective_limit := LEAST(COALESCE(p_limit, 8), 20);

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

-- Revoke from anon
REVOKE EXECUTE ON FUNCTION search_document_chunks(text, text, text, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION search_document_chunks(text, text, text, text, integer) TO authenticated;
