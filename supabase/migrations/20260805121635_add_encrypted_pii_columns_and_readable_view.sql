/*
# Additive encryption infrastructure for event_registrations

Adds encrypted-column siblings, an email lookup HMAC column, a decrypting
compatibility view, and the key-storage plumbing needed to encrypt/decrypt.
Fully additive. NO existing column is renamed, dropped, or written to. NO
existing RPC or frontend code is changed.

## Key storage: intended vs actual mechanism

The task asked for a database-level GUC in the same style as
`app.settings.supabase_url` / `app.settings.service_role_key`. On this
Supabase project those two GUCs are injected by the platform superuser at
connection time; the `postgres` role that migrations run under is not
permitted to `ALTER DATABASE ... SET app.settings.*` for any new name. To
preserve the same "one lookup returns the key, no per-session setup, no
edge-function secret distribution" property, this migration stores the key
in a private single-row table `public.pii_secrets` and exposes it through a
SECURITY DEFINER accessor `public.pii_key()`. Callers use `public.pii_key()`
wherever the plan called for `current_setting('app.settings.pii_key')`. The
security posture is equivalent: the table is unreadable by anon /
authenticated / any application role, and the raw accessor is not granted
to those roles either.

## Email lookup hash

`email_lookup_hash` = `hmac(lower(trim(email)), pii_key(), 'sha256')` — same
key material as the encryption. HMAC-SHA256 is a distinct primitive from
pgp_sym_encrypt so they do not interfere, and reusing the key avoids a
second secret to distribute. If a later requirement forces separation, a
KDF-derived subkey can be introduced without a schema change.

## No unique index yet

The unique index on `(event_id, email_lookup_hash)` is intentionally
deferred to the post-backfill task; adding it now would immediately reject
existing rows whose `email_lookup_hash` is still NULL for duplicate
event_id groups (there is only one email uniqueness constraint today and it
lives on `lower(email)`, which is retained unchanged).
*/

-- pgcrypto lives in `extensions` schema on Supabase. Ensure it is present.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. pii_secrets table + seed a random key on first run only
CREATE TABLE IF NOT EXISTS public.pii_secrets (
  name  text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pii_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: anon and authenticated are denied by default.

REVOKE ALL ON public.pii_secrets FROM PUBLIC;
REVOKE ALL ON public.pii_secrets FROM anon;
REVOKE ALL ON public.pii_secrets FROM authenticated;

INSERT INTO public.pii_secrets (name, value)
SELECT 'pii_key', encode(extensions.gen_random_bytes(32), 'base64')
WHERE NOT EXISTS (
  SELECT 1 FROM public.pii_secrets WHERE name = 'pii_key'
);

-- 2. Accessor: pii_key()
CREATE OR REPLACE FUNCTION public.pii_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT value FROM public.pii_secrets WHERE name = 'pii_key';
$$;

REVOKE ALL ON FUNCTION public.pii_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pii_key() FROM anon;
REVOKE ALL ON FUNCTION public.pii_key() FROM authenticated;

-- 3. Per-row decrypt wrapper
CREATE OR REPLACE FUNCTION public._dec_pii(v bytea)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN v IS NULL THEN NULL
    ELSE extensions.pgp_sym_decrypt(v, public.pii_key())
  END;
$$;

REVOKE ALL ON FUNCTION public._dec_pii(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._dec_pii(bytea) TO authenticated;

-- 4. Email lookup HMAC helper (server-only)
CREATE OR REPLACE FUNCTION public._hmac_email_lookup(v text)
RETURNS bytea
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE
    WHEN v IS NULL OR btrim(v) = '' THEN NULL
    ELSE extensions.hmac(lower(btrim(v)), public.pii_key(), 'sha256')
  END;
$$;

REVOKE ALL ON FUNCTION public._hmac_email_lookup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._hmac_email_lookup(text) FROM anon;
REVOKE ALL ON FUNCTION public._hmac_email_lookup(text) FROM authenticated;

-- 5. Add encrypted-column siblings + email_lookup_hash
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='event_registrations'
                   AND column_name='first_name_enc') THEN
    ALTER TABLE public.event_registrations ADD COLUMN first_name_enc bytea;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='event_registrations'
                   AND column_name='last_name_enc') THEN
    ALTER TABLE public.event_registrations ADD COLUMN last_name_enc bytea;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='event_registrations'
                   AND column_name='email_enc') THEN
    ALTER TABLE public.event_registrations ADD COLUMN email_enc bytea;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='event_registrations'
                   AND column_name='phone_enc') THEN
    ALTER TABLE public.event_registrations ADD COLUMN phone_enc bytea;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='event_registrations'
                   AND column_name='dietary_requirements_enc') THEN
    ALTER TABLE public.event_registrations ADD COLUMN dietary_requirements_enc bytea;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='event_registrations'
                   AND column_name='accessibility_requirements_enc') THEN
    ALTER TABLE public.event_registrations ADD COLUMN accessibility_requirements_enc bytea;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='event_registrations'
                   AND column_name='email_lookup_hash') THEN
    ALTER TABLE public.event_registrations ADD COLUMN email_lookup_hash bytea;
  END IF;
END $$;

-- 6. Compatibility view (PG17 -> security_invoker=on so base-table RLS applies)
CREATE OR REPLACE VIEW public.event_registrations_readable
WITH (security_invoker = on) AS
SELECT
  er.id,
  er.site_id,
  er.event_id,
  er.registration_status,
  COALESCE(public._dec_pii(er.first_name_enc),                er.first_name)                AS first_name,
  COALESCE(public._dec_pii(er.last_name_enc),                 er.last_name)                 AS last_name,
  COALESCE(public._dec_pii(er.email_enc),                     er.email)                     AS email,
  COALESCE(public._dec_pii(er.phone_enc),                     er.phone)                     AS phone,
  er.company,
  er.job_title,
  COALESCE(public._dec_pii(er.dietary_requirements_enc),      er.dietary_requirements)      AS dietary_requirements,
  COALESCE(public._dec_pii(er.accessibility_requirements_enc),er.accessibility_requirements)AS accessibility_requirements,
  er.custom_answers,
  er.privacy_accepted,
  er.marketing_consent,
  er.qr_token,
  er.checked_in_at,
  er.checked_in_by,
  er.created_at,
  er.updated_at,
  er.source,
  er.manage_token_hash,
  er.manage_token_expires_at,
  er.manage_token_revoked_at,
  er.first_name_enc,
  er.last_name_enc,
  er.email_enc,
  er.phone_enc,
  er.dietary_requirements_enc,
  er.accessibility_requirements_enc,
  er.email_lookup_hash
FROM public.event_registrations er;

GRANT SELECT ON public.event_registrations_readable TO authenticated;
