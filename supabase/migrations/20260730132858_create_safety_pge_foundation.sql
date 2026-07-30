/*
# Create Safety & PGE module database foundation

## Summary
Adds the optional Safety & PGE (Piano di Gestione dell'Evento) module's
database layer. The module is disabled by default — a dossier row is created
only when a PM explicitly activates safety tracking for a specific event.

## Changes

### 1. event_members — new column
- `can_manage_safety` boolean NOT NULL DEFAULT false
  Existing rows receive false; no data or permission changes.

### 2. has_event_permission — updated
  The existing function validates permission names against an explicit
  whitelist (IN-list) and resolves them via a CASE statement.
  Both are extended with `can_manage_safety`.
  Signature, SECURITY DEFINER, search_path, and grants are preserved.

### 3. New table: safety_dossiers
  One optional dossier per event.
  - id (uuid PK)
  - event_id (text, UNIQUE, FK → events ON DELETE CASCADE)
  - status (text, CHECK: draft/collecting/review/approved/archived)
  - activated_by (uuid, FK → profiles)
  - activated_at, notes, created_at, updated_at

### 4. New table: safety_contacts
  Safety-specific role contacts within a dossier.
  - id (uuid PK)
  - dossier_id (uuid, FK → safety_dossiers ON DELETE CASCADE)
  - role (text, CHECK: employer/delegated_manager/rspp/emergency_coordinator/
    signatory/client_contact/agency_contact/onsite_contact/
    external_consultant/other)
  - first_name, last_name, organization, email, phone, notes
  - sort_order, created_at, updated_at

### 5. New table: safety_requirements
  Document/information checklist items within a dossier.
  - id (uuid PK)
  - dossier_id (uuid, FK → safety_dossiers ON DELETE CASCADE)
  - category (text, CHECK: general/location/supplier/transport/activity/
    temporary_structures/catering/speakers/other)
  - title, description
  - status (text, CHECK: required/requested/received/needs_review/approved/not_applicable)
  - due_date, responsible_id (FK → profiles), supplier_id (FK → suppliers),
    document_id (FK → documents)
  - notes, sort_order, created_at, updated_at

### 6. Indexes
  - safety_dossiers: unique on event_id (implicit from UNIQUE constraint),
    index on status
  - safety_contacts: index on dossier_id
  - safety_requirements: indexes on dossier_id, status, due_date,
    supplier_id, document_id

### 7. RLS policies
  - SELECT: authenticated users who can access the related event
    (via _can_access_event_internal)
  - INSERT/UPDATE/DELETE: authenticated users with can_manage_safety
    (via has_event_permission)
  - No anon access

### 8. Triggers
  - set_updated_at on all three new tables (reuses existing trigger function)

## Important Notes
1. No dossier rows are created — activation is explicit per-event.
2. No existing event, document, supplier, or permission data is modified.
3. No audit triggers added — contact fields may contain personal data;
   audit logging will be reviewed separately.
4. The upsert_event_member RPC is NOT modified here — can_manage_safety
   can be toggled via direct UPDATE or a future RPC extension.
5. All policies use TO authenticated only — no anon access.
*/

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Add can_manage_safety to event_members
-- ══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_members'
      AND column_name = 'can_manage_safety'
  ) THEN
    ALTER TABLE event_members
      ADD COLUMN can_manage_safety boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Update has_event_permission to recognise can_manage_safety
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION has_event_permission(p_event_id text, p_permission text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_pm_id text;
  v_uid uuid := auth.uid();
  v_result boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  IF p_permission NOT IN (
    'can_manage_members', 'can_manage_budget', 'can_manage_documents',
    'can_manage_payments', 'can_manage_creative', 'can_manage_registration',
    'can_access_onsite', 'can_manage_safety'
  ) THEN
    RETURN false;
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_uid;
  IF v_role IN ('Admin', 'Super Admin', 'Amministrazione') THEN
    RETURN true;
  END IF;

  SELECT project_manager_id INTO v_pm_id FROM events WHERE id = p_event_id;
  IF v_pm_id IS NOT NULL AND _is_valid_uuid(v_pm_id) AND v_pm_id::uuid = v_uid THEN
    RETURN true;
  END IF;

  CASE p_permission
    WHEN 'can_manage_members' THEN
      SELECT em.can_manage_members INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_manage_budget' THEN
      SELECT em.can_manage_budget INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_manage_documents' THEN
      SELECT em.can_manage_documents INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_manage_payments' THEN
      SELECT em.can_manage_payments INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_manage_creative' THEN
      SELECT em.can_manage_creative INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_manage_registration' THEN
      SELECT em.can_manage_registration INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_access_onsite' THEN
      SELECT em.can_access_onsite INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    WHEN 'can_manage_safety' THEN
      SELECT em.can_manage_safety INTO v_result FROM event_members em WHERE em.event_id = p_event_id AND em.user_id = v_uid;
    ELSE
      RETURN false;
  END CASE;

  RETURN COALESCE(v_result, false);
END;
$$;

-- Preserve existing grants exactly
REVOKE EXECUTE ON FUNCTION has_event_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION has_event_permission(text, text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Create safety_dossiers
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS safety_dossiers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        text        NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'draft',
  activated_by    uuid        NOT NULL REFERENCES profiles(id),
  activated_at    timestamptz NOT NULL DEFAULT now(),
  notes           text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT safety_dossiers_status_check CHECK (
    status IN ('draft', 'collecting', 'review', 'approved', 'archived')
  )
);

CREATE INDEX IF NOT EXISTS idx_safety_dossiers_status
  ON safety_dossiers (status);

-- ══════════════════════════════════════════════════════════════════════════
-- 4. Create safety_contacts
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS safety_contacts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id      uuid        NOT NULL REFERENCES safety_dossiers(id) ON DELETE CASCADE,
  role            text        NOT NULL,
  first_name      text        NOT NULL,
  last_name       text        NOT NULL DEFAULT '',
  organization    text        NOT NULL DEFAULT '',
  email           text        NOT NULL DEFAULT '',
  phone           text        NOT NULL DEFAULT '',
  notes           text        NOT NULL DEFAULT '',
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT safety_contacts_role_check CHECK (
    role IN (
      'employer', 'delegated_manager', 'rspp', 'emergency_coordinator',
      'signatory', 'client_contact', 'agency_contact', 'onsite_contact',
      'external_consultant', 'other'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_safety_contacts_dossier
  ON safety_contacts (dossier_id);

-- ══════════════════════════════════════════════════════════════════════════
-- 5. Create safety_requirements
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS safety_requirements (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id      uuid        NOT NULL REFERENCES safety_dossiers(id) ON DELETE CASCADE,
  category        text        NOT NULL DEFAULT 'general',
  title           text        NOT NULL,
  description     text        NOT NULL DEFAULT '',
  status          text        NOT NULL DEFAULT 'required',
  due_date        date,
  responsible_id  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  supplier_id     text        REFERENCES suppliers(id) ON DELETE SET NULL,
  document_id     uuid        REFERENCES documents(id) ON DELETE SET NULL,
  notes           text        NOT NULL DEFAULT '',
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT safety_requirements_category_check CHECK (
    category IN (
      'general', 'location', 'supplier', 'transport', 'activity',
      'temporary_structures', 'catering', 'speakers', 'other'
    )
  ),
  CONSTRAINT safety_requirements_status_check CHECK (
    status IN (
      'required', 'requested', 'received', 'needs_review', 'approved', 'not_applicable'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_safety_requirements_dossier
  ON safety_requirements (dossier_id);
CREATE INDEX IF NOT EXISTS idx_safety_requirements_status
  ON safety_requirements (status);
CREATE INDEX IF NOT EXISTS idx_safety_requirements_due_date
  ON safety_requirements (due_date)
  WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_requirements_supplier
  ON safety_requirements (supplier_id)
  WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_requirements_document
  ON safety_requirements (document_id)
  WHERE document_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. Enable RLS
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE safety_dossiers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_requirements  ENABLE ROW LEVEL SECURITY;

-- ── safety_dossiers policies ─────────────────────────────────────────────

DROP POLICY IF EXISTS "sd_select" ON safety_dossiers;
CREATE POLICY "sd_select" ON safety_dossiers FOR SELECT
  TO authenticated
  USING (_can_access_event_internal(event_id, auth.uid()));

DROP POLICY IF EXISTS "sd_insert" ON safety_dossiers;
CREATE POLICY "sd_insert" ON safety_dossiers FOR INSERT
  TO authenticated
  WITH CHECK (has_event_permission(event_id, 'can_manage_safety'));

DROP POLICY IF EXISTS "sd_update" ON safety_dossiers;
CREATE POLICY "sd_update" ON safety_dossiers FOR UPDATE
  TO authenticated
  USING  (has_event_permission(event_id, 'can_manage_safety'))
  WITH CHECK (has_event_permission(event_id, 'can_manage_safety'));

DROP POLICY IF EXISTS "sd_delete" ON safety_dossiers;
CREATE POLICY "sd_delete" ON safety_dossiers FOR DELETE
  TO authenticated
  USING (has_event_permission(event_id, 'can_manage_safety'));

-- ── safety_contacts policies ─────────────────────────────────────────────

DROP POLICY IF EXISTS "sc_select" ON safety_contacts;
CREATE POLICY "sc_select" ON safety_contacts FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM safety_dossiers sd
    WHERE sd.id = dossier_id
      AND _can_access_event_internal(sd.event_id, auth.uid())
  ));

DROP POLICY IF EXISTS "sc_insert" ON safety_contacts;
CREATE POLICY "sc_insert" ON safety_contacts FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM safety_dossiers sd
    WHERE sd.id = dossier_id
      AND has_event_permission(sd.event_id, 'can_manage_safety')
  ));

DROP POLICY IF EXISTS "sc_update" ON safety_contacts;
CREATE POLICY "sc_update" ON safety_contacts FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM safety_dossiers sd
    WHERE sd.id = dossier_id
      AND has_event_permission(sd.event_id, 'can_manage_safety')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM safety_dossiers sd
    WHERE sd.id = dossier_id
      AND has_event_permission(sd.event_id, 'can_manage_safety')
  ));

DROP POLICY IF EXISTS "sc_delete" ON safety_contacts;
CREATE POLICY "sc_delete" ON safety_contacts FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM safety_dossiers sd
    WHERE sd.id = dossier_id
      AND has_event_permission(sd.event_id, 'can_manage_safety')
  ));

-- ── safety_requirements policies ─────────────────────────────────────────

DROP POLICY IF EXISTS "sr_select" ON safety_requirements;
CREATE POLICY "sr_select" ON safety_requirements FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM safety_dossiers sd
    WHERE sd.id = dossier_id
      AND _can_access_event_internal(sd.event_id, auth.uid())
  ));

DROP POLICY IF EXISTS "sr_insert" ON safety_requirements;
CREATE POLICY "sr_insert" ON safety_requirements FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM safety_dossiers sd
    WHERE sd.id = dossier_id
      AND has_event_permission(sd.event_id, 'can_manage_safety')
  ));

DROP POLICY IF EXISTS "sr_update" ON safety_requirements;
CREATE POLICY "sr_update" ON safety_requirements FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM safety_dossiers sd
    WHERE sd.id = dossier_id
      AND has_event_permission(sd.event_id, 'can_manage_safety')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM safety_dossiers sd
    WHERE sd.id = dossier_id
      AND has_event_permission(sd.event_id, 'can_manage_safety')
  ));

DROP POLICY IF EXISTS "sr_delete" ON safety_requirements;
CREATE POLICY "sr_delete" ON safety_requirements FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM safety_dossiers sd
    WHERE sd.id = dossier_id
      AND has_event_permission(sd.event_id, 'can_manage_safety')
  ));

-- ══════════════════════════════════════════════════════════════════════════
-- 7. Apply set_updated_at trigger to all three tables
-- ══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS set_updated_at ON safety_dossiers;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON safety_dossiers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON safety_contacts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON safety_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON safety_requirements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON safety_requirements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
