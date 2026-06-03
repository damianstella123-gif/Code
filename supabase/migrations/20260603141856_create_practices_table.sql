/*
  # SIMMETRIA HUB — Tabella practices

  Step 4 dell'integrazione Supabase: crea la tabella `practices` collegata
  alla tabella `events`. Sostituisce lo storage localStorage usato dal
  modulo Pratiche.

  1. Nuovi tipi enumerati
     - `practice_category`: contratto | preventivo | permesso | assicurazione | fattura | documento
     - `practice_priority`: alta | media | bassa
     - `practice_status`: da_aprire | in_lavorazione | in_attesa | completata

  2. Nuova tabella
     - `practices`
       - `id` (text, PK) — id testuale (es. "prt_001") per compatibilita
         con i dati mock degli altri moduli
       - `event_id` (text, FK -> events.id, nullable) — collegamento evento
       - `title` (text) — titolo (mappato da `titolo`)
       - `description` (text) — descrizione lunga (campo UI esistente)
       - `category` (practice_category) — categoria pratica
       - `responsible` (text) — id user del responsabile
       - `priority` (practice_priority, default 'media')
       - `status` (practice_status, default 'da_aprire')
       - `due_date` (date) — scadenza
       - `notes` (text) — note libere
       - `amount` (numeric, nullable) — importo (campo UI esistente)
       - `counterparty` (text) — controparte/fornitore (campo UI esistente)
       - `created_at`, `updated_at` (timestamptz)

  3. Sicurezza (RLS)
     - RLS abilitato
     - Policy SELECT/INSERT/UPDATE/DELETE per `authenticated`
     - Policy SELECT/INSERT/UPDATE/DELETE temporanee per `anon`
       (fase demo: la UI di login non e ancora migrata)

  4. Trigger
     - `set_updated_at` aggiorna automaticamente `updated_at` su ogni UPDATE

  5. Note importanti
     1. La FK su `events` ha ON DELETE SET NULL: se un evento viene
        eliminato la pratica non viene persa ma diventa "pratica generica"
     2. Tutti i campi obbligatori hanno default sicuri
     3. Indici su event_id, status, category, priority, due_date, responsible
        per query veloci da parte di filtri e KPI
*/

-- 1) Tipi enumerati
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'practice_category') THEN
    CREATE TYPE practice_category AS ENUM (
      'contratto', 'preventivo', 'permesso', 'assicurazione', 'fattura', 'documento'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'practice_priority') THEN
    CREATE TYPE practice_priority AS ENUM ('alta', 'media', 'bassa');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'practice_status') THEN
    CREATE TYPE practice_status AS ENUM (
      'da_aprire', 'in_lavorazione', 'in_attesa', 'completata'
    );
  END IF;
END $$;

-- 2) Tabella practices
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

-- 3) Indici utili
CREATE INDEX IF NOT EXISTS idx_practices_event_id ON practices(event_id);
CREATE INDEX IF NOT EXISTS idx_practices_status ON practices(status);
CREATE INDEX IF NOT EXISTS idx_practices_category ON practices(category);
CREATE INDEX IF NOT EXISTS idx_practices_priority ON practices(priority);
CREATE INDEX IF NOT EXISTS idx_practices_due_date ON practices(due_date);
CREATE INDEX IF NOT EXISTS idx_practices_responsible ON practices(responsible);

-- 4) RLS
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Authenticated
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'practices' AND policyname = 'Authenticated can view practices'
  ) THEN
    CREATE POLICY "Authenticated can view practices"
      ON practices FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'practices' AND policyname = 'Authenticated can insert practices'
  ) THEN
    CREATE POLICY "Authenticated can insert practices"
      ON practices FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'practices' AND policyname = 'Authenticated can update practices'
  ) THEN
    CREATE POLICY "Authenticated can update practices"
      ON practices FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'practices' AND policyname = 'Authenticated can delete practices'
  ) THEN
    CREATE POLICY "Authenticated can delete practices"
      ON practices FOR DELETE
      TO authenticated
      USING (true);
  END IF;

  -- Anon (fase demo)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'practices' AND policyname = 'Demo anon can view practices'
  ) THEN
    CREATE POLICY "Demo anon can view practices"
      ON practices FOR SELECT
      TO anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'practices' AND policyname = 'Demo anon can insert practices'
  ) THEN
    CREATE POLICY "Demo anon can insert practices"
      ON practices FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'practices' AND policyname = 'Demo anon can update practices'
  ) THEN
    CREATE POLICY "Demo anon can update practices"
      ON practices FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'practices' AND policyname = 'Demo anon can delete practices'
  ) THEN
    CREATE POLICY "Demo anon can delete practices"
      ON practices FOR DELETE
      TO anon
      USING (true);
  END IF;
END $$;

-- 5) Trigger updated_at (riusa la funzione public.set_updated_at gia presente)
DROP TRIGGER IF EXISTS trg_practices_updated_at ON practices;
CREATE TRIGGER trg_practices_updated_at
  BEFORE UPDATE ON practices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
