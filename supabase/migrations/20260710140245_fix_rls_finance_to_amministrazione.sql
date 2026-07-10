/*
# Fix RLS policies: rename 'Finance' to 'Amministrazione'

## Problem
Migration 20260710084519 renamed the role from 'Finance' to 'Amministrazione' in profiles,
but did NOT update the RLS policies. Users with role 'Amministrazione' are blocked by RLS
on all fiscal tables.

## Affected tables and policies
- admin_documents: fiscal_select, fiscal_insert, fiscal_update, fiscal_delete
- admin_entrate: fiscal_select, fiscal_insert, fiscal_update, fiscal_delete
- admin_fatture: fiscal_select, fiscal_insert, fiscal_update, fiscal_delete
- cashflow_config: config_select, config_update
- event_payments: ep_select_finance_admin, ep_insert_finance_admin, ep_update_finance_admin
- impact_actions_log: impact_log_select_own
- impact_monthly_reports: impact_monthly_select_own
- invoices: fiscal_select, fiscal_insert, fiscal_update, fiscal_delete

## Changes
- Drop all affected policies
- Recreate with 'Amministrazione' replacing 'Finance'
- event_payments ep_select_pm policy left untouched (no Finance reference in logic)

## Security
- No change in access model, only correcting the role name
- Admin, Super Admin, Amministrazione retain full fiscal access
- PM/Senior PM retain scoped event_payments access via separate policies
*/

-- ============================================================
-- admin_documents
-- ============================================================
DROP POLICY IF EXISTS "fiscal_select_admin_documents" ON admin_documents;
CREATE POLICY "fiscal_select_admin_documents"
  ON admin_documents FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_insert_admin_documents" ON admin_documents;
CREATE POLICY "fiscal_insert_admin_documents"
  ON admin_documents FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_update_admin_documents" ON admin_documents;
CREATE POLICY "fiscal_update_admin_documents"
  ON admin_documents FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_delete_admin_documents" ON admin_documents;
CREATE POLICY "fiscal_delete_admin_documents"
  ON admin_documents FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

-- ============================================================
-- admin_entrate
-- ============================================================
DROP POLICY IF EXISTS "fiscal_select_admin_entrate" ON admin_entrate;
CREATE POLICY "fiscal_select_admin_entrate"
  ON admin_entrate FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_insert_admin_entrate" ON admin_entrate;
CREATE POLICY "fiscal_insert_admin_entrate"
  ON admin_entrate FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_update_admin_entrate" ON admin_entrate;
CREATE POLICY "fiscal_update_admin_entrate"
  ON admin_entrate FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_delete_admin_entrate" ON admin_entrate;
CREATE POLICY "fiscal_delete_admin_entrate"
  ON admin_entrate FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

-- ============================================================
-- admin_fatture
-- ============================================================
DROP POLICY IF EXISTS "fiscal_select_admin_fatture" ON admin_fatture;
CREATE POLICY "fiscal_select_admin_fatture"
  ON admin_fatture FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_insert_admin_fatture" ON admin_fatture;
CREATE POLICY "fiscal_insert_admin_fatture"
  ON admin_fatture FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_update_admin_fatture" ON admin_fatture;
CREATE POLICY "fiscal_update_admin_fatture"
  ON admin_fatture FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_delete_admin_fatture" ON admin_fatture;
CREATE POLICY "fiscal_delete_admin_fatture"
  ON admin_fatture FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

-- ============================================================
-- cashflow_config
-- ============================================================
DROP POLICY IF EXISTS "config_select" ON cashflow_config;
CREATE POLICY "config_select"
  ON cashflow_config FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "config_update" ON cashflow_config;
CREATE POLICY "config_update"
  ON cashflow_config FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

-- ============================================================
-- event_payments (only Finance-referencing policies)
-- ============================================================
DROP POLICY IF EXISTS "ep_select_finance_admin" ON event_payments;
CREATE POLICY "ep_select_finance_admin"
  ON event_payments FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "ep_insert_finance_admin" ON event_payments;
CREATE POLICY "ep_insert_finance_admin"
  ON event_payments FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "ep_update_finance_admin" ON event_payments;
CREATE POLICY "ep_update_finance_admin"
  ON event_payments FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

-- ============================================================
-- impact_actions_log
-- ============================================================
DROP POLICY IF EXISTS "impact_log_select_own" ON impact_actions_log;
CREATE POLICY "impact_log_select_own"
  ON impact_actions_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

-- ============================================================
-- impact_monthly_reports
-- ============================================================
DROP POLICY IF EXISTS "impact_monthly_select_own" ON impact_monthly_reports;
CREATE POLICY "impact_monthly_select_own"
  ON impact_monthly_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

-- ============================================================
-- invoices
-- ============================================================
DROP POLICY IF EXISTS "fiscal_select_invoices" ON invoices;
CREATE POLICY "fiscal_select_invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_insert_invoices" ON invoices;
CREATE POLICY "fiscal_insert_invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_update_invoices" ON invoices;
CREATE POLICY "fiscal_update_invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "fiscal_delete_invoices" ON invoices;
CREATE POLICY "fiscal_delete_invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));
