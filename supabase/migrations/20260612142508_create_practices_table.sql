DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'practice_category') THEN
    CREATE TYPE practice_category AS ENUM ('contratto', 'preventivo', 'permesso', 'assicurazione', 'fattura', 'documento');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'practice_priority') THEN
    CREATE TYPE practice_priority AS ENUM ('alta', 'media', 'bassa');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'practice_status') THEN
    CREATE TYPE practice_status AS ENUM ('da_aprire', 'in_lavorazione', 'in_attesa', 'completata');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS practices (
  id text PRIMARY KEY,
  event_id text REFERENCES events(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category practice_category NOT NULL DEFAULT 'documento',
  responsible text NOT NULL DEFAULT '',
  priority practice_priority NOT NULL DEFAULT 'media',
  status practice_status NOT NULL DEFAULT 'da_aprire',
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text NOT NULL DEFAULT '',
  amount numeric(14, 2),
  counterparty text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practices_event_id ON practices(event_id);
CREATE INDEX IF NOT EXISTS idx_practices_status ON practices(status);
CREATE INDEX IF NOT EXISTS idx_practices_category ON practices(category);
CREATE INDEX IF NOT EXISTS idx_practices_priority ON practices(priority);
CREATE INDEX IF NOT EXISTS idx_practices_due_date ON practices(due_date);
CREATE INDEX IF NOT EXISTS idx_practices_responsible ON practices(responsible);

ALTER TABLE practices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'practices' AND policyname = 'Authenticated can view practices') THEN
    CREATE POLICY "Authenticated can view practices" ON practices FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'practices' AND policyname = 'Authenticated can insert practices') THEN
    CREATE POLICY "Authenticated can insert practices" ON practices FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'practices' AND policyname = 'Authenticated can update practices') THEN
    CREATE POLICY "Authenticated can update practices" ON practices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'practices' AND policyname = 'Authenticated can delete practices') THEN
    CREATE POLICY "Authenticated can delete practices" ON practices FOR DELETE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'practices' AND policyname = 'Demo anon can view practices') THEN
    CREATE POLICY "Demo anon can view practices" ON practices FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'practices' AND policyname = 'Demo anon can insert practices') THEN
    CREATE POLICY "Demo anon can insert practices" ON practices FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'practices' AND policyname = 'Demo anon can update practices') THEN
    CREATE POLICY "Demo anon can update practices" ON practices FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'practices' AND policyname = 'Demo anon can delete practices') THEN
    CREATE POLICY "Demo anon can delete practices" ON practices FOR DELETE TO anon USING (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_practices_updated_at ON practices;
CREATE TRIGGER trg_practices_updated_at
  BEFORE UPDATE ON practices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
