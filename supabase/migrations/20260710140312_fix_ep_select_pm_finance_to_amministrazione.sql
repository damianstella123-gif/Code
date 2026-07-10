/*
# Fix ep_select_pm policy: replace 'Finance' with 'Amministrazione'

## Problem
The ep_select_pm policy on event_payments still references 'Finance' in its exclusion list.
This policy is meant to allow PM/Senior PM to see payments for their own events, while
excluding roles that already have full access via ep_select_finance_admin.

## Changes
- Drop and recreate ep_select_pm with 'Amministrazione' instead of 'Finance'
*/

DROP POLICY IF EXISTS "ep_select_pm" ON event_payments;
CREATE POLICY "ep_select_pm"
  ON event_payments FOR SELECT
  TO authenticated
  USING (
    get_my_role() NOT IN ('Admin', 'Super Admin', 'Amministrazione', 'Commerciale')
    AND event_id IN (
      SELECT events.id FROM events
      WHERE event_payments.created_by = auth.uid()
        OR (auth.uid())::text = ANY(events.team_member_ids)
    )
  );
