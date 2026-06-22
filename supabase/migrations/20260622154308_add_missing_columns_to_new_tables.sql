-- Add abbigliamento to staff esterno
ALTER TABLE event_staff_esterno_details
  ADD COLUMN IF NOT EXISTS abbigliamento text NOT NULL DEFAULT '';

-- Add ora_inizio/ora_fine to catering (replace single 'ora')
ALTER TABLE event_catering_details
  ADD COLUMN IF NOT EXISTS ora_inizio time,
  ADD COLUMN IF NOT EXISTS ora_fine time;

-- Add note_operative to catering (rename 'note' conceptually; keep note column)
-- Already has 'note' column, user calls it 'note operative' - same field, no change needed.

-- Add note_operative to staff_interno (for consistency)
ALTER TABLE event_staff_interno_details
  ADD COLUMN IF NOT EXISTS note_operative text NOT NULL DEFAULT '';

-- Add note_operative to staff_esterno
ALTER TABLE event_staff_esterno_details
  ADD COLUMN IF NOT EXISTS note_operative text NOT NULL DEFAULT '';