/*
# Rename practices table to dossiers and add dossier_id to documents

1. Table Rename
   - `practices` → `dossiers` (ALTER TABLE RENAME)

2. New Columns
   - `documents.dossier_id` (text, nullable, FK → dossiers.id ON DELETE SET NULL)

3. Security Changes
   - Drop old RLS policies referencing 'practices' naming
   - Recreate equivalent policies on the renamed `dossiers` table

4. Notes
   - Existing data is preserved — rename is non-destructive
   - dossiers.id is of type text, so dossier_id matches
   - documents.dossier_id allows linking knowledge-base files to specific dossiers
*/

-- 1. Rename table (already done if re-running)
ALTER TABLE IF EXISTS practices RENAME TO dossiers;

-- 2. Add dossier_id to documents (text to match dossiers.id type)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'dossier_id'
  ) THEN
    ALTER TABLE documents ADD COLUMN dossier_id text REFERENCES dossiers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_dossier_id ON documents(dossier_id);

-- 3. Recreate RLS policies on the renamed table
ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view practices" ON dossiers;
DROP POLICY IF EXISTS "Authenticated can insert practices" ON dossiers;
DROP POLICY IF EXISTS "practices_update_authenticated" ON dossiers;
DROP POLICY IF EXISTS "practices_delete_admin" ON dossiers;

DROP POLICY IF EXISTS "Authenticated can view dossiers" ON dossiers;
CREATE POLICY "Authenticated can view dossiers"
  ON dossiers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert dossiers" ON dossiers;
CREATE POLICY "Authenticated can insert dossiers"
  ON dossiers FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "dossiers_update_authenticated" ON dossiers;
CREATE POLICY "dossiers_update_authenticated"
  ON dossiers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "dossiers_delete_admin" ON dossiers;
CREATE POLICY "dossiers_delete_admin"
  ON dossiers FOR DELETE TO authenticated USING (true);
