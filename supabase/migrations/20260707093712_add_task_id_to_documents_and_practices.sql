/*
# Add task_id foreign key to documents and practices

1. Modified Tables
   - `documents`: added nullable `task_id` (text) referencing tasks(id) ON DELETE SET NULL
   - `practices`: added nullable `task_id` (text) referencing tasks(id) ON DELETE SET NULL

2. Purpose
   - Enable linking documents and practices to tasks for cross-entity navigation

3. Important Notes
   - Both columns are nullable — existing rows unaffected
   - ON DELETE SET NULL ensures deleting a task doesn't cascade-delete documents/practices
   - Uses text type to match tasks.id column type
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'task_id'
  ) THEN
    ALTER TABLE documents ADD COLUMN task_id text REFERENCES tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'practices' AND column_name = 'task_id'
  ) THEN
    ALTER TABLE practices ADD COLUMN task_id text REFERENCES tasks(id) ON DELETE SET NULL;
  END IF;
END $$;
