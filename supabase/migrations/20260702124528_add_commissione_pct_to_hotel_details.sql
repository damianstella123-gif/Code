/*
# Add commissione_pct to event_hotel_details

1. Modified Tables
  - `event_hotel_details`
    - `commissione_pct` (numeric, nullable) - Commission percentage that the hotel pays back on the cost (a consuntivo). Internal-only field, not visible to clients. Used to calculate final net profit. Fee agenzia does NOT apply on this amount.

2. Important Notes
  - Commission is calculated as: costo_totale * commissione_pct / 100
  - This is revenue paid by the hotel to the agency after the event
  - It must be excluded from fee agenzia calculation
  - It contributes to the final profit/margin
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_hotel_details' AND column_name = 'commissione_pct'
  ) THEN
    ALTER TABLE event_hotel_details ADD COLUMN commissione_pct numeric DEFAULT NULL;
  END IF;
END $$;
