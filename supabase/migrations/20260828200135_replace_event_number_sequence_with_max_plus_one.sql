/*
# Replace sequence-based event numbering with MAX+1 logic

## Problem
The current `assign_event_number()` trigger uses `nextval('events_event_number_seq')` which
only ever increments. When a mistakenly-created event is deleted, its number is permanently
lost, causing gaps in the numbering.

## Solution
Replace with `COALESCE(MAX(event_number), 0) + 1` computed from existing rows. This means:
- Archived events keep their numbers (they still exist in the table).
- Deleted events free their numbers (the row is gone, so MAX doesn't see it).
- Numbering stays continuous based on real events.

## Race Safety
Uses `pg_advisory_xact_lock(hashtext('event_number_assign'))` — a transaction-scoped
advisory lock. If two INSERTs fire concurrently, the second one waits until the first
commits (making the new row visible to MAX), then gets the correct next number.
The lock is automatically released at transaction end — no cleanup needed.

## Important Notes
1. Does NOT renumber existing events.
2. Does NOT drop the old sequence (harmless to keep; avoids data-safety concerns).
3. Handles duplicate event_numbers gracefully — MAX finds the highest regardless of dupes.
4. Title auto-formatting (#NNN) is preserved for events with empty titles.
*/

CREATE OR REPLACE FUNCTION public.assign_event_number()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
  formatted text;
BEGIN
  IF NEW.event_number IS NULL THEN
    -- Advisory lock prevents concurrent inserts from computing the same MAX
    PERFORM pg_advisory_xact_lock(hashtext('event_number_assign'));

    SELECT COALESCE(MAX(event_number), 0) + 1 INTO next_num FROM events;
    NEW.event_number := next_num;

    formatted := '#' || lpad(next_num::text, GREATEST(3, length(next_num::text)), '0');

    IF NEW.title IS NULL OR trim(NEW.title) = '' THEN
      NEW.title := formatted;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
