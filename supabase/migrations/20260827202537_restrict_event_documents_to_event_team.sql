/*
# Restrict event_documents access to event team members

1. Security Changes
   - Drops the overly-permissive `select_event_documents` policy (USING true) that
     allowed any authenticated user to read ALL event documents regardless of team
     membership.
   - Drops the overly-permissive `insert_event_documents` policy (WITH CHECK true)
     that allowed any authenticated user to add documents to any event.
   - Creates a new SELECT policy scoped to event team members via
     `can_access_event(event_id)`, which grants access to:
       * Admin, Super Admin, Amministrazione (always)
       * The event's project manager
       * Users in `event_members` for that event
       * Users in the event's `team_member_ids` array
   - Creates a new INSERT policy with the same `can_access_event(event_id)` check.
   - UPDATE and DELETE policies already restrict to owner or Admin/Super Admin,
     which is correct — they are not changed.

2. Important Notes
   - `can_access_event` is a SECURITY DEFINER function that internally checks the
     user's role and event membership. Admin/Super Admin always pass.
   - This matches the pattern used on the `documents` table (migration 20260719122655).
   - No data changes; only policy replacements.
*/

-- Drop the permissive SELECT policy
DROP POLICY IF EXISTS "select_event_documents" ON event_documents;

-- Create event-team-scoped SELECT
CREATE POLICY "select_event_documents" ON event_documents
  FOR SELECT TO authenticated
  USING (can_access_event(event_id));

-- Drop the permissive INSERT policy
DROP POLICY IF EXISTS "insert_event_documents" ON event_documents;

-- Create event-team-scoped INSERT
CREATE POLICY "insert_event_documents" ON event_documents
  FOR INSERT TO authenticated
  WITH CHECK (can_access_event(event_id));
