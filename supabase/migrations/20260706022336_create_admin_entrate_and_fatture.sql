/*
# Create admin_entrate and admin_fatture tables

Migrates financial tracking from localStorage to persistent Supabase storage.

1. New Tables
   - `admin_entrate` — income/payment records
     - `id` (uuid, primary key)
     - `cliente_id` (text, not null) — client identifier
     - `evento_id` (text, nullable) — linked event
     - `importo` (numeric, not null) — amount
     - `stato` (text, not null) — payment status: pagato/in_attesa/scaduto/annullato
     - `data_prevista` (date, not null) — expected payment date
     - `data_pagamento` (date, nullable) — actual payment date
     - `metodo_pagamento` (text, not null) — payment method: bonifico/carta/contanti/assegno
     - `note` (text, default empty) — notes
     - `fattura_id` (text, nullable) — linked invoice
     - `created_by` (uuid, not null) — owning user
     - `created_at` / `updated_at` (timestamptz)

   - `admin_fatture` — invoice records
     - `id` (uuid, primary key)
     - `numero` (text, not null) — invoice number
     - `tipo` (text, not null) — entrata/uscita
     - `soggetto` (text, not null) — client/supplier name
     - `soggetto_id` (text, not null) — client/supplier identifier
     - `evento_id` (text, nullable) — linked event
     - `importo` (numeric, not null) — total amount
     - `imponibile` (numeric, not null) — taxable base
     - `iva` (numeric, not null) — VAT amount
     - `stato` (text, not null) — invoice status: emessa/pagata/scaduta/bozza/annullata
     - `data_emissione` (date, not null) — issue date
     - `scadenza` (date, not null) — due date
     - `note` (text, default empty) — notes
     - `created_by` (uuid, not null) — owning user
     - `created_at` / `updated_at` (timestamptz)

2. Security
   - RLS enabled on both tables
   - Owner-scoped CRUD policies for authenticated users

3. Realtime
   - Both tables added to supabase_realtime publication

4. Indexes
   - On evento_id and created_by for both tables
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- admin_entrate
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS admin_entrate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id text NOT NULL,
  evento_id text,
  importo numeric NOT NULL DEFAULT 0,
  stato text NOT NULL DEFAULT 'in_attesa',
  data_prevista date NOT NULL DEFAULT CURRENT_DATE,
  data_pagamento date,
  metodo_pagamento text NOT NULL DEFAULT 'bonifico',
  note text NOT NULL DEFAULT '',
  fattura_id text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_entrate ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_entrate" ON admin_entrate;
CREATE POLICY "select_own_entrate" ON admin_entrate FOR SELECT
  TO authenticated USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "insert_own_entrate" ON admin_entrate;
CREATE POLICY "insert_own_entrate" ON admin_entrate FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "update_own_entrate" ON admin_entrate;
CREATE POLICY "update_own_entrate" ON admin_entrate FOR UPDATE
  TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "delete_own_entrate" ON admin_entrate;
CREATE POLICY "delete_own_entrate" ON admin_entrate FOR DELETE
  TO authenticated USING (auth.uid() = created_by);

CREATE INDEX IF NOT EXISTS idx_admin_entrate_evento ON admin_entrate(evento_id);
CREATE INDEX IF NOT EXISTS idx_admin_entrate_created_by ON admin_entrate(created_by);

-- ══════════════════════════════════════════════════════════════════════════════
-- admin_fatture
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS admin_fatture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL,
  tipo text NOT NULL DEFAULT 'entrata',
  soggetto text NOT NULL,
  soggetto_id text NOT NULL,
  evento_id text,
  importo numeric NOT NULL DEFAULT 0,
  imponibile numeric NOT NULL DEFAULT 0,
  iva numeric NOT NULL DEFAULT 0,
  stato text NOT NULL DEFAULT 'bozza',
  data_emissione date NOT NULL DEFAULT CURRENT_DATE,
  scadenza date NOT NULL DEFAULT CURRENT_DATE,
  note text NOT NULL DEFAULT '',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_fatture ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_fatture" ON admin_fatture;
CREATE POLICY "select_own_fatture" ON admin_fatture FOR SELECT
  TO authenticated USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "insert_own_fatture" ON admin_fatture;
CREATE POLICY "insert_own_fatture" ON admin_fatture FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "update_own_fatture" ON admin_fatture;
CREATE POLICY "update_own_fatture" ON admin_fatture FOR UPDATE
  TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "delete_own_fatture" ON admin_fatture;
CREATE POLICY "delete_own_fatture" ON admin_fatture FOR DELETE
  TO authenticated USING (auth.uid() = created_by);

CREATE INDEX IF NOT EXISTS idx_admin_fatture_evento ON admin_fatture(evento_id);
CREATE INDEX IF NOT EXISTS idx_admin_fatture_created_by ON admin_fatture(created_by);

-- ══════════════════════════════════════════════════════════════════════════════
-- Realtime
-- ══════════════════════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE admin_entrate;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_fatture;
