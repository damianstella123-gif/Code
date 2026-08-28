/*
# Create event_handovers table for "Passaggio di Consegne" feature

When a team member goes on leave they can hand over an event to a colleague,
transferring or sharing access along with a data-derived status recap.

## New Tables
- `event_handovers`
  - `id` (uuid, PK) — unique handover record
  - `event_id` (text, NOT NULL) — FK concept to events.id
  - `from_user` (uuid, NOT NULL) — user initiating the handover
  - `to_user` (uuid, NOT NULL) — colleague receiving the event
  - `recap_snapshot` (jsonb, NOT NULL) — factual recap at handover time
  - `note` (text) — optional free-text note from the initiator
  - `stayed_in_team` (boolean, NOT NULL) — whether initiator stayed in the event team
  - `made_responsible` (boolean, NOT NULL) — whether colleague became PM
  - `created_at` (timestamptz) — when the handover occurred

## Security
- RLS enabled on event_handovers.
- SELECT: involved users (from_user or to_user) + Admin/Super Admin.
- INSERT: user must be the from_user AND must have access to the event.
- UPDATE: not allowed (handovers are immutable records).
- DELETE: Admin/Super Admin only.

## Important Notes
1. No UPDATE policy — handover records are historical and should not be modified.
2. The recap_snapshot stores the factual state at handover time as a JSON object.
3. The from_user column defaults to auth.uid() so the frontend doesn't need to pass it.
*/

CREATE TABLE IF NOT EXISTS event_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  from_user uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  to_user uuid NOT NULL REFERENCES auth.users(id),
  recap_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  stayed_in_team boolean NOT NULL DEFAULT true,
  made_responsible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_handovers_event_id ON event_handovers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_handovers_from_user ON event_handovers(from_user);
CREATE INDEX IF NOT EXISTS idx_event_handovers_to_user ON event_handovers(to_user);

ALTER TABLE event_handovers ENABLE ROW LEVEL SECURITY;

-- SELECT: involved users + admins
DROP POLICY IF EXISTS "eh_select_involved_or_admin" ON event_handovers;
CREATE POLICY "eh_select_involved_or_admin" ON event_handovers FOR SELECT
  TO authenticated
  USING (
    auth.uid() = from_user
    OR auth.uid() = to_user
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

-- INSERT: must be from_user and must have event access
DROP POLICY IF EXISTS "eh_insert_from_user_with_access" ON event_handovers;
CREATE POLICY "eh_insert_from_user_with_access" ON event_handovers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = from_user
    AND can_access_event(event_id)
  );

-- No UPDATE policy (immutable records)

-- DELETE: admin only
DROP POLICY IF EXISTS "eh_delete_admin_only" ON event_handovers;
CREATE POLICY "eh_delete_admin_only" ON event_handovers FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));
