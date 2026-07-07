/*
# Drop legacy permissive UPDATE/DELETE policies

## Summary
Removes the old USING(true) policies that conflict with the new owner+admin
guard policies. When multiple permissive policies exist for the same command,
Postgres ORs them together — meaning the old USING(true) would bypass the
new ownership checks entirely. This migration drops only the old policies,
leaving the new restrictive ones as the sole authority.

## Policies Removed (all had USING(true) — open to any authenticated user)
- events: "Authenticated can update events", "Authenticated can delete events"
- tasks: "Authenticated can update tasks", "Authenticated can delete tasks"
- practices: "Authenticated can update practices", "Authenticated can delete practices"
- budgets: "Authenticated can update budgets", "Authenticated can delete budgets"
- clients: "Authenticated can update clients", "Authenticated can delete clients"
- suppliers: "Authenticated can update suppliers", "Authenticated can delete suppliers"
- communications: "Authenticated can update communications", "Authenticated can delete communications"
- creative_projects: "authenticated_update_creative_projects", "authenticated_delete_creative_projects"
- social_contents: "authenticated_update_social_contents", "authenticated_delete_social_contents"
- presentation_versions: "authenticated_update_presentation_versions", "authenticated_delete_presentation_versions"
- event_documents: "delete_event_documents"
- event_program: "update_event_program", "delete_event_program"
- event_supplier_services: "update_event_supplier_services", "delete_event_supplier_services"
- event_suppliers: "update_event_suppliers", "delete_event_suppliers"
- referenti: "authenticated_update_referenti", "authenticated_delete_referenti"
- client_packages: "authenticated_update_client_packages", "authenticated_delete_client_packages"
- profiles: "Partner can update any profile", "Users can update own profile", "Partner can delete any profile"

## Important Notes
1. The new policies (applied in previous migration) remain active.
2. SELECT and INSERT policies are NOT affected.
3. This is safe to re-run (DROP IF EXISTS).
*/

-- events
DROP POLICY IF EXISTS "Authenticated can update events" ON events;
DROP POLICY IF EXISTS "Authenticated can delete events" ON events;

-- tasks
DROP POLICY IF EXISTS "Authenticated can update tasks" ON tasks;
DROP POLICY IF EXISTS "Authenticated can delete tasks" ON tasks;

-- practices
DROP POLICY IF EXISTS "Authenticated can update practices" ON practices;
DROP POLICY IF EXISTS "Authenticated can delete practices" ON practices;

-- budgets
DROP POLICY IF EXISTS "Authenticated can update budgets" ON budgets;
DROP POLICY IF EXISTS "Authenticated can delete budgets" ON budgets;

-- clients
DROP POLICY IF EXISTS "Authenticated can update clients" ON clients;
DROP POLICY IF EXISTS "Authenticated can delete clients" ON clients;

-- suppliers
DROP POLICY IF EXISTS "Authenticated can update suppliers" ON suppliers;
DROP POLICY IF EXISTS "Authenticated can delete suppliers" ON suppliers;

-- communications
DROP POLICY IF EXISTS "Authenticated can update communications" ON communications;
DROP POLICY IF EXISTS "Authenticated can delete communications" ON communications;

-- creative_projects
DROP POLICY IF EXISTS "authenticated_update_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "authenticated_delete_creative_projects" ON creative_projects;

-- social_contents
DROP POLICY IF EXISTS "authenticated_update_social_contents" ON social_contents;
DROP POLICY IF EXISTS "authenticated_delete_social_contents" ON social_contents;

-- presentation_versions
DROP POLICY IF EXISTS "authenticated_update_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "authenticated_delete_presentation_versions" ON presentation_versions;

-- event_documents
DROP POLICY IF EXISTS "delete_event_documents" ON event_documents;

-- event_program
DROP POLICY IF EXISTS "update_event_program" ON event_program;
DROP POLICY IF EXISTS "delete_event_program" ON event_program;

-- event_supplier_services
DROP POLICY IF EXISTS "update_event_supplier_services" ON event_supplier_services;
DROP POLICY IF EXISTS "delete_event_supplier_services" ON event_supplier_services;

-- event_suppliers
DROP POLICY IF EXISTS "update_event_suppliers" ON event_suppliers;
DROP POLICY IF EXISTS "delete_event_suppliers" ON event_suppliers;

-- referenti
DROP POLICY IF EXISTS "authenticated_update_referenti" ON referenti;
DROP POLICY IF EXISTS "authenticated_delete_referenti" ON referenti;

-- client_packages
DROP POLICY IF EXISTS "authenticated_update_client_packages" ON client_packages;
DROP POLICY IF EXISTS "authenticated_delete_client_packages" ON client_packages;

-- profiles (old open policies)
DROP POLICY IF EXISTS "Partner can update any profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Partner can delete any profile" ON profiles;
