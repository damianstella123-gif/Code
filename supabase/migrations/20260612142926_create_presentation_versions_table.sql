CREATE TABLE IF NOT EXISTS presentation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text REFERENCES events(id) ON DELETE SET NULL,
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  template_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'bozza',
  notes text DEFAULT '',
  file_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE presentation_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_presentation_versions" ON presentation_versions;
CREATE POLICY "anon_select_presentation_versions" ON presentation_versions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_presentation_versions" ON presentation_versions;
CREATE POLICY "anon_insert_presentation_versions" ON presentation_versions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_presentation_versions" ON presentation_versions;
CREATE POLICY "anon_update_presentation_versions" ON presentation_versions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_presentation_versions" ON presentation_versions;
CREATE POLICY "anon_delete_presentation_versions" ON presentation_versions FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_presentation_versions_event ON presentation_versions(event_id);
CREATE INDEX IF NOT EXISTS idx_presentation_versions_client ON presentation_versions(client_id);
