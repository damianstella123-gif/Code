/*
# Create cross-user notification helper RPC

## Purpose
Allows authenticated users to create a notification for ANY user, bypassing the
self-only RLS on the notifications table. This mirrors how existing SECURITY
DEFINER triggers insert notifications for other users.

## New Function
- `create_notification_for_user(p_user_id, p_title, p_message, p_type, p_entity_type, p_entity_id)`
  - SECURITY DEFINER with fixed search_path
  - Validates all inputs are non-empty and p_user_id exists in auth.users
  - EXECUTE restricted to authenticated role only

## Security
- SECURITY DEFINER so it bypasses notifications RLS (no INSERT policy exists)
- EXECUTE revoked from anon and public; granted only to authenticated
- Input validation prevents empty/null abuse
- Caller must be authenticated (auth.uid() IS NOT NULL check)
*/

CREATE OR REPLACE FUNCTION public.create_notification_for_user(
  p_user_id   uuid,
  p_title     text,
  p_message   text,
  p_type      text DEFAULT 'info',
  p_entity_type text DEFAULT NULL,
  p_entity_id   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'p_title is required';
  END IF;

  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'p_message is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Target user does not exist';
  END IF;

  INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
  VALUES (p_user_id, trim(p_title), trim(p_message), coalesce(trim(p_type), 'info'), trim(p_entity_type), trim(p_entity_id));
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification_for_user(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification_for_user(uuid, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_notification_for_user(uuid, text, text, text, text, text) TO authenticated;
