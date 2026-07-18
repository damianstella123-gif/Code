import { supabase } from './supabase'
import { logError } from './error-log'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface AdminPaymentRequest {
  id: string
  event_id: string | null
  tipo: string
  descrizione: string
  importo: number
  data_scadenza: string
  data_pagamento: string | null
  supplier_id: string | null
  client_id: string | null
  stato: string
  note: string | null
  created_by: string | null
  created_at: string
  request_status: string
  submitted_at: string | null
  submitted_by: string | null
  request_note: string | null
  admin_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  event?: { id: string; nome: string } | null
  supplier?: { id: string; nome: string } | null
  pm_profile?: { id: string; first_name: string; last_name: string } | null
  reviewer_profile?: { id: string; first_name: string; last_name: string } | null
}

export interface RequestLineLink {
  id: string
  payment_request_id: string
  budget_version_id: string
  source_table: string
  source_line_id: string
  allocated_amount: number
  created_at: string
}

export interface RequestInvoiceLink {
  id: string
  payment_request_id: string
  invoice_id: string
  allocated_amount: number
  created_by: string | null
  created_at: string
  invoice?: {
    id: string
    numero: string
    soggetto: string
    importo: number
    stato: string
    data_emissione: string
    scadenza: string
  } | null
}

export interface PaymentExecution {
  id: string
  payment_request_id: string
  invoice_id: string | null
  event_id: string | null
  supplier_id: string | null
  amount: number
  execution_status: string
  due_date: string | null
  scheduled_date: string | null
  executed_date: string | null
  payment_method: string | null
  bank_reference: string | null
  note: string | null
  created_by: string | null
  authorized_by: string | null
  authorized_at: string | null
  executed_by: string | null
  executed_at: string | null
  created_at: string
  updated_at: string
}

export interface LinkableInvoice {
  id: string
  numero: string
  soggetto: string
  soggetto_id: string | null
  evento_id: string | null
  importo: number
  imponibile: number
  stato: string
  data_emissione: string
  scadenza: string
  tipo: string
}

// ─── Error translation ──────────────────────────────────────────────────────────

const RPC_ERROR_MAP: Record<string, string> = {
  AUTH_REQUIRED: 'Sessione scaduta. Effettua nuovamente il login.',
  ROLE_NOT_ALLOWED: 'Non hai i permessi per questa operazione.',
  REQUEST_NOT_FOUND: 'Richiesta di pagamento non trovata.',
  REQUEST_NOT_EDITABLE: 'La richiesta non e modificabile nello stato attuale.',
  REQUEST_NOT_APPROVED: 'La richiesta non e ancora approvata.',
  INVALID_TRANSITION: 'Transizione di stato non valida.',
  NOTE_REQUIRED_MIN_5: 'La nota e obbligatoria (minimo 5 caratteri).',
  INVALID_ALLOCATION: "L'importo allocato deve essere maggiore di zero.",
  ALLOCATION_EXCEEDS_REQUEST: "L'importo allocato supera il totale della richiesta.",
  INVOICE_NOT_FOUND: 'Fattura non trovata.',
  INVOICE_NOT_USCITA: 'La fattura deve essere di tipo uscita.',
  INVOICE_ALREADY_LINKED: 'Questa fattura e gia collegata alla richiesta.',
  SUPPLIER_MISMATCH: 'Il fornitore della fattura non corrisponde.',
  EVENT_MISMATCH: "L'evento della fattura non corrisponde.",
  INVOICE_NOT_LINKED: 'La fattura non e collegata a questa richiesta.',
  INVALID_AMOUNT: "L'importo deve essere maggiore di zero.",
  EXECUTION_EXCEEDS_REQUEST: "L'importo della disposizione supera il residuo della richiesta.",
  EXECUTION_NOT_FOUND: 'Disposizione di pagamento non trovata.',
  SCHEDULED_DATE_REQUIRED: 'La data pianificata e obbligatoria.',
  EXECUTED_DATE_REQUIRED: 'La data di esecuzione e obbligatoria.',
  PAYMENT_METHOD_REQUIRED: 'Il metodo di pagamento e obbligatorio.',
  CANNOT_CANCEL_WITH_EXECUTIONS: 'Non e possibile annullare: ci sono disposizioni autorizzate o eseguite.',
  INVALID_REQUEST_TYPE: 'La richiesta deve essere di tipo pagamento fornitore.',
}

function translateRpcError(error: unknown): string {
  const msg = (error as any)?.message || (error as any)?.details || ''
  for (const [code, translation] of Object.entries(RPC_ERROR_MAP)) {
    if (msg.includes(code)) return translation
  }
  return msg || 'Errore imprevisto durante la comunicazione con il server.'
}

function toNum(x: unknown): number {
  if (x === null || x === undefined) return 0
  return typeof x === 'string' ? Number(x) || 0 : Number(x) || 0
}

// ─── Queries ────────────────────────────────────────────────────────────────────

export async function fetchAdminPaymentRequests(): Promise<AdminPaymentRequest[]> {
  const { data, error } = await supabase
    .from('event_payments')
    .select(`
      *,
      event:events!event_payments_event_id_fkey(id, nome),
      supplier:suppliers!event_payments_supplier_id_fkey(id, nome),
      pm_profile:profiles!event_payments_created_by_fkey(id, first_name, last_name),
      reviewer_profile:profiles!event_payments_reviewed_by_fkey(id, first_name, last_name)
    `)
    .not('request_status', 'is', null)
    .neq('request_status', 'bozza')
    .order('submitted_at', { ascending: false, nullsFirst: false })

  if (error) {
    logError('payment-admin', 'fetchAdminPaymentRequests', error)
    return []
  }

  return (data ?? []).map((r: any) => ({
    id: r.id,
    event_id: r.event_id,
    tipo: r.tipo,
    descrizione: r.descrizione ?? '',
    importo: toNum(r.importo),
    data_scadenza: r.data_scadenza,
    data_pagamento: r.data_pagamento,
    supplier_id: r.supplier_id,
    client_id: r.client_id,
    stato: r.stato,
    note: r.note,
    created_by: r.created_by,
    created_at: r.created_at,
    request_status: r.request_status,
    submitted_at: r.submitted_at,
    submitted_by: r.submitted_by,
    request_note: r.request_note,
    admin_note: r.admin_note,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    event: r.event ?? null,
    supplier: r.supplier ?? null,
    pm_profile: r.pm_profile ?? null,
    reviewer_profile: r.reviewer_profile ?? null,
  }))
}

export async function fetchRequestLineLinks(requestId: string): Promise<RequestLineLink[]> {
  const { data, error } = await supabase
    .from('payment_request_line_links')
    .select('*')
    .eq('payment_request_id', requestId)
    .order('created_at')

  if (error) {
    logError('payment-admin', 'fetchRequestLineLinks', error)
    return []
  }
  return (data ?? []).map((r: any) => ({ ...r, allocated_amount: toNum(r.allocated_amount) }))
}

export async function fetchRequestInvoiceLinks(requestId: string): Promise<RequestInvoiceLink[]> {
  const { data, error } = await supabase
    .from('payment_request_invoice_links')
    .select(`
      *,
      invoice:admin_fatture!payment_request_invoice_links_invoice_id_fkey(
        id, numero, soggetto, importo, stato, data_emissione, scadenza
      )
    `)
    .eq('payment_request_id', requestId)
    .order('created_at')

  if (error) {
    logError('payment-admin', 'fetchRequestInvoiceLinks', error)
    return []
  }
  return (data ?? []).map((r: any) => ({ ...r, allocated_amount: toNum(r.allocated_amount) }))
}

export async function fetchPaymentExecutions(requestId: string): Promise<PaymentExecution[]> {
  const { data, error } = await supabase
    .from('payment_executions')
    .select('*')
    .eq('payment_request_id', requestId)
    .order('created_at')

  if (error) {
    logError('payment-admin', 'fetchPaymentExecutions', error)
    return []
  }
  return (data ?? []).map((r: any) => ({ ...r, amount: toNum(r.amount) }))
}

export async function fetchLinkableInvoices(request: AdminPaymentRequest): Promise<LinkableInvoice[]> {
  let query = supabase
    .from('admin_fatture')
    .select('id, numero, soggetto, soggetto_id, evento_id, importo, imponibile, stato, data_emissione, scadenza, tipo')
    .eq('tipo', 'uscita')

  if (request.supplier_id) {
    query = query.eq('soggetto_id', request.supplier_id)
  }

  const { data, error } = await query.order('data_emissione', { ascending: false })

  if (error) {
    logError('payment-admin', 'fetchLinkableInvoices', error)
    return []
  }

  return (data ?? [])
    .filter((inv: any) => {
      if (request.event_id && inv.evento_id && inv.evento_id !== request.event_id) return false
      return true
    })
    .map((r: any) => ({ ...r, importo: toNum(r.importo), imponibile: toNum(r.imponibile) }))
}

// ─── Mutations ──────────────────────────────────────────────────────────────────

export async function createSupplierInvoiceDraft(params: {
  numero: string
  dataEmissione: string
  scadenza: string
  imponibile: number
  iva: number
  totale: number
  note: string
  supplierName: string
  supplierId: string
  eventId: string | null
  userId: string
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('admin_fatture')
    .insert({
      numero: params.numero,
      tipo: 'uscita',
      soggetto: params.supplierName,
      soggetto_id: params.supplierId,
      evento_id: params.eventId,
      importo: params.totale,
      imponibile: params.imponibile,
      iva: params.iva,
      stato: 'bozza',
      data_emissione: params.dataEmissione,
      scadenza: params.scadenza,
      note: params.note || null,
      created_by: params.userId,
      external_provider: 'manuale',
      sync_status: 'non_sincronizzata',
    })
    .select('id')
    .maybeSingle()

  if (error) {
    logError('payment-admin', 'createSupplierInvoiceDraft', error)
    return { id: null, error: error.message || 'Errore nel salvataggio della fattura.' }
  }
  return { id: data?.id ?? null, error: null }
}

export async function transitionPaymentRequest(params: {
  paymentRequestId: string
  targetStatus: string
  adminNote?: string
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_transition_payment_request', {
    p_payment_request_id: params.paymentRequestId,
    p_target_status: params.targetStatus,
    p_admin_note: params.adminNote ?? null,
  })
  if (error) {
    logError('payment-admin', 'transitionPaymentRequest', error)
    return { error: translateRpcError(error) }
  }
  return { error: null }
}

export async function linkInvoiceToRequest(params: {
  paymentRequestId: string
  invoiceId: string
  allocatedAmount: number
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_link_invoice_to_request', {
    p_payment_request_id: params.paymentRequestId,
    p_invoice_id: params.invoiceId,
    p_allocated_amount: params.allocatedAmount,
  })
  if (error) {
    logError('payment-admin', 'linkInvoiceToRequest', error)
    return { id: null, error: translateRpcError(error) }
  }
  return { id: data as string | null, error: null }
}

export async function createPaymentExecution(params: {
  paymentRequestId: string
  amount: number
  invoiceId?: string | null
  dueDate?: string | null
  note?: string | null
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_create_payment_execution', {
    p_payment_request_id: params.paymentRequestId,
    p_amount: params.amount,
    p_invoice_id: params.invoiceId ?? null,
    p_due_date: params.dueDate ?? null,
    p_note: params.note ?? null,
  })
  if (error) {
    logError('payment-admin', 'createPaymentExecution', error)
    return { id: null, error: translateRpcError(error) }
  }
  return { id: data as string | null, error: null }
}

export async function transitionPaymentExecution(params: {
  executionId: string
  targetStatus: string
  scheduledDate?: string | null
  executedDate?: string | null
  paymentMethod?: string | null
  bankReference?: string | null
  note?: string | null
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('admin_transition_payment_execution', {
    p_execution_id: params.executionId,
    p_target_status: params.targetStatus,
    p_scheduled_date: params.scheduledDate ?? null,
    p_executed_date: params.executedDate ?? null,
    p_payment_method: params.paymentMethod ?? null,
    p_bank_reference: params.bankReference ?? null,
    p_note: params.note ?? null,
  })
  if (error) {
    logError('payment-admin', 'transitionPaymentExecution', error)
    return { error: translateRpcError(error) }
  }
  return { error: null }
}
