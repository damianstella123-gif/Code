import { supabase } from '@/lib/supabase'

export type OnsiteProgramStatus =
  | 'planned'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'delayed'
  | 'cancelled'

export type OnsiteIncidentStatus = 'open' | 'in_progress' | 'resolved'

export type OnsiteIncidentCategory =
  | 'logistica'
  | 'fornitore'
  | 'partecipante'
  | 'sicurezza'
  | 'tecnica'
  | 'altro'

export type OnsiteIncidentSeverity = 'info' | 'warning' | 'critical'

export interface EventProgramRow {
  id: string
  event_id: string
  titolo: string
  categoria: string
  data: string
  ora_inizio: string
  ora_fine: string | null
  luogo: string
  note: string
  created_at: string
  supplier_id: string | null
  pax: number | null
  servizio: string
  data_fine: string | null
  sort_order: number | null
}

export interface OnsiteProgramStatusRow {
  id: string
  event_id: string
  program_item_id: string
  onsite_status: OnsiteProgramStatus
  actual_start: string | null
  actual_end: string | null
  delay_minutes: number
  onsite_note: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface OnsiteIncidentRow {
  id: string
  event_id: string
  title: string
  description: string
  category: OnsiteIncidentCategory
  severity: OnsiteIncidentSeverity
  incident_status: OnsiteIncidentStatus
  location: string
  assigned_to: string | null
  reported_by: string
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type MergedProgramItem = EventProgramRow & {
  onsite_status: OnsiteProgramStatus
  actual_start: string | null
  actual_end: string | null
  delay_minutes: number
  onsite_note: string
  status_id: string | null
  status_updated_by: string | null
}

async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Autenticazione richiesta.')
  return user
}

export async function fetchOnsiteProgram(eventId: string): Promise<MergedProgramItem[]> {
  const { data: program, error: progErr } = await supabase
    .from('event_program')
    .select('*')
    .eq('event_id', eventId)
    .order('data', { ascending: true })
    .order('ora_inizio', { ascending: true })
    .order('sort_order', { ascending: true })

  if (progErr) throw progErr
  if (!program || program.length === 0) return []

  const { data: statuses, error: statusErr } = await supabase
    .from('onsite_program_status')
    .select('*')
    .eq('event_id', eventId)

  if (statusErr) throw statusErr

  const statusMap = new Map<string, OnsiteProgramStatusRow>()
  for (const s of statuses ?? []) {
    statusMap.set(s.program_item_id, s as OnsiteProgramStatusRow)
  }

  return (program as EventProgramRow[]).map((item) => {
    const status = statusMap.get(item.id)
    return {
      ...item,
      onsite_status: status?.onsite_status ?? 'planned',
      actual_start: status?.actual_start ?? null,
      actual_end: status?.actual_end ?? null,
      delay_minutes: status?.delay_minutes ?? 0,
      onsite_note: status?.onsite_note ?? '',
      status_id: status?.id ?? null,
      status_updated_by: status?.updated_by ?? null,
    }
  })
}

export async function saveOnsiteProgramStatus(
  eventId: string,
  programItemId: string,
  patch: Partial<Pick<OnsiteProgramStatusRow, 'onsite_status' | 'actual_start' | 'actual_end' | 'delay_minutes' | 'onsite_note'>>
): Promise<OnsiteProgramStatusRow> {
  const user = await getUser()

  const { data, error } = await supabase
    .from('onsite_program_status')
    .upsert(
      {
        event_id: eventId,
        program_item_id: programItemId,
        updated_by: user.id,
        ...patch,
      },
      { onConflict: 'program_item_id' }
    )
    .select('*')
    .single()

  if (error) throw error
  return data as OnsiteProgramStatusRow
}

export async function fetchOnsiteIncidents(eventId: string): Promise<OnsiteIncidentRow[]> {
  const { data, error } = await supabase
    .from('onsite_incidents')
    .select('*')
    .eq('event_id', eventId)
    .order('incident_status', { ascending: true })
    .order('severity', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  const severityRank: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  const statusRank: Record<string, number> = { open: 0, in_progress: 1, resolved: 2 }

  const rows = (data ?? []) as OnsiteIncidentRow[]
  rows.sort((a, b) => {
    const sa = statusRank[a.incident_status] ?? 9
    const sb = statusRank[b.incident_status] ?? 9
    if (sa !== sb) return sa - sb
    const sevA = severityRank[a.severity] ?? 9
    const sevB = severityRank[b.severity] ?? 9
    if (sevA !== sevB) return sevA - sevB
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return rows
}

export async function createOnsiteIncident(
  eventId: string,
  input: { title: string; description?: string; category?: OnsiteIncidentCategory; severity?: OnsiteIncidentSeverity; location?: string; assigned_to?: string | null }
): Promise<OnsiteIncidentRow> {
  const user = await getUser()

  const { data, error } = await supabase
    .from('onsite_incidents')
    .insert({
      event_id: eventId,
      title: input.title,
      description: input.description ?? '',
      category: input.category ?? 'altro',
      severity: input.severity ?? 'info',
      location: input.location ?? '',
      assigned_to: input.assigned_to ?? null,
      reported_by: user.id,
      incident_status: 'open',
      resolved_at: null,
      resolved_by: null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as OnsiteIncidentRow
}

export interface OnsiteIncidentEditablePatch {
  title?: string
  description?: string
  category?: OnsiteIncidentCategory
  severity?: OnsiteIncidentSeverity
  location?: string
  assigned_to?: string | null
}

export async function updateOnsiteIncident(
  id: string,
  patch: OnsiteIncidentEditablePatch
): Promise<OnsiteIncidentRow> {
  const { data, error } = await supabase
    .from('onsite_incidents')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as OnsiteIncidentRow
}

export async function transitionOnsiteIncident(
  id: string,
  targetStatus: OnsiteIncidentStatus
): Promise<OnsiteIncidentRow> {
  const user = await getUser()

  const updates: Record<string, unknown> = { incident_status: targetStatus }

  if (targetStatus === 'resolved') {
    updates.resolved_at = new Date().toISOString()
    updates.resolved_by = user.id
  } else {
    updates.resolved_at = null
    updates.resolved_by = null
  }

  const { data, error } = await supabase
    .from('onsite_incidents')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as OnsiteIncidentRow
}
