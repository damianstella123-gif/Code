/*
# Add pax and note_operative to event_hotel_details

1. Modified Tables
   - `event_hotel_details`
     - `pax` (integer, nullable) — number of persons for F&B services (coffee break, lunch, dinner, cocktail, etc.)
     - `note_operative` (text, nullable) — operational notes separate from room/accommodation notes

2. Notes
   - These columns support the multi-service Hotel model where each service (pernottamento, meeting, coffee break, lunch, dinner, cocktail, etc.) is stored as a separate record
   - The `pax` field is needed for per-person pricing on F&B services within the hotel
   - The `note_operative` field provides operational notes distinct from the generic `note` field (used for rooming list / room notes)
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_hotel_details' AND column_name = 'pax'
  ) THEN
    ALTER TABLE event_hotel_details ADD COLUMN pax integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_hotel_details' AND column_name = 'note_operative'
  ) THEN
    ALTER TABLE event_hotel_details ADD COLUMN note_operative text;
  END IF;
END $$;
