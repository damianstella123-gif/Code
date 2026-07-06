/*
# Fix feedback RLS policies for modify and delete

1. Problem
   - DELETE policy only allows author (autore_id = auth.uid()), blocking admins.
   - UPDATE policy is wide open (USING true / WITH CHECK true), but upsert triggers INSERT check.
   - INSERT policy requires autore_id = auth.uid(), which fails on upsert-based edits.
   - Orphaned rows (autore_id IS NULL) cannot be deleted/updated by anyone except via open update.

2. Changes
   - Replace DELETE policy: author can delete own OR user is Admin/Super Admin (via profiles.role).
   - Replace UPDATE policy: author can update own OR user is Admin/Super Admin.
   - Replace INSERT policy: autore_id must equal auth.uid() (unchanged logic, re-stated for clarity).
   - SELECT policy: unchanged (all authenticated can read).

3. Security
   - Admin/Super Admin check uses a subquery on profiles table by auth.uid().
   - Orphaned feedback (autore_id IS NULL) can only be managed by admins.
*/

-- DELETE: author OR admin
DROP POLICY IF EXISTS "delete_feedback" ON feedback;
CREATE POLICY "delete_feedback" ON feedback FOR DELETE
  TO authenticated
  USING (
    autore_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('Admin', 'Super Admin')
    )
  );

-- UPDATE: author OR admin
DROP POLICY IF EXISTS "update_feedback" ON feedback;
CREATE POLICY "update_feedback" ON feedback FOR UPDATE
  TO authenticated
  USING (
    autore_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('Admin', 'Super Admin')
    )
  )
  WITH CHECK (
    autore_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('Admin', 'Super Admin')
    )
  );

-- INSERT: any authenticated user, autore_id must be own uid
DROP POLICY IF EXISTS "insert_feedback" ON feedback;
CREATE POLICY "insert_feedback" ON feedback FOR INSERT
  TO authenticated
  WITH CHECK (autore_id = auth.uid());

-- SELECT: unchanged, re-stated for completeness
DROP POLICY IF EXISTS "select_feedback" ON feedback;
CREATE POLICY "select_feedback" ON feedback FOR SELECT
  TO authenticated
  USING (true);
