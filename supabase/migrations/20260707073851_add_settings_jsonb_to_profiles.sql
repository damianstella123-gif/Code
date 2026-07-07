/*
# Add settings jsonb column to profiles

## Summary
Adds a `settings` column to the existing `profiles` table to persist user
preferences (theme, notifications, fly config, dashboard layout) in the
database instead of localStorage. This enables cross-device/cross-browser
settings sync.

## Modified Tables
- `profiles`
  - `settings` (jsonb, default '{}') — stores the user's app settings object

## Important Notes
1. Column is added conditionally (IF NOT EXISTS via DO block) for idempotency.
2. Default is an empty JSON object so existing profiles are unaffected.
3. No new RLS policies needed — profiles already has self+admin UPDATE policy.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'settings'
  ) THEN
    ALTER TABLE profiles ADD COLUMN settings jsonb NOT NULL DEFAULT '{}';
  END IF;
END $$;
