import { supabase } from './supabase'
import { logError } from './error-log'

export interface Invoice {
  id: string
  event_id: string | null
  client_id: string | null
  supplier_id: string | null
  fatture_in_cloud_id: string | null
  external_url: string | null
  type: 'emessa' | 'ricevuta'
  number: string
  amount: number
  vat_amount: number
  status: string
  due_date: string | null
  paid_at: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  invoice_id: string | null
  budget_id: string | null
  event_id: string | null
  amount: number
  method: string
  paid_at: string
  reference: string
  notes: string
  created_at: string
}

export interface AdminDocument {
  id: string
  title: string
  type: string
  event_id: string | null
  client_id: string | null
  supplier_id: string | null
  file_url: string | null
  notes: string
  created_at: string
}

export const INVOICE_STATUSES = [
  { id: 'bozza', label: 'Bozza', color: '#9ba3aa' },
  { id: 'emessa', label: 'Emessa', color: '#4db4ff' },
  { id: 'inviata', label: 'Inviata', color: '#ffc24b' },
  { id: 'pagata', label: 'Pagata', color: '#38d27d' },
  { id: 'scaduta', label: 'Scaduta', color: '#ff315f' },
] as const

export const ADMIN_DOC_TYPES = [
  { id: 'contratto', label: 'Contratto' },
  { id: 'ricevuta', label: 'Ricevuta' },
  { id: 'nota_credito', label: 'Nota di Credito' },
  { id: 'f24', label: 'F24' },
  { id: 'altro', label: 'Altro' },
] as const

// --- Invoices ---

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    logError('invoices-service', 'fetchInvoices', error)
    throw new Error(error.message)
  }
  return (data ?? []).map(d => ({ ...d, amount: Number(d.amount), vat_amount: Number(d.vat_amount) })) as Invoice[]
}

export async function upsertInvoice(invoice: Partial<Invoice> & { type: string }): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .upsert(invoice, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    logError('invoices-service', 'upsertInvoice', error)
    throw new Error(error.message)
  }
  return data ? { ...data, amount: Number(data.amount), vat_amount: Number(data.vat_amount) } as Invoice : null
}

export async function updateInvoice(id: string, patch: Partial<Invoice>): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    logError('invoices-service', 'updateInvoice', error)
    throw new Error(error.message)
  }
  return data ? { ...data, amount: Number(data.amount), vat_amount: Number(data.vat_amount) } as Invoice : null
}

export async function deleteInvoice(id: string): Promise<boolean> {
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) {
    logError('invoices-service', 'deleteInvoice', error)
    throw new Error(error.message)
  }
  return true
}

// --- Payments ---

export async function fetchPayments(): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('paid_at', { ascending: false })
    .limit(500)
  if (error) {
    logError('invoices-service', 'fetchPayments', error)
    throw new Error(error.message)
  }
  return (data ?? []).map(d => ({ ...d, amount: Number(d.amount) })) as Payment[]
}

export async function upsertPayment(payment: Partial<Payment>): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .upsert(payment, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    logError('invoices-service', 'upsertPayment', error)
    throw new Error(error.message)
  }
  return data ? { ...data, amount: Number(data.amount) } as Payment : null
}

export async function deletePayment(id: string): Promise<boolean> {
  const { error } = await supabase.from('payments').delete().eq('id', id)
  if (error) {
    logError('invoices-service', 'deletePayment', error)
    throw new Error(error.message)
  }
  return true
}

// --- Admin Documents ---

export async function fetchAdminDocuments(): Promise<AdminDocument[]> {
  const { data, error } = await supabase
    .from('admin_documents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    logError('invoices-service', 'fetchAdminDocuments', error)
    throw new Error(error.message)
  }
  return (data ?? []) as AdminDocument[]
}

export async function upsertAdminDocument(doc: Partial<AdminDocument> & { title: string }): Promise<AdminDocument | null> {
  const { data, error } = await supabase
    .from('admin_documents')
    .upsert(doc, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    logError('invoices-service', 'upsertAdminDocument', error)
    throw new Error(error.message)
  }
  return data as AdminDocument | null
}

export async function deleteAdminDocument(id: string): Promise<boolean> {
  const { error } = await supabase.from('admin_documents').delete().eq('id', id)
  if (error) {
    logError('invoices-service', 'deleteAdminDocument', error)
    throw new Error(error.message)
  }
  return true
}

export async function uploadAdminFile(file: File, docId: string): Promise<string | null> {
  const ext = file.name.split('.').pop()
  const path = `${docId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('admin-files')
    .upload(path, file, { upsert: true })
  if (error) {
    logError('invoices-service', 'uploadAdminFile', error)
    throw new Error(error.message)
  }
  const { data: urlData } = supabase.storage.from('admin-files').getPublicUrl(path)
  return urlData.publicUrl
}
