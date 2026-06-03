import { supabase } from './supabase'
import type { Client } from '@/data/clients'

interface ClientRow {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function rowToClient(r: ClientRow): Client {
  return {
    id: r.id,
    nome: r.name ?? '',
    settore: r.company ?? '',
    email: r.email ?? '',
    telefono: r.phone ?? '',
    referente: '',
    avatar: '',
    stato: 'prospect',
    nazione: 'Italia',
    citta: '',
    source: 'contatto',
    fatturato: 0,
    valoreStimato: 0,
    faseTrattativa: 'lead',
    note: r.notes ?? '',
  }
}

function clientToRow(c: Client): Omit<ClientRow, 'created_at' | 'updated_at'> {
  return {
    id: c.id,
    name: c.nome,
    company: c.settore ?? '',
    email: c.email ?? '',
    phone: c.telefono ?? '',
    notes: c.note ?? '',
  }
}

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true })
  if (error) {
    console.error('fetchClients error:', error.message)
    return []
  }
  return ((data ?? []) as ClientRow[]).map(rowToClient)
}

export async function upsertClient(client: Client): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .upsert(clientToRow(client), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('upsertClient error:', error.message)
    return null
  }
  return data ? rowToClient(data as ClientRow) : null
}

export async function updateClient(id: string, patch: Partial<Client>): Promise<Client | null> {
  const dbPatch: Partial<ClientRow> = {}
  if (patch.nome !== undefined) dbPatch.name = patch.nome
  if (patch.settore !== undefined) dbPatch.company = patch.settore
  if (patch.email !== undefined) dbPatch.email = patch.email
  if (patch.telefono !== undefined) dbPatch.phone = patch.telefono
  if (patch.note !== undefined) dbPatch.notes = patch.note

  const { data, error } = await supabase
    .from('clients')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    console.error('updateClient error:', error.message)
    return null
  }
  return data ? rowToClient(data as ClientRow) : null
}

export async function deleteClient(id: string): Promise<boolean> {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) {
    console.error('deleteClient error:', error.message)
    return false
  }
  return true
}
