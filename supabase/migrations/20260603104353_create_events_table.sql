/*
  # SIMMETRIA HUB — Tabella eventi

  Step 2 dell'integrazione Supabase: crea la tabella `events` con tutti i
  campi necessari al modulo Eventi e alle policy di accesso.

  1. Nuovo tipo enumerato
     - `event_status`: bozza | pianificazione | in_corso | completato

  2. Nuova tabella
     - `events`
       - `id` (text, PK) — usiamo l'id testuale (es. "evt_001") per
         compatibilita con i dati demo gia presenti in altri moduli
         (task, comunicazioni, workflow) che usano gli id come riferimento
       - `title` (text) — nome dell'evento (mappato da `nome`)
       - `description` (text) — descrizione estesa
       - `client` (text) — id cliente (es. "cli_001")
       - `location` (text) — luogo dell'evento
       - `start_date` (date) — data inizio
       - `end_date` (date) — data fine
       - `status` (event_status, default 'bozza')
       - `budget` (numeric, default 0)
       - `attendees` (integer, default 0) — numero partecipanti
       - `project_manager_id` (text) — id user del responsabile
         (text invece di uuid per compatibilita con gli id mock "usr_001")
       - `team_member_ids` (text[]) — id membri team
       - `created_at`, `updated_at` (timestamptz)

  3. Sicurezza (RLS)
     - RLS abilitato
     - Policy SELECT: tutti gli utenti autenticati possono vedere gli eventi
     - Policy INSERT: tutti gli autenticati possono creare eventi
     - Policy UPDATE: tutti gli autenticati possono aggiornare eventi
     - Policy DELETE: tutti gli autenticati possono eliminare eventi
     - In Step successivi questi permessi verranno raffinati per ruolo

  4. Trigger
     - `set_updated_at` aggiorna automaticamente `updated_at` su ogni UPDATE

  5. Note importanti
     1. La tabella e additiva: nessuna tabella esistente viene modificata
     2. Mock data degli altri moduli rimane invariato
     3. Gli id sono `text` per riusare gli id descrittivi gia presenti
        nei mock degli altri moduli senza dover convertire tutto adesso
*/

-- 1) Tipo enumerato per lo stato evento
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE event_status AS ENUM ('bozza', 'pianificazione', 'in_corso', 'completato');
  END IF;
END $$;

-- 2) Tabella events
CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  client text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL DEFAULT CURRENT_DATE,
  status event_status NOT NULL DEFAULT 'bozza',
  budget numeric(12,2) NOT NULL DEFAULT 0,
  attendees integer NOT NULL DEFAULT 0,
  project_manager_id text NOT NULL DEFAULT '',
  team_member_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Indici utili
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_pm ON events(project_manager_id);

-- 4) RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'Authenticated can view events'
  ) THEN
    CREATE POLICY "Authenticated can view events"
      ON events FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'Authenticated can insert events'
  ) THEN
    CREATE POLICY "Authenticated can insert events"
      ON events FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'Authenticated can update events'
  ) THEN
    CREATE POLICY "Authenticated can update events"
      ON events FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'Authenticated can delete events'
  ) THEN
    CREATE POLICY "Authenticated can delete events"
      ON events FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- 5) Trigger updated_at
DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
