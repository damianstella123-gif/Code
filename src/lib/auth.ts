import { supabase } from './supabase'
import type { AppRole } from './database.types'

export interface AuthUser {
  id: string
  first_name: string
  last_name: string
  email: string
  role: AppRole
  avatar_url: string | null
  is_active: boolean
  nome: string
  ruolo: string
}

const STORAGE_KEY = 'simmetria_user'

export function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function saveUser(input: Omit<AuthUser, 'nome' | 'ruolo'>): void {
  const user: AuthUser = {
    ...input,
    nome: `${input.first_name} ${input.last_name}`.trim(),
    ruolo: 'Admin',
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export function clearUser(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export async function signOutEverywhere(): Promise<void> {
  clearUser()
  await supabase.auth.signOut()
}

export function isPartnerUser(_user: AuthUser | null): boolean {
  return true
}

export type NavItem = {
  name: string
  href: string
}

const ALL_NAV: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Eventi', href: '/eventi' },
  { name: 'CRM', href: '/crm' },
  { name: 'Task', href: '/task' },
  { name: 'Calendario', href: '/calendario' },
  { name: 'Fornitori', href: '/fornitori' },
  { name: 'Amministrazione', href: '/amministrazione' },
  { name: 'Comunicazioni', href: '/comunicazioni' },
  { name: 'Workflow', href: '/workflow' },
  { name: 'Pratiche', href: '/pratiche' },
  { name: 'Utenti', href: '/utenti' },
  { name: 'Impostazioni', href: '/impostazioni' },
]

export function getAllowedNavForRole(_role: AppRole): NavItem[] {
  return ALL_NAV
}

export function getAllowedNav(_ruolo: string): NavItem[] {
  return ALL_NAV
}
