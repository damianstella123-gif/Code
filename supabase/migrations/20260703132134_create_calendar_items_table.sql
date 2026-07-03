/*
# Create calendar_items table

Standalone calendar entries (promemoria, scadenze manuali, note di calendario)
that the PM can create, edit, move and delete directly dal Calendario.

1. New Tables
  - `calendar_items`
    - `id` (uuid, primary key)
    - `user_id` (uuid, creator - references auth.users)
    - `title` (text, not null)
    - `description` (text, default '')
    - `item_type` (text: promemoria | evento | scadenza | task)
    - `start_date` (date, not null)
    - `end_date` (date, nullable)
    - `alert` (text: none | 10min | 1h | 1d | 1w)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

2. Security
  - RLS enabled.
  - Authenticated users can CRUD their own rows.
  - Partner/Admin can see all rows (via permissive policies).

3. Notes
  - alert stores the reminder preference but does NOT trigger automated notifications yet.
  - item_type is a soft classification for display purposes.
*/

CREATE TABLE IF NOT EXISTS calendar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  item_type text NOT NULL DEFAULT 'promemoria' CHECK (item_type IN ('promemoria', 'evento', 'scadenza', 'task')),
  start_date date NOT NULL,
  end_date date,
  alert text NOT NULL DEFAULT 'none' CHECK (alert IN ('none', '10min', '1h', '1d', '1w')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calendar_items ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all calendar items (team visibility)
DROP POLICY IF EXISTS "select_calendar_items" ON calendar_items;
CREATE POLICY "select_calendar_items" ON calendar_items FOR SELECT
  TO authenticated USING (true);

-- Users can insert their own items
DROP POLICY IF EXISTS "insert_calendar_items" ON calendar_items;
CREATE POLICY "insert_calendar_items" ON calendar_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can update their own items
DROP POLICY IF EXISTS "update_calendar_items" ON calendar_items;
CREATE POLICY "update_calendar_items" ON calendar_items FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can delete their own items
DROP POLICY IF EXISTS "delete_calendar_items" ON calendar_items;
CREATE POLICY "delete_calendar_items" ON calendar_items FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Index for common query pattern
CREATE INDEX IF NOT EXISTS idx_calendar_items_start_date ON calendar_items(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_items_user_id ON calendar_items(user_id);
