/*
# Fix Security: Function Search Path + EXECUTE Permissions

1. Function Search Path (SET search_path = public)
   - set_updated_at()
   - notify_all_users(...)
   - notify_task_completed()
   - notify_new_client()
   - notify_new_referente()
   - notify_new_archive_item()
   - notify_new_communication()
   - notify_new_event()

2. Revoke public EXECUTE on SECURITY DEFINER trigger functions
   - These functions are called by database triggers, NOT by users via REST API.
   - Revoking EXECUTE from anon prevents unauthenticated RPC calls.
   - Revoking EXECUTE from authenticated prevents authenticated RPC calls to internal trigger functions.
   - Functions affected: handle_new_user, notify_all_users, notify_budget_exceeded,
     notify_new_archive_item, notify_new_client, notify_new_communication,
     notify_new_event, notify_new_referente, notify_practice_overdue,
     notify_task_assigned, notify_task_completed, find_user_id_by_name.

3. Storage: Replace overly-broad authenticated_select_storage policy
   - The old policy allowed listing ALL buckets with USING(true).
   - Replaced with a scoped policy listing only known private + public buckets.
   - Also removes redundant authenticated_delete_storage and authenticated_update_storage
     (which also used USING(true)) and replaces with scoped versions.

4. Notes
   - RLS "always true" policies on data tables are intentional for this app:
     this is an internal company tool where all authenticated employees share data.
     The security boundary is authentication itself, not per-user row ownership.
   - Leaked Password Protection is a Supabase Auth dashboard setting, not fixable via SQL.
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Fix mutable search_path on functions
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.notify_all_users(text, text, text, text, text) SET search_path = public;
ALTER FUNCTION public.notify_task_completed() SET search_path = public;
ALTER FUNCTION public.notify_new_client() SET search_path = public;
ALTER FUNCTION public.notify_new_referente() SET search_path = public;
ALTER FUNCTION public.notify_new_archive_item() SET search_path = public;
ALTER FUNCTION public.notify_new_communication() SET search_path = public;
ALTER FUNCTION public.notify_new_event() SET search_path = public;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Revoke EXECUTE from anon on all SECURITY DEFINER functions
--    These are trigger functions - only the database should call them, not users.
-- ═══════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_all_users(text, text, text, text, text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.notify_budget_exceeded() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_budget_exceeded() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_new_archive_item() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_new_archive_item() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_new_client() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_new_client() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_new_communication() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_new_communication() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_new_event() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_new_event() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_new_referente() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_new_referente() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_practice_overdue() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_practice_overdue() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.notify_task_completed() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_task_completed() FROM authenticated;

-- find_user_id_by_name is used internally only - revoke from anon
REVOKE EXECUTE ON FUNCTION public.find_user_id_by_name(text) FROM anon;

-- notify_all_users is callable by authenticated users (for sending notifications)
-- Keep authenticated EXECUTE on this one - it's used by the app

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Fix overly-broad storage policies
--    Replace USING(true) policies with bucket-scoped versions
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop overly broad policies
DROP POLICY IF EXISTS "authenticated_select_storage" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_storage" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_update_storage" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_insert_storage" ON storage.objects;

-- Replace with scoped SELECT policy for all known buckets
CREATE POLICY "authenticated_select_storage" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN (
    'company-logos', 'supplier-logos', 'archive-files', 'documents',
    'event-documents', 'creative-files', 'templates', 'client-packages', 'admin-files'
  ));

-- Replace with scoped UPDATE policy for all known buckets
CREATE POLICY "authenticated_update_storage" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN (
    'company-logos', 'supplier-logos', 'archive-files', 'documents',
    'event-documents', 'creative-files', 'templates', 'client-packages', 'admin-files'
  ));

-- Replace with scoped DELETE policy for all known buckets
CREATE POLICY "authenticated_delete_storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN (
    'company-logos', 'supplier-logos', 'archive-files', 'documents',
    'event-documents', 'creative-files', 'templates', 'client-packages', 'admin-files'
  ));

-- Replace with scoped INSERT policy for all known buckets
CREATE POLICY "authenticated_insert_storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN (
    'company-logos', 'supplier-logos', 'archive-files', 'documents',
    'event-documents', 'creative-files', 'templates', 'client-packages', 'admin-files'
  ));
