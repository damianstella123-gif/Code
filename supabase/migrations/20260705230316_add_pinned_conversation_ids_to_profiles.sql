/*
# Add pinned_conversation_ids to profiles

1. Modified Tables
   - `profiles`
     - `pinned_conversation_ids` (uuid[], default '{}') — stores up to 3 conversation IDs the user has pinned for quick access

2. Important Notes
   - Column is nullable-safe with a default empty array
   - No foreign key constraint on the array elements (Postgres limitation on array FK)
   - No RLS changes needed — profiles already has authenticated CRUD policies
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'pinned_conversation_ids'
  ) THEN
    ALTER TABLE profiles ADD COLUMN pinned_conversation_ids uuid[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
