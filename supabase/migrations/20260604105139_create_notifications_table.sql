/*
  # Create notifications table

  1. New Tables
    - `notifications`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users, NOT NULL)
      - `title` (text, NOT NULL)
      - `message` (text, NOT NULL)
      - `type` (text, NOT NULL) — one of: task_assegnato, pratica_in_ritardo, evento_aggiornato, budget_superato, comunicazione_ricevuta
      - `related_entity_type` (text, nullable) — e.g. 'task', 'pratica', 'evento', 'budget', 'comunicazione'
      - `related_entity_id` (text, nullable) — ID of the related entity
      - `is_read` (boolean, default false)
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `notifications` table
    - Authenticated users can SELECT their own notifications
    - Authenticated users can UPDATE their own notifications (mark as read)
    - System (service_role) inserts via triggers — no user INSERT policy needed
    - No DELETE policy (notifications are permanent)

  3. Indexes
    - user_id + is_read for unread count queries
    - user_id + created_at for ordered listing
*/

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'task_assegnato',
  related_entity_type text,
  related_entity_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, is_read)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);
