/*
  # SIMMETRIA HUB — Tabelle suppliers e budgets

  Step 5 dell'integrazione Supabase: crea due tabelle indipendenti.
  - `suppliers` per il modulo Fornitori
  - `budgets` per il tab "Uscite" (Economico) del modulo Amministrazione

  1. Nuovi tipi enumerati
     - `supplier_status`: attivo | inattivo
     - `supplier_contract_status`: attivo | in_scadenza | scaduto | in_rinnovo | sospeso
     - `budget_status`: pagato | in_attesa | scaduto | annullato
     - `budget_payment_method`: bonifico | carta | contanti | assegno

  2. Nuove tabelle
     - `suppliers`
       - Colonne richieste: id, name, category, contact_name, email, phone,
         rating, notes, created_at, updated_at
       - Colonne aggiuntive necessarie alla UI esistente (per non
         modificarne il layout): contact_phone, location, website, vat_number,
         status, contract_status, contract_expiry, services (text[]),
         event_ids (text[]), avg_cost_per_event, min_cost, max_cost,
         documents (jsonb), reviews (jsonb)

     - `budgets`
       - Colonne richieste: id, event_id, item, category, estimated_cost,
         actual_cost, status, created_at, updated_at
       - Colonne aggiuntive necessarie alla UI Uscite: supplier_id (FK),
         due_date, payment_date, payment_method, invoice_id, notes

  3. Sicurezza (RLS)
     - RLS abilitato su entrambe le tabelle
     - Policy SELECT/INSERT/UPDATE/DELETE per `authenticated`
     - Policy SELECT/INSERT/UPDATE/DELETE temporanee per `anon` (fase demo)

  4. Trigger
     - `set_updated_at` aggiorna `updated_at` su ogni UPDATE

  5. Note importanti
     1. FK su `events(id)` e `suppliers(id)` con ON DELETE SET NULL
        (i record budget non vengono persi se l'evento o il fornitore
        viene eliminato, diventano "orfani")
     2. Tutti i campi obbligatori hanno default sicuri
     3. Indici su event_id, status, category per query veloci
*/

-- 1) Tipi enumerati
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supplier_status') THEN
    CREATE TYPE supplier_status AS ENUM ('attivo', 'inattivo');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supplier_contract_status') THEN
    CREATE TYPE supplier_contract_status AS ENUM (
      'attivo', 'in_scadenza', 'scaduto', 'in_rinnovo', 'sospeso'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'budget_status') THEN
    CREATE TYPE budget_status AS ENUM ('pagato', 'in_attesa', 'scaduto', 'annullato');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'budget_payment_method') THEN
    CREATE TYPE budget_payment_method AS ENUM ('bonifico', 'carta', 'contanti', 'assegno');
  END IF;
END $$;

-- 2) Tabella suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  rating numeric(3, 1) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',

  -- extra UI
  contact_phone text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  vat_number text NOT NULL DEFAULT '',
  status supplier_status NOT NULL DEFAULT 'attivo',
  contract_status supplier_contract_status NOT NULL DEFAULT 'attivo',
  contract_expiry date,
  services text[] NOT NULL DEFAULT '{}',
  event_ids text[] NOT NULL DEFAULT '{}',
  avg_cost_per_event numeric(14, 2) NOT NULL DEFAULT 0,
  min_cost numeric(14, 2) NOT NULL DEFAULT 0,
  max_cost numeric(14, 2) NOT NULL DEFAULT 0,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviews jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Tabella budgets
CREATE TABLE IF NOT EXISTS budgets (
  id text PRIMARY KEY,
  event_id text REFERENCES events(id) ON DELETE SET NULL,
  item text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  estimated_cost numeric(14, 2) NOT NULL DEFAULT 0,
  actual_cost numeric(14, 2) NOT NULL DEFAULT 0,
  status budget_status NOT NULL DEFAULT 'in_attesa',

  -- extra UI
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_date date,
  payment_method budget_payment_method NOT NULL DEFAULT 'bonifico',
  invoice_id text,
  notes text NOT NULL DEFAULT '',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Indici
CREATE INDEX IF NOT EXISTS idx_suppliers_category ON suppliers(category);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_contract_status ON suppliers(contract_status);

CREATE INDEX IF NOT EXISTS idx_budgets_event_id ON budgets(event_id);
CREATE INDEX IF NOT EXISTS idx_budgets_supplier_id ON budgets(supplier_id);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets(status);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
CREATE INDEX IF NOT EXISTS idx_budgets_due_date ON budgets(due_date);

-- 5) RLS suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'Authenticated can view suppliers') THEN
    CREATE POLICY "Authenticated can view suppliers" ON suppliers FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'Authenticated can insert suppliers') THEN
    CREATE POLICY "Authenticated can insert suppliers" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'Authenticated can update suppliers') THEN
    CREATE POLICY "Authenticated can update suppliers" ON suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'Authenticated can delete suppliers') THEN
    CREATE POLICY "Authenticated can delete suppliers" ON suppliers FOR DELETE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'Demo anon can view suppliers') THEN
    CREATE POLICY "Demo anon can view suppliers" ON suppliers FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'Demo anon can insert suppliers') THEN
    CREATE POLICY "Demo anon can insert suppliers" ON suppliers FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'Demo anon can update suppliers') THEN
    CREATE POLICY "Demo anon can update suppliers" ON suppliers FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'suppliers' AND policyname = 'Demo anon can delete suppliers') THEN
    CREATE POLICY "Demo anon can delete suppliers" ON suppliers FOR DELETE TO anon USING (true);
  END IF;
END $$;

-- 6) RLS budgets
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'budgets' AND policyname = 'Authenticated can view budgets') THEN
    CREATE POLICY "Authenticated can view budgets" ON budgets FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'budgets' AND policyname = 'Authenticated can insert budgets') THEN
    CREATE POLICY "Authenticated can insert budgets" ON budgets FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'budgets' AND policyname = 'Authenticated can update budgets') THEN
    CREATE POLICY "Authenticated can update budgets" ON budgets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'budgets' AND policyname = 'Authenticated can delete budgets') THEN
    CREATE POLICY "Authenticated can delete budgets" ON budgets FOR DELETE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'budgets' AND policyname = 'Demo anon can view budgets') THEN
    CREATE POLICY "Demo anon can view budgets" ON budgets FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'budgets' AND policyname = 'Demo anon can insert budgets') THEN
    CREATE POLICY "Demo anon can insert budgets" ON budgets FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'budgets' AND policyname = 'Demo anon can update budgets') THEN
    CREATE POLICY "Demo anon can update budgets" ON budgets FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'budgets' AND policyname = 'Demo anon can delete budgets') THEN
    CREATE POLICY "Demo anon can delete budgets" ON budgets FOR DELETE TO anon USING (true);
  END IF;
END $$;

-- 7) Trigger updated_at
DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_budgets_updated_at ON budgets;
CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
