/*
# Create Wellness Tables

1. New Tables
   - `wellness_logs` — tracks mood, breaks, and wellness pulse entries per user
     - `id` (uuid, PK)
     - `user_id` (uuid, FK to auth.users, NOT NULL)
     - `tipo` (text, constrained to mood_emoji/break_taken/wellness_pulse)
     - `mood`, `mood_context` (text)
     - `break_type` (text), `break_duration_minutes` (int), `break_effectiveness` (int)
     - `energy_level`, `work_life_balance`, `team_support`, `burnout_risk_self_reported` (int)
     - `notes` (text)
     - `created_at` (timestamptz)
   - `break_recommendations` — AI/system break suggestions per user
     - `id` (uuid, PK)
     - `user_id` (uuid, FK to auth.users, NOT NULL)
     - `trigger_reason`, `recommendation_type`, `recommendation_text` (text)
     - `work_duration_minutes`, `break_duration_minutes` (int)
     - `break_taken` (boolean), `break_taken_at` (timestamptz)
     - `created_at` (timestamptz)
   - `recognition_logs` — peer recognition/kudos between users
     - `id` (uuid, PK)
     - `given_by`, `given_to` (uuid, FK to auth.users, NOT NULL)
     - `tipo`, `message` (text)
     - `event_id` (text, FK to events)
     - `public` (boolean, default true)
     - `created_at` (timestamptz)

2. Indexes
   - idx_wellness_user on wellness_logs(user_id, created_at DESC)
   - idx_break_rec_user on break_recommendations(user_id, created_at DESC)
   - idx_recognition_to on recognition_logs(given_to, created_at DESC)

3. Security
   - RLS enabled on all 3 tables.
   - wellness_logs: owner-scoped CRUD (4 policies).
   - break_recommendations: owner-scoped CRUD (4 policies).
   - recognition_logs: SELECT for public or own rows; INSERT only as given_by; UPDATE/DELETE by given_by.
*/

-- wellness_logs
CREATE TABLE IF NOT EXISTS wellness_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text CHECK (tipo IN ('mood_emoji', 'break_taken', 'wellness_pulse')),
  mood text,
  mood_context text,
  break_type text,
  break_duration_minutes integer,
  break_effectiveness integer,
  energy_level integer,
  work_life_balance integer,
  team_support integer,
  burnout_risk_self_reported integer,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- break_recommendations
CREATE TABLE IF NOT EXISTS break_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_reason text,
  work_duration_minutes integer,
  recommendation_type text,
  recommendation_text text,
  break_taken boolean DEFAULT false,
  break_taken_at timestamptz,
  break_duration_minutes integer,
  created_at timestamptz DEFAULT now()
);

-- recognition_logs
CREATE TABLE IF NOT EXISTS recognition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  given_by uuid NOT NULL REFERENCES auth.users(id),
  given_to uuid NOT NULL REFERENCES auth.users(id),
  tipo text,
  message text,
  event_id text REFERENCES events(id),
  public boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wellness_user ON wellness_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_break_rec_user ON break_recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recognition_to ON recognition_logs(given_to, created_at DESC);

-- RLS
ALTER TABLE wellness_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE recognition_logs ENABLE ROW LEVEL SECURITY;

-- wellness_logs policies (owner-scoped)
DROP POLICY IF EXISTS "select_own_wellness_logs" ON wellness_logs;
CREATE POLICY "select_own_wellness_logs" ON wellness_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_wellness_logs" ON wellness_logs;
CREATE POLICY "insert_own_wellness_logs" ON wellness_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_wellness_logs" ON wellness_logs;
CREATE POLICY "update_own_wellness_logs" ON wellness_logs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_wellness_logs" ON wellness_logs;
CREATE POLICY "delete_own_wellness_logs" ON wellness_logs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- break_recommendations policies (owner-scoped)
DROP POLICY IF EXISTS "select_own_break_recs" ON break_recommendations;
CREATE POLICY "select_own_break_recs" ON break_recommendations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_break_recs" ON break_recommendations;
CREATE POLICY "insert_own_break_recs" ON break_recommendations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_break_recs" ON break_recommendations;
CREATE POLICY "update_own_break_recs" ON break_recommendations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_break_recs" ON break_recommendations;
CREATE POLICY "delete_own_break_recs" ON break_recommendations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- recognition_logs policies
DROP POLICY IF EXISTS "select_recognition_logs" ON recognition_logs;
CREATE POLICY "select_recognition_logs" ON recognition_logs
  FOR SELECT TO authenticated
  USING (public = true OR given_to = auth.uid() OR given_by = auth.uid());

DROP POLICY IF EXISTS "insert_recognition_logs" ON recognition_logs;
CREATE POLICY "insert_recognition_logs" ON recognition_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = given_by);

DROP POLICY IF EXISTS "update_recognition_logs" ON recognition_logs;
CREATE POLICY "update_recognition_logs" ON recognition_logs
  FOR UPDATE TO authenticated USING (auth.uid() = given_by) WITH CHECK (auth.uid() = given_by);

DROP POLICY IF EXISTS "delete_recognition_logs" ON recognition_logs;
CREATE POLICY "delete_recognition_logs" ON recognition_logs
  FOR DELETE TO authenticated USING (auth.uid() = given_by);
