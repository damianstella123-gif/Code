import { supabase } from './supabase'
import type { AppRole } from './database.types'
import type { Profile } from './profiles'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Authorization': `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
}

export async function adminListUsers(): Promise<Profile[]> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${EDGE_URL}?action=list-users`, { headers })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Errore caricamento utenti')
  return json.users as Profile[]
}

export interface CreateUserInput {
  email: string
  password: string
  first_name: string
  last_name: string
  role: AppRole
}

export async function adminCreateUser(input: CreateUserInput): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${EDGE_URL}?action=create-user`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Errore creazione utente')
}

export interface UpdateUserInput {
  user_id: string
  first_name?: string
  last_name?: string
  role?: AppRole
  is_active?: boolean
}

export async function adminUpdateUser(input: UpdateUserInput): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${EDGE_URL}?action=update-user`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Errore aggiornamento utente')
}

export async function adminResetPassword(userId: string, newPassword: string): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${EDGE_URL}?action=reset-password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ user_id: userId, new_password: newPassword }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Errore reset password')
}
