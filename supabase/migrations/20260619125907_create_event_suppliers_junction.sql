CREATE TABLE IF NOT EXISTS public.event_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  supplier_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, supplier_id)
);

ALTER TABLE event_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_event_suppliers" ON event_suppliers FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_event_suppliers" ON event_suppliers FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "delete_event_suppliers" ON event_suppliers FOR DELETE
  TO authenticated USING (true);