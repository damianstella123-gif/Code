-- Add nome and cognome to staff interno (replace generic 'risorsa' approach)
ALTER TABLE event_staff_interno_details
  ADD COLUMN IF NOT EXISTS nome text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cognome text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS quantita integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS venduto_unitario numeric,
  ADD COLUMN IF NOT EXISTS costo_unitario numeric;

-- Add nome and cognome to staff esterno
ALTER TABLE event_staff_esterno_details
  ADD COLUMN IF NOT EXISTS nome text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cognome text NOT NULL DEFAULT '';
