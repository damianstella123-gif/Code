/*
# Create fly_memory table

Persistent memory store for Fly AI assistant. Stores categorized key-value
knowledge (clients, team members, known bugs, preferences, events) that
persists across chat sessions.

1. New Tables
   - `fly_memory`
     - `id` (uuid, primary key, auto-generated)
     - `categoria` (text, not null) — category like "client", "team", "known_bugs", "damian_context", "event"
     - `chiave` (text, not null) — unique key within category like "amundi", "antonella", "budget_bug"
     - `valore` (text, not null) — the actual memory content
     - `creato_il` (timestamptz, default now())
     - `aggiornato_il` (timestamptz, default now())

2. Security
   - RLS enabled.
   - Authenticated users can SELECT (read memory at session start).
   - Only Partner/Regista roles can INSERT/UPDATE/DELETE.

3. Indexes
   - Unique constraint on (categoria, chiave) to prevent duplicates.
*/

CREATE TABLE IF NOT EXISTS fly_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  chiave text NOT NULL,
  valore text NOT NULL,
  creato_il timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now(),
  UNIQUE(categoria, chiave)
);

ALTER TABLE fly_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_fly_memory" ON fly_memory;
CREATE POLICY "authenticated_select_fly_memory" ON fly_memory FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_fly_memory" ON fly_memory;
CREATE POLICY "admin_insert_fly_memory" ON fly_memory FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.ruolo IN ('Partner', 'Regista')
    )
  );

DROP POLICY IF EXISTS "admin_update_fly_memory" ON fly_memory;
CREATE POLICY "admin_update_fly_memory" ON fly_memory FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.ruolo IN ('Partner', 'Regista')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.ruolo IN ('Partner', 'Regista')
    )
  );

DROP POLICY IF EXISTS "admin_delete_fly_memory" ON fly_memory;
CREATE POLICY "admin_delete_fly_memory" ON fly_memory FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.ruolo IN ('Partner', 'Regista')
    )
  );
