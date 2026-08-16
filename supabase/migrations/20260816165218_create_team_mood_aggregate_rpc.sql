/*
# Team-level wellness mood aggregate (privacy-preserving)

1. New function
   - `get_team_mood_aggregate(days_back integer)` — SECURITY DEFINER function that
     computes a TEAM-WIDE mood trend server-side and returns ONLY aggregated values.
     It never returns row-level data, per-person values, or names to the client.

2. What it returns (jsonb)
   - `sufficient` (boolean): false when fewer than 5 distinct team members logged a
     mood in the period, to avoid a potentially-identifying small-group average.
   - `contributors` (integer): number of distinct team members who logged a mood.
   - `trend` (array): one entry per day with `date`, `avg_mood` (1-5 team average)
     and `contributors` (distinct people that day). Empty when not sufficient.

3. Security
   - SECURITY DEFINER with a fixed search_path.
   - Caller must be authenticated AND have role 'Admin' or 'Super Admin'
     (matches the client-side gate on the admin wellness view). Anyone else gets an
     authorization error.
   - EXECUTE granted to authenticated only; revoked from anon/public.
   - Does NOT change wellness_logs RLS (owner-only stays intact); the aggregate is the
     only path through which team-level data is exposed.

4. Notes
   - Mood scores map fire/😍=5, happy/😊=4, neutral/😐=3, tired/😕=2, dead/😠=1,
     tolerating both the app's string moods and emoji moods.
   - The 5-member minimum is enforced inside the function, not on the client.
*/

CREATE OR REPLACE FUNCTION get_team_mood_aggregate(days_back integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  contributor_count integer;
  trend jsonb;
  min_contributors constant integer := 5;
  window_days integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role IS NULL OR caller_role NOT IN ('Admin', 'Super Admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  window_days := greatest(1, least(coalesce(days_back, 14), 90));

  SELECT count(DISTINCT user_id) INTO contributor_count
  FROM wellness_logs
  WHERE tipo IN ('mood', 'mood_emoji')
    AND mood IS NOT NULL
    AND created_at >= now() - (window_days || ' days')::interval;

  IF contributor_count < min_contributors THEN
    RETURN jsonb_build_object(
      'sufficient', false,
      'contributors', contributor_count,
      'trend', '[]'::jsonb
    );
  END IF;

  SELECT coalesce(jsonb_agg(t ORDER BY t.d), '[]'::jsonb) INTO trend
  FROM (
    SELECT
      date_trunc('day', created_at)::date AS d,
      round(avg(
        CASE mood
          WHEN 'fire' THEN 5 WHEN '😍' THEN 5
          WHEN 'happy' THEN 4 WHEN '😊' THEN 4
          WHEN 'neutral' THEN 3 WHEN '😐' THEN 3
          WHEN 'tired' THEN 2 WHEN '😕' THEN 2
          WHEN 'dead' THEN 1 WHEN '😠' THEN 1
          ELSE 3
        END
      )::numeric, 2) AS avg_mood,
      count(DISTINCT user_id) AS contributors
    FROM wellness_logs
    WHERE tipo IN ('mood', 'mood_emoji')
      AND mood IS NOT NULL
      AND created_at >= now() - (window_days || ' days')::interval
    GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'sufficient', true,
    'contributors', contributor_count,
    'trend', trend
  );
END;
$$;

REVOKE ALL ON FUNCTION get_team_mood_aggregate(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_team_mood_aggregate(integer) TO authenticated;
