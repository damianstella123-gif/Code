import { supabase } from './supabase'
import { logError } from './error-log'

export interface EventPayment {
  id: string
  event_id: string
  tipo: 'incasso_cliente' | 'pagamento_fornitore'
  descrizione: string
  importo: number
  data_scadenza: string
  data_pagamento: string | null
  supplier_id: string | null
  stato: 'atteso' | 'pagato' | 'in_ritardo'
  note: string | null
  created_by: string | null
  created_at: string
}

export interface PaymentInsert {
  event_id: string
  tipo: 'incasso_cliente' | 'pagamento_fornitore'
  descrizione: string
  importo: number
  data_scadenza: string
  data_pagamento?: string | null
  supplier_id?: string | null
  stato?: 'atteso' | 'pagato' | 'in_ritardo'
  note?: string | null
  created_by?: string | null
  stato_approvazione?: 'autonomo' | 'in_attesa' | 'approvato' | 'bloccato'
}

function num(x: number | string | null | undefined): number {
  if (x === null || x === undefined) return 0
  return typeof x === 'string' ? Number(x) : x
}

function rowToPayment(r: any): EventPayment {
  return {
    id: r.id,
    event_id: r.event_id,
    tipo: r.tipo,
    descrizione: r.descrizione,
    importo: num(r.importo),
    data_scadenza: r.data_scadenza,
    data_pagamento: r.data_pagamento,
    supplier_id: r.supplier_id,
    stato: r.stato,
    note: r.note,
    created_by: r.created_by,
    created_at: r.created_at,
  }
}

export async function fetchEventPayments(eventId: string): Promise<EventPayment[]> {
  const { data, error } = await supabase
    .from('event_payments')
    .select('*')
    .eq('event_id', eventId)
    .order('data_scadenza', { ascending: true })
  if (error) { logError('event-payments', 'fetchEventPayments', error); return [] }
  return (data ?? []).map(rowToPayment)
}

export async function insertPayment(p: PaymentInsert): Promise<EventPayment | null> {
  const { data, error } = await supabase
    .from('event_payments')
    .insert(p)
    .select()
    .maybeSingle()
  if (error) { logError('event-payments', 'insertPayment', error); return null }
  return data ? rowToPayment(data) : null
}

export async function markAsPaid(id: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('event_payments')
    .update({ data_pagamento: today, stato: 'pagato' })
    .eq('id', id)
  if (error) { logError('event-payments', 'markAsPaid', error); return false }
  return true
}

export async function deletePayment(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('event_payments')
    .delete()
    .eq('id', id)
  if (error) { logError('event-payments', 'deletePayment', error); return false }
  return true
}

export async function updatePayment(id: string, fields: Partial<PaymentInsert>): Promise<boolean> {
  const { error } = await supabase
    .from('event_payments')
    .update(fields)
    .eq('id', id)
  if (error) { logError('event-payments', 'updatePayment', error); return false }
  return true
}

export async function fetchAllPendingPayments(daysAhead: number = 7): Promise<EventPayment[]> {
  const limit = new Date()
  limit.setDate(limit.getDate() + daysAhead)
  const limitISO = limit.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('event_payments')
    .select('*')
    .is('data_pagamento', null)
    .lte('data_scadenza', limitISO)
    .order('data_scadenza', { ascending: true })
  if (error) { logError('event-payments', 'fetchAllPendingPayments', error); return [] }
  return (data ?? []).map(rowToPayment)
}
