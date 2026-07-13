/*
# Add archive columns to events table

1. Modified Tables
   - `events`
     - `archiviato` (boolean, default false) — whether the event is archived
     - `archiviato_at` (timestamptz, nullable) — when the event was archived
     - `archiviato_da` (uuid, nullable, FK to profiles) — who archived the event

2. Important Notes
   - These columns allow soft-archival of completed events.
   - Archived events are hidden from the main list and shown in a dedicated Archivio page.
   - No data is lost; archival is reversible.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='archiviato') THEN
    ALTER TABLE events ADD COLUMN archiviato boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='archiviato_at') THEN
    ALTER TABLE events ADD COLUMN archiviato_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='archiviato_da') THEN
    ALTER TABLE events ADD COLUMN archiviato_da uuid REFERENCES profiles(id);
  END IF;
END $$;
