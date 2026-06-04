import { supabase } from './supabase'
import type { AppRole } from './database.types'

export interface Profile {
  id: string
  first_name: string
  last_name: string
  email: string
  role: AppRole
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, role, avatar_url, is_active, created_at, updated_at')
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
    .select('id, first_name, last_name, email, role, avatar_url, is_active, created_at, updated_at')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('fetchAllProfiles error:', error.message)
    return []
  }
  return (data ?? []) as Profile[]
}
