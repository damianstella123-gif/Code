/*
# Fix events UPDATE policy to support handover and team member edits

## Problem
The `events_update_owner_admin` policy restricted updates to the event's
project_manager_id (PM) or Admin/Super Admin. This broke handover (passa
consegne) in two ways:
1. A team member (not the current PM) initiating a handover was blocked.
2. A PM changing project_manager_id to someone else was blocked by the
   WITH CHECK clause, which evaluated the NEW row where they were no longer PM.

Child tables (event_program, event_suppliers, etc.) already use
`can_access_event(event_id)` for their UPDATE policies, which grants
access to Admin, Super Admin, Amministrazione, the PM, event_members
rows, and team_member_ids array members. The events table was inconsistent.

## Fix
Replace the events UPDATE policy to use `can_access_event(id)` for both
USING and WITH CHECK, consistent with child tables. This allows:
- The PM to update the event (including changing PM during handover)
- Team members to update event fields they have access to
- Admin / Super Admin / Amministrazione to update any event
- The WITH CHECK passes because can_access_event checks the caller's
  membership/role, not the NEW row's PM field — the event id does not
  change during an update, so the caller's access is stable.

## Security
- DELETE policy remains PM-or-Admin only (unchanged) — deleting an event
  is a destructive action that should be restricted.
- No anon policies exist on events (confirmed clean).

## Modified policies
- `events_update_owner_admin` → replaced with `can_access_event(id)` check
*/

-- Replace the UPDATE policy
DROP POLICY IF EXISTS "events_update_owner_admin" ON events;
CREATE POLICY "events_update_owner_admin" ON events
  FOR UPDATE
  TO authenticated
  USING (can_access_event(id))
  WITH CHECK (can_access_event(id));
