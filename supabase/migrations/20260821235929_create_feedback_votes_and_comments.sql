/*
# Create feedback_votes and feedback_comments tables

1. New Tables
  - `feedback_votes`
    - `feedback_id` (uuid, references feedback)
    - `user_id` (uuid, references auth.users, default auth.uid())
    - Primary key: (feedback_id, user_id) — one vote per user per item
    - `created_at` (timestamptz)
  - `feedback_comments`
    - `id` (uuid, primary key)
    - `feedback_id` (uuid, references feedback)
    - `user_id` (uuid, references auth.users, default auth.uid())
    - `author_name` (text) — display name at time of writing
    - `body` (text, not null)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

2. Security
  - RLS enabled on both tables.
  - feedback_votes: all authenticated can read; users can insert/delete their own votes only.
  - feedback_comments: all authenticated can read; users can insert their own;
    users can update/delete their own OR admins can delete any.

3. Notes
  - Votes use a composite PK so uniqueness is enforced at the DB level.
  - ON DELETE CASCADE ensures cleanup when feedback items are removed.
*/

-- feedback_votes
CREATE TABLE IF NOT EXISTS feedback_votes (
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feedback_id, user_id)
);

ALTER TABLE feedback_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_feedback_votes" ON feedback_votes;
CREATE POLICY "select_feedback_votes" ON feedback_votes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_feedback_vote" ON feedback_votes;
CREATE POLICY "insert_own_feedback_vote" ON feedback_votes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_feedback_vote" ON feedback_votes;
CREATE POLICY "delete_own_feedback_vote" ON feedback_votes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- feedback_comments
CREATE TABLE IF NOT EXISTS feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_feedback_comments" ON feedback_comments;
CREATE POLICY "select_feedback_comments" ON feedback_comments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_feedback_comment" ON feedback_comments;
CREATE POLICY "insert_own_feedback_comment" ON feedback_comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_feedback_comment" ON feedback_comments;
CREATE POLICY "update_own_feedback_comment" ON feedback_comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_feedback_comment" ON feedback_comments;
CREATE POLICY "delete_feedback_comment" ON feedback_comments FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'Super Admin')
    )
  );

-- Index for fast vote counts
CREATE INDEX IF NOT EXISTS idx_feedback_votes_feedback_id ON feedback_votes(feedback_id);
-- Index for fast comment listing
CREATE INDEX IF NOT EXISTS idx_feedback_comments_feedback_id ON feedback_comments(feedback_id);
