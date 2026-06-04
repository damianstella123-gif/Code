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

const DEFAULT_USER: AuthUser = {
  id: 'partner-default',
  first_name: 'Simmetria',
  last_name: 'Partner',
  email: 'partner@simmetria.it',
  role: 'Partner',
  avatar_url: null,
  is_active: true,
  nome: 'Simmetria Partner',
  ruolo: 'Admin',
}

export function loadUser(): AuthUser {
  return DEFAULT_USER
}

export function isPartnerUser(_user: AuthUser | null): boolean {
  return true
}

export function saveUser(_user: Omit<AuthUser, 'nome' | 'ruolo'>): void {}
export function clearUser(): void {}
export async function signOutEverywhere(): Promise<void> {}

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
