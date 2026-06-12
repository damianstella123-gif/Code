DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Demo anon can view events') THEN
    CREATE POLICY "Demo anon can view events" ON events FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Demo anon can insert events') THEN
    CREATE POLICY "Demo anon can insert events" ON events FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Demo anon can update events') THEN
    CREATE POLICY "Demo anon can update events" ON events FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'Demo anon can delete events') THEN
    CREATE POLICY "Demo anon can delete events" ON events FOR DELETE TO anon USING (true);
  END IF;
END $$;
