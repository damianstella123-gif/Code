/*
# Create event_payments table — Cash Flow Manager

1. New Tables
   - `event_payments`
     - `id` (uuid, primary key)
     - `event_id` (text, FK to events, CASCADE on delete)
     - `tipo` (text, CHECK: 'incasso_cliente' or 'pagamento_fornitore')
     - `descrizione` (text, not null)
     - `importo` (numeric, not null)
     - `data_scadenza` (date, not null)
     - `data_pagamento` (date, nullable — null = not yet paid)
     - `supplier_id` (text, FK to suppliers, SET NULL on delete)
     - `stato` (text, CHECK: 'atteso','pagato','in_ritardo', default 'atteso')
     - `note` (text)
     - `created_by` (uuid, FK to profiles)
     - `created_at` (timestamptz, default now())

2. Security
   - Enable RLS on `event_payments`.
   - CRUD policies for authenticated users (team-wide visibility like events).

3. Indexes
   - event_id for efficient event-scoped queries
   - data_scadenza for deadline-based queries
   - stato for filtering

4. Realtime
   - Enable realtime publication for event_payments.
*/

CREATE TABLE IF NOT EXISTS event_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('incasso_cliente', 'pagamento_fornitore')),
  descrizione text NOT NULL,
  importo numeric NOT NULL,
  data_scadenza date NOT NULL,
  data_pagamento date,
  supplier_id text REFERENCES suppliers(id) ON DELETE SET NULL,
  stato text NOT NULL DEFAULT 'atteso' CHECK (stato IN ('atteso', 'pagato', 'in_ritardo')),
  note text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_payments_event_id ON event_payments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_scadenza ON event_payments(data_scadenza);
CREATE INDEX IF NOT EXISTS idx_event_payments_stato ON event_payments(stato);

ALTER TABLE event_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_event_payments" ON event_payments;
CREATE POLICY "select_event_payments" ON event_payments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_event_payments" ON event_payments;
CREATE POLICY "insert_event_payments" ON event_payments FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_event_payments" ON event_payments;
CREATE POLICY "update_event_payments" ON event_payments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_event_payments" ON event_payments;
CREATE POLICY "delete_event_payments" ON event_payments FOR DELETE
  TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE event_payments;
