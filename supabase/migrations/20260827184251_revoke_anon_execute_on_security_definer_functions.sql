/*
# Revoke anon EXECUTE on SECURITY DEFINER functions (fix PUBLIC grant)

1. Security Changes
   - The previous migration (20260819) revoked from `anon` and `authenticated` directly,
     but PostgreSQL's default EXECUTE grant is on the `PUBLIC` pseudo-role, which still
     grants access to anon. This migration revokes from PUBLIC first, then re-grants
     only to the roles that legitimately need direct EXECUTE.

2. Affected Functions (17 total losing anon access)
   - **Trigger-only (revoke from PUBLIC, anon, authenticated):**
     handle_new_user, log_audit_action, log_audit_role_change, notify_budget_exceeded,
     notify_new_archive_item, notify_new_client, notify_new_communication,
     notify_new_event, notify_new_referente, notify_practice_overdue,
     notify_task_assigned, notify_task_completed, sync_event_client_id
   - **Internal helpers (revoke from PUBLIC and anon, keep authenticated):**
     _dec_pii(bytea), get_my_role(), sentinel_count_orphan_tasks()
   - **Client-called authenticated only (revoke from PUBLIC and anon, keep authenticated):**
     bulk_import_event_registrations(text, jsonb)

3. NOT affected (must remain callable by anon for public pages):
   - get_badge_program, get_public_registration_site, submit_event_registration,
     get_registration_by_manage_token, update_registration_by_manage_token

4. Important Notes
   - Triggers fire as the function owner regardless of EXECUTE grants — revoking
     does NOT break trigger behavior.
   - Edge functions using service_role key bypass privilege checks entirely.
   - get_my_role() is called inside RLS policy expressions evaluated in the
     authenticated session context — authenticated MUST keep EXECUTE.
   - _dec_pii() is called by other SECURITY DEFINER functions; those execute as
     their owner. Keeping authenticated is a safety margin for any future RLS usage.
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- CATEGORY A: Trigger-only functions — revoke all direct EXECUTE
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.log_audit_action() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.log_audit_action() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.log_audit_role_change() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.log_audit_role_change() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_budget_exceeded() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.notify_budget_exceeded() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_new_archive_item() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.notify_new_archive_item() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_new_client() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.notify_new_client() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_new_communication() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.notify_new_communication() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_new_event() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.notify_new_event() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_new_referente() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.notify_new_referente() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_practice_overdue() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.notify_practice_overdue() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_task_completed() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.notify_task_completed() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.sync_event_client_id() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.sync_event_client_id() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CATEGORY B: Internal helpers — revoke PUBLIC + anon, keep authenticated
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public._dec_pii(bytea) FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public._dec_pii(bytea) FROM anon;
  GRANT EXECUTE ON FUNCTION public._dec_pii(bytea) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon;
  GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.sentinel_count_orphan_tasks() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.sentinel_count_orphan_tasks() FROM anon;
  GRANT EXECUTE ON FUNCTION public.sentinel_count_orphan_tasks() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CATEGORY C: Client-called, authenticated only — revoke PUBLIC + anon, keep authenticated
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.bulk_import_event_registrations(text, jsonb) FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.bulk_import_event_registrations(text, jsonb) FROM anon;
  GRANT EXECUTE ON FUNCTION public.bulk_import_event_registrations(text, jsonb) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
