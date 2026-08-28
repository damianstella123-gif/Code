/*
# Harden write policies on Network, tasks, archive, social, green reports, comunicazioni tables

Replaces permissive USING(true) / WITH CHECK(true) INSERT/UPDATE/DELETE policies on
operational tables with role-aware and event-access-aware policies.

## Tables modified:
1. suppliers — INSERT/UPDATE restricted to Network roles
2. supplier_contacts — INSERT/UPDATE/DELETE restricted to Network roles
3. supplier_photos — INSERT/UPDATE restricted to Network roles (DELETE already owner+admin)
4. referenti — INSERT/UPDATE restricted to Network roles (DELETE already admin-only)
5. client_packages — INSERT/UPDATE restricted to Network roles (DELETE already admin-only)
6. tasks — INSERT restricted to operational roles (UPDATE/DELETE already owner+admin)
7. archive_folders — full CRUD restricted to Admin/Super Admin only
8. archive_items — full CRUD restricted to Admin/Super Admin only
9. social_contents — INSERT restricted to Creative Studio roles (UPDATE/DELETE already owner+admin)
10. green_reports — full CRUD restricted to event team via can_access_event(event_id)
11. comunicazioni_thread — writes restricted to event team via can_access_event(event_id)
12. comunicazioni_messages — writes restricted to thread participants or admin
13. comunicazioni_participants — writes restricted to event team via parent thread

## Security changes:
- Network roles = Admin, Super Admin, Senior PM, Project Manager, Regista, Commerciale
- Creative Studio roles = Admin, Super Admin, Senior PM, Project Manager, Commerciale
- Archive = Admin, Super Admin ONLY
- Event-linked tables use can_access_event() which internally allows Admin/Super Admin/Amministrazione
- comunicazioni_messages uses EXISTS check on comunicazioni_participants for thread membership
- SELECT policies left unchanged
- error_log: already correct (INSERT open, no UPDATE/DELETE) — not modified

## Important notes:
1. can_access_event() internally allows Admin/Super Admin/Amministrazione + PM + event_members + team_member_ids
2. comunicazioni_thread.event_id is NOT NULL so can_access_event() is safe
3. green_reports.event_id is NOT NULL so can_access_event() is safe
4. tasks.event_id is nullable but INSERT policy doesn't use it — uses role check instead
5. archive_folders and archive_items have no app code usage but are locked to admin for safety
6. client_packages has no app code usage but is given Network roles for future-proofing
*/

-- ============================================================
-- Helper: "Network roles" used across multiple tables
-- Network roles: Admin, Super Admin, Senior PM, Project Manager, Regista, Commerciale
-- ============================================================

-- ============================================================
-- 1. SUPPLIERS — INSERT/UPDATE to Network roles
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can insert suppliers" ON suppliers;
CREATE POLICY "suppliers_insert_network_roles" ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

DROP POLICY IF EXISTS "suppliers_update_authenticated" ON suppliers;
CREATE POLICY "suppliers_update_network_roles" ON suppliers FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

-- DELETE already restricted to Admin/Super Admin — no change

-- ============================================================
-- 2. SUPPLIER_CONTACTS — full CRUD to Network roles
-- ============================================================
DROP POLICY IF EXISTS "insert_supplier_contacts" ON supplier_contacts;
CREATE POLICY "sc_insert_network_roles" ON supplier_contacts FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

DROP POLICY IF EXISTS "update_supplier_contacts" ON supplier_contacts;
CREATE POLICY "sc_update_network_roles" ON supplier_contacts FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

DROP POLICY IF EXISTS "delete_supplier_contacts" ON supplier_contacts;
CREATE POLICY "sc_delete_network_roles" ON supplier_contacts FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

-- ============================================================
-- 3. SUPPLIER_PHOTOS — INSERT/UPDATE to Network roles (DELETE already owner+admin)
-- ============================================================
DROP POLICY IF EXISTS "photos_insert" ON supplier_photos;
CREATE POLICY "sp_insert_network_roles" ON supplier_photos FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

DROP POLICY IF EXISTS "photos_update" ON supplier_photos;
CREATE POLICY "sp_update_network_roles" ON supplier_photos FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

-- DELETE already owner+admin — no change

-- ============================================================
-- 4. REFERENTI — INSERT/UPDATE to Network roles (DELETE already admin)
-- ============================================================
DROP POLICY IF EXISTS "authenticated_insert_referenti" ON referenti;
CREATE POLICY "referenti_insert_network_roles" ON referenti FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

DROP POLICY IF EXISTS "referenti_update_authenticated" ON referenti;
CREATE POLICY "referenti_update_network_roles" ON referenti FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

-- DELETE already admin-only — no change

-- ============================================================
-- 5. CLIENT_PACKAGES — INSERT/UPDATE to Network roles (DELETE already admin)
-- ============================================================
DROP POLICY IF EXISTS "authenticated_insert_client_packages" ON client_packages;
CREATE POLICY "cp_insert_network_roles" ON client_packages FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

DROP POLICY IF EXISTS "client_packages_update_authenticated" ON client_packages;
CREATE POLICY "cp_update_network_roles" ON client_packages FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

-- DELETE already admin-only — no change

-- ============================================================
-- 6. TASKS — INSERT restricted to operational roles (UPDATE/DELETE already owner+admin)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can insert tasks" ON tasks;
CREATE POLICY "tasks_insert_operational_roles" ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Regista', 'Commerciale'));

-- UPDATE and DELETE already use assigned_to + Admin/Super Admin — no change

-- ============================================================
-- 7. ARCHIVE_FOLDERS — admin only (only Admin/Super Admin can access /archivio)
-- ============================================================
DROP POLICY IF EXISTS "archive_folders_insert" ON archive_folders;
CREATE POLICY "af_insert_admin" ON archive_folders FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin'));

DROP POLICY IF EXISTS "archive_folders_update" ON archive_folders;
CREATE POLICY "af_update_admin" ON archive_folders FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin'));

DROP POLICY IF EXISTS "archive_folders_delete" ON archive_folders;
CREATE POLICY "af_delete_admin" ON archive_folders FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- ============================================================
-- 8. ARCHIVE_ITEMS — admin only
-- ============================================================
DROP POLICY IF EXISTS "archive_items_insert" ON archive_items;
CREATE POLICY "ai_insert_admin" ON archive_items FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin'));

DROP POLICY IF EXISTS "archive_items_update" ON archive_items;
CREATE POLICY "ai_update_admin" ON archive_items FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin'));

DROP POLICY IF EXISTS "archive_items_delete" ON archive_items;
CREATE POLICY "ai_delete_admin" ON archive_items FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- ============================================================
-- 9. SOCIAL_CONTENTS — INSERT restricted to Creative Studio roles
--    (UPDATE/DELETE already owner+admin)
-- ============================================================
DROP POLICY IF EXISTS "authenticated_insert_social_contents" ON social_contents;
CREATE POLICY "sc_insert_creative_roles" ON social_contents FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager', 'Commerciale'));

-- UPDATE and DELETE already owner+admin — no change

-- ============================================================
-- 10. GREEN_REPORTS — event team via can_access_event (event_id NOT NULL)
-- ============================================================
DROP POLICY IF EXISTS "green_reports_insert" ON green_reports;
CREATE POLICY "gr_insert_event_team" ON green_reports FOR INSERT
  TO authenticated
  WITH CHECK (can_access_event(event_id));

DROP POLICY IF EXISTS "green_reports_update" ON green_reports;
CREATE POLICY "gr_update_event_team" ON green_reports FOR UPDATE
  TO authenticated
  USING (can_access_event(event_id))
  WITH CHECK (can_access_event(event_id));

DROP POLICY IF EXISTS "green_reports_delete" ON green_reports;
CREATE POLICY "gr_delete_event_team" ON green_reports FOR DELETE
  TO authenticated
  USING (can_access_event(event_id));

-- ============================================================
-- 11. COMUNICAZIONI_THREAD — event team (event_id NOT NULL)
-- ============================================================
DROP POLICY IF EXISTS "ct_insert" ON comunicazioni_thread;
CREATE POLICY "ct_insert_event_team" ON comunicazioni_thread FOR INSERT
  TO authenticated
  WITH CHECK (can_access_event(event_id));

DROP POLICY IF EXISTS "ct_update" ON comunicazioni_thread;
CREATE POLICY "ct_update_event_team" ON comunicazioni_thread FOR UPDATE
  TO authenticated
  USING (can_access_event(event_id))
  WITH CHECK (can_access_event(event_id));

DROP POLICY IF EXISTS "ct_delete" ON comunicazioni_thread;
CREATE POLICY "ct_delete_event_team" ON comunicazioni_thread FOR DELETE
  TO authenticated
  USING (can_access_event(event_id));

-- ============================================================
-- 12. COMUNICAZIONI_MESSAGES — thread participant or admin
-- ============================================================
DROP POLICY IF EXISTS "cm_insert" ON comunicazioni_messages;
CREATE POLICY "cm_insert_participant" ON comunicazioni_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin')
    OR EXISTS (
      SELECT 1 FROM comunicazioni_participants cp
      WHERE cp.thread_id = comunicazioni_messages.thread_id
      AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cm_update" ON comunicazioni_messages;
CREATE POLICY "cm_update_participant" ON comunicazioni_messages FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin')
    OR EXISTS (
      SELECT 1 FROM comunicazioni_participants cp
      WHERE cp.thread_id = comunicazioni_messages.thread_id
      AND cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin')
    OR EXISTS (
      SELECT 1 FROM comunicazioni_participants cp
      WHERE cp.thread_id = comunicazioni_messages.thread_id
      AND cp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cm_delete" ON comunicazioni_messages;
CREATE POLICY "cm_delete_participant" ON comunicazioni_messages FOR DELETE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin')
    OR EXISTS (
      SELECT 1 FROM comunicazioni_participants cp
      WHERE cp.thread_id = comunicazioni_messages.thread_id
      AND cp.user_id = auth.uid()
    )
  );

-- ============================================================
-- 13. COMUNICAZIONI_PARTICIPANTS — event team via parent thread
-- ============================================================
DROP POLICY IF EXISTS "cp_insert" ON comunicazioni_participants;
CREATE POLICY "cp_insert_event_team" ON comunicazioni_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin')
    OR EXISTS (
      SELECT 1 FROM comunicazioni_thread ct
      WHERE ct.id = comunicazioni_participants.thread_id
      AND can_access_event(ct.event_id)
    )
  );

DROP POLICY IF EXISTS "cp_update" ON comunicazioni_participants;
CREATE POLICY "cp_update_event_team" ON comunicazioni_participants FOR UPDATE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin')
    OR EXISTS (
      SELECT 1 FROM comunicazioni_thread ct
      WHERE ct.id = comunicazioni_participants.thread_id
      AND can_access_event(ct.event_id)
    )
  )
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin')
    OR EXISTS (
      SELECT 1 FROM comunicazioni_thread ct
      WHERE ct.id = comunicazioni_participants.thread_id
      AND can_access_event(ct.event_id)
    )
  );

DROP POLICY IF EXISTS "cp_delete" ON comunicazioni_participants;
CREATE POLICY "cp_delete_event_team" ON comunicazioni_participants FOR DELETE
  TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin')
    OR EXISTS (
      SELECT 1 FROM comunicazioni_thread ct
      WHERE ct.id = comunicazioni_participants.thread_id
      AND can_access_event(ct.event_id)
    )
  );
