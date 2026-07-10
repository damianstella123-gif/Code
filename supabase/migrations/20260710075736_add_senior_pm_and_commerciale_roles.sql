/*
# Add Senior PM and Commerciale roles + cashflow_config table

## Overview
Extends the role system with two new roles and creates a cashflow_config table
for per-role payment autonomy thresholds.

## Changes

### 1. New enum values added to app_role:
- 'Senior PM' — PM with extended autonomy (up to €5,000 payments without approval)
- 'Commerciale' — CRM, clients, presentations focused role

### 2. New table: cashflow_config
- `id` (int, single-row config table)
- `soglia_autonomia_pm_eur` (numeric, default 2000) — PM auto-approve threshold
- `soglia_senior_pm_eur` (numeric, default 5000) — Senior PM auto-approve threshold
- `updated_at` (timestamptz)

### 3. Security
- RLS enabled on cashflow_config
- Only Admin/Super Admin/Finance can SELECT/UPDATE

### Important notes:
1. Admin and Finance have unlimited payment autonomy (no threshold applies)
2. The cashflow_config is a single-row configuration table (enforced via CHECK on id=1)
3. Existing roles are unchanged
*/

-- Add new enum values (safe: IF NOT EXISTS pattern via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Senior PM' AND enumtypid = 'app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'Senior PM';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Commerciale' AND enumtypid = 'app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'Commerciale';
  END IF;
END $$;

-- Create cashflow_config table (single-row pattern)
CREATE TABLE IF NOT EXISTS cashflow_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  soglia_autonomia_pm_eur numeric NOT NULL DEFAULT 2000,
  soglia_senior_pm_eur numeric NOT NULL DEFAULT 5000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the single row if not exists
INSERT INTO cashflow_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE cashflow_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_select" ON cashflow_config;
CREATE POLICY "config_select" ON cashflow_config FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

DROP POLICY IF EXISTS "config_update" ON cashflow_config;
CREATE POLICY "config_update" ON cashflow_config FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));
