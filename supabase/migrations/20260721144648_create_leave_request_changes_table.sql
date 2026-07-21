/*
# Create leave_request_changes table

1. New Table: leave_request_changes
   - id (uuid, PK, gen_random_uuid)
   - leave_request_id (uuid, NOT NULL, FK → leave_requests.id ON DELETE CASCADE)
   - requested_by (uuid, NOT NULL, FK → profiles.id)
   - change_type (text, NOT NULL, CHECK in modifica/annullamento)
   - proposed_data_inizio (date, nullable)
   - proposed_data_fine (date, nullable)
   - proposed_ora_inizio (time, nullable)
   - proposed_ora_fine (time, nullable)
   - proposed_motivo (text, nullable)
   - employee_reason (text, NOT NULL, CHECK not blank)
   - change_status (text, NOT NULL, default 'in_attesa', CHECK in in_attesa/approvata/negata/annullata)
   - reviewed_by (uuid, nullable, FK → profiles.id ON DELETE SET NULL)
   - reviewed_at (timestamptz, nullable)
   - admin_note (text, nullable)
   - created_at (timestamptz, NOT NULL, default now())
   - updated_at (timestamptz, NOT NULL, default now())

2. Constraints
   - change_type limited to 'modifica' or 'annullamento'
   - change_status limited to 'in_attesa','approvata','negata','annullata'
   - employee_reason not blank
   - proposed_data_fine >= proposed_data_inizio when both present
   - proposed_ora_fine > proposed_ora_inizio when both present
   - reviewed_by and reviewed_at required when status is approvata/negata
   - Partial unique: only one in_attesa change per leave request

3. Indexes
   - leave_request_id
   - requested_by
   - change_status

4. Trigger
   - Attach existing set_updated_at() trigger for updated_at column

5. Security
   - RLS enabled
   - SELECT own changes (via parent leave_requests.user_id = auth.uid())
   - SELECT all for Admin/Super Admin/Amministrazione
   - No INSERT/UPDATE/DELETE policies (managed by RPCs)
   - No anon access
*/

CREATE TABLE IF NOT EXISTS leave_request_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  change_type text NOT NULL,
  proposed_data_inizio date,
  proposed_data_fine date,
  proposed_ora_inizio time,
  proposed_ora_fine time,
  proposed_motivo text,
  employee_reason text NOT NULL,
  change_status text NOT NULL DEFAULT 'in_attesa',
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_change_type CHECK (change_type IN ('modifica', 'annullamento')),
  CONSTRAINT chk_change_status CHECK (change_status IN ('in_attesa', 'approvata', 'negata', 'annullata')),
  CONSTRAINT chk_employee_reason_not_blank CHECK (length(trim(employee_reason)) > 0),
  CONSTRAINT chk_proposed_dates CHECK (
    proposed_data_inizio IS NULL OR proposed_data_fine IS NULL
    OR proposed_data_fine >= proposed_data_inizio
  ),
  CONSTRAINT chk_proposed_times CHECK (
    proposed_ora_inizio IS NULL OR proposed_ora_fine IS NULL
    OR proposed_ora_fine > proposed_ora_inizio
  ),
  CONSTRAINT chk_review_fields CHECK (
    change_status NOT IN ('approvata', 'negata')
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

-- Partial unique: only one pending change per leave request
CREATE UNIQUE INDEX IF NOT EXISTS idx_lrc_one_pending_per_request
  ON leave_request_changes (leave_request_id)
  WHERE change_status = 'in_attesa';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_lrc_leave_request_id ON leave_request_changes (leave_request_id);
CREATE INDEX IF NOT EXISTS idx_lrc_requested_by ON leave_request_changes (requested_by);
CREATE INDEX IF NOT EXISTS idx_lrc_change_status ON leave_request_changes (change_status);

-- Attach existing updated_at trigger
CREATE TRIGGER trg_leave_request_changes_updated_at
  BEFORE UPDATE ON leave_request_changes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE leave_request_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lrc_select_own" ON leave_request_changes;
CREATE POLICY "lrc_select_own"
  ON leave_request_changes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leave_requests lr
      WHERE lr.id = leave_request_changes.leave_request_id
        AND lr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lrc_select_admin" ON leave_request_changes;
CREATE POLICY "lrc_select_admin"
  ON leave_request_changes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('Admin', 'Super Admin', 'Amministrazione')
    )
  );
