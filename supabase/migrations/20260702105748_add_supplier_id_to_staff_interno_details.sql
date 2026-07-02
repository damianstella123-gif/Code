/*
# Add supplier_id to event_staff_interno_details

1. Modified Tables
   - `event_staff_interno_details`
     - `supplier_id` (text, nullable) — references the supplier, consistent with all other detail tables

2. Notes
   - This column was missing from event_staff_interno_details while all other detail tables have it
   - Without this column, the insert from the frontend fails because PostgREST rejects unknown columns
   - The Budget and Program components read supplier_id from this table to identify the supplier name
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_staff_interno_details' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE event_staff_interno_details ADD COLUMN supplier_id text;
  END IF;
END $$;
