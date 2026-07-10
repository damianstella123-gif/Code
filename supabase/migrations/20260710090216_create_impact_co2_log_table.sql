/*
# Create impact_co2_log table for tracking Synergy digital CO2 savings

1. New Tables
   - `impact_co2_log`
     - `id` (uuid, primary key)
     - `event_id` (text, FK to events - for event-specific savings)
     - `user_id` (uuid, FK to auth.users - who performed the action)
     - `kg_co2_risparmiati` (numeric, not null - kg CO2 saved)
     - `fonte` (text, not null - source category: documento_digitale, comunicazione_interna, riunione_evitata)
     - `descrizione` (text - human readable description)
     - `created_at` (timestamptz)

2. Security
   - RLS enabled
   - All authenticated users can read (company-wide visibility)
   - Authenticated users can insert their own records
   - Only admins can update/delete

3. Indexes
   - Index on event_id for fast per-event lookups
*/

CREATE TABLE IF NOT EXISTS impact_co2_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text REFERENCES events(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  kg_co2_risparmiati numeric NOT NULL DEFAULT 0,
  fonte text NOT NULL DEFAULT 'documento_digitale',
  descrizione text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impact_co2_log_event_id ON impact_co2_log(event_id);

ALTER TABLE impact_co2_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_co2_log" ON impact_co2_log;
CREATE POLICY "select_co2_log" ON impact_co2_log FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_co2_log" ON impact_co2_log;
CREATE POLICY "insert_co2_log" ON impact_co2_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_co2_log_admin" ON impact_co2_log;
CREATE POLICY "update_co2_log_admin" ON impact_co2_log FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('Super Admin', 'Admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('Super Admin', 'Admin')));

DROP POLICY IF EXISTS "delete_co2_log_admin" ON impact_co2_log;
CREATE POLICY "delete_co2_log_admin" ON impact_co2_log FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('Super Admin', 'Admin')));