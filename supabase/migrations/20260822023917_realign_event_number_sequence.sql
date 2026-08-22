/*
# Realign event number sequence

## Problem
The sequence `events_event_number_seq` advanced to 78 due to failed INSERT
attempts (trigger fires nextval, transaction rolls back but sequence does not).
The true maximum event_number in the events table is 75, so the next event
should be #076, not #079.

## Fix
- Use `setval` to reset the sequence so the next `nextval()` returns 76.
  `setval(seq, 75, true)` means "75 has been used; next call returns 76."

## Notes
- No existing events are altered.
- No schema changes.
- Idempotent: re-running when max is already 75 is harmless.
*/

SELECT setval(
  'events_event_number_seq',
  GREATEST(
    (SELECT COALESCE(MAX(event_number), 0) FROM events),
    1
  ),
  true
);
