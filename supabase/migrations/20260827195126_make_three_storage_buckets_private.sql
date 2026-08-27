/*
# Make company-logos, supplier-logos, and supplier-photos buckets private

1. Security Changes
   - Sets `public = false` on 3 storage buckets: company-logos, supplier-logos,
     supplier-photos. This disables unauthenticated direct-URL access and prevents
     anonymous bucket listing (the "public_bucket_allows_listing" advisor warning).
   - Drops the overly-permissive public SELECT policies that allowed anyone to list
     and download every object in these buckets.
   - Adds/confirms authenticated SELECT policies so logged-in users can still read
     objects through the Supabase storage API (which passes the auth token).
   - Adds an authenticated INSERT policy for company-logos (Admin/Super Admin only)
     and for supplier-photos (any authenticated user) to ensure uploads still work.
   - registration-assets bucket is LEFT UNCHANGED (public) because it serves images
     on unauthenticated public registration pages.

2. Impact
   - Frontend code that uses `getPublicUrl()` for these buckets will need to switch
     to `createSignedUrl()` since direct public URLs will no longer serve files
     without authentication.
   - All authenticated users can still view supplier logos, supplier photos, and
     company logos through signed URLs.

3. Important Notes
   - Existing stored `logo_url` / `public_url` values in database columns will
     contain stale public URLs. The frontend will be updated to generate signed
     URLs at render time instead of relying on stored public URLs.
   - The `auth_select_shared_buckets` policy already covers supplier-logos for
     authenticated reads, but we add an explicit one for clarity and for
     supplier-photos which was missing it.
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Make buckets private
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE storage.buckets SET public = false WHERE id = 'company-logos';
UPDATE storage.buckets SET public = false WHERE id = 'supplier-logos';
UPDATE storage.buckets SET public = false WHERE id = 'supplier-photos';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Drop public (anonymous) SELECT policies
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "public_read_logos" ON storage.objects;
DROP POLICY IF EXISTS "public_read_supplier_logos" ON storage.objects;
DROP POLICY IF EXISTS "supplier_photos_public_read" ON storage.objects;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Ensure authenticated SELECT policies exist for all three buckets
-- ═══════════════════════════════════════════════════════════════════════════════

-- company-logos: any authenticated user can view logos
DROP POLICY IF EXISTS "auth_select_company_logos" ON storage.objects;
CREATE POLICY "auth_select_company_logos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'company-logos');

-- supplier-photos: any authenticated user can view photos
DROP POLICY IF EXISTS "auth_select_supplier_photos" ON storage.objects;
CREATE POLICY "auth_select_supplier_photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'supplier-photos');

-- supplier-logos already covered by auth_select_shared_buckets, but add explicit for clarity
DROP POLICY IF EXISTS "auth_select_supplier_logos" ON storage.objects;
CREATE POLICY "auth_select_supplier_logos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'supplier-logos');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Ensure authenticated INSERT policies exist
-- ═══════════════════════════════════════════════════════════════════════════════

-- company-logos: Admin/Super Admin can upload
DROP POLICY IF EXISTS "auth_insert_company_logos" ON storage.objects;
CREATE POLICY "auth_insert_company_logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND get_my_role() IN ('Admin', 'Super Admin')
  );

-- supplier-photos: any authenticated user can upload
DROP POLICY IF EXISTS "auth_insert_supplier_photos" ON storage.objects;
CREATE POLICY "auth_insert_supplier_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-photos');

-- supplier-logos: any authenticated user can upload (already covered by auth_insert_shared_buckets
-- but adding explicit for completeness)
DROP POLICY IF EXISTS "auth_insert_supplier_logos" ON storage.objects;
CREATE POLICY "auth_insert_supplier_logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-logos');
