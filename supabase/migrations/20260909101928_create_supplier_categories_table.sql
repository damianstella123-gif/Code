/*
# Create supplier_categories lookup table

1. New Tables
   - `supplier_categories`
     - `key` (text, primary key) — internal machine key
     - `label` (text) — human-readable label
     - `budget_key` (text) — budget section key
     - `budget_label` (text) — display name in budget
     - `color` (text) — hex colour for markers/legend
     - `icon` (text) — icon key for map markers
     - `sort_order` (integer) — display order
     - `attivo` (boolean) — soft-disable toggle

2. Security
   - RLS enabled. All authenticated can read; Partner only can write.

3. Seed
   - 15 rows covering all existing categories.
*/

CREATE TABLE IF NOT EXISTS supplier_categories (
  key          text PRIMARY KEY,
  label        text NOT NULL,
  budget_key   text NOT NULL,
  budget_label text NOT NULL,
  color        text NOT NULL DEFAULT '#5f666d',
  icon         text NOT NULL DEFAULT 'dot',
  sort_order   integer NOT NULL DEFAULT 0,
  attivo       boolean NOT NULL DEFAULT true
);

ALTER TABLE supplier_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sc_select" ON supplier_categories;
CREATE POLICY "sc_select" ON supplier_categories FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "sc_insert_admin" ON supplier_categories;
CREATE POLICY "sc_insert_admin" ON supplier_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND ruolo = 'Partner')
  );

DROP POLICY IF EXISTS "sc_update_admin" ON supplier_categories;
CREATE POLICY "sc_update_admin" ON supplier_categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND ruolo = 'Partner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND ruolo = 'Partner')
  );

DROP POLICY IF EXISTS "sc_delete_admin" ON supplier_categories;
CREATE POLICY "sc_delete_admin" ON supplier_categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND ruolo = 'Partner')
  );

INSERT INTO supplier_categories (key, label, budget_key, budget_label, color, icon, sort_order) VALUES
  ('hotel',          'Hotel',               'HOTEL',                 'HOTEL',                 '#e02040', 'bed',      1),
  ('transfer',       'Transfer',            'TRANSFER',              'TRANSFER',              '#2f6fbe', 'bus',      2),
  ('ristorante',     'Ristorante',          'RISTORANTE',            'RISTORANTE',            '#2f9e68', 'utensils', 3),
  ('experience',     'Location / Experience','LOCATION / EXPERIENCE','LOCATION / EXPERIENCE', '#7B3FE4', 'building', 4),
  ('catering',       'Catering',            'CATERING',              'CATERING',              '#12a594', 'chef',     5),
  ('audio_video',    'Audio Video',         'AUDIO VIDEO',           'AUDIO VIDEO',           '#c98920', 'speaker',  6),
  ('allestimenti',   'Allestimenti',        'ALLESTIMENTI',          'ALLESTIMENTI',          '#e8590c', 'sparkles', 7),
  ('staff_interno',  'Staff Simmetria',     'STAFF',                 'STAFF',                 '#0d9488', 'users',    8),
  ('staff_esterno',  'Staff Esterno',       'STAFF',                 'STAFF',                 '#0d9488', 'users',    9),
  ('grafica_stampa', 'Grafica / Stampa',    'GRAFICA',               'GRAFICA',               '#c026d3', 'gift',     10),
  ('assicurazioni',  'Assicurazioni',       'VARIE',                 'VARIE',                 '#64748b', 'shield',   11),
  ('agenzia_viaggi', 'Agenzia di Viaggi',   'VARIE',                 'VARIE',                 '#0891b2', 'plane',    12),
  ('gadget',         'Gadget',              'VARIE',                 'VARIE',                 '#c026d3', 'gift',     13),
  ('dmc',            'DMC',                 'LOCATION / EXPERIENCE', 'LOCATION / EXPERIENCE', '#475569', 'globe',    14),
  ('varie',          'Varie',               'VARIE',                 'VARIE',                 '#5f666d', 'dot',      15)
ON CONFLICT (key) DO NOTHING;
