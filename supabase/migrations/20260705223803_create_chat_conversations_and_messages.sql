/*
# Create Chat Tables (chat_conversations + chat_messages)

1. New Tables
  - `chat_conversations`
    - `id` (uuid, primary key)
    - `title` (text, nullable - for group chats)
    - `is_group` (boolean, default false)
    - `event_id` (uuid, nullable - links chat to an event)
    - `participant_ids` (uuid array, not null)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)
    - `last_message_at` (timestamptz)
    - `last_message_preview` (text)
  - `chat_messages`
    - `id` (uuid, primary key)
    - `conversation_id` (uuid, references chat_conversations)
    - `sender_id` (uuid, not null)
    - `content` (text, not null)
    - `created_at` (timestamptz, default now())
    - `read_by` (uuid array, default empty)

2. Security
  - RLS enabled on both tables.
  - Users can only access conversations where their id is in participant_ids.
  - Users can only read/write messages in conversations they participate in.

3. Realtime
  - Both tables added to supabase_realtime publication.

4. Indexes
  - conversation_id on chat_messages for fast lookups.
  - last_message_at on chat_conversations for ordering.
*/

-- Chat Conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  is_group boolean NOT NULL DEFAULT false,
  event_id uuid,
  participant_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  last_message_preview text
);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_conversations" ON chat_conversations;
CREATE POLICY "select_own_conversations" ON chat_conversations FOR SELECT
  TO authenticated USING (auth.uid() = ANY(participant_ids));

DROP POLICY IF EXISTS "insert_own_conversations" ON chat_conversations;
CREATE POLICY "insert_own_conversations" ON chat_conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = ANY(participant_ids));

DROP POLICY IF EXISTS "update_own_conversations" ON chat_conversations;
CREATE POLICY "update_own_conversations" ON chat_conversations FOR UPDATE
  TO authenticated USING (auth.uid() = ANY(participant_ids)) WITH CHECK (auth.uid() = ANY(participant_ids));

DROP POLICY IF EXISTS "delete_own_conversations" ON chat_conversations;
CREATE POLICY "delete_own_conversations" ON chat_conversations FOR DELETE
  TO authenticated USING (auth.uid() = ANY(participant_ids));

-- Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_by uuid[] NOT NULL DEFAULT '{}'
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_messages" ON chat_messages;
CREATE POLICY "select_own_messages" ON chat_messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND auth.uid() = ANY(chat_conversations.participant_ids)
    )
  );

DROP POLICY IF EXISTS "insert_own_messages" ON chat_messages;
CREATE POLICY "insert_own_messages" ON chat_messages FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND auth.uid() = ANY(chat_conversations.participant_ids)
    )
  );

DROP POLICY IF EXISTS "update_own_messages" ON chat_messages;
CREATE POLICY "update_own_messages" ON chat_messages FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND auth.uid() = ANY(chat_conversations.participant_ids)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_conversations
      WHERE chat_conversations.id = chat_messages.conversation_id
      AND auth.uid() = ANY(chat_conversations.participant_ids)
    )
  );

DROP POLICY IF EXISTS "delete_own_messages" ON chat_messages;
CREATE POLICY "delete_own_messages" ON chat_messages FOR DELETE
  TO authenticated USING (auth.uid() = sender_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message_at ON chat_conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_participant_ids ON chat_conversations USING GIN(participant_ids);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
