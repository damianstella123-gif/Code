-- Allow event_payments to exist without being tied to an event
ALTER TABLE event_payments ALTER COLUMN event_id DROP NOT NULL;