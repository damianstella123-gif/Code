/*
# Creative Studio Generation Foundation

## Purpose
Establishes secure schema and RLS for template-based document generation
in Creative Studio without modifying existing creative data.

## 1. New Function
- `can_manage_global_creative()` — returns true for Admin, Super Admin, Regista roles only.
  SECURITY DEFINER, search_path = public, pg_temp.

## 2. New Tables
- `creative_templates`
  - id (uuid PK)
  - name, description, template_type, file_path, original_file_name, file_size, mime_type
  - placeholder_keys (text[])
  - client_id (FK clients), is_active, created_by (FK profiles)
  - created_at, updated_at
- `creative_generations`
  - id (uuid PK)
  - creative_project_id (FK creative_projects ON DELETE SET NULL)
  - template_id (FK creative_templates ON DELETE RESTRICT)
  - event_id (FK events), client_id (FK clients)
  - generation_status (queued/generating/completed/error)
  - input_payload (jsonb), output_path, error_message
  - created_by (FK profiles)
  - created_at, updated_at, completed_at

## 3. RLS Changes
- creative_projects: event-linked SELECT via can_access_event, event-linked writes via has_event_permission;
  global rows: SELECT for authenticated, writes require can_manage_global_creative.
- presentation_versions: same pattern.
- creative_templates: SELECT active for authenticated; full CRUD for can_manage_global_creative.
- creative_generations: SELECT event-linked via can_access_event; global via owner or can_manage_global_creative.
  No INSERT/UPDATE/DELETE policies yet (Edge Function will handle writes).

## 4. Security
- No anon access on any creative table.
- Existing rows unchanged (both tables have 0 rows).

## Important Notes
1. Storage bucket policies for templates/creative-files remain overly permissive (anon+authenticated CRUD)
   and MUST be corrected in a separate migration before template upload is enabled.
2. creative_projects.responsible_id is text (not uuid) — policies account for this.
3. presentation_versions.responsible_id is uuid — policies account for this.
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. GLOBAL CREATIVE HELPER
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION can_manage_global_creative()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  RETURN v_role IN ('Admin', 'Super Admin', 'Regista');
END;
$$;

REVOKE ALL ON FUNCTION can_manage_global_creative() FROM PUBLIC;
REVOKE ALL ON FUNCTION can_manage_global_creative() FROM anon;
GRANT EXECUTE ON FUNCTION can_manage_global_creative() TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. CREATIVE_TEMPLATES TABLE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS creative_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  template_type text NOT NULL DEFAULT 'pptx',
  file_path text NOT NULL,
  original_file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL,
  placeholder_keys text[] NOT NULL DEFAULT '{}',
  client_id text NULL REFERENCES clients(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_template_type CHECK (template_type IN ('pptx')),
  CONSTRAINT chk_file_size_positive CHECK (file_size >= 0)
);

CREATE INDEX IF NOT EXISTS idx_creative_templates_client_id ON creative_templates(client_id);
CREATE INDEX IF NOT EXISTS idx_creative_templates_is_active ON creative_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_creative_templates_created_by ON creative_templates(created_by);

DROP TRIGGER IF EXISTS set_updated_at_creative_templates ON creative_templates;
CREATE TRIGGER set_updated_at_creative_templates
  BEFORE UPDATE ON creative_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE creative_templates ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. CREATIVE_GENERATIONS TABLE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS creative_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_project_id uuid NULL REFERENCES creative_projects(id) ON DELETE SET NULL,
  template_id uuid NOT NULL REFERENCES creative_templates(id) ON DELETE RESTRICT,
  event_id text NULL REFERENCES events(id) ON DELETE SET NULL,
  client_id text NULL REFERENCES clients(id) ON DELETE SET NULL,
  generation_status text NOT NULL DEFAULT 'queued',
  input_payload jsonb NOT NULL DEFAULT '{}',
  output_path text NULL,
  error_message text NULL,
  created_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,

  CONSTRAINT chk_generation_status CHECK (generation_status IN ('queued', 'generating', 'completed', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_creative_generations_event_id ON creative_generations(event_id);
CREATE INDEX IF NOT EXISTS idx_creative_generations_client_id ON creative_generations(client_id);
CREATE INDEX IF NOT EXISTS idx_creative_generations_template_id ON creative_generations(template_id);
CREATE INDEX IF NOT EXISTS idx_creative_generations_status ON creative_generations(generation_status);
CREATE INDEX IF NOT EXISTS idx_creative_generations_created_by ON creative_generations(created_by);

DROP TRIGGER IF EXISTS set_updated_at_creative_generations ON creative_generations;
CREATE TRIGGER set_updated_at_creative_generations
  BEFORE UPDATE ON creative_generations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE creative_generations ENABLE ROW LEVEL SECURITY;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. RLS — CREATIVE_PROJECTS (replace existing broad policies)
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "authenticated_select_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "authenticated_insert_creative_projects" ON creative_projects;
DROP POLICY IF EXISTS "creative_projects_update_owner_admin" ON creative_projects;
DROP POLICY IF EXISTS "creative_projects_delete_owner_admin" ON creative_projects;

-- SELECT: event-linked = can_access_event; global = any authenticated
DROP POLICY IF EXISTS "cp_select_event_linked" ON creative_projects;
CREATE POLICY "cp_select_event_linked" ON creative_projects FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN event_id IS NOT NULL THEN can_access_event(event_id)
      ELSE true
    END
  );

-- INSERT: event-linked = has_event_permission; global = can_manage_global_creative
DROP POLICY IF EXISTS "cp_insert" ON creative_projects;
CREATE POLICY "cp_insert" ON creative_projects FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_creative')
      ELSE can_manage_global_creative()
    END
  );

-- UPDATE: event-linked = has_event_permission; global = can_manage_global_creative
DROP POLICY IF EXISTS "cp_update" ON creative_projects;
CREATE POLICY "cp_update" ON creative_projects FOR UPDATE
  TO authenticated
  USING (
    CASE
      WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_creative')
      ELSE can_manage_global_creative()
    END
  )
  WITH CHECK (
    CASE
      WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_creative')
      ELSE can_manage_global_creative()
    END
  );

-- DELETE: event-linked = has_event_permission; global = can_manage_global_creative
DROP POLICY IF EXISTS "cp_delete" ON creative_projects;
CREATE POLICY "cp_delete" ON creative_projects FOR DELETE
  TO authenticated
  USING (
    CASE
      WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_creative')
      ELSE can_manage_global_creative()
    END
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. RLS — PRESENTATION_VERSIONS (replace existing broad policies)
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "authenticated_select_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "authenticated_insert_presentation_versions" ON presentation_versions;
DROP POLICY IF EXISTS "presentation_versions_update_owner_admin" ON presentation_versions;
DROP POLICY IF EXISTS "presentation_versions_delete_owner_admin" ON presentation_versions;

-- SELECT: event-linked = can_access_event; global = any authenticated
DROP POLICY IF EXISTS "pv_select" ON presentation_versions;
CREATE POLICY "pv_select" ON presentation_versions FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN event_id IS NOT NULL THEN can_access_event(event_id)
      ELSE true
    END
  );

-- INSERT: event-linked = has_event_permission; global = can_manage_global_creative
DROP POLICY IF EXISTS "pv_insert" ON presentation_versions;
CREATE POLICY "pv_insert" ON presentation_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_creative')
      ELSE can_manage_global_creative()
    END
  );

-- UPDATE: event-linked = has_event_permission; global = can_manage_global_creative
DROP POLICY IF EXISTS "pv_update" ON presentation_versions;
CREATE POLICY "pv_update" ON presentation_versions FOR UPDATE
  TO authenticated
  USING (
    CASE
      WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_creative')
      ELSE can_manage_global_creative()
    END
  )
  WITH CHECK (
    CASE
      WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_creative')
      ELSE can_manage_global_creative()
    END
  );

-- DELETE: event-linked = has_event_permission; global = can_manage_global_creative
DROP POLICY IF EXISTS "pv_delete" ON presentation_versions;
CREATE POLICY "pv_delete" ON presentation_versions FOR DELETE
  TO authenticated
  USING (
    CASE
      WHEN event_id IS NOT NULL THEN has_event_permission(event_id, 'can_manage_creative')
      ELSE can_manage_global_creative()
    END
  );


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. RLS — CREATIVE_TEMPLATES
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ct_select" ON creative_templates;
CREATE POLICY "ct_select" ON creative_templates FOR SELECT
  TO authenticated
  USING (
    is_active = true OR can_manage_global_creative()
  );

DROP POLICY IF EXISTS "ct_insert" ON creative_templates;
CREATE POLICY "ct_insert" ON creative_templates FOR INSERT
  TO authenticated
  WITH CHECK (can_manage_global_creative());

DROP POLICY IF EXISTS "ct_update" ON creative_templates;
CREATE POLICY "ct_update" ON creative_templates FOR UPDATE
  TO authenticated
  USING (can_manage_global_creative())
  WITH CHECK (can_manage_global_creative());

DROP POLICY IF EXISTS "ct_delete" ON creative_templates;
CREATE POLICY "ct_delete" ON creative_templates FOR DELETE
  TO authenticated
  USING (can_manage_global_creative());


-- ══════════════════════════════════════════════════════════════════════════════
-- 7. RLS — CREATIVE_GENERATIONS (SELECT only — writes via Edge Function)
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "cg_select" ON creative_generations;
CREATE POLICY "cg_select" ON creative_generations FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN event_id IS NOT NULL THEN can_access_event(event_id)
      ELSE (created_by = auth.uid() OR can_manage_global_creative())
    END
  );
