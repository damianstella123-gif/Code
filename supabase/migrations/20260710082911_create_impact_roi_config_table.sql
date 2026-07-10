/*
# Create impact_roi_config table

1. New Tables
   - `impact_roi_config`
     - `id` (uuid, primary key)
     - `role` (text, unique, not null) - the app role name
     - `costo_orario_eur` (numeric, default 0) - hourly cost in EUR
     - `ore_sett_pre_synergy` (numeric, default 0) - weekly hours pre-Synergy
     - `updated_at` (timestamptz)

2. Security
   - RLS enabled
   - Admin/Super Admin can read, insert, update, delete
   - All authenticated users can read (for display purposes)
*/

CREATE TABLE IF NOT EXISTS impact_roi_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text UNIQUE NOT NULL,
  costo_orario_eur numeric NOT NULL DEFAULT 0,
  ore_sett_pre_synergy numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE impact_roi_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_roi_config" ON impact_roi_config;
CREATE POLICY "authenticated_select_roi_config" ON impact_roi_config FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_roi_config" ON impact_roi_config;
CREATE POLICY "admin_insert_roi_config" ON impact_roi_config FOR INSERT
  TO authenticated WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('Super Admin', 'Admin')
  );

DROP POLICY IF EXISTS "admin_update_roi_config" ON impact_roi_config;
CREATE POLICY "admin_update_roi_config" ON impact_roi_config FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('Super Admin', 'Admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('Super Admin', 'Admin')
  );

DROP POLICY IF EXISTS "admin_delete_roi_config" ON impact_roi_config;
CREATE POLICY "admin_delete_roi_config" ON impact_roi_config FOR DELETE
  TO authenticated USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('Super Admin', 'Admin')
  );

-- Seed with default roles
INSERT INTO impact_roi_config (role, costo_orario_eur, ore_sett_pre_synergy)
VALUES
  ('Super Admin', 80, 45),
  ('Admin', 75, 45),
  ('Senior PM', 65, 42),
  ('Project Manager', 55, 40),
  ('Finance', 50, 38),
  ('Commerciale', 50, 38),
  ('Event Coordinator', 40, 38),
  ('Event Assistant', 30, 36),
  ('Junior Event Assistant', 25, 36),
  ('Amministrazione', 35, 38),
  ('Production Manager', 55, 40),
  ('Digital Strategist', 50, 38),
  ('User', 30, 36)
ON CONFLICT (role) DO NOTHING;