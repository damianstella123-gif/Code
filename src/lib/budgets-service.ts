import { supabase } from './supabase'
import { logError } from './error-log'
import type {
  Uscita,
  StatoPagamento,
  MetodoPagamento,
} from '@/data/amministrazione'

interface BudgetRow {
  id: string
  event_id: string | null
  item: string
  category: string
  estimated_cost: number | string
  actual_cost: number | string
  quantity: number | string
  unit_price: number | string | null
  status: StatoPagamento
  supplier_id: string | null
  due_date: string
  payment_date: string | null
  payment_method: MetodoPagamento
  invoice_id: string | null
  notes: string
  created_at: string
  updated_at: string
}

function num(x: number | string | null | undefined): number {
  if (x === null || x === undefined) return 0
  return typeof x === 'string' ? Number(x) : x
}

function rowToUscita(r: BudgetRow): Uscita {
  return {
    id: r.id,
    fornitoreId: r.supplier_id ?? '',
    eventoId: r.event_id,
    categoria: r.category ?? '',
    importo: num(r.actual_cost) || num(r.estimated_cost),
    quantity: num(r.quantity) || 1,
    unitPrice: r.unit_price !== null && r.unit_price !== undefined ? num(r.unit_price) : null,
    stato: r.status,
    scadenza: r.due_date,
    dataPagamento: r.payment_date,
    note: r.notes ?? r.item ?? '',
    fatturaId: r.invoice_id,
  }
}

function uscitaToRow(u: Uscita): Omit<BudgetRow, 'created_at' | 'updated_at'> {
  const item = u.note && u.note.length > 0 ? u.note : u.categoria
  return {
    id: u.id,
    event_id: u.eventoId && u.eventoId.length > 0 ? u.eventoId : null,
    item,
    category: u.categoria ?? '',
    estimated_cost: u.importo ?? 0,
    actual_cost: u.importo ?? 0,
    quantity: u.quantity ?? 1,
    unit_price: u.unitPrice,
    status: u.stato,
    supplier_id: u.fornitoreId && u.fornitoreId.length > 0 ? u.fornitoreId : null,
    due_date: u.scadenza,
    payment_date: u.dataPagamento,
    payment_method: 'bonifico',
    invoice_id: u.fatturaId,
    notes: u.note ?? '',
  }
}

export async function fetchBudgets(): Promise<Uscita[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .order('due_date', { ascending: true })
    .limit(1000)
  if (error) {
    logError('budgets-service', 'fetchBudgets', error)
    throw new Error(error.message)
  }
  return ((data ?? []) as BudgetRow[]).map(rowToUscita)
}

export async function upsertBudget(uscita: Uscita): Promise<Uscita | null> {
  const { data, error } = await supabase
    .from('budgets')
    .upsert(uscitaToRow(uscita), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    logError('budgets-service', 'upsertBudget', error)
    throw new Error(error.message)
  }
  return data ? rowToUscita(data as BudgetRow) : null
}

export async function updateBudget(id: string, patch: Partial<Uscita>): Promise<Uscita | null> {
  const dbPatch: Partial<BudgetRow> = {}
  if (patch.fornitoreId !== undefined) dbPatch.supplier_id = patch.fornitoreId && patch.fornitoreId.length > 0 ? patch.fornitoreId : null
  if (patch.eventoId !== undefined) dbPatch.event_id = patch.eventoId && patch.eventoId.length > 0 ? patch.eventoId : null
  if (patch.categoria !== undefined) dbPatch.category = patch.categoria
  if (patch.importo !== undefined) {
    dbPatch.estimated_cost = patch.importo
    dbPatch.actual_cost = patch.importo
  }
  if (patch.quantity !== undefined) dbPatch.quantity = patch.quantity
  if (patch.unitPrice !== undefined) dbPatch.unit_price = patch.unitPrice
  if (patch.stato !== undefined) dbPatch.status = patch.stato
  if (patch.scadenza !== undefined) dbPatch.due_date = patch.scadenza
  if (patch.dataPagamento !== undefined) dbPatch.payment_date = patch.dataPagamento
  if (patch.note !== undefined) {
    dbPatch.notes = patch.note
    dbPatch.item = patch.note
  }
  if (patch.fatturaId !== undefined) dbPatch.invoice_id = patch.fatturaId

  const { data, error } = await supabase
    .from('budgets')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    logError('budgets-service', 'updateBudget', error)
    throw new Error(error.message)
  }
  return data ? rowToUscita(data as BudgetRow) : null
}

export async function deleteBudget(id: string): Promise<boolean> {
  const { error } = await supabase.from('budgets').delete().eq('id', id)
  if (error) {
    logError('budgets-service', 'deleteBudget', error)
    throw new Error(error.message)
  }
  return true
}
