/*
# Create get_approved_leave_calendar RPC

1. Purpose
   - Provides a SECURITY DEFINER function that any authenticated user can call
     to retrieve approved leave requests for the team calendar.
   - Bypasses restrictive leave_requests RLS (which limits non-admin SELECT to
     own rows only) while exposing only non-sensitive fields.

2. Function: get_approved_leave_calendar(p_from date, p_to date)
   - Returns: id, user_id, tipo, data_inizio, data_fine, ora_inizio, ora_fine
   - Filters: stato = 'approvata', optional date range
   - Ordered by data_inizio, ora_inizio NULLS FIRST

3. Security
   - SECURITY DEFINER with search_path = public, pg_temp
   - Requires auth.uid() (raises AUTH_REQUIRED if NULL)
   - REVOKE EXECUTE from PUBLIC and anon
   - GRANT EXECUTE only to authenticated
   - No private fields (motivo, note_admin, approvato_da, approvato_at) exposed

4. Important Notes
   - Does NOT modify existing RLS policies or tables.
   - Does NOT insert any data.
   - Idempotent via CREATE OR REPLACE.
*/

CREATE OR REPLACE FUNCTION get_approved_leave_calendar(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  user_id     uuid,
  tipo        text,
  data_inizio date,
  data_fine   date,
  ora_inizio  time,
  ora_fine    time
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  RETURN QUERY
  SELECT
    lr.id,
    lr.user_id,
    lr.tipo,
    lr.data_inizio,
    lr.data_fine,
    lr.ora_inizio,
    lr.ora_fine
  FROM leave_requests lr
  WHERE lr.stato = 'approvata'
    AND (p_from IS NULL OR lr.data_fine >= p_from)
    AND (p_to   IS NULL OR lr.data_inizio <= p_to)
  ORDER BY lr.data_inizio, lr.ora_inizio NULLS FIRST;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_approved_leave_calendar(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_approved_leave_calendar(date, date) FROM anon;
GRANT  EXECUTE ON FUNCTION get_approved_leave_calendar(date, date) TO authenticated;
