/*
# Create admin_delete_user_cascade RPC

1. New Function
   - `admin_delete_user_cascade(p_user_id uuid)` — safely deletes a user profile
     after verifying no blocking references exist.

2. Behavior
   - Authorization: only Admin / Super Admin callers (via auth.uid() profile lookup).
   - Category B (BLOCK): checks 14 tables with substantive authored content plus
     events.project_manager_id. If any row found, raises HAS_LINKED_DATA with the
     table name so the caller can show a clear message.
   - Category A (DELETE with audit): 7 personal/join tables — snapshots each row
     into audit_log before deleting.
   - Category C (NULL with audit): 34 optional foreign-key columns — snapshots the
     row before nulling the reference.
   - Also removes p_user_id::text from events.team_member_ids arrays.
   - Finally deletes the profile row itself.

3. Security
   - SECURITY DEFINER, search_path = public, pg_temp
   - EXECUTE revoked from PUBLIC and anon, granted to authenticated
   - Internal auth check ensures only Admin/Super Admin can call
*/

CREATE OR REPLACE FUNCTION admin_delete_user_cascade(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller_role text;
  v_email text;
  v_block text;
  r record;
BEGIN
  -- ── Authorization ─────────────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT role INTO v_caller_role FROM profiles WHERE id = v_uid;
  IF v_caller_role NOT IN ('Admin', 'Super Admin') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- ── Target exists ─────────────────────────────────────────────────────
  SELECT email INTO v_email FROM profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  -- Cannot delete yourself
  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'CANNOT_DELETE_SELF';
  END IF;

  -- ── CATEGORY B — Block if linked data exists ──────────────────────────
  IF EXISTS (SELECT 1 FROM comunicazioni_thread WHERE creato_da = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: comunicazioni_thread (autore thread)';
  END IF;
  IF EXISTS (SELECT 1 FROM comunicazioni_messages WHERE author_id = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: comunicazioni_messages (autore messaggi)';
  END IF;
  IF EXISTS (SELECT 1 FROM chat_messages WHERE sender_id = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: chat_messages (messaggi chat)';
  END IF;
  IF EXISTS (SELECT 1 FROM leave_requests WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: leave_requests (richieste ferie)';
  END IF;
  IF EXISTS (SELECT 1 FROM leave_request_changes WHERE requested_by = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: leave_request_changes (modifiche ferie)';
  END IF;
  IF EXISTS (SELECT 1 FROM transport_assignments WHERE created_by = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: transport_assignments (assegnazioni trasporto)';
  END IF;
  IF EXISTS (SELECT 1 FROM transport_movements WHERE created_by = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: transport_movements (movimenti trasporto)';
  END IF;
  IF EXISTS (SELECT 1 FROM invitation_batches WHERE created_by = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: invitation_batches (batch inviti)';
  END IF;
  IF EXISTS (SELECT 1 FROM registration_email_templates WHERE created_by = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: registration_email_templates (template email)';
  END IF;
  IF EXISTS (SELECT 1 FROM safety_dossiers WHERE activated_by = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: safety_dossiers (dossier sicurezza)';
  END IF;
  IF EXISTS (SELECT 1 FROM onsite_incidents WHERE reported_by = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: onsite_incidents (incidenti segnalati)';
  END IF;
  IF EXISTS (SELECT 1 FROM impact_actions_log WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: impact_actions_log (log azioni impatto)';
  END IF;
  IF EXISTS (SELECT 1 FROM impact_monthly_reports WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: impact_monthly_reports (report mensili impatto)';
  END IF;
  IF EXISTS (SELECT 1 FROM growth_notes WHERE author_id = p_user_id) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: growth_notes (note crescita)';
  END IF;
  IF EXISTS (SELECT 1 FROM events WHERE project_manager_id = p_user_id::text) THEN
    RAISE EXCEPTION 'HAS_LINKED_DATA: events (project manager di eventi)';
  END IF;

  -- ── CATEGORY A — Delete personal/join rows with audit ─────────────────

  FOR r IN SELECT * FROM notifications WHERE user_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_removed_row', 'notifications', r.id::text, to_jsonb(r));
  END LOOP;
  DELETE FROM notifications WHERE user_id = p_user_id;

  FOR r IN SELECT * FROM calendar_items WHERE user_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_removed_row', 'calendar_items', r.id::text, to_jsonb(r));
  END LOOP;
  DELETE FROM calendar_items WHERE user_id = p_user_id;

  FOR r IN SELECT * FROM comunicazioni_participants WHERE user_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_removed_row', 'comunicazioni_participants', r.id::text, to_jsonb(r));
  END LOOP;
  DELETE FROM comunicazioni_participants WHERE user_id = p_user_id;

  FOR r IN SELECT * FROM event_members WHERE user_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_removed_row', 'event_members', r.id::text, to_jsonb(r));
  END LOOP;
  DELETE FROM event_members WHERE user_id = p_user_id;

  FOR r IN SELECT * FROM growth_areas WHERE person_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_removed_row', 'growth_areas', r.id::text, to_jsonb(r));
  END LOOP;
  DELETE FROM growth_areas WHERE person_id = p_user_id;

  FOR r IN SELECT * FROM event_team_roles WHERE profile_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_removed_row', 'event_team_roles', r.id::text, to_jsonb(r));
  END LOOP;
  DELETE FROM event_team_roles WHERE profile_id = p_user_id;

  FOR r IN SELECT * FROM employee_documents WHERE employee_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_removed_row', 'employee_documents', r.id::text, to_jsonb(r));
  END LOOP;
  DELETE FROM employee_documents WHERE employee_id = p_user_id;

  -- ── CATEGORY C — Null optional references with audit ──────────────────

  FOR r IN SELECT * FROM budget_versions WHERE created_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'budget_versions', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE budget_versions SET created_by = NULL WHERE created_by = p_user_id;

  FOR r IN SELECT * FROM creative_generations WHERE created_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'creative_generations', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE creative_generations SET created_by = NULL WHERE created_by = p_user_id;

  FOR r IN SELECT * FROM creative_templates WHERE created_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'creative_templates', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE creative_templates SET created_by = NULL WHERE created_by = p_user_id;

  FOR r IN SELECT * FROM error_log WHERE user_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'error_log', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE error_log SET user_id = NULL WHERE user_id = p_user_id;

  FOR r IN SELECT * FROM event_green_data WHERE updated_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'event_green_data', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE event_green_data SET updated_by = NULL WHERE updated_by = p_user_id;

  FOR r IN SELECT * FROM event_members WHERE invited_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'event_members', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE event_members SET invited_by = NULL WHERE invited_by = p_user_id;

  FOR r IN SELECT * FROM event_payments WHERE reviewed_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'event_payments', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE event_payments SET reviewed_by = NULL WHERE reviewed_by = p_user_id;

  FOR r IN SELECT * FROM event_payments WHERE created_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'event_payments', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE event_payments SET created_by = NULL WHERE created_by = p_user_id;

  FOR r IN SELECT * FROM event_payments WHERE submitted_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'event_payments', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE event_payments SET submitted_by = NULL WHERE submitted_by = p_user_id;

  FOR r IN SELECT * FROM event_registrations WHERE checked_in_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'event_registrations', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE event_registrations SET checked_in_by = NULL WHERE checked_in_by = p_user_id;

  FOR r IN SELECT * FROM events WHERE archiviato_da = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'events', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE events SET archiviato_da = NULL WHERE archiviato_da = p_user_id;

  FOR r IN SELECT * FROM feedback WHERE autore_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'feedback', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE feedback SET autore_id = NULL WHERE autore_id = p_user_id;

  FOR r IN SELECT * FROM leave_request_changes WHERE reviewed_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'leave_request_changes', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE leave_request_changes SET reviewed_by = NULL WHERE reviewed_by = p_user_id;

  FOR r IN SELECT * FROM leave_requests WHERE approvato_da = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'leave_requests', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE leave_requests SET approvato_da = NULL WHERE approvato_da = p_user_id;

  FOR r IN SELECT * FROM onsite_incidents WHERE resolved_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'onsite_incidents', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE onsite_incidents SET resolved_by = NULL WHERE resolved_by = p_user_id;

  FOR r IN SELECT * FROM onsite_incidents WHERE assigned_to = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'onsite_incidents', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE onsite_incidents SET assigned_to = NULL WHERE assigned_to = p_user_id;

  FOR r IN SELECT * FROM onsite_program_status WHERE updated_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'onsite_program_status', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE onsite_program_status SET updated_by = NULL WHERE updated_by = p_user_id;

  FOR r IN SELECT * FROM payment_executions WHERE executed_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'payment_executions', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE payment_executions SET executed_by = NULL WHERE executed_by = p_user_id;

  FOR r IN SELECT * FROM payment_executions WHERE authorized_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'payment_executions', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE payment_executions SET authorized_by = NULL WHERE authorized_by = p_user_id;

  FOR r IN SELECT * FROM payment_executions WHERE created_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'payment_executions', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE payment_executions SET created_by = NULL WHERE created_by = p_user_id;

  FOR r IN SELECT * FROM payment_request_invoice_links WHERE created_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'payment_request_invoice_links', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE payment_request_invoice_links SET created_by = NULL WHERE created_by = p_user_id;

  FOR r IN SELECT * FROM payment_request_line_links WHERE created_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'payment_request_line_links', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE payment_request_line_links SET created_by = NULL WHERE created_by = p_user_id;

  FOR r IN SELECT * FROM presentation_versions WHERE responsible_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'presentation_versions', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE presentation_versions SET responsible_id = NULL WHERE responsible_id = p_user_id;

  FOR r IN SELECT * FROM profiles WHERE responsabile_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'profiles', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE profiles SET responsabile_id = NULL WHERE responsabile_id = p_user_id;

  FOR r IN SELECT * FROM registration_sites WHERE created_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'registration_sites', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE registration_sites SET created_by = NULL WHERE created_by = p_user_id;

  FOR r IN SELECT * FROM safety_requirements WHERE responsible_id = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'safety_requirements', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE safety_requirements SET responsible_id = NULL WHERE responsible_id = p_user_id;

  FOR r IN SELECT * FROM sentinel_alerts WHERE resolved_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'sentinel_alerts', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE sentinel_alerts SET resolved_by = NULL WHERE resolved_by = p_user_id;

  FOR r IN SELECT * FROM supplier_photos WHERE caricata_da = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'supplier_photos', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE supplier_photos SET caricata_da = NULL WHERE caricata_da = p_user_id;

  FOR r IN SELECT * FROM transport_assignments WHERE last_moved_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'transport_assignments', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE transport_assignments SET last_moved_by = NULL WHERE last_moved_by = p_user_id;

  FOR r IN SELECT * FROM transport_assignments WHERE boarded_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'transport_assignments', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE transport_assignments SET boarded_by = NULL WHERE boarded_by = p_user_id;

  FOR r IN SELECT * FROM transport_movements WHERE closed_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'transport_movements', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE transport_movements SET closed_by = NULL WHERE closed_by = p_user_id;

  FOR r IN SELECT * FROM transport_vehicles WHERE arrived_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'transport_vehicles', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE transport_vehicles SET arrived_by = NULL WHERE arrived_by = p_user_id;

  FOR r IN SELECT * FROM transport_vehicles WHERE departed_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'transport_vehicles', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE transport_vehicles SET departed_by = NULL WHERE departed_by = p_user_id;

  FOR r IN SELECT * FROM transport_vehicles WHERE cancelled_by = p_user_id LOOP
    INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
    VALUES (p_user_id, v_email, 'user_deleted_cascade_nulled_reference', 'transport_vehicles', r.id::text, to_jsonb(r));
  END LOOP;
  UPDATE transport_vehicles SET cancelled_by = NULL WHERE cancelled_by = p_user_id;

  -- ── Legacy array cleanup ──────────────────────────────────────────────
  UPDATE events
  SET team_member_ids = array_remove(team_member_ids, p_user_id::text)
  WHERE p_user_id::text = ANY(team_member_ids);

  -- ── Final audit + delete profile ──────────────────────────────────────
  INSERT INTO audit_log (user_id, user_email, action, table_name, record_id, old_data)
  SELECT p_user_id, v_email, 'user_deleted_cascade_removed_row', 'profiles', p_user_id::text, to_jsonb(p.*)
  FROM profiles p WHERE p.id = p_user_id;

  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_delete_user_cascade(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_delete_user_cascade(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION admin_delete_user_cascade(uuid) TO authenticated;
