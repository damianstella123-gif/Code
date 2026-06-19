INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "authenticated_upload_logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "authenticated_update_logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'company-logos')
  WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "authenticated_delete_logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'company-logos');

CREATE POLICY "public_read_logos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'company-logos');