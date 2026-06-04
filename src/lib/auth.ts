import type { AppRole } from './database.types'
import { supabase } from './supabase'

const STORAGE_KEY = 'simmetria_user'

export interface AuthUser {
  id: string
  first_name: string
  last_name: string
  email: string
  role: AppRole
  avatar_url: string | null
  is_active: boolean
  // Legacy compat fields used by other modules
  nome: string
  ruolo: string
}

export async function signOutEverywhere(): Promise<void> {
  try {
    await supabase.auth.signOut()
  } catch (e) {
    console.error('signOutEverywhere error:', e)
  }
  clearUser()
}

export function saveUser(user: Omit<AuthUser, 'nome' | 'ruolo'>): void {
  const full: AuthUser = {
    ...user,
    nome: `${user.first_name} ${user.last_name}`.trim(),
    ruolo: mapRoleToLegacy(user.role),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(full))
}

function mapRoleToLegacy(role: AppRole): string {
  switch (role) {
    case 'Partner': return 'Admin'
    case 'Project Manager':
    case 'Production Manager': return 'Manager'
    case 'Event Coordinator':
    case 'Digital Strategist': return 'Commerciale'
    case 'Amministrazione': return 'Finance'
    case 'Event Assistant':
    case 'Junior Event Assistant': return 'Operativo'
    default: return 'Operativo'
  }
}

export function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw)
    // Ensure legacy compat fields exist
    if (!stored.nome && stored.first_name) {
      stored.nome = `${stored.first_name} ${stored.last_name}`.trim()
    }
    if (!stored.ruolo && stored.role) {
      stored.ruolo = mapRoleToLegacy(stored.role)
    }
    return stored
  } catch {
    return null
  }
}

export function clearUser(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function isPartnerUser(user: AuthUser | null): boolean {
  if (!user) return false
  return user.role === 'Partner' || user.ruolo === 'Admin'
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

export function getAllowedNavForRole(role: AppRole): NavItem[] {
  switch (role) {
    case 'Partner':
      return ALL_NAV
    case 'Project Manager':
    case 'Production Manager':
      return ALL_NAV.filter(n => [
        '/dashboard', '/eventi', '/task', '/calendario', '/fornitori',
        '/comunicazioni', '/workflow', '/pratiche', '/impostazioni',
      ].includes(n.href))
    case 'Event Coordinator':
    case 'Digital Strategist':
      return ALL_NAV.filter(n => [
        '/dashboard', '/eventi', '/crm', '/task', '/calendario',
        '/comunicazioni', '/pratiche',
      ].includes(n.href))
    case 'Event Assistant':
    case 'Junior Event Assistant':
      return ALL_NAV.filter(n => [
        '/dashboard', '/task', '/calendario', '/comunicazioni',
      ].includes(n.href))
    case 'Amministrazione':
      return ALL_NAV.filter(n => [
        '/dashboard', '/amministrazione', '/eventi', '/calendario', '/pratiche',
      ].includes(n.href))
    default:
      return [{ name: 'Dashboard', href: '/dashboard' }]
  }
}

// Legacy compat wrappers (used by other modules that still import these)
export function getAllowedNav(ruolo: string): NavItem[] {
  const roleMap: Record<string, AppRole> = {
    Admin: 'Partner',
    Manager: 'Project Manager',
    Operativo: 'Event Assistant',
    Finance: 'Amministrazione',
    Commerciale: 'Event Coordinator',
    Fornitore: 'Junior Event Assistant',
  }
  return getAllowedNavForRole(roleMap[ruolo] ?? 'Junior Event Assistant')
}
