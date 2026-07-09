/*
# Add daily rate limit columns to fly_rate_limits

1. Modified Tables
   - `fly_rate_limits`
     - `day_count` (int, default 0) — requests today
     - `day_date` (date, default CURRENT_DATE) — resets when day changes

2. Notes
   - Used by fly-gateway to enforce 50 requests/day per user.
   - day_date is compared to CURRENT_DATE; if different, day_count resets to 0.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fly_rate_limits' AND column_name = 'day_count'
  ) THEN
    ALTER TABLE fly_rate_limits ADD COLUMN day_count int NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fly_rate_limits' AND column_name = 'day_date'
  ) THEN
    ALTER TABLE fly_rate_limits ADD COLUMN day_date date NOT NULL DEFAULT CURRENT_DATE;
  END IF;
END $$;
