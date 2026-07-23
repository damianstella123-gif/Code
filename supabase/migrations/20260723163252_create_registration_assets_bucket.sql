/*
# Create registration-assets storage bucket

## Purpose
Provides a public storage bucket for registration-site branding assets (logos, hero images).
Files are publicly readable so public registration pages can display them without auth.
Write access is restricted to authenticated users who hold `can_manage_registration` on the
event identified by the first path segment.

## Bucket Configuration
- name: registration-assets
- public: true (objects readable via public URL)
- max file size: 5 MB (5242880 bytes)
- allowed MIME types: image/jpeg, image/png, image/webp only

## Path Convention
  {event_id}/{site_id}/{asset_type}-{unique_id}.{extension}

## Storage Policies (on storage.objects)
1. "registration_assets_public_select" — anon + authenticated SELECT
2. "registration_assets_authenticated_insert" — authenticated INSERT with permission check
3. "registration_assets_authenticated_update" — authenticated UPDATE with permission check
4. "registration_assets_authenticated_delete" — authenticated DELETE with permission check

## Security Notes
- SVG, HTML, PDF, and script MIME types are blocked at the bucket level.
- Write policies enforce `has_event_permission(event_id, 'can_manage_registration')` using
  the first folder segment as the event_id.
- Migration is idempotent via INSERT … ON CONFLICT and DROP POLICY IF EXISTS.
*/

-- ─── Bucket ────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'registration-assets',
  'registration-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── Policies ──────────────────────────────────────────────────────────────────

-- 1. Public read (anon + authenticated)
DROP POLICY IF EXISTS "registration_assets_public_select" ON storage.objects;
CREATE POLICY "registration_assets_public_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'registration-assets');

-- 2. Authenticated insert with event permission check
DROP POLICY IF EXISTS "registration_assets_authenticated_insert" ON storage.objects;
CREATE POLICY "registration_assets_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'registration-assets'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND has_event_permission(
      (storage.foldername(name))[1],
      'can_manage_registration'
    )
  );

-- 3. Authenticated update with event permission check
DROP POLICY IF EXISTS "registration_assets_authenticated_update" ON storage.objects;
CREATE POLICY "registration_assets_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'registration-assets'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND has_event_permission(
      (storage.foldername(name))[1],
      'can_manage_registration'
    )
  )
  WITH CHECK (
    bucket_id = 'registration-assets'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND has_event_permission(
      (storage.foldername(name))[1],
      'can_manage_registration'
    )
  );

-- 4. Authenticated delete with event permission check
DROP POLICY IF EXISTS "registration_assets_authenticated_delete" ON storage.objects;
CREATE POLICY "registration_assets_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'registration-assets'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND has_event_permission(
      (storage.foldername(name))[1],
      'can_manage_registration'
    )
  );
