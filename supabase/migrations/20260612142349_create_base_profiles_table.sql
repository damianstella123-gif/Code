/*
  # Create base profiles table

  This is the prerequisite table that all other migrations build upon.
  It creates:
  1. The app_role enum type
  2. The profiles table with core columns (id, email, nome, ruolo, attivo, avatar_url, created_at, updated_at)
  3. RLS enabled (policies added in subsequent migrations)
*/

-- app_role enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM (
      'Partner',
      'Project Manager',
      'Event Coordinator',
      'Event Assistant',
      'Junior Event Assistant',
      'Amministrazione',
      'Production Manager',
      'Digital Strategist'
    );
  END IF;
END $$;

-- profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  nome text NOT NULL DEFAULT '',
  ruolo app_role NOT NULL DEFAULT 'Junior Event Assistant',
  attivo boolean NOT NULL DEFAULT true,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
