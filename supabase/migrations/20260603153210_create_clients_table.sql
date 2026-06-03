/*
  # Create clients table for CRM

  1. New Tables
    - `clients`
      - `id` (text, primary key) — stable string id used across modules
      - `name` (text, not null) — display name of the client/company
      - `company` (text) — company / sector / division label
      - `email` (text) — main contact email
      - `phone` (text) — main contact phone
      - `notes` (text) — free-form notes
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now()) — auto-updated via trigger

  2. Security
    - Enable RLS on `clients` table.
    - Policies for authenticated users (full access) for the demo CRM.
    - Anon access enabled for the demo (read/write) consistent with the other modules.

  3. Triggers
    - `set_updated_at` trigger refreshes `updated_at` on UPDATE.

  4. Seed data
    - Twelve existing demo clients are inserted so the CRM does not look empty.
    - `name` ← demo `nome`, `company` ← demo `settore`, `phone` ← demo `telefono`,
      `notes` ← demo `note`. Other rich attributes (avatar, fatturato, ecc.)
      remain in the TypeScript layer with sensible defaults for new clients.
*/

CREATE TABLE IF NOT EXISTS clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  company text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clients_name_idx ON clients (name);
CREATE INDEX IF NOT EXISTS clients_company_idx ON clients (company);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='Authenticated can read clients') THEN
    CREATE POLICY "Authenticated can read clients" ON clients FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='Authenticated can insert clients') THEN
    CREATE POLICY "Authenticated can insert clients" ON clients FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='Authenticated can update clients') THEN
    CREATE POLICY "Authenticated can update clients" ON clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='Authenticated can delete clients') THEN
    CREATE POLICY "Authenticated can delete clients" ON clients FOR DELETE TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='Anon demo can read clients') THEN
    CREATE POLICY "Anon demo can read clients" ON clients FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='Anon demo can insert clients') THEN
    CREATE POLICY "Anon demo can insert clients" ON clients FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='Anon demo can update clients') THEN
    CREATE POLICY "Anon demo can update clients" ON clients FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='Anon demo can delete clients') THEN
    CREATE POLICY "Anon demo can delete clients" ON clients FOR DELETE TO anon USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clients_set_updated_at ON clients;
CREATE TRIGGER clients_set_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO clients (id, name, company, email, phone, notes) VALUES
  ('cli_001','TechnoCorp Industries','Tecnologia','events@technocorp.com','+39 02 6789 0123','Cliente storico, rinnovo annuale. Interesse per nuovi format digitali.'),
  ('cli_002','VisionGames Entertainment','Gaming','pr@visiongames.com','+39 06 5432 1098','Espansione eventi live per il 2027 in discussione.'),
  ('cli_003','Cucina d''Italia Group','Food & Beverage','marketing@cucinaditalia.it','+39 055 8765 4321','Proposta per festival 2027 in fase di review interna.'),
  ('cli_004','EcoGreen Solutions','Sostenibilita','partnership@ecogreen.eu','+39 02 3456 7890','Focus su eventi eco-sostenibili. Molto sensibili al tema ambientale.'),
  ('cli_005','Fondazione Hope','Non-Profit','eventi@fondazionehope.org','+39 02 9876 5432','Gala annuale di beneficenza. Alta visibilita mediatica. Referenze eccellenti.'),
  ('cli_006','PharmaLife','Farmaceutica','congressi@pharmalife.com','+39 06 2345 6789','Congressi medici annuali. Massima riservatezza richiesta. Budget elevato.'),
  ('cli_007','LuxeAuto Milano','Automotive','press@luxeauto.it','+39 02 4567 8901','Lanci prodotto esclusivi. Interesse per format esperienziali.'),
  ('cli_008','Fashion Week Italia','Moda','events@fashionweekitalia.com','+39 02 5678 9012','Partnership pluriennale. Massimo cliente per fatturato. Sfilate e backstage.'),
  ('cli_009','SportEvents Pro','Sport','org@sporteventspro.it','+39 041 1234 5678','Interessato a organizzazione tornei e gala sportivi. Da seguire.'),
  ('cli_010','Art&Culture Foundation','Arte','info@artculturefoundation.org','+39 06 6789 0123','Contatto iniziale tramite evento. Disponibile a un meeting esplorativo.'),
  ('cli_011','GlobalTrade Expo','Fiere','fairs@globaltrade.it','+39 02 7890 1234','Ha scelto competitor per motivi di prezzo. Riaprire nel Q3 2027.'),
  ('cli_012','MediaGroup Italia','Media','events@mediagroup.it','+39 06 3456 7890','Budget tagliato per ristrutturazione interna. Da ricontattare fine anno.')
ON CONFLICT (id) DO NOTHING;
