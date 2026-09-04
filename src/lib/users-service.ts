import { supabase } from './supabase'
import type { AppRole } from './database.types'
import type { Profile } from './profiles'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessione scaduta, effettua nuovamente il login')
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
}

async function call(action: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<unknown> {
  const headers = await getAuthHeaders()
  const opts: RequestInit = { method, headers }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${EDGE_URL}?action=${action}`, opts)
  const json = await res.json()
  if (!res.ok) {
    if (json.error === 'MFA_REQUIRED') {
      throw new Error('Questa operazione richiede l\u2019autenticazione a due fattori. Attiva la 2FA sul tuo account e accedi con essa, poi riprova.')
    }
    throw new Error(json.error ?? `Errore ${res.status}`)
  }
  return json
}

export async function adminListUsers(): Promise<Profile[]> {
  const data = await call('list-users') as { users: Profile[] }
  return data.users
}

export interface CreateUserInput {
  email: string
  password: string
  first_name: string
  last_name: string
  role: AppRole
}

export async function adminCreateUser(input: CreateUserInput): Promise<void> {
  await call('create-user', 'POST', input)
}

export interface UpdateUserInput {
  user_id: string
  first_name?: string
  last_name?: string
  email?: string
  role?: AppRole
  is_active?: boolean
  avatar_url?: string | null
}

export async function adminUpdateUser(input: UpdateUserInput): Promise<void> {
  await call('update-user', 'POST', input)
}

export async function adminResetPassword(userId: string, newPassword: string): Promise<void> {
  await call('reset-password', 'POST', { user_id: userId, new_password: newPassword })
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${EDGE_URL}?action=delete-user`, { method: 'POST', headers, body: JSON.stringify({ user_id: userId }) })
  const json = await res.json()
  if (!res.ok) {
    if (json.error === 'MFA_REQUIRED') {
      throw new Error('Questa operazione richiede l\u2019autenticazione a due fattori. Attiva la 2FA sul tuo account e accedi con essa, poi riprova.')
    }
    if (json.error === 'HAS_LINKED_DATA') {
      const err = new Error(json.message ?? 'Questo utente ha dati collegati.')
      ;(err as any).code = 'HAS_LINKED_DATA'
      throw err
    }
    throw new Error(json.error ?? `Errore ${res.status}`)
  }
}
