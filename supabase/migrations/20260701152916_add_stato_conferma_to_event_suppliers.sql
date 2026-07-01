/*
# Add stato_conferma and contatto_operativo to event_suppliers

1. Modified Tables
   - `event_suppliers`
     - `stato_conferma` (text, default 'richiesto') — confirmation status of the supplier for this event
       Values: 'richiesto', 'confermato', 'contrattualizzato'
     - `contatto_operativo` (text, nullable) — name of the operational contact for this event
     - `telefono_operativo` (text, nullable) — phone number of operational contact
     - `email_operativo` (text, nullable) — email of operational contact
     - `note_conferma` (text, default '') — notes about confirmation (e.g. contract number)
     - `data_conferma` (date, nullable) — date when supplier was confirmed

2. New Indexes
   - `idx_event_suppliers_stato_conferma` for filtering by status

3. Notes
   - stato_conferma tracks the lifecycle: richiesto → confermato → contrattualizzato
   - Contact fields allow overriding the supplier's default contact per-event
   - No data loss - all columns are nullable or have defaults
*/

-- Add stato_conferma
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_suppliers' AND column_name = 'stato_conferma'
  ) THEN
    ALTER TABLE event_suppliers ADD COLUMN stato_conferma text NOT NULL DEFAULT 'richiesto';
  END IF;
END $$;

-- Add contatto_operativo
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_suppliers' AND column_name = 'contatto_operativo'
  ) THEN
    ALTER TABLE event_suppliers ADD COLUMN contatto_operativo text;
  END IF;
END $$;

-- Add telefono_operativo
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_suppliers' AND column_name = 'telefono_operativo'
  ) THEN
    ALTER TABLE event_suppliers ADD COLUMN telefono_operativo text;
  END IF;
END $$;

-- Add email_operativo
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_suppliers' AND column_name = 'email_operativo'
  ) THEN
    ALTER TABLE event_suppliers ADD COLUMN email_operativo text;
  END IF;
END $$;

-- Add note_conferma
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_suppliers' AND column_name = 'note_conferma'
  ) THEN
    ALTER TABLE event_suppliers ADD COLUMN note_conferma text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Add data_conferma
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_suppliers' AND column_name = 'data_conferma'
  ) THEN
    ALTER TABLE event_suppliers ADD COLUMN data_conferma date;
  END IF;
END $$;

-- Index for filtering by stato
CREATE INDEX IF NOT EXISTS idx_event_suppliers_stato_conferma ON event_suppliers(stato_conferma);
