/*
# Create document_folders table and add folder_id to documents

## Summary
Adds folder/subfolder organization to event documents. Users can create folders
within an event, nest them, and assign documents to folders.

## New Tables
- `document_folders`
  - `id` (uuid, primary key)
  - `event_id` (text, NOT NULL, FK → events.id ON DELETE CASCADE)
  - `nome` (text, NOT NULL) — folder display name
  - `parent_folder_id` (uuid, nullable, self-referencing FK) — for subfolders
  - `created_by` (uuid, NOT NULL, default auth.uid(), FK → auth.users ON DELETE SET NULL)
  - `created_at` (timestamptz, default now())

## Modified Tables
- `documents`
  - Added `folder_id` (uuid, nullable, FK → document_folders.id ON DELETE SET NULL)
  - Index on folder_id for fast lookups

## Security
- RLS enabled on document_folders
- 4 policies (SELECT/INSERT/UPDATE/DELETE) scoped to authenticated users
  who can access the event via can_access_event()
- Matching the existing pattern used by documents, event_members, etc.

## Notes
1. folder_id ON DELETE SET NULL ensures documents are not deleted when a folder is removed —
   they simply become "unfoldered" again.
2. parent_folder_id ON DELETE CASCADE ensures deleting a parent folder also deletes child folders.
3. Unique constraint on (event_id, nome, parent_folder_id) prevents duplicate folder names
   at the same level. A COALESCE wrapper handles the NULL parent case.
*/

-- ─── document_folders table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  nome text NOT NULL,
  parent_folder_id uuid REFERENCES document_folders(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_folders_event_id ON document_folders(event_id);
CREATE INDEX IF NOT EXISTS idx_document_folders_parent ON document_folders(parent_folder_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_folders_unique_name
  ON document_folders (event_id, COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), nome);

ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_document_folders" ON document_folders;
CREATE POLICY "select_document_folders" ON document_folders FOR SELECT
  TO authenticated
  USING (can_access_event(event_id));

DROP POLICY IF EXISTS "insert_document_folders" ON document_folders;
CREATE POLICY "insert_document_folders" ON document_folders FOR INSERT
  TO authenticated
  WITH CHECK (can_access_event(event_id));

DROP POLICY IF EXISTS "update_document_folders" ON document_folders;
CREATE POLICY "update_document_folders" ON document_folders FOR UPDATE
  TO authenticated
  USING (can_access_event(event_id))
  WITH CHECK (can_access_event(event_id));

DROP POLICY IF EXISTS "delete_document_folders" ON document_folders;
CREATE POLICY "delete_document_folders" ON document_folders FOR DELETE
  TO authenticated
  USING (can_access_event(event_id));

-- ─── Add folder_id to documents ────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE documents ADD COLUMN folder_id uuid REFERENCES document_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id);
