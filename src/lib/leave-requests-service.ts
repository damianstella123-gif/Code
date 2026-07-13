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

function calcDays(d1: string, d2: string): number {
  return Math.max(1, Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000) + 1)
}

export async function createLeaveRequest(params: {
  tipo: 'ferie' | 'permesso' | 'malattia' | 'recupero'
  dataInizio: string
  dataFine: string
  oraInizio?: string
  oraFine?: string
  motivo?: string
}): Promise<LeaveRequest | null> {
  const user = loadUser()
  if (!user) return null

  const giorni = calcDays(params.dataInizio, params.dataFine)

  const { data, error } = await supabase.from('leave_requests')
    .insert({
      user_id: user.id,
      tipo: params.tipo,
      data_inizio: params.dataInizio,
      data_fine: params.dataFine,
      ora_inizio: params.tipo === 'permesso' && params.oraInizio ? params.oraInizio : null,
      ora_fine: params.tipo === 'permesso' && params.oraFine ? params.oraFine : null,
      giorni_richiesti: giorni,
      motivo: params.motivo || null,
    })
    .select()
    .maybeSingle()

  if (error) {
    console.error('createLeaveRequest:', error.message)
    return null
  }

  if (data) {
    await notifyAdminsNewRequest(data as LeaveRequest, user.nome || `${user.first_name} ${user.last_name}`)
  }

  return data as LeaveRequest | null
}

async function notifyAdminsNewRequest(request: LeaveRequest, userName: string): Promise<void> {
  const { data: admins } = await supabase.from('profiles')
    .select('id')
    .in('role', ['Admin', 'Super Admin', 'Amministrazione'])

  if (!admins?.length) return

  const days = request.giorni_richiesti || calcDays(request.data_inizio, request.data_fine)
  const notifications = admins.map(a => ({
    user_id: a.id,
    is_read: false,
    title: `Nuova richiesta ${request.tipo}`,
    message: `${userName} ha richiesto ${request.tipo} dal ${request.data_inizio} al ${request.data_fine} (${days} giorni)`,
    type: 'leave_request_new',
    related_entity_type: 'leave_request',
    related_entity_id: request.id,
  }))

  await supabase.from('notifications').insert(notifications)
}

export async function approveLeaveRequest(requestId: string): Promise<boolean> {
  const user = loadUser()
  if (!user) return false

  const { data: request } = await supabase.from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  if (!request) return false

  const { error } = await supabase.from('leave_requests')
    .update({
      stato: 'approvata',
      approvato_da: user.id,
      approvato_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  if (error) return false

  await supabase.from('notifications').insert({
    user_id: request.user_id,
    is_read: false,
    title: `${request.tipo.charAt(0).toUpperCase() + request.tipo.slice(1)} approvate`,
    message: `La tua richiesta di ${request.tipo} dal ${request.data_inizio} al ${request.data_fine} e stata approvata!`,
    type: 'leave_approved',
    related_entity_type: 'leave_request',
    related_entity_id: requestId,
  })

  return true
}

export async function rejectLeaveRequest(requestId: string, noteAdmin: string): Promise<boolean> {
  const user = loadUser()
  if (!user) return false

  const { data: request } = await supabase.from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  if (!request) return false

  const { error } = await supabase.from('leave_requests')
    .update({
      stato: 'negata',
      approvato_da: user.id,
      approvato_at: new Date().toISOString(),
      note_admin: noteAdmin,
    })
    .eq('id', requestId)

  if (error) return false

  await supabase.from('notifications').insert({
    user_id: request.user_id,
    is_read: false,
    title: 'Richiesta ferie negata',
    message: `La tua richiesta di ${request.tipo} e stata negata. Motivazione: ${noteAdmin}`,
    type: 'leave_denied',
    related_entity_type: 'leave_request',
    related_entity_id: requestId,
  })

  return true
}

export async function cancelLeaveRequest(requestId: string): Promise<boolean> {
  const user = loadUser()
  if (!user) return false

  const { data: request } = await supabase.from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  if (!request) return false

  const { error } = await supabase.from('leave_requests')
    .update({ stato: 'annullata' })
    .eq('id', requestId)

  if (error) return false

  const { data: admins } = await supabase.from('profiles')
    .select('id')
    .in('role', ['Admin', 'Super Admin', 'Amministrazione'])

  if (admins?.length) {
    const userName = user.nome || `${user.first_name} ${user.last_name}`
    await supabase.from('notifications').insert(
      admins.map(a => ({
        user_id: a.id,
        is_read: false,
        title: 'Richiesta annullata',
        message: `${userName} ha annullato la richiesta di ${request.tipo} dal ${request.data_inizio}`,
        type: 'leave_cancelled',
        related_entity_type: 'leave_request',
        related_entity_id: requestId,
      }))
    )
  }

  return true
}

export async function getPendingLeaveRequests(): Promise<LeaveRequest[]> {
  const { data } = await supabase.from('leave_requests')
    .select('*, profiles(first_name, last_name, avatar_url, role)')
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
    .select('*, profiles(first_name, last_name, avatar_url, role)')
    .order('created_at', { ascending: false })

  return (data ?? []) as LeaveRequest[]
}
