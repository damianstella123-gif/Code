/*
# Create event_green_data table

1. New Tables
   - `event_green_data`
     - `id` (uuid, primary key)
     - `event_id` (text, unique, references events, cascade delete)
     - `pax` (int) - number of participants
     - `citta_provenienza` (text) - main city of origin
     - `mezzo_prevalente` (text) - prevalent transport means
     - `distanza_km` (numeric) - estimated average distance km
     - `supplier_scores` (jsonb) - carbon scores per supplier {supplier_id: score}
     - `note` (text) - optional notes
     - `updated_at` (timestamptz)
     - `updated_by` (uuid, references profiles)

2. Security
   - RLS enabled
   - All authenticated users can read/insert/update/delete
*/

CREATE TABLE IF NOT EXISTS event_green_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  pax int,
  citta_provenienza text,
  mezzo_prevalente text DEFAULT 'misto',
  distanza_km numeric DEFAULT 0,
  supplier_scores jsonb DEFAULT '{}',
  note text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

ALTER TABLE event_green_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_green_data" ON event_green_data;
CREATE POLICY "authenticated_select_green_data" ON event_green_data FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_green_data" ON event_green_data;
CREATE POLICY "authenticated_insert_green_data" ON event_green_data FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_green_data" ON event_green_data;
CREATE POLICY "authenticated_update_green_data" ON event_green_data FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_green_data" ON event_green_data;
CREATE POLICY "authenticated_delete_green_data" ON event_green_data FOR DELETE
  TO authenticated USING (true);