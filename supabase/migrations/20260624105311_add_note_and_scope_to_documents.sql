ALTER TABLE documents ADD COLUMN IF NOT EXISTS note text DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'project';
CREATE INDEX IF NOT EXISTS idx_documents_scope ON documents(scope);
