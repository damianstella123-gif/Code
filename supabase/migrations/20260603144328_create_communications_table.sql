/*
  # SIMMETRIA HUB — Tabella communications

  Step 6 dell'integrazione Supabase: crea la tabella `communications` per il
  modulo Comunicazioni.

  1. Nuovi tipi enumerati
     - `communication_status`: sent | draft | archived
     - `communication_priority`: alta | media | bassa
     - `communication_channel`: interno | evento | task | crm | amministrativo | fornitore

  2. Nuova tabella
     - `communications`
       - Colonne richieste: id, event_id, sender, recipient, subject, content,
         status, created_at, updated_at
       - Colonne aggiuntive necessarie alla UI esistente:
         recipients (text[]) — lista completa destinatari
         task_id (text)     — collegamento task opzionale
         priority (enum)
         channel (enum)
         sent_at (timestamptz) — data invio mostrata in UI (campo `data`)
         read_by (text[]) — id user che hanno letto
         attachments (text[]) — nomi allegati

  3. Sicurezza (RLS)
     - RLS abilitato
     - Policy SELECT/INSERT/UPDATE/DELETE per `authenticated`
     - Policy SELECT/INSERT/UPDATE/DELETE temporanee per `anon` (fase demo)

  4. Trigger
     - `set_updated_at` aggiorna `updated_at` su ogni UPDATE

  5. Note importanti
     1. La FK su `events(id)` ha ON DELETE SET NULL: il messaggio sopravvive
        all'eliminazione dell'evento collegato
     2. `recipient` (singolare) memorizza il primo destinatario per
        soddisfare la richiesta della specifica; `recipients` (text[])
        contiene la lista completa usata dalla UI
     3. Indici su event_id, sender, status, channel per query veloci
*/

-- 1) Tipi enumerati
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'communication_status') THEN
    CREATE TYPE communication_status AS ENUM ('sent', 'draft', 'archived');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'communication_priority') THEN
    CREATE TYPE communication_priority AS ENUM ('alta', 'media', 'bassa');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'communication_channel') THEN
    CREATE TYPE communication_channel AS ENUM (
      'interno', 'evento', 'task', 'crm', 'amministrativo', 'fornitore'
    );
  END IF;
END $$;

-- 2) Tabella communications
CREATE TABLE IF NOT EXISTS communications (
  id text PRIMARY KEY,
  event_id text REFERENCES events(id) ON DELETE SET NULL,
  sender text NOT NULL DEFAULT '',
  recipient text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  status communication_status NOT NULL DEFAULT 'sent',

  -- extra UI
  recipients text[] NOT NULL DEFAULT '{}',
  task_id text,
  priority communication_priority NOT NULL DEFAULT 'media',
  channel communication_channel NOT NULL DEFAULT 'interno',
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_by text[] NOT NULL DEFAULT '{}',
  attachments text[] NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Indici
CREATE INDEX IF NOT EXISTS idx_communications_event_id ON communications(event_id);
CREATE INDEX IF NOT EXISTS idx_communications_sender ON communications(sender);
CREATE INDEX IF NOT EXISTS idx_communications_status ON communications(status);
CREATE INDEX IF NOT EXISTS idx_communications_channel ON communications(channel);
CREATE INDEX IF NOT EXISTS idx_communications_sent_at ON communications(sent_at);

-- 4) RLS
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communications' AND policyname = 'Authenticated can view communications') THEN
    CREATE POLICY "Authenticated can view communications" ON communications FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communications' AND policyname = 'Authenticated can insert communications') THEN
    CREATE POLICY "Authenticated can insert communications" ON communications FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communications' AND policyname = 'Authenticated can update communications') THEN
    CREATE POLICY "Authenticated can update communications" ON communications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communications' AND policyname = 'Authenticated can delete communications') THEN
    CREATE POLICY "Authenticated can delete communications" ON communications FOR DELETE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communications' AND policyname = 'Demo anon can view communications') THEN
    CREATE POLICY "Demo anon can view communications" ON communications FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communications' AND policyname = 'Demo anon can insert communications') THEN
    CREATE POLICY "Demo anon can insert communications" ON communications FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communications' AND policyname = 'Demo anon can update communications') THEN
    CREATE POLICY "Demo anon can update communications" ON communications FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communications' AND policyname = 'Demo anon can delete communications') THEN
    CREATE POLICY "Demo anon can delete communications" ON communications FOR DELETE TO anon USING (true);
  END IF;
END $$;

-- 5) Trigger updated_at
DROP TRIGGER IF EXISTS trg_communications_updated_at ON communications;
CREATE TRIGGER trg_communications_updated_at
  BEFORE UPDATE ON communications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
