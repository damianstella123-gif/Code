/*
  # SIMMETRIA HUB — Tabella tasks

  Step 3 dell'integrazione Supabase: crea la tabella `tasks` collegata
  alla tabella `events` (gia migrata in Step 2).

  1. Nuovi tipi enumerati
     - `task_priority`: alta | media | bassa
     - `task_status`: da_fare | in_corso | completato

  2. Nuova tabella
     - `tasks`
       - `id` (text, PK) — id testuale (es. "tsk_001") per compatibilita
         con i dati mock degli altri moduli
       - `event_id` (text, FK -> events.id, nullable) — collegamento evento
       - `title` (text) — titolo del task (mappato da `titolo`)
       - `description` (text)
       - `assigned_to` (text) — id user dell'assegnatario
       - `priority` (task_priority, default 'media')
       - `status` (task_status, default 'da_fare')
       - `due_date` (date) — data di scadenza
       - `created_at`, `updated_at` (timestamptz)

  3. Sicurezza (RLS)
     - RLS abilitato
     - Policy SELECT/INSERT/UPDATE/DELETE per `authenticated`
     - Policy SELECT/INSERT/UPDATE/DELETE temporanee per `anon`
       (fase demo: la UI di login non e ancora migrata)
     - In Step successivi le policy verranno raffinate per ruolo

  4. Trigger
     - `set_updated_at` aggiorna automaticamente `updated_at` su ogni UPDATE

  5. Note importanti
     1. La FK su `events` ha ON DELETE SET NULL: se un evento viene
        eliminato il task non viene perso ma diventa "task generico"
     2. Tutti i campi hanno default sicuri
     3. Indici su event_id, status, priority, due_date per query veloci
*/

-- 1) Tipi enumerati
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM ('alta', 'media', 'bassa');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('da_fare', 'in_corso', 'completato');
  END IF;
END $$;

-- 2) Tabella tasks
CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  event_id text REFERENCES events(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  assigned_to text NOT NULL DEFAULT '',
  priority task_priority NOT NULL DEFAULT 'media',
  status task_status NOT NULL DEFAULT 'da_fare',
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Indici utili
CREATE INDEX IF NOT EXISTS idx_tasks_event_id ON tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- 4) RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Authenticated
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tasks' AND policyname = 'Authenticated can view tasks'
  ) THEN
    CREATE POLICY "Authenticated can view tasks"
      ON tasks FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tasks' AND policyname = 'Authenticated can insert tasks'
  ) THEN
    CREATE POLICY "Authenticated can insert tasks"
      ON tasks FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tasks' AND policyname = 'Authenticated can update tasks'
  ) THEN
    CREATE POLICY "Authenticated can update tasks"
      ON tasks FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tasks' AND policyname = 'Authenticated can delete tasks'
  ) THEN
    CREATE POLICY "Authenticated can delete tasks"
      ON tasks FOR DELETE
      TO authenticated
      USING (true);
  END IF;

  -- Anon (fase demo)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tasks' AND policyname = 'Demo anon can view tasks'
  ) THEN
    CREATE POLICY "Demo anon can view tasks"
      ON tasks FOR SELECT
      TO anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tasks' AND policyname = 'Demo anon can insert tasks'
  ) THEN
    CREATE POLICY "Demo anon can insert tasks"
      ON tasks FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tasks' AND policyname = 'Demo anon can update tasks'
  ) THEN
    CREATE POLICY "Demo anon can update tasks"
      ON tasks FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tasks' AND policyname = 'Demo anon can delete tasks'
  ) THEN
    CREATE POLICY "Demo anon can delete tasks"
      ON tasks FOR DELETE
      TO anon
      USING (true);
  END IF;
END $$;

-- 5) Trigger updated_at
DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
