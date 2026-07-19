/*
# Create onsite_program_status table

Tracks real-time on-site status of each event program item during live events.

1. New Table: onsite_program_status
   - id (uuid, PK, auto-generated)
   - event_id (text, NOT NULL, FK -> events ON DELETE CASCADE)
   - program_item_id (uuid, NOT NULL, FK -> event_program ON DELETE CASCADE, UNIQUE)
   - onsite_status (text, NOT NULL, default 'planned', CHECK enum)
   - actual_start (timestamptz, nullable)
   - actual_end (timestamptz, nullable)
   - delay_minutes (integer, NOT NULL, default 0, CHECK >= 0)
   - onsite_note (text, NOT NULL, default '')
   - updated_by (uuid, nullable, FK -> profiles ON DELETE SET NULL)
   - created_at (timestamptz, NOT NULL, default now())
   - updated_at (timestamptz, NOT NULL, default now())

2. Constraints
   - UNIQUE(program_item_id)
   - CHECK actual_end is null OR actual_start is null OR actual_end >= actual_start

3. Indexes
   - event_id
   - onsite_status

4. Trigger: set_updated_at on UPDATE

5. RLS Policies (authenticated only, no anon)
   - SELECT: can_access_event(event_id)
   - INSERT: has_event_permission(event_id, 'can_access_onsite') AND updated_by = auth.uid()
   - UPDATE: has_event_permission(event_id, 'can_access_onsite') AND updated_by = auth.uid()
   - DELETE: Admin or Super Admin only
*/

-- Table
CREATE TABLE IF NOT EXISTS onsite_program_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  program_item_id uuid NOT NULL REFERENCES event_program(id) ON DELETE CASCADE,
  onsite_status text NOT NULL DEFAULT 'planned'
    CHECK (onsite_status IN ('planned', 'ready', 'in_progress', 'completed', 'delayed', 'cancelled')),
  actual_start timestamptz,
  actual_end timestamptz,
  delay_minutes integer NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  onsite_note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_program_item UNIQUE (program_item_id),
  CONSTRAINT chk_actual_end_after_start CHECK (
    actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onsite_program_status_event_id ON onsite_program_status(event_id);
CREATE INDEX IF NOT EXISTS idx_onsite_program_status_onsite_status ON onsite_program_status(onsite_status);

-- Updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON onsite_program_status;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON onsite_program_status
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE onsite_program_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ops_select" ON onsite_program_status;
CREATE POLICY "ops_select" ON onsite_program_status
  FOR SELECT TO authenticated
  USING (can_access_event(event_id));

DROP POLICY IF EXISTS "ops_insert" ON onsite_program_status;
CREATE POLICY "ops_insert" ON onsite_program_status
  FOR INSERT TO authenticated
  WITH CHECK (
    has_event_permission(event_id, 'can_access_onsite')
    AND updated_by = auth.uid()
  );

DROP POLICY IF EXISTS "ops_update" ON onsite_program_status;
CREATE POLICY "ops_update" ON onsite_program_status
  FOR UPDATE TO authenticated
  USING (has_event_permission(event_id, 'can_access_onsite'))
  WITH CHECK (
    has_event_permission(event_id, 'can_access_onsite')
    AND updated_by = auth.uid()
  );

DROP POLICY IF EXISTS "ops_delete" ON onsite_program_status;
CREATE POLICY "ops_delete" ON onsite_program_status
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'Super Admin')
    )
  );
