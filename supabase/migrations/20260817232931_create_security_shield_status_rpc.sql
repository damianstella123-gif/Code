/*
# Security shield status aggregate (safe, all-users)

1. New function
   - `get_security_shield_status()` — SECURITY DEFINER function that returns ONLY
     safe aggregate counts about sentinel monitoring. It never returns alert
     messages, categories, detail payloads, or any row-level content.

2. What it returns (jsonb)
   - `critical_24h` (integer): count of unresolved critical alerts in the last 24h.
   - `warning_24h` (integer): count of unresolved warning alerts in the last 24h.
   - `last_alert_at` (timestamptz|null): created_at of the most recent alert of any
     kind, used only to render a plain-language "last check" label. Null when the
     system has never recorded an alert.

3. Security
   - SECURITY DEFINER with a fixed search_path.
   - Caller must be authenticated (any role); the function exposes no sensitive
     content, only booleans/counts, so it is safe for all signed-in users.
   - EXECUTE granted to authenticated only; revoked from anon/public.
   - Does NOT change sentinel_alerts RLS (Admin-only SELECT stays intact); this
     aggregate is the only path through which a non-admin sees a monitoring summary.

4. Notes
   - The sentinel edge function runs hourly and only writes rows when an alert
     fires, so `last_alert_at` is the most recent alert, not a clean-run marker.
*/

CREATE OR REPLACE FUNCTION get_security_shield_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  crit_count integer;
  warn_count integer;
  last_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT count(*) INTO crit_count
  FROM sentinel_alerts
  WHERE severity = 'critical'
    AND status <> 'resolved'
    AND created_at >= now() - interval '24 hours';

  SELECT count(*) INTO warn_count
  FROM sentinel_alerts
  WHERE severity = 'warning'
    AND status <> 'resolved'
    AND created_at >= now() - interval '24 hours';

  SELECT max(created_at) INTO last_at
  FROM sentinel_alerts;

  RETURN jsonb_build_object(
    'critical_24h', coalesce(crit_count, 0),
    'warning_24h', coalesce(warn_count, 0),
    'last_alert_at', last_at
  );
END;
$$;

REVOKE ALL ON FUNCTION get_security_shield_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION get_security_shield_status() TO authenticated;
