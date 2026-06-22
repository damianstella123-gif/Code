-- Add date/time columns to varie so they can appear in Programma
ALTER TABLE event_varie_details
  ADD COLUMN IF NOT EXISTS data date,
  ADD COLUMN IF NOT EXISTS ora_inizio time,
  ADD COLUMN IF NOT EXISTS note_operative text NOT NULL DEFAULT '';