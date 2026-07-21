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

export interface LeaveRequestChange {
  id: string
  leave_request_id: string
  requested_by: string
  change_type: 'modifica' | 'annullamento'
  proposed_data_inizio: string | null
  proposed_data_fine: string | null
  proposed_ora_inizio: string | null
  proposed_ora_fine: string | null
  proposed_motivo: string | null
  employee_reason: string
  change_status: 'in_attesa' | 'approvata' | 'negata' | 'annullata'
  reviewed_by: string | null
  reviewed_at: string | null
  admin_note: string | null
  created_at: string
  updated_at: string
  profiles?: { first_name: string; last_name: string; avatar_url: string | null }
  leave_requests?: Pick<LeaveRequest, 'id' | 'tipo' | 'data_inizio' | 'data_fine' | 'user_id' | 'profiles'>
}

// ─── Existing exports (preserved) ────────────────────────────

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
    return { data: null, error: translateRpcError(error.message) }
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

// ─── New lifecycle functions ─────────────────────────────────

export async function updatePendingLeaveRequest(params: {
  requestId: string
  dataInizio: string
  dataFine: string
  oraInizio?: string | null
  oraFine?: string | null
  motivo?: string | null
}): Promise<{ success: boolean; error: string | null }> {
  const user = loadUser()
  if (!user) return { success: false, error: 'Sessione scaduta. Effettua nuovamente il login.' }

  if (!params.requestId) return { success: false, error: 'ID richiesta mancante.' }
  if (!params.dataInizio || !params.dataFine) return { success: false, error: 'Le date sono obbligatorie.' }
  if (params.dataFine < params.dataInizio) return { success: false, error: 'La data fine deve essere uguale o successiva alla data inizio.' }

  const { error } = await supabase.rpc('update_pending_leave_request', {
    p_request_id: params.requestId,
    p_data_inizio: params.dataInizio,
    p_data_fine: params.dataFine,
    p_ora_inizio: params.oraInizio || null,
    p_ora_fine: params.oraFine || null,
    p_motivo: params.motivo || null,
  })

  if (error) {
    return { success: false, error: translateRpcError(error.message) }
  }
  return { success: true, error: null }
}

export async function withdrawPendingLeaveRequest(requestId: string): Promise<{ success: boolean; error: string | null }> {
  const user = loadUser()
  if (!user) return { success: false, error: 'Sessione scaduta. Effettua nuovamente il login.' }
  if (!requestId) return { success: false, error: 'ID richiesta mancante.' }

  const { error } = await supabase.rpc('withdraw_pending_leave_request', {
    p_request_id: requestId,
  })

  if (error) {
    return { success: false, error: translateRpcError(error.message) }
  }
  return { success: true, error: null }
}

export async function requestApprovedLeaveChange(params: {
  requestId: string
  changeType: 'modifica' | 'annullamento'
  dataInizio?: string | null
  dataFine?: string | null
  oraInizio?: string | null
  oraFine?: string | null
  motivo?: string | null
  employeeReason: string
}): Promise<{ changeId: string | null; error: string | null }> {
  const user = loadUser()
  if (!user) return { changeId: null, error: 'Sessione scaduta. Effettua nuovamente il login.' }

  if (!params.requestId) return { changeId: null, error: 'ID richiesta mancante.' }
  if (!params.changeType) return { changeId: null, error: 'Tipo di modifica mancante.' }
  if (!params.employeeReason || params.employeeReason.trim().length < 5) {
    return { changeId: null, error: 'La motivazione deve contenere almeno 5 caratteri.' }
  }
  if (params.changeType === 'modifica') {
    if (!params.dataInizio || !params.dataFine) return { changeId: null, error: 'Le date proposte sono obbligatorie per una modifica.' }
    if (params.dataFine < params.dataInizio) return { changeId: null, error: 'La data fine proposta deve essere uguale o successiva alla data inizio.' }
  }

  const { data, error } = await supabase.rpc('request_approved_leave_change', {
    p_request_id: params.requestId,
    p_change_type: params.changeType,
    p_data_inizio: params.dataInizio || null,
    p_data_fine: params.dataFine || null,
    p_ora_inizio: params.oraInizio || null,
    p_ora_fine: params.oraFine || null,
    p_motivo: params.motivo || null,
    p_employee_reason: params.employeeReason.trim(),
  })

  if (error) {
    return { changeId: null, error: translateRpcError(error.message) }
  }
  return { changeId: data as string, error: null }
}

export async function fetchMyLeaveChanges(): Promise<LeaveRequestChange[]> {
  const user = loadUser()
  if (!user) return []

  const { data } = await supabase.from('leave_request_changes')
    .select(`
      *,
      profiles!leave_request_changes_requested_by_fkey(first_name, last_name, avatar_url),
      leave_requests!leave_request_changes_leave_request_id_fkey(
        id, tipo, data_inizio, data_fine, user_id,
        profiles!leave_requests_user_id_fkey(first_name, last_name, avatar_url, role)
      )
    `)
    .order('created_at', { ascending: false })

  return (data ?? []) as LeaveRequestChange[]
}

export async function fetchAdminPendingLeaveChanges(): Promise<LeaveRequestChange[]> {
  const user = loadUser()
  if (!user) return []

  const { data } = await supabase.from('leave_request_changes')
    .select(`
      *,
      profiles!leave_request_changes_requested_by_fkey(first_name, last_name, avatar_url),
      leave_requests!leave_request_changes_leave_request_id_fkey(
        id, tipo, data_inizio, data_fine, user_id,
        profiles!leave_requests_user_id_fkey(first_name, last_name, avatar_url, role)
      )
    `)
    .eq('change_status', 'in_attesa')
    .order('created_at', { ascending: false })

  return (data ?? []) as LeaveRequestChange[]
}

export async function reviewLeaveChange(
  changeId: string,
  decision: 'approvata' | 'negata',
  adminNote?: string
): Promise<{ success: boolean; error: string | null }> {
  const user = loadUser()
  if (!user) return { success: false, error: 'Sessione scaduta. Effettua nuovamente il login.' }
  if (!changeId) return { success: false, error: 'ID modifica mancante.' }
  if (decision === 'negata' && (!adminNote || adminNote.trim().length < 5)) {
    return { success: false, error: 'La nota di rifiuto deve contenere almeno 5 caratteri.' }
  }

  const { error } = await supabase.rpc('review_leave_change', {
    p_change_id: changeId,
    p_decision: decision,
    p_admin_note: adminNote?.trim() || null,
  })

  if (error) {
    return { success: false, error: translateRpcError(error.message) }
  }
  return { success: true, error: null }
}

export async function adminCancelApprovedLeave(
  requestId: string,
  note: string
): Promise<{ success: boolean; error: string | null }> {
  const user = loadUser()
  if (!user) return { success: false, error: 'Sessione scaduta. Effettua nuovamente il login.' }
  if (!requestId) return { success: false, error: 'ID richiesta mancante.' }
  if (!note || note.trim().length < 5) {
    return { success: false, error: 'La motivazione deve contenere almeno 5 caratteri.' }
  }

  const { error } = await supabase.rpc('admin_cancel_approved_leave', {
    p_request_id: requestId,
    p_admin_note: note.trim(),
  })

  if (error) {
    return { success: false, error: translateRpcError(error.message) }
  }
  return { success: true, error: null }
}

export async function adminDeleteClosedLeave(requestId: string): Promise<{ success: boolean; error: string | null }> {
  const user = loadUser()
  if (!user) return { success: false, error: 'Sessione scaduta. Effettua nuovamente il login.' }
  if (!requestId) return { success: false, error: 'ID richiesta mancante.' }

  const { error } = await supabase.rpc('admin_delete_closed_leave', {
    p_request_id: requestId,
  })

  if (error) {
    return { success: false, error: translateRpcError(error.message) }
  }
  return { success: true, error: null }
}

// ─── Error translation ───────────────────────────────────────

function translateRpcError(raw: string): string {
  if (raw.includes('AUTH_REQUIRED')) return 'Sessione scaduta. Effettua nuovamente il login.'
  if (raw.includes('NOT_FOUND')) return 'Richiesta non trovata.'
  if (raw.includes('NOT_OWNER')) return 'Non puoi modificare una richiesta di un altro utente.'
  if (raw.includes('WRONG_STATUS')) return 'Lo stato della richiesta non consente questa operazione.'
  if (raw.includes('INVALID_DATES')) return 'Le date inserite non sono valide.'
  if (raw.includes('INVALID_TIMES')) return 'Gli orari inseriti non sono validi.'
  if (raw.includes('OVERLAP')) return 'Esiste già una richiesta per le stesse date.'
  if (raw.includes('ROLE_NOT_ALLOWED')) return 'Non hai i permessi per questa operazione.'
  if (raw.includes('INVALID_DECISION')) return 'Decisione non valida.'
  if (raw.includes('CHANGE_NOT_PENDING')) return 'Questa modifica è già stata gestita.'
  if (raw.includes('REQUEST_NOT_APPROVED')) return 'La richiesta originale non è più approvata.'
  if (raw.includes('NOTE_REQUIRED')) return 'La nota di motivazione è obbligatoria (almeno 5 caratteri).'
  if (raw.includes('INVALID_CHANGE_TYPE')) return 'Tipo di modifica non valido.'
  if (raw.includes('REASON_TOO_SHORT')) return 'La motivazione deve contenere almeno 5 caratteri.'
  if (raw.includes('PENDING_CHANGE_EXISTS')) return 'Esiste già una richiesta di modifica in attesa.'
  if (raw.includes('DELETION_NOT_ALLOWED')) return 'Impossibile eliminare una richiesta attiva.'
  if (raw.includes('REQUEST_NOT_CLOSED')) return 'Solo le richieste chiuse possono essere eliminate.'
  if (raw.includes('overlap') || raw.includes('sovrapposizione')) return 'Esiste già una richiesta per le stesse date.'
  if (raw.includes('permission') || raw.includes('autorizzat')) return 'Non hai i permessi per questa operazione.'
  if (raw.includes('not found') || raw.includes('non trovata')) return 'Richiesta non trovata.'
  if (raw.includes('already') || raw.includes('gia')) return 'Questa richiesta è già stata gestita.'
  if (raw.includes('invalid') || raw.includes('non valido')) return 'I dati inseriti non sono validi.'
  return 'Si è verificato un errore. Riprova tra qualche istante.'
}
