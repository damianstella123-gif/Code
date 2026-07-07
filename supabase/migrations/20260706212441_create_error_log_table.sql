/*
# Create error_log table for centralized error tracking

1. New Tables
   - `error_log`
     - `id` (uuid, primary key, default gen_random_uuid())
     - `created_at` (timestamptz, default now())
     - `user_id` (uuid, nullable)
     - `pagina` (text, not null) — page/component where error occurred
     - `azione` (text, not null) — action attempted
     - `messaggio` (text, not null) — error message
     - `dettaglio` (jsonb) — additional context

2. Security
   - RLS enabled.
   - INSERT: any authenticated user.
   - SELECT: only Admin / Super Admin (via get_my_role() on profiles.role text column).

3. Notes
   - Index on created_at DESC for recent-first queries.
*/

CREATE TABLE IF NOT EXISTS error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pagina text NOT NULL,
  azione text NOT NULL,
  messaggio text NOT NULL,
  dettaglio jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_insert_errors" ON error_log;
CREATE POLICY "authenticated_insert_errors" ON error_log FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_select_errors" ON error_log;
CREATE POLICY "admin_select_errors" ON error_log FOR SELECT
  TO authenticated USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('Admin', 'Super Admin')
  );

CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON error_log(created_at DESC);
