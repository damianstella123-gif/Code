/*
# Prepare database for budget version duplication (preventivo/consuntivo)

## Problem
8 detail tables have `id text PRIMARY KEY` with no DEFAULT, making it
impossible to INSERT copies without explicitly generating a new id.
The restaurant table has UNIQUE(event_id, supplier_id) which blocks the
same supplier appearing in multiple budget versions.
budget_versions has no way to track which preventivo sourced a consuntivo.

## Changes

1. SET DEFAULT gen_random_uuid()::text on `id` for 8 tables
   - event_experience_details
   - event_catering_details
   - event_staff_interno_details
   - event_staff_esterno_details
   - event_varie_details
   - event_audio_video_details
   - event_allestimenti_details
   - event_grafica_stampa_details

2. Replace UNIQUE(event_id, supplier_id) on event_restaurant_details
   with UNIQUE(event_id, supplier_id, budget_version_id)
   named event_restaurant_event_supplier_version_key

3. Add source_version_id to budget_versions
   - uuid nullable FK to budget_versions(id) ON DELETE SET NULL
   - CHECK constraint: cannot reference self
   - Partial unique index: one consuntivo per source version

## Security
   - No RLS changes
   - No new policies

## Data Safety
   - No existing rows modified or deleted
   - No column types changed
   - Existing NULL source_version_id values remain valid
*/

-- ═══════════════════════════════════════════════════════════════════
-- 1. SET DEFAULT on text id columns (8 tables)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE event_experience_details ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE event_catering_details ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE event_staff_interno_details ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE event_staff_esterno_details ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE event_varie_details ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE event_audio_video_details ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE event_allestimenti_details ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE event_grafica_stampa_details ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Replace UNIQUE constraint on event_restaurant_details
-- ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Drop the old constraint if it exists (common auto-generated name)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'event_restaurant_details'::regclass
      AND contype = 'u'
      AND conname = 'event_restaurant_details_event_id_supplier_id_key'
  ) THEN
    ALTER TABLE event_restaurant_details
      DROP CONSTRAINT event_restaurant_details_event_id_supplier_id_key;
  END IF;

  -- Create the new constraint if it does not already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'event_restaurant_details'::regclass
      AND conname = 'event_restaurant_event_supplier_version_key'
  ) THEN
    ALTER TABLE event_restaurant_details
      ADD CONSTRAINT event_restaurant_event_supplier_version_key
      UNIQUE (event_id, supplier_id, budget_version_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Add source_version_id to budget_versions
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE budget_versions
  ADD COLUMN IF NOT EXISTS source_version_id uuid
  REFERENCES budget_versions(id) ON DELETE SET NULL;

-- CHECK: source cannot be self
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'budget_versions'::regclass
      AND conname = 'budget_versions_no_self_source'
  ) THEN
    ALTER TABLE budget_versions
      ADD CONSTRAINT budget_versions_no_self_source
      CHECK (source_version_id IS NULL OR source_version_id <> id);
  END IF;
END $$;

-- Partial unique index: at most one consuntivo per source version
CREATE UNIQUE INDEX IF NOT EXISTS budget_versions_one_consuntivo_per_source_idx
  ON budget_versions (source_version_id)
  WHERE tipo = 'consuntivo' AND source_version_id IS NOT NULL;
