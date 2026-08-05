-- Lock down two anon-callable SECURITY DEFINER RPCs.
-- 1) notify_all_users: revoke anon, gate by Admin/Super Admin inside the function.
-- 2) find_user_id_by_name: revoke anon (authenticated only).

REVOKE EXECUTE ON FUNCTION public.notify_all_users(text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_all_users(text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_all_users(text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_all_users(
  p_title text,
  p_message text,
  p_type text,
  p_entity_type text,
  p_entity_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() NOT IN ('Admin', 'Super Admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  SELECT id, p_title, p_message, p_type, p_entity_type, p_entity_id
  FROM profiles
  WHERE stato = 'attivo';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.find_user_id_by_name(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_user_id_by_name(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_name(text) TO authenticated;
