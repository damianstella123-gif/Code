/*
# Canonicalize event_registrations as participant master

## Summary
Prepares event_registrations to serve as the single source of truth for all
event participants regardless of origin (public form, Excel import, manual entry).

## Changes
1. site_id: made NULLABLE (imports/manual entries have no registration site).
2. email: made NULLABLE (some imported participants lack email).
3. privacy_accepted: add DEFAULT false (existing behaviour unchanged; column stays NOT NULL).
4. source: new TEXT NOT NULL DEFAULT 'registration' with CHECK ('registration','import','manual').
5. Unique index: replaced idx_er_site_email (site_id, lower(email))
   with a partial unique on (event_id, lower(email)) WHERE email IS NOT NULL AND trim(email)<>''.
   This prevents duplicate emails within an event while allowing NULL/empty emails for imports.

## Preserved (unchanged)
- RLS policies (still use has_event_permission).
- submit_event_registration RPC (always supplies site_id + email).
- QR token generation + uniqueness.
- Registration statuses.
- check-in RPCs.
- All existing data (0 rows currently).
*/

-- 1. Make site_id nullable
ALTER TABLE event_registrations ALTER COLUMN site_id DROP NOT NULL;

-- 2. Make email nullable
ALTER TABLE event_registrations ALTER COLUMN email DROP NOT NULL;

-- 3. Add default to privacy_accepted
ALTER TABLE event_registrations ALTER COLUMN privacy_accepted SET DEFAULT false;

-- 4. Add source column with check constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_registrations' AND column_name = 'source'
  ) THEN
    ALTER TABLE event_registrations
      ADD COLUMN source text NOT NULL DEFAULT 'registration';
    ALTER TABLE event_registrations
      ADD CONSTRAINT event_registrations_source_check
      CHECK (source IN ('registration', 'import', 'manual'));
  END IF;
END $$;

-- 5. Replace unique index: drop old, create new partial unique
DROP INDEX IF EXISTS idx_er_site_email;

CREATE UNIQUE INDEX IF NOT EXISTS idx_er_event_email_unique
  ON event_registrations (event_id, lower(email))
  WHERE email IS NOT NULL AND trim(email) <> '';