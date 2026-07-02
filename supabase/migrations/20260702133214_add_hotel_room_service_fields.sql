/*
# Add Hotel Room Service Fields for Accommodation Management

## Purpose
Extends event_hotel_details with structured room/accommodation fields to support:
- Room type selection (DUS, Double, Twin, etc.)
- Payment mode (client direct, Simmetria, mixed)
- Separate room counts and rates for client vs Simmetria
- Commission calculation on client-direct rooms

## New Columns on event_hotel_details
- payment_mode (text, nullable) — 'cliente' | 'simmetria' | 'misto'
- rooms_client_count (integer, nullable) — number of rooms paid by client directly
- rooms_simmetria_count (integer, nullable) — number of rooms paid by Simmetria
- rooms_total_count (integer, nullable) — computed total (client + simmetria)
- room_rate_client (numeric, nullable) — nightly rate per room for client-direct rooms
- room_cost_simmetria (numeric, nullable) — cost per room for Simmetria-paid rooms
- commissione_attiva (boolean, default false) — whether commission is active
- commissione_percentuale (numeric, nullable) — commission percentage
- commissione_base (numeric, nullable) — base amount for commission calculation
- commissione_importo (numeric, nullable) — computed commission amount
- commissione_note (text, nullable) — notes about commission agreement

## Notes
1. rooms_total_count = rooms_client_count + rooms_simmetria_count
2. If payment_mode = 'cliente': rooms_simmetria_count = 0
3. If payment_mode = 'simmetria': rooms_client_count = 0
4. If payment_mode = 'misto': both can be > 0
5. commissione_importo = commissione_base * commissione_percentuale / 100
6. Default commissione_base = rooms_client_count * room_rate_client
7. Existing room_type column is reused for the dropdown values
8. Existing commissione_pct column remains for backward compat with budget calc
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_hotel_details' AND column_name = 'payment_mode') THEN
    ALTER TABLE event_hotel_details ADD COLUMN payment_mode text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_hotel_details' AND column_name = 'rooms_client_count') THEN
    ALTER TABLE event_hotel_details ADD COLUMN rooms_client_count integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_hotel_details' AND column_name = 'rooms_simmetria_count') THEN
    ALTER TABLE event_hotel_details ADD COLUMN rooms_simmetria_count integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_hotel_details' AND column_name = 'rooms_total_count') THEN
    ALTER TABLE event_hotel_details ADD COLUMN rooms_total_count integer;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_hotel_details' AND column_name = 'room_rate_client') THEN
    ALTER TABLE event_hotel_details ADD COLUMN room_rate_client numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_hotel_details' AND column_name = 'room_cost_simmetria') THEN
    ALTER TABLE event_hotel_details ADD COLUMN room_cost_simmetria numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_hotel_details' AND column_name = 'commissione_attiva') THEN
    ALTER TABLE event_hotel_details ADD COLUMN commissione_attiva boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_hotel_details' AND column_name = 'commissione_percentuale') THEN
    ALTER TABLE event_hotel_details ADD COLUMN commissione_percentuale numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_hotel_details' AND column_name = 'commissione_base') THEN
    ALTER TABLE event_hotel_details ADD COLUMN commissione_base numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_hotel_details' AND column_name = 'commissione_importo') THEN
    ALTER TABLE event_hotel_details ADD COLUMN commissione_importo numeric;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_hotel_details' AND column_name = 'commissione_note') THEN
    ALTER TABLE event_hotel_details ADD COLUMN commissione_note text;
  END IF;
END $$;

COMMENT ON COLUMN event_hotel_details.payment_mode IS 'Payment mode: cliente, simmetria, or misto';
COMMENT ON COLUMN event_hotel_details.rooms_client_count IS 'Number of rooms paid directly by client';
COMMENT ON COLUMN event_hotel_details.rooms_simmetria_count IS 'Number of rooms paid by Simmetria';
COMMENT ON COLUMN event_hotel_details.rooms_total_count IS 'Total rooms = client + simmetria';
COMMENT ON COLUMN event_hotel_details.room_rate_client IS 'Rate per room for client-direct rooms';
COMMENT ON COLUMN event_hotel_details.room_cost_simmetria IS 'Cost per room for Simmetria-paid rooms';
COMMENT ON COLUMN event_hotel_details.commissione_attiva IS 'Whether commission is enabled for this record';
COMMENT ON COLUMN event_hotel_details.commissione_percentuale IS 'Commission percentage on client-direct rooms';
COMMENT ON COLUMN event_hotel_details.commissione_base IS 'Base amount for commission calculation';
COMMENT ON COLUMN event_hotel_details.commissione_importo IS 'Computed commission amount';
COMMENT ON COLUMN event_hotel_details.commissione_note IS 'Notes about commission terms';
