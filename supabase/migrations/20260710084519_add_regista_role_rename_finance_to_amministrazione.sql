/*
# Add Regista role and rename Finance to Amministrazione

1. Changes
   - Add 'Regista' value to app_role enum
   - Add 'Amministrazione' value to app_role enum (if not already present)
   - Migrate existing profiles with role='Finance' to role='Amministrazione'
   - Update impact_roi_config to add Regista entry
   
2. Notes
   - Cannot DROP enum values in Postgres without recreating the type
   - 'Finance' remains in the enum for backward compat but is no longer used in the UI
   - All existing Finance users are migrated to Amministrazione
*/

-- Add new enum values (idempotent)
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'Regista';
DO $$ BEGIN
  -- Amministrazione may already exist from earlier migration
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Amministrazione' AND enumtypid = 'app_role'::regtype) THEN
    ALTER TYPE app_role ADD VALUE 'Amministrazione';
  END IF;
END $$;

-- Migrate existing Finance users to Amministrazione
UPDATE profiles SET role = 'Amministrazione' WHERE role = 'Finance';

-- Add Regista to impact_roi_config
INSERT INTO impact_roi_config (role, costo_orario_eur, ore_sett_pre_synergy)
VALUES ('Regista', 55, 42)
ON CONFLICT (role) DO NOTHING;