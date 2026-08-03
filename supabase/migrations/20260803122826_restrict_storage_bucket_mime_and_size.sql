/*
# Restrict Storage bucket MIME types and file-size limits

## Changes
- **company-logos**: allowed MIME = image/png, image/jpeg, image/webp; max size = 2 MB (2 097 152 bytes).
- **supplier-photos**: allowed MIME = image/png, image/jpeg, image/webp, image/avif; max size = 5 MB (5 242 880 bytes).

## Important notes
1. Does NOT change bucket public status or RLS policies.
2. Does NOT affect existing objects (they remain accessible).
3. Only restricts future uploads.
4. Idempotent — safe to re-run.
*/

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'],
  file_size_limit   = 2097152
WHERE id = 'company-logos';

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif'],
  file_size_limit   = 5242880
WHERE id = 'supplier-photos';
