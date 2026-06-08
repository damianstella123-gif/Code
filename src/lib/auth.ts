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
  { name: 'Creative Studio', href: '/creative-studio' },
  { name: 'Social Studio', href: '/social-studio' },
  { name: 'Presentazioni', href: '/presentazioni' },
  { name: 'Comunicazioni', href: '/comunicazioni' },
  { name: 'Workflow', href: '/workflow' },
  { name: 'Pratiche', href: '/pratiche' },
  { name: 'Utenti', href: '/utenti' },
  { name: 'Impostazioni', href: '/impostazioni' },
]

const ROLE_NAV: Record<AppRole, string[]> = {
  'Partner': ALL_NAV.map(n => n.href),
  'Project Manager': ['/dashboard', '/eventi', '/crm', '/task', '/calendario', '/fornitori', '/amministrazione', '/comunicazioni', '/pratiche'],
  'Amministrazione': ['/dashboard', '/crm', '/amministrazione', '/pratiche', '/comunicazioni'],
  'Production Manager': ['/dashboard', '/eventi', '/task', '/fornitori', '/calendario', '/comunicazioni'],
  'Digital Strategist': ['/dashboard', '/creative-studio', '/social-studio', '/presentazioni', '/calendario', '/comunicazioni'],
  'Event Coordinator': ['/dashboard', '/eventi', '/task', '/calendario', '/fornitori', '/pratiche', '/comunicazioni'],
  'Event Assistant': ['/dashboard', '/task', '/calendario', '/pratiche', '/comunicazioni'],
  'Junior Event Assistant': ['/dashboard', '/task', '/calendario', '/pratiche'],
}

export function getAllowedNavForRole(role: AppRole): NavItem[] {
  const allowed = ROLE_NAV[role] ?? ALL_NAV.map(n => n.href)
  return ALL_NAV.filter(n => allowed.includes(n.href))
}

export function getAllowedNav(ruolo: string): NavItem[] {
  return getAllowedNavForRole(ruolo as AppRole)
}
