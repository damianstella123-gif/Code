ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS is_participant_data boolean DEFAULT false;

ALTER TABLE public.event_documents
  ADD COLUMN IF NOT EXISTS is_participant_data boolean DEFAULT false;
