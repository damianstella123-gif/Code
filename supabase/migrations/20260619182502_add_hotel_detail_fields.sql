ALTER TABLE event_hotel_details
  ADD COLUMN IF NOT EXISTS room_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS meeting_pax int,
  ADD COLUMN IF NOT EXISTS meeting_setup text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS meeting_equipment text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS natural_light boolean NOT NULL DEFAULT false;