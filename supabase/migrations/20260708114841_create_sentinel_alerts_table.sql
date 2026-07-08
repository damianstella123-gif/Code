/*
# Create sentinel_alerts table

1. New Tables
   - `sentinel_alerts`
     - `id` (uuid, primary key)
     - `created_at` (timestamptz, default now())
     - `severity` (text, check: info/warning/critical)
     - `category` (text, not null) — alert category key (fly_costs, error_spike, etc.)
     - `message` (text, not null) — human-readable alert message
     - `detail` (jsonb) — additional context/data
     - `status` (text, default 'new', check: new/acknowledged/resolved)
     - `resolved_at` (timestamptz) — when the alert was resolved
     - `resolved_by` (uuid, FK -> profiles) — who resolved the alert

2. Security
   - RLS enabled.
   - INSERT: only service_role (edge function sentinel).
   - SELECT: only Admin / Super Admin via get_my_role().
   - UPDATE: only Admin / Super Admin via get_my_role().

3. Notes
   - Index on (status, created_at DESC) for fetching active alerts.
   - Index on (category, status) for deduplication checks.
*/

CREATE TABLE IF NOT EXISTS sentinel_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  category text NOT NULL,
  message text NOT NULL,
  detail jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE sentinel_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sentinel_select_admin" ON sentinel_alerts;
CREATE POLICY "sentinel_select_admin" ON sentinel_alerts
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

DROP POLICY IF EXISTS "sentinel_update_admin" ON sentinel_alerts;
CREATE POLICY "sentinel_update_admin" ON sentinel_alerts
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin'));

DROP POLICY IF EXISTS "sentinel_insert_authenticated" ON sentinel_alerts;
CREATE POLICY "sentinel_insert_authenticated" ON sentinel_alerts
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin'));

CREATE INDEX IF NOT EXISTS idx_sentinel_alerts_status_created
  ON sentinel_alerts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sentinel_alerts_category_status
  ON sentinel_alerts (category, status);
