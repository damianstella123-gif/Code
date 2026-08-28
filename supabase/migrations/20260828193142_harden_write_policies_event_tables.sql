/*
# Harden write policies on event tables (Batch 4 — FINAL)

Addresses "RLS Policy Always True" warnings on event tables by restricting
INSERT/UPDATE/DELETE from `true` to proper access checks.

## Changes

### events table (INSERT only — UPDATE/DELETE already hardened)
- INSERT: restricted to roles with /eventi route access
  (Admin, Super Admin, Senior PM, Project Manager, Regista, Amministrazione)

### 17 child tables (all have NOT NULL event_id):
event_program, event_suppliers, event_supplier_services, event_team_roles,
event_catering_details, event_hotel_details, event_allestimenti_details,
event_audio_video_details, event_agenzia_viaggi_details, event_assicurazioni_details,
event_experience_details, event_grafica_stampa_details, event_restaurant_details,
event_staff_esterno_details, event_staff_interno_details, event_varie_details,
event_green_data

- INSERT/UPDATE/DELETE: restricted to can_access_event(event_id)
  which checks: Admin/Super Admin/Amministrazione bypass, project_manager_id match,
  event_members membership, team_member_ids array membership.

## Safety
- can_access_event is safe for INSERT because the parent events row
  (with project_manager_id set) always exists before any child row is created.
- Uses DROP POLICY IF EXISTS + CREATE POLICY for idempotency.

## Important Notes
1. Events UPDATE/DELETE already have proper policies (PM or Admin) — not touched.
2. Matches pattern used for event_budget_lines in Batch 1.
3. Commerciale role excluded from events INSERT (no /eventi route access).
*/

-- =============================================
-- EVENTS TABLE — INSERT only
-- =============================================
DROP POLICY IF EXISTS "Authenticated can insert events" ON events;
CREATE POLICY "events_insert_by_role"
  ON events FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('Admin','Super Admin','Senior PM','Project Manager','Regista','Amministrazione')
  );

-- =============================================
-- EVENT_PROGRAM
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can insert event_program" ON event_program;
DROP POLICY IF EXISTS "Authenticated users can update event_program" ON event_program;
DROP POLICY IF EXISTS "Authenticated users can delete event_program" ON event_program;
DROP POLICY IF EXISTS "insert_event_program" ON event_program;
DROP POLICY IF EXISTS "update_event_program" ON event_program;
DROP POLICY IF EXISTS "delete_event_program" ON event_program;
DROP POLICY IF EXISTS "ep_insert_event_team" ON event_program;
DROP POLICY IF EXISTS "ep_update_event_team" ON event_program;
DROP POLICY IF EXISTS "ep_delete_event_team" ON event_program;

CREATE POLICY "ep_insert_event_team" ON event_program FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "ep_update_event_team" ON event_program FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "ep_delete_event_team" ON event_program FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_SUPPLIERS
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can insert event_suppliers" ON event_suppliers;
DROP POLICY IF EXISTS "Authenticated users can update event_suppliers" ON event_suppliers;
DROP POLICY IF EXISTS "Authenticated users can delete event_suppliers" ON event_suppliers;
DROP POLICY IF EXISTS "insert_event_suppliers" ON event_suppliers;
DROP POLICY IF EXISTS "update_event_suppliers" ON event_suppliers;
DROP POLICY IF EXISTS "delete_event_suppliers" ON event_suppliers;
DROP POLICY IF EXISTS "es_insert_event_team" ON event_suppliers;
DROP POLICY IF EXISTS "es_update_event_team" ON event_suppliers;
DROP POLICY IF EXISTS "es_delete_event_team" ON event_suppliers;

CREATE POLICY "es_insert_event_team" ON event_suppliers FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "es_update_event_team" ON event_suppliers FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "es_delete_event_team" ON event_suppliers FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_SUPPLIER_SERVICES
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can insert event_supplier_services" ON event_supplier_services;
DROP POLICY IF EXISTS "Authenticated users can update event_supplier_services" ON event_supplier_services;
DROP POLICY IF EXISTS "Authenticated users can delete event_supplier_services" ON event_supplier_services;
DROP POLICY IF EXISTS "insert_event_supplier_services" ON event_supplier_services;
DROP POLICY IF EXISTS "update_event_supplier_services" ON event_supplier_services;
DROP POLICY IF EXISTS "delete_event_supplier_services" ON event_supplier_services;
DROP POLICY IF EXISTS "ess_insert_event_team" ON event_supplier_services;
DROP POLICY IF EXISTS "ess_update_event_team" ON event_supplier_services;
DROP POLICY IF EXISTS "ess_delete_event_team" ON event_supplier_services;

CREATE POLICY "ess_insert_event_team" ON event_supplier_services FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "ess_update_event_team" ON event_supplier_services FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "ess_delete_event_team" ON event_supplier_services FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_TEAM_ROLES
-- =============================================
DROP POLICY IF EXISTS "Authenticated users can insert event_team_roles" ON event_team_roles;
DROP POLICY IF EXISTS "Authenticated users can update event_team_roles" ON event_team_roles;
DROP POLICY IF EXISTS "Authenticated users can delete event_team_roles" ON event_team_roles;
DROP POLICY IF EXISTS "insert_event_team_roles" ON event_team_roles;
DROP POLICY IF EXISTS "update_event_team_roles" ON event_team_roles;
DROP POLICY IF EXISTS "delete_event_team_roles" ON event_team_roles;
DROP POLICY IF EXISTS "etr_insert_event_team" ON event_team_roles;
DROP POLICY IF EXISTS "etr_update_event_team" ON event_team_roles;
DROP POLICY IF EXISTS "etr_delete_event_team" ON event_team_roles;

CREATE POLICY "etr_insert_event_team" ON event_team_roles FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "etr_update_event_team" ON event_team_roles FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "etr_delete_event_team" ON event_team_roles FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_CATERING_DETAILS
-- =============================================
DROP POLICY IF EXISTS "auth_insert_catering" ON event_catering_details;
DROP POLICY IF EXISTS "auth_update_catering" ON event_catering_details;
DROP POLICY IF EXISTS "auth_delete_catering" ON event_catering_details;
DROP POLICY IF EXISTS "insert_event_catering_details" ON event_catering_details;
DROP POLICY IF EXISTS "update_event_catering_details" ON event_catering_details;
DROP POLICY IF EXISTS "delete_event_catering_details" ON event_catering_details;
DROP POLICY IF EXISTS "ecd_insert_event_team" ON event_catering_details;
DROP POLICY IF EXISTS "ecd_update_event_team" ON event_catering_details;
DROP POLICY IF EXISTS "ecd_delete_event_team" ON event_catering_details;

CREATE POLICY "ecd_insert_event_team" ON event_catering_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "ecd_update_event_team" ON event_catering_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "ecd_delete_event_team" ON event_catering_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_HOTEL_DETAILS
-- =============================================
DROP POLICY IF EXISTS "auth_insert_hotel" ON event_hotel_details;
DROP POLICY IF EXISTS "auth_update_hotel" ON event_hotel_details;
DROP POLICY IF EXISTS "auth_delete_hotel" ON event_hotel_details;
DROP POLICY IF EXISTS "insert_event_hotel_details" ON event_hotel_details;
DROP POLICY IF EXISTS "update_event_hotel_details" ON event_hotel_details;
DROP POLICY IF EXISTS "delete_event_hotel_details" ON event_hotel_details;
DROP POLICY IF EXISTS "ehd_insert_event_team" ON event_hotel_details;
DROP POLICY IF EXISTS "ehd_update_event_team" ON event_hotel_details;
DROP POLICY IF EXISTS "ehd_delete_event_team" ON event_hotel_details;

CREATE POLICY "ehd_insert_event_team" ON event_hotel_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "ehd_update_event_team" ON event_hotel_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "ehd_delete_event_team" ON event_hotel_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_ALLESTIMENTI_DETAILS
-- =============================================
DROP POLICY IF EXISTS "insert_event_allestimenti_details" ON event_allestimenti_details;
DROP POLICY IF EXISTS "update_event_allestimenti_details" ON event_allestimenti_details;
DROP POLICY IF EXISTS "delete_event_allestimenti_details" ON event_allestimenti_details;
DROP POLICY IF EXISTS "ead_insert_event_team" ON event_allestimenti_details;
DROP POLICY IF EXISTS "ead_update_event_team" ON event_allestimenti_details;
DROP POLICY IF EXISTS "ead_delete_event_team" ON event_allestimenti_details;

CREATE POLICY "ead_insert_event_team" ON event_allestimenti_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "ead_update_event_team" ON event_allestimenti_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "ead_delete_event_team" ON event_allestimenti_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_AUDIO_VIDEO_DETAILS
-- =============================================
DROP POLICY IF EXISTS "insert_event_audio_video_details" ON event_audio_video_details;
DROP POLICY IF EXISTS "update_event_audio_video_details" ON event_audio_video_details;
DROP POLICY IF EXISTS "delete_event_audio_video_details" ON event_audio_video_details;
DROP POLICY IF EXISTS "eavd_insert_event_team" ON event_audio_video_details;
DROP POLICY IF EXISTS "eavd_update_event_team" ON event_audio_video_details;
DROP POLICY IF EXISTS "eavd_delete_event_team" ON event_audio_video_details;

CREATE POLICY "eavd_insert_event_team" ON event_audio_video_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "eavd_update_event_team" ON event_audio_video_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "eavd_delete_event_team" ON event_audio_video_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_AGENZIA_VIAGGI_DETAILS
-- =============================================
DROP POLICY IF EXISTS "auth_insert_agenzia_viaggi" ON event_agenzia_viaggi_details;
DROP POLICY IF EXISTS "auth_update_agenzia_viaggi" ON event_agenzia_viaggi_details;
DROP POLICY IF EXISTS "auth_delete_agenzia_viaggi" ON event_agenzia_viaggi_details;
DROP POLICY IF EXISTS "eagv_insert_event_team" ON event_agenzia_viaggi_details;
DROP POLICY IF EXISTS "eagv_update_event_team" ON event_agenzia_viaggi_details;
DROP POLICY IF EXISTS "eagv_delete_event_team" ON event_agenzia_viaggi_details;

CREATE POLICY "eagv_insert_event_team" ON event_agenzia_viaggi_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "eagv_update_event_team" ON event_agenzia_viaggi_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "eagv_delete_event_team" ON event_agenzia_viaggi_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_ASSICURAZIONI_DETAILS
-- =============================================
DROP POLICY IF EXISTS "auth_insert_assicurazioni" ON event_assicurazioni_details;
DROP POLICY IF EXISTS "auth_update_assicurazioni" ON event_assicurazioni_details;
DROP POLICY IF EXISTS "auth_delete_assicurazioni" ON event_assicurazioni_details;
DROP POLICY IF EXISTS "eass_insert_event_team" ON event_assicurazioni_details;
DROP POLICY IF EXISTS "eass_update_event_team" ON event_assicurazioni_details;
DROP POLICY IF EXISTS "eass_delete_event_team" ON event_assicurazioni_details;

CREATE POLICY "eass_insert_event_team" ON event_assicurazioni_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "eass_update_event_team" ON event_assicurazioni_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "eass_delete_event_team" ON event_assicurazioni_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_EXPERIENCE_DETAILS
-- =============================================
DROP POLICY IF EXISTS "auth_insert_experience" ON event_experience_details;
DROP POLICY IF EXISTS "auth_update_experience" ON event_experience_details;
DROP POLICY IF EXISTS "auth_delete_experience" ON event_experience_details;
DROP POLICY IF EXISTS "insert_event_experience_details" ON event_experience_details;
DROP POLICY IF EXISTS "update_event_experience_details" ON event_experience_details;
DROP POLICY IF EXISTS "delete_event_experience_details" ON event_experience_details;
DROP POLICY IF EXISTS "eed_insert_event_team" ON event_experience_details;
DROP POLICY IF EXISTS "eed_update_event_team" ON event_experience_details;
DROP POLICY IF EXISTS "eed_delete_event_team" ON event_experience_details;

CREATE POLICY "eed_insert_event_team" ON event_experience_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "eed_update_event_team" ON event_experience_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "eed_delete_event_team" ON event_experience_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_GRAFICA_STAMPA_DETAILS
-- =============================================
DROP POLICY IF EXISTS "auth_insert_grafica_stampa" ON event_grafica_stampa_details;
DROP POLICY IF EXISTS "auth_update_grafica_stampa" ON event_grafica_stampa_details;
DROP POLICY IF EXISTS "auth_delete_grafica_stampa" ON event_grafica_stampa_details;
DROP POLICY IF EXISTS "insert_event_grafica_stampa_details" ON event_grafica_stampa_details;
DROP POLICY IF EXISTS "update_event_grafica_stampa_details" ON event_grafica_stampa_details;
DROP POLICY IF EXISTS "delete_event_grafica_stampa_details" ON event_grafica_stampa_details;
DROP POLICY IF EXISTS "egsd_insert_event_team" ON event_grafica_stampa_details;
DROP POLICY IF EXISTS "egsd_update_event_team" ON event_grafica_stampa_details;
DROP POLICY IF EXISTS "egsd_delete_event_team" ON event_grafica_stampa_details;

CREATE POLICY "egsd_insert_event_team" ON event_grafica_stampa_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "egsd_update_event_team" ON event_grafica_stampa_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "egsd_delete_event_team" ON event_grafica_stampa_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_RESTAURANT_DETAILS
-- =============================================
DROP POLICY IF EXISTS "auth_insert_restaurant" ON event_restaurant_details;
DROP POLICY IF EXISTS "auth_update_restaurant" ON event_restaurant_details;
DROP POLICY IF EXISTS "auth_delete_restaurant" ON event_restaurant_details;
DROP POLICY IF EXISTS "insert_event_restaurant_details" ON event_restaurant_details;
DROP POLICY IF EXISTS "update_event_restaurant_details" ON event_restaurant_details;
DROP POLICY IF EXISTS "delete_event_restaurant_details" ON event_restaurant_details;
DROP POLICY IF EXISTS "erd_insert_event_team" ON event_restaurant_details;
DROP POLICY IF EXISTS "erd_update_event_team" ON event_restaurant_details;
DROP POLICY IF EXISTS "erd_delete_event_team" ON event_restaurant_details;

CREATE POLICY "erd_insert_event_team" ON event_restaurant_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "erd_update_event_team" ON event_restaurant_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "erd_delete_event_team" ON event_restaurant_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_STAFF_ESTERNO_DETAILS
-- =============================================
DROP POLICY IF EXISTS "auth_insert_staff_esterno" ON event_staff_esterno_details;
DROP POLICY IF EXISTS "auth_update_staff_esterno" ON event_staff_esterno_details;
DROP POLICY IF EXISTS "auth_delete_staff_esterno" ON event_staff_esterno_details;
DROP POLICY IF EXISTS "insert_event_staff_esterno_details" ON event_staff_esterno_details;
DROP POLICY IF EXISTS "update_event_staff_esterno_details" ON event_staff_esterno_details;
DROP POLICY IF EXISTS "delete_event_staff_esterno_details" ON event_staff_esterno_details;
DROP POLICY IF EXISTS "esed_insert_event_team" ON event_staff_esterno_details;
DROP POLICY IF EXISTS "esed_update_event_team" ON event_staff_esterno_details;
DROP POLICY IF EXISTS "esed_delete_event_team" ON event_staff_esterno_details;

CREATE POLICY "esed_insert_event_team" ON event_staff_esterno_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "esed_update_event_team" ON event_staff_esterno_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "esed_delete_event_team" ON event_staff_esterno_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_STAFF_INTERNO_DETAILS
-- =============================================
DROP POLICY IF EXISTS "auth_insert_staff_interno" ON event_staff_interno_details;
DROP POLICY IF EXISTS "auth_update_staff_interno" ON event_staff_interno_details;
DROP POLICY IF EXISTS "auth_delete_staff_interno" ON event_staff_interno_details;
DROP POLICY IF EXISTS "insert_event_staff_interno_details" ON event_staff_interno_details;
DROP POLICY IF EXISTS "update_event_staff_interno_details" ON event_staff_interno_details;
DROP POLICY IF EXISTS "delete_event_staff_interno_details" ON event_staff_interno_details;
DROP POLICY IF EXISTS "esid_insert_event_team" ON event_staff_interno_details;
DROP POLICY IF EXISTS "esid_update_event_team" ON event_staff_interno_details;
DROP POLICY IF EXISTS "esid_delete_event_team" ON event_staff_interno_details;

CREATE POLICY "esid_insert_event_team" ON event_staff_interno_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "esid_update_event_team" ON event_staff_interno_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "esid_delete_event_team" ON event_staff_interno_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_VARIE_DETAILS
-- =============================================
DROP POLICY IF EXISTS "auth_insert_varie" ON event_varie_details;
DROP POLICY IF EXISTS "auth_update_varie" ON event_varie_details;
DROP POLICY IF EXISTS "auth_delete_varie" ON event_varie_details;
DROP POLICY IF EXISTS "insert_event_varie_details" ON event_varie_details;
DROP POLICY IF EXISTS "update_event_varie_details" ON event_varie_details;
DROP POLICY IF EXISTS "delete_event_varie_details" ON event_varie_details;
DROP POLICY IF EXISTS "evd_insert_event_team" ON event_varie_details;
DROP POLICY IF EXISTS "evd_update_event_team" ON event_varie_details;
DROP POLICY IF EXISTS "evd_delete_event_team" ON event_varie_details;

CREATE POLICY "evd_insert_event_team" ON event_varie_details FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "evd_update_event_team" ON event_varie_details FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "evd_delete_event_team" ON event_varie_details FOR DELETE
  TO authenticated USING (can_access_event(event_id));

-- =============================================
-- EVENT_GREEN_DATA
-- =============================================
DROP POLICY IF EXISTS "auth_insert_green_data" ON event_green_data;
DROP POLICY IF EXISTS "auth_update_green_data" ON event_green_data;
DROP POLICY IF EXISTS "auth_delete_green_data" ON event_green_data;
DROP POLICY IF EXISTS "insert_event_green_data" ON event_green_data;
DROP POLICY IF EXISTS "update_event_green_data" ON event_green_data;
DROP POLICY IF EXISTS "delete_event_green_data" ON event_green_data;
DROP POLICY IF EXISTS "egd_insert_event_team" ON event_green_data;
DROP POLICY IF EXISTS "egd_update_event_team" ON event_green_data;
DROP POLICY IF EXISTS "egd_delete_event_team" ON event_green_data;

CREATE POLICY "egd_insert_event_team" ON event_green_data FOR INSERT
  TO authenticated WITH CHECK (can_access_event(event_id));
CREATE POLICY "egd_update_event_team" ON event_green_data FOR UPDATE
  TO authenticated USING (can_access_event(event_id)) WITH CHECK (can_access_event(event_id));
CREATE POLICY "egd_delete_event_team" ON event_green_data FOR DELETE
  TO authenticated USING (can_access_event(event_id));
