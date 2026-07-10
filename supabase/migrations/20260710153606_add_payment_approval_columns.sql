/*
# Add payment approval workflow columns

1. Modified Tables
   - `event_payments`: added `stato_approvazione` (text), `approvato_da` (uuid), `approvato_at` (timestamptz)
   - `cashflow_config`: added `notifica_ruoli` (text array)

2. Changes
   - stato_approvazione: tracks whether a payment needs approval ('autonomo', 'in_attesa', 'approvato', 'bloccato')
   - approvato_da: UUID of the admin who approved/blocked
   - approvato_at: timestamp of approval/block
   - notifica_ruoli: which roles to notify when a payment exceeds the threshold
   - Seeds a default config row if none exists (soglia 2000 EUR)

3. Security
   - No RLS changes (existing policies on event_payments remain)
*/

-- Add approval columns to event_payments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_payments' AND column_name = 'stato_approvazione') THEN
    ALTER TABLE event_payments ADD COLUMN stato_approvazione text NOT NULL DEFAULT 'autonomo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_payments' AND column_name = 'approvato_da') THEN
    ALTER TABLE event_payments ADD COLUMN approvato_da uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_payments' AND column_name = 'approvato_at') THEN
    ALTER TABLE event_payments ADD COLUMN approvato_at timestamptz;
  END IF;
END $$;

-- Add notifica_ruoli to cashflow_config
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cashflow_config' AND column_name = 'notifica_ruoli') THEN
    ALTER TABLE cashflow_config ADD COLUMN notifica_ruoli text[] NOT NULL DEFAULT ARRAY['Admin','Super Admin','Amministrazione'];
  END IF;
END $$;

-- Seed default config row if none exists
INSERT INTO cashflow_config (id, soglia_autonomia_pm_eur, soglia_senior_pm_eur, notifica_ruoli)
VALUES (1, 2000, 5000, ARRAY['Admin','Super Admin','Amministrazione'])
ON CONFLICT (id) DO NOTHING;
