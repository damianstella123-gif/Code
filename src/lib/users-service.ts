import { users as mockUsers } from '@/data/users'
import type { User } from '@/data/users'
import { fetchAllProfiles, type Profile } from './profiles'
import { mapAppRoleToLegacy } from './auth'

// Step 1 dell'integrazione Supabase: i moduli demo continuano a leggere
// `users` da mock. Questo modulo offre un'unica API neutra che potra essere
// rimpiazzata negli step successivi quando i moduli verranno migrati.

export type DataSource = 'mock' | 'supabase'

let CURRENT_SOURCE: DataSource = 'mock'

export function setUsersSource(source: DataSource): void {
  CURRENT_SOURCE = source
}

export function getUsersSource(): DataSource {
  return CURRENT_SOURCE
}

export function profileToUser(p: Profile): User {
  return {
    id: p.id,
    nome: p.nome,
    email: p.email,
    ruolo: mapAppRoleToLegacy(p.ruolo),
    reparto: p.reparto,
    avatar: p.avatar_url ?? '',
    stato: p.stato,
  }
}

export async function listUsers(): Promise<User[]> {
  if (CURRENT_SOURCE === 'supabase') {
    const profiles = await fetchAllProfiles()
    return profiles.map(profileToUser)
  }
  return mockUsers
}
