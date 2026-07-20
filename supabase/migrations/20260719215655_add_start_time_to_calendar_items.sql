/*
# Add start_time column to calendar_items

The propose_create_memo tool in fly-gateway references a start_time column
that does not exist. Adding it as a nullable time column so calendar items
can store a specific time of day in addition to the date.

1. Modified Tables
   - `calendar_items`
     - Added `start_time` (time, nullable) — the time of day for the item
*/

ALTER TABLE calendar_items
  ADD COLUMN IF NOT EXISTS start_time time;
