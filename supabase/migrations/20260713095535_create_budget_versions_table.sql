/*
# Create budget_versions table and link detail tables

1. New Tables
  - `budget_versions`
    - `id` (uuid, primary key)
    - `event_id` (text, not null, FK to events)
    - `nome` (text, not null)
    - `tipo` (text, 'preventivo' or 'consuntivo')
    - `stato` (text, 'bozza', 'inviato_cliente', 'approvato', 'rifiutato')
    - `note` (text, nullable)
    - `created_by` (uuid, FK to profiles)
    - `approvato_at` (timestamptz, nullable)
    - `created_at` (timestamptz, default now)

2. Modified Tables (add budget_version_id column)
  - event_supplier_services, event_hotel_details, event_restaurant_details,
    event_experience_details, event_catering_details, event_staff_interno_details,
    event_staff_esterno_details, event_varie_details, event_audio_video_details,
    event_allestimenti_details, event_grafica_stampa_details

3. Security
  - Enable RLS on budget_versions
  - Full CRUD for authenticated users

4. Data Migration
  - Creates default version for events with existing detail rows
  - Links existing orphan rows to that default version
*/

CREATE TABLE IF NOT EXISTS budget_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'preventivo' CHECK (tipo IN ('preventivo','consuntivo')),
  stato text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','inviato_cliente','approvato','rifiutato')),
  note text,
  created_by uuid REFERENCES profiles(id),
  approvato_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE budget_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bv_select" ON budget_versions;
CREATE POLICY "bv_select" ON budget_versions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "bv_insert" ON budget_versions;
CREATE POLICY "bv_insert" ON budget_versions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "bv_update" ON budget_versions;
CREATE POLICY "bv_update" ON budget_versions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bv_delete" ON budget_versions;
CREATE POLICY "bv_delete" ON budget_versions FOR DELETE
  TO authenticated USING (true);

-- Add budget_version_id FK to all detail tables
ALTER TABLE event_supplier_services ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES budget_versions(id) ON DELETE CASCADE;
ALTER TABLE event_hotel_details ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES budget_versions(id) ON DELETE CASCADE;
ALTER TABLE event_restaurant_details ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES budget_versions(id) ON DELETE CASCADE;
ALTER TABLE event_experience_details ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES budget_versions(id) ON DELETE CASCADE;
ALTER TABLE event_catering_details ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES budget_versions(id) ON DELETE CASCADE;
ALTER TABLE event_staff_interno_details ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES budget_versions(id) ON DELETE CASCADE;
ALTER TABLE event_staff_esterno_details ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES budget_versions(id) ON DELETE CASCADE;
ALTER TABLE event_varie_details ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES budget_versions(id) ON DELETE CASCADE;
ALTER TABLE event_audio_video_details ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES budget_versions(id) ON DELETE CASCADE;
ALTER TABLE event_allestimenti_details ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES budget_versions(id) ON DELETE CASCADE;
ALTER TABLE event_grafica_stampa_details ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES budget_versions(id) ON DELETE CASCADE;

-- Create default version for events with existing data
INSERT INTO budget_versions (event_id, nome, tipo, stato)
SELECT DISTINCT event_id, 'Preventivo principale', 'preventivo', 'bozza'
FROM event_hotel_details
WHERE event_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO budget_versions (event_id, nome, tipo, stato)
SELECT DISTINCT event_id, 'Preventivo principale', 'preventivo', 'bozza'
FROM event_supplier_services
WHERE event_id IS NOT NULL
  AND event_id NOT IN (SELECT event_id FROM budget_versions)
ON CONFLICT DO NOTHING;

-- Link existing orphan rows to their default version
UPDATE event_hotel_details h SET budget_version_id = bv.id FROM budget_versions bv WHERE bv.event_id = h.event_id AND h.budget_version_id IS NULL;
UPDATE event_restaurant_details h SET budget_version_id = bv.id FROM budget_versions bv WHERE bv.event_id = h.event_id AND h.budget_version_id IS NULL;
UPDATE event_experience_details h SET budget_version_id = bv.id FROM budget_versions bv WHERE bv.event_id = h.event_id AND h.budget_version_id IS NULL;
UPDATE event_catering_details h SET budget_version_id = bv.id FROM budget_versions bv WHERE bv.event_id = h.event_id AND h.budget_version_id IS NULL;
UPDATE event_staff_interno_details h SET budget_version_id = bv.id FROM budget_versions bv WHERE bv.event_id = h.event_id AND h.budget_version_id IS NULL;
UPDATE event_staff_esterno_details h SET budget_version_id = bv.id FROM budget_versions bv WHERE bv.event_id = h.event_id AND h.budget_version_id IS NULL;
UPDATE event_varie_details h SET budget_version_id = bv.id FROM budget_versions bv WHERE bv.event_id = h.event_id AND h.budget_version_id IS NULL;
UPDATE event_audio_video_details h SET budget_version_id = bv.id FROM budget_versions bv WHERE bv.event_id = h.event_id AND h.budget_version_id IS NULL;
UPDATE event_allestimenti_details h SET budget_version_id = bv.id FROM budget_versions bv WHERE bv.event_id = h.event_id AND h.budget_version_id IS NULL;
UPDATE event_grafica_stampa_details h SET budget_version_id = bv.id FROM budget_versions bv WHERE bv.event_id = h.event_id AND h.budget_version_id IS NULL;
UPDATE event_supplier_services h SET budget_version_id = bv.id FROM budget_versions bv WHERE bv.event_id = h.event_id AND h.budget_version_id IS NULL;