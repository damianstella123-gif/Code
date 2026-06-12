CREATE TABLE IF NOT EXISTS client_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'bozza',
  pptx_url text,
  pdf_presentation_url text,
  xlsx_url text,
  pdf_budget_url text,
  notes text DEFAULT '',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE client_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_client_packages" ON client_packages;
CREATE POLICY "anon_select_client_packages" ON client_packages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_client_packages" ON client_packages;
CREATE POLICY "anon_insert_client_packages" ON client_packages FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_client_packages" ON client_packages;
CREATE POLICY "anon_update_client_packages" ON client_packages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_client_packages" ON client_packages;
CREATE POLICY "anon_delete_client_packages" ON client_packages FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_client_packages_event ON client_packages(event_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_client ON client_packages(client_id);
CREATE INDEX IF NOT EXISTS idx_client_packages_status ON client_packages(status);
