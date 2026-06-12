INSERT INTO storage.buckets (id, name, public)
VALUES
  ('creative-files', 'creative-files', true),
  ('templates', 'templates', true),
  ('client-packages', 'client-packages', true),
  ('admin-files', 'admin-files', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_select_creative_files" ON storage.objects;
CREATE POLICY "public_select_creative_files" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id IN ('creative-files', 'templates', 'client-packages', 'admin-files'));

DROP POLICY IF EXISTS "public_insert_creative_files" ON storage.objects;
CREATE POLICY "public_insert_creative_files" ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id IN ('creative-files', 'templates', 'client-packages', 'admin-files'));

DROP POLICY IF EXISTS "public_update_creative_files" ON storage.objects;
CREATE POLICY "public_update_creative_files" ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id IN ('creative-files', 'templates', 'client-packages', 'admin-files'))
  WITH CHECK (bucket_id IN ('creative-files', 'templates', 'client-packages', 'admin-files'));

DROP POLICY IF EXISTS "public_delete_creative_files" ON storage.objects;
CREATE POLICY "public_delete_creative_files" ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id IN ('creative-files', 'templates', 'client-packages', 'admin-files'));
