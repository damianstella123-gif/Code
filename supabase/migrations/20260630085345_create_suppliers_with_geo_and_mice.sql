/*
# Create suppliers table with geo columns and MICE support

1. New Tables
   - `suppliers` — full supplier management table with geographic data
     - Core: id, name, category, contact info, rating, notes
     - Geo: country, region, province, city, address, latitude, longitude
     - Financial: avg_cost_per_event, min_cost, max_cost
     - JSONB: documents, reviews, details (category-specific data)
     - Logo: logo_url, note_operative

2. Security
   - RLS enabled
   - anon + authenticated CRUD (demo/shared app)

3. Helper function
   - set_updated_at trigger function (if not exists)
*/

-- Helper function for updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enum types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supplier_status') THEN
    CREATE TYPE supplier_status AS ENUM ('attivo', 'inattivo');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supplier_contract_status') THEN
    CREATE TYPE supplier_contract_status AS ENUM ('attivo', 'in_scadenza', 'scaduto', 'in_rinnovo', 'sospeso');
  END IF;
END $$;

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  rating numeric(3, 1) NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  vat_number text NOT NULL DEFAULT '',
  status supplier_status NOT NULL DEFAULT 'attivo',
  contract_status supplier_contract_status NOT NULL DEFAULT 'attivo',
  contract_expiry date,
  services text[] NOT NULL DEFAULT '{}',
  event_ids text[] NOT NULL DEFAULT '{}',
  avg_cost_per_event numeric(14, 2) NOT NULL DEFAULT 0,
  min_cost numeric(14, 2) NOT NULL DEFAULT 0,
  max_cost numeric(14, 2) NOT NULL DEFAULT 0,
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviews jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- New geo columns
  country text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  province text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  latitude numeric,
  longitude numeric,
  -- Logo and details
  logo_url text,
  note_operative text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_suppliers_category ON suppliers(category);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_city ON suppliers(city);
CREATE INDEX IF NOT EXISTS idx_suppliers_region ON suppliers(region);

-- RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_suppliers" ON suppliers;
CREATE POLICY "anon_select_suppliers" ON suppliers FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_suppliers" ON suppliers;
CREATE POLICY "anon_insert_suppliers" ON suppliers FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_suppliers" ON suppliers;
CREATE POLICY "anon_update_suppliers" ON suppliers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_suppliers" ON suppliers;
CREATE POLICY "anon_delete_suppliers" ON suppliers FOR DELETE TO anon, authenticated USING (true);

-- Trigger
DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('supplier-logos', 'supplier-logos', true, 2097152, ARRAY['image/png','image/jpeg','image/webp','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_supplier_logos" ON storage.objects;
CREATE POLICY "public_read_supplier_logos" ON storage.objects FOR SELECT TO public USING (bucket_id = 'supplier-logos');

DROP POLICY IF EXISTS "auth_upload_supplier_logos" ON storage.objects;
CREATE POLICY "auth_upload_supplier_logos" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'supplier-logos');

DROP POLICY IF EXISTS "auth_update_supplier_logos" ON storage.objects;
CREATE POLICY "auth_update_supplier_logos" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'supplier-logos');

DROP POLICY IF EXISTS "auth_delete_supplier_logos" ON storage.objects;
CREATE POLICY "auth_delete_supplier_logos" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'supplier-logos');
