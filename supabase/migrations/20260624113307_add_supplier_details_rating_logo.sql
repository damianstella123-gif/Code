-- Add new columns to suppliers table
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS rating smallint CHECK (rating >= 1 AND rating <= 5);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS note_operative text DEFAULT '';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb;

-- Create storage bucket for supplier logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('supplier-logos', 'supplier-logos', true, 2097152, ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for supplier-logos bucket
CREATE POLICY "authenticated_upload_supplier_logos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'supplier-logos');
CREATE POLICY "authenticated_update_supplier_logos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'supplier-logos');
CREATE POLICY "authenticated_delete_supplier_logos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'supplier-logos');
CREATE POLICY "public_read_supplier_logos" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'supplier-logos');
