import { supabase } from './supabase'
import type { Client, Contatto } from '@/data/clients'

interface ClientRow {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  notes: string | null
  referente: string | null
  status: string | null
  city: string | null
  country: string | null
  source: string | null
  revenue: number | null
  estimated_value: number | null
  deal_stage: string | null
  logo_url: string | null
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
    referente: r.referente ?? '',
    avatar: '',
    stato: (r.status as Client['stato']) ?? 'prospect',
    nazione: r.country ?? 'Italia',
    citta: r.city ?? '',
    source: (r.source as Client['source']) ?? 'contatto',
    fatturato: r.revenue ?? 0,
    valoreStimato: r.estimated_value ?? 0,
    faseTrattativa: (r.deal_stage as Client['faseTrattativa']) ?? 'lead',
    note: r.notes ?? '',
    logoUrl: r.logo_url ?? undefined,
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
    referente: c.referente ?? '',
    status: c.stato ?? 'prospect',
    city: c.citta ?? '',
    country: c.nazione ?? 'Italia',
    source: c.source ?? 'contatto',
    revenue: c.fatturato ?? 0,
    estimated_value: c.valoreStimato ?? 0,
    deal_stage: c.faseTrattativa ?? 'lead',
    logo_url: c.logoUrl ?? null,
  }
}

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name', { ascending: true })
    .limit(1000)
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
  const dbPatch: Record<string, unknown> = {}
  if (patch.nome !== undefined) dbPatch.name = patch.nome
  if (patch.settore !== undefined) dbPatch.company = patch.settore
  if (patch.email !== undefined) dbPatch.email = patch.email
  if (patch.telefono !== undefined) dbPatch.phone = patch.telefono
  if (patch.note !== undefined) dbPatch.notes = patch.note
  if (patch.referente !== undefined) dbPatch.referente = patch.referente
  if (patch.stato !== undefined) dbPatch.status = patch.stato
  if (patch.citta !== undefined) dbPatch.city = patch.citta
  if (patch.nazione !== undefined) dbPatch.country = patch.nazione
  if (patch.source !== undefined) dbPatch.source = patch.source
  if (patch.fatturato !== undefined) dbPatch.revenue = patch.fatturato
  if (patch.valoreStimato !== undefined) dbPatch.estimated_value = patch.valoreStimato
  if (patch.faseTrattativa !== undefined) dbPatch.deal_stage = patch.faseTrattativa

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

// ─── Contacts (Contatti) ─────────────────────────────────────────────────────

interface ContactRow {
  id: string
  client_id: string
  date: string
  type: string
  title: string
  notes: string | null
  author: string | null
  created_at: string
  updated_at: string
}

function rowToContatto(r: ContactRow): Contatto {
  return {
    id: r.id,
    clienteId: r.client_id,
    data: r.date,
    tipo: (r.type as Contatto['tipo']) ?? 'chiamata',
    titolo: r.title,
    note: r.notes ?? '',
    autore: r.author ?? '',
  }
}

export async function fetchContacts(clientId?: string): Promise<Contatto[]> {
  let query = supabase.from('contacts').select('*').order('date', { ascending: false })
  if (clientId) query = query.eq('client_id', clientId)
  const { data, error } = await query
  if (error) {
    console.error('fetchContacts error:', error.message)
    return []
  }
  return ((data ?? []) as ContactRow[]).map(rowToContatto)
}

export async function upsertContact(c: Contatto): Promise<Contatto | null> {
  const row = {
    id: c.id,
    client_id: c.clienteId,
    date: c.data,
    type: c.tipo,
    title: c.titolo,
    notes: c.note ?? '',
    author: c.autore ?? '',
  }
  const { data, error } = await supabase
    .from('contacts')
    .upsert(row, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('upsertContact error:', error.message)
    return null
  }
  return data ? rowToContatto(data as ContactRow) : null
}

export async function deleteContact(id: string): Promise<boolean> {
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) {
    console.error('deleteContact error:', error.message)
    return false
  }
  return true
}

// ─── Referenti ──────────────────────────────────────────────────────────────

export interface Referente {
  id: string
  client_id: string
  nome: string
  cognome: string
  reparto: string
  ruolo: string
  email: string
  telefono: string
  cellulare: string
  note: string
  is_principale: boolean
  created_at: string
  updated_at: string
}

export async function fetchReferenti(clientId: string): Promise<Referente[]> {
  const { data, error } = await supabase
    .from('referenti')
    .select('*')
    .eq('client_id', clientId)
    .order('is_principale', { ascending: false })
    .order('cognome', { ascending: true })
  if (error) {
    console.error('fetchReferenti error:', error.message)
    return []
  }
  return (data ?? []) as Referente[]
}

export async function fetchAllReferenti(): Promise<Referente[]> {
  const { data, error } = await supabase
    .from('referenti')
    .select('*')
    .order('is_principale', { ascending: false })
    .order('cognome', { ascending: true })
  if (error) {
    console.error('fetchAllReferenti error:', error.message)
    return []
  }
  return (data ?? []) as Referente[]
}

export async function upsertReferente(r: Omit<Referente, 'created_at' | 'updated_at'>): Promise<Referente | null> {
  const { data, error } = await supabase
    .from('referenti')
    .upsert({ ...r, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('upsertReferente error:', error.message)
    return null
  }
  return data as Referente | null
}

export async function deleteReferente(id: string): Promise<boolean> {
  const { error } = await supabase.from('referenti').delete().eq('id', id)
  if (error) {
    console.error('deleteReferente error:', error.message)
    return false
  }
  return true
}

export async function setReferentePrincipale(clientId: string, referenteId: string): Promise<boolean> {
  const { error: clearErr } = await supabase
    .from('referenti')
    .update({ is_principale: false, updated_at: new Date().toISOString() })
    .eq('client_id', clientId)
  if (clearErr) {
    console.error('clearPrincipale error:', clearErr.message)
    return false
  }
  const { error: setErr } = await supabase
    .from('referenti')
    .update({ is_principale: true, updated_at: new Date().toISOString() })
    .eq('id', referenteId)
  if (setErr) {
    console.error('setPrincipale error:', setErr.message)
    return false
  }
  return true
}

// ─── Company Logo ───────────────────────────────────────────────────────────

export async function uploadCompanyLogo(companyName: string, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const path = `${companyName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('company-logos')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadErr) {
    console.error('uploadCompanyLogo error:', uploadErr.message)
    return null
  }

  const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(path)
  return urlData.publicUrl
}

export async function setCompanyLogo(companyName: string, logoUrl: string): Promise<boolean> {
  const { error } = await supabase
    .from('clients')
    .update({ logo_url: logoUrl })
    .ilike('name', companyName)

  if (error) {
    console.error('setCompanyLogo error:', error.message)
    return false
  }
  return true
}
