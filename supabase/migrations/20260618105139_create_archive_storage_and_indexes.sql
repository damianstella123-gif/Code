-- Create archive-files storage bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'archive-files',
  'archive-files',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg']
);

-- Storage RLS policies for archive-files bucket
CREATE POLICY "auth_select_archive_files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'archive-files');
CREATE POLICY "auth_insert_archive_files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'archive-files');
CREATE POLICY "auth_update_archive_files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'archive-files') WITH CHECK (bucket_id = 'archive-files');
CREATE POLICY "auth_delete_archive_files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'archive-files');

-- Add useful indexes on archive_items
CREATE INDEX IF NOT EXISTS idx_archive_items_folder ON archive_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_archive_items_content_type ON archive_items(content_type);
CREATE INDEX IF NOT EXISTS idx_archive_items_season ON archive_items(season);
CREATE INDEX IF NOT EXISTS idx_archive_items_reusable ON archive_items(reusable) WHERE reusable = true;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE archive_items;
ALTER PUBLICATION supabase_realtime ADD TABLE archive_folders;
