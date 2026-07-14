/*
# Add client_id column to event_payments

1. Modified Tables
   - `event_payments`
     - Added `client_id` (text, nullable) — references clients(id), used for incasso_cliente records
     - Added `categoria` (text, nullable) — category label for the payment line

2. Purpose
   - Enables event_payments to serve as single source of truth for both
     entrate (incasso_cliente with client_id) and uscite (pagamento_fornitore with supplier_id).
   - Removes dependency on admin_entrate and budgets tables for the Amministrazione view.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_payments' AND column_name = 'client_id') THEN
    ALTER TABLE event_payments ADD COLUMN client_id text REFERENCES clients(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_payments' AND column_name = 'categoria') THEN
    ALTER TABLE event_payments ADD COLUMN categoria text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_payments_tipo ON event_payments(tipo);
CREATE INDEX IF NOT EXISTS idx_event_payments_supplier ON event_payments(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_payments_client ON event_payments(client_id) WHERE client_id IS NOT NULL;
