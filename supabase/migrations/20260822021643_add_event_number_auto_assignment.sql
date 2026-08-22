/*
# Add automatic event numbering

1. New Columns
   - `events.event_number` (integer, unique, not null for new rows)
     Holds the raw sequential number (1, 2, 3...).
     Existing rows get their number extracted from the current title (#NNN).

2. New Sequence
   - `events_event_number_seq`
     Starts after the current maximum event_number to avoid conflicts.

3. New Trigger Function
   - `assign_event_number()`
     On INSERT: if event_number is NULL, pulls the next value from the sequence
     and sets the title to '#' + zero-padded number (minimum 3 digits).
     This is race-condition safe because sequences are atomic in PostgreSQL.

4. Trigger
   - `trg_assign_event_number` BEFORE INSERT on events

5. Backfill
   - Existing events with titles matching #NNN get their event_number populated.
   - The sequence is advanced past the current max so new events continue from there.

6. Important Notes
   - Does NOT modify existing event titles.
   - Does NOT break existing events: event_number is nullable for legacy rows
     that don't follow the #NNN pattern.
   - New events always get an auto-assigned number.
*/

-- Step 1: Add column (nullable to allow backfill)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'event_number'
  ) THEN
    ALTER TABLE events ADD COLUMN event_number integer;
  END IF;
END $$;

-- Step 2: Backfill event_number from existing titles that match #NNN
UPDATE events
SET event_number = CAST(substring(title FROM '^#0*(\d+)$') AS integer)
WHERE title ~ '^#\d{3,}$'
  AND event_number IS NULL;

-- Step 3: Create or replace the sequence, starting after current max
DO $$
DECLARE
  max_num integer;
BEGIN
  SELECT COALESCE(MAX(event_number), 0) INTO max_num FROM events;

  -- Drop and recreate to set correct start value
  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'events_event_number_seq') THEN
    EXECUTE 'DROP SEQUENCE events_event_number_seq';
  END IF;

  EXECUTE format('CREATE SEQUENCE events_event_number_seq START WITH %s INCREMENT BY 1 NO CYCLE', max_num + 1);
END $$;

-- Step 4: Create or replace the trigger function
CREATE OR REPLACE FUNCTION assign_event_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  next_num integer;
  formatted text;
BEGIN
  -- Only auto-assign if event_number was not explicitly provided
  IF NEW.event_number IS NULL THEN
    next_num := nextval('events_event_number_seq');
    NEW.event_number := next_num;

    -- Format title as #NNN (minimum 3 digits)
    formatted := '#' || lpad(next_num::text, GREATEST(3, length(next_num::text)), '0');

    -- Only set title if it's empty/null (don't overwrite user-provided titles)
    IF NEW.title IS NULL OR trim(NEW.title) = '' THEN
      NEW.title := formatted;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 5: Create the trigger
DROP TRIGGER IF EXISTS trg_assign_event_number ON events;
CREATE TRIGGER trg_assign_event_number
  BEFORE INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION assign_event_number();

-- Step 6: Add a unique index on event_number (allowing nulls for legacy rows without numbers)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_number_unique
  ON events (event_number)
  WHERE event_number IS NOT NULL;
