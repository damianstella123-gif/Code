/*
# Aggregate-only team mood alert for managers (privacy-preserving)

1. New function
   - `check_team_mood_drop_alert()` — SECURITY DEFINER function that computes a
     TEAM-WIDE mood trend entirely server-side and, when the team's average mood
     has stayed below a defined threshold for 3 consecutive days, inserts a generic
     notification for every Admin / Super Admin.

2. Privacy guarantees (must stay true)
   - Only CONSENTED users are counted: it joins `profiles` and requires
     `wellness_consent_at IS NOT NULL`.
   - Minimum-group-size safeguard identical to `get_team_mood_aggregate`: if fewer
     than 5 distinct consented people logged a mood in the window, it does nothing
     (treated as "dati insufficienti").
   - The notification payload is a fixed generic sentence. It contains NO names,
     NO user IDs, NO per-person values, NO counts and NO averages — nothing from
     which an individual's mood could be derived.
   - Computation happens only inside this SECURITY DEFINER function; it is NOT
     callable by anon or authenticated (EXECUTE revoked), so no client can run an
     aggregate or individual-row query through it.

3. Threshold logic
   - Mood scores map fire/😍=5, happy/😊=4, neutral/😐=3, tired/😕=2, dead/😠=1.
   - `mood_threshold` = 2.5, `consecutive_days` = 3. Each of the last 3 calendar
     days must have logged data AND a daily average below the threshold.
   - De-duplicated: an admin is not re-notified if they already received a
     `wellness_team_alert` in the previous 24 hours.

4. Scheduling
   - A daily pg_cron job (`wellness_team_mood_alert_daily`) runs the function.
     Unschedule-if-exists keeps the migration idempotent.

5. Notes
   - Uses the existing `notifications` table and conventions; no new delivery
     mechanism is introduced.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE OR REPLACE FUNCTION check_team_mood_drop_alert()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  min_contributors constant integer := 5;
  mood_threshold constant numeric := 2.5;
  consecutive_days constant integer := 3;
  window_start date := current_date - (3 - 1);
  contributor_count integer;
  days_below integer;
  admin_rec record;
  inserted integer := 0;
BEGIN
  -- Distinct CONSENTED contributors over the window (minimum-group safeguard).
  SELECT count(DISTINCT wl.user_id) INTO contributor_count
  FROM wellness_logs wl
  JOIN profiles p ON p.id = wl.user_id AND p.wellness_consent_at IS NOT NULL
  WHERE wl.tipo IN ('mood', 'mood_emoji')
    AND wl.mood IS NOT NULL
    AND wl.created_at >= window_start;

  IF contributor_count < min_contributors THEN
    RETURN jsonb_build_object('sufficient', false, 'triggered', false);
  END IF;

  -- Number of the last 3 calendar days that have data AND a daily average
  -- strictly below the threshold. Days with no logs are absent, so a missing
  -- day prevents the trigger (requires data on each of the 3 days).
  SELECT count(*) INTO days_below
  FROM (
    SELECT
      date_trunc('day', wl.created_at)::date AS d,
      avg(
        CASE wl.mood
          WHEN 'fire' THEN 5 WHEN '😍' THEN 5
          WHEN 'happy' THEN 4 WHEN '😊' THEN 4
          WHEN 'neutral' THEN 3 WHEN '😐' THEN 3
          WHEN 'tired' THEN 2 WHEN '😕' THEN 2
          WHEN 'dead' THEN 1 WHEN '😠' THEN 1
          ELSE 3
        END
      ) AS avg_mood
    FROM wellness_logs wl
    JOIN profiles p ON p.id = wl.user_id AND p.wellness_consent_at IS NOT NULL
    WHERE wl.tipo IN ('mood', 'mood_emoji')
      AND wl.mood IS NOT NULL
      AND wl.created_at >= window_start
    GROUP BY 1
  ) daily
  WHERE daily.avg_mood < mood_threshold;

  IF days_below < consecutive_days THEN
    RETURN jsonb_build_object('sufficient', true, 'triggered', false, 'days_below', days_below);
  END IF;

  -- Trigger: notify each Admin / Super Admin with a generic, aggregate-only message.
  FOR admin_rec IN
    SELECT id FROM profiles WHERE role IN ('Admin', 'Super Admin')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM notifications
      WHERE user_id = admin_rec.id
        AND type = 'wellness_team_alert'
        AND created_at >= now() - interval '24 hours'
    ) THEN
      INSERT INTO notifications (user_id, title, message, type, related_entity_type)
      VALUES (
        admin_rec.id,
        'Benessere del team',
        'L''umore medio del team è sotto la media da alcuni giorni. Valuta un momento di ascolto e supporto.',
        'wellness_team_alert',
        'wellness'
      );
      inserted := inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('sufficient', true, 'triggered', true, 'notified', inserted);
END;
$$;

-- Never callable from the client: server-side aggregate computation only.
REVOKE ALL ON FUNCTION check_team_mood_drop_alert() FROM public, anon, authenticated;

-- Daily schedule (idempotent).
SELECT cron.unschedule('wellness_team_mood_alert_daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'wellness_team_mood_alert_daily'
);

SELECT cron.schedule(
  'wellness_team_mood_alert_daily',
  '30 7 * * *',
  $$ SELECT public.check_team_mood_drop_alert(); $$
);
