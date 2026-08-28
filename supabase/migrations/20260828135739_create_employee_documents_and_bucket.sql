/*
# Create employee_documents table, private storage bucket, and strict RLS

## Purpose
Implements the "Fascicolo Dipendenti" module for storing sensitive employee
documents (contracts, payslips, CVs, certifications). This is the most
sensitive internal data and requires strict row-level security.

## 1. New Tables
- `employee_documents`
  - `id` (uuid, primary key)
  - `employee_id` (uuid, NOT NULL, references profiles.id) — the staff member
  - `file_path` (text, NOT NULL) — path in the employee-documents bucket
  - `file_name` (text, NOT NULL) — original filename
  - `file_type` (text) — MIME type
  - `category` (text, NOT NULL, default 'altro') — one of: contratto, busta_paga, cv, certificazione, valutazione, nota, altro
  - `visibility` (text, NOT NULL, default 'condiviso') — 'condiviso' (employee can see) or 'riservato' (admin only)
  - `uploaded_by` (uuid, NOT NULL, default auth.uid()) — who uploaded
  - `created_at` (timestamptz, default now())

## 2. Storage
- Creates private bucket `employee-documents` (no public access)
- Storage RLS: Admin/Amministrazione full access; employees read-only on their own condiviso files

## 3. Security (RLS)
- SELECT: Admin/Super Admin/Amministrazione see ALL rows.
         Normal employees see ONLY their own (employee_id = auth.uid()) AND visibility = 'condiviso'.
- INSERT: Admin/Super Admin/Amministrazione only.
- UPDATE: Admin/Super Admin/Amministrazione only.
- DELETE: Admin/Super Admin/Amministrazione only.

## 4. Important Notes
- Employees can NEVER see 'riservato' documents.
- Employees can NEVER see other employees' documents.
- Uses existing get_my_role() SECURITY DEFINER function for role checks.
- The category column uses CHECK constraint for valid values.
- The visibility column uses CHECK constraint for valid values.
*/

-- Table
CREATE TABLE IF NOT EXISTS employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  category text NOT NULL DEFAULT 'altro'
    CHECK (category IN ('contratto','busta_paga','cv','certificazione','valutazione','nota','altro')),
  visibility text NOT NULL DEFAULT 'condiviso'
    CHECK (visibility IN ('condiviso','riservato')),
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id ON employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_visibility ON employee_documents(visibility);

-- RLS
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

-- SELECT: admins see everything, employees see only own + condiviso
DROP POLICY IF EXISTS "ed_select" ON employee_documents;
CREATE POLICY "ed_select" ON employee_documents
  FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
    OR (employee_id = auth.uid() AND visibility = 'condiviso')
  );

-- INSERT: admins only
DROP POLICY IF EXISTS "ed_insert" ON employee_documents;
CREATE POLICY "ed_insert" ON employee_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
  );

-- UPDATE: admins only
DROP POLICY IF EXISTS "ed_update" ON employee_documents;
CREATE POLICY "ed_update" ON employee_documents
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'))
  WITH CHECK (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

-- DELETE: admins only
DROP POLICY IF EXISTS "ed_delete" ON employee_documents;
CREATE POLICY "ed_delete" ON employee_documents
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione'));

-- Private storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-documents',
  'employee-documents',
  false,
  52428800,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for the bucket
-- Admin/Amministrazione: full access on all objects in this bucket
DROP POLICY IF EXISTS "ed_storage_admin_select" ON storage.objects;
CREATE POLICY "ed_storage_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
  );

DROP POLICY IF EXISTS "ed_storage_admin_insert" ON storage.objects;
CREATE POLICY "ed_storage_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
  );

DROP POLICY IF EXISTS "ed_storage_admin_update" ON storage.objects;
CREATE POLICY "ed_storage_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
  );

DROP POLICY IF EXISTS "ed_storage_admin_delete" ON storage.objects;
CREATE POLICY "ed_storage_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND get_my_role() IN ('Admin', 'Super Admin', 'Amministrazione')
  );

-- Employee: read-only on their own folder (path starts with their user id)
-- AND only if the document row has visibility='condiviso'
DROP POLICY IF EXISTS "ed_storage_employee_select" ON storage.objects;
CREATE POLICY "ed_storage_employee_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM employee_documents ed
      WHERE ed.file_path = name
        AND ed.employee_id = auth.uid()
        AND ed.visibility = 'condiviso'
    )
  );
