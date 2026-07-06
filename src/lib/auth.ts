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
    ruolo: input.role,
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

export function isSuperAdmin(user: AuthUser | null): boolean {
  return user?.role === 'Super Admin'
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === 'Super Admin' || user?.role === 'Admin'
}

export function isManager(user: AuthUser | null): boolean {
  return user?.role === 'Super Admin' || user?.role === 'Admin' || user?.role === 'Project Manager'
}

export function canManageUsers(user: AuthUser | null): boolean {
  return user?.role === 'Super Admin' || user?.role === 'Admin'
}

export function canResetOtherPasswords(user: AuthUser | null): boolean {
  return user?.role === 'Super Admin' || user?.role === 'Admin'
}

export function canChangeRoles(user: AuthUser | null): boolean {
  return user?.role === 'Super Admin'
}

export function canAccessSystemSettings(user: AuthUser | null): boolean {
  return user?.role === 'Super Admin'
}

// Legacy compat - used by Amministrazione page
export function isPartnerUser(user: AuthUser | null): boolean {
  return isManager(user) || user?.role === 'Finance'
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
  { name: 'Knowledge Base', href: '/archivio' },
  { name: 'Comunicazioni', href: '/comunicazioni' },
  { name: 'Workflow', href: '/workflow' },
  { name: 'Pratiche', href: '/pratiche' },
  { name: 'Utenti', href: '/utenti' },
  { name: 'Impostazioni', href: '/impostazioni' },
  { name: 'Feedback Beta', href: '/feedback-beta' },
]

const ADMIN_ONLY_PATHS = ['/utenti']
const FINANCE_PATHS = ['/amministrazione']

export function getAllowedNavForRole(role: AppRole | string): NavItem[] {
  if (role === 'Super Admin' || role === 'Admin') return ALL_NAV

  if (role === 'Finance') {
    return ALL_NAV.filter(item => !ADMIN_ONLY_PATHS.includes(item.href))
  }

  if (role === 'Project Manager') {
    return ALL_NAV.filter(item => !ADMIN_ONLY_PATHS.includes(item.href) && !FINANCE_PATHS.includes(item.href))
  }

  // User / any other role: basic access (no admin, no finance, no user mgmt)
  return ALL_NAV.filter(item => {
    if (ADMIN_ONLY_PATHS.includes(item.href)) return false
    if (FINANCE_PATHS.includes(item.href)) return false
    return true
  })
}

export function getAllowedNav(ruolo: string): NavItem[] {
  return getAllowedNavForRole(ruolo as AppRole)
}
