/*
# Schedule morning-edition edge function with pg_cron

1. Extensions
   - Enables `pg_cron` and `pg_net` extensions (required for HTTP scheduling).

2. Cron Job
   - Schedules `morning_edition_daily` to run at 06:00 UTC daily (08:00 Rome time).
   - Calls the `morning-edition` edge function via `net.http_post`.

3. Notes
   - pg_net is used to make HTTP requests from within PostgreSQL.
   - The function is called with the service_role key for elevated access.
   - Uses `cron.schedule` which is idempotent when called with the same job name.
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule daily morning edition at 06:00 UTC (08:00 Rome)
SELECT cron.schedule(
  'morning_edition_daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/morning-edition',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
