CREATE TABLE IF NOT EXISTS public.event_hotel_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  supplier_id text NOT NULL,
  tipo text NOT NULL,
  titolo text NOT NULL DEFAULT '',
  data date,
  ora_inizio time,
  ora_fine time,
  check_in_date date,
  check_in_time time,
  check_out_date date,
  check_out_time time,
  luogo text NOT NULL DEFAULT '',
  quantita int,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_hotel_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_event_hotel_details" ON event_hotel_details FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_event_hotel_details" ON event_hotel_details FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_event_hotel_details" ON event_hotel_details FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_event_hotel_details" ON event_hotel_details FOR DELETE
  TO authenticated USING (true);

CREATE INDEX idx_ehd_event_supplier ON event_hotel_details(event_id, supplier_id);
CREATE INDEX idx_ehd_sort ON event_hotel_details(data, ora_inizio);