/*
# Create meetings and meeting_event_notes tables for "Area Riunioni"

Weekly internal meeting module — replaces Excel+folder workflow with live integrated
view, structured meeting minutes, and history.

## New Tables

### meetings
- `id` (uuid, PK)
- `meeting_date` (date, NOT NULL) — when the meeting took place
- `created_by` (uuid, NOT NULL, FK auth.users) — who created/ran the meeting
- `presenti` (text) — comma-separated or free text list of who attended
- `temi_generali` (text) — general topics discussed
- `decisioni_trasversali` (text) — cross-event decisions
- `created_at` (timestamptz)

### meeting_event_notes
- `id` (uuid, PK)
- `meeting_id` (uuid, NOT NULL, FK meetings) — parent meeting
- `event_id` (text, NOT NULL) — which event was discussed
- `stato_snapshot` (jsonb) — auto-computed event status at meeting time
- `punti_discussi` (text) — discussion points
- `decisioni` (text) — decisions made
- `azioni` (text) — action items (WHO/WHAT/WHEN as text)
- `criticita` (text) — risks and critical issues
- `lezioni_imparate` (text, nullable) — debrief learnings for closed events
- `created_at` (timestamptz)

## Security
- Both tables have RLS enabled.
- SELECT: all authenticated users (whole team attends meetings).
- INSERT/UPDATE: only Admin, Super Admin, Senior PM, Project Manager (meeting runners).
- DELETE: Admin/Super Admin only.

## Important Notes
1. Meeting event notes cascade-delete when meeting is deleted.
2. The created_by column defaults to auth.uid().
3. stato_snapshot stores the factual recap (tasks, budget, suppliers) frozen at meeting time.
*/

-- meetings table
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  presenti text,
  temi_generali text,
  decisioni_trasversali text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date DESC);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meetings_select_all_auth" ON meetings;
CREATE POLICY "meetings_select_all_auth" ON meetings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "meetings_insert_managers" ON meetings;
CREATE POLICY "meetings_insert_managers" ON meetings FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager')
  );

DROP POLICY IF EXISTS "meetings_update_managers" ON meetings;
CREATE POLICY "meetings_update_managers" ON meetings FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager'));

DROP POLICY IF EXISTS "meetings_delete_admin" ON meetings;
CREATE POLICY "meetings_delete_admin" ON meetings FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));

-- meeting_event_notes table
CREATE TABLE IF NOT EXISTS meeting_event_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  stato_snapshot jsonb DEFAULT '{}'::jsonb,
  punti_discussi text,
  decisioni text,
  azioni text,
  criticita text,
  lezioni_imparate text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_men_meeting_id ON meeting_event_notes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_men_event_id ON meeting_event_notes(event_id);

ALTER TABLE meeting_event_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "men_select_all_auth" ON meeting_event_notes;
CREATE POLICY "men_select_all_auth" ON meeting_event_notes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "men_insert_managers" ON meeting_event_notes;
CREATE POLICY "men_insert_managers" ON meeting_event_notes FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager'));

DROP POLICY IF EXISTS "men_update_managers" ON meeting_event_notes;
CREATE POLICY "men_update_managers" ON meeting_event_notes FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Senior PM', 'Project Manager'));

DROP POLICY IF EXISTS "men_delete_admin" ON meeting_event_notes;
CREATE POLICY "men_delete_admin" ON meeting_event_notes FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));
