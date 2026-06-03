import type { User } from '@/data/users'
import type { AppRole } from './database.types'

const STORAGE_KEY = 'simmetria_user'

export function saveUser(user: User): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearUser(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export type NavItem = {
  name: string
  href: string
}

export function getAllowedNav(ruolo: User['ruolo']): NavItem[] {
  const all: NavItem[] = [
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

  switch (ruolo) {
    case 'Admin':
      return all
    case 'Manager':
      return all.filter(n => ['/dashboard', '/eventi', '/task', '/calendario', '/comunicazioni', '/workflow', '/pratiche'].includes(n.href))
    case 'Operativo':
      return all.filter(n => ['/dashboard', '/task', '/calendario', '/comunicazioni'].includes(n.href))
    case 'Finance':
      return all.filter(n => ['/dashboard', '/amministrazione', '/eventi', '/calendario', '/pratiche'].includes(n.href))
    case 'Commerciale':
      return all.filter(n => ['/dashboard', '/crm', '/eventi', '/calendario', '/comunicazioni'].includes(n.href))
    case 'Fornitore':
      return all.filter(n => ['/dashboard', '/task', '/calendario'].includes(n.href))
    default:
      return [{ name: 'Dashboard', href: '/dashboard' }]
  }
}

// ─── Mapping fra AppRole Supabase e ruoli legacy demo ────────────────────────
// In Step 1 manteniamo l'app demo con i ruoli legacy. Quando in Step successivi
// l'auth verra migrata a Supabase, ogni AppRole sara mappato al set di permessi
// piu vicino fra quelli gia esistenti (Admin/Manager/Operativo/Finance/...).

export function mapAppRoleToLegacy(role: AppRole): User['ruolo'] {
  switch (role) {
    case 'Partner':
      return 'Admin'
    case 'Project Manager':
    case 'Production Manager':
      return 'Manager'
    case 'Event Coordinator':
    case 'Digital Strategist':
      return 'Commerciale'
    case 'Amministrazione':
      return 'Finance'
    case 'Event Assistant':
    case 'Junior Event Assistant':
      return 'Operativo'
    default:
      return 'Operativo'
  }
}

export function getAllowedNavForAppRole(role: AppRole): NavItem[] {
  return getAllowedNav(mapAppRoleToLegacy(role))
}

