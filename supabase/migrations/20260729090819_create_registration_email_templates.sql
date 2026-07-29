/*
# Create Registration Email Templates Table

## Summary
Adds a reusable email template system for event registration flows.
Templates store structured block-based content (subject, preheader, theme, blocks)
but never raw HTML, recipient data, or rendered output.

## New Table: registration_email_templates
- `id` (uuid, PK) — unique template identifier
- `event_id` (text, NOT NULL, FK → events ON DELETE CASCADE) — owning event
- `client_id` (text, NULL, FK → clients ON DELETE SET NULL) — auto-derived from events.client_id
- `site_id` (uuid, NULL, FK → registration_sites ON DELETE SET NULL) — optional site scope
- `name` (text, NOT NULL) — human-readable template name, 1-100 chars trimmed
- `template_type` (text, NOT NULL) — one of: invitation, registration_confirmed, registration_waitlist, reminder
- `subject` (text, NOT NULL) — email subject line, 1-200 chars trimmed
- `preheader` (text, NOT NULL, default '') — preview text, max 300 chars
- `theme` (jsonb, NOT NULL, default '{}') — visual theme settings (must be an object)
- `blocks` (jsonb, NOT NULL, default '[]') — ordered content blocks (must be an array)
- `is_active` (boolean, NOT NULL, default true) — soft enable/disable
- `version` (integer, NOT NULL, default 1) — incremental version, must be > 0
- `created_by` (uuid, NOT NULL, FK → profiles) — creator
- `created_at` / `updated_at` (timestamptz, NOT NULL)

## Modified Table: invitation_batches
- `template_id` (uuid, NULL, FK → registration_email_templates ON DELETE SET NULL) — optional linked template
- `template_snapshot` (jsonb, NULL) — frozen copy of template at send time (must be object if present)

## Triggers
- `set_email_template_client_id`: auto-derives `client_id` from `events.client_id` on INSERT/UPDATE.
- `set_updated_at`: standard updated_at refresh on registration_email_templates.

## Security
- RLS enabled on registration_email_templates.
- All CRUD scoped to authenticated users with `has_event_permission(event_id, 'can_manage_registration')`.
- INSERT requires `created_by = auth.uid()`.
- UPDATE prevents moving a template to an unauthorized event.
- No anon access.

## Important Notes
1. No raw HTML stored — blocks/theme are structured JSON only.
2. No recipient data, email addresses, QR tokens, or rendered content in templates.
3. Existing email_subject and email_message columns on invitation_batches are preserved.
4. No emails sent. No test data.
*/

-- ═══════════════════════════════════════════════════════════════════════
-- 1. registration_email_templates table
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.registration_email_templates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       text        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  client_id      text                 REFERENCES public.clients(id) ON DELETE SET NULL,
  site_id        uuid                 REFERENCES public.registration_sites(id) ON DELETE SET NULL,
  name           text        NOT NULL,
  template_type  text        NOT NULL,
  subject        text        NOT NULL,
  preheader      text        NOT NULL DEFAULT '',
  theme          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  blocks         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_active      boolean     NOT NULL DEFAULT true,
  version        integer     NOT NULL DEFAULT 1,
  created_by     uuid        NOT NULL REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ret_template_type_check
    CHECK (template_type IN ('invitation','registration_confirmed','registration_waitlist','reminder')),
  CONSTRAINT ret_name_length
    CHECK (length(trim(name)) BETWEEN 1 AND 100),
  CONSTRAINT ret_subject_length
    CHECK (length(trim(subject)) BETWEEN 1 AND 200),
  CONSTRAINT ret_preheader_length
    CHECK (length(preheader) <= 300),
  CONSTRAINT ret_version_positive
    CHECK (version > 0),
  CONSTRAINT ret_theme_is_object
    CHECK (jsonb_typeof(theme) = 'object'),
  CONSTRAINT ret_blocks_is_array
    CHECK (jsonb_typeof(blocks) = 'array')
);

-- Unique: one name per event + template_type (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ret_event_type_name
  ON public.registration_email_templates (event_id, template_type, lower(name));

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Auto-derive client_id from events trigger
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_email_template_client_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT e.client_id INTO NEW.client_id
    FROM events e
   WHERE e.id = NEW.event_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_email_template_client_id ON public.registration_email_templates;
CREATE TRIGGER trg_set_email_template_client_id
  BEFORE INSERT OR UPDATE ON public.registration_email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_email_template_client_id();

-- ═══════════════════════════════════════════════════════════════════════
-- 3. updated_at trigger
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS registration_email_templates_set_updated_at ON public.registration_email_templates;
CREATE TRIGGER registration_email_templates_set_updated_at
  BEFORE UPDATE ON public.registration_email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Add template_id and template_snapshot to invitation_batches
-- ═══════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'invitation_batches'
       AND column_name = 'template_id'
  ) THEN
    ALTER TABLE public.invitation_batches
      ADD COLUMN template_id uuid REFERENCES public.registration_email_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'invitation_batches'
       AND column_name = 'template_snapshot'
  ) THEN
    ALTER TABLE public.invitation_batches
      ADD COLUMN template_snapshot jsonb;
  END IF;
END $$;

-- Check constraint (idempotent via drop-if-exists pattern)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.invitation_batches'::regclass
       AND conname = 'ib_template_snapshot_is_object'
  ) THEN
    ALTER TABLE public.invitation_batches
      ADD CONSTRAINT ib_template_snapshot_is_object
      CHECK (template_snapshot IS NULL OR jsonb_typeof(template_snapshot) = 'object');
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. RLS on registration_email_templates
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.registration_email_templates ENABLE ROW LEVEL SECURITY;

-- SELECT: user has can_manage_registration on the event
DROP POLICY IF EXISTS "select_email_templates" ON public.registration_email_templates;
CREATE POLICY "select_email_templates"
  ON public.registration_email_templates
  FOR SELECT TO authenticated
  USING (public.has_event_permission(event_id, 'can_manage_registration'));

-- INSERT: user has permission AND is the creator
DROP POLICY IF EXISTS "insert_email_templates" ON public.registration_email_templates;
CREATE POLICY "insert_email_templates"
  ON public.registration_email_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_event_permission(event_id, 'can_manage_registration')
    AND created_by = auth.uid()
  );

-- UPDATE: user has permission on BOTH old and new event_id
DROP POLICY IF EXISTS "update_email_templates" ON public.registration_email_templates;
CREATE POLICY "update_email_templates"
  ON public.registration_email_templates
  FOR UPDATE TO authenticated
  USING (public.has_event_permission(event_id, 'can_manage_registration'))
  WITH CHECK (public.has_event_permission(event_id, 'can_manage_registration'));

-- DELETE: user has permission on the event
DROP POLICY IF EXISTS "delete_email_templates" ON public.registration_email_templates;
CREATE POLICY "delete_email_templates"
  ON public.registration_email_templates
  FOR DELETE TO authenticated
  USING (public.has_event_permission(event_id, 'can_manage_registration'));
