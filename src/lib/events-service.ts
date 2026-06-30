import { supabase } from './supabase'
import type { Event } from '@/data/events'

interface EventRow {
  id: string
  title: string
  description: string
  client: string
  location: string
  start_date: string
  end_date: string
  status: Event['stato']
  budget: number | string
  ricavo_cliente: number | null
  fee_agenzia_pct: number | null
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
    dataInizio: r.start_date,
    dataFine: r.end_date,
    location: r.location ?? '',
    budget: typeof r.budget === 'string' ? Number(r.budget) : r.budget,
    ricavo_cliente: r.ricavo_cliente ?? null,
    fee_agenzia_pct: r.fee_agenzia_pct ?? 6,
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
    location: e.location ?? '',
    start_date: e.dataInizio,
    end_date: e.dataFine,
    status: e.stato,
    budget: e.budget,
    ricavo_cliente: e.ricavo_cliente ?? null,
    fee_agenzia_pct: e.fee_agenzia_pct ?? 6,
    attendees: e.partecipanti ?? 0,
    project_manager_id: e.responsabile ?? '',
    team_member_ids: e.team ?? [],
  }
}

export async function fetchEvents(): Promise<Event[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    console.error('fetchEvents error:', error.message)
    return []
  }
  return ((data ?? []) as EventRow[]).map(rowToEvent)
}

export async function createEvent(event: Event): Promise<Event | null> {
  const row = eventToRow(event)
  const { data, error } = await supabase
    .from('events')
    .insert(row)
    .select()
    .maybeSingle()
  if (error) {
    console.error('createEvent error:', error.message)
    return null
  }
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
    console.error('upsertEvent error:', error.message)
    return null
  }
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
    console.error('updateEvent error:', error.message)
    return null
  }
  return data ? rowToEvent(data as EventRow) : null
}

export async function deleteEvent(id: string): Promise<boolean> {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) {
    console.error('deleteEvent error:', error.message)
    return false
  }
  return true
}
