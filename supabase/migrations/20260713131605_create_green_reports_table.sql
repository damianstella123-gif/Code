/*
# Create green_reports table for auto-generated environmental reports

1. New Tables
   - `green_reports`
     - `id` (uuid, primary key)
     - `event_id` (text, unique, references events)
     - `co2_total_kg` (numeric) - total CO2 emissions
     - `waste_kg` (numeric) - estimated waste
     - `water_liters` (numeric) - estimated water usage
     - `energy_kwh` (numeric) - estimated energy consumption
     - `renewable_pct` (numeric) - percentage renewable energy
     - `score_100` (numeric) - sustainability score 0-100
     - `recommendations` (text[]) - auto-generated recommendations
     - `generated_at` (timestamptz) - when report was generated
     - `updated_at` (timestamptz) - last update

2. Security
   - Enable RLS on `green_reports`
   - Authenticated users can read, insert, update, delete (team-shared data)

3. Notes
   - One report per event (UNIQUE on event_id)
   - Auto-calculated from event data (attendees, suppliers, duration)
   - ON DELETE CASCADE: removing an event removes its report
   - event_id is text to match events.id column type
*/

CREATE TABLE IF NOT EXISTS green_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  co2_total_kg numeric DEFAULT 0,
  waste_kg numeric DEFAULT 0,
  water_liters numeric DEFAULT 0,
  energy_kwh numeric DEFAULT 0,
  renewable_pct numeric DEFAULT 0,
  score_100 numeric DEFAULT 50,
  recommendations text[] DEFAULT '{}',
  generated_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE green_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "green_reports_select" ON green_reports;
CREATE POLICY "green_reports_select" ON green_reports FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "green_reports_insert" ON green_reports;
CREATE POLICY "green_reports_insert" ON green_reports FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "green_reports_update" ON green_reports;
CREATE POLICY "green_reports_update" ON green_reports FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "green_reports_delete" ON green_reports;
CREATE POLICY "green_reports_delete" ON green_reports FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_green_reports_event_id ON green_reports(event_id);
