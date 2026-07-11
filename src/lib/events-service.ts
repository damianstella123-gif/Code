import { supabase } from './supabase'
import { addDaysISO, diffDaysISO } from './format'
import { logError } from './error-log'
import { getCached, setCache, invalidateCache } from './cache'
import type { Event } from '@/data/events'

interface EventRow {
  id: string
  title: string
  description: string
  client: string
  client_id: string | null
  location: string
  start_date: string
  end_date: string
  status: Event['stato']
  budget: number | string
  ricavo_cliente: number | null
  fee_agenzia_pct: number | null
  margine_target: number | null
  attendees: number
  project_manager_id: string
  team_member_ids: string[]
  created_at: string
  updated_at: string
}

function rowToEvent(r: EventRow): Event {
  return {
    id: r.id,
    nome: r.title,
    descrizione: r.description ?? '',
    cliente: r.client ?? '',
    clientId: r.client_id ?? null,
    dataInizio: r.start_date,
    dataFine: r.end_date,
    location: r.location ?? '',
    budget: typeof r.budget === 'string' ? Number(r.budget) : r.budget,
    ricavo_cliente: r.ricavo_cliente ?? null,
    fee_agenzia_pct: r.fee_agenzia_pct ?? 6,
    margine_target: r.margine_target ?? 25,
    stato: r.status,
    partecipanti: r.attendees ?? 0,
    responsabile: r.project_manager_id ?? '',
    team: r.team_member_ids ?? [],
  }
}

function eventToRow(e: Event): Omit<EventRow, 'created_at' | 'updated_at'> {
  return {
    id: e.id,
    title: e.nome,
    description: e.descrizione ?? '',
    client: e.cliente ?? '',
    client_id: e.clientId ?? null,
    location: e.location ?? '',
    start_date: e.dataInizio,
    end_date: e.dataFine,
    status: e.stato,
    budget: e.budget,
    ricavo_cliente: e.ricavo_cliente ?? null,
    fee_agenzia_pct: e.fee_agenzia_pct ?? 6,
    margine_target: e.margine_target ?? 25,
    attendees: e.partecipanti ?? 0,
    project_manager_id: e.responsabile ?? '',
    team_member_ids: e.team ?? [],
  }
}

export async function fetchEvents(): Promise<Event[]> {
  const cached = getCached<Event[]>('events_list')
  if (cached) return cached
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    logError('events-service', 'fetchEvents', error)
    throw new Error(error.message)
  }
  const result = ((data ?? []) as EventRow[]).map(rowToEvent)
  setCache('events_list', result)
  return result
}

export async function createEvent(event: Event): Promise<Event | null> {
  const row = eventToRow(event)
  const { data, error } = await supabase
    .from('events')
    .insert(row)
    .select()
    .maybeSingle()
  if (error) {
    logError('events-service', 'createEvent', error)
    throw new Error(error.message)
  }
  invalidateCache('events_list')
  return data ? rowToEvent(data as EventRow) : null
}

export async function upsertEvent(event: Event): Promise<Event | null> {
  const row = eventToRow(event)
  const { data, error } = await supabase
    .from('events')
    .upsert(row, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    logError('events-service', 'upsertEvent', error)
    throw new Error(error.message)
  }
  invalidateCache('events_list')
  return data ? rowToEvent(data as EventRow) : null
}

export async function updateEvent(id: string, patch: Partial<Event>): Promise<Event | null> {
  const dbPatch: Partial<EventRow> = {}
  if (patch.nome !== undefined) dbPatch.title = patch.nome
  if (patch.descrizione !== undefined) dbPatch.description = patch.descrizione
  if (patch.cliente !== undefined) dbPatch.client = patch.cliente
  if (patch.location !== undefined) dbPatch.location = patch.location
  if (patch.dataInizio !== undefined) dbPatch.start_date = patch.dataInizio
  if (patch.dataFine !== undefined) dbPatch.end_date = patch.dataFine
  if (patch.stato !== undefined) dbPatch.status = patch.stato
  if (patch.budget !== undefined) dbPatch.budget = patch.budget
  if (patch.ricavo_cliente !== undefined) dbPatch.ricavo_cliente = patch.ricavo_cliente
  if (patch.fee_agenzia_pct !== undefined) dbPatch.fee_agenzia_pct = patch.fee_agenzia_pct
  if (patch.margine_target !== undefined) dbPatch.margine_target = patch.margine_target
  if (patch.partecipanti !== undefined) dbPatch.attendees = patch.partecipanti
  if (patch.responsabile !== undefined) dbPatch.project_manager_id = patch.responsabile
  if (patch.team !== undefined) dbPatch.team_member_ids = patch.team

  const { data, error } = await supabase
    .from('events')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    logError('events-service', 'updateEvent', error)
    throw new Error(error.message)
  }
  invalidateCache('events_list')
  return data ? rowToEvent(data as EventRow) : null
}

export async function deleteEvent(id: string): Promise<boolean> {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) {
    logError('events-service', 'deleteEvent', error)
    throw new Error(error.message)
  }
  invalidateCache('events_list')
  return true
}

export async function fetchEventsByClientName(clientName: string): Promise<Event[]> {
  const { data: clientRows } = await supabase
    .from('clients')
    .select('id')
    .ilike('name', clientName)
  if (!clientRows || clientRows.length === 0) return []

  const ids = clientRows.map(r => r.id)

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .or(`client.in.(${ids.join(',')}),client_id.in.(${ids.join(',')})`)
    .order('start_date', { ascending: false })
    .limit(50)
  if (error) {
    logError('events-service', 'fetchEventsByClientName', error)
    throw new Error(error.message)
  }
  return ((data ?? []) as EventRow[]).map(rowToEvent)
}

export interface ShiftResult {
  shifted: string[]
  skipped: string[]
}

export async function shiftEventTimeline(eventId: string, deltaDays: number): Promise<ShiftResult> {
  if (deltaDays === 0) return { shifted: [], skipped: [] }

  const shifted: string[] = []
  const skipped: string[] = []

  const shiftDate = (d: string): string => addDaysISO(d, deltaDays)

  async function shiftTable(table: string, dateColumns: string[]): Promise<boolean> {
    const { data: rows, error: fetchErr } = await supabase
      .from(table)
      .select('*')
      .eq('event_id', eventId)
    if (fetchErr) { console.warn(`shiftEventTimeline fetch ${table}:`, fetchErr.message); return false }
    if (!rows || rows.length === 0) return true

    for (const row of rows) {
      const r = row as Record<string, unknown>
      const patch: Record<string, string | null> = {}
      for (const col of dateColumns) {
        const val = r[col]
        if (val && typeof val === 'string') {
          patch[col] = shiftDate(val)
        }
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from(table).update(patch).eq('id', r.id as string)
        if (error) { console.warn(`shiftEventTimeline update ${table}:`, error.message); return false }
      }
    }
    return true
  }

  const tableTasks: { table: string; columns: string[] }[] = [
    { table: 'event_program', columns: ['data'] },
    { table: 'event_supplier_services', columns: ['data'] },
    { table: 'event_hotel_details', columns: ['data', 'check_in_date', 'check_out_date'] },
    { table: 'event_restaurant_details', columns: ['data'] },
    { table: 'event_experience_details', columns: ['data'] },
    { table: 'event_catering_details', columns: ['data'] },
    { table: 'event_staff_esterno_details', columns: ['data'] },
    { table: 'event_staff_interno_details', columns: ['data'] },
    { table: 'event_audio_video_details', columns: ['data_montaggio', 'data_prove', 'data_evento', 'data_smontaggio'] },
    { table: 'event_allestimenti_details', columns: ['data_montaggio', 'data_smontaggio'] },
    { table: 'event_grafica_stampa_details', columns: ['data_consegna'] },
    { table: 'event_varie_details', columns: ['data'] },
  ]

  const results = await Promise.all(
    tableTasks.map(async t => {
      const ok = await shiftTable(t.table, t.columns)
      return { table: t.table, ok }
    })
  )

  for (const r of results) {
    if (r.ok) shifted.push(r.table)
    else skipped.push(r.table)
  }

  return { shifted, skipped }
}

export async function moveEventWithTimelineShift(eventId: string, newStartDate: string): Promise<{ event: Event | null; shift: ShiftResult }> {
  const { data: row } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle()
  if (!row) return { event: null, shift: { shifted: [], skipped: [] } }
  const oldStart = (row as EventRow).start_date
  const oldEnd = (row as EventRow).end_date
  const deltaDays = diffDaysISO(newStartDate, oldStart)
  if (deltaDays === 0) return { event: rowToEvent(row as EventRow), shift: { shifted: [], skipped: [] } }
  const newEnd = addDaysISO(oldEnd, deltaDays)
  const event = await updateEvent(eventId, { dataInizio: newStartDate, dataFine: newEnd })
  const shift = await shiftEventTimeline(eventId, deltaDays)
  return { event, shift }
}

export async function resizeEventOnly(eventId: string, newStartDate: string, newEndDate: string): Promise<Event | null> {
  return await updateEvent(eventId, { dataInizio: newStartDate, dataFine: newEndDate })
}