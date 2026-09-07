/*
# Create event time tracking table and heartbeat RPC

1. New Tables
  - `event_time_heartbeats`
    - `id` (uuid, primary key)
    - `event_id` (text, not null, references events)
    - `user_id` (uuid, not null, references auth.users)
    - `heartbeat_at` (timestamptz, default now() truncated to minute)
    - Unique constraint on (event_id, user_id, heartbeat_at) to prevent
      duplicate heartbeats within the same minute window.

2. New Functions
  - `record_event_time_heartbeat(p_event_id text)` — SECURITY INVOKER RPC that
    inserts a heartbeat row for the calling user. Uses ON CONFLICT DO NOTHING
    to silently skip duplicates within the same minute.

3. Security
  - RLS enabled on `event_time_heartbeats`.
  - Authenticated users can SELECT and INSERT their own rows.
  - No UPDATE or DELETE policies (heartbeats are append-only).

4. Notes
  - The frontend sends a heartbeat every 60s while an event is open and
    the tab is visible. Each heartbeat represents ~1 minute of active time.
  - To compute total time spent, count the heartbeat rows per user per event.
*/

CREATE TABLE IF NOT EXISTS event_time_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  heartbeat_at timestamptz NOT NULL DEFAULT date_trunc('minute', now()),
  UNIQUE (event_id, user_id, heartbeat_at)
);

CREATE INDEX IF NOT EXISTS idx_eth_event_user ON event_time_heartbeats (event_id, user_id);

ALTER TABLE event_time_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_heartbeats" ON event_time_heartbeats;
CREATE POLICY "select_own_heartbeats" ON event_time_heartbeats FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_heartbeats" ON event_time_heartbeats;
CREATE POLICY "insert_own_heartbeats" ON event_time_heartbeats FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP FUNCTION IF EXISTS record_event_time_heartbeat(text);
CREATE FUNCTION record_event_time_heartbeat(p_event_id text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO event_time_heartbeats (event_id, user_id, heartbeat_at)
  VALUES (p_event_id, auth.uid(), date_trunc('minute', now()))
  ON CONFLICT (event_id, user_id, heartbeat_at) DO NOTHING;
$$;
