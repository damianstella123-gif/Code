/*
# Create Event Registration Tables

## Purpose
Foundation tables for event registration sites, form field configuration,
and attendee registrations with check-in support.

## New Tables

### 1. registration_sites
Event-linked registration pages with configurable branding, capacity,
scheduling, privacy, and waitlist support.
- id (uuid PK)
- event_id (text FK events, ON DELETE CASCADE)
- slug (text UNIQUE, URL-safe identifier)
- status (text: draft/published/closed)
- title, subtitle, description (text, branding)
- logo_url, hero_image_url (text nullable, visuals)
- theme, content, settings (jsonb, flexible config)
- privacy_url, privacy_text (privacy/GDPR)
- confirmation_message (text shown post-registration)
- capacity (integer nullable, max attendees)
- waitlist_enabled (boolean)
- opens_at, closes_at, published_at (timestamptz scheduling)
- created_by (uuid FK profiles, nullable)
- created_at, updated_at

### 2. registration_form_fields
Configurable form fields per registration site.
- id (uuid PK)
- site_id (uuid FK registration_sites, ON DELETE CASCADE)
- field_key (text, machine name)
- label (text, display label)
- field_type (text: text/email/phone/number/textarea/select/checkbox/date)
- required (boolean)
- options (jsonb, for select fields)
- placeholder, help_text (text)
- sort_order (integer)
- is_active (boolean)
- created_at, updated_at
- UNIQUE(site_id, field_key)

### 3. event_registrations
Individual attendee registrations with check-in and QR code support.
- id (uuid PK)
- site_id (uuid FK registration_sites, ON DELETE CASCADE)
- event_id (text FK events, ON DELETE CASCADE)
- registration_status (text: confirmed/waitlist/cancelled)
- first_name, last_name, email (text NOT NULL)
- phone, company, job_title (text)
- dietary_requirements, accessibility_requirements (text)
- custom_answers (jsonb, dynamic field responses)
- privacy_accepted (boolean NOT NULL)
- marketing_consent (boolean)
- qr_token (uuid UNIQUE, for check-in QR codes)
- checked_in_at (timestamptz nullable)
- checked_in_by (uuid FK profiles, nullable)
- created_at, updated_at

## Security
- RLS enabled on all three tables.
- No anon access.
- SELECT: can_access_event(event_id) for sites; parent-site access for fields;
  has_event_permission for registrations.
- INSERT/UPDATE/DELETE: has_event_permission(event_id, 'can_manage_registration').

## Important Notes
1. Reuses existing can_access_event() and has_event_permission() helpers.
2. Reuses existing set_updated_at trigger function.
3. events.id is text — foreign keys use text type.
4. No test data inserted.
*/

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: registration_sites
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS registration_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  logo_url text,
  hero_image_url text,
  theme jsonb NOT NULL DEFAULT '{}',
  content jsonb NOT NULL DEFAULT '{}',
  settings jsonb NOT NULL DEFAULT '{}',
  privacy_url text,
  privacy_text text NOT NULL DEFAULT '',
  confirmation_message text NOT NULL DEFAULT 'Registrazione completata con successo.',
  capacity integer,
  waitlist_enabled boolean NOT NULL DEFAULT true,
  opens_at timestamptz,
  closes_at timestamptz,
  published_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rs_status_check CHECK (status IN ('draft', 'published', 'closed')),
  CONSTRAINT rs_capacity_check CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT rs_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9\-]*[a-z0-9]$' OR (length(slug) = 3 AND slug ~ '^[a-z0-9]+$')),
  CONSTRAINT rs_slug_length CHECK (length(slug) >= 3 AND length(slug) <= 80),
  CONSTRAINT rs_dates_check CHECK (closes_at IS NULL OR opens_at IS NULL OR closes_at > opens_at)
);

CREATE INDEX IF NOT EXISTS idx_rs_event_id ON registration_sites(event_id);
CREATE INDEX IF NOT EXISTS idx_rs_status ON registration_sites(status);
CREATE INDEX IF NOT EXISTS idx_rs_slug ON registration_sites(slug);

CREATE TRIGGER trg_registration_sites_updated_at
  BEFORE UPDATE ON registration_sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: registration_form_fields
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS registration_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES registration_sites(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '[]',
  placeholder text NOT NULL DEFAULT '',
  help_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rff_field_type_check CHECK (field_type IN ('text', 'email', 'phone', 'number', 'textarea', 'select', 'checkbox', 'date')),
  CONSTRAINT rff_field_key_format CHECK (field_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT rff_unique_site_field UNIQUE (site_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_rff_site_sort ON registration_form_fields(site_id, sort_order);

CREATE TRIGGER trg_registration_form_fields_updated_at
  BEFORE UPDATE ON registration_form_fields
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- TABLE: event_registrations
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES registration_sites(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registration_status text NOT NULL DEFAULT 'confirmed',
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  job_title text NOT NULL DEFAULT '',
  dietary_requirements text NOT NULL DEFAULT '',
  accessibility_requirements text NOT NULL DEFAULT '',
  custom_answers jsonb NOT NULL DEFAULT '{}',
  privacy_accepted boolean NOT NULL,
  marketing_consent boolean NOT NULL DEFAULT false,
  qr_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  checked_in_at timestamptz,
  checked_in_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT er_status_check CHECK (registration_status IN ('confirmed', 'waitlist', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_er_site_email ON event_registrations(site_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_er_event_id ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_er_site_id ON event_registrations(site_id);
CREATE INDEX IF NOT EXISTS idx_er_status ON event_registrations(registration_status);
CREATE INDEX IF NOT EXISTS idx_er_qr_token ON event_registrations(qr_token);

CREATE TRIGGER trg_event_registrations_updated_at
  BEFORE UPDATE ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS: registration_sites
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE registration_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rs_select" ON registration_sites;
CREATE POLICY "rs_select" ON registration_sites FOR SELECT
  TO authenticated
  USING (can_access_event(event_id));

DROP POLICY IF EXISTS "rs_insert" ON registration_sites;
CREATE POLICY "rs_insert" ON registration_sites FOR INSERT
  TO authenticated
  WITH CHECK (has_event_permission(event_id, 'can_manage_registration'));

DROP POLICY IF EXISTS "rs_update" ON registration_sites;
CREATE POLICY "rs_update" ON registration_sites FOR UPDATE
  TO authenticated
  USING (has_event_permission(event_id, 'can_manage_registration'))
  WITH CHECK (has_event_permission(event_id, 'can_manage_registration'));

DROP POLICY IF EXISTS "rs_delete" ON registration_sites;
CREATE POLICY "rs_delete" ON registration_sites FOR DELETE
  TO authenticated
  USING (has_event_permission(event_id, 'can_manage_registration'));

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS: registration_form_fields
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE registration_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rff_select" ON registration_form_fields;
CREATE POLICY "rff_select" ON registration_form_fields FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM registration_sites rs
    WHERE rs.id = registration_form_fields.site_id
      AND can_access_event(rs.event_id)
  ));

DROP POLICY IF EXISTS "rff_insert" ON registration_form_fields;
CREATE POLICY "rff_insert" ON registration_form_fields FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM registration_sites rs
    WHERE rs.id = registration_form_fields.site_id
      AND has_event_permission(rs.event_id, 'can_manage_registration')
  ));

DROP POLICY IF EXISTS "rff_update" ON registration_form_fields;
CREATE POLICY "rff_update" ON registration_form_fields FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM registration_sites rs
    WHERE rs.id = registration_form_fields.site_id
      AND has_event_permission(rs.event_id, 'can_manage_registration')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM registration_sites rs
    WHERE rs.id = registration_form_fields.site_id
      AND has_event_permission(rs.event_id, 'can_manage_registration')
  ));

DROP POLICY IF EXISTS "rff_delete" ON registration_form_fields;
CREATE POLICY "rff_delete" ON registration_form_fields FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM registration_sites rs
    WHERE rs.id = registration_form_fields.site_id
      AND has_event_permission(rs.event_id, 'can_manage_registration')
  ));

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS: event_registrations
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "er_select" ON event_registrations;
CREATE POLICY "er_select" ON event_registrations FOR SELECT
  TO authenticated
  USING (has_event_permission(event_id, 'can_manage_registration'));

DROP POLICY IF EXISTS "er_insert" ON event_registrations;
CREATE POLICY "er_insert" ON event_registrations FOR INSERT
  TO authenticated
  WITH CHECK (has_event_permission(event_id, 'can_manage_registration'));

DROP POLICY IF EXISTS "er_update" ON event_registrations;
CREATE POLICY "er_update" ON event_registrations FOR UPDATE
  TO authenticated
  USING (has_event_permission(event_id, 'can_manage_registration'))
  WITH CHECK (has_event_permission(event_id, 'can_manage_registration'));

DROP POLICY IF EXISTS "er_delete" ON event_registrations;
CREATE POLICY "er_delete" ON event_registrations FOR DELETE
  TO authenticated
  USING (has_event_permission(event_id, 'can_manage_registration'));
