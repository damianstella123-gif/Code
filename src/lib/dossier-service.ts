import { supabase } from './supabase'
import { logError } from './error-log'
import type {
  Pratica,
  CategoriaPratica,
  PrioritaPratica,
  StatoPratica,
} from '@/data/pratiche'

interface DossierRow {
  id: string
  event_id: string | null
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

function rowToDossier(r: DossierRow): Pratica {
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
  }
}

function dossierToRow(p: Pratica): Omit<DossierRow, 'updated_at'> {
  return {
    id: p.id,
    event_id: p.eventoId && p.eventoId.length > 0 ? p.eventoId : null,
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

export async function fetchDossiers(): Promise<Pratica[]> {
  const { data, error } = await supabase
    .from('dossiers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    logError('dossier-service', 'fetchDossiers', error)
    throw new Error(error.message)
  }
  return ((data ?? []) as DossierRow[]).map(rowToDossier)
}

export async function upsertDossier(pratica: Pratica): Promise<Pratica | null> {
  const { data, error } = await supabase
    .from('dossiers')
    .upsert(dossierToRow(pratica), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    logError('dossier-service', 'upsertDossier', error)
    throw new Error(error.message)
  }
  return data ? rowToDossier(data as DossierRow) : null
}

export async function updateDossier(id: string, patch: Partial<Pratica>): Promise<Pratica | null> {
  const dbPatch: Partial<DossierRow> = {}
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
    .from('dossiers')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    logError('dossier-service', 'updateDossier', error)
    throw new Error(error.message)
  }
  return data ? rowToDossier(data as DossierRow) : null
}

export async function changeDossierStatus(id: string, status: StatoPratica): Promise<Pratica | null> {
  return updateDossier(id, { stato: status })
}

export async function deleteDossier(id: string): Promise<boolean> {
  const { error } = await supabase.from('dossiers').delete().eq('id', id)
  if (error) {
    logError('dossier-service', 'deleteDossier', error)
    throw new Error(error.message)
  }
  return true
}

// Keep backward-compatible exports
export { fetchDossiers as fetchPractices }
export { upsertDossier as upsertPractice }
export { deleteDossier as deletePractice }
