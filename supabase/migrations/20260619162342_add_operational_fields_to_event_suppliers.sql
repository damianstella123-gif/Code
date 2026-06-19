ALTER TABLE event_suppliers
  ADD COLUMN IF NOT EXISTS service_category text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS end_time time,
  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS operational_notes text NOT NULL DEFAULT '';

-- Add UPDATE policy (was missing)
CREATE POLICY "update_event_suppliers" ON event_suppliers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);