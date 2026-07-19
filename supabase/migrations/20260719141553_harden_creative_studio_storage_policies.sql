/*
# Harden Creative Studio Storage and Table Policies

## Purpose
Lock down creative-files and templates storage buckets with project-aware
RLS helpers. Remove these two buckets from all broad shared policies while
preserving exact behavior for every other bucket.

## Changes

### 1. Legacy Table Policy Cleanup (defensive)
Drop all old broad policy names on creative_projects and presentation_versions
if they still exist. Preserve only the event-aware policies (cp_*, pv_*).

### 2. Storage Policy Adjustments
- `public_*_creative_files` (4 policies, anon+authenticated for creative-files,
  templates, client-packages, admin-files): drop and recreate covering ONLY
  client-packages and admin-files. Same roles (anon, authenticated).
- `authenticated_*_storage` (4 policies, authenticated for 9 buckets): drop and
  recreate covering only the 7 unrelated buckets (removing creative-files, templates).

### 3. New Helper Functions
- `can_access_creative_file(p_path text)` — SECURITY DEFINER; validates first
  path segment as UUID; checks creative_project exists; event-linked uses
  can_access_event; global is readable by any authenticated user.
- `can_manage_creative_file(p_path text)` — SECURITY DEFINER; same path parsing;
  event-linked uses has_event_permission('can_manage_creative'); global uses
  can_manage_global_creative().
- `can_read_creative_template_file(p_path text)` — SECURITY DEFINER; checks
  creative_templates row with file_path = p_path; active or can_manage_global_creative.

### 4. New Storage Policies
- creative-files bucket: SELECT via can_access_creative_file; INSERT/UPDATE/DELETE
  via can_manage_creative_file. Authenticated only.
- templates bucket: SELECT via can_read_creative_template_file; INSERT/UPDATE/DELETE
  via can_manage_global_creative(). Authenticated only.

### Important Notes
1. Unrelated buckets (company-logos, supplier-logos, archive-files, documents,
   event-documents, client-packages, admin-files) retain identical behavior.
2. No data modified — only policies and helper functions.
3. Template INSERT does NOT require a creative_templates row to exist yet
   (upload occurs before row creation).
4. No anon access to creative-files or templates.
*/


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. DEFENSIVE TABLE POLICY CLEANUP
-- ══════════════════════════════════════════════════════════════════════════════

-- creative_projects legacy
DROP POLICY IF EXISTS "anon_select_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "anon_insert_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "anon_update_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "anon_delete_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "authenticated_select_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "authenticated_insert_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "authenticated_update_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "authenticated_delete_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "creative_projects_update_owner_admin" ON creative_projects;
DROP POLICY IF EXISTS "creative_projects_delete_owner_admin" ON creative_projects;

-- presentation_versions legacy
DROP POLICY IF EXISTS "anon_select_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "anon_insert_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "anon_update_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "anon_delete_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "authenticated_select_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "authenticated_insert_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "authenticated_update_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "authenticated_delete_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "presentation_versions_update_owner_admin" ON presentation_versions;
DROP POLICY IF EXISTS "presentation_versions_delete_owner_admin" ON presentation_versions;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. STORAGE POLICY ADJUSTMENTS
-- ══════════════════════════════════════════════════════════════════════════════

-- 2a. Drop old public_*_creative_files (anon+authenticated, 4 buckets)
DROP POLICY IF EXISTS "public_select_creative_files" ON storage.objects;
DROP POLICY IF EXISTS "public_insert_creative_files" ON storage.objects;
DROP POLICY IF EXISTS "public_update_creative_files" ON storage.objects;
DROP POLICY IF EXISTS "public_delete_creative_files" ON storage.objects;

-- 2b. Recreate for client-packages and admin-files only (preserving anon+authenticated)
DROP POLICY IF EXISTS "public_select_client_admin_files" ON storage.objects;
CREATE POLICY "public_select_client_admin_files" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = ANY (ARRAY['client-packages', 'admin-files']));

DROP POLICY IF EXISTS "public_insert_client_admin_files" ON storage.objects;
CREATE POLICY "public_insert_client_admin_files" ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = ANY (ARRAY['client-packages', 'admin-files']));

DROP POLICY IF EXISTS "public_update_client_admin_files" ON storage.objects;
CREATE POLICY "public_update_client_admin_files" ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = ANY (ARRAY['client-packages', 'admin-files']))
  WITH CHECK (bucket_id = ANY (ARRAY['client-packages', 'admin-files']));

DROP POLICY IF EXISTS "public_delete_client_admin_files" ON storage.objects;
CREATE POLICY "public_delete_client_admin_files" ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = ANY (ARRAY['client-packages', 'admin-files']));

-- 2c. Drop old authenticated_*_storage (authenticated, 9 buckets)
DROP POLICY IF EXISTS "authenticated_select_storage" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_insert_storage" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_update_storage" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_storage" ON storage.objects;

-- 2d. Recreate for remaining 7 buckets (without creative-files, templates)
DROP POLICY IF EXISTS "auth_select_shared_buckets" ON storage.objects;
CREATE POLICY "auth_select_shared_buckets" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = ANY (ARRAY['company-logos', 'supplier-logos', 'archive-files', 'documents', 'event-documents', 'client-packages', 'admin-files']));

DROP POLICY IF EXISTS "auth_insert_shared_buckets" ON storage.objects;
CREATE POLICY "auth_insert_shared_buckets" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = ANY (ARRAY['company-logos', 'supplier-logos', 'archive-files', 'documents', 'event-documents', 'client-packages', 'admin-files']));

DROP POLICY IF EXISTS "auth_update_shared_buckets" ON storage.objects;
CREATE POLICY "auth_update_shared_buckets" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = ANY (ARRAY['company-logos', 'supplier-logos', 'archive-files', 'documents', 'event-documents', 'client-packages', 'admin-files']))
  WITH CHECK (bucket_id = ANY (ARRAY['company-logos', 'supplier-logos', 'archive-files', 'documents', 'event-documents', 'client-packages', 'admin-files']));

DROP POLICY IF EXISTS "auth_delete_shared_buckets" ON storage.objects;
CREATE POLICY "auth_delete_shared_buckets" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = ANY (ARRAY['company-logos', 'supplier-logos', 'archive-files', 'documents', 'event-documents', 'client-packages', 'admin-files']));


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. CREATIVE FILE ACCESS HELPERS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION can_access_creative_file(p_path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_event_id text;
  v_segment text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF p_path IS NULL OR p_path = '' THEN RETURN false; END IF;

  -- Extract first path segment (creative_project UUID)
  v_segment := split_part(p_path, '/', 1);

  -- Validate UUID format safely
  BEGIN
    v_project_id := v_segment::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  -- Check project exists and get event_id
  SELECT event_id INTO v_event_id
  FROM creative_projects
  WHERE id = v_project_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Event-linked: use can_access_event; global: readable by authenticated
  IF v_event_id IS NOT NULL THEN
    RETURN can_access_event(v_event_id);
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION can_access_creative_file(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_access_creative_file(text) FROM anon;
GRANT EXECUTE ON FUNCTION can_access_creative_file(text) TO authenticated;


CREATE OR REPLACE FUNCTION can_manage_creative_file(p_path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_event_id text;
  v_segment text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF p_path IS NULL OR p_path = '' THEN RETURN false; END IF;

  -- Extract first path segment (creative_project UUID)
  v_segment := split_part(p_path, '/', 1);

  -- Validate UUID format safely
  BEGIN
    v_project_id := v_segment::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  -- Check project exists and get event_id
  SELECT event_id INTO v_event_id
  FROM creative_projects
  WHERE id = v_project_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Event-linked: use has_event_permission; global: can_manage_global_creative
  IF v_event_id IS NOT NULL THEN
    RETURN has_event_permission(v_event_id, 'can_manage_creative');
  END IF;

  RETURN can_manage_global_creative();
END;
$$;

REVOKE ALL ON FUNCTION can_manage_creative_file(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_manage_creative_file(text) FROM anon;
GRANT EXECUTE ON FUNCTION can_manage_creative_file(text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. CREATIVE-FILES BUCKET POLICIES
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "cf_select" ON storage.objects;
CREATE POLICY "cf_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'creative-files' AND can_access_creative_file(name));

DROP POLICY IF EXISTS "cf_insert" ON storage.objects;
CREATE POLICY "cf_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'creative-files' AND can_manage_creative_file(name));

DROP POLICY IF EXISTS "cf_update" ON storage.objects;
CREATE POLICY "cf_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'creative-files' AND can_manage_creative_file(name))
  WITH CHECK (bucket_id = 'creative-files' AND can_manage_creative_file(name));

DROP POLICY IF EXISTS "cf_delete" ON storage.objects;
CREATE POLICY "cf_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'creative-files' AND can_manage_creative_file(name));


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. TEMPLATE STORAGE HELPER
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION can_read_creative_template_file(p_path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_active boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF p_path IS NULL OR p_path = '' THEN RETURN false; END IF;

  SELECT is_active INTO v_is_active
  FROM creative_templates
  WHERE file_path = p_path;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Active templates readable by all authenticated; inactive by managers only
  IF v_is_active THEN RETURN true; END IF;
  RETURN can_manage_global_creative();
END;
$$;

REVOKE ALL ON FUNCTION can_read_creative_template_file(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_read_creative_template_file(text) FROM anon;
GRANT EXECUTE ON FUNCTION can_read_creative_template_file(text) TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. TEMPLATES BUCKET POLICIES
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "tpl_select" ON storage.objects;
CREATE POLICY "tpl_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'templates' AND can_read_creative_template_file(name));

-- INSERT: managers only, no row requirement (upload before row creation)
DROP POLICY IF EXISTS "tpl_insert" ON storage.objects;
CREATE POLICY "tpl_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'templates' AND can_manage_global_creative());

DROP POLICY IF EXISTS "tpl_update" ON storage.objects;
CREATE POLICY "tpl_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'templates' AND can_manage_global_creative())
  WITH CHECK (bucket_id = 'templates' AND can_manage_global_creative());

DROP POLICY IF EXISTS "tpl_delete" ON storage.objects;
CREATE POLICY "tpl_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'templates' AND can_manage_global_creative());
