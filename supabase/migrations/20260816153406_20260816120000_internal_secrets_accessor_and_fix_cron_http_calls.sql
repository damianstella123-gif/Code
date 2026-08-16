/*
# Fix all scheduled cron jobs: internal_secrets accessor + net.http_post

## Summary
All four scheduled background jobs (sentinel_hourly, morning_edition_daily,
weekly-cleanup, retention_daily) were failing on every run because they built
their target URL and authorization header from
`current_setting('app.settings.supabase_url')` and
`current_setting('app.settings.service_role_key')`. Those database settings do
not exist in this project, so every run raised
`unrecognized configuration parameter` and never called its edge function.
Additionally, weekly-cleanup used `extensions.http_post`, a function that does
not exist here, while the other three correctly used `net.http_post` (pg_net).

This migration replaces the broken settings lookups with a locked-down
SECURITY DEFINER accessor that reads the project URL and service_role key from
the existing `internal_secrets` table (same table already used for
`registration_email_hmac_key`). It also switches weekly-cleanup to
`net.http_post` so every job uses the one HTTP function that works here.

## 1. New Functions
- `public.get_internal_secret(p_name text) RETURNS text`
  - SECURITY DEFINER, `search_path = public, pg_temp`.
  - Returns the `value` for a given secret `name` from `internal_secrets`.
  - EXECUTE revoked from PUBLIC / anon / authenticated. Only the table owner
    (postgres, under which the cron jobs run) can call it. This keeps the
    service_role key unreadable through the Data API, exactly like the
    internal_secrets table itself.

## 2. Modified Cron Jobs (schedules and targets unchanged)
- `sentinel_hourly`        (0 * * * *)  -> /functions/v1/sentinel
- `morning_edition_daily`  (0 6 * * *)  -> /functions/v1/morning-edition
- `weekly-cleanup`         (0 3 * * 0)  -> /functions/v1/cleanup
- `retention_daily`        (0 2 * * *)  -> /functions/v1/retention-job
  Each now builds its URL and Bearer token from
  `public.get_internal_secret('supabase_url')` /
  `public.get_internal_secret('service_role_key')` and calls `net.http_post`.
  weekly-cleanup specifically switches from the non-existent
  `extensions.http_post` to `net.http_post`.

## Important Notes
1. The secret VALUES (supabase_url, service_role_key) are provisioned separately
   from server-side environment (never written into this migration), so the
   service_role key never appears in migration history.
2. Idempotent: function uses CREATE OR REPLACE; each cron job is unscheduled
   only if present, then re-scheduled.
3. No table data is dropped or altered.
*/

-- ─── 1. SECURITY DEFINER accessor ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_internal_secret(p_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT value FROM internal_secrets WHERE name = p_name;
$$;

REVOKE ALL ON FUNCTION public.get_internal_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_internal_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_internal_secret(text) FROM authenticated;

-- ─── 2. Ensure required extensions ───────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ─── 3. Re-schedule all four jobs to use the accessor + net.http_post ─────

-- sentinel_hourly
SELECT cron.unschedule('sentinel_hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sentinel_hourly');
SELECT cron.schedule(
  'sentinel_hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := public.get_internal_secret('supabase_url') || '/functions/v1/sentinel',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_internal_secret('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- morning_edition_daily
SELECT cron.unschedule('morning_edition_daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'morning_edition_daily');
SELECT cron.schedule(
  'morning_edition_daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := public.get_internal_secret('supabase_url') || '/functions/v1/morning-edition',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_internal_secret('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- weekly-cleanup (also switches extensions.http_post -> net.http_post)
SELECT cron.unschedule('weekly-cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-cleanup');
SELECT cron.schedule(
  'weekly-cleanup',
  '0 3 * * 0',
  $$
  SELECT net.http_post(
    url := public.get_internal_secret('supabase_url') || '/functions/v1/cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_internal_secret('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- retention_daily
SELECT cron.unschedule('retention_daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention_daily');
SELECT cron.schedule(
  'retention_daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := public.get_internal_secret('supabase_url') || '/functions/v1/retention-job',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_internal_secret('service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
