/*
# Separate Payment Requests, Invoices, and Financial Executions

## Purpose
Establishes the foundational database layer for a three-tier payment model:
1. **Payment Requests** (event_payments) — PM-submitted requests/deadlines
2. **Invoices** (admin_fatture) — fiscal documents managed by Administration
3. **Payment Executions** (payment_executions) — actual financial disbursements

## Changes Overview

### Modified Tables

#### event_payments (4 new columns)
- `request_status` (text, nullable) — workflow state of the PM request
- `submitted_at` (timestamptz, nullable) — when the request was formally submitted
- `submitted_by` (uuid, nullable, FK -> profiles) — who submitted it
- `request_note` (text, nullable) — free-text note from the PM
- CHECK on request_status: bozza, inviata, in_verifica, in_attesa_fattura,
  approvata, respinta, parzialmente_coperta, completata, annullata
- Existing 16 rows are NOT modified (all new columns remain NULL)

#### admin_fatture (7 new columns for Fatture in Cloud integration)
- `external_provider` (text, nullable) — fatture_in_cloud, manuale, altro
- `external_id` (text, nullable) — ID in external system
- `sync_status` (text, nullable) — synchronization state
- `last_synced_at` (timestamptz, nullable)
- `external_url` (text, nullable)
- `external_hash` (text, nullable) — for conflict detection
- `last_sync_error` (text, nullable)
- Partial unique index on (external_provider, external_id) WHERE both NOT NULL

### New Tables

#### payment_request_line_links
Many-to-many junction between payment requests and economic line items.
Supports partial allocations, multiple requests per line, multiple lines per request.
- payment_request_id (uuid, FK -> event_payments, CASCADE)
- budget_version_id (uuid, FK -> budget_versions, SET NULL)
- source_table (text, CHECK: 11 valid economic tables)
- source_line_id (text)
- allocated_amount (numeric, >= 0)
- UNIQUE (payment_request_id, source_table, source_line_id)

#### payment_request_invoice_links
Many-to-many junction between payment requests and invoices.
Supports partial coverage, multiple invoices per request, multiple requests per invoice.
- payment_request_id (uuid, FK -> event_payments, CASCADE)
- invoice_id (uuid, FK -> admin_fatture, CASCADE)
- allocated_amount (numeric, >= 0)
- UNIQUE (payment_request_id, invoice_id)

#### payment_executions
Actual financial payments authorized and executed by Administration.
- payment_request_id (uuid, FK -> event_payments, SET NULL)
- invoice_id (uuid, FK -> admin_fatture, SET NULL)
- event_id (text, FK -> events, SET NULL)
- supplier_id (text, FK -> suppliers, SET NULL)
- client_id (text, FK -> clients, SET NULL)
- amount (numeric, > 0)
- execution_status (text): da_pianificare, pianificato, autorizzato, eseguito, annullato
- CHECK: at least one of payment_request_id or invoice_id must be NOT NULL
- Authorization and execution tracking with who/when columns

### Security
- RLS enabled on all 3 new tables
- NO permissive policies created (tables locked until role model verified)
- No anon access

### Important Notes
1. Existing 16 event_payments rows are untouched (new columns all NULL)
2. Legacy tables (invoices, payments) are NOT modified
3. No triggers or automatic state transitions created
4. Migration is fully idempotent (IF NOT EXISTS, DO blocks)
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: Extend event_payments with request workflow columns
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_payments' AND column_name = 'request_status'
  ) THEN
    ALTER TABLE public.event_payments ADD COLUMN request_status text NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_payments' AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE public.event_payments ADD COLUMN submitted_at timestamptz NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_payments' AND column_name = 'submitted_by'
  ) THEN
    ALTER TABLE public.event_payments ADD COLUMN submitted_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'event_payments' AND column_name = 'request_note'
  ) THEN
    ALTER TABLE public.event_payments ADD COLUMN request_note text NULL;
  END IF;
END $$;

-- CHECK constraint on request_status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_event_payments_request_status'
  ) THEN
    ALTER TABLE public.event_payments ADD CONSTRAINT chk_event_payments_request_status
      CHECK (request_status IS NULL OR request_status IN (
        'bozza', 'inviata', 'in_verifica', 'in_attesa_fattura',
        'approvata', 'respinta', 'parzialmente_coperta', 'completata', 'annullata'
      ));
  END IF;
END $$;

-- Indexes on new columns
CREATE INDEX IF NOT EXISTS idx_event_payments_request_status ON public.event_payments (request_status) WHERE request_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_payments_submitted_by ON public.event_payments (submitted_by) WHERE submitted_by IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: payment_request_line_links (requests <-> economic lines)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_request_line_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid NOT NULL REFERENCES public.event_payments(id) ON DELETE CASCADE,
  budget_version_id uuid NULL REFERENCES public.budget_versions(id) ON DELETE SET NULL,
  source_table text NOT NULL,
  source_line_id text NOT NULL,
  allocated_amount numeric NOT NULL DEFAULT 0,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CHECK allocated_amount >= 0
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_prll_allocated_amount_gte_zero'
  ) THEN
    ALTER TABLE public.payment_request_line_links ADD CONSTRAINT chk_prll_allocated_amount_gte_zero
      CHECK (allocated_amount >= 0);
  END IF;
END $$;

-- CHECK source_table in allowed values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_prll_source_table'
  ) THEN
    ALTER TABLE public.payment_request_line_links ADD CONSTRAINT chk_prll_source_table
      CHECK (source_table IN (
        'event_supplier_services',
        'event_hotel_details',
        'event_restaurant_details',
        'event_experience_details',
        'event_catering_details',
        'event_staff_interno_details',
        'event_staff_esterno_details',
        'event_varie_details',
        'event_audio_video_details',
        'event_allestimenti_details',
        'event_grafica_stampa_details'
      ));
  END IF;
END $$;

-- UNIQUE on (payment_request_id, source_table, source_line_id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_prll_request_table_line'
  ) THEN
    ALTER TABLE public.payment_request_line_links
      ADD CONSTRAINT uq_prll_request_table_line UNIQUE (payment_request_id, source_table, source_line_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prll_payment_request_id ON public.payment_request_line_links (payment_request_id);
CREATE INDEX IF NOT EXISTS idx_prll_budget_version_id ON public.payment_request_line_links (budget_version_id);
CREATE INDEX IF NOT EXISTS idx_prll_source ON public.payment_request_line_links (source_table, source_line_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3: payment_request_invoice_links (requests <-> invoices/fatture)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_request_invoice_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid NOT NULL REFERENCES public.event_payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.admin_fatture(id) ON DELETE CASCADE,
  allocated_amount numeric NOT NULL DEFAULT 0,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- CHECK allocated_amount >= 0
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pril_allocated_amount_gte_zero'
  ) THEN
    ALTER TABLE public.payment_request_invoice_links ADD CONSTRAINT chk_pril_allocated_amount_gte_zero
      CHECK (allocated_amount >= 0);
  END IF;
END $$;

-- UNIQUE on (payment_request_id, invoice_id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_pril_request_invoice'
  ) THEN
    ALTER TABLE public.payment_request_invoice_links
      ADD CONSTRAINT uq_pril_request_invoice UNIQUE (payment_request_id, invoice_id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pril_payment_request_id ON public.payment_request_invoice_links (payment_request_id);
CREATE INDEX IF NOT EXISTS idx_pril_invoice_id ON public.payment_request_invoice_links (invoice_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 4: payment_executions (actual financial payments)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid NULL REFERENCES public.event_payments(id) ON DELETE SET NULL,
  invoice_id uuid NULL REFERENCES public.admin_fatture(id) ON DELETE SET NULL,
  event_id text NULL REFERENCES public.events(id) ON DELETE SET NULL,
  supplier_id text NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  client_id text NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  execution_status text NOT NULL DEFAULT 'da_pianificare',
  due_date date NULL,
  scheduled_date date NULL,
  executed_date date NULL,
  payment_method text NULL,
  bank_reference text NULL,
  note text NULL,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  authorized_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  authorized_at timestamptz NULL,
  executed_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  executed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CHECK amount > 0
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pe_amount_positive'
  ) THEN
    ALTER TABLE public.payment_executions ADD CONSTRAINT chk_pe_amount_positive
      CHECK (amount > 0);
  END IF;
END $$;

-- CHECK execution_status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pe_execution_status'
  ) THEN
    ALTER TABLE public.payment_executions ADD CONSTRAINT chk_pe_execution_status
      CHECK (execution_status IN ('da_pianificare', 'pianificato', 'autorizzato', 'eseguito', 'annullato'));
  END IF;
END $$;

-- CHECK at least one reference
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pe_has_reference'
  ) THEN
    ALTER TABLE public.payment_executions ADD CONSTRAINT chk_pe_has_reference
      CHECK (payment_request_id IS NOT NULL OR invoice_id IS NOT NULL);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pe_payment_request_id ON public.payment_executions (payment_request_id);
CREATE INDEX IF NOT EXISTS idx_pe_invoice_id ON public.payment_executions (invoice_id);
CREATE INDEX IF NOT EXISTS idx_pe_event_id ON public.payment_executions (event_id);
CREATE INDEX IF NOT EXISTS idx_pe_execution_status ON public.payment_executions (execution_status);
CREATE INDEX IF NOT EXISTS idx_pe_due_date ON public.payment_executions (due_date);
CREATE INDEX IF NOT EXISTS idx_pe_scheduled_date ON public.payment_executions (scheduled_date);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 5: Extend admin_fatture for Fatture in Cloud integration
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_fatture' AND column_name = 'external_provider'
  ) THEN
    ALTER TABLE public.admin_fatture ADD COLUMN external_provider text NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_fatture' AND column_name = 'external_id'
  ) THEN
    ALTER TABLE public.admin_fatture ADD COLUMN external_id text NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_fatture' AND column_name = 'sync_status'
  ) THEN
    ALTER TABLE public.admin_fatture ADD COLUMN sync_status text NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_fatture' AND column_name = 'last_synced_at'
  ) THEN
    ALTER TABLE public.admin_fatture ADD COLUMN last_synced_at timestamptz NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_fatture' AND column_name = 'external_url'
  ) THEN
    ALTER TABLE public.admin_fatture ADD COLUMN external_url text NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_fatture' AND column_name = 'external_hash'
  ) THEN
    ALTER TABLE public.admin_fatture ADD COLUMN external_hash text NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_fatture' AND column_name = 'last_sync_error'
  ) THEN
    ALTER TABLE public.admin_fatture ADD COLUMN last_sync_error text NULL;
  END IF;
END $$;

-- CHECK external_provider
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_af_external_provider'
  ) THEN
    ALTER TABLE public.admin_fatture ADD CONSTRAINT chk_af_external_provider
      CHECK (external_provider IS NULL OR external_provider IN ('fatture_in_cloud', 'manuale', 'altro'));
  END IF;
END $$;

-- CHECK sync_status
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_af_sync_status'
  ) THEN
    ALTER TABLE public.admin_fatture ADD CONSTRAINT chk_af_sync_status
      CHECK (sync_status IS NULL OR sync_status IN ('non_sincronizzata', 'da_sincronizzare', 'sincronizzata', 'errore', 'conflitto'));
  END IF;
END $$;

-- Partial unique index on external provider + id
CREATE UNIQUE INDEX IF NOT EXISTS uq_af_external_provider_id
  ON public.admin_fatture (external_provider, external_id)
  WHERE external_provider IS NOT NULL AND external_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 6: Enable RLS on new tables (no policies — locked by design)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.payment_request_line_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_request_invoice_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_executions ENABLE ROW LEVEL SECURITY;
