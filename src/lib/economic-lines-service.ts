import { supabase } from './supabase'

export interface TableColumnMap {
  descrizione: string
  quantita: string
  costoUnitario: string | null
  costoTotale: string
  vendutoUnitario: string | null
  vendutoTotale: string
  note: string
  supplierId: string | null
  aliquotaIvaCosto: string
  ivaInclusaCosto: string
  aliquotaIvaVenduto: string
  ivaInclusaVenduto: string
  commissionePct: string
  commissioneImporto: string
}

const TABLE_MAPS: Record<string, TableColumnMap> = {
  event_supplier_services: {
    descrizione: 'titolo',
    quantita: 'quantita',
    costoUnitario: 'costo_unitario',
    costoTotale: 'costo_totale',
    vendutoUnitario: 'venduto_unitario',
    vendutoTotale: 'venduto_totale',
    note: 'note',
    supplierId: 'supplier_id',
    aliquotaIvaCosto: 'aliquota_iva_costo',
    ivaInclusaCosto: 'iva_inclusa_costo',
    aliquotaIvaVenduto: 'aliquota_iva_venduto',
    ivaInclusaVenduto: 'iva_inclusa_venduto',
    commissionePct: 'commissione_pct',
    commissioneImporto: 'commissione_importo',
  },
  event_hotel_details: {
    descrizione: 'titolo',
    quantita: 'quantita',
    costoUnitario: 'costo_unitario',
    costoTotale: 'costo_totale',
    vendutoUnitario: 'venduto_unitario',
    vendutoTotale: 'venduto_totale',
    note: 'note',
    supplierId: 'supplier_id',
    aliquotaIvaCosto: 'aliquota_iva_costo',
    ivaInclusaCosto: 'iva_inclusa_costo',
    aliquotaIvaVenduto: 'aliquota_iva_venduto',
    ivaInclusaVenduto: 'iva_inclusa_venduto',
    commissionePct: 'commissione_pct',
    commissioneImporto: 'commissione_importo',
  },
  event_restaurant_details: {
    descrizione: 'tipologia_servizio',
    quantita: 'pax_confermati',
    costoUnitario: 'costo_per_persona',
    costoTotale: 'costo_totale_reale',
    vendutoUnitario: 'budget_per_persona',
    vendutoTotale: 'budget_totale',
    note: 'note',
    supplierId: 'supplier_id',
    aliquotaIvaCosto: 'aliquota_iva_costo',
    ivaInclusaCosto: 'iva_inclusa_costo',
    aliquotaIvaVenduto: 'aliquota_iva_venduto',
    ivaInclusaVenduto: 'iva_inclusa_venduto',
    commissionePct: 'commissione_pct',
    commissioneImporto: 'commissione_importo',
  },
  event_experience_details: {
    descrizione: 'nome_attivita',
    quantita: 'pax',
    costoUnitario: 'costo_per_persona',
    costoTotale: 'costo_totale',
    vendutoUnitario: 'venduto_per_persona',
    vendutoTotale: 'venduto_totale',
    note: 'note',
    supplierId: 'supplier_id',
    aliquotaIvaCosto: 'aliquota_iva_costo',
    ivaInclusaCosto: 'iva_inclusa_costo',
    aliquotaIvaVenduto: 'aliquota_iva_venduto',
    ivaInclusaVenduto: 'iva_inclusa_venduto',
    commissionePct: 'commissione_pct',
    commissioneImporto: 'commissione_importo',
  },
  event_catering_details: {
    descrizione: 'tipologia',
    quantita: 'pax',
    costoUnitario: 'costo_per_persona',
    costoTotale: 'costo_totale',
    vendutoUnitario: 'venduto_per_persona',
    vendutoTotale: 'venduto_totale',
    note: 'note',
    supplierId: 'supplier_id',
    aliquotaIvaCosto: 'aliquota_iva_costo',
    ivaInclusaCosto: 'iva_inclusa_costo',
    aliquotaIvaVenduto: 'aliquota_iva_venduto',
    ivaInclusaVenduto: 'iva_inclusa_venduto',
    commissionePct: 'commissione_pct',
    commissioneImporto: 'commissione_importo',
  },
  event_staff_interno_details: {
    descrizione: 'ruolo',
    quantita: 'quantita',
    costoUnitario: 'costo_giornaliero',
    costoTotale: 'costo_totale',
    vendutoUnitario: null,
    vendutoTotale: 'venduto_totale',
    note: 'note',
    supplierId: null,
    aliquotaIvaCosto: 'aliquota_iva_costo',
    ivaInclusaCosto: 'iva_inclusa_costo',
    aliquotaIvaVenduto: 'aliquota_iva_venduto',
    ivaInclusaVenduto: 'iva_inclusa_venduto',
    commissionePct: 'commissione_pct',
    commissioneImporto: 'commissione_importo',
  },
  event_staff_esterno_details: {
    descrizione: 'ruolo',
    quantita: 'quantita',
    costoUnitario: 'costo_unitario',
    costoTotale: 'costo_totale',
    vendutoUnitario: 'venduto_unitario',
    vendutoTotale: 'venduto_totale',
    note: 'note',
    supplierId: 'supplier_id',
    aliquotaIvaCosto: 'aliquota_iva_costo',
    ivaInclusaCosto: 'iva_inclusa_costo',
    aliquotaIvaVenduto: 'aliquota_iva_venduto',
    ivaInclusaVenduto: 'iva_inclusa_venduto',
    commissionePct: 'commissione_pct',
    commissioneImporto: 'commissione_importo',
  },
  event_audio_video_details: {
    descrizione: 'tipologia_servizio',
    quantita: 'quantita',
    costoUnitario: 'costo_unitario',
    costoTotale: 'costo_totale',
    vendutoUnitario: 'venduto_unitario',
    vendutoTotale: 'venduto_totale',
    note: 'note',
    supplierId: 'supplier_id',
    aliquotaIvaCosto: 'aliquota_iva_costo',
    ivaInclusaCosto: 'iva_inclusa_costo',
    aliquotaIvaVenduto: 'aliquota_iva_venduto',
    ivaInclusaVenduto: 'iva_inclusa_venduto',
    commissionePct: 'commissione_pct',
    commissioneImporto: 'commissione_importo',
  },
  event_allestimenti_details: {
    descrizione: 'descrizione',
    quantita: 'quantita',
    costoUnitario: 'costo_unitario',
    costoTotale: 'costo_totale',
    vendutoUnitario: 'venduto_unitario',
    vendutoTotale: 'venduto_totale',
    note: 'note',
    supplierId: 'supplier_id',
    aliquotaIvaCosto: 'aliquota_iva_costo',
    ivaInclusaCosto: 'iva_inclusa_costo',
    aliquotaIvaVenduto: 'aliquota_iva_venduto',
    ivaInclusaVenduto: 'iva_inclusa_venduto',
    commissionePct: 'commissione_pct',
    commissioneImporto: 'commissione_importo',
  },
  event_grafica_stampa_details: {
    descrizione: 'tipo_materiale',
    quantita: 'quantita',
    costoUnitario: 'costo_unitario',
    costoTotale: 'costo_totale',
    vendutoUnitario: 'venduto_unitario',
    vendutoTotale: 'venduto_totale',
    note: 'note',
    supplierId: 'supplier_id',
    aliquotaIvaCosto: 'aliquota_iva_costo',
    ivaInclusaCosto: 'iva_inclusa_costo',
    aliquotaIvaVenduto: 'aliquota_iva_venduto',
    ivaInclusaVenduto: 'iva_inclusa_venduto',
    commissionePct: 'commissione_pct',
    commissioneImporto: 'commissione_importo',
  },
  event_varie_details: {
    descrizione: 'descrizione',
    quantita: 'quantita',
    costoUnitario: 'costo_unitario',
    costoTotale: 'costo_totale',
    vendutoUnitario: 'venduto_unitario',
    vendutoTotale: 'venduto_totale',
    note: 'note',
    supplierId: 'supplier_id',
    aliquotaIvaCosto: 'aliquota_iva_costo',
    ivaInclusaCosto: 'iva_inclusa_costo',
    aliquotaIvaVenduto: 'aliquota_iva_venduto',
    ivaInclusaVenduto: 'iva_inclusa_venduto',
    commissionePct: 'commissione_pct',
    commissioneImporto: 'commissione_importo',
  },
}

const SUPPORTED_TABLES = Object.keys(TABLE_MAPS)

export function getTableMap(table: string): TableColumnMap | null {
  return TABLE_MAPS[table] ?? null
}

export function isSupportedTable(table: string): boolean {
  return SUPPORTED_TABLES.includes(table)
}

export function hasSupplierField(table: string): boolean {
  const m = TABLE_MAPS[table]
  return m?.supplierId != null
}

export interface EditableLineData {
  id: string
  table: string
  descrizione: string
  quantita: number
  costoUnitario: number | null
  costoTotale: number
  vendutoUnitario: number | null
  vendutoTotale: number
  note: string
  supplierId: string
  aliquotaIvaCosto: string
  ivaInclusaCosto: boolean
  aliquotaIvaVenduto: string
  ivaInclusaVenduto: boolean
  commissionePct: number | null
  commissioneImporto: number | null
  // hotel room fields (preserved, not editable via totals)
  hotelRoomFields?: Record<string, unknown>
}

export async function fetchLineRecord(table: string, id: string): Promise<Record<string, unknown> | null> {
  if (!isSupportedTable(table)) return null
  const { data, error } = await supabase.from(table as any).select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return data as Record<string, unknown>
}

export function recordToEditableData(table: string, record: Record<string, unknown>): EditableLineData | null {
  const map = getTableMap(table)
  if (!map) return null

  const hotelRoomFields: Record<string, unknown> = {}
  if (table === 'event_hotel_details') {
    const roomKeys = [
      'tipo', 'payment_mode', 'room_type',
      'rooms_client_count', 'room_rate_client',
      'rooms_simmetria_count', 'room_cost_simmetria',
    ]
    for (const k of roomKeys) {
      hotelRoomFields[k] = record[k]
    }
  }

  return {
    id: record.id as string,
    table,
    descrizione: (record[map.descrizione] as string) || '',
    quantita: (record[map.quantita] as number) || 0,
    costoUnitario: map.costoUnitario ? ((record[map.costoUnitario] as number) ?? null) : null,
    costoTotale: (record[map.costoTotale] as number) || 0,
    vendutoUnitario: map.vendutoUnitario ? ((record[map.vendutoUnitario] as number) ?? null) : null,
    vendutoTotale: (record[map.vendutoTotale] as number) || 0,
    note: (record[map.note] as string) || '',
    supplierId: map.supplierId ? ((record[map.supplierId] as string) || '') : '',
    aliquotaIvaCosto: (record[map.aliquotaIvaCosto] as string) || '22',
    ivaInclusaCosto: (record[map.ivaInclusaCosto] as boolean) ?? false,
    aliquotaIvaVenduto: (record[map.aliquotaIvaVenduto] as string) || '22',
    ivaInclusaVenduto: (record[map.ivaInclusaVenduto] as boolean) ?? false,
    commissionePct: (record[map.commissionePct] as number) ?? null,
    commissioneImporto: (record[map.commissioneImporto] as number) ?? null,
    hotelRoomFields: Object.keys(hotelRoomFields).length > 0 ? hotelRoomFields : undefined,
  }
}

export interface SaveLineResult {
  success: boolean
  error?: string
}

export async function saveLine(data: EditableLineData): Promise<SaveLineResult> {
  const map = getTableMap(data.table)
  if (!map) return { success: false, error: 'Tabella non supportata' }

  // Validation
  if (isNaN(data.quantita) || data.quantita < 0) return { success: false, error: 'Quantita non valida' }
  if (isNaN(data.costoTotale) || !isFinite(data.costoTotale)) return { success: false, error: 'Costo totale non valido' }
  if (isNaN(data.vendutoTotale) || !isFinite(data.vendutoTotale)) return { success: false, error: 'Venduto totale non valido' }
  if (data.costoUnitario != null && (isNaN(data.costoUnitario) || !isFinite(data.costoUnitario))) return { success: false, error: 'Costo unitario non valido' }
  if (data.vendutoUnitario != null && (isNaN(data.vendutoUnitario) || !isFinite(data.vendutoUnitario))) return { success: false, error: 'Venduto unitario non valido' }

  const ivaCostoPct = parseFloat(data.aliquotaIvaCosto)
  const ivaVendutoPct = parseFloat(data.aliquotaIvaVenduto)
  if (isNaN(ivaCostoPct) || ivaCostoPct < 0) return { success: false, error: 'Aliquota IVA costo non valida' }
  if (isNaN(ivaVendutoPct) || ivaVendutoPct < 0) return { success: false, error: 'Aliquota IVA venduto non valida' }

  if (data.commissionePct != null && (data.commissionePct < 0 || data.commissionePct > 100)) {
    return { success: false, error: 'Commissione % deve essere tra 0 e 100' }
  }

  const patch: Record<string, unknown> = {
    [map.descrizione]: data.descrizione,
    [map.quantita]: data.quantita,
    [map.costoTotale]: data.costoTotale,
    [map.vendutoTotale]: data.vendutoTotale,
    [map.note]: data.note,
    [map.aliquotaIvaCosto]: data.aliquotaIvaCosto,
    [map.ivaInclusaCosto]: data.ivaInclusaCosto,
    [map.aliquotaIvaVenduto]: data.aliquotaIvaVenduto,
    [map.ivaInclusaVenduto]: data.ivaInclusaVenduto,
    [map.commissionePct]: data.commissionePct,
    [map.commissioneImporto]: data.commissioneImporto,
  }

  if (map.costoUnitario && data.costoUnitario != null) {
    patch[map.costoUnitario] = data.costoUnitario
  }
  if (map.vendutoUnitario && data.vendutoUnitario != null) {
    patch[map.vendutoUnitario] = data.vendutoUnitario
  }
  if (map.supplierId && data.supplierId) {
    patch[map.supplierId] = data.supplierId
  }

  const { error } = await supabase.from(data.table as any).update(patch).eq('id', data.id)
  if (error) {
    if (error.code === '42501' || error.message?.includes('policy')) {
      return { success: false, error: 'Non hai i permessi per modificare questa voce' }
    }
    return { success: false, error: error.message }
  }
  return { success: true }
}
