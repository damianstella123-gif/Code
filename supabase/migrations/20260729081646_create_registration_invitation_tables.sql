/*
# Create Registration Invitation Tables

## Summary
Creates two new tables to support bulk email invitations for event registration,
completely separate from the existing registration and email outbox flows.

## New Tables

### 1. invitation_batches
Tracks a batch of invitation emails created by an event team member.

- `id` (uuid, PK) — unique batch identifier
- `event_id` (text, NOT NULL, FK → events) — owning event
- `site_id` (uuid, NOT NULL, FK → registration_sites) — target registration site
- `created_by` (uuid, NOT NULL, FK → profiles) — user who created the batch
- `status` (text, NOT NULL, default 'draft') — lifecycle: draft → sending → completed | failed
- `email_subject` (text, NOT NULL) — subject line, 1–200 chars trimmed
- `email_message` (text, NOT NULL, default '') — optional body, max 10 000 chars
- `total_count` (integer, NOT NULL, default 0) — total recipients in batch
- `sent_count` (integer, NOT NULL, default 0) — successfully sent
- `failed_count` (integer, NOT NULL, default 0) — permanently failed
- `started_at` (timestamptz, NULL) — when sending began
- `completed_at` (timestamptz, NULL) — when all recipients processed
- `created_at` / `updated_at` (timestamptz, NOT NULL)

### 2. invitation_recipients
Individual recipients within a batch.

- `id` (uuid, PK) — unique recipient row
- `batch_id` (uuid, NOT NULL, FK → invitation_batches) — parent batch
- `first_name` (text, NOT NULL) — recipient first name, non-empty trimmed
- `last_name` (text, NOT NULL) — recipient last name, non-empty trimmed
- `email` (text, NOT NULL) — recipient email, basic format validated
- `status` (text, NOT NULL, default 'pending') — pending → processing → sent | failed
- `attempts` (integer, NOT NULL, default 0) — delivery attempt count
- `next_attempt_at` (timestamptz, NOT NULL, default now()) — next eligible retry time
- `sent_at` (timestamptz, NULL) — successful delivery timestamp
- `last_error_code` (text, NULL) — last error for diagnostics
- `created_at` / `updated_at` (timestamptz, NOT NULL)
- Unique constraint: one email per batch (case-insensitive)

## Indexes
- invitation_recipients: (batch_id, status, next_attempt_at) for worker polling
- invitation_batches: (event_id, site_id, created_at DESC) for listing

## Security
- RLS enabled on both tables, no anon access.
- SELECT-only policies scoped through `has_event_permission(event_id, 'can_manage_registration')`.
- Recipients scoped through parent batch permission.
- No INSERT/UPDATE/DELETE policies — writes are service-role or RPC only.

## Triggers
- Both tables use the existing `set_updated_at` trigger for `updated_at` auto-refresh.

## Important Notes
1. No changes to event_registrations, registration_sites, or any existing table.
2. No data inserted — tables start empty.
3. No Edge Function, RPC, or frontend changes.
*/

-- ═══════════════════════════════════════════════════════════════════
-- 1. invitation_batches
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.invitation_batches (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      text        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  site_id       uuid        NOT NULL REFERENCES public.registration_sites(id) ON DELETE CASCADE,
  created_by    uuid        NOT NULL REFERENCES public.profiles(id),
  status        text        NOT NULL DEFAULT 'draft',
  email_subject text        NOT NULL,
  email_message text        NOT NULL DEFAULT '',
  total_count   integer     NOT NULL DEFAULT 0,
  sent_count    integer     NOT NULL DEFAULT 0,
  failed_count  integer     NOT NULL DEFAULT 0,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invitation_batches_status_check
    CHECK (status IN ('draft', 'sending', 'completed', 'failed')),
  CONSTRAINT invitation_batches_counts_non_negative
    CHECK (total_count >= 0 AND sent_count >= 0 AND failed_count >= 0),
  CONSTRAINT invitation_batches_counts_sum
    CHECK (sent_count + failed_count <= total_count),
  CONSTRAINT invitation_batches_subject_length
    CHECK (length(trim(email_subject)) BETWEEN 1 AND 200),
  CONSTRAINT invitation_batches_message_length
    CHECK (length(email_message) <= 10000)
);

-- ═══════════════════════════════════════════════════════════════════
-- 2. invitation_recipients
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.invitation_recipients (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid        NOT NULL REFERENCES public.invitation_batches(id) ON DELETE CASCADE,
  first_name      text        NOT NULL,
  last_name       text        NOT NULL,
  email           text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending',
  attempts        integer     NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  last_error_code text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invitation_recipients_status_check
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  CONSTRAINT invitation_recipients_attempts_non_negative
    CHECK (attempts >= 0),
  CONSTRAINT invitation_recipients_first_name_not_empty
    CHECK (length(trim(first_name)) > 0),
  CONSTRAINT invitation_recipients_last_name_not_empty
    CHECK (length(trim(last_name)) > 0),
  CONSTRAINT invitation_recipients_email_format
    CHECK (trim(email) ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

-- Unique: one email address per batch (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitation_recipients_batch_email
  ON public.invitation_recipients (batch_id, lower(email));

-- ═══════════════════════════════════════════════════════════════════
-- 3. Indexes
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_invitation_recipients_worker_poll
  ON public.invitation_recipients (batch_id, status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_invitation_batches_event_site
  ON public.invitation_batches (event_id, site_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 4. updated_at triggers (reuse existing set_updated_at function)
-- ═══════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS invitation_batches_set_updated_at ON public.invitation_batches;
CREATE TRIGGER invitation_batches_set_updated_at
  BEFORE UPDATE ON public.invitation_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS invitation_recipients_set_updated_at ON public.invitation_recipients;
CREATE TRIGGER invitation_recipients_set_updated_at
  BEFORE UPDATE ON public.invitation_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- 5. RLS
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.invitation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_recipients ENABLE ROW LEVEL SECURITY;

-- Batches: SELECT only for users with can_manage_registration on the event
DROP POLICY IF EXISTS "select_invitation_batches" ON public.invitation_batches;
CREATE POLICY "select_invitation_batches"
  ON public.invitation_batches
  FOR SELECT
  TO authenticated
  USING (
    public.has_event_permission(event_id, 'can_manage_registration')
  );

-- Recipients: SELECT only through a parent batch the user can see
DROP POLICY IF EXISTS "select_invitation_recipients" ON public.invitation_recipients;
CREATE POLICY "select_invitation_recipients"
  ON public.invitation_recipients
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invitation_batches ib
      WHERE ib.id = batch_id
        AND public.has_event_permission(ib.event_id, 'can_manage_registration')
    )
  );
