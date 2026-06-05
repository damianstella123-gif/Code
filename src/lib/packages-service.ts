import { supabase } from './supabase'

export interface ClientPackage {
  id: string
  event_id: string
  client_id: string
  status: string
  pptx_url: string | null
  pdf_presentation_url: string | null
  xlsx_url: string | null
  pdf_budget_url: string | null
  notes: string
  sent_at: string | null
  created_at: string
  updated_at: string
}

export const PACKAGE_STATUSES = [
  { id: 'bozza', label: 'Bozza', color: '#9ba3aa' },
  { id: 'in_preparazione', label: 'In Preparazione', color: '#4db4ff' },
  { id: 'pronto', label: 'Pronto', color: '#38d27d' },
  { id: 'inviato', label: 'Inviato', color: '#22c55e' },
  { id: 'archiviato', label: 'Archiviato', color: '#6b7280' },
] as const

export async function fetchClientPackages(): Promise<ClientPackage[]> {
  const { data, error } = await supabase
    .from('client_packages')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('fetchClientPackages error:', error.message)
    return []
  }
  return (data ?? []) as ClientPackage[]
}

export async function fetchPackagesByEvent(eventId: string): Promise<ClientPackage[]> {
  const { data, error } = await supabase
    .from('client_packages')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('fetchPackagesByEvent error:', error.message)
    return []
  }
  return (data ?? []) as ClientPackage[]
}

export async function upsertClientPackage(pkg: Partial<ClientPackage> & { event_id: string; client_id: string }): Promise<ClientPackage | null> {
  const { data, error } = await supabase
    .from('client_packages')
    .upsert(pkg, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('upsertClientPackage error:', error.message)
    return null
  }
  return data as ClientPackage | null
}

export async function updateClientPackage(id: string, patch: Partial<ClientPackage>): Promise<ClientPackage | null> {
  const { data, error } = await supabase
    .from('client_packages')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    console.error('updateClientPackage error:', error.message)
    return null
  }
  return data as ClientPackage | null
}

export async function deleteClientPackage(id: string): Promise<boolean> {
  const { error } = await supabase.from('client_packages').delete().eq('id', id)
  if (error) {
    console.error('deleteClientPackage error:', error.message)
    return false
  }
  return true
}

export async function uploadPackageFile(file: File, packageId: string, type: string): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const path = `${packageId}/${type}_${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('client-packages')
    .upload(path, file, { upsert: true })
  if (error) {
    console.error('uploadPackageFile error:', error.message)
    return null
  }
  const { data: urlData } = supabase.storage.from('client-packages').getPublicUrl(path)
  return urlData.publicUrl
}
