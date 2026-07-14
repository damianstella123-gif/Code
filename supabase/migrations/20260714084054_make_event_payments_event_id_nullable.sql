/*
# Make event_id nullable on event_payments

1. Modified Tables
   - `event_payments`
     - `event_id` changed from NOT NULL to nullable
       This allows payments that are not tied to any specific event (e.g. general expenses).
*/

ALTER TABLE event_payments ALTER COLUMN event_id DROP NOT NULL;
