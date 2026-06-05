/*
# Add responsible_id to presentation_versions

1. Modified Tables
   - `presentation_versions`
     - `responsible_id` (uuid, nullable) - links to the team member responsible for this presentation

2. Important Notes
   - Non-destructive: adds a nullable column only
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'presentation_versions' AND column_name = 'responsible_id'
  ) THEN
    ALTER TABLE presentation_versions ADD COLUMN responsible_id uuid;
  END IF;
END $$;
