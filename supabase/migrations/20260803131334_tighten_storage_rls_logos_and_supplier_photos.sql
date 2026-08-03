/*
# Tighten Storage RLS for company-logos and supplier-photos

## Summary
Restricts write/delete access on the company-logos and supplier-photos storage
buckets. Read (SELECT) policies are unchanged — both buckets remain publicly readable.

## Changes

### company-logos
- **INSERT**: unchanged — any authenticated user can upload.
- **UPDATE**: restricted to Admin / Super Admin only (was: any authenticated).
- **DELETE**: restricted to Admin / Super Admin only (was: any authenticated).
- **Shared-bucket policies**: 'company-logos' removed from the
  auth_select/insert/update/delete_shared_buckets arrays so the bucket is no
  longer covered by two overlapping policy sets. The 6 other buckets in those
  arrays are untouched.

### supplier-photos
- **INSERT**: unchanged — any authenticated user can upload.
- **DELETE**: restricted to the original uploader (via supplier_photos.caricata_da)
  OR Admin / Super Admin (was: any authenticated).
- No UPDATE policy existed and none is added (code never overwrites).

## Security notes
1. get_my_role() is SECURITY DEFINER, reads profiles.role, and has search_path
   locked to 'public' — safe for use in storage policies.
2. The supplier_photos.storage_path join is intentional: it links the storage
   object to the tracking row that records who uploaded it.
3. No objects, paths, tables, or columns are created, altered, or deleted.
4. Migration is fully idempotent (DROP POLICY IF EXISTS before every CREATE).
*/

-- ============================================================
-- 1. Remove 'company-logos' from shared_buckets policies
--    (6 other buckets remain in each array)
-- ============================================================

DROP POLICY IF EXISTS "auth_select_shared_buckets" ON storage.objects;
CREATE POLICY "auth_select_shared_buckets" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = ANY (ARRAY[
    'supplier-logos','archive-files','documents',
    'event-documents','client-packages','admin-files'
  ]));

DROP POLICY IF EXISTS "auth_insert_shared_buckets" ON storage.objects;
CREATE POLICY "auth_insert_shared_buckets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = ANY (ARRAY[
    'supplier-logos','archive-files','documents',
    'event-documents','client-packages','admin-files'
  ]));

DROP POLICY IF EXISTS "auth_update_shared_buckets" ON storage.objects;
CREATE POLICY "auth_update_shared_buckets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = ANY (ARRAY[
    'supplier-logos','archive-files','documents',
    'event-documents','client-packages','admin-files'
  ]))
  WITH CHECK (bucket_id = ANY (ARRAY[
    'supplier-logos','archive-files','documents',
    'event-documents','client-packages','admin-files'
  ]));

DROP POLICY IF EXISTS "auth_delete_shared_buckets" ON storage.objects;
CREATE POLICY "auth_delete_shared_buckets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = ANY (ARRAY[
    'supplier-logos','archive-files','documents',
    'event-documents','client-packages','admin-files'
  ]));

-- ============================================================
-- 2. company-logos — tighten UPDATE and DELETE to Admin only
-- ============================================================

-- SELECT: keep existing public read (unchanged, but idempotent re-create)
DROP POLICY IF EXISTS "public_read_logos" ON storage.objects;
CREATE POLICY "public_read_logos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'company-logos');

-- INSERT: keep any authenticated (unchanged, but idempotent re-create)
DROP POLICY IF EXISTS "authenticated_upload_logos" ON storage.objects;
CREATE POLICY "authenticated_upload_logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos');

-- UPDATE: Admin / Super Admin only
DROP POLICY IF EXISTS "authenticated_update_logos" ON storage.objects;
CREATE POLICY "authenticated_update_logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND get_my_role() IN ('Admin', 'Super Admin')
  )
  WITH CHECK (
    bucket_id = 'company-logos'
    AND get_my_role() IN ('Admin', 'Super Admin')
  );

-- DELETE: Admin / Super Admin only
DROP POLICY IF EXISTS "authenticated_delete_logos" ON storage.objects;
CREATE POLICY "authenticated_delete_logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND get_my_role() IN ('Admin', 'Super Admin')
  );

-- ============================================================
-- 3. supplier-photos — tighten DELETE to uploader or Admin
-- ============================================================

-- SELECT: keep existing public read (unchanged, but idempotent re-create)
DROP POLICY IF EXISTS "supplier_photos_public_read" ON storage.objects;
CREATE POLICY "supplier_photos_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'supplier-photos');

-- INSERT: keep any authenticated (unchanged, but idempotent re-create)
DROP POLICY IF EXISTS "supplier_photos_auth_upload" ON storage.objects;
CREATE POLICY "supplier_photos_auth_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-photos');

-- DELETE: uploader (via tracking table) OR Admin / Super Admin
DROP POLICY IF EXISTS "supplier_photos_auth_delete" ON storage.objects;
CREATE POLICY "supplier_photos_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'supplier-photos'
    AND (
      EXISTS (
        SELECT 1 FROM supplier_photos sp
        WHERE sp.storage_path = name
          AND sp.caricata_da = auth.uid()
      )
      OR get_my_role() IN ('Admin', 'Super Admin')
    )
  );
