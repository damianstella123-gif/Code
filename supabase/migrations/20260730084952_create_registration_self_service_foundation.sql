/*
# Registration Self-Service Foundation

## Summary
Adds the database foundation for participants to view and edit their own
registration through a secure, time-limited management link.
No raw management tokens are ever stored — only a cryptographic hash.

## 1. Modified Table: event_registrations
  - `manage_token_hash`       (bytea, nullable) — SHA-256 hash of the management token.
  - `manage_token_expires_at` (timestamptz, nullable) — when the management link expires.
  - `manage_token_revoked_at` (timestamptz, nullable) — when/if the token was revoked.
  Partial unique index on manage_token_hash WHERE manage_token_hash IS NOT NULL.
  Existing 28 registrations keep all three columns NULL (no backfill).

## 2. New Table: registration_edit_log
  - `id`               (uuid, PK, gen_random_uuid())
  - `registration_id`  (uuid, NOT NULL, FK → event_registrations ON DELETE CASCADE)
  - `changed_fields`   (text[], NOT NULL, at least one element)
  - `source`           (text, NOT NULL, default 'participant'; one of participant/staff/system)
  - `created_at`       (timestamptz, NOT NULL, default now())
  Stores ONLY which fields changed and who triggered the change.
  Never stores old/new values, PII, tokens, IPs, or request metadata.

## 3. Security
  - RLS enabled on registration_edit_log.
  - No direct-access policies created — access will be through controlled RPCs only.
  - Existing RLS on event_registrations is NOT modified.

## 4. pgcrypto
  - Confirmed available in extensions schema (v1.3).
  - Not moved or reinstalled; digest() and gen_random_bytes() are usable as-is.

## 5. Important Notes
  - Idempotent: all statements use IF NOT EXISTS / IF EXISTS guards.
  - No data is backfilled, deleted, or modified.
  - No RPCs, edge functions, frontend code, or secrets are changed.
*/

-- ═══════════════════════════════════════════════════════════════════
-- 1. Add nullable columns to event_registrations
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_registrations'
      AND column_name = 'manage_token_hash'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN manage_token_hash bytea;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_registrations'
      AND column_name = 'manage_token_expires_at'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN manage_token_expires_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'event_registrations'
      AND column_name = 'manage_token_revoked_at'
  ) THEN
    ALTER TABLE public.event_registrations
      ADD COLUMN manage_token_revoked_at timestamptz;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_er_manage_token_hash
  ON public.event_registrations (manage_token_hash)
  WHERE manage_token_hash IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Create registration_edit_log
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.registration_edit_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id  uuid        NOT NULL
                               REFERENCES public.event_registrations(id) ON DELETE CASCADE,
  changed_fields   text[]      NOT NULL,
  source           text        NOT NULL DEFAULT 'participant',
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rel_source_check
    CHECK (source IN ('participant', 'staff', 'system')),
  CONSTRAINT rel_changed_fields_non_empty
    CHECK (array_length(changed_fields, 1) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_rel_registration_id
  ON public.registration_edit_log (registration_id);

-- ═══════════════════════════════════════════════════════════════════
-- 3. RLS on registration_edit_log (no direct-access policies)
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.registration_edit_log ENABLE ROW LEVEL SECURITY;
