-- Make all storage buckets private
UPDATE storage.buckets SET public = false WHERE name IN ('admin-files', 'client-packages', 'creative-files', 'templates');

-- Add storage RLS policies for authenticated users only
CREATE POLICY "authenticated_select_storage" ON storage.objects FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_storage" ON storage.objects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_storage" ON storage.objects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_storage" ON storage.objects FOR DELETE TO authenticated USING (true);
