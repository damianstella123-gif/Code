/*
# Add budget line item columns and events.client_id

1. Modified Tables
   - `budgets`: Added `quantity` (numeric, default 1) and `unit_price` (numeric 14,2) for line-item budgeting
   - `events`: Added `client_id` (text, FK to clients.id) for direct client relationship

2. Notes
   - quantity defaults to 1 so existing rows remain valid
   - unit_price is nullable (existing rows had only estimated_cost/actual_cost)
   - client_id is nullable to allow events without a linked client
   - No data loss: purely additive changes
*/

-- Add quantity and unit_price to budgets
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'quantity') THEN
    ALTER TABLE budgets ADD COLUMN quantity numeric(10,2) NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'budgets' AND column_name = 'unit_price') THEN
    ALTER TABLE budgets ADD COLUMN unit_price numeric(14,2);
  END IF;
END $$;

-- Add client_id FK to events
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'client_id') THEN
    ALTER TABLE events ADD COLUMN client_id text REFERENCES clients(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for the new FK
CREATE INDEX IF NOT EXISTS idx_events_client_id ON events(client_id);
