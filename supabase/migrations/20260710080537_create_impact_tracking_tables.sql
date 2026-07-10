/*
# Create impact tracking tables for sustainability/efficiency metrics

## Overview
Creates two tables for tracking team efficiency and sustainability impact:
- impact_actions_log: raw log of individual actions with time/value savings
- impact_monthly_reports: aggregated monthly summaries per user

These tables are used by the cleanup function to aggregate old granular data
into monthly summaries, keeping the system performant.

## New Tables

### 1. impact_actions_log
- `id` (uuid, primary key)
- `user_id` (uuid, FK to profiles)
- `action_type` (text) — type of efficiency action
- `minuti_risparmiati` (numeric) — minutes saved by this action
- `valore_eur` (numeric) — estimated EUR value of time saved
- `descrizione` (text) — description of the action
- `created_at` (timestamptz)

### 2. impact_monthly_reports
- `id` (uuid, primary key)
- `user_id` (uuid, FK to profiles)
- `mese` (int) — month number
- `anno` (int) — year
- `ore_risparmiate` (numeric) — total hours saved
- `valore_eur` (numeric) — total EUR value saved
- `kg_co2_risparmiati` (numeric) — CO2 savings
- Unique constraint on (user_id, mese, anno)

## Security
- RLS enabled on both tables
- Only Admin/Super Admin/Finance can see all records
- Other users can see their own records
*/

-- impact_actions_log
CREATE TABLE IF NOT EXISTS impact_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL DEFAULT 'fly_query',
  minuti_risparmiati numeric NOT NULL DEFAULT 0,
  valore_eur numeric NOT NULL DEFAULT 0,
  descrizione text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impact_actions_log_user ON impact_actions_log(user_id);
CREATE INDEX IF NOT EXISTS idx_impact_actions_log_created ON impact_actions_log(created_at);

ALTER TABLE impact_actions_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "impact_log_select_own" ON impact_actions_log;
CREATE POLICY "impact_log_select_own" ON impact_actions_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

DROP POLICY IF EXISTS "impact_log_insert_own" ON impact_actions_log;
CREATE POLICY "impact_log_insert_own" ON impact_actions_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "impact_log_delete_admin" ON impact_actions_log;
CREATE POLICY "impact_log_delete_admin" ON impact_actions_log FOR DELETE
  TO authenticated USING (get_my_role() IN ('Admin', 'Super Admin'));

-- impact_monthly_reports
CREATE TABLE IF NOT EXISTS impact_monthly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mese int NOT NULL,
  anno int NOT NULL,
  ore_risparmiate numeric NOT NULL DEFAULT 0,
  valore_eur numeric NOT NULL DEFAULT 0,
  kg_co2_risparmiati numeric NOT NULL DEFAULT 0,
  UNIQUE (user_id, mese, anno)
);

CREATE INDEX IF NOT EXISTS idx_impact_monthly_user ON impact_monthly_reports(user_id);

ALTER TABLE impact_monthly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "impact_monthly_select_own" ON impact_monthly_reports;
CREATE POLICY "impact_monthly_select_own" ON impact_monthly_reports FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

DROP POLICY IF EXISTS "impact_monthly_insert_admin" ON impact_monthly_reports;
CREATE POLICY "impact_monthly_insert_admin" ON impact_monthly_reports FOR INSERT
  TO authenticated WITH CHECK (get_my_role() IN ('Admin', 'Super Admin'));

DROP POLICY IF EXISTS "impact_monthly_update_admin" ON impact_monthly_reports;
CREATE POLICY "impact_monthly_update_admin" ON impact_monthly_reports FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin'));

DROP POLICY IF EXISTS "impact_monthly_delete_admin" ON impact_monthly_reports;
CREATE POLICY "impact_monthly_delete_admin" ON impact_monthly_reports FOR DELETE
  TO authenticated USING (get_my_role() IN ('Admin', 'Super Admin'));
