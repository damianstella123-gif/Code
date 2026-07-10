/*
# Add Area Speciale Fields to Hotel, Restaurant, and Varie Details

1. Modified Tables
   - `event_hotel_details`: Added rooftop, outdoor, indoor, sala_riservata, costo_area_speciale, venduto_area_speciale, note_area_speciale
   - `event_restaurant_details`: Added rooftop, outdoor, indoor, sala_riservata, costo_area_speciale, venduto_area_speciale, note_area_speciale
   - `event_varie_details`: Added rooftop, outdoor, indoor, sala_riservata, area_riservata, esclusiva_parziale, esclusiva_totale, costo_area_speciale, venduto_area_speciale, note_area_speciale

2. Purpose
   - Allow tracking of special area types (rooftop, outdoor, indoor, reserved rooms) for hotel, restaurant, and location/varie suppliers
   - Include cost and revenue fields for special areas to be included in margin calculations

3. Important Notes
   - All boolean fields default to false except indoor which defaults to true
   - Numeric fields are nullable (only filled when a special area is selected)
   - These fields are additive and do not alter existing data
*/

ALTER TABLE event_hotel_details
  ADD COLUMN IF NOT EXISTS rooftop boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS outdoor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS indoor boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sala_riservata boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS costo_area_speciale numeric,
  ADD COLUMN IF NOT EXISTS venduto_area_speciale numeric,
  ADD COLUMN IF NOT EXISTS note_area_speciale text;

ALTER TABLE event_restaurant_details
  ADD COLUMN IF NOT EXISTS rooftop boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS outdoor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS indoor boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sala_riservata boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS costo_area_speciale numeric,
  ADD COLUMN IF NOT EXISTS venduto_area_speciale numeric,
  ADD COLUMN IF NOT EXISTS note_area_speciale text;

ALTER TABLE event_varie_details
  ADD COLUMN IF NOT EXISTS rooftop boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS outdoor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS indoor boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sala_riservata boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS area_riservata boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS esclusiva_parziale boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS esclusiva_totale boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS costo_area_speciale numeric,
  ADD COLUMN IF NOT EXISTS venduto_area_speciale numeric,
  ADD COLUMN IF NOT EXISTS note_area_speciale text;