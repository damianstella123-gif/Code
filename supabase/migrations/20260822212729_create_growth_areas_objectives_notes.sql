/*
# Growth & Development Framework — Schema Foundation

## Overview
Creates the schema to support 1-on-1 growth conversations between a person and
their direct manager (responsabile). Each person has growth areas, each area has
measurable objectives and a shared discussion thread (notes).

## Changes

### 1. profiles — new column
- `responsabile_id` (uuid, nullable, FK to profiles(id) ON DELETE SET NULL)
  Links a person to their direct manager. Populated manually by company owners.

### 2. New Table: growth_areas
- `id` (uuid, PK)
- `person_id` (uuid, NOT NULL, FK profiles(id) ON DELETE CASCADE) — whose growth
- `titolo` (text, NOT NULL) — short name
- `creato_da` (text, NOT NULL, CHECK 'persona' or 'capo') — who authored it
- `stato` (text, NOT NULL, DEFAULT 'bozza', CHECK 'bozza' or 'condiviso')
  - Entries by 'persona' are always inserted as 'condiviso' (immediately visible)
  - Entries by 'capo' start as 'bozza' (visible only to capo/admin) and become
    'condiviso' when the manager finalizes them
- `created_at`, `updated_at` (timestamptz)

### 3. New Table: growth_objectives
- `id` (uuid, PK)
- `area_id` (uuid, NOT NULL, FK growth_areas(id) ON DELETE CASCADE)
- `titolo` (text, NOT NULL) — the concrete measurable goal
- `stato` (text, NOT NULL, DEFAULT 'da_iniziare', CHECK 'da_iniziare','in_corso','raggiunto')
- `fonte` (text, NOT NULL, DEFAULT 'manuale', CHECK 'manuale','auto_performance')
  - 'manuale' = set by hand (Phase 1)
  - 'auto_performance' = reserved for future automatic link to Performance data
- `creato_da` (text, NOT NULL, CHECK 'persona' or 'capo')
- `created_at`, `updated_at` (timestamptz)

### 4. New Table: growth_notes
- `id` (uuid, PK)
- `area_id` (uuid, NOT NULL, FK growth_areas(id) ON DELETE CASCADE)
- `author_id` (uuid, NOT NULL, FK profiles(id) ON DELETE CASCADE)
- `body` (text, NOT NULL)
- `created_at` (timestamptz)

### 5. Security (RLS) — Visibility Logic

All three tables have RLS enabled with the following access model:

**SELECT (who can see a row):**
- Admin / Super Admin → see everything
- The person themselves (person_id = auth.uid()) → see their own rows ONLY if
  stato = 'condiviso' OR creato_da = 'persona' (a person always sees their own
  authored entries, but cannot see a manager's draft until it is shared)
- The person's direct manager (profiles.responsabile_id = auth.uid()) → sees
  only 'condiviso' rows (never sees another person's drafts)
- For growth_objectives and growth_notes, visibility is inherited from the
  parent growth_areas row via area_id join

**INSERT:**
- A user can insert for themselves (person_id = auth.uid(), creato_da = 'persona')
- A manager can insert for their report (creato_da = 'capo') — verified via
  EXISTS check on profiles.responsabile_id
- Admin / Super Admin can insert for anyone
- growth_notes: any user who can SELECT the parent area can insert (author_id = auth.uid())

**UPDATE:**
- The person can update their own entries (person_id = auth.uid() AND creato_da = 'persona')
- The manager can update entries they authored (creato_da = 'capo') for their report
  — this lets them move 'bozza' → 'condiviso'
- Admin / Super Admin can update anything

**DELETE:**
- Admin / Super Admin can delete anything
- The original creator can delete their own not-yet-shared drafts (stato = 'bozza')

## Important Notes
1. No UI or service code is created — this is schema only.
2. The responsabile_id column is left NULL for all existing rows.
3. get_my_role() is reused from existing migrations for role checks.
4. growth_objectives and growth_notes inherit visibility from their parent
   growth_areas row — policies join through area_id.
*/

-- ============================================================
-- 1. Add responsabile_id to profiles
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS responsabile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 2. growth_areas
-- ============================================================
CREATE TABLE IF NOT EXISTS growth_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  titolo text NOT NULL,
  creato_da text NOT NULL CHECK (creato_da IN ('persona','capo')),
  stato text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','condiviso')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_areas_person ON growth_areas(person_id);

ALTER TABLE growth_areas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. growth_objectives
-- ============================================================
CREATE TABLE IF NOT EXISTS growth_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES growth_areas(id) ON DELETE CASCADE,
  titolo text NOT NULL,
  stato text NOT NULL DEFAULT 'da_iniziare' CHECK (stato IN ('da_iniziare','in_corso','raggiunto')),
  fonte text NOT NULL DEFAULT 'manuale' CHECK (fonte IN ('manuale','auto_performance')),
  creato_da text NOT NULL CHECK (creato_da IN ('persona','capo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_objectives_area ON growth_objectives(area_id);

ALTER TABLE growth_objectives ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. growth_notes
-- ============================================================
CREATE TABLE IF NOT EXISTS growth_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES growth_areas(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_notes_area ON growth_notes(area_id);

ALTER TABLE growth_notes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. RLS POLICIES — growth_areas
-- ============================================================

/*
 SELECT visibility for growth_areas:
 - Admin/Super Admin see all
 - Person sees own rows IF (stato = 'condiviso' OR creato_da = 'persona')
   (person always sees what they wrote; sees manager entries only once shared)
 - Manager sees their report's rows IF stato = 'condiviso'
*/
DROP POLICY IF EXISTS "ga_select" ON growth_areas;
CREATE POLICY "ga_select" ON growth_areas FOR SELECT TO authenticated
USING (
  get_my_role() IN ('Admin','Super Admin')
  OR (
    person_id = auth.uid()
    AND (stato = 'condiviso' OR creato_da = 'persona')
  )
  OR (
    stato = 'condiviso'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = growth_areas.person_id
        AND p.responsabile_id = auth.uid()
    )
  )
);

/*
 INSERT: person for themselves (creato_da='persona'), manager for report (creato_da='capo'),
 or Admin/Super Admin for anyone.
*/
DROP POLICY IF EXISTS "ga_insert" ON growth_areas;
CREATE POLICY "ga_insert" ON growth_areas FOR INSERT TO authenticated
WITH CHECK (
  get_my_role() IN ('Admin','Super Admin')
  OR (
    person_id = auth.uid() AND creato_da = 'persona'
  )
  OR (
    creato_da = 'capo'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = growth_areas.person_id
        AND p.responsabile_id = auth.uid()
    )
  )
);

/*
 UPDATE: person updates own entries (creato_da='persona'), manager updates their
 authored entries for their report, Admin/Super Admin can update anything.
*/
DROP POLICY IF EXISTS "ga_update" ON growth_areas;
CREATE POLICY "ga_update" ON growth_areas FOR UPDATE TO authenticated
USING (
  get_my_role() IN ('Admin','Super Admin')
  OR (person_id = auth.uid() AND creato_da = 'persona')
  OR (
    creato_da = 'capo'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = growth_areas.person_id
        AND p.responsabile_id = auth.uid()
    )
  )
)
WITH CHECK (
  get_my_role() IN ('Admin','Super Admin')
  OR (person_id = auth.uid() AND creato_da = 'persona')
  OR (
    creato_da = 'capo'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = growth_areas.person_id
        AND p.responsabile_id = auth.uid()
    )
  )
);

/*
 DELETE: Admin/Super Admin always. Original creator can delete own drafts only.
*/
DROP POLICY IF EXISTS "ga_delete" ON growth_areas;
CREATE POLICY "ga_delete" ON growth_areas FOR DELETE TO authenticated
USING (
  get_my_role() IN ('Admin','Super Admin')
  OR (person_id = auth.uid() AND creato_da = 'persona' AND stato = 'bozza')
  OR (
    creato_da = 'capo' AND stato = 'bozza'
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = growth_areas.person_id
        AND p.responsabile_id = auth.uid()
    )
  )
);

-- ============================================================
-- 6. RLS POLICIES — growth_objectives
--    Visibility inherited from parent growth_areas via area_id.
-- ============================================================

DROP POLICY IF EXISTS "go_select" ON growth_objectives;
CREATE POLICY "go_select" ON growth_objectives FOR SELECT TO authenticated
USING (
  get_my_role() IN ('Admin','Super Admin')
  OR EXISTS (
    SELECT 1 FROM growth_areas ga
    WHERE ga.id = growth_objectives.area_id
      AND ga.person_id = auth.uid()
      AND (ga.stato = 'condiviso' OR ga.creato_da = 'persona')
  )
  OR EXISTS (
    SELECT 1 FROM growth_areas ga
    JOIN profiles p ON p.id = ga.person_id
    WHERE ga.id = growth_objectives.area_id
      AND ga.stato = 'condiviso'
      AND p.responsabile_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "go_insert" ON growth_objectives;
CREATE POLICY "go_insert" ON growth_objectives FOR INSERT TO authenticated
WITH CHECK (
  get_my_role() IN ('Admin','Super Admin')
  OR (
    creato_da = 'persona'
    AND EXISTS (
      SELECT 1 FROM growth_areas ga
      WHERE ga.id = growth_objectives.area_id
        AND ga.person_id = auth.uid()
    )
  )
  OR (
    creato_da = 'capo'
    AND EXISTS (
      SELECT 1 FROM growth_areas ga
      JOIN profiles p ON p.id = ga.person_id
      WHERE ga.id = growth_objectives.area_id
        AND p.responsabile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "go_update" ON growth_objectives;
CREATE POLICY "go_update" ON growth_objectives FOR UPDATE TO authenticated
USING (
  get_my_role() IN ('Admin','Super Admin')
  OR (
    creato_da = 'persona'
    AND EXISTS (
      SELECT 1 FROM growth_areas ga
      WHERE ga.id = growth_objectives.area_id
        AND ga.person_id = auth.uid()
    )
  )
  OR (
    creato_da = 'capo'
    AND EXISTS (
      SELECT 1 FROM growth_areas ga
      JOIN profiles p ON p.id = ga.person_id
      WHERE ga.id = growth_objectives.area_id
        AND p.responsabile_id = auth.uid()
    )
  )
)
WITH CHECK (
  get_my_role() IN ('Admin','Super Admin')
  OR (
    creato_da = 'persona'
    AND EXISTS (
      SELECT 1 FROM growth_areas ga
      WHERE ga.id = growth_objectives.area_id
        AND ga.person_id = auth.uid()
    )
  )
  OR (
    creato_da = 'capo'
    AND EXISTS (
      SELECT 1 FROM growth_areas ga
      JOIN profiles p ON p.id = ga.person_id
      WHERE ga.id = growth_objectives.area_id
        AND p.responsabile_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "go_delete" ON growth_objectives;
CREATE POLICY "go_delete" ON growth_objectives FOR DELETE TO authenticated
USING (
  get_my_role() IN ('Admin','Super Admin')
  OR (
    creato_da = 'persona'
    AND EXISTS (
      SELECT 1 FROM growth_areas ga
      WHERE ga.id = growth_objectives.area_id
        AND ga.person_id = auth.uid()
        AND ga.stato = 'bozza'
    )
  )
  OR (
    creato_da = 'capo'
    AND EXISTS (
      SELECT 1 FROM growth_areas ga
      JOIN profiles p ON p.id = ga.person_id
      WHERE ga.id = growth_objectives.area_id
        AND ga.stato = 'bozza'
        AND p.responsabile_id = auth.uid()
    )
  )
);

-- ============================================================
-- 7. RLS POLICIES — growth_notes
--    Notes are only visible on 'condiviso' areas (never on bozza).
--    Anyone who can see the area can add a note (author_id = auth.uid()).
-- ============================================================

DROP POLICY IF EXISTS "gn_select" ON growth_notes;
CREATE POLICY "gn_select" ON growth_notes FOR SELECT TO authenticated
USING (
  get_my_role() IN ('Admin','Super Admin')
  OR EXISTS (
    SELECT 1 FROM growth_areas ga
    WHERE ga.id = growth_notes.area_id
      AND ga.stato = 'condiviso'
      AND (
        ga.person_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = ga.person_id AND p.responsabile_id = auth.uid()
        )
      )
  )
);

DROP POLICY IF EXISTS "gn_insert" ON growth_notes;
CREATE POLICY "gn_insert" ON growth_notes FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    get_my_role() IN ('Admin','Super Admin')
    OR EXISTS (
      SELECT 1 FROM growth_areas ga
      WHERE ga.id = growth_notes.area_id
        AND ga.stato = 'condiviso'
        AND (
          ga.person_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = ga.person_id AND p.responsabile_id = auth.uid()
          )
        )
    )
  )
);

-- Notes are append-only: no UPDATE policy (notes cannot be edited)
DROP POLICY IF EXISTS "gn_update" ON growth_notes;

-- DELETE: Admin/Super Admin only, or the note author on their own note
DROP POLICY IF EXISTS "gn_delete" ON growth_notes;
CREATE POLICY "gn_delete" ON growth_notes FOR DELETE TO authenticated
USING (
  get_my_role() IN ('Admin','Super Admin')
  OR author_id = auth.uid()
);
