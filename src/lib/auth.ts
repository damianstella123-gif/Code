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
  return ['Super Admin', 'Admin', 'Senior PM', 'Project Manager', 'Regista'].includes(user?.role || '')
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

export function isSeniorPM(user: AuthUser | null): boolean {
  return user?.role === 'Senior PM'
}

export function isFinance(user: AuthUser | null): boolean {
  return user?.role === 'Amministrazione'
}

export function isRegista(user: AuthUser | null): boolean {
  return user?.role === 'Regista'
}

export function isCommerciale(user: AuthUser | null): boolean {
  return user?.role === 'Commerciale'
}

export function isPartnerUser(user: AuthUser | null): boolean {
  return isManager(user) || user?.role === 'Amministrazione'
}

export type NavItem = {
  name: string
  href: string
}

const ALL_NAV: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Eventi', href: '/eventi' },
  { name: 'Network', href: '/network' },
  { name: 'Task', href: '/task' },
  { name: 'Calendario', href: '/calendario' },
  { name: 'Amministrazione', href: '/amministrazione' },
  { name: 'Creative Studio', href: '/creative-studio' },
  { name: 'Presentazioni', href: '/presentazioni' },
  { name: 'Dossier', href: '/dossier' },
  { name: 'Archivio', href: '/archivio' },
  { name: 'Comunicazioni', href: '/comunicazioni' },
  { name: 'Workflow', href: '/workflow' },
  { name: 'Utenti', href: '/utenti' },
  { name: 'Performance', href: '/performance' },
  { name: 'Wellness', href: '/wellness' },
  { name: 'Centro Sicurezza', href: '/centro-sicurezza' },
  { name: 'AI & Trasparenza', href: '/ai-trasparenza' },
  { name: 'Impostazioni', href: '/impostazioni' },
  { name: 'Growth', href: '/growth' },
  { name: 'Feedback Beta', href: '/feedback-beta' },
  { name: 'Aiuto', href: '/aiuto' },
]

export function getAllowedNavForRole(role: AppRole | string): NavItem[] {
  if (role === 'Super Admin' || role === 'Admin') return ALL_NAV

  if (role === 'Senior PM' || role === 'Project Manager') {
    return ALL_NAV.filter(item =>
      !['/amministrazione', '/utenti', '/performance', '/centro-sicurezza'].includes(item.href)
    )
  }

  if (role === 'Regista') {
    return ALL_NAV.filter(item =>
      ['/dashboard', '/eventi', '/task', '/calendario', '/network', '/comunicazioni', '/dossier', '/growth', '/ai-trasparenza', '/impostazioni', '/feedback-beta', '/aiuto'].includes(item.href)
    )
  }

  if (role === 'Commerciale') {
    return ALL_NAV.filter(item =>
      ['/dashboard', '/network', '/presentazioni', '/comunicazioni', '/calendario', '/dossier', '/creative-studio', '/growth', '/ai-trasparenza', '/impostazioni', '/feedback-beta', '/aiuto'].includes(item.href)
    )
  }

  if (role === 'Amministrazione' || role === 'Finance') {
    return ALL_NAV.filter(item =>
      ['/dashboard', '/amministrazione', '/eventi', '/calendario', '/growth', '/ai-trasparenza', '/impostazioni', '/feedback-beta', '/aiuto'].includes(item.href)
    )
  }

  // Any other role: basic access
  return ALL_NAV.filter(item =>
    !['/amministrazione', '/utenti', '/performance', '/archivio', '/centro-sicurezza'].includes(item.href)
  )
}

export function getAllowedNav(ruolo: string): NavItem[] {
  return getAllowedNavForRole(ruolo as AppRole)
}
