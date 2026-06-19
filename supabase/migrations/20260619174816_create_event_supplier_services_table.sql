CREATE TABLE IF NOT EXISTS public.event_supplier_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  supplier_id text NOT NULL,
  titolo text NOT NULL,
  categoria text NOT NULL DEFAULT 'altro',
  data date,
  ora_inizio time,
  ora_fine time,
  luogo text NOT NULL DEFAULT '',
  partenza text NOT NULL DEFAULT '',
  destinazione text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_supplier_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_event_supplier_services" ON event_supplier_services FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_event_supplier_services" ON event_supplier_services FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_event_supplier_services" ON event_supplier_services FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_event_supplier_services" ON event_supplier_services FOR DELETE
  TO authenticated USING (true);

CREATE INDEX idx_ess_event_id ON event_supplier_services(event_id);
CREATE INDEX idx_ess_supplier_id ON event_supplier_services(supplier_id);
CREATE INDEX idx_ess_event_supplier ON event_supplier_services(event_id, supplier_id);
CREATE INDEX idx_ess_sort ON event_supplier_services(data, ora_inizio);