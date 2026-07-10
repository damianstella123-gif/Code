/*
# Role-based RLS policies for event_payments

## Overview
Replaces permissive event_payments policies with role-aware ones:
- PM/Senior PM: can only access payments for events they created or are team members of
- Finance/Admin/Super Admin: full access to all payments
- Commerciale: no access to event_payments

## Changes

### 1. Dropped policies (old permissive):
- select_event_payments (was USING true)
- insert_event_payments (was WITH CHECK true)
- update_event_payments (was USING/WITH CHECK true)
- delete_event_payments (was USING true)

### 2. New policies on event_payments:
- "ep_select_finance_admin" — Finance/Admin/Super Admin: SELECT all
- "ep_select_pm" — PM/Senior PM + other roles: SELECT only own events
- "ep_insert_pm" — PM/Senior PM: INSERT only on own events
- "ep_insert_finance_admin" — Finance/Admin: INSERT on all events
- "ep_update_finance_admin" — Finance/Admin: UPDATE all
- "ep_update_pm" — PM/Senior PM: UPDATE only own events
- "ep_delete_admin" — Only Admin/Super Admin can delete payments

### 3. "Own events" definition:
An event belongs to a user if:
- events.created_by = auth.uid() OR
- auth.uid()::text = ANY(events.team_member_ids)

### Important notes:
1. Commerciale role gets NO access via policies (no matching USING clause)
2. Finance can see everything but cannot delete (only Admin/Super Admin)
3. The policies use get_my_role() helper already created in a prior migration
*/

-- Drop existing permissive policies
DROP POLICY IF EXISTS "select_event_payments" ON event_payments;
DROP POLICY IF EXISTS "insert_event_payments" ON event_payments;
DROP POLICY IF EXISTS "update_event_payments" ON event_payments;
DROP POLICY IF EXISTS "delete_event_payments" ON event_payments;

-- ─── SELECT ────────────────────────────────────────────────────
-- Finance/Admin/Super Admin: see all
DROP POLICY IF EXISTS "ep_select_finance_admin" ON event_payments;
CREATE POLICY "ep_select_finance_admin" ON event_payments FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

-- PM/Senior PM and other non-finance roles: see only own events
DROP POLICY IF EXISTS "ep_select_pm" ON event_payments;
CREATE POLICY "ep_select_pm" ON event_payments FOR SELECT
  TO authenticated
  USING (
    get_my_role() NOT IN ('Admin', 'Super Admin', 'Finance', 'Commerciale')
    AND event_id IN (
      SELECT id FROM events
      WHERE created_by = auth.uid()
        OR auth.uid()::text = ANY(team_member_ids)
    )
  );

-- ─── INSERT ────────────────────────────────────────────────────
-- Finance/Admin/Super Admin: insert on any event
DROP POLICY IF EXISTS "ep_insert_finance_admin" ON event_payments;
CREATE POLICY "ep_insert_finance_admin" ON event_payments FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

-- PM/Senior PM: insert only on own events
DROP POLICY IF EXISTS "ep_insert_pm" ON event_payments;
CREATE POLICY "ep_insert_pm" ON event_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('Project Manager', 'Senior PM')
    AND event_id IN (
      SELECT id FROM events
      WHERE created_by = auth.uid()
        OR auth.uid()::text = ANY(team_member_ids)
    )
  );

-- ─── UPDATE ────────────────────────────────────────────────────
-- Finance/Admin/Super Admin: update all
DROP POLICY IF EXISTS "ep_update_finance_admin" ON event_payments;
CREATE POLICY "ep_update_finance_admin" ON event_payments FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

-- PM/Senior PM: update only own events
DROP POLICY IF EXISTS "ep_update_pm" ON event_payments;
CREATE POLICY "ep_update_pm" ON event_payments FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('Project Manager', 'Senior PM')
    AND event_id IN (
      SELECT id FROM events
      WHERE created_by = auth.uid()
        OR auth.uid()::text = ANY(team_member_ids)
    )
  )
  WITH CHECK (
    get_my_role() IN ('Project Manager', 'Senior PM')
    AND event_id IN (
      SELECT id FROM events
      WHERE created_by = auth.uid()
        OR auth.uid()::text = ANY(team_member_ids)
    )
  );

-- ─── DELETE ────────────────────────────────────────────────────
-- Only Admin/Super Admin can delete payments
DROP POLICY IF EXISTS "ep_delete_admin" ON event_payments;
CREATE POLICY "ep_delete_admin" ON event_payments FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));
