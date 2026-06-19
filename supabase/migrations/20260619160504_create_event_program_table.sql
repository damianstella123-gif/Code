CREATE TABLE IF NOT EXISTS public.event_program (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  titolo text NOT NULL,
  categoria text NOT NULL DEFAULT 'altro',
  data date NOT NULL,
  ora_inizio time NOT NULL,
  ora_fine time,
  luogo text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_program ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_event_program" ON event_program FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_event_program" ON event_program FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_event_program" ON event_program FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_event_program" ON event_program FOR DELETE
  TO authenticated USING (true);

CREATE INDEX idx_event_program_event_id ON event_program(event_id);
CREATE INDEX idx_event_program_sort ON event_program(data, ora_inizio);