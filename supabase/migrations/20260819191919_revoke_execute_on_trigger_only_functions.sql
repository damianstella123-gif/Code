/*
# Revoke EXECUTE on trigger-only SECURITY DEFINER functions

1. Security Changes
   - Revokes EXECUTE from anon and authenticated on 14 internal trigger-body functions
     that should never be callable as RPCs: notify_new_event, notify_task_assigned,
     notify_task_completed, notify_new_client, notify_new_communication,
     notify_new_archive_item, notify_new_referente, notify_practice_overdue,
     notify_budget_exceeded, log_audit_action, log_audit_role_change, handle_new_user,
     sync_event_client_id, guard_role_change.
   - Restricts sentinel_count_orphan_tasks() so only authenticated users with
     Admin or Super Admin role can execute it (previously callable by anon).

2. Important Notes
   - Triggers fire as the function owner regardless of EXECUTE grants on the function,
     so revoking does NOT affect trigger behavior.
   - The sentinel edge function calls sentinel_count_orphan_tasks via service_role key
     which bypasses these grants, so it remains unaffected.
   - No frontend code calls any of these functions directly.
*/

-- Revoke EXECUTE on trigger-body functions from public roles
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_new_event() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_task_completed() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_new_client() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_new_communication() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_new_archive_item() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_new_referente() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_practice_overdue() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.notify_budget_exceeded() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.log_audit_action() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.log_audit_role_change() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.sync_event_client_id() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.guard_role_change() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Restrict sentinel_count_orphan_tasks to authenticated Admin/Super Admin only
-- First revoke from both roles, then re-grant to authenticated
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.sentinel_count_orphan_tasks() FROM anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Re-grant to authenticated (the function body already checks role via profiles)
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.sentinel_count_orphan_tasks() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
