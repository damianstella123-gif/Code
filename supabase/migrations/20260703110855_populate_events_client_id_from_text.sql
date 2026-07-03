/*
# Populate events.client_id from text client field

1. Purpose
   - The events table already has a `client_id` column (FK to clients.id) added previously,
     but it was never populated by the application.
   - This migration backfills `client_id` by matching the text `client` field against
     `clients.name` (case-insensitive).
   - Also creates a trigger to auto-populate `client_id` on future inserts/updates
     when only the text `client` field is provided.

2. Changes
   - UPDATE existing events rows: set client_id by matching client text to clients.name
   - CREATE function `sync_event_client_id()` to auto-resolve client_id from text
   - CREATE trigger on events to call this function on INSERT/UPDATE

3. Security
   - No policy changes (events table RLS already configured)

4. Notes
   - Safe to re-run (uses idempotent patterns)
   - Does NOT drop or modify any columns
   - The trigger only sets client_id when it is NULL and client text is non-empty
*/

-- Backfill: match events.client (text) to clients.name (case-insensitive)
UPDATE events e
SET client_id = c.id
FROM clients c
WHERE e.client_id IS NULL
  AND e.client <> ''
  AND LOWER(TRIM(e.client)) = LOWER(TRIM(c.name));

-- Also try matching by client ID directly (some seed data uses cli_XXX IDs)
UPDATE events e
SET client_id = c.id
FROM clients c
WHERE e.client_id IS NULL
  AND e.client <> ''
  AND e.client = c.id;

-- Function to auto-sync client_id from text on insert/update
CREATE OR REPLACE FUNCTION public.sync_event_client_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only resolve if client_id is not already set and client text is provided
  IF NEW.client_id IS NULL AND NEW.client IS NOT NULL AND NEW.client <> '' THEN
    SELECT id INTO NEW.client_id
    FROM clients
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(NEW.client))
    LIMIT 1;

    -- Fallback: try direct ID match
    IF NEW.client_id IS NULL THEN
      SELECT id INTO NEW.client_id
      FROM clients
      WHERE id = NEW.client
      LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_sync_event_client_id ON events;
CREATE TRIGGER trg_sync_event_client_id
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_event_client_id();
