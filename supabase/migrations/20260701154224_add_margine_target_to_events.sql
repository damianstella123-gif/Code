/*
# Add margine_target to events table

1. Modified Tables
   - `events`
     - `margine_target` (numeric, default 25) — target margin percentage for the event, used by the Budget dashboard to flag underperforming categories

2. Notes
   - Default of 25% represents a typical agency margin target
   - The Budget tab will compare actual margin against this target to generate alerts
   - No data loss — additive column with a sensible default
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'margine_target'
  ) THEN
    ALTER TABLE events ADD COLUMN margine_target numeric NOT NULL DEFAULT 25;
  END IF;
END $$;
