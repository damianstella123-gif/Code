/*
# Fix documents bucket storage policies — replace _is_valid_uuid with safe helper

1. New Function
   - `is_event_document_path(p_path text)` — SECURITY DEFINER
     Returns true when the first path segment matches an existing events.id.
     Does not require UUID format. Returns false for dossier/ and other paths.
     search_path = public, pg_temp. No dynamic SQL.
     Revoked from PUBLIC and anon; granted to authenticated.

2. Modified Policies (storage.objects, bucket = 'documents')
   - documents_select: uses is_event_document_path instead of _is_valid_uuid
   - documents_insert: same
   - documents_update: same (USING + WITH CHECK)
   - documents_delete: same

3. Important Notes
   - No changes to documents or document_chunks table RLS
   - No data modifications
   - No frontend changes
   - Removes all _is_valid_uuid usage from storage policies
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. CREATE HELPER FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_event_document_path(p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM events WHERE id = split_part(p_path, '/', 1)
  );
$$;

REVOKE EXECUTE ON FUNCTION is_event_document_path(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_event_document_path(text) FROM anon;
GRANT EXECUTE ON FUNCTION is_event_document_path(text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. REPLACE STORAGE POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "documents_select" ON storage.objects;
CREATE POLICY "documents_select" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    CASE
      WHEN is_event_document_path(name)
        THEN can_access_event(split_part(name, '/', 1))
      ELSE true
    END
  )
);

DROP POLICY IF EXISTS "documents_insert" ON storage.objects;
CREATE POLICY "documents_insert" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (
    CASE
      WHEN is_event_document_path(name)
        THEN has_event_permission(split_part(name, '/', 1), 'can_manage_documents')
      ELSE true
    END
  )
);

DROP POLICY IF EXISTS "documents_update" ON storage.objects;
CREATE POLICY "documents_update" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    CASE
      WHEN is_event_document_path(name)
        THEN has_event_permission(split_part(name, '/', 1), 'can_manage_documents')
      ELSE true
    END
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (
    CASE
      WHEN is_event_document_path(name)
        THEN has_event_permission(split_part(name, '/', 1), 'can_manage_documents')
      ELSE true
    END
  )
);

DROP POLICY IF EXISTS "documents_delete" ON storage.objects;
CREATE POLICY "documents_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    CASE
      WHEN is_event_document_path(name)
        THEN has_event_permission(split_part(name, '/', 1), 'can_manage_documents')
      ELSE true
    END
  )
);
