/*
# Create supplier_photos table and storage bucket

1. New Tables
   - `supplier_photos`
     - `id` (uuid, primary key)
     - `supplier_id` (text, FK to suppliers, CASCADE delete)
     - `storage_path` (text, not null) - path in storage bucket
     - `public_url` (text) - cached public URL
     - `categoria` (text, constrained to allowed photo categories)
     - `didascalia` (text) - optional caption
     - `is_cover` (boolean, default false) - cover photo flag
     - `ordine` (int, default 0) - display order
     - `caricata_da` (uuid, FK to profiles) - who uploaded
     - `fonte` (text, 'manuale' or 'web')
     - `created_at` (timestamptz)

2. Security
   - RLS enabled on supplier_photos
   - All authenticated users can SELECT and INSERT
   - DELETE restricted to uploader or Admin/Super Admin roles
   - Storage bucket: public read, authenticated upload/delete

3. Indexes
   - On supplier_id for fast lookups
   - On (supplier_id, is_cover) for cover photo queries
*/

CREATE TABLE IF NOT EXISTS supplier_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text,
  categoria text NOT NULL CHECK (
    categoria IN (
      'esterno','hall','camere','bagni',
      'ristorante','terrazza','piscina',
      'spa','sala_meeting','parcheggio',
      'allestimento','prodotto','team',
      'evento','altro'
    )),
  didascalia text,
  is_cover boolean DEFAULT false,
  ordine int DEFAULT 0,
  caricata_da uuid REFERENCES profiles(id),
  fonte text DEFAULT 'manuale' CHECK (fonte IN ('manuale','web')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_photos_supplier ON supplier_photos(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_photos_cover ON supplier_photos(supplier_id, is_cover);

ALTER TABLE supplier_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photos_select" ON supplier_photos;
CREATE POLICY "photos_select"
  ON supplier_photos FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "photos_insert" ON supplier_photos;
CREATE POLICY "photos_insert"
  ON supplier_photos FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "photos_update" ON supplier_photos;
CREATE POLICY "photos_update"
  ON supplier_photos FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "photos_delete" ON supplier_photos;
CREATE POLICY "photos_delete"
  ON supplier_photos FOR DELETE
  TO authenticated
  USING (
    caricata_da = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('Admin','Super Admin')
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('supplier-photos', 'supplier-photos', true, 10485760)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "supplier_photos_public_read" ON storage.objects;
CREATE POLICY "supplier_photos_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'supplier-photos');

DROP POLICY IF EXISTS "supplier_photos_auth_upload" ON storage.objects;
CREATE POLICY "supplier_photos_auth_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'supplier-photos');

DROP POLICY IF EXISTS "supplier_photos_auth_delete" ON storage.objects;
CREATE POLICY "supplier_photos_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'supplier-photos');
