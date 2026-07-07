import { supabase } from './supabase'
import { logError } from './error-log'
import type {
  Pratica,
  CategoriaPratica,
  PrioritaPratica,
  StatoPratica,
} from '@/data/pratiche'

interface PracticeRow {
  id: string
  event_id: string | null
  task_id: string | null
  title: string
  description: string
  category: CategoriaPratica
  responsible: string
  priority: PrioritaPratica
  status: StatoPratica
  due_date: string
  notes: string
  amount: number | string | null
  counterparty: string
  created_at: string
  updated_at: string
}

function rowToPratica(r: PracticeRow): Pratica {
  return {
    id: r.id,
    titolo: r.title,
    descrizione: r.description ?? '',
    eventoId: r.event_id,
    responsabileId: r.responsible ?? '',
    categoria: r.category,
    stato: r.status,
    priorita: r.priority,
    creatoIl: r.created_at?.slice(0, 10) ?? '',
    scadenza: r.due_date,
    note: r.notes ?? '',
    importo: r.amount === null || r.amount === undefined
      ? null
      : typeof r.amount === 'string' ? Number(r.amount) : r.amount,
    controparte: r.counterparty ?? '',
    task_id: r.task_id ?? null,
  }
}

function praticaToRow(p: Pratica): Omit<PracticeRow, 'updated_at'> {
  return {
    id: p.id,
    event_id: p.eventoId && p.eventoId.length > 0 ? p.eventoId : null,
    task_id: p.task_id || null,
    title: p.titolo,
    description: p.descrizione ?? '',
    category: p.categoria,
    responsible: p.responsabileId ?? '',
    priority: p.priorita,
    status: p.stato,
    due_date: p.scadenza,
    notes: p.note ?? '',
    amount: p.importo,
    counterparty: p.controparte ?? '',
    created_at: p.creatoIl ? new Date(p.creatoIl).toISOString() : new Date().toISOString(),
  }
}

export async function fetchPractices(): Promise<Pratica[]> {
  const { data, error } = await supabase
    .from('practices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    logError('practices-service', 'fetchPractices', error)
    throw new Error(error.message)
  }
  return ((data ?? []) as PracticeRow[]).map(rowToPratica)
}

export async function upsertPractice(pratica: Pratica): Promise<Pratica | null> {
  const { data, error } = await supabase
    .from('practices')
    .upsert(praticaToRow(pratica), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    logError('practices-service', 'upsertPractice', error)
    throw new Error(error.message)
  }
  return data ? rowToPratica(data as PracticeRow) : null
}

export async function updatePractice(id: string, patch: Partial<Pratica>): Promise<Pratica | null> {
  const dbPatch: Partial<PracticeRow> = {}
  if (patch.titolo !== undefined) dbPatch.title = patch.titolo
  if (patch.descrizione !== undefined) dbPatch.description = patch.descrizione
  if (patch.eventoId !== undefined) dbPatch.event_id = patch.eventoId && patch.eventoId.length > 0 ? patch.eventoId : null
  if (patch.responsabileId !== undefined) dbPatch.responsible = patch.responsabileId
  if (patch.categoria !== undefined) dbPatch.category = patch.categoria
  if (patch.stato !== undefined) dbPatch.status = patch.stato
  if (patch.priorita !== undefined) dbPatch.priority = patch.priorita
  if (patch.scadenza !== undefined) dbPatch.due_date = patch.scadenza
  if (patch.note !== undefined) dbPatch.notes = patch.note
  if (patch.importo !== undefined) dbPatch.amount = patch.importo
  if (patch.controparte !== undefined) dbPatch.counterparty = patch.controparte

  const { data, error } = await supabase
    .from('practices')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    logError('practices-service', 'updatePractice', error)
    throw new Error(error.message)
  }
  return data ? rowToPratica(data as PracticeRow) : null
}

export async function changePracticeStatus(id: string, status: StatoPratica): Promise<Pratica | null> {
  return updatePractice(id, { stato: status })
}

export async function deletePractice(id: string): Promise<boolean> {
  const { error } = await supabase.from('practices').delete().eq('id', id)
  if (error) {
    logError('practices-service', 'deletePractice', error)
    throw new Error(error.message)
  }
  return true
}
