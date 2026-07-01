ALTER TABLE public.event_program
  ADD COLUMN IF NOT EXISTS pax integer,
  ADD COLUMN IF NOT EXISTS servizio text NOT NULL DEFAULT '';