/*
# Harden document + storage RLS for event-members access model

1. Modified Tables
   - `documents` — replaced all 4 RLS policies with event-aware versions
   - `document_chunks` — replaced SELECT policy with parent-visibility check
   - `storage.objects` — replaced broad bucket-level policies for 'documents' bucket
     with path-based event/dossier split

2. Policy Logic — documents
   - SELECT: event-linked rows require can_access_event(event_id);
     non-event rows allow authenticated access (preserved for dossier/global)
   - INSERT: event-linked rows require has_event_permission(event_id, 'can_manage_documents');
     non-event rows allow authenticated (preserved)
   - UPDATE: same as INSERT rules
   - DELETE: same as INSERT rules
   - anon: no access anywhere

3. Policy Logic — document_chunks
   - SELECT only: visible when parent document row is visible through documents RLS
   - No INSERT/UPDATE/DELETE for authenticated (service role writes chunks)

4. Policy Logic — storage.objects (bucket = 'documents')
   - For event paths (first folder is a valid UUID matching an event):
     SELECT requires can_access_event(first_folder)
     INSERT/UPDATE/DELETE require has_event_permission(first_folder, 'can_manage_documents')
   - For dossier/ paths: authenticated access preserved
   - For other paths: authenticated access preserved

5. search_document_chunks permissions
   - SECURITY INVOKER (default, not definer) — returns only rows visible via RLS
   - EXECUTE revoked from PUBLIC and anon
   - EXECUTE granted to authenticated

6. Important Notes
   - No table structure changes
   - No data modifications
   - Existing document counts must remain unchanged
   - Dossier and global document behavior preserved temporarily
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. DOCUMENTS TABLE POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop existing broad policies
DROP POLICY IF EXISTS "select_documents" ON documents;
DROP POLICY IF EXISTS "insert_documents" ON documents;
DROP POLICY IF EXISTS "update_documents" ON documents;
DROP POLICY IF EXISTS "delete_documents" ON documents;

-- SELECT: event-linked → can_access_event; others → authenticated
CREATE POLICY "select_documents" ON documents FOR SELECT
TO authenticated
USING (
  CASE
    WHEN event_id IS NOT NULL THEN can_access_event(event_id)
    ELSE true
  END
);

-- INSERT: event-linked → has_event_permission; others → authenticated
CREATE POLICY "insert_documents" ON documents FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_documents')
    ELSE true
  END
);

-- UPDATE: event-linked → has_event_permission; others → authenticated
CREATE POLICY "update_documents" ON documents FOR UPDATE
TO authenticated
USING (
  CASE
    WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_documents')
    ELSE true
  END
)
WITH CHECK (
  CASE
    WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_documents')
    ELSE true
  END
);

-- DELETE: event-linked → has_event_permission; others → authenticated
CREATE POLICY "delete_documents" ON documents FOR DELETE
TO authenticated
USING (
  CASE
    WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_documents')
    ELSE true
  END
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. DOCUMENT_CHUNKS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "auth_select_document_chunks" ON document_chunks;

-- SELECT: visible only when parent document is visible through documents RLS
CREATE POLICY "auth_select_document_chunks" ON document_chunks FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = document_chunks.document_id
  )
);

-- No INSERT/UPDATE/DELETE for authenticated — service role handles chunk writes

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. STORAGE POLICIES for 'documents' bucket
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop existing broad policies
DROP POLICY IF EXISTS "auth_read_documents" ON storage.objects;
DROP POLICY IF EXISTS "auth_upload_documents" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_documents" ON storage.objects;

-- Remove 'documents' from the shared update policy, rebuild without it
DROP POLICY IF EXISTS "authenticated_update_storage" ON storage.objects;
CREATE POLICY "authenticated_update_storage" ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = ANY (ARRAY[
  'company-logos', 'supplier-logos', 'archive-files',
  'event-documents', 'creative-files', 'templates',
  'client-packages', 'admin-files'
]));

-- SELECT/download: event paths → can_access_event; dossier/other → authenticated
CREATE POLICY "documents_select" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    CASE
      WHEN _is_valid_uuid(split_part(name, '/', 1))
        AND EXISTS (SELECT 1 FROM events WHERE id = split_part(name, '/', 1))
        THEN can_access_event(split_part(name, '/', 1))
      ELSE true
    END
  )
);

-- INSERT: event paths → has_event_permission; dossier/other → authenticated
CREATE POLICY "documents_insert" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (
    CASE
      WHEN _is_valid_uuid(split_part(name, '/', 1))
        AND EXISTS (SELECT 1 FROM events WHERE id = split_part(name, '/', 1))
        THEN has_event_permission(split_part(name, '/', 1), 'can_manage_documents')
      ELSE true
    END
  )
);

-- UPDATE: same logic as INSERT
CREATE POLICY "documents_update" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    CASE
      WHEN _is_valid_uuid(split_part(name, '/', 1))
        AND EXISTS (SELECT 1 FROM events WHERE id = split_part(name, '/', 1))
        THEN has_event_permission(split_part(name, '/', 1), 'can_manage_documents')
      ELSE true
    END
  )
);

-- DELETE: same logic as INSERT
CREATE POLICY "documents_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    CASE
      WHEN _is_valid_uuid(split_part(name, '/', 1))
        AND EXISTS (SELECT 1 FROM events WHERE id = split_part(name, '/', 1))
        THEN has_event_permission(split_part(name, '/', 1), 'can_manage_documents')
      ELSE true
    END
  )
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. SEARCH RPC PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- search_document_chunks is already SECURITY INVOKER (not definer).
-- Harden execute grants.
DO $$
DECLARE
  fn_oid oid;
BEGIN
  SELECT p.oid INTO fn_oid
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'search_document_chunks';

  IF fn_oid IS NOT NULL THEN
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn_oid::regprocedure);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn_oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn_oid::regprocedure);
  END IF;
END $$;
