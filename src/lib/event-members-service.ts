import { supabase } from './supabase'

export type MemberRole = 'responsabile' | 'collaboratore' | 'operativo' | 'sola_lettura'

export interface EventMember {
  id: string
  event_id: string
  user_id: string
  member_role: MemberRole
  can_manage_members: boolean
  can_manage_budget: boolean
  can_manage_documents: boolean
  can_manage_payments: boolean
  can_manage_creative: boolean
  can_manage_registration: boolean
  can_access_onsite: boolean
  invited_by: string | null
  created_at: string
  updated_at: string
}

export type PermissionKey =
  | 'can_manage_members'
  | 'can_manage_budget'
  | 'can_manage_documents'
  | 'can_manage_payments'
  | 'can_manage_creative'
  | 'can_manage_registration'
  | 'can_access_onsite'

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  can_manage_members: 'Gestione team',
  can_manage_budget: 'Budget',
  can_manage_documents: 'Documenti e Fly',
  can_manage_payments: 'Richieste di pagamento',
  can_manage_creative: 'Creative Studio',
  can_manage_registration: 'Siti di registrazione',
  can_access_onsite: 'Operatività On Site',
}

export const ALL_PERMISSIONS: PermissionKey[] = [
  'can_manage_members',
  'can_manage_budget',
  'can_manage_documents',
  'can_manage_payments',
  'can_manage_creative',
  'can_manage_registration',
  'can_access_onsite',
]

export const ROLE_LABELS: Record<MemberRole, string> = {
  responsabile: 'Responsabile',
  collaboratore: 'Collaboratore',
  operativo: 'Operativo',
  sola_lettura: 'Sola lettura',
}

export const ROLE_PRESETS: Record<MemberRole, Record<PermissionKey, boolean>> = {
  responsabile: {
    can_manage_members: true,
    can_manage_budget: true,
    can_manage_documents: true,
    can_manage_payments: true,
    can_manage_creative: true,
    can_manage_registration: true,
    can_access_onsite: true,
  },
  collaboratore: {
    can_manage_members: false,
    can_manage_budget: false,
    can_manage_documents: true,
    can_manage_payments: false,
    can_manage_creative: true,
    can_manage_registration: true,
    can_access_onsite: true,
  },
  operativo: {
    can_manage_members: false,
    can_manage_budget: false,
    can_manage_documents: false,
    can_manage_payments: false,
    can_manage_creative: false,
    can_manage_registration: false,
    can_access_onsite: true,
  },
  sola_lettura: {
    can_manage_members: false,
    can_manage_budget: false,
    can_manage_documents: false,
    can_manage_payments: false,
    can_manage_creative: false,
    can_manage_registration: false,
    can_access_onsite: false,
  },
}

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Sessione scaduta. Effettua di nuovo il login.',
  EVENT_NOT_FOUND: 'Evento non trovato.',
  PROFILE_NOT_FOUND: 'Profilo utente non trovato.',
  ROLE_NOT_ALLOWED: 'Ruolo evento non valido.',
  NOT_AUTHORIZED: 'Non hai i permessi per questa operazione.',
  PERMISSION_ESCALATION: 'Non puoi assegnare permessi che non possiedi.',
  EVENT_OWNER_PROTECTED: 'Non puoi modificare il responsabile dell\'evento.',
  LAST_EVENT_MANAGER: 'Impossibile: è l\'ultimo gestore dell\'evento.',
  INVALID_RESPONSABILE_PERMISSIONS: 'Il ruolo Responsabile richiede "Gestione team" attivo.',
  INVALID_READONLY_PERMISSIONS: 'Il ruolo Sola lettura richiede tutti i permessi disattivati.',
  MEMBER_NOT_FOUND: 'Membro non trovato nell\'evento.',
}

export function translateError(error: string): string {
  for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
    if (error.includes(key)) return msg
  }
  return error || 'Errore imprevisto.'
}

export async function fetchEventMembers(eventId: string): Promise<EventMember[]> {
  const { data, error } = await supabase
    .from('event_members')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('fetchEventMembers:', error.message)
    return []
  }
  return (data ?? []) as EventMember[]
}

export async function checkCanManageMembers(eventId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_manage_event_members', {
    p_event_id: eventId,
  })
  if (error) {
    console.error('checkCanManageMembers:', error.message)
    return false
  }
  return data === true
}

export async function checkEventPermission(eventId: string, permission: PermissionKey): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_event_permission', {
    p_event_id: eventId,
    p_permission: permission,
  })
  if (error) {
    console.error('checkEventPermission:', error.message)
    return false
  }
  return data === true
}

export async function checkAllPermissions(eventId: string): Promise<Record<PermissionKey, boolean>> {
  const results = await Promise.all(
    ALL_PERMISSIONS.map(p => checkEventPermission(eventId, p).then(val => [p, val] as const))
  )
  return Object.fromEntries(results) as Record<PermissionKey, boolean>
}

export async function upsertEventMember(params: {
  event_id: string
  user_id: string
  member_role: MemberRole
  can_manage_members: boolean
  can_manage_budget: boolean
  can_manage_documents: boolean
  can_manage_payments: boolean
  can_manage_creative: boolean
  can_manage_registration: boolean
  can_access_onsite: boolean
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('upsert_event_member', {
    p_event_id: params.event_id,
    p_user_id: params.user_id,
    p_member_role: params.member_role,
    p_can_manage_members: params.can_manage_members,
    p_can_manage_budget: params.can_manage_budget,
    p_can_manage_documents: params.can_manage_documents,
    p_can_manage_payments: params.can_manage_payments,
    p_can_manage_creative: params.can_manage_creative,
    p_can_manage_registration: params.can_manage_registration,
    p_can_access_onsite: params.can_access_onsite,
  })
  if (error) return { id: null, error: error.message }
  return { id: data as string, error: null }
}

export async function removeEventMember(eventId: string, userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('remove_event_member', {
    p_event_id: eventId,
    p_user_id: userId,
  })
  if (error) return { error: error.message }
  return { error: null }
}
