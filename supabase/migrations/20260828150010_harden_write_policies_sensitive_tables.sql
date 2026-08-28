/*
# Harden write policies on sensitive tables

Replaces permissive USING(true) / WITH CHECK(true) INSERT/UPDATE/DELETE policies
on 10 sensitive tables with role-aware and event-access-aware policies.

## Tables modified:
1. audit_log — remove direct INSERT permission (triggers bypass RLS via SECURITY DEFINER)
2. error_log — keep INSERT for authenticated (legitimate client use), no UPDATE/DELETE
3. payments — restrict writes to Admin/Super Admin/Amministrazione
4. budgets — restrict writes to event team (can_access_event) OR Admin/Super Admin/Amministrazione
5. budget_versions — restrict writes to event team OR Admin/Super Admin/Amministrazione
6. event_budget_lines — restrict writes to event team OR Admin/Super Admin/Amministrazione
7. clients — restrict writes to Admin/Super Admin/Senior PM/Project Manager/Commerciale
8. contacts — restrict writes to Admin/Super Admin/Senior PM/Project Manager/Commerciale; clean up duplicate policies
9. dossiers — restrict writes to event team OR Admin/Super Admin + team roles with nav access
10. communications — restrict writes to event team OR Admin/Super Admin + team roles with nav access

## Security changes:
- audit_log: INSERT denied to direct user writes (triggers still work via SECURITY DEFINER)
- All other tables: USING(true) replaced with role/event checks
- SELECT policies left unchanged (team sharing is intended)
- Admin/Super Admin always retain full write access
- For nullable event_id tables: Admin roles can always write; non-admin users need valid event access

## Important notes:
1. can_access_event() already grants access to Admin/Super Admin/Amministrazione internally
2. For tables with nullable event_id, the policy uses: admin-role check OR (event_id IS NOT NULL AND can_access_event(event_id))
3. contacts table had 8 duplicate policies; cleaned to 4
4. dossiers and communications accessible from nav by all roles except Amministrazione, so broader role set allowed
*/

-- ============================================================
-- 1. AUDIT_LOG — system-only writes via triggers
-- ============================================================
DROP POLICY IF EXISTS "audit_log_insert_authenticated" ON audit_log;
-- No INSERT policy = no direct user inserts. Triggers use SECURITY DEFINER and bypass RLS.

-- ============================================================
-- 2. ERROR_LOG — keep INSERT (legitimate client writes), no UPDATE/DELETE exist
-- ============================================================
-- Current INSERT policy WITH CHECK(true) is acceptable for error_log.
-- error_log has no UPDATE/DELETE policies — that's correct, nothing to change.

-- ============================================================
-- 3. PAYMENTS — Admin/Super Admin/Amministrazione only
-- ============================================================
DROP POLICY IF EXISTS "authenticated_insert_payments" ON payments;
CREATE POLICY "payments_insert_admin_finance" ON payments FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "authenticated_update_payments" ON payments;
CREATE POLICY "payments_update_admin_finance" ON payments FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "authenticated_delete_payments" ON payments;
CREATE POLICY "payments_delete_admin_finance" ON payments FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

-- ============================================================
-- 4. BUDGETS — event team + admin roles
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can insert budgets" ON budgets;
CREATE POLICY "budgets_insert_event_team" ON budgets FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR (event_id IS NOT NULL AND can_access_event(event_id))
  );

DROP POLICY IF EXISTS "budgets_update_authenticated" ON budgets;
CREATE POLICY "budgets_update_event_team" ON budgets FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR (event_id IS NOT NULL AND can_access_event(event_id))
  )
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR (event_id IS NOT NULL AND can_access_event(event_id))
  );

-- budgets_delete_admin already restricts to Admin/Super Admin — keep it
-- (No change needed for DELETE)

-- ============================================================
-- 5. BUDGET_VERSIONS — event team + admin roles
-- ============================================================
DROP POLICY IF EXISTS "bv_insert" ON budget_versions;
CREATE POLICY "bv_insert_event_team" ON budget_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR can_access_event(event_id)
  );

DROP POLICY IF EXISTS "bv_update" ON budget_versions;
CREATE POLICY "bv_update_event_team" ON budget_versions FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR can_access_event(event_id)
  )
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR can_access_event(event_id)
  );

DROP POLICY IF EXISTS "bv_delete" ON budget_versions;
CREATE POLICY "bv_delete_event_team" ON budget_versions FOR DELETE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR can_access_event(event_id)
  );

-- ============================================================
-- 6. EVENT_BUDGET_LINES — event team + admin roles (event_id NOT NULL)
-- ============================================================
DROP POLICY IF EXISTS "insert_event_budget_lines" ON event_budget_lines;
CREATE POLICY "ebl_insert_event_team" ON event_budget_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR can_access_event(event_id)
  );

DROP POLICY IF EXISTS "update_event_budget_lines" ON event_budget_lines;
CREATE POLICY "ebl_update_event_team" ON event_budget_lines FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR can_access_event(event_id)
  )
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR can_access_event(event_id)
  );

DROP POLICY IF EXISTS "delete_event_budget_lines" ON event_budget_lines;
CREATE POLICY "ebl_delete_event_team" ON event_budget_lines FOR DELETE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR can_access_event(event_id)
  );

-- ============================================================
-- 7. CLIENTS — CRM roles (Network page access)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can insert clients" ON clients;
CREATE POLICY "clients_insert_crm_roles" ON clients FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Commerciale'));

DROP POLICY IF EXISTS "clients_update_authenticated" ON clients;
CREATE POLICY "clients_update_crm_roles" ON clients FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Commerciale'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Commerciale'));

-- clients_delete_admin already restricts to Admin/Super Admin — keep it

-- ============================================================
-- 8. CONTACTS — same CRM roles; clean up duplicates first
-- ============================================================
DROP POLICY IF EXISTS "authenticated_delete_contacts" ON contacts;
DROP POLICY IF EXISTS "authenticated_insert_contacts" ON contacts;
DROP POLICY IF EXISTS "authenticated_select_contacts" ON contacts;
DROP POLICY IF EXISTS "authenticated_update_contacts" ON contacts;
DROP POLICY IF EXISTS "delete_contacts_authenticated" ON contacts;
DROP POLICY IF EXISTS "insert_contacts_authenticated" ON contacts;
DROP POLICY IF EXISTS "select_contacts_authenticated" ON contacts;
DROP POLICY IF EXISTS "update_contacts_authenticated" ON contacts;

CREATE POLICY "contacts_select" ON contacts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "contacts_insert_crm_roles" ON contacts FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Commerciale'));

CREATE POLICY "contacts_update_crm_roles" ON contacts FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Commerciale'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Commerciale'));

CREATE POLICY "contacts_delete_crm_roles" ON contacts FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Commerciale'));

-- ============================================================
-- 9. DOSSIERS — event team + all operational roles with /dossier nav access
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can insert dossiers" ON dossiers;
CREATE POLICY "dossiers_insert_team" ON dossiers FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale')
    OR (event_id IS NOT NULL AND can_access_event(event_id))
  );

DROP POLICY IF EXISTS "dossiers_update_authenticated" ON dossiers;
CREATE POLICY "dossiers_update_team" ON dossiers FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale')
    OR (event_id IS NOT NULL AND can_access_event(event_id))
  )
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale')
    OR (event_id IS NOT NULL AND can_access_event(event_id))
  );

DROP POLICY IF EXISTS "dossiers_delete_admin" ON dossiers;
CREATE POLICY "dossiers_delete_team" ON dossiers FOR DELETE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale')
    OR (event_id IS NOT NULL AND can_access_event(event_id))
  );

-- ============================================================
-- 10. COMMUNICATIONS — event team + all operational roles with /comunicazioni nav access
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can insert communications" ON communications;
CREATE POLICY "comms_insert_team" ON communications FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista')
    OR (event_id IS NOT NULL AND can_access_event(event_id))
  );

DROP POLICY IF EXISTS "communications_update_authenticated" ON communications;
CREATE POLICY "comms_update_team" ON communications FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista')
    OR (event_id IS NOT NULL AND can_access_event(event_id))
  )
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista')
    OR (event_id IS NOT NULL AND can_access_event(event_id))
  );

DROP POLICY IF EXISTS "communications_delete_admin" ON communications;
CREATE POLICY "comms_delete_team" ON communications FOR DELETE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista')
    OR (event_id IS NOT NULL AND can_access_event(event_id))
  );
