import { supabase } from './supabase'
import { loadUser } from './auth'

export interface LeaveRequest {
  id: string
  user_id: string
  tipo: 'ferie' | 'permesso' | 'malattia' | 'recupero'
  data_inizio: string
  data_fine: string
  ora_inizio: string | null
  ora_fine: string | null
  giorni_richiesti: number | null
  motivo: string | null
  stato: 'in_attesa' | 'approvata' | 'negata' | 'annullata'
  approvato_da: string | null
  approvato_at: string | null
  note_admin: string | null
  created_at: string
  profiles?: { first_name: string; last_name: string; avatar_url: string | null; role: string }
}

export async function createLeaveRequest(params: {
  tipo: 'ferie' | 'permesso' | 'malattia' | 'recupero'
  dataInizio: string
  dataFine: string
  oraInizio?: string
  oraFine?: string
  motivo?: string
}): Promise<{ data: LeaveRequest | null; error: string | null }> {
  const user = loadUser()
  if (!user) return { data: null, error: 'Sessione scaduta. Effettua nuovamente il login.' }

  const { data, error } = await supabase.rpc('submit_leave_request', {
    p_tipo: params.tipo,
    p_data_inizio: params.dataInizio,
    p_data_fine: params.dataFine,
    p_ora_inizio: params.tipo === 'permesso' && params.oraInizio ? params.oraInizio : null,
    p_ora_fine: params.tipo === 'permesso' && params.oraFine ? params.oraFine : null,
    p_motivo: params.motivo || null,
  })

  if (error) {
    const msg = translateRpcError(error.message)
    return { data: null, error: msg }
  }

  return { data: data as LeaveRequest | null, error: null }
}

export async function approveLeaveRequest(requestId: string): Promise<{ success: boolean; error: string | null }> {
  const user = loadUser()
  if (!user) return { success: false, error: 'Sessione scaduta. Effettua nuovamente il login.' }

  const { error } = await supabase.rpc('review_leave_request', {
    p_request_id: requestId,
    p_decision: 'approvata',
    p_note_admin: null,
  })

  if (error) {
    return { success: false, error: translateRpcError(error.message) }
  }
  return { success: true, error: null }
}

export async function rejectLeaveRequest(requestId: string, noteAdmin: string): Promise<{ success: boolean; error: string | null }> {
  const user = loadUser()
  if (!user) return { success: false, error: 'Sessione scaduta. Effettua nuovamente il login.' }

  const { error } = await supabase.rpc('review_leave_request', {
    p_request_id: requestId,
    p_decision: 'negata',
    p_note_admin: noteAdmin || null,
  })

  if (error) {
    return { success: false, error: translateRpcError(error.message) }
  }
  return { success: true, error: null }
}

export async function cancelLeaveRequest(requestId: string): Promise<{ success: boolean; error: string | null }> {
  const user = loadUser()
  if (!user) return { success: false, error: 'Sessione scaduta. Effettua nuovamente il login.' }

  const { error } = await supabase.from('leave_requests')
    .update({ stato: 'annullata' })
    .eq('id', requestId)

  if (error) {
    return { success: false, error: 'Impossibile annullare la richiesta. Riprova.' }
  }
  return { success: true, error: null }
}

export async function getPendingLeaveRequests(): Promise<LeaveRequest[]> {
  const { data } = await supabase.from('leave_requests')
    .select('*, profiles!leave_requests_user_id_fkey(first_name, last_name, avatar_url, role)')
    .eq('stato', 'in_attesa')
    .order('created_at', { ascending: false })

  return (data ?? []) as LeaveRequest[]
}

export async function getUserLeaveRequests(userId?: string): Promise<LeaveRequest[]> {
  const user = loadUser()
  const id = userId || user?.id
  if (!id) return []

  const { data } = await supabase.from('leave_requests')
    .select('*')
    .eq('user_id', id)
    .order('created_at', { ascending: false })

  return (data ?? []) as LeaveRequest[]
}

export async function getAllLeaveRequests(): Promise<LeaveRequest[]> {
  const { data } = await supabase.from('leave_requests')
    .select('*, profiles!leave_requests_user_id_fkey(first_name, last_name, avatar_url, role)')
    .order('created_at', { ascending: false })

  return (data ?? []) as LeaveRequest[]
}

function translateRpcError(raw: string): string {
  if (raw.includes('overlap') || raw.includes('sovrapposizione')) return 'Esiste gia una richiesta per le stesse date.'
  if (raw.includes('permission') || raw.includes('autorizzat')) return 'Non hai i permessi per questa operazione.'
  if (raw.includes('not found') || raw.includes('non trovata')) return 'Richiesta non trovata.'
  if (raw.includes('already') || raw.includes('gia')) return 'Questa richiesta e gia stata gestita.'
  if (raw.includes('invalid') || raw.includes('non valido')) return 'I dati inseriti non sono validi.'
  return 'Si e verificato un errore. Riprova tra qualche istante.'
}
