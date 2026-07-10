/*
# Create leave_requests table for vacation/leave management

## New Tables
- `leave_requests`
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to profiles, NOT NULL)
  - `tipo` (text, CHECK: ferie/permesso/malattia/recupero)
  - `data_inizio` (date, NOT NULL)
  - `data_fine` (date, NOT NULL)
  - `ora_inizio` (time, optional - for permesso type)
  - `ora_fine` (time, optional - for permesso type)
  - `motivo` (text, optional)
  - `stato` (text, CHECK: in_attesa/approvata/negata/annullata, default in_attesa)
  - `approvato_da` (uuid, FK to profiles, optional)
  - `approvato_at` (timestamptz, optional)
  - `note_admin` (text, optional - reason for denial)
  - `created_at` (timestamptz, default now())

## Security
- RLS enabled
- Users can see their own requests
- Admin/Super Admin/Amministrazione can see all requests
- Users can insert their own requests
- Users can update their own requests; Admins can update any request (for approval/denial)

## Notes
1. REPLICA IDENTITY FULL for realtime subscriptions
2. Index on user_id and stato for common query patterns
3. Index on data_inizio for calendar range queries
*/

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ferie','permesso','malattia','recupero')),
  data_inizio date NOT NULL,
  data_fine date NOT NULL,
  ora_inizio time,
  ora_fine time,
  motivo text,
  stato text NOT NULL DEFAULT 'in_attesa' CHECK (stato IN ('in_attesa','approvata','negata','annullata')),
  approvato_da uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approvato_at timestamptz,
  note_admin text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_id ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_stato ON leave_requests(stato);
CREATE INDEX IF NOT EXISTS idx_leave_requests_data_inizio ON leave_requests(data_inizio);

DROP POLICY IF EXISTS "leave_select_own" ON leave_requests;
CREATE POLICY "leave_select_own"
  ON leave_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "leave_select_admin" ON leave_requests;
CREATE POLICY "leave_select_admin"
  ON leave_requests FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "leave_insert" ON leave_requests;
CREATE POLICY "leave_insert"
  ON leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "leave_update_own" ON leave_requests;
CREATE POLICY "leave_update_own"
  ON leave_requests FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'))
  WITH CHECK (user_id = auth.uid() OR get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

DROP POLICY IF EXISTS "leave_delete_admin" ON leave_requests;
CREATE POLICY "leave_delete_admin"
  ON leave_requests FOR DELETE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin'));
