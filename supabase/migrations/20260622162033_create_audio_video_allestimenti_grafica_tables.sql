-- ═══════════════════════════════════════════════════════════════
-- 1. EVENT AUDIO VIDEO DETAILS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_audio_video_details (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  tipologia_servizio text NOT NULL DEFAULT '',
  quantita integer NOT NULL DEFAULT 1,
  data_montaggio date,
  ora_montaggio time,
  data_prove date,
  ora_prove time,
  data_evento date,
  ora_evento time,
  data_smontaggio date,
  ora_smontaggio time,
  materiale text NOT NULL DEFAULT '',
  tecnici text NOT NULL DEFAULT '',
  note_operative text NOT NULL DEFAULT '',
  venduto_unitario numeric,
  venduto_totale numeric,
  costo_unitario numeric,
  costo_totale numeric,
  aliquota_iva_venduto text NOT NULL DEFAULT '22',
  iva_inclusa_venduto boolean NOT NULL DEFAULT false,
  aliquota_iva_costo text NOT NULL DEFAULT '22',
  iva_inclusa_costo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_audio_video_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_event_audio_video_details" ON event_audio_video_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_event_audio_video_details" ON event_audio_video_details FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_event_audio_video_details" ON event_audio_video_details FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_event_audio_video_details" ON event_audio_video_details FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 2. EVENT ALLESTIMENTI DETAILS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_allestimenti_details (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  descrizione text NOT NULL DEFAULT '',
  quantita integer NOT NULL DEFAULT 1,
  area_utilizzo text NOT NULL DEFAULT '',
  data_montaggio date,
  ora_montaggio time,
  data_smontaggio date,
  ora_smontaggio time,
  note_operative text NOT NULL DEFAULT '',
  venduto_unitario numeric,
  venduto_totale numeric,
  costo_unitario numeric,
  costo_totale numeric,
  aliquota_iva_venduto text NOT NULL DEFAULT '22',
  iva_inclusa_venduto boolean NOT NULL DEFAULT false,
  aliquota_iva_costo text NOT NULL DEFAULT '22',
  iva_inclusa_costo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_allestimenti_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_event_allestimenti_details" ON event_allestimenti_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_event_allestimenti_details" ON event_allestimenti_details FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_event_allestimenti_details" ON event_allestimenti_details FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_event_allestimenti_details" ON event_allestimenti_details FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 3. EVENT GRAFICA STAMPA DETAILS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_grafica_stampa_details (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  tipo_materiale text NOT NULL DEFAULT '',
  quantita integer NOT NULL DEFAULT 1,
  formato text NOT NULL DEFAULT '',
  data_consegna date,
  note_operative text NOT NULL DEFAULT '',
  venduto_unitario numeric,
  venduto_totale numeric,
  costo_unitario numeric,
  costo_totale numeric,
  aliquota_iva_venduto text NOT NULL DEFAULT '22',
  iva_inclusa_venduto boolean NOT NULL DEFAULT false,
  aliquota_iva_costo text NOT NULL DEFAULT '22',
  iva_inclusa_costo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_grafica_stampa_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_event_grafica_stampa_details" ON event_grafica_stampa_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_event_grafica_stampa_details" ON event_grafica_stampa_details FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_event_grafica_stampa_details" ON event_grafica_stampa_details FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_event_grafica_stampa_details" ON event_grafica_stampa_details FOR DELETE TO authenticated USING (true);