/*
# Add cyber_security category to safety_requirements

1. Modified Tables
   - `safety_requirements`: replaced the category CHECK constraint to include `cyber_security`

2. Changes
   - Drops existing `safety_requirements_category_check` constraint
   - Re-creates it with all original values plus `cyber_security`

3. Important Notes
   - Idempotent: uses DROP IF EXISTS before re-creation
   - Preserves all existing rows, RLS policies, grants and indexes
   - No data migration needed — existing rows keep their current category value
*/

ALTER TABLE safety_requirements DROP CONSTRAINT IF EXISTS safety_requirements_category_check;

ALTER TABLE safety_requirements ADD CONSTRAINT safety_requirements_category_check
  CHECK (category = ANY (ARRAY[
    'general', 'location', 'supplier', 'transport', 'activity',
    'temporary_structures', 'catering', 'speakers', 'other',
    'cyber_security'
  ]));
