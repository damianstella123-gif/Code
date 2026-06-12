DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'presentation_versions' AND column_name = 'responsible_id'
  ) THEN
    ALTER TABLE presentation_versions ADD COLUMN responsible_id uuid;
  END IF;
END $$;
