DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
    AND polname = 'Partner can update any profile'
  ) THEN
    CREATE POLICY "Partner can update any profile"
      ON profiles FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Partner'))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Partner'));
  END IF;
END $$;
