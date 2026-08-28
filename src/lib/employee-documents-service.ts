import { supabase } from './supabase'

export interface EmployeeDocument {
  id: string
  employee_id: string
  file_path: string
  file_name: string
  file_type: string | null
  category: string
  visibility: 'condiviso' | 'riservato'
  uploaded_by: string
  created_at: string
}

export const CATEGORY_LABELS: Record<string, string> = {
  contratto: 'Contratto',
  busta_paga: 'Busta Paga',
  cv: 'CV',
  certificazione: 'Certificazione',
  valutazione: 'Valutazione',
  nota: 'Nota',
  altro: 'Altro',
}

export const CATEGORIES = Object.keys(CATEGORY_LABELS)

export async function fetchEmployeeDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  const { data, error } = await supabase
    .from('employee_documents')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EmployeeDocument[]
}

export async function fetchMyDocuments(): Promise<EmployeeDocument[]> {
  const { data, error } = await supabase
    .from('employee_documents')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as EmployeeDocument[]
}

export async function uploadEmployeeDocument(
  employeeId: string,
  file: File,
  category: string,
  visibility: 'condiviso' | 'riservato'
): Promise<EmployeeDocument> {
  const ts = Date.now()
  const path = `${employeeId}/${ts}_${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('employee-documents')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('employee_documents')
    .insert({
      employee_id: employeeId,
      file_path: path,
      file_name: file.name,
      file_type: file.type || null,
      category,
      visibility,
    })
    .select()
    .single()
  if (error) throw error
  return data as EmployeeDocument
}

export async function deleteEmployeeDocument(doc: EmployeeDocument): Promise<void> {
  await supabase.storage.from('employee-documents').remove([doc.file_path])
  const { error } = await supabase.from('employee_documents').delete().eq('id', doc.id)
  if (error) throw error
}

export async function getSignedUrl(filePath: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from('employee-documents')
    .createSignedUrl(filePath, 300)
  return data?.signedUrl ?? null
}
