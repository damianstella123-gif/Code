/*
# Create email_messages table

1. New Tables
- `email_messages`
  - `id` (uuid, primary key)
  - `event_id` (text, nullable, references events)
  - `client_id` (text, nullable, references clients)
  - `recipient_email` (text, not null)
  - `subject` (text, not null)
  - `body` (text, not null)
  - `attachments` (text array, default empty)
  - `status` (text, default 'bozza') - bozza, inviata, errore
  - `sent_at` (timestamptz, nullable)
  - `created_by` (text, not null)
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `email_messages`.
- Allow anon + authenticated full CRUD (single-tenant internal tool).
*/

CREATE TABLE IF NOT EXISTS email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text REFERENCES events(id) ON DELETE SET NULL,
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  attachments text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'bozza',
  sent_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_email_messages" ON email_messages;
CREATE POLICY "anon_select_email_messages" ON email_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_email_messages" ON email_messages;
CREATE POLICY "anon_insert_email_messages" ON email_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_email_messages" ON email_messages;
CREATE POLICY "anon_update_email_messages" ON email_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_email_messages" ON email_messages;
CREATE POLICY "anon_delete_email_messages" ON email_messages FOR DELETE
  TO anon, authenticated USING (true);
