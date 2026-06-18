-- Remove all anon-accessible policies that allow unauthenticated full CRUD
-- Tables with "Demo anon" policies
DROP POLICY IF EXISTS "Demo anon can delete events" ON events;
DROP POLICY IF EXISTS "Demo anon can insert events" ON events;
DROP POLICY IF EXISTS "Demo anon can view events" ON events;
DROP POLICY IF EXISTS "Demo anon can update events" ON events;

DROP POLICY IF EXISTS "Demo anon can delete tasks" ON tasks;
DROP POLICY IF EXISTS "Demo anon can insert tasks" ON tasks;
DROP POLICY IF EXISTS "Demo anon can view tasks" ON tasks;
DROP POLICY IF EXISTS "Demo anon can update tasks" ON tasks;

DROP POLICY IF EXISTS "Demo anon can delete practices" ON practices;
DROP POLICY IF EXISTS "Demo anon can insert practices" ON practices;
DROP POLICY IF EXISTS "Demo anon can view practices" ON practices;
DROP POLICY IF EXISTS "Demo anon can update practices" ON practices;

DROP POLICY IF EXISTS "Demo anon can delete budgets" ON budgets;
DROP POLICY IF EXISTS "Demo anon can insert budgets" ON budgets;
DROP POLICY IF EXISTS "Demo anon can view budgets" ON budgets;
DROP POLICY IF EXISTS "Demo anon can update budgets" ON budgets;

DROP POLICY IF EXISTS "Demo anon can delete communications" ON communications;
DROP POLICY IF EXISTS "Demo anon can insert communications" ON communications;
DROP POLICY IF EXISTS "Demo anon can view communications" ON communications;
DROP POLICY IF EXISTS "Demo anon can update communications" ON communications;

DROP POLICY IF EXISTS "Demo anon can delete suppliers" ON suppliers;
DROP POLICY IF EXISTS "Demo anon can insert suppliers" ON suppliers;
DROP POLICY IF EXISTS "Demo anon can view suppliers" ON suppliers;
DROP POLICY IF EXISTS "Demo anon can update suppliers" ON suppliers;

DROP POLICY IF EXISTS "Anon demo can delete clients" ON clients;
DROP POLICY IF EXISTS "Anon demo can insert clients" ON clients;
DROP POLICY IF EXISTS "Anon demo can read clients" ON clients;
DROP POLICY IF EXISTS "Anon demo can update clients" ON clients;

-- Tables with "anon_*" combined policies (roles: {anon,authenticated})
-- We need to drop these and recreate as authenticated-only

DROP POLICY IF EXISTS "anon_delete_admin_documents" ON admin_documents;
DROP POLICY IF EXISTS "anon_insert_admin_documents" ON admin_documents;
DROP POLICY IF EXISTS "anon_select_admin_documents" ON admin_documents;
DROP POLICY IF EXISTS "anon_update_admin_documents" ON admin_documents;

DROP POLICY IF EXISTS "anon_delete_client_packages" ON client_packages;
DROP POLICY IF EXISTS "anon_insert_client_packages" ON client_packages;
DROP POLICY IF EXISTS "anon_select_client_packages" ON client_packages;
DROP POLICY IF EXISTS "anon_update_client_packages" ON client_packages;

DROP POLICY IF EXISTS "anon_delete_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "anon_insert_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "anon_select_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "anon_update_creative_projects" ON creative_projects;

DROP POLICY IF EXISTS "anon_delete_invoices" ON invoices;
DROP POLICY IF EXISTS "anon_insert_invoices" ON invoices;
DROP POLICY IF EXISTS "anon_select_invoices" ON invoices;
DROP POLICY IF EXISTS "anon_update_invoices" ON invoices;

DROP POLICY IF EXISTS "anon_delete_payments" ON payments;
DROP POLICY IF EXISTS "anon_insert_payments" ON payments;
DROP POLICY IF EXISTS "anon_select_payments" ON payments;
DROP POLICY IF EXISTS "anon_update_payments" ON payments;

DROP POLICY IF EXISTS "anon_delete_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "anon_insert_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "anon_select_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "anon_update_presentation_versions" ON presentation_versions;

DROP POLICY IF EXISTS "anon_delete_social_contents" ON social_contents;
DROP POLICY IF EXISTS "anon_insert_social_contents" ON social_contents;
DROP POLICY IF EXISTS "anon_select_social_contents" ON social_contents;
DROP POLICY IF EXISTS "anon_update_social_contents" ON social_contents;

-- Also remove anon policies on contacts
DROP POLICY IF EXISTS "delete_contacts_anon" ON contacts;
DROP POLICY IF EXISTS "insert_contacts_anon" ON contacts;
DROP POLICY IF EXISTS "select_contacts_anon" ON contacts;
DROP POLICY IF EXISTS "update_contacts_anon" ON contacts;

-- Now create proper authenticated-only policies for tables that lost their only policies

CREATE POLICY "authenticated_select_admin_documents" ON admin_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_admin_documents" ON admin_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_admin_documents" ON admin_documents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_admin_documents" ON admin_documents FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select_client_packages" ON client_packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_client_packages" ON client_packages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_client_packages" ON client_packages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_client_packages" ON client_packages FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select_creative_projects" ON creative_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_creative_projects" ON creative_projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_creative_projects" ON creative_projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_creative_projects" ON creative_projects FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select_invoices" ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_invoices" ON invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_invoices" ON invoices FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select_payments" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_payments" ON payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_payments" ON payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_payments" ON payments FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select_presentation_versions" ON presentation_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_presentation_versions" ON presentation_versions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_presentation_versions" ON presentation_versions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_presentation_versions" ON presentation_versions FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select_social_contents" ON social_contents FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_social_contents" ON social_contents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_social_contents" ON social_contents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_social_contents" ON social_contents FOR DELETE TO authenticated USING (true);

CREATE POLICY "authenticated_select_contacts" ON contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_contacts" ON contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_contacts" ON contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_contacts" ON contacts FOR DELETE TO authenticated USING (true);
