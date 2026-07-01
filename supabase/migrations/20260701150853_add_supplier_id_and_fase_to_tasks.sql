/*
# Extend tasks table with supplier link and workflow phase

1. Modified Tables
   - `tasks`
     - `supplier_id` (text, nullable) — optional link to a supplier for supplier-specific tasks
     - `fase` (text, nullable) — workflow phase this task belongs to (pianificazione, operativo, chiusura)
     - `categoria` (text, nullable) — task category for grouping (logistica, contratti, comunicazione, tecnico, amministrativo)

2. New Indexes
   - `idx_tasks_supplier_id` for quick lookup of tasks by supplier
   - `idx_tasks_fase` for quick lookup of tasks by workflow phase

3. Notes
   - supplier_id is text (not UUID) to match the existing suppliers table PK format
   - fase is free-text to allow flexibility but expected values are: pianificazione, operativo, chiusura
   - No FK constraint on supplier_id since suppliers table uses text IDs and may not always have the referenced supplier
*/

-- Add supplier_id column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN supplier_id text;
  END IF;
END $$;

-- Add fase column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'fase'
  ) THEN
    ALTER TABLE tasks ADD COLUMN fase text;
  END IF;
END $$;

-- Add categoria column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'categoria'
  ) THEN
    ALTER TABLE tasks ADD COLUMN categoria text;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_supplier_id ON tasks(supplier_id);
CREATE INDEX IF NOT EXISTS idx_tasks_fase ON tasks(fase);
CREATE INDEX IF NOT EXISTS idx_tasks_categoria ON tasks(categoria);
