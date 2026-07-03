/*
# Add tipologia column to event_varie_details

1. Purpose
   - Allows PM to sub-classify miscellaneous costs (assicurazioni, permessi, 
     spedizioni, gadget, consulenze, etc.) within the "Varie / Extra" category.
   - Existing rows without a tipologia remain valid (nullable column, no data loss).

2. Modified Tables
   - `event_varie_details`
     - Added `tipologia` (text, nullable, default null) — free-text sub-classification

3. Security
   - No policy changes (table RLS already configured).

4. Important Notes
   - Safe to re-run (uses DO $$ IF NOT EXISTS pattern).
   - Does NOT drop or modify any existing columns.
   - Existing data is unaffected (null tipologia = generic "Varie" as before).
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_varie_details'
      AND column_name = 'tipologia'
  ) THEN
    ALTER TABLE public.event_varie_details ADD COLUMN tipologia text DEFAULT NULL;
  END IF;
END $$;
