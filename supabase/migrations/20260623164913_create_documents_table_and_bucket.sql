CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'Altro',
  cliente_id text,
  event_id text,
  supplier_id text,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  file_type text NOT NULL DEFAULT '',
  uploaded_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_documents" ON documents FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_documents" ON documents FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_documents" ON documents FOR DELETE
  TO authenticated USING (true);

CREATE INDEX idx_documents_event ON documents(event_id);
CREATE INDEX idx_documents_cliente ON documents(cliente_id);
CREATE INDEX idx_documents_supplier ON documents(supplier_id);
CREATE INDEX idx_documents_categoria ON documents(categoria);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/jpeg',
    'image/png'
  ]
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_upload_documents" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'documents');
CREATE POLICY "auth_read_documents" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "auth_delete_documents" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'documents');