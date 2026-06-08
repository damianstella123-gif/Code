import { supabase } from './supabase'
import type { Entrata, Fattura } from '@/data/amministrazione'

interface EntrataRow {
  id: string
  client_id: string
  event_id: string | null
  amount: number
  status: string
  due_date: string
  payment_date: string | null
  payment_method: string
  notes: string
  invoice_id: string | null
  created_at: string
  updated_at: string
}

function rowToEntrata(r: EntrataRow): Entrata {
  return {
    id: r.id,
    clienteId: r.client_id,
    eventoId: r.event_id ?? '',
    importo: Number(r.amount),
    stato: r.status as Entrata['stato'],
    dataPrevista: r.due_date,
    dataPagamento: r.payment_date ?? null,
    metodoPagamento: r.payment_method as Entrata['metodoPagamento'],
    note: r.notes,
    fatturaId: r.invoice_id ?? null,
  }
}

function entrataToRow(e: Partial<Entrata> & { id: string }): Partial<EntrataRow> {
  const row: Partial<EntrataRow> = { id: e.id }
  if (e.clienteId !== undefined) row.client_id = e.clienteId
  if (e.eventoId !== undefined) row.event_id = e.eventoId || null
  if (e.importo !== undefined) row.amount = e.importo
  if (e.stato !== undefined) row.status = e.stato
  if (e.dataPrevista !== undefined) row.due_date = e.dataPrevista
  if (e.dataPagamento !== undefined) row.payment_date = e.dataPagamento || null
  if (e.metodoPagamento !== undefined) row.payment_method = e.metodoPagamento
  if (e.note !== undefined) row.notes = e.note
  if (e.fatturaId !== undefined) row.invoice_id = e.fatturaId || null
  return row
}

export async function fetchEntrate(): Promise<Entrata[]> {
  const { data, error } = await supabase
    .from('entrate')
    .select('*')
    .order('due_date', { ascending: false })
  if (error) { console.error('fetchEntrate', error); return [] }
  return ((data ?? []) as EntrataRow[]).map(rowToEntrata)
}

export async function upsertEntrata(e: Partial<Entrata> & { id: string }): Promise<Entrata | null> {
  const { data, error } = await supabase
    .from('entrate')
    .upsert(entrataToRow(e), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) { console.error('upsertEntrata', error); return null }
  return data ? rowToEntrata(data as EntrataRow) : null
}

export async function deleteEntrata(id: string): Promise<boolean> {
  const { error } = await supabase.from('entrate').delete().eq('id', id)
  if (error) { console.error('deleteEntrata', error); return false }
  return true
}

interface FatturaRow {
  id: string
  numero: string
  tipo: string
  soggetto: string
  soggetto_id: string
  event_id: string | null
  importo: number
  imponibile: number
  iva: number
  stato: string
  data_emissione: string
  scadenza: string
  notes: string
  created_at: string
  updated_at: string
}

function rowToFattura(r: FatturaRow): Fattura {
  return {
    id: r.id,
    numero: r.numero,
    tipo: r.tipo as Fattura['tipo'],
    soggetto: r.soggetto,
    soggettoId: r.soggetto_id,
    eventoId: r.event_id ?? '',
    importo: Number(r.importo),
    imponibile: Number(r.imponibile),
    iva: Number(r.iva),
    stato: r.stato as Fattura['stato'],
    dataEmissione: r.data_emissione,
    scadenza: r.scadenza,
    note: r.notes,
  }
}

function fatturaToRow(f: Partial<Fattura> & { id: string }): Partial<FatturaRow> {
  const row: Partial<FatturaRow> = { id: f.id }
  if (f.numero !== undefined) row.numero = f.numero
  if (f.tipo !== undefined) row.tipo = f.tipo
  if (f.soggetto !== undefined) row.soggetto = f.soggetto
  if (f.soggettoId !== undefined) row.soggetto_id = f.soggettoId
  if (f.eventoId !== undefined) row.event_id = f.eventoId || null
  if (f.importo !== undefined) row.importo = f.importo
  if (f.imponibile !== undefined) row.imponibile = f.imponibile
  if (f.iva !== undefined) row.iva = f.iva
  if (f.stato !== undefined) row.stato = f.stato
  if (f.dataEmissione !== undefined) row.data_emissione = f.dataEmissione
  if (f.scadenza !== undefined) row.scadenza = f.scadenza
  if (f.note !== undefined) row.notes = f.note
  return row
}

export async function fetchFatture(): Promise<Fattura[]> {
  const { data, error } = await supabase
    .from('fatture')
    .select('*')
    .order('data_emissione', { ascending: false })
  if (error) { console.error('fetchFatture', error); return [] }
  return ((data ?? []) as FatturaRow[]).map(rowToFattura)
}

export async function upsertFattura(f: Partial<Fattura> & { id: string }): Promise<Fattura | null> {
  const { data, error } = await supabase
    .from('fatture')
    .upsert(fatturaToRow(f), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) { console.error('upsertFattura', error); return null }
  return data ? rowToFattura(data as FatturaRow) : null
}

export async function deleteFattura(id: string): Promise<boolean> {
  const { error } = await supabase.from('fatture').delete().eq('id', id)
  if (error) { console.error('deleteFattura', error); return false }
  return true
}
