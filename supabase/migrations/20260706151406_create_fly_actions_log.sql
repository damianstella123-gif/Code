/*
# Create fly_actions_log table

Tracks every action Fly executes on behalf of a user (after explicit confirmation).

1. New Tables
   - `fly_actions_log`
     - `id` (uuid, primary key)
     - `user_id` (uuid, not null, references auth.users)
     - `action_type` (text, not null) — e.g. create_task, create_memo, update_task_status
     - `payload` (jsonb, not null) — the structured parameters of the action
     - `status` (text, not null, default 'executed') — values: executed, failed
     - `error` (text, nullable) — error message if status = failed
     - `created_at` (timestamptz, default now())

2. Security
   - RLS enabled.
   - Authenticated users can insert and select only their own rows.
*/

CREATE TABLE IF NOT EXISTS fly_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'executed',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fly_actions_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_fly_actions" ON fly_actions_log;
CREATE POLICY "select_own_fly_actions" ON fly_actions_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_fly_actions" ON fly_actions_log;
CREATE POLICY "insert_own_fly_actions" ON fly_actions_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fly_actions_log_user_id ON fly_actions_log(user_id);
CREATE INDEX IF NOT EXISTS idx_fly_actions_log_created_at ON fly_actions_log(created_at DESC);
