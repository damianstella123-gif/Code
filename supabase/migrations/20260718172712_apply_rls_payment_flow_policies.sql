/*
# Apply RLS policies for the administrative payment flow

## Purpose
Creates role-based RLS policies for the three-tier payment model:
- event_payments (PM requests + admin management)
- payment_request_line_links (request-to-economic-line junction)
- payment_request_invoice_links (request-to-invoice junction)
- payment_executions (actual financial disbursements)

## Helper Functions Created
- `is_payment_admin()` — returns true for Admin, Super Admin, Amministrazione
- `is_payment_pm()` — returns true for Project Manager, Senior PM

## Policy Model

### event_payments
- Admin/SA/Amministrazione: full CRUD (delete limited to Admin/SA)
- PM: SELECT own events, INSERT own events (bozza/inviata/NULL legacy),
  UPDATE only own bozza/NULL legacy, DELETE only own bozza
- Legacy compatibility: request_status IS NULL treated as editable by PM

### payment_request_line_links
- Admin/SA/Amministrazione: full SELECT/INSERT/DELETE (no UPDATE — immutable)
- PM: SELECT on own requests, DELETE own bozza links
- PM INSERT deferred to future RPC (polymorphic source_table check unsafe in RLS)

### payment_request_invoice_links
- Admin/SA/Amministrazione: full SELECT/INSERT/DELETE (no UPDATE — immutable)
- PM: SELECT only (read which invoices cover their requests)

### payment_executions
- Admin/SA/Amministrazione: full SELECT/INSERT/UPDATE (DELETE limited to Admin/SA)
- PM: SELECT only on own events/requests

## Important Notes
1. Existing 7 policies on event_payments are DROPPED and replaced
2. No anon access on any table
3. No USING(true) on any write policy
4. admin_fatture policies are NOT modified
5. PM INSERT on payment_request_line_links is admin-only for now
   (polymorphic source check requires RPC — declared in output)
6. Legacy NULL request_status records remain accessible to PM owners
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: Helper functions
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_payment_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione');
$$;

REVOKE EXECUTE ON FUNCTION public.is_payment_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_payment_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_payment_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_payment_pm()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT get_my_role() IN ('Project Manager', 'Senior PM');
$$;

REVOKE EXECUTE ON FUNCTION public.is_payment_pm() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_payment_pm() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_payment_pm() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: DROP existing event_payments policies
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ep_select_finance_admin" ON event_payments;
DROP POLICY IF EXISTS "ep_select_pm" ON event_payments;
DROP POLICY IF EXISTS "ep_insert_finance_admin" ON event_payments;
DROP POLICY IF EXISTS "ep_insert_pm" ON event_payments;
DROP POLICY IF EXISTS "ep_update_finance_admin" ON event_payments;
DROP POLICY IF EXISTS "ep_update_pm" ON event_payments;
DROP POLICY IF EXISTS "ep_delete_admin" ON event_payments;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3: New event_payments policies
-- ═══════════════════════════════════════════════════════════════════════════════

-- SELECT: Admin/SA/Amministrazione see all
DROP POLICY IF EXISTS "ep_select_admin" ON event_payments;
CREATE POLICY "ep_select_admin" ON event_payments
  FOR SELECT TO authenticated
  USING (is_payment_admin());

-- SELECT: PM sees own events
DROP POLICY IF EXISTS "ep_select_pm_own" ON event_payments;
CREATE POLICY "ep_select_pm_own" ON event_payments
  FOR SELECT TO authenticated
  USING (
    is_payment_pm()
    AND (
      created_by = auth.uid()
      OR event_id IN (
        SELECT e.id FROM events e
        WHERE auth.uid()::text = ANY(COALESCE(e.team_member_ids, ARRAY[]::text[]))
      )
    )
  );

-- INSERT: Admin/SA/Amministrazione can insert anything
DROP POLICY IF EXISTS "ep_insert_admin" ON event_payments;
CREATE POLICY "ep_insert_admin" ON event_payments
  FOR INSERT TO authenticated
  WITH CHECK (is_payment_admin());

-- INSERT: PM can insert on own events, only bozza/inviata/NULL
DROP POLICY IF EXISTS "ep_insert_pm_own" ON event_payments;
CREATE POLICY "ep_insert_pm_own" ON event_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    is_payment_pm()
    AND created_by = auth.uid()
    AND event_id IN (
      SELECT e.id FROM events e
      WHERE auth.uid()::text = ANY(COALESCE(e.team_member_ids, ARRAY[]::text[]))
    )
    AND (request_status IS NULL OR request_status IN ('bozza', 'inviata'))
  );

-- UPDATE: Admin/SA/Amministrazione can update anything
DROP POLICY IF EXISTS "ep_update_admin" ON event_payments;
CREATE POLICY "ep_update_admin" ON event_payments
  FOR UPDATE TO authenticated
  USING (is_payment_admin())
  WITH CHECK (is_payment_admin());

-- UPDATE: PM can update own bozza/NULL legacy
DROP POLICY IF EXISTS "ep_update_pm_own" ON event_payments;
CREATE POLICY "ep_update_pm_own" ON event_payments
  FOR UPDATE TO authenticated
  USING (
    is_payment_pm()
    AND (request_status IS NULL OR request_status = 'bozza')
    AND (
      created_by = auth.uid()
      OR event_id IN (
        SELECT e.id FROM events e
        WHERE auth.uid()::text = ANY(COALESCE(e.team_member_ids, ARRAY[]::text[]))
      )
    )
  )
  WITH CHECK (
    is_payment_pm()
    AND created_by = auth.uid()
    AND event_id IN (
      SELECT e.id FROM events e
      WHERE auth.uid()::text = ANY(COALESCE(e.team_member_ids, ARRAY[]::text[]))
    )
    AND (request_status IS NULL OR request_status IN ('bozza', 'inviata'))
  );

-- DELETE: Admin/SA only
DROP POLICY IF EXISTS "ep_delete_admin_sa" ON event_payments;
CREATE POLICY "ep_delete_admin_sa" ON event_payments
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- DELETE: PM can delete own bozza only (not NULL legacy)
DROP POLICY IF EXISTS "ep_delete_pm_bozza" ON event_payments;
CREATE POLICY "ep_delete_pm_bozza" ON event_payments
  FOR DELETE TO authenticated
  USING (
    is_payment_pm()
    AND created_by = auth.uid()
    AND request_status = 'bozza'
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 4: payment_request_line_links policies
-- ═══════════════════════════════════════════════════════════════════════════════

-- SELECT: Admin sees all
DROP POLICY IF EXISTS "prll_select_admin" ON payment_request_line_links;
CREATE POLICY "prll_select_admin" ON payment_request_line_links
  FOR SELECT TO authenticated
  USING (is_payment_admin());

-- SELECT: PM sees links for own requests
DROP POLICY IF EXISTS "prll_select_pm" ON payment_request_line_links;
CREATE POLICY "prll_select_pm" ON payment_request_line_links
  FOR SELECT TO authenticated
  USING (
    is_payment_pm()
    AND EXISTS (
      SELECT 1 FROM event_payments ep
      WHERE ep.id = payment_request_line_links.payment_request_id
        AND (
          ep.created_by = auth.uid()
          OR ep.event_id IN (
            SELECT e.id FROM events e
            WHERE auth.uid()::text = ANY(COALESCE(e.team_member_ids, ARRAY[]::text[]))
          )
        )
    )
  );

-- INSERT: Admin only (PM INSERT deferred to RPC for polymorphic safety)
DROP POLICY IF EXISTS "prll_insert_admin" ON payment_request_line_links;
CREATE POLICY "prll_insert_admin" ON payment_request_line_links
  FOR INSERT TO authenticated
  WITH CHECK (is_payment_admin());

-- No UPDATE policy — links are immutable

-- DELETE: Admin can delete
DROP POLICY IF EXISTS "prll_delete_admin" ON payment_request_line_links;
CREATE POLICY "prll_delete_admin" ON payment_request_line_links
  FOR DELETE TO authenticated
  USING (is_payment_admin());

-- DELETE: PM can delete links on own bozza requests
DROP POLICY IF EXISTS "prll_delete_pm_bozza" ON payment_request_line_links;
CREATE POLICY "prll_delete_pm_bozza" ON payment_request_line_links
  FOR DELETE TO authenticated
  USING (
    is_payment_pm()
    AND EXISTS (
      SELECT 1 FROM event_payments ep
      WHERE ep.id = payment_request_line_links.payment_request_id
        AND ep.created_by = auth.uid()
        AND ep.request_status = 'bozza'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 5: payment_request_invoice_links policies
-- ═══════════════════════════════════════════════════════════════════════════════

-- SELECT: Admin sees all
DROP POLICY IF EXISTS "pril_select_admin" ON payment_request_invoice_links;
CREATE POLICY "pril_select_admin" ON payment_request_invoice_links
  FOR SELECT TO authenticated
  USING (is_payment_admin());

-- SELECT: PM sees links for own requests (read-only insight)
DROP POLICY IF EXISTS "pril_select_pm" ON payment_request_invoice_links;
CREATE POLICY "pril_select_pm" ON payment_request_invoice_links
  FOR SELECT TO authenticated
  USING (
    is_payment_pm()
    AND EXISTS (
      SELECT 1 FROM event_payments ep
      WHERE ep.id = payment_request_invoice_links.payment_request_id
        AND (
          ep.created_by = auth.uid()
          OR ep.event_id IN (
            SELECT e.id FROM events e
            WHERE auth.uid()::text = ANY(COALESCE(e.team_member_ids, ARRAY[]::text[]))
          )
        )
    )
  );

-- INSERT: Admin only (only Amministrazione reconciles invoices)
DROP POLICY IF EXISTS "pril_insert_admin" ON payment_request_invoice_links;
CREATE POLICY "pril_insert_admin" ON payment_request_invoice_links
  FOR INSERT TO authenticated
  WITH CHECK (is_payment_admin());

-- No UPDATE policy — links are immutable

-- DELETE: Admin only
DROP POLICY IF EXISTS "pril_delete_admin" ON payment_request_invoice_links;
CREATE POLICY "pril_delete_admin" ON payment_request_invoice_links
  FOR DELETE TO authenticated
  USING (is_payment_admin());

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 6: payment_executions policies
-- ═══════════════════════════════════════════════════════════════════════════════

-- SELECT: Admin sees all
DROP POLICY IF EXISTS "pe_select_admin" ON payment_executions;
CREATE POLICY "pe_select_admin" ON payment_executions
  FOR SELECT TO authenticated
  USING (is_payment_admin());

-- SELECT: PM sees executions linked to own requests or own events
DROP POLICY IF EXISTS "pe_select_pm" ON payment_executions;
CREATE POLICY "pe_select_pm" ON payment_executions
  FOR SELECT TO authenticated
  USING (
    is_payment_pm()
    AND (
      EXISTS (
        SELECT 1 FROM event_payments ep
        WHERE ep.id = payment_executions.payment_request_id
          AND (
            ep.created_by = auth.uid()
            OR ep.event_id IN (
              SELECT e.id FROM events e
              WHERE auth.uid()::text = ANY(COALESCE(e.team_member_ids, ARRAY[]::text[]))
            )
          )
      )
      OR payment_executions.event_id IN (
        SELECT e.id FROM events e
        WHERE auth.uid()::text = ANY(COALESCE(e.team_member_ids, ARRAY[]::text[]))
      )
    )
  );

-- INSERT: Admin only
DROP POLICY IF EXISTS "pe_insert_admin" ON payment_executions;
CREATE POLICY "pe_insert_admin" ON payment_executions
  FOR INSERT TO authenticated
  WITH CHECK (is_payment_admin());

-- UPDATE: Admin only
DROP POLICY IF EXISTS "pe_update_admin" ON payment_executions;
CREATE POLICY "pe_update_admin" ON payment_executions
  FOR UPDATE TO authenticated
  USING (is_payment_admin())
  WITH CHECK (is_payment_admin());

-- DELETE: Admin/Super Admin only (Amministrazione uses soft-cancel)
DROP POLICY IF EXISTS "pe_delete_admin_sa" ON payment_executions;
CREATE POLICY "pe_delete_admin_sa" ON payment_executions
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));
