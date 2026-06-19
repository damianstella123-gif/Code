ALTER TABLE public.event_program
  ADD COLUMN IF NOT EXISTS supplier_id text;

CREATE INDEX IF NOT EXISTS idx_event_program_supplier ON event_program(supplier_id);