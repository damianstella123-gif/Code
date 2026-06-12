DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supplier_status') THEN
    CREATE TYPE supplier_status AS ENUM ('attivo', 'inattivo');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supplier_contract_status') THEN
    CREATE TYPE supplier_contract_status AS ENUM ('attivo', 'in_scadenza', 'scaduto', 'in_rinnovo', 'sospeso');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'budget_status') THEN
    CREATE TYPE budget_status AS ENUM ('pagato', 'in_attesa', 'scaduto', 'annullato');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'budget_payment_method') THEN
    CREATE TYPE budget_payment_method AS ENUM ('bonifico', 'carta', 'contanti', 'assegno');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  rating numeric(3, 1) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS budgets (
  id text PRIMARY KEY,
  event_id text REFERENCES events(id) ON DELETE SET NULL,
  item text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  estimated_cost numeric(14, 2) NOT NULL DEFAULT 0,
  actual_cost numeric(14, 2) NOT NULL DEFAULT 0,
  status budget_status NOT NULL DEFAULT 'in_attesa',
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_date date,
  payment_method budget_payment_method NOT NULL DEFAULT 'bonifico',
  invoice_id text,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_category ON suppliers(category);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_contract_status ON suppliers(contract_status);
CREATE INDEX IF NOT EXISTS idx_budgets_event_id ON budgets(event_id);
CREATE INDEX IF NOT EXISTS idx_budgets_supplier_id ON budgets(supplier_id);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets(status);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
CREATE INDEX IF NOT EXISTS idx_budgets_due_date ON budgets(due_date);

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

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_budgets_updated_at ON budgets;
CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
