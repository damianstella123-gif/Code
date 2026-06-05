import { supabase } from './supabase'

export interface SocialContent {
  id: string
  title: string
  channel: string
  event_id: string | null
  client_id: string | null
  creative_project_id: string | null
  responsible_id: string | null
  copy: string
  publish_date: string | null
  status: string
  notes: string
  asset_url: string | null
  created_at: string
  updated_at: string
}

export const SOCIAL_CHANNELS = [
  { id: 'instagram_post', label: 'Instagram Post', icon: 'instagram' },
  { id: 'instagram_story', label: 'Instagram Story', icon: 'instagram' },
  { id: 'linkedin_post', label: 'LinkedIn Post', icon: 'linkedin' },
  { id: 'facebook_post', label: 'Facebook Post', icon: 'facebook' },
  { id: 'newsletter', label: 'Newsletter', icon: 'mail' },
] as const

export const SOCIAL_STATUSES = [
  { id: 'idea', label: 'Idea', color: '#9ba3aa' },
  { id: 'in_lavorazione', label: 'In Lavorazione', color: '#4db4ff' },
  { id: 'in_revisione', label: 'In Revisione', color: '#ffc24b' },
  { id: 'approvato', label: 'Approvato', color: '#38d27d' },
  { id: 'programmato', label: 'Programmato', color: '#a855f7' },
  { id: 'pubblicato', label: 'Pubblicato', color: '#22c55e' },
] as const

export async function fetchSocialContents(): Promise<SocialContent[]> {
  const { data, error } = await supabase
    .from('social_contents')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('fetchSocialContents error:', error.message)
    return []
  }
  return (data ?? []) as SocialContent[]
}

export async function upsertSocialContent(content: Partial<SocialContent> & { title: string }): Promise<SocialContent | null> {
  const { data, error } = await supabase
    .from('social_contents')
    .upsert(content, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('upsertSocialContent error:', error.message)
    return null
  }
  return data as SocialContent | null
}

export async function updateSocialContent(id: string, patch: Partial<SocialContent>): Promise<SocialContent | null> {
  const { data, error } = await supabase
    .from('social_contents')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    console.error('updateSocialContent error:', error.message)
    return null
  }
  return data as SocialContent | null
}

export async function deleteSocialContent(id: string): Promise<boolean> {
  const { error } = await supabase.from('social_contents').delete().eq('id', id)
  if (error) {
    console.error('deleteSocialContent error:', error.message)
    return false
  }
  return true
}

export async function uploadSocialAsset(file: File, contentId: string): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const path = `social/${contentId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('creative-files')
    .upload(path, file, { upsert: true })
  if (error) {
    console.error('uploadSocialAsset error:', error.message)
    return null
  }
  const { data: urlData } = supabase.storage.from('creative-files').getPublicUrl(path)
  return urlData.publicUrl
}
