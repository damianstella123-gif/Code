-- ═══════════════════════════════════════════════════════════════════════
-- 1. EVENT EXPERIENCE DETAILS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_experience_details (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  nome_attivita text NOT NULL DEFAULT '',
  data date,
  ora_inizio time,
  ora_fine time,
  pax integer,
  durata_minuti integer,
  location text NOT NULL DEFAULT '',
  note_operative text NOT NULL DEFAULT '',
  venduto_unitario numeric,
  venduto_totale numeric,
  costo_unitario numeric,
  costo_totale numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_experience_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_event_experience_details" ON event_experience_details
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_event_experience_details" ON event_experience_details
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_event_experience_details" ON event_experience_details
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_event_experience_details" ON event_experience_details
  FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. EVENT CATERING DETAILS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_catering_details (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  tipologia text NOT NULL DEFAULT '',
  data date,
  ora time,
  pax integer,
  note text NOT NULL DEFAULT '',
  venduto_per_persona numeric,
  venduto_totale numeric,
  costo_per_persona numeric,
  costo_totale numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_catering_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_event_catering_details" ON event_catering_details
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_event_catering_details" ON event_catering_details
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_event_catering_details" ON event_catering_details
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_event_catering_details" ON event_catering_details
  FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. EVENT STAFF INTERNO (SIMMETRIA) DETAILS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_staff_interno_details (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  profile_id text,
  risorsa text NOT NULL DEFAULT '',
  ruolo text NOT NULL DEFAULT '',
  data date,
  ora_inizio time,
  ora_fine time,
  note text NOT NULL DEFAULT '',
  venduto_totale numeric,
  costo_giornaliero numeric,
  costo_totale numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_staff_interno_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_event_staff_interno_details" ON event_staff_interno_details
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_event_staff_interno_details" ON event_staff_interno_details
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_event_staff_interno_details" ON event_staff_interno_details
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_event_staff_interno_details" ON event_staff_interno_details
  FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. EVENT STAFF ESTERNO DETAILS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_staff_esterno_details (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  ruolo text NOT NULL DEFAULT '',
  quantita integer NOT NULL DEFAULT 1,
  data date,
  ora_inizio time,
  ora_fine time,
  lingue text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  venduto_unitario numeric,
  venduto_totale numeric,
  costo_unitario numeric,
  costo_totale numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_staff_esterno_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_event_staff_esterno_details" ON event_staff_esterno_details
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_event_staff_esterno_details" ON event_staff_esterno_details
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_event_staff_esterno_details" ON event_staff_esterno_details
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_event_staff_esterno_details" ON event_staff_esterno_details
  FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. EVENT VARIE DETAILS
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_varie_details (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  descrizione text NOT NULL DEFAULT '',
  quantita integer NOT NULL DEFAULT 1,
  note text NOT NULL DEFAULT '',
  venduto_unitario numeric,
  venduto_totale numeric,
  costo_unitario numeric,
  costo_totale numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_varie_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_event_varie_details" ON event_varie_details
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_event_varie_details" ON event_varie_details
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_event_varie_details" ON event_varie_details
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_event_varie_details" ON event_varie_details
  FOR DELETE TO authenticated USING (true);