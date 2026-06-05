/*
# Create creative_projects table

1. New Tables
  - `creative_projects`
    - `id` (uuid, primary key)
    - `title` (text, not null)
    - `type` (text, not null) - presentazione, menu_a6, menu_a5, badge, cartellonistica, invito, programma, materiale_sponsor, brochure, welcome_sign
    - `event_id` (text, nullable FK to events)
    - `client_id` (text, nullable FK to clients)
    - `responsible_id` (text, nullable)
    - `status` (text, default 'bozza') - bozza, in_lavorazione, in_revisione, approvato, completato
    - `due_date` (date)
    - `notes` (text)
    - `output_format` (text) - pptx, pdf, png, jpg
    - `file_url` (text, nullable)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

2. Security
  - Enable RLS
  - Allow anon + authenticated full CRUD (demo phase)
*/

CREATE TABLE IF NOT EXISTS creative_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL DEFAULT 'presentazione',
  event_id text REFERENCES events(id) ON DELETE SET NULL,
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  responsible_id text,
  status text NOT NULL DEFAULT 'bozza',
  due_date date,
  notes text DEFAULT '',
  output_format text DEFAULT 'pdf',
  file_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE creative_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_creative_projects" ON creative_projects;
CREATE POLICY "anon_select_creative_projects" ON creative_projects FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_creative_projects" ON creative_projects;
CREATE POLICY "anon_insert_creative_projects" ON creative_projects FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_creative_projects" ON creative_projects;
CREATE POLICY "anon_update_creative_projects" ON creative_projects FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_creative_projects" ON creative_projects;
CREATE POLICY "anon_delete_creative_projects" ON creative_projects FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_creative_projects_event ON creative_projects(event_id);
CREATE INDEX IF NOT EXISTS idx_creative_projects_client ON creative_projects(client_id);
CREATE INDEX IF NOT EXISTS idx_creative_projects_status ON creative_projects(status);
