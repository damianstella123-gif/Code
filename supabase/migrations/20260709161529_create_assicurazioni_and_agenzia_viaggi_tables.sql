/*
# Create event_assicurazioni_details and event_agenzia_viaggi_details tables

1. New Tables
   - `event_assicurazioni_details` — Insurance details for event suppliers
   - `event_agenzia_viaggi_details` — Travel agency details for event suppliers

2. Security
   - RLS enabled on both tables with authenticated CRUD policies.
*/

CREATE TABLE IF NOT EXISTS event_assicurazioni_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text REFERENCES events(id) ON DELETE CASCADE,
  supplier_id uuid,
  compagnia text,
  numero_polizza text,
  tipo_copertura text,
  massimale numeric,
  data_inizio_copertura date,
  data_fine_copertura date,
  quantita integer DEFAULT 1,
  venduto_unitario numeric,
  venduto_totale numeric,
  costo_unitario numeric,
  costo_totale numeric,
  note_operative text,
  aliquota_iva_venduto text DEFAULT '22',
  iva_inclusa_venduto boolean DEFAULT false,
  aliquota_iva_costo text DEFAULT '22',
  iva_inclusa_costo boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE event_assicurazioni_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_assicurazioni" ON event_assicurazioni_details;
CREATE POLICY "auth_select_assicurazioni" ON event_assicurazioni_details FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_assicurazioni" ON event_assicurazioni_details;
CREATE POLICY "auth_insert_assicurazioni" ON event_assicurazioni_details FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_assicurazioni" ON event_assicurazioni_details;
CREATE POLICY "auth_update_assicurazioni" ON event_assicurazioni_details FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_assicurazioni" ON event_assicurazioni_details;
CREATE POLICY "auth_delete_assicurazioni" ON event_assicurazioni_details FOR DELETE
  TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS event_agenzia_viaggi_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text REFERENCES events(id) ON DELETE CASCADE,
  supplier_id uuid,
  tipo_servizio text,
  numero_pratica text,
  destinazione text,
  data_partenza date,
  data_rientro date,
  num_passeggeri integer,
  quantita integer DEFAULT 1,
  venduto_unitario numeric,
  venduto_totale numeric,
  costo_unitario numeric,
  costo_totale numeric,
  note_operative text,
  aliquota_iva_venduto text DEFAULT '22',
  iva_inclusa_venduto boolean DEFAULT false,
  aliquota_iva_costo text DEFAULT '22',
  iva_inclusa_costo boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE event_agenzia_viaggi_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_agenzia_viaggi" ON event_agenzia_viaggi_details;
CREATE POLICY "auth_select_agenzia_viaggi" ON event_agenzia_viaggi_details FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_agenzia_viaggi" ON event_agenzia_viaggi_details;
CREATE POLICY "auth_insert_agenzia_viaggi" ON event_agenzia_viaggi_details FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_agenzia_viaggi" ON event_agenzia_viaggi_details;
CREATE POLICY "auth_update_agenzia_viaggi" ON event_agenzia_viaggi_details FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_agenzia_viaggi" ON event_agenzia_viaggi_details;
CREATE POLICY "auth_delete_agenzia_viaggi" ON event_agenzia_viaggi_details FOR DELETE
  TO authenticated USING (true);
