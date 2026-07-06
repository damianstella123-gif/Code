/*
# Restrict fiscal/admin tables to Admin, Super Admin, and Finance roles

## Overview
Implements role-based database-level access control on fiscal tables.
Only users with role 'Admin', 'Super Admin', or 'Finance' can access these tables.
All other authenticated users (Project Manager, User, etc.) are denied.

## Changes

### 1. New function: get_my_role()
- SECURITY DEFINER, STABLE
- Returns the `role` text column from the current user's profile
- Used in RLS policies to check role membership

### 2. Tables restricted (fiscal/admin area):
- admin_entrate (client income tracking)
- admin_fatture (invoice management)
- invoices (legacy invoices table)
- admin_documents (administrative documents)

### 3. Tables NOT restricted:
- budgets: used by PM event flows (Eventi, Calendario, Presentazioni pages)
- events, tasks, clients, suppliers, all event detail tables: accessible to all authenticated
- chat, feedback, profiles: accessible to all authenticated

### 4. Security changes:
- All previous permissive policies on the 4 fiscal tables are DROPPED
- New SELECT/INSERT/UPDATE/DELETE policies restrict to get_my_role() IN ('Admin','Super Admin','Finance')
- Cleanup: DROP any residual anon policies on ALL app tables (safety sweep)

### Important notes:
1. 'Finance' role does not yet exist in profiles but is included for forward compatibility
2. The get_my_role() function uses SECURITY DEFINER so it can read profiles regardless of RLS
3. search_path is pinned to prevent search_path injection
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. HELPER FUNCTION: get_my_role()
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 2. DROP ALL EXISTING POLICIES ON FISCAL TABLES
-- ═══════════════════════════════════════════════════════════════

-- admin_entrate
DROP POLICY IF EXISTS "select_own_entrate" ON admin_entrate;
DROP POLICY IF EXISTS "insert_own_entrate" ON admin_entrate;
DROP POLICY IF EXISTS "update_own_entrate" ON admin_entrate;
DROP POLICY IF EXISTS "delete_own_entrate" ON admin_entrate;

-- admin_fatture
DROP POLICY IF EXISTS "select_own_fatture" ON admin_fatture;
DROP POLICY IF EXISTS "insert_own_fatture" ON admin_fatture;
DROP POLICY IF EXISTS "update_own_fatture" ON admin_fatture;
DROP POLICY IF EXISTS "delete_own_fatture" ON admin_fatture;

-- invoices
DROP POLICY IF EXISTS "authenticated_select_invoices" ON invoices;
DROP POLICY IF EXISTS "authenticated_insert_invoices" ON invoices;
DROP POLICY IF EXISTS "authenticated_update_invoices" ON invoices;
DROP POLICY IF EXISTS "authenticated_delete_invoices" ON invoices;

-- admin_documents
DROP POLICY IF EXISTS "authenticated_select_admin_documents" ON admin_documents;
DROP POLICY IF EXISTS "authenticated_insert_admin_documents" ON admin_documents;
DROP POLICY IF EXISTS "authenticated_update_admin_documents" ON admin_documents;
DROP POLICY IF EXISTS "authenticated_delete_admin_documents" ON admin_documents;

-- ═══════════════════════════════════════════════════════════════
-- 3. NEW ROLE-RESTRICTED POLICIES ON FISCAL TABLES
-- ═══════════════════════════════════════════════════════════════

-- ─── admin_entrate ────────────────────────────────────────────
CREATE POLICY "fiscal_select_admin_entrate" ON admin_entrate FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_insert_admin_entrate" ON admin_entrate FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_update_admin_entrate" ON admin_entrate FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_delete_admin_entrate" ON admin_entrate FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

-- ─── admin_fatture ────────────────────────────────────────────
CREATE POLICY "fiscal_select_admin_fatture" ON admin_fatture FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_insert_admin_fatture" ON admin_fatture FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_update_admin_fatture" ON admin_fatture FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_delete_admin_fatture" ON admin_fatture FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

-- ─── invoices ─────────────────────────────────────────────────
CREATE POLICY "fiscal_select_invoices" ON invoices FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_insert_invoices" ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_update_invoices" ON invoices FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_delete_invoices" ON invoices FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

-- ─── admin_documents ──────────────────────────────────────────
CREATE POLICY "fiscal_select_admin_documents" ON admin_documents FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_insert_admin_documents" ON admin_documents FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_update_admin_documents" ON admin_documents FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

CREATE POLICY "fiscal_delete_admin_documents" ON admin_documents FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Finance'));

-- ═══════════════════════════════════════════════════════════════
-- 4. CLEANUP: DROP ANY RESIDUAL ANON POLICIES (safety sweep)
-- ═══════════════════════════════════════════════════════════════

-- events
DROP POLICY IF EXISTS "anon_select_events" ON events;
DROP POLICY IF EXISTS "anon_insert_events" ON events;
DROP POLICY IF EXISTS "anon_update_events" ON events;
DROP POLICY IF EXISTS "anon_delete_events" ON events;
DROP POLICY IF EXISTS "Anon can view events" ON events;

-- tasks
DROP POLICY IF EXISTS "anon_select_tasks" ON tasks;
DROP POLICY IF EXISTS "anon_insert_tasks" ON tasks;
DROP POLICY IF EXISTS "anon_update_tasks" ON tasks;
DROP POLICY IF EXISTS "anon_delete_tasks" ON tasks;

-- clients
DROP POLICY IF EXISTS "anon_select_clients" ON clients;
DROP POLICY IF EXISTS "anon_insert_clients" ON clients;
DROP POLICY IF EXISTS "anon_update_clients" ON clients;
DROP POLICY IF EXISTS "anon_delete_clients" ON clients;

-- suppliers
DROP POLICY IF EXISTS "anon_select_suppliers" ON suppliers;
DROP POLICY IF EXISTS "anon_insert_suppliers" ON suppliers;
DROP POLICY IF EXISTS "anon_update_suppliers" ON suppliers;
DROP POLICY IF EXISTS "anon_delete_suppliers" ON suppliers;

-- profiles
DROP POLICY IF EXISTS "anon_select_profiles" ON profiles;

-- admin tables (no anon should exist, but just in case)
DROP POLICY IF EXISTS "anon_select_admin_entrate" ON admin_entrate;
DROP POLICY IF EXISTS "anon_select_admin_fatture" ON admin_fatture;
DROP POLICY IF EXISTS "anon_select_invoices" ON invoices;
DROP POLICY IF EXISTS "anon_select_admin_documents" ON admin_documents;
