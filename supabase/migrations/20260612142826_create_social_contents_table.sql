CREATE TABLE IF NOT EXISTS social_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  channel text NOT NULL DEFAULT 'instagram_post',
  event_id text REFERENCES events(id) ON DELETE SET NULL,
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  creative_project_id uuid REFERENCES creative_projects(id) ON DELETE SET NULL,
  responsible_id text,
  copy text DEFAULT '',
  publish_date date,
  status text NOT NULL DEFAULT 'idea',
  notes text DEFAULT '',
  asset_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE social_contents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_social_contents" ON social_contents;
CREATE POLICY "anon_select_social_contents" ON social_contents FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_social_contents" ON social_contents;
CREATE POLICY "anon_insert_social_contents" ON social_contents FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_social_contents" ON social_contents;
CREATE POLICY "anon_update_social_contents" ON social_contents FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_social_contents" ON social_contents;
CREATE POLICY "anon_delete_social_contents" ON social_contents FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_social_contents_event ON social_contents(event_id);
CREATE INDEX IF NOT EXISTS idx_social_contents_channel ON social_contents(channel);
CREATE INDEX IF NOT EXISTS idx_social_contents_status ON social_contents(status);
