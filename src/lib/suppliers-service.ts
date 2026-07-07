import { supabase } from './supabase'
import { logError } from './error-log'
import type { Supplier, StatoContratto, Documento, Recensione, SupplierDetails } from '@/data/suppliers'

interface SupplierRow {
  id: string
  name: string
  category: string
  contact_name: string
  email: string
  phone: string
  rating: number | string
  notes: string
  contact_phone: string
  location: string
  website: string
  vat_number: string
  status: 'attivo' | 'inattivo'
  contract_status: StatoContratto
  contract_expiry: string | null
  services: string[]
  event_ids: string[]
  avg_cost_per_event: number | string
  min_cost: number | string
  max_cost: number | string
  documents: Documento[]
  reviews: Recensione[]
  logo_url: string | null
  details: SupplierDetails | null
  note_operative: string | null
  country: string
  region: string
  province: string
  city: string
  address: string
  latitude: number | null
  longitude: number | null
  created_at: string
  updated_at: string
}

function num(x: number | string | null | undefined): number {
  if (x === null || x === undefined) return 0
  return typeof x === 'string' ? Number(x) : x
}

function rowToSupplier(r: SupplierRow): Supplier {
  return {
    id: r.id,
    nome: r.name,
    email: r.email ?? '',
    telefono: r.phone ?? '',
    categoria: r.category ?? '',
    referente: r.contact_name ?? '',
    referenteTelefono: r.contact_phone ?? '',
    rating: num(r.rating),
    stato: r.status,
    statoContratto: r.contract_status,
    scadenzaContratto: r.contract_expiry ?? '',
    servizi: r.services ?? [],
    location: r.location ?? '',
    sito: r.website ?? '',
    costoMedioPerEvento: num(r.avg_cost_per_event),
    costoMinimo: num(r.min_cost),
    costoMassimo: num(r.max_cost),
    noteOperative: r.note_operative ?? r.notes ?? '',
    eventiId: r.event_ids ?? [],
    documenti: (r.documents as Documento[]) ?? [],
    recensioni: (r.reviews as Recensione[]) ?? [],
    piva: r.vat_number ?? '',
    logoUrl: r.logo_url ?? undefined,
    details: (r.details as SupplierDetails) ?? undefined,
    country: r.country ?? '',
    region: r.region ?? '',
    province: r.province ?? '',
    city: r.city ?? '',
    address: r.address ?? '',
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
  }
}

function supplierToRow(s: Supplier): Omit<SupplierRow, 'created_at' | 'updated_at'> {
  return {
    id: s.id,
    name: s.nome,
    category: s.categoria ?? '',
    contact_name: s.referente ?? '',
    email: s.email ?? '',
    phone: s.telefono ?? '',
    rating: s.rating ?? 0,
    notes: s.noteOperative ?? '',
    note_operative: s.noteOperative ?? '',
    contact_phone: s.referenteTelefono ?? '',
    location: s.location ?? '',
    website: s.sito ?? '',
    vat_number: s.piva ?? '',
    status: s.stato,
    contract_status: s.statoContratto,
    contract_expiry: s.scadenzaContratto && s.scadenzaContratto.length > 0 ? s.scadenzaContratto : null,
    services: s.servizi ?? [],
    event_ids: s.eventiId ?? [],
    avg_cost_per_event: s.costoMedioPerEvento ?? 0,
    min_cost: s.costoMinimo ?? 0,
    max_cost: s.costoMassimo ?? 0,
    documents: s.documenti ?? [],
    reviews: s.recensioni ?? [],
    logo_url: s.logoUrl ?? null,
    details: s.details ?? null,
    country: s.country ?? '',
    region: s.region ?? '',
    province: s.province ?? '',
    city: s.city ?? '',
    address: s.address ?? '',
    latitude: s.latitude ?? null,
    longitude: s.longitude ?? null,
  }
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1500)
  if (error) {
    logError('suppliers-service', 'fetchSuppliers', error)
    throw new Error(error.message)
  }
  return ((data ?? []) as SupplierRow[]).map(rowToSupplier)
}

export async function upsertSupplier(supplier: Supplier): Promise<Supplier | null> {
  const { data, error } = await supabase
    .from('suppliers')
    .upsert(supplierToRow(supplier), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    logError('suppliers-service', 'upsertSupplier', error)
    throw new Error(error.message)
  }
  return data ? rowToSupplier(data as SupplierRow) : null
}

export async function updateSupplier(id: string, patch: Partial<Supplier>): Promise<Supplier | null> {
  const dbPatch: Partial<SupplierRow> = {}
  if (patch.nome !== undefined) dbPatch.name = patch.nome
  if (patch.categoria !== undefined) dbPatch.category = patch.categoria
  if (patch.referente !== undefined) dbPatch.contact_name = patch.referente
  if (patch.email !== undefined) dbPatch.email = patch.email
  if (patch.telefono !== undefined) dbPatch.phone = patch.telefono
  if (patch.rating !== undefined) dbPatch.rating = patch.rating
  if (patch.noteOperative !== undefined) dbPatch.notes = patch.noteOperative
  if (patch.referenteTelefono !== undefined) dbPatch.contact_phone = patch.referenteTelefono
  if (patch.location !== undefined) dbPatch.location = patch.location
  if (patch.sito !== undefined) dbPatch.website = patch.sito
  if (patch.piva !== undefined) dbPatch.vat_number = patch.piva
  if (patch.stato !== undefined) dbPatch.status = patch.stato
  if (patch.statoContratto !== undefined) dbPatch.contract_status = patch.statoContratto
  if (patch.scadenzaContratto !== undefined) dbPatch.contract_expiry = patch.scadenzaContratto && patch.scadenzaContratto.length > 0 ? patch.scadenzaContratto : null
  if (patch.servizi !== undefined) dbPatch.services = patch.servizi
  if (patch.eventiId !== undefined) dbPatch.event_ids = patch.eventiId
  if (patch.costoMedioPerEvento !== undefined) dbPatch.avg_cost_per_event = patch.costoMedioPerEvento
  if (patch.costoMinimo !== undefined) dbPatch.min_cost = patch.costoMinimo
  if (patch.costoMassimo !== undefined) dbPatch.max_cost = patch.costoMassimo
  if (patch.documenti !== undefined) dbPatch.documents = patch.documenti
  if (patch.recensioni !== undefined) dbPatch.reviews = patch.recensioni
  if ((patch as Record<string, unknown>).logoUrl !== undefined) (dbPatch as Record<string, unknown>).logo_url = (patch as Record<string, unknown>).logoUrl ?? null
  if ((patch as Record<string, unknown>).details !== undefined) (dbPatch as Record<string, unknown>).details = (patch as Record<string, unknown>).details ?? null
  if (patch.noteOperative !== undefined) (dbPatch as Record<string, unknown>).note_operative = patch.noteOperative
  if (patch.city !== undefined) (dbPatch as Record<string, unknown>).city = patch.city
  if (patch.province !== undefined) (dbPatch as Record<string, unknown>).province = patch.province
  if (patch.region !== undefined) (dbPatch as Record<string, unknown>).region = patch.region
  if (patch.country !== undefined) (dbPatch as Record<string, unknown>).country = patch.country
  if (patch.address !== undefined) (dbPatch as Record<string, unknown>).address = patch.address

  const { data, error } = await supabase
    .from('suppliers')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    logError('suppliers-service', 'updateSupplier', error)
    throw new Error(error.message)
  }
  return data ? rowToSupplier(data as SupplierRow) : null
}

export async function deleteSupplier(id: string): Promise<boolean> {
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) {
    logError('suppliers-service', 'deleteSupplier', error)
    throw new Error(error.message)
  }
  return true
}
