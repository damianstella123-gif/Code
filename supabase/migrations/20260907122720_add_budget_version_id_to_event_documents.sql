/*
# Add budget_version_id to event_documents

1. Modified Tables
   - `event_documents`
     - `budget_version_id` (uuid, nullable) — optional FK linking a document to a specific budget version

2. Notes
   - Existing rows keep NULL (not linked to any budget version).
   - FK cascades on delete so removing a budget version also removes its attached documents.
*/

ALTER TABLE public.event_documents
  ADD COLUMN IF NOT EXISTS budget_version_id uuid REFERENCES public.budget_versions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_event_documents_budget_version_id
  ON public.event_documents (budget_version_id)
  WHERE budget_version_id IS NOT NULL;
