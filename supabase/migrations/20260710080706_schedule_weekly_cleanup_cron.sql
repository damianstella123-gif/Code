/*
# Schedule weekly cleanup cron job

## Overview
Uses pg_cron + pg_net to invoke the cleanup edge function every Sunday at 03:00 UTC.
The function cleans up old logs, expired cache, old notifications, and aggregates impact data.

## Changes
- Creates a pg_cron job 'weekly-cleanup' that fires every Sunday at 03:00 UTC
- Calls the cleanup edge function via pg_net HTTP extension

## Important notes:
1. verify_jwt is false on the cleanup function so the cron can call it without auth
2. The function uses SERVICE_ROLE_KEY internally for DB operations
3. If the job already exists it is dropped and recreated
*/

-- Ensure extensions are available
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Drop existing job if present
SELECT cron.unschedule('weekly-cleanup')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-cleanup'
);

-- Schedule: every Sunday at 03:00 UTC
SELECT cron.schedule(
  'weekly-cleanup',
  '0 3 * * 0',
  $$
  SELECT extensions.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
