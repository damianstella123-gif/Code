/*
  # Add Partner full access policies

  1. Security Changes
    - Add policy for Partner to SELECT all notifications (admin oversight)
    - Add policy for Partner to INSERT any profile (creating users directly)
    - Add policy for Partner to DELETE profiles (if needed in future)

  2. Notes
    - Partner = Super Admin, must bypass all restrictions
    - Other users retain their existing row-level restrictions
*/

DO $$
BEGIN
  -- Partner can read all notifications
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.notifications'::regclass
    AND polname = 'Partner can view all notifications'
  ) THEN
    CREATE POLICY "Partner can view all notifications"
      ON notifications
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.role = 'Partner'
        )
      );
  END IF;

  -- Partner can update any notification
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.notifications'::regclass
    AND polname = 'Partner can update all notifications'
  ) THEN
    CREATE POLICY "Partner can update all notifications"
      ON notifications
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.role = 'Partner'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.role = 'Partner'
        )
      );
  END IF;

  -- Partner can insert profiles for new users
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
    AND polname = 'Partner can insert any profile'
  ) THEN
    CREATE POLICY "Partner can insert any profile"
      ON profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.role = 'Partner'
        )
      );
  END IF;

  -- Partner can delete profiles
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
    AND polname = 'Partner can delete any profile'
  ) THEN
    CREATE POLICY "Partner can delete any profile"
      ON profiles
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.role = 'Partner'
        )
      );
  END IF;
END $$;
