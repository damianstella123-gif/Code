/*
# Create sentinel_count_orphan_tasks RPC function

1. New Functions
   - `sentinel_count_orphan_tasks()` — returns count of tasks whose event_id
     references a non-existent event. Used by the sentinel edge function.

2. Security
   - SECURITY DEFINER so it can bypass RLS for system checks.
   - Only callable by service_role implicitly (no GRANT to anon).
*/

CREATE OR REPLACE FUNCTION public.sentinel_count_orphan_tasks()
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM tasks
  WHERE event_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM events WHERE events.id = tasks.event_id);
$$;
