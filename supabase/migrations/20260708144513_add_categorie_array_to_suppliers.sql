/*
# Add categorie array column to suppliers

1. Modified Tables
  - `suppliers`
    - Added `categorie` (text[], default '{}') - multi-select array of supplier categories
    - Replaces the single `category` text field for new entries
    - Existing data is migrated: category value copied into the array

2. Data Migration
  - All suppliers with a non-empty `category` get that value copied into `categorie` array
  - The original `category` column is NOT dropped (backwards compatibility)

3. Important Notes
  - The `category` column remains for backwards compatibility reads
  - New writes should use `categorie` array
  - Fallback logic: if categorie is empty, use [category] as the effective list
*/

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS categorie text[] DEFAULT '{}';

UPDATE suppliers
SET categorie = ARRAY[category]
WHERE category IS NOT NULL AND category != '' AND (categorie IS NULL OR categorie = '{}');
