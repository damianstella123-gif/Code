ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS giorni_richiesti integer;

-- Backfill existing rows
UPDATE leave_requests
SET giorni_richiesti = GREATEST(1, EXTRACT(DAY FROM (data_fine::timestamp - data_inizio::timestamp))::int + 1)
WHERE giorni_richiesti IS NULL;