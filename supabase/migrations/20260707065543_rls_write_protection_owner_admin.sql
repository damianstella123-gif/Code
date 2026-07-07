/*
# RLS Write Protection: Owner + Admin guard on UPDATE/DELETE

## Summary
Protects writes across 17 tables while preserving team collaboration (all
authenticated users can still SELECT and INSERT). UPDATE and DELETE are
restricted to the record owner OR Admin/Super Admin.

## Rules Applied
- SELECT: USING(true) for authenticated — unchanged, full team visibility.
- INSERT: WITH CHECK(true) for authenticated — unchanged, anyone can create.
- UPDATE: owner (via table-specific owner column) OR get_my_role() IN ('Admin','Super Admin').
- DELETE: owner OR Admin/Super Admin.

## Tables WITH an owner column (owner OR Admin for UPDATE + DELETE)
| Table | Owner Column | Type |
|-------|-------------|------|
| events | project_manager_id | text |
| tasks | assigned_to | text |
| creative_projects | responsible_id | text |
| social_contents | responsible_id | text |
| presentation_versions | responsible_id | uuid |
| event_documents | uploaded_by | text |

## Tables WITHOUT owner column (UPDATE open, DELETE = Admin only)
- practices, event_program, event_supplier_services, event_suppliers,
  communications, referenti, client_packages, budgets, clients, suppliers

## Special: profiles
- UPDATE: auth.uid() = id OR Admin/Super Admin
- DELETE: Admin/Super Admin only

## Important Notes
1. Uses existing get_my_role() function which returns the role from profiles.
2. Owner columns storing profile UUIDs as text are compared via auth.uid()::text.
3. presentation_versions.responsible_id is uuid so compared directly to auth.uid().
4. All policies are idempotent (DROP IF EXISTS before CREATE).
5. SELECT and INSERT policies are NOT touched — they remain as-is.
*/

-- ═══════════════════════════════════════════════════════════════════
-- TABLES WITH OWNER COLUMN: events
-- Owner = project_manager_id (text)
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "events_update_owner_admin" ON events;
CREATE POLICY "events_update_owner_admin" ON events FOR UPDATE
  TO authenticated
  USING (
    project_manager_id = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  )
  WITH CHECK (
    project_manager_id = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

DROP POLICY IF EXISTS "events_delete_owner_admin" ON events;
CREATE POLICY "events_delete_owner_admin" ON events FOR DELETE
  TO authenticated
  USING (
    project_manager_id = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

-- ═══════════════════════════════════════════════════════════════════
-- TABLES WITH OWNER COLUMN: tasks
-- Owner = assigned_to (text)
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "tasks_update_owner_admin" ON tasks;
CREATE POLICY "tasks_update_owner_admin" ON tasks FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  )
  WITH CHECK (
    assigned_to = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

DROP POLICY IF EXISTS "tasks_delete_owner_admin" ON tasks;
CREATE POLICY "tasks_delete_owner_admin" ON tasks FOR DELETE
  TO authenticated
  USING (
    assigned_to = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

-- ═══════════════════════════════════════════════════════════════════
-- TABLES WITH OWNER COLUMN: creative_projects
-- Owner = responsible_id (text)
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "creative_projects_update_owner_admin" ON creative_projects;
CREATE POLICY "creative_projects_update_owner_admin" ON creative_projects FOR UPDATE
  TO authenticated
  USING (
    responsible_id = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  )
  WITH CHECK (
    responsible_id = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

DROP POLICY IF EXISTS "creative_projects_delete_owner_admin" ON creative_projects;
CREATE POLICY "creative_projects_delete_owner_admin" ON creative_projects FOR DELETE
  TO authenticated
  USING (
    responsible_id = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

-- ═══════════════════════════════════════════════════════════════════
-- TABLES WITH OWNER COLUMN: social_contents
-- Owner = responsible_id (text)
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "social_contents_update_owner_admin" ON social_contents;
CREATE POLICY "social_contents_update_owner_admin" ON social_contents FOR UPDATE
  TO authenticated
  USING (
    responsible_id = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  )
  WITH CHECK (
    responsible_id = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

DROP POLICY IF EXISTS "social_contents_delete_owner_admin" ON social_contents;
CREATE POLICY "social_contents_delete_owner_admin" ON social_contents FOR DELETE
  TO authenticated
  USING (
    responsible_id = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

-- ═══════════════════════════════════════════════════════════════════
-- TABLES WITH OWNER COLUMN: presentation_versions
-- Owner = responsible_id (uuid)
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "presentation_versions_update_owner_admin" ON presentation_versions;
CREATE POLICY "presentation_versions_update_owner_admin" ON presentation_versions FOR UPDATE
  TO authenticated
  USING (
    responsible_id = auth.uid()
    OR get_my_role() IN ('Admin', 'Super Admin')
  )
  WITH CHECK (
    responsible_id = auth.uid()
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

DROP POLICY IF EXISTS "presentation_versions_delete_owner_admin" ON presentation_versions;
CREATE POLICY "presentation_versions_delete_owner_admin" ON presentation_versions FOR DELETE
  TO authenticated
  USING (
    responsible_id = auth.uid()
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

-- ═══════════════════════════════════════════════════════════════════
-- TABLES WITH OWNER COLUMN: event_documents
-- Owner = uploaded_by (text)
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "event_documents_update_owner_admin" ON event_documents;
CREATE POLICY "event_documents_update_owner_admin" ON event_documents FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  )
  WITH CHECK (
    uploaded_by = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

DROP POLICY IF EXISTS "event_documents_delete_owner_admin" ON event_documents;
CREATE POLICY "event_documents_delete_owner_admin" ON event_documents FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()::text
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

-- ═══════════════════════════════════════════════════════════════════
-- TABLES WITHOUT OWNER COLUMN: UPDATE open, DELETE = Admin only
-- ═══════════════════════════════════════════════════════════════════

-- practices
DROP POLICY IF EXISTS "practices_update_authenticated" ON practices;
CREATE POLICY "practices_update_authenticated" ON practices FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "practices_delete_admin" ON practices;
CREATE POLICY "practices_delete_admin" ON practices FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- event_program
DROP POLICY IF EXISTS "event_program_update_authenticated" ON event_program;
CREATE POLICY "event_program_update_authenticated" ON event_program FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "event_program_delete_admin" ON event_program;
CREATE POLICY "event_program_delete_admin" ON event_program FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- event_supplier_services
DROP POLICY IF EXISTS "event_supplier_services_update_authenticated" ON event_supplier_services;
CREATE POLICY "event_supplier_services_update_authenticated" ON event_supplier_services FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "event_supplier_services_delete_admin" ON event_supplier_services;
CREATE POLICY "event_supplier_services_delete_admin" ON event_supplier_services FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- event_suppliers
DROP POLICY IF EXISTS "event_suppliers_update_authenticated" ON event_suppliers;
CREATE POLICY "event_suppliers_update_authenticated" ON event_suppliers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "event_suppliers_delete_admin" ON event_suppliers;
CREATE POLICY "event_suppliers_delete_admin" ON event_suppliers FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- communications
DROP POLICY IF EXISTS "communications_update_authenticated" ON communications;
CREATE POLICY "communications_update_authenticated" ON communications FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "communications_delete_admin" ON communications;
CREATE POLICY "communications_delete_admin" ON communications FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- referenti
DROP POLICY IF EXISTS "referenti_update_authenticated" ON referenti;
CREATE POLICY "referenti_update_authenticated" ON referenti FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "referenti_delete_admin" ON referenti;
CREATE POLICY "referenti_delete_admin" ON referenti FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- client_packages
DROP POLICY IF EXISTS "client_packages_update_authenticated" ON client_packages;
CREATE POLICY "client_packages_update_authenticated" ON client_packages FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "client_packages_delete_admin" ON client_packages;
CREATE POLICY "client_packages_delete_admin" ON client_packages FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- budgets
DROP POLICY IF EXISTS "budgets_update_authenticated" ON budgets;
CREATE POLICY "budgets_update_authenticated" ON budgets FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "budgets_delete_admin" ON budgets;
CREATE POLICY "budgets_delete_admin" ON budgets FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- clients
DROP POLICY IF EXISTS "clients_update_authenticated" ON clients;
CREATE POLICY "clients_update_authenticated" ON clients FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "clients_delete_admin" ON clients;
CREATE POLICY "clients_delete_admin" ON clients FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- suppliers
DROP POLICY IF EXISTS "suppliers_update_authenticated" ON suppliers;
CREATE POLICY "suppliers_update_authenticated" ON suppliers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "suppliers_delete_admin" ON suppliers;
CREATE POLICY "suppliers_delete_admin" ON suppliers FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- ═══════════════════════════════════════════════════════════════════
-- SPECIAL: profiles
-- UPDATE = self OR Admin; DELETE = Admin only
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "profiles_update_self_admin" ON profiles;
CREATE POLICY "profiles_update_self_admin" ON profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR get_my_role() IN ('Admin', 'Super Admin')
  )
  WITH CHECK (
    auth.uid() = id
    OR get_my_role() IN ('Admin', 'Super Admin')
  );

DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));
