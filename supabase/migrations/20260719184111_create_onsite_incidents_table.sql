/*
# Create onsite_incidents table

Tracks real-time incidents during live on-site events.

1. New Table: onsite_incidents
   - id (uuid, PK, auto-generated)
   - event_id (text, NOT NULL, FK -> events ON DELETE CASCADE)
   - title (text, NOT NULL)
   - description (text, NOT NULL, default '')
   - category (text, NOT NULL, default 'altro', CHECK enum)
   - severity (text, NOT NULL, default 'info', CHECK enum)
   - incident_status (text, NOT NULL, default 'open', CHECK enum)
   - location (text, NOT NULL, default '')
   - assigned_to (uuid, nullable, FK -> profiles ON DELETE SET NULL)
   - reported_by (uuid, NOT NULL, FK -> profiles)
   - resolved_by (uuid, nullable, FK -> profiles ON DELETE SET NULL)
   - resolved_at (timestamptz, nullable)
   - created_at (timestamptz, default now())
   - updated_at (timestamptz, default now())

2. Constraints
   - CHECK: resolved status requires resolved_at and resolved_by both NOT NULL
   - CHECK: non-resolved status requires both resolved_at and resolved_by NULL

3. Indexes: event_id, incident_status, severity, assigned_to

4. Trigger: set_updated_at on UPDATE

5. RLS (authenticated only, no anon)
   - SELECT: can_access_event(event_id)
   - INSERT: has_event_permission + reported_by = auth.uid() + status open + resolved fields null
   - UPDATE: has_event_permission
   - DELETE: Admin or Super Admin only
*/

CREATE TABLE IF NOT EXISTS onsite_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'altro'
    CHECK (category IN ('logistica', 'fornitore', 'partecipante', 'sicurezza', 'tecnica', 'altro')),
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  incident_status text NOT NULL DEFAULT 'open'
    CHECK (incident_status IN ('open', 'in_progress', 'resolved')),
  location text NOT NULL DEFAULT '',
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reported_by uuid NOT NULL REFERENCES profiles(id),
  resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_resolved_consistency CHECK (
    (incident_status = 'resolved' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
    OR
    (incident_status <> 'resolved' AND resolved_at IS NULL AND resolved_by IS NULL)
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onsite_incidents_event_id ON onsite_incidents(event_id);
CREATE INDEX IF NOT EXISTS idx_onsite_incidents_incident_status ON onsite_incidents(incident_status);
CREATE INDEX IF NOT EXISTS idx_onsite_incidents_severity ON onsite_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_onsite_incidents_assigned_to ON onsite_incidents(assigned_to);

-- Updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON onsite_incidents;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON onsite_incidents
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE onsite_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oi_select" ON onsite_incidents;
CREATE POLICY "oi_select" ON onsite_incidents
  FOR SELECT TO authenticated
  USING (can_access_event(event_id));

DROP POLICY IF EXISTS "oi_insert" ON onsite_incidents;
CREATE POLICY "oi_insert" ON onsite_incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    has_event_permission(event_id, 'can_access_onsite')
    AND reported_by = auth.uid()
    AND incident_status = 'open'
    AND resolved_at IS NULL
    AND resolved_by IS NULL
  );

DROP POLICY IF EXISTS "oi_update" ON onsite_incidents;
CREATE POLICY "oi_update" ON onsite_incidents
  FOR UPDATE TO authenticated
  USING (has_event_permission(event_id, 'can_access_onsite'))
  WITH CHECK (has_event_permission(event_id, 'can_access_onsite'));

DROP POLICY IF EXISTS "oi_delete" ON onsite_incidents;
CREATE POLICY "oi_delete" ON onsite_incidents
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin', 'Super Admin')
    )
  );
