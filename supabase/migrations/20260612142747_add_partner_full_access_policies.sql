DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.notifications'::regclass
    AND polname = 'Partner can view all notifications'
  ) THEN
    CREATE POLICY "Partner can view all notifications"
      ON notifications FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Partner'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.notifications'::regclass
    AND polname = 'Partner can update all notifications'
  ) THEN
    CREATE POLICY "Partner can update all notifications"
      ON notifications FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Partner'))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Partner'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
    AND polname = 'Partner can insert any profile'
  ) THEN
    CREATE POLICY "Partner can insert any profile"
      ON profiles FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Partner'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
    AND polname = 'Partner can delete any profile'
  ) THEN
    CREATE POLICY "Partner can delete any profile"
      ON profiles FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Partner'));
  END IF;
END $$;
