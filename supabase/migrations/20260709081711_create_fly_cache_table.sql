/*
# Create fly_cache table for response caching

1. New Tables
   - `fly_cache`
     - `id` (uuid, primary key)
     - `user_id` (uuid, not null, references auth.users)
     - `query_hash` (text, not null) — base64 of first 100 chars of message
     - `response` (text, not null) — cached full response text
     - `created_at` (timestamptz, default now())

2. Security
   - RLS enabled.
   - Authenticated users can SELECT/INSERT/DELETE only their own rows.

3. Notes
   - Used by fly-gateway to cache identical queries within 1 hour.
   - Stale entries (> 2 hours) cleaned up on each gateway call.
   - Index on (user_id, query_hash, created_at) for fast lookups.
*/

CREATE TABLE IF NOT EXISTS fly_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query_hash text NOT NULL,
  response text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fly_cache ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fly_cache_lookup
  ON fly_cache (user_id, query_hash, created_at DESC);

DROP POLICY IF EXISTS "select_own_fly_cache" ON fly_cache;
CREATE POLICY "select_own_fly_cache" ON fly_cache FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_fly_cache" ON fly_cache;
CREATE POLICY "insert_own_fly_cache" ON fly_cache FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_fly_cache" ON fly_cache;
CREATE POLICY "delete_own_fly_cache" ON fly_cache FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
