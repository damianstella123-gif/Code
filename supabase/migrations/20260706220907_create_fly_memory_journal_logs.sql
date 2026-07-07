/*
# Create Fly memory, journal, and logs tables

Provides the persistence layer for Fly's memory system, action journal,
and observability/cost tracking.

## 1. New Tables

### fly_memory
- `id` (uuid, primary key)
- `user_id` (uuid, not null, unique) — one memory record per user
- `preferences` (jsonb, default '{}') — user tone/style preferences learned over time
- `corrections` (jsonb, default '[]') — array of last 20 corrections received
- `context` (jsonb, default '{}') — mappings: name→id, abbreviations, known entities
- `updated_at` (timestamptz, default now())

### fly_journal
- `id` (uuid, primary key)
- `user_id` (uuid, not null) — who triggered the action
- `action_type` (text) — create_task, create_memo, update_task_status, etc.
- `proposal` (jsonb) — the full proposal object that was presented
- `outcome` (text, not null) — accepted / rejected / modified
- `modification_note` (text) — what the user changed if modified
- `created_at` (timestamptz, default now())

### fly_logs
- `id` (uuid, primary key)
- `user_id` (uuid) — who made the request
- `created_at` (timestamptz, default now())
- `duration_ms` (int) — total gateway execution time
- `input_tokens` (int) — from Anthropic usage response
- `output_tokens` (int) — from Anthropic usage response
- `estimated_cost_eur` (numeric(10,6)) — computed cost estimate
- `tools_called` (text[]) — array of tool names invoked
- `outcome` (text) — success / error / rate_limited
- `error` (text) — error message if outcome != success

## 2. Security
- RLS enabled on all three tables.
- fly_memory: each authenticated user reads/writes only their own record.
- fly_journal: each authenticated user reads/writes only their own records.
- fly_logs: INSERT by any authenticated user; SELECT only by Admin/Super Admin.

## 3. Indexes
- fly_journal: index on (user_id, created_at DESC) for recent journal lookups.
- fly_logs: index on (created_at DESC) for admin dashboard queries.
- fly_logs: index on (user_id, created_at DESC) for per-user log retrieval.
*/

-- ═══════════════════════════════════════════════════════════════════
-- TABLE: fly_memory
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fly_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{}',
  corrections jsonb NOT NULL DEFAULT '[]',
  context jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fly_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_memory" ON fly_memory;
CREATE POLICY "select_own_memory" ON fly_memory FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_memory" ON fly_memory;
CREATE POLICY "insert_own_memory" ON fly_memory FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_memory" ON fly_memory;
CREATE POLICY "update_own_memory" ON fly_memory FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_memory" ON fly_memory;
CREATE POLICY "delete_own_memory" ON fly_memory FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════
-- TABLE: fly_journal
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fly_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text,
  proposal jsonb,
  outcome text NOT NULL,
  modification_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fly_journal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_journal" ON fly_journal;
CREATE POLICY "select_own_journal" ON fly_journal FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_journal" ON fly_journal;
CREATE POLICY "insert_own_journal" ON fly_journal FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_journal" ON fly_journal;
CREATE POLICY "update_own_journal" ON fly_journal FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_journal" ON fly_journal;
CREATE POLICY "delete_own_journal" ON fly_journal FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fly_journal_user_created
  ON fly_journal (user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- TABLE: fly_logs
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fly_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  duration_ms int,
  input_tokens int,
  output_tokens int,
  estimated_cost_eur numeric(10,6),
  tools_called text[],
  outcome text,
  error text
);

ALTER TABLE fly_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_own_logs" ON fly_logs;
CREATE POLICY "insert_own_logs" ON fly_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_logs_admin" ON fly_logs;
CREATE POLICY "select_logs_admin" ON fly_logs FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('Admin', 'Super Admin')
  );

CREATE INDEX IF NOT EXISTS idx_fly_logs_created
  ON fly_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fly_logs_user_created
  ON fly_logs (user_id, created_at DESC);
