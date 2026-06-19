import { supabase } from './supabase'

export interface CreativeProject {
  id: string
  title: string
  type: string
  event_id: string | null
  client_id: string | null
  responsible_id: string | null
  status: string
  due_date: string | null
  notes: string
  output_format: string
  file_url: string | null
  created_at: string
  updated_at: string
}

export const CREATIVE_TYPES = [
  { id: 'presentazione', label: 'Presentazione' },
  { id: 'menu_a6', label: 'Menu A6' },
  { id: 'menu_a5', label: 'Menu A5' },
  { id: 'badge', label: 'Badge' },
  { id: 'cartellonistica', label: 'Cartellonistica' },
  { id: 'invito', label: 'Invito' },
  { id: 'programma', label: 'Programma Evento' },
  { id: 'materiale_sponsor', label: 'Materiale Sponsor' },
  { id: 'brochure', label: 'Brochure' },
  { id: 'welcome_sign', label: 'Welcome Sign' },
] as const

export const CREATIVE_STATUSES = [
  { id: 'bozza', label: 'Bozza', color: '#9ba3aa' },
  { id: 'in_lavorazione', label: 'In Lavorazione', color: '#4db4ff' },
  { id: 'in_revisione', label: 'In Revisione', color: '#ffc24b' },
  { id: 'approvato', label: 'Approvato', color: '#38d27d' },
  { id: 'completato', label: 'Completato', color: '#22c55e' },
] as const

export const OUTPUT_FORMATS = ['pptx', 'pdf', 'png', 'jpg'] as const

export async function fetchCreativeProjects(): Promise<CreativeProject[]> {
  const { data, error } = await supabase
    .from('creative_projects')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    console.error('fetchCreativeProjects error:', error.message)
    return []
  }
  return (data ?? []) as CreativeProject[]
}

export async function upsertCreativeProject(project: Partial<CreativeProject> & { title: string }): Promise<CreativeProject | null> {
  const { data, error } = await supabase
    .from('creative_projects')
    .upsert(project, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('upsertCreativeProject error:', error.message)
    return null
  }
  return data as CreativeProject | null
}

export async function updateCreativeProject(id: string, patch: Partial<CreativeProject>): Promise<CreativeProject | null> {
  const { data, error } = await supabase
    .from('creative_projects')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    console.error('updateCreativeProject error:', error.message)
    return null
  }
  return data as CreativeProject | null
}

export async function deleteCreativeProject(id: string): Promise<boolean> {
  const { error } = await supabase.from('creative_projects').delete().eq('id', id)
  if (error) {
    console.error('deleteCreativeProject error:', error.message)
    return false
  }
  return true
}

export async function uploadCreativeFile(file: File, projectId: string): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const path = `${projectId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('creative-files')
    .upload(path, file, { upsert: true })
  if (error) {
    console.error('uploadCreativeFile error:', error.message)
    return null
  }
  const { data: urlData } = supabase.storage.from('creative-files').getPublicUrl(path)
  return urlData.publicUrl
}
