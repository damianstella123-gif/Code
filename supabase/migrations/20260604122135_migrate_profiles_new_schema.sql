/*
  # Migrate profiles table to new schema

  1. New Columns
    - `first_name` (text, NOT NULL, default '')
    - `last_name` (text, NOT NULL, default '')
    - `role` (text, NOT NULL, default 'Junior Event Assistant')
    - `is_active` (boolean, NOT NULL, default true)

  2. Data Migration
    - Split existing `nome` into first_name and last_name
    - Copy `ruolo` into role (as text for flexibility)
    - Copy `attivo` into is_active

  3. Trigger Update
    - Update the on_auth_user_created trigger to populate new columns

  4. Notes
    - Old columns (nome, ruolo, reparto, stato, attivo) are kept to avoid breaking existing functionality
    - New code will use the new columns exclusively
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN first_name text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_name text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role text NOT NULL DEFAULT 'Junior Event Assistant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Migrate existing data
UPDATE profiles
SET
  first_name = COALESCE(split_part(nome, ' ', 1), ''),
  last_name = COALESCE(
    CASE
      WHEN position(' ' in nome) > 0 THEN substring(nome from position(' ' in nome) + 1)
      ELSE ''
    END, ''),
  role = COALESCE(ruolo::text, 'Junior Event Assistant'),
  is_active = COALESCE(attivo, true)
WHERE first_name = '' OR first_name IS NULL;

-- Update the auth trigger to populate new columns on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, first_name, last_name, ruolo, role, reparto, is_active, attivo)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(new.raw_user_meta_data->>'first_name', ''),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'Junior Event Assistant')::app_role,
    COALESCE(new.raw_user_meta_data->>'role', 'Junior Event Assistant'),
    COALESCE(new.raw_user_meta_data->>'reparto', ''),
    true,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
