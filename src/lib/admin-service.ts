import { supabase } from './supabase'
import type { Entrata, Fattura } from '../data/amministrazione'

// ── Entrate ─────────────────────────────────────────────────────────────────

export async function fetchEntrate(): Promise<Entrata[]> {
  const { data, error } = await supabase
    .from('admin_entrate')
    .select('*')
    .order('data_prevista', { ascending: false })

  if (error) throw error
  return (data ?? []).map(rowToEntrata)
}

export async function upsertEntrata(e: Entrata): Promise<void> {
  const row = entrataToRow(e)
  const { error } = await supabase
    .from('admin_entrate')
    .upsert(row, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteEntrata(id: string): Promise<void> {
  const { error } = await supabase
    .from('admin_entrate')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ── Fatture ─────────────────────────────────────────────────────────────────

export async function fetchFatture(): Promise<Fattura[]> {
  const { data, error } = await supabase
    .from('admin_fatture')
    .select('*')
    .order('data_emissione', { ascending: false })

  if (error) throw error
  return (data ?? []).map(rowToFattura)
}

export async function upsertFattura(f: Fattura): Promise<void> {
  const row = fatturaToRow(f)
  const { error } = await supabase
    .from('admin_fatture')
    .upsert(row, { onConflict: 'id' })
  if (error) throw error
}

export async function deleteFattura(id: string): Promise<void> {
  const { error } = await supabase
    .from('admin_fatture')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ── Bulk import (one-time migration from localStorage) ──────────────────────

export async function bulkImportEntrate(items: Entrata[]): Promise<number> {
  if (items.length === 0) return 0

  const { data: existing } = await supabase
    .from('admin_entrate')
    .select('id')

  const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id))
  const toInsert = items.filter(e => !existingIds.has(e.id))

  if (toInsert.length === 0) return 0

  const rows = toInsert.map(entrataToRow)
  const { error } = await supabase
    .from('admin_entrate')
    .insert(rows)
  if (error) throw error
  return toInsert.length
}

export async function bulkImportFatture(items: Fattura[]): Promise<number> {
  if (items.length === 0) return 0

  const { data: existing } = await supabase
    .from('admin_fatture')
    .select('id')

  const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id))
  const toInsert = items.filter(f => !existingIds.has(f.id))

  if (toInsert.length === 0) return 0

  const rows = toInsert.map(fatturaToRow)
  const { error } = await supabase
    .from('admin_fatture')
    .insert(rows)
  if (error) throw error
  return toInsert.length
}

// ── Row mappers ─────────────────────────────────────────────────────────────

type DbEntrata = Record<string, unknown>
type DbFattura = Record<string, unknown>

function rowToEntrata(r: DbEntrata): Entrata {
  return {
    id: r.id as string,
    clienteId: r.cliente_id as string,
    eventoId: (r.evento_id as string) || null,
    importo: Number(r.importo) || 0,
    stato: r.stato as Entrata['stato'],
    dataPrevista: r.data_prevista as string,
    dataPagamento: (r.data_pagamento as string) || null,
    metodoPagamento: r.metodo_pagamento as Entrata['metodoPagamento'],
    note: (r.note as string) || '',
    fatturaId: (r.fattura_id as string) || null,
  }
}

function entrataToRow(e: Entrata) {
  return {
    id: e.id,
    cliente_id: e.clienteId,
    evento_id: e.eventoId || null,
    importo: e.importo,
    stato: e.stato,
    data_prevista: e.dataPrevista,
    data_pagamento: e.dataPagamento || null,
    metodo_pagamento: e.metodoPagamento,
    note: e.note || '',
    fattura_id: e.fatturaId || null,
  }
}

function rowToFattura(r: DbFattura): Fattura {
  return {
    id: r.id as string,
    numero: r.numero as string,
    tipo: r.tipo as Fattura['tipo'],
    soggetto: r.soggetto as string,
    soggettoId: r.soggetto_id as string,
    eventoId: (r.evento_id as string) || null,
    importo: Number(r.importo) || 0,
    imponibile: Number(r.imponibile) || 0,
    iva: Number(r.iva) || 0,
    stato: r.stato as Fattura['stato'],
    dataEmissione: r.data_emissione as string,
    scadenza: r.scadenza as string,
    note: (r.note as string) || '',
  }
}

function fatturaToRow(f: Fattura) {
  return {
    id: f.id,
    numero: f.numero,
    tipo: f.tipo,
    soggetto: f.soggetto,
    soggetto_id: f.soggettoId,
    evento_id: f.eventoId || null,
    importo: f.importo,
    imponibile: f.imponibile,
    iva: f.iva,
    stato: f.stato,
    data_emissione: f.dataEmissione,
    scadenza: f.scadenza,
    note: f.note || '',
  }
}
