-- Add sotto_categoria to tables that need sub-category classification
ALTER TABLE event_hotel_details ADD COLUMN IF NOT EXISTS sotto_categoria text DEFAULT 'camere';
ALTER TABLE event_supplier_services ADD COLUMN IF NOT EXISTS sotto_categoria text DEFAULT 'auto';
ALTER TABLE event_restaurant_details ADD COLUMN IF NOT EXISTS sotto_categoria text DEFAULT 'pranzo';

-- Ensure all budget tables have uniform venduto/costo fields where missing
ALTER TABLE event_hotel_details ADD COLUMN IF NOT EXISTS venduto_totale numeric DEFAULT 0;
ALTER TABLE event_hotel_details ADD COLUMN IF NOT EXISTS costo_totale numeric DEFAULT 0;
ALTER TABLE event_hotel_details ADD COLUMN IF NOT EXISTS descrizione text DEFAULT '';

ALTER TABLE event_experience_details ADD COLUMN IF NOT EXISTS venduto_totale numeric DEFAULT 0;
ALTER TABLE event_experience_details ADD COLUMN IF NOT EXISTS costo_totale numeric DEFAULT 0;

ALTER TABLE event_audio_video_details ADD COLUMN IF NOT EXISTS venduto_totale numeric DEFAULT 0;
ALTER TABLE event_audio_video_details ADD COLUMN IF NOT EXISTS costo_totale numeric DEFAULT 0;

ALTER TABLE event_allestimenti_details ADD COLUMN IF NOT EXISTS venduto_totale numeric DEFAULT 0;
ALTER TABLE event_allestimenti_details ADD COLUMN IF NOT EXISTS costo_totale numeric DEFAULT 0;

ALTER TABLE event_grafica_stampa_details ADD COLUMN IF NOT EXISTS venduto_totale numeric DEFAULT 0;
ALTER TABLE event_grafica_stampa_details ADD COLUMN IF NOT EXISTS costo_totale numeric DEFAULT 0;

ALTER TABLE event_staff_esterno_details ADD COLUMN IF NOT EXISTS venduto_totale numeric DEFAULT 0;
ALTER TABLE event_staff_esterno_details ADD COLUMN IF NOT EXISTS costo_totale numeric DEFAULT 0;

ALTER TABLE event_varie_details ADD COLUMN IF NOT EXISTS venduto_totale numeric DEFAULT 0;
ALTER TABLE event_varie_details ADD COLUMN IF NOT EXISTS costo_totale numeric DEFAULT 0;