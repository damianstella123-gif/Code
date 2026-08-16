/*
# Schedule sentinel edge function with pg_cron

1. Extensions
   - Ensures `pg_cron` and `pg_net` extensions are available (same as the
     existing weekly-cleanup / morning_edition_daily jobs).

2. Cron Job
   - Registers `sentinel_hourly` to run at minute 0 of every hour.
   - Calls the `sentinel` edge function via `net.http_post`, passing the
     service_role key in the Authorization header, following the exact
     same pattern as `weekly-cleanup` and `morning_edition_daily`.

3. Idempotency
   - Uses the unschedule-if-exists pattern (matching weekly-cleanup) so the
     migration can be re-run safely without creating duplicate jobs.

4. Notes
   - This migration only adds scheduling. It does not modify the sentinel
     function or its internal check logic.
*/

-- Ensure extensions are available
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Drop existing job if present (idempotent re-run)
SELECT cron.unschedule('sentinel_hourly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sentinel_hourly'
);

-- Schedule: minute 0 of every hour
SELECT cron.schedule(
  'sentinel_hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sentinel',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
