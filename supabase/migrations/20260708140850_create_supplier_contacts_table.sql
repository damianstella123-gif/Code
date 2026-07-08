/*
# Create supplier_contacts table

1. New Tables
  - `supplier_contacts`
    - `id` (uuid, primary key)
    - `supplier_id` (text, FK to suppliers(id), CASCADE delete)
    - `nome` (text, not null) - contact name
    - `ruolo` (text) - role/title
    - `email` (text)
    - `telefono` (text)
    - `note` (text)
    - `is_primary` (boolean, default false) - marks the main contact
    - `created_at` (timestamptz)

2. Security
  - Enable RLS on `supplier_contacts`.
  - Full CRUD for authenticated users (team-shared data).
*/

CREATE TABLE IF NOT EXISTS supplier_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ruolo text,
  email text,
  telefono text,
  note text,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE supplier_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_supplier_contacts" ON supplier_contacts;
CREATE POLICY "select_supplier_contacts" ON supplier_contacts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_supplier_contacts" ON supplier_contacts;
CREATE POLICY "insert_supplier_contacts" ON supplier_contacts FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_supplier_contacts" ON supplier_contacts;
CREATE POLICY "update_supplier_contacts" ON supplier_contacts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_supplier_contacts" ON supplier_contacts;
CREATE POLICY "delete_supplier_contacts" ON supplier_contacts FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_supplier_contacts_supplier_id ON supplier_contacts(supplier_id);
