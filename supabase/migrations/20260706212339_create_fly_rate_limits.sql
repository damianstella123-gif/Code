/*
# Create fly_rate_limits table for API rate limiting

1. New Tables
   - `fly_rate_limits`
     - `user_id` (uuid, not null, references auth.users)
     - `window_start` (timestamptz, not null) — start of the 1-minute window
     - `count` (int, not null, default 1) — number of requests in this window
     - Primary key: (user_id, window_start)

2. Security
   - RLS enabled.
   - Authenticated users can insert/update/delete only their own rows.
   - No SELECT policy needed (only used server-side via service role or user client).

3. Notes
   - Used by fly-gateway to enforce 20 req/min per user.
   - Old rows (> 1 hour) are cleaned up on each write.
*/

CREATE TABLE IF NOT EXISTS fly_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, window_start)
);

ALTER TABLE fly_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_rate_limits" ON fly_rate_limits;
CREATE POLICY "users_manage_own_rate_limits" ON fly_rate_limits FOR ALL
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
