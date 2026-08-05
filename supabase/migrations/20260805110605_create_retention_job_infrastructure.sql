/*
# Retention job infrastructure

Adds the always-on daily retention pipeline that erases participant data 30 days
after an event ends.

1. Changes to `events`
   - New column `retention_processed_at timestamptz` (nullable, default NULL) that
     marks an event as already handled by the retention job so it is never
     reprocessed.

2. New table `retention_job_log`
   - Small audit trail of each per-event retention run. Stores only counts and
     identifiers -- never any personal data.
   - Columns: id, event_id, registrations_deleted, documents_deleted,
     notices_sent, notices_failed, run_at, note.
   - RLS enabled. No anon or authenticated write policies at all. A single SELECT
     policy for authenticated callers whose profile role is Admin or Super Admin.
     The service_role JWT bypasses RLS and is what the edge function uses to
     write rows.

3. Cron job `retention_daily`
   - Runs once a day at 02:00 UTC calling the `retention-job` edge function via
     `net.http_post` with the service_role key. Same pattern as
     `weekly-cleanup` / `morning_edition_daily`.

Migration is fully idempotent.
*/

-- 1. events.retention_processed_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'retention_processed_at'
  ) THEN
    ALTER TABLE public.events
      ADD COLUMN retention_processed_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- 2. retention_job_log
CREATE TABLE IF NOT EXISTS public.retention_job_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text,
  registrations_deleted integer NOT NULL DEFAULT 0,
  documents_deleted integer NOT NULL DEFAULT 0,
  notices_sent integer NOT NULL DEFAULT 0,
  notices_failed integer NOT NULL DEFAULT 0,
  note text,
  run_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.retention_job_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retention_log_admin_select" ON public.retention_job_log;
CREATE POLICY "retention_log_admin_select"
  ON public.retention_job_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('Admin', 'Super Admin')
    )
  );

-- 3. Cron job: retention_daily @ 02:00 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('retention_daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention_daily');

SELECT cron.schedule(
  'retention_daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/retention-job',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
