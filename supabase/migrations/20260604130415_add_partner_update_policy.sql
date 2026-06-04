/*
  # Add Partner management policy for profiles

  1. Security Changes
    - Add policy allowing Partner role to update any profile
    - Enables direct profile updates from authenticated Partner users
    - The edge function (service_role) already bypasses RLS,
      but this provides a fallback for direct client calls

  2. Notes
    - Partner can update any profile (role, is_active, names)
    - Non-partner users can still only update their own profile
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
    AND polname = 'Partner can update any profile'
  ) THEN
    CREATE POLICY "Partner can update any profile"
      ON profiles
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
END $$;
