/*
  # SIMMETRIA HUB — Accesso anon agli eventi (fase demo)

  Durante la fase demo il login UI continua a usare l'auth mock locale,
  quindi le richieste verso Supabase sono fatte come `anon`.
  Aggiungiamo policy per `anon` sulla tabella events SOLO per la fase demo.
  In Step successivi quando il Login sara migrato a Supabase Auth,
  queste policy verranno rimosse e sostituite da policy strette per ruolo.

  1. Sicurezza
     - Aggiunte policy SELECT/INSERT/UPDATE/DELETE per il ruolo `anon`
     - Le policy `authenticated` rimangono attive
     - Nessun dato esistente viene toccato

  2. Note importanti
     1. TEMPORANEO: queste policy aperte servono a far funzionare il
        modulo Eventi mentre il resto della demo usa ancora mock auth.
     2. Tutti i dati sono comunque pubblici/condivisi nel modello demo.
     3. La tabella `profiles` mantiene policy strette `authenticated only`.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'Demo anon can view events'
  ) THEN
    CREATE POLICY "Demo anon can view events"
      ON events FOR SELECT
      TO anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'Demo anon can insert events'
  ) THEN
    CREATE POLICY "Demo anon can insert events"
      ON events FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'Demo anon can update events'
  ) THEN
    CREATE POLICY "Demo anon can update events"
      ON events FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events' AND policyname = 'Demo anon can delete events'
  ) THEN
    CREATE POLICY "Demo anon can delete events"
      ON events FOR DELETE
      TO anon
      USING (true);
  END IF;
END $$;
