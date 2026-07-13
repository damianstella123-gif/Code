/*
# Create comunicazioni thread system tables

1. New Tables
   - `comunicazioni_thread` - conversation threads linked to events
     - `id` (uuid, primary key)
     - `event_id` (text, references events)
     - `titolo` (text, thread subject)
     - `creato_da` (uuid, references profiles - thread creator)
     - `stato` (text, check: aperto/chiuso/archiviato)
     - `priorita` (text, check: bassa/normale/alta/critica)
     - `last_message_at` (timestamptz, for ordering)
     - `created_at`, `updated_at` (timestamptz)

   - `comunicazioni_messages` - individual messages within threads
     - `id` (uuid, primary key)
     - `thread_id` (uuid, references comunicazioni_thread)
     - `author_id` (uuid, references profiles)
     - `testo` (text, message body)
     - `letto_da` (uuid[], array of user ids who read the message)
     - `edited_at` (timestamptz, null if not edited)
     - `created_at` (timestamptz)

   - `comunicazioni_participants` - thread membership
     - `id` (uuid, primary key)
     - `thread_id` (uuid, references comunicazioni_thread)
     - `user_id` (uuid, references profiles)
     - `ruolo` (text, check: creator/partecipante/osservatore)
     - `notifiche_enabled` (boolean)
     - UNIQUE(thread_id, user_id)

2. Security
   - RLS enabled on all three tables
   - Authenticated users have full CRUD (team-shared data, no ownership isolation needed)

3. Notes
   - event_id is text to match events.id type
   - letto_da uses uuid[] array for efficient unread tracking per message
   - ON DELETE CASCADE ensures cleanup when threads/events are removed
*/

CREATE TABLE IF NOT EXISTS comunicazioni_thread (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  titolo text NOT NULL,
  creato_da uuid NOT NULL REFERENCES profiles(id),
  stato text NOT NULL DEFAULT 'aperto' CHECK (stato IN ('aperto','chiuso','archiviato')),
  priorita text NOT NULL DEFAULT 'normale' CHECK (priorita IN ('bassa','normale','alta','critica')),
  last_message_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comunicazioni_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES comunicazioni_thread(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id),
  testo text NOT NULL,
  letto_da uuid[] DEFAULT '{}',
  edited_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comunicazioni_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES comunicazioni_thread(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ruolo text NOT NULL DEFAULT 'partecipante' CHECK (ruolo IN ('creator','partecipante','osservatore')),
  notifiche_enabled boolean DEFAULT true,
  UNIQUE(thread_id, user_id)
);

ALTER TABLE comunicazioni_thread ENABLE ROW LEVEL SECURITY;
ALTER TABLE comunicazioni_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE comunicazioni_participants ENABLE ROW LEVEL SECURITY;

-- Thread policies
DROP POLICY IF EXISTS "ct_select" ON comunicazioni_thread;
CREATE POLICY "ct_select" ON comunicazioni_thread FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ct_insert" ON comunicazioni_thread;
CREATE POLICY "ct_insert" ON comunicazioni_thread FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ct_update" ON comunicazioni_thread;
CREATE POLICY "ct_update" ON comunicazioni_thread FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ct_delete" ON comunicazioni_thread;
CREATE POLICY "ct_delete" ON comunicazioni_thread FOR DELETE TO authenticated USING (true);

-- Messages policies
DROP POLICY IF EXISTS "cm_select" ON comunicazioni_messages;
CREATE POLICY "cm_select" ON comunicazioni_messages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cm_insert" ON comunicazioni_messages;
CREATE POLICY "cm_insert" ON comunicazioni_messages FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cm_update" ON comunicazioni_messages;
CREATE POLICY "cm_update" ON comunicazioni_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cm_delete" ON comunicazioni_messages;
CREATE POLICY "cm_delete" ON comunicazioni_messages FOR DELETE TO authenticated USING (true);

-- Participants policies
DROP POLICY IF EXISTS "cp_select" ON comunicazioni_participants;
CREATE POLICY "cp_select" ON comunicazioni_participants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cp_insert" ON comunicazioni_participants;
CREATE POLICY "cp_insert" ON comunicazioni_participants FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cp_update" ON comunicazioni_participants;
CREATE POLICY "cp_update" ON comunicazioni_participants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cp_delete" ON comunicazioni_participants;
CREATE POLICY "cp_delete" ON comunicazioni_participants FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ct_event_id ON comunicazioni_thread(event_id);
CREATE INDEX IF NOT EXISTS idx_ct_stato ON comunicazioni_thread(stato);
CREATE INDEX IF NOT EXISTS idx_cm_thread_id ON comunicazioni_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_cm_author_id ON comunicazioni_messages(author_id);
CREATE INDEX IF NOT EXISTS idx_cp_user_id ON comunicazioni_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_cp_thread_id ON comunicazioni_participants(thread_id);
