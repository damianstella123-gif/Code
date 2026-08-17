import { supabase } from './supabase'
import { logError } from './error-log'
import type { Uscita, StatoPagamento } from '@/data/amministrazione'

export type RequestStatus =
  | 'bozza'
  | 'inviata'
  | 'in_verifica'
  | 'in_attesa_fattura'
  | 'approvata'
  | 'respinta'
  | 'parzialmente_coperta'
  | 'completata'
  | 'annullata'

export interface EventPayment {
  id: string
  event_id: string | null
  tipo: 'incasso_cliente' | 'pagamento_fornitore'
  descrizione: string
  importo: number
  data_scadenza: string
  data_pagamento: string | null
  supplier_id: string | null
  client_id: string | null
  categoria: string | null
  stato: 'atteso' | 'pagato' | 'in_ritardo'
  note: string | null
  created_by: string | null
  created_at: string
  request_status: RequestStatus | null
  submitted_at: string | null
  submitted_by: string | null
  request_note: string | null
  stato_approvazione: string | null
}

export interface PaymentInsert {
  event_id?: string | null
  tipo: 'incasso_cliente' | 'pagamento_fornitore'
  descrizione: string
  importo: number
  data_scadenza: string
  data_pagamento?: string | null
  supplier_id?: string | null
  client_id?: string | null
  categoria?: string | null
  stato?: 'atteso' | 'pagato' | 'in_ritardo'
  note?: string | null
  created_by?: string | null
  stato_approvazione?: 'autonomo' | 'in_attesa' | 'approvato' | 'bloccato'
  request_status?: string | null
  request_note?: string | null
}

export interface BudgetVersion {
  id: string
  event_id: string
  nome: string
  tipo: 'preventivo' | 'consuntivo'
  stato: 'bozza' | 'approvato' | 'rifiutato'
}

export interface BudgetLine {
  id: string
  source_table: string
  description: string
  categoria: string
  costo_totale: number
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
    client_id: r.client_id,
    categoria: r.categoria,
    stato: r.stato,
    note: r.note,
    created_by: r.created_by,
    created_at: r.created_at,
    request_status: r.request_status ?? null,
    submitted_at: r.submitted_at ?? null,
    submitted_by: r.submitted_by ?? null,
    request_note: r.request_note ?? null,
    stato_approvazione: r.stato_approvazione ?? null,
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

function paymentStatoToUscita(stato: string | null): StatoPagamento {
  switch (stato) {
    case 'pagato': return 'pagato'
    case 'in_ritardo': return 'scaduto'
    default: return 'in_attesa'
  }
}

// Per-event supplier-side spend, shaped as Uscita[] so screens that previously
// read the dead `budgets` table can consume live event_payments unchanged.
export async function fetchEventPaymentsSummary(): Promise<Uscita[]> {
  const { data, error } = await supabase
    .from('event_payments')
    .select('id, event_id, supplier_id, categoria, importo, stato, data_scadenza, data_pagamento, note, descrizione')
    .eq('tipo', 'pagamento_fornitore')
    .order('data_scadenza', { ascending: true })
    .limit(2000)
  if (error) {
    logError('event-payments', 'fetchEventPaymentsSummary', error)
    throw new Error(error.message)
  }
  return (data ?? []).map((r: any): Uscita => ({
    id: r.id,
    fornitoreId: r.supplier_id ?? '',
    eventoId: r.event_id,
    categoria: r.categoria ?? '',
    importo: num(r.importo),
    quantity: 1,
    unitPrice: null,
    stato: paymentStatoToUscita(r.stato),
    scadenza: r.data_scadenza,
    dataPagamento: r.data_pagamento,
    note: r.note ?? r.descrizione ?? '',
    fatturaId: null,
  }))
}

export async function fetchAllUscite(): Promise<EventPayment[]> {
  const { data, error } = await supabase
    .from('event_payments')
    .select('*')
    .eq('tipo', 'pagamento_fornitore')
    .order('data_scadenza', { ascending: false })
  if (error) { logError('event-payments', 'fetchAllUscite', error); return [] }
  return (data ?? []).map(rowToPayment)
}

export async function fetchAllEntrate(): Promise<EventPayment[]> {
  const { data, error } = await supabase
    .from('event_payments')
    .select('*')
    .eq('tipo', 'incasso_cliente')
    .order('data_scadenza', { ascending: false })
  if (error) { logError('event-payments', 'fetchAllEntrate', error); return [] }
  return (data ?? []).map(rowToPayment)
}

// --- Budget versions ---

export async function fetchValidBudgetVersions(eventId: string): Promise<BudgetVersion[]> {
  const { data, error } = await supabase
    .from('budget_versions')
    .select('id, event_id, nome, tipo, stato')
    .eq('event_id', eventId)
    .or('and(tipo.eq.preventivo,stato.eq.approvato),and(tipo.eq.consuntivo,stato.eq.bozza)')
    .order('created_at', { ascending: false })
  if (error) { logError('event-payments', 'fetchValidBudgetVersions', error); return [] }
  return (data ?? []) as BudgetVersion[]
}

// --- Budget lines for a supplier in a version ---

const SOURCE_TABLES = [
  { table: 'event_supplier_services', label: 'Servizi', descCol: 'titolo', costCol: 'costo_totale', catCol: 'categoria' },
  { table: 'event_hotel_details', label: 'Hotel', descCol: 'titolo', costCol: 'costo_totale', catCol: null },
  { table: 'event_restaurant_details', label: 'Ristorante', descCol: 'tipologia_servizio', costCol: 'costo_totale_reale', catCol: null },
  { table: 'event_experience_details', label: 'Experience', descCol: 'nome_attivita', costCol: 'costo_totale', catCol: null },
  { table: 'event_catering_details', label: 'Catering', descCol: 'tipologia', costCol: 'costo_totale', catCol: null },
  { table: 'event_staff_interno_details', label: 'Staff Interno', descCol: 'ruolo', costCol: 'costo_totale', catCol: null },
  { table: 'event_staff_esterno_details', label: 'Staff Esterno', descCol: 'ruolo', costCol: 'costo_totale', catCol: null },
  { table: 'event_varie_details', label: 'Varie', descCol: 'descrizione', costCol: 'costo_totale', catCol: 'tipologia' },
  { table: 'event_audio_video_details', label: 'Audio/Video', descCol: 'tipologia_servizio', costCol: 'costo_totale', catCol: null },
  { table: 'event_allestimenti_details', label: 'Allestimenti', descCol: 'descrizione', costCol: 'costo_totale', catCol: null },
  { table: 'event_grafica_stampa_details', label: 'Grafica/Stampa', descCol: 'tipo_materiale', costCol: 'costo_totale', catCol: null },
] as const

export async function fetchBudgetLinesForSupplier(
  eventId: string,
  budgetVersionId: string,
  supplierId: string
): Promise<BudgetLine[]> {
  const results: BudgetLine[] = []

  for (const src of SOURCE_TABLES) {
    const cols = ['id', src.costCol, src.descCol, src.catCol].filter(Boolean).join(', ')
    const { data, error } = await supabase
      .from(src.table)
      .select(cols)
      .eq('event_id', eventId)
      .eq('budget_version_id', budgetVersionId)
      .eq('supplier_id', supplierId)

    if (error) {
      logError('event-payments', `fetchLines:${src.table}`, error)
      continue
    }
    for (const row of data ?? []) {
      const r = row as any
      results.push({
        id: String(r.id),
        source_table: src.table,
        description: r[src.descCol] || src.label,
        categoria: src.catCol ? (r[src.catCol] || src.label) : src.label,
        costo_totale: num(r[src.costCol]),
      })
    }
  }

  return results
}

// --- RPC wrappers ---

const RPC_ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Sessione scaduta. Effettua nuovamente il login.',
  ROLE_NOT_ALLOWED: 'Non hai i permessi per questa operazione.',
  REQUEST_NOT_FOUND: 'Richiesta di pagamento non trovata.',
  REQUEST_NOT_EDITABLE: 'La richiesta non e modificabile nello stato attuale.',
  INVALID_SOURCE_TABLE: 'Tipo di voce economica non valido.',
  SOURCE_LINE_NOT_FOUND: 'Voce economica non trovata.',
  LINE_ALREADY_LINKED: 'Questa voce e gia collegata alla richiesta.',
  VERSION_MISMATCH: 'La versione budget non corrisponde.',
  VERSION_NOT_ALLOWED: 'Versione budget non utilizzabile (deve essere preventivo approvato o consuntivo in bozza).',
  EVENT_MISMATCH: 'La voce non appartiene a questo evento.',
  SUPPLIER_MISMATCH: 'La voce appartiene a un fornitore diverso.',
  INVALID_ALLOCATION: 'L\'importo allocato deve essere maggiore di zero.',
  ALLOCATION_EXCEEDS_REQUEST: 'L\'importo allocato supera il totale della richiesta.',
  NO_LINES: 'Collega almeno una voce economica prima di inviare.',
  ALLOCATION_MISMATCH: 'Il totale allocato non corrisponde all\'importo della richiesta.',
  SUPPLIER_REQUIRED: 'Il fornitore e obbligatorio per i pagamenti fornitore.',
  DESCRIPTION_REQUIRED: 'La descrizione e obbligatoria.',
  DUE_DATE_REQUIRED: 'La data di scadenza e obbligatoria.',
  INVALID_AMOUNT: 'L\'importo deve essere maggiore di zero.',
  CLIENT_REQUIRED: 'Il cliente e obbligatorio per gli incassi.',
}

function extractRpcError(error: any): string {
  const msg = error?.message || error?.details || ''
  for (const code of Object.keys(RPC_ERROR_MESSAGES)) {
    if (msg.includes(code)) return RPC_ERROR_MESSAGES[code]
  }
  return msg || 'Errore imprevisto.'
}

export async function addPaymentRequestLine(params: {
  paymentRequestId: string
  budgetVersionId: string
  sourceTable: string
  sourceLineId: string
  allocatedAmount: number
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('add_payment_request_line', {
    p_payment_request_id: params.paymentRequestId,
    p_budget_version_id: params.budgetVersionId,
    p_source_table: params.sourceTable,
    p_source_line_id: params.sourceLineId,
    p_allocated_amount: params.allocatedAmount,
  })
  if (error) {
    logError('event-payments', 'addPaymentRequestLine', error)
    return { id: null, error: extractRpcError(error) }
  }
  return { id: data as string, error: null }
}

export async function submitPaymentRequest(paymentRequestId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('submit_payment_request', {
    p_payment_request_id: paymentRequestId,
  })
  if (error) {
    logError('event-payments', 'submitPaymentRequest', error)
    return { error: extractRpcError(error) }
  }
  return { error: null }
}
