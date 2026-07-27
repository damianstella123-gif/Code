/*
# Create registration email outbox table and trigger

1. New Tables
   - `registration_email_outbox`
     - `id` (uuid, primary key)
     - `registration_id` (uuid, FK to event_registrations, ON DELETE CASCADE)
     - `template` (text, 'registration_confirmed' or 'registration_waitlist')
     - `status` (text, 'pending'/'processing'/'sent'/'failed')
     - `attempts` (integer, >= 0)
     - `next_attempt_at` (timestamptz, default now)
     - `sent_at` (timestamptz, nullable)
     - `last_error_code` (text, nullable)
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)
     - UNIQUE(registration_id, template) prevents duplicate emails

2. Security
   - RLS enabled, NO policies — only service-role and SECURITY DEFINER functions can access.

3. Trigger
   - AFTER INSERT on event_registrations fires `trg_enqueue_registration_email`.
   - SECURITY DEFINER function inserts the appropriate template row.
   - ON CONFLICT DO NOTHING ensures idempotency.
   - No email is sent inside the trigger.

4. Important Notes
   - No personal data (email, names, QR, payload, HTML) stored in outbox.
   - Historical registrations are NOT backfilled — zero outbox rows for existing data.
   - Trigger function execution revoked from PUBLIC and anon.
*/

-- Table
CREATE TABLE IF NOT EXISTS registration_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  template text NOT NULL CHECK (template IN ('registration_confirmed', 'registration_waitlist')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one email per registration per template
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'registration_email_outbox_registration_id_template_key'
  ) THEN
    ALTER TABLE registration_email_outbox
      ADD CONSTRAINT registration_email_outbox_registration_id_template_key
      UNIQUE (registration_id, template);
  END IF;
END $$;

-- RLS enabled, no policies
ALTER TABLE registration_email_outbox ENABLE ROW LEVEL SECURITY;

-- Index for polling pending emails
CREATE INDEX IF NOT EXISTS idx_email_outbox_pending
  ON registration_email_outbox (next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- Trigger function
CREATE OR REPLACE FUNCTION fn_enqueue_registration_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.registration_status = 'confirmed' THEN
    INSERT INTO registration_email_outbox (registration_id, template)
    VALUES (NEW.id, 'registration_confirmed')
    ON CONFLICT (registration_id, template) DO NOTHING;
  ELSIF NEW.registration_status = 'waitlist' THEN
    INSERT INTO registration_email_outbox (registration_id, template)
    VALUES (NEW.id, 'registration_waitlist')
    ON CONFLICT (registration_id, template) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Revoke execution from public/anon
REVOKE EXECUTE ON FUNCTION fn_enqueue_registration_email() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_enqueue_registration_email() FROM anon;

-- Trigger
DROP TRIGGER IF EXISTS trg_enqueue_registration_email ON event_registrations;
CREATE TRIGGER trg_enqueue_registration_email
  AFTER INSERT ON event_registrations
  FOR EACH ROW
  EXECUTE FUNCTION fn_enqueue_registration_email();
