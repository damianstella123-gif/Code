/*
# Add onboarding tracking columns to profiles

1. Modified Tables
   - `profiles`: added `onboarding_completed` (boolean, default false) and `onboarding_step` (integer, default 0)

2. Changes
   - onboarding_completed: tracks whether the user has finished the guided onboarding flow
   - onboarding_step: tracks the last completed step (0-4) for resuming interrupted onboarding

3. Security
   - No RLS changes (existing policies on profiles remain)
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'onboarding_completed') THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'onboarding_step') THEN
    ALTER TABLE profiles ADD COLUMN onboarding_step integer NOT NULL DEFAULT 0;
  END IF;
END $$;
