import { supabase } from './supabase'
import type { AppRole } from './database.types'

export interface Profile {
  id: string
  nome: string
  email: string
  ruolo: AppRole
  reparto: string
  avatar_url: string | null
  stato: 'attivo' | 'ferie' | 'malattia'
  created_at: string
  updated_at: string
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('fetchProfile error:', error.message)
    return null
  }
  return data as Profile | null
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('nome', { ascending: true })
  if (error) {
    console.error('fetchAllProfiles error:', error.message)
    return []
  }
  return (data ?? []) as Profile[]
}

export async function updateOwnProfile(
  userId: string,
  patch: Partial<Pick<Profile, 'nome' | 'avatar_url' | 'reparto' | 'stato' | 'ruolo'>>,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select()
    .maybeSingle()
  if (error) {
    console.error('updateOwnProfile error:', error.message)
    return null
  }
  return data as Profile | null
}
