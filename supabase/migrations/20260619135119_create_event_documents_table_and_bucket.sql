-- Event documents metadata table
CREATE TABLE IF NOT EXISTS public.event_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  uploaded_by text NOT NULL,
  uploaded_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_event_documents" ON event_documents FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_event_documents" ON event_documents FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "delete_event_documents" ON event_documents FOR DELETE
  TO authenticated USING (true);

-- Storage bucket for event documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-documents',
  'event-documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "auth_upload_event_docs" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'event-documents');
CREATE POLICY "auth_read_event_docs" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'event-documents');
CREATE POLICY "auth_delete_event_docs" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'event-documents');