/*
# Create event_team_roles table

1. New Tables
  - `event_team_roles`
    - `id` (uuid, primary key)
    - `event_id` (text, not null, FK to events.id)
    - `profile_id` (uuid, not null, FK to profiles.id)
    - `ruoli_operativi` (text[], default '{}') — operational roles for this member on this event
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)
    - UNIQUE constraint on (event_id, profile_id)

2. Security
  - Enable RLS
  - All authenticated users can CRUD (team roles are collaborative)

3. Notes
  - Stores per-event operational roles separate from the company role
  - The ruoli_operativi array can contain predefined roles or custom text
*/

CREATE TABLE IF NOT EXISTS event_team_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ruoli_operativi text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_event_team_roles_event ON event_team_roles(event_id);
CREATE INDEX IF NOT EXISTS idx_event_team_roles_profile ON event_team_roles(profile_id);

ALTER TABLE event_team_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_event_team_roles" ON event_team_roles;
CREATE POLICY "select_event_team_roles" ON event_team_roles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_event_team_roles" ON event_team_roles;
CREATE POLICY "insert_event_team_roles" ON event_team_roles FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_event_team_roles" ON event_team_roles;
CREATE POLICY "update_event_team_roles" ON event_team_roles FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_event_team_roles" ON event_team_roles;
CREATE POLICY "delete_event_team_roles" ON event_team_roles FOR DELETE
  TO authenticated USING (true);
