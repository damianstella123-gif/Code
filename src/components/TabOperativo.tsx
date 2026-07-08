import { useState, useCallback, useEffect } from 'react'
import { Plus, Edit3, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate } from '@/lib/format'


export type CategoryType = 'hotel' | 'transfer' | 'ristorante' | 'experience' | 'catering' | 'audio_video' | 'allestimenti' | 'staff_interno' | 'staff_esterno' | 'grafica_stampa' | 'varie'

const CATEGORIES: { key: CategoryType; label: string; table: string }[] = [
  { key: 'hotel', label: 'Hotel', table: 'event_hotel_details' },
  { key: 'transfer', label: 'Transfer', table: 'event_supplier_services' },
  { key: 'ristorante', label: 'Ristorante', table: 'event_restaurant_details' },
  { key: 'experience', label: 'Location / Experience', table: 'event_experience_details' },
  { key: 'catering', label: 'Catering', table: 'event_catering_details' },
  { key: 'audio_video', label: 'Audio Video', table: 'event_audio_video_details' },
  { key: 'allestimenti', label: 'Allestimenti', table: 'event_allestimenti_details' },
  { key: 'staff_interno', label: 'Staff Simmetria', table: 'event_staff_interno_details' },
  { key: 'staff_esterno', label: 'Staff Esterno', table: 'event_staff_esterno_details' },
  { key: 'grafica_stampa', label: 'Grafica / Stampa', table: 'event_grafica_stampa_details' },
  { key: 'varie', label: 'Varie', table: 'event_varie_details' },
]

const IVA_OPTIONS = ['22', '10', '5', '4', '0', 'Esente', 'Fuori campo']
const EXPERIENCE_TIPOLOGIE = ['Location', 'Driving Experience', 'Simulatore', 'Team Building', 'Cooking Class', 'Visita Guidata', 'Attivita Speciale']
const CATERING_TIPOLOGIE = ['Welcome Coffee', 'Coffee Break', 'Lunch', 'Dinner', 'Cocktail']
const STAFF_INT_RUOLI = ['Project Manager', 'Account', 'Responsabile Evento', 'Tour Leader', 'Regia', 'Supporto Operativo', 'Altro']
const STAFF_EXT_RUOLI = ['Hostess', 'Steward', 'Tour Leader', 'Promoter', 'Guardaroba', 'Interprete', 'Traduttore', 'Altro']
const RISTORANTE_TIPOLOGIE = ['Pranzo', 'Cena', 'Aperitivo', 'Aperitivo Rinforzato', 'Cocktail', 'Cena di Gala']
const RISTORANTE_MENU_TYPES = ['2 Portate', '3 Portate', '4 Portate', 'Menu Personalizzato']
const GRAFICA_TIPI = ['Badge', 'Menu', 'Cartelli', 'Segnaletica', 'Materiale Stampato', 'Altro']
const VARIE_TIPOLOGIE = ['Assicurazione', 'Permessi / SIAE', 'Spedizioni', 'Gadget / Omaggi', 'Consulenza', 'Voli / Viaggi', 'Licenze / Diritti', 'Commissioni', 'Materiale consumabile', 'Altro']

const HOTEL_SERVIZI: { key: string; label: string; group: 'alloggio' | 'meeting' | 'fb' | 'servizi' }[] = [
  { key: 'pernottamento', label: 'Pernottamento', group: 'alloggio' },
  { key: 'meeting_room', label: 'Sala Meeting', group: 'meeting' },
  { key: 'breakout_room', label: 'Breakout Room', group: 'meeting' },
  { key: 'sala_regia', label: 'Sala Regia', group: 'meeting' },
  { key: 'welcome_coffee', label: 'Welcome Coffee', group: 'fb' },
  { key: 'coffee_break', label: 'Coffee Break', group: 'fb' },
  { key: 'lunch', label: 'Lunch', group: 'fb' },
  { key: 'dinner', label: 'Dinner', group: 'fb' },
  { key: 'cocktail', label: 'Cocktail', group: 'fb' },
  { key: 'aperitivo', label: 'Aperitivo', group: 'fb' },
  { key: 'aperitivo_rinforzato', label: 'Aperitivo Rinforzato', group: 'fb' },
  { key: 'open_bar', label: 'Open Bar', group: 'fb' },
  { key: 'hospitality_desk', label: 'Hospitality Desk', group: 'servizi' },
  { key: 'parking', label: 'Parcheggio', group: 'servizi' },
  { key: 'deposito_bagagli', label: 'Deposito Bagagli', group: 'servizi' },
  { key: 'city_tax', label: 'City Tax', group: 'servizi' },
  { key: 'altro', label: 'Altro', group: 'servizi' },
]
const HOTEL_KEY_TO_LABEL: Record<string, string> = Object.fromEntries(HOTEL_SERVIZI.map(s => [s.key, s.label]))

const ROOM_TYPES = ['DUS', 'Double', 'Twin', 'Triple', 'Suite', 'Junior Suite', 'Altro']

export function getIvaRate(aliquota: string): number {
  const n = parseFloat(aliquota)
  return isNaN(n) ? 0 : n / 100
}

export function calcImponibile(totale: number, aliquota: string, ivaInclusa: boolean): number {
  if (!ivaInclusa) return totale
  const rate = getIvaRate(aliquota)
  return rate > 0 ? totale / (1 + rate) : totale
}

export function calcIva(imponibile: number, aliquota: string): number {
  return imponibile * getIvaRate(aliquota)
}

export const CATEGORY_LABELS: Record<CategoryType, string> = {
  hotel: 'Hotel', transfer: 'Transfer', ristorante: 'Ristorante', experience: 'Location / Experience',
  catering: 'Catering', audio_video: 'Audio Video', allestimenti: 'Allestimenti',
  staff_interno: 'Staff Simmetria', staff_esterno: 'Staff Esterno', grafica_stampa: 'Grafica / Stampa', varie: 'Varie',
}

export function detectSupplierCategory(supplierCategory: string): CategoryType {
  const c = supplierCategory.toLowerCase()
  if (c.includes('hotel') || c.includes('albergo')) return 'hotel'
  if (c.includes('transfer') || c.includes('trasporto') || c.includes('ncc') || c.includes('bus') || c.includes('noleggio')) return 'transfer'
  if (c.includes('ristorante') || c.includes('ristorazione')) return 'ristorante'
  if (c.includes('catering')) return 'catering'
  if (c.includes('experience') || c.includes('location') || c.includes('team building') || c.includes('esperienze')) return 'experience'
  if (c.includes('audio') || c.includes('video') || c.includes('luci') || c.includes('tecnic')) return 'audio_video'
  if (c.includes('dmc') || c.includes('destination management')) return 'experience'
  if (c.includes('allestiment')) return 'allestimenti'
  if (c.includes('staff') && c.includes('intern')) return 'staff_interno'
  if (c.includes('staff') || c.includes('hostess') || c.includes('steward') || c.includes('promoter')) return 'staff_esterno'
  if (c.includes('grafi') || c.includes('stamp') || c.includes('tipografi')) return 'grafica_stampa'
  return 'varie'
}

export function detectSupplierCategoryFromArray(categorie: string[], fallbackCategoria?: string): CategoryType {
  const list = categorie?.length ? categorie : (fallbackCategoria ? [fallbackCategoria] : [])
  if (!list.length) return 'varie'
  return detectSupplierCategory(list[0])
}

export function isDmcCategory(supplierCategory: string): boolean {
  const c = supplierCategory.toLowerCase()
  return c.includes('dmc') || c.includes('destination management')
}

export function isDmcFromArray(categorie: string[], fallbackCategoria?: string): boolean {
  const list = categorie?.length ? categorie : (fallbackCategoria ? [fallbackCategoria] : [])
  return list.some(c => isDmcCategory(c))
}

export type DmcCategoria = 'hotel' | 'voli' | 'transfer' | 'location' | 'attivita' | 'fee_dmc' | 'altro'

const DMC_CATEGORIE: { key: DmcCategoria; label: string; color: string }[] = [
  { key: 'hotel', label: 'Hotel & Accommodation', color: 'var(--blue)' },
  { key: 'voli', label: 'Voli & Trasporto aereo', color: 'var(--yellow)' },
  { key: 'transfer', label: 'Transfer & Navette', color: 'var(--green)' },
  { key: 'location', label: 'Location & Venue', color: 'color-mix(in srgb, var(--red2) 70%, transparent)' },
  { key: 'attivita', label: 'Attivita & Esperienze', color: 'color-mix(in srgb, var(--yellow) 70%, transparent)' },
  { key: 'fee_dmc', label: 'Fee DMC', color: 'var(--muted)' },
  { key: 'altro', label: 'Altro', color: 'var(--muted)' },
]

const DMC_CAT_COLOR: Record<string, string> = Object.fromEntries(DMC_CATEGORIE.map(d => [d.key, d.color]))
const DMC_CAT_LABEL: Record<string, string> = Object.fromEntries(DMC_CATEGORIE.map(d => [d.key, d.label]))

export function SupplierCategoryPanel({ event, supplierId, category, isDmc, otherSupplierCategories }: { event: { id: string; dataInizio?: string }; supplierId: string; category: CategoryType; isDmc?: boolean; otherSupplierCategories?: string[] }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [extras, setExtras] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showExtraForm, setShowExtraForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingExtraId, setEditingExtraId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})
  const [extraForm, setExtraForm] = useState<Record<string, string | number | boolean>>({})
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingExtraId, setDeletingExtraId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const catMeta = CATEGORIES.find(c => c.key === category)!
  const showExtras = category !== 'varie'

  const loadItems = useCallback(async () => {
    setLoading(true)
    let query = supabase.from(catMeta.table).select('*').eq('event_id', event.id).eq('supplier_id', supplierId)
    if (category === 'transfer') {
      query = query.eq('categoria', 'transfer')
    }
    const { data } = await query.order('created_at', { ascending: true })
    setItems(data ?? [])
    if (showExtras) {
      const { data: extData } = await supabase.from('event_varie_details').select('*').eq('event_id', event.id).eq('supplier_id', supplierId).order('created_at', { ascending: true })
      setExtras(extData ?? [])
    }
    setLoading(false)
  }, [event.id, supplierId, category, catMeta.table, showExtras])

  useEffect(() => { loadItems() }, [loadItems])

  function resetForm() {
    const base: Record<string, string | number | boolean> = {
      aliquota_iva_venduto: '22', iva_inclusa_venduto: false,
      aliquota_iva_costo: '22', iva_inclusa_costo: false,
    }
    if (category === 'hotel') {
      Object.assign(base, { sotto_categoria: 'pernottamento', titolo: '', data: '', ora_inizio: '', ora_fine: '', check_in_date: '', check_in_time: '', check_out_date: '', check_out_time: '', quantita: '1', pax: '', room_type: '', luogo: '', meeting_pax: '', meeting_setup: '', meeting_equipment: '', natural_light_preference: false, note: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '', aliquota_iva_venduto: '10', aliquota_iva_costo: '10', payment_mode: 'cliente', rooms_client_count: '', rooms_simmetria_count: '', rooms_total_count: '', room_rate_client: '', room_cost_simmetria: '', commissione_attiva: false, commissione_percentuale: '', commissione_base: '', commissione_importo: '', commissione_note: '' })
    } else if (category === 'transfer') {
      Object.assign(base, { titolo: '', data: '', ora_inizio: '', ora_fine: '', partenza: '', destinazione: '', quantita: '1', luogo: '', note: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    } else if (category === 'ristorante') {
      Object.assign(base, { tipologia_servizio: '', data: '', ora_inizio: '', ora_fine: '', pax_previsti: '', pax_confermati: '', menu_portate: '', menu_descrizione: '', beverage_incluso: false, area_riservata: false, sala_privata: false, esclusiva_parziale: false, esclusiva_totale: false, nome_sala: '', note_location: '', num_vegetariani: '', num_vegani: '', allergie: '', intolleranze: '', richieste_alimentari: '', note_operative: '', budget_per_persona: '', budget_totale: '', costo_per_persona: '', costo_totale_reale: '', aliquota_iva_venduto: '10', aliquota_iva_costo: '10' })
    } else if (category === 'experience') {
      Object.assign(base, { nome_attivita: '', tipologia: '', data: '', ora_inizio: '', ora_fine: '', location: '', pax: '', durata_minuti: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '', ...(isDmc ? { dmc_categoria: '' } : {}) })
    } else if (category === 'catering') {
      Object.assign(base, { tipologia: '', data: '', ora_inizio: '', ora_fine: '', pax: '', note: '', venduto_per_persona: '', venduto_totale: '', costo_per_persona: '', costo_totale: '', aliquota_iva_venduto: '10', aliquota_iva_costo: '10' })
    } else if (category === 'audio_video') {
      Object.assign(base, { tipologia_servizio: '', quantita: '1', data_montaggio: '', ora_montaggio: '', data_prove: '', ora_prove: '', data_evento: '', ora_evento: '', data_smontaggio: '', ora_smontaggio: '', materiale: '', tecnici: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    } else if (category === 'allestimenti') {
      Object.assign(base, { descrizione: '', quantita: '1', area_utilizzo: '', data_montaggio: '', ora_montaggio: '', data_smontaggio: '', ora_smontaggio: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    } else if (category === 'staff_interno') {
      Object.assign(base, { nome: '', cognome: '', ruolo: '', data: '', ora_inizio: '', ora_fine: '', quantita: '1', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_giornaliero: '', costo_totale: '' })
    } else if (category === 'staff_esterno') {
      Object.assign(base, { nome: '', cognome: '', ruolo: '', quantita: '1', data: '', ora_inizio: '', ora_fine: '', lingue: '', abbigliamento: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    } else if (category === 'grafica_stampa') {
      Object.assign(base, { tipo_materiale: '', quantita: '1', formato: '', data_consegna: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    } else {
      Object.assign(base, { descrizione: '', quantita: '1', data: '', ora_inizio: '', note: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    }
    setForm(base)
  }

  function startAdd() { resetForm(); setEditingId(null); setShowForm(true) }

  function startEdit(item: Record<string, unknown>) {
    setEditingId(item.id as string)
    const f: Record<string, string | number | boolean> = {}
    for (const [k, v] of Object.entries(item)) {
      if (k === 'id' || k === 'event_id' || k === 'supplier_id' || k === 'created_at' || k === 'updated_at') continue
      f[k] = v == null ? '' : v as string | number | boolean
    }
    setForm(f)
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const record: Record<string, unknown> = { event_id: event.id, supplier_id: supplierId }
    const numOrNull = (key: string) => form[key] !== '' && form[key] !== undefined ? Number(form[key]) : null
    const strOrNull = (key: string) => (form[key] && String(form[key]).trim()) || null
    const strOrEmpty = (key: string) => String(form[key] ?? '')

    record.aliquota_iva_venduto = strOrEmpty('aliquota_iva_venduto') || '22'
    record.iva_inclusa_venduto = !!form.iva_inclusa_venduto
    record.aliquota_iva_costo = strOrEmpty('aliquota_iva_costo') || '22'
    record.iva_inclusa_costo = !!form.iva_inclusa_costo

    if (category === 'hotel') {
      const sotto = strOrEmpty('sotto_categoria') || 'pernottamento'
      const qty = numOrNull('quantita') ?? 1
      const pax = numOrNull('pax')
      const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      const multiplier = pax ?? qty

      const paymentMode = strOrNull('payment_mode') || 'cliente'
      const roomsClient = numOrNull('rooms_client_count') ?? 0
      const roomsSimmetria = numOrNull('rooms_simmetria_count') ?? 0
      const roomsTotal = roomsClient + roomsSimmetria
      const roomRateClient = numOrNull('room_rate_client')
      const roomCostSimmetria = numOrNull('room_cost_simmetria')
      const commissioneAttiva = !!form.commissione_attiva
      const commissionePerc = numOrNull('commissione_percentuale')
      const commissioneBase = numOrNull('commissione_base') ?? (roomRateClient && roomsClient ? roomsClient * roomRateClient : null)
      const commissioneImporto = commissioneAttiva && commissioneBase && commissionePerc
        ? commissioneBase * commissionePerc / 100
        : null

      let computedCostoTotale = numOrNull('costo_totale')
      let computedVendutoTotale = numOrNull('venduto_totale')

      if (sotto === 'pernottamento' && paymentMode) {
        if (!computedCostoTotale && roomCostSimmetria && roomsSimmetria) {
          computedCostoTotale = roomCostSimmetria * roomsSimmetria
        }
        if (!computedVendutoTotale && roomRateClient && roomsClient) {
          computedVendutoTotale = roomRateClient * roomsClient
        }
      }

      if (!computedVendutoTotale) computedVendutoTotale = vu ? vu * multiplier : null
      if (!computedCostoTotale) computedCostoTotale = cu ? cu * multiplier : null

      Object.assign(record, {
        tipo: sotto,
        sotto_categoria: sotto,
        titolo: strOrEmpty('titolo'),
        data: strOrNull('data'),
        ora_inizio: strOrNull('ora_inizio'),
        ora_fine: strOrNull('ora_fine'),
        check_in_date: strOrNull('check_in_date'),
        check_in_time: strOrNull('check_in_time'),
        check_out_date: strOrNull('check_out_date'),
        check_out_time: strOrNull('check_out_time'),
        quantita: sotto === 'pernottamento' ? (roomsTotal || qty) : qty,
        pax,
        room_type: strOrEmpty('room_type'),
        luogo: strOrEmpty('luogo'),
        meeting_pax: numOrNull('meeting_pax'),
        meeting_setup: strOrEmpty('meeting_setup'),
        meeting_equipment: strOrEmpty('meeting_equipment'),
        natural_light: !!form.natural_light_preference,
        natural_light_preference: !!form.natural_light_preference,
        coffee_break_notes: '',
        lunch_notes: '',
        dinner_notes: '',
        coffee_station_notes: '',
        note: strOrEmpty('note'),
        note_operative: strOrEmpty('note_operative'),
        venduto_unitario: vu,
        venduto_totale: computedVendutoTotale,
        costo_unitario: cu,
        costo_totale: computedCostoTotale,
        payment_mode: sotto === 'pernottamento' ? paymentMode : null,
        rooms_client_count: sotto === 'pernottamento' ? roomsClient : null,
        rooms_simmetria_count: sotto === 'pernottamento' ? roomsSimmetria : null,
        rooms_total_count: sotto === 'pernottamento' ? roomsTotal : null,
        room_rate_client: sotto === 'pernottamento' ? roomRateClient : null,
        room_cost_simmetria: sotto === 'pernottamento' ? roomCostSimmetria : null,
        commissione_attiva: sotto === 'pernottamento' ? commissioneAttiva : false,
        commissione_percentuale: sotto === 'pernottamento' ? commissionePerc : null,
        commissione_base: sotto === 'pernottamento' ? commissioneBase : null,
        commissione_importo: sotto === 'pernottamento' ? commissioneImporto : null,
        commissione_note: sotto === 'pernottamento' ? (strOrNull('commissione_note') || null) : null,
        commissione_pct: sotto === 'pernottamento' && commissioneAttiva ? commissionePerc : null,
      })
    } else if (category === 'transfer') {
      const qty = numOrNull('quantita') ?? 1; const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      Object.assign(record, { titolo: strOrEmpty('titolo') || 'Transfer', categoria: 'transfer', data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'), partenza: strOrEmpty('partenza'), destinazione: strOrEmpty('destinazione'), quantita: qty, luogo: strOrEmpty('luogo'), note: strOrEmpty('note'), venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null), costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null) })
    } else if (category === 'ristorante') {
      const paxP = numOrNull('pax_previsti'); const paxC = numOrNull('pax_confermati'); const pax = paxC ?? paxP ?? 1
      const bpp = numOrNull('budget_per_persona'); const cpp = numOrNull('costo_per_persona')
      Object.assign(record, { tipologia_servizio: strOrEmpty('tipologia_servizio'), data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'), pax_previsti: paxP, pax_confermati: paxC, menu_portate: strOrEmpty('menu_portate'), menu_descrizione: strOrEmpty('menu_descrizione'), beverage_incluso: !!form.beverage_incluso, area_riservata: !!form.area_riservata, sala_privata: !!form.sala_privata, esclusiva_parziale: !!form.esclusiva_parziale, esclusiva_totale: !!form.esclusiva_totale, nome_sala: strOrEmpty('nome_sala'), note_location: strOrEmpty('note_location'), num_vegetariani: numOrNull('num_vegetariani'), num_vegani: numOrNull('num_vegani'), allergie: strOrEmpty('allergie'), intolleranze: strOrEmpty('intolleranze'), richieste_alimentari: strOrEmpty('richieste_alimentari'), note_operative: strOrEmpty('note_operative'), budget_per_persona: bpp, budget_totale: numOrNull('budget_totale') ?? (bpp ? bpp * pax : null), costo_per_persona: cpp, costo_totale_reale: numOrNull('costo_totale_reale') ?? (cpp ? cpp * pax : null) })
    } else if (category === 'experience') {
      const pax = numOrNull('pax') ?? 1; const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      Object.assign(record, { nome_attivita: strOrEmpty('nome_attivita'), tipologia: strOrEmpty('tipologia'), data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'), location: strOrEmpty('location'), pax, durata_minuti: numOrNull('durata_minuti'), note_operative: strOrEmpty('note_operative'), venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * pax : null), costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * pax : null), ...(isDmc ? { dmc_categoria: strOrEmpty('dmc_categoria') || null } : {}) })
    } else if (category === 'catering') {
      const pax = numOrNull('pax') ?? 1; const vpp = numOrNull('venduto_per_persona'); const cpp = numOrNull('costo_per_persona')
      Object.assign(record, { tipologia: strOrEmpty('tipologia'), data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'), pax, note: strOrEmpty('note'), venduto_per_persona: vpp, venduto_totale: numOrNull('venduto_totale') ?? (vpp ? vpp * pax : null), costo_per_persona: cpp, costo_totale: numOrNull('costo_totale') ?? (cpp ? cpp * pax : null) })
    } else if (category === 'audio_video') {
      const qty = numOrNull('quantita') ?? 1; const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      Object.assign(record, { tipologia_servizio: strOrEmpty('tipologia_servizio'), quantita: qty, data_montaggio: strOrNull('data_montaggio'), ora_montaggio: strOrNull('ora_montaggio'), data_prove: strOrNull('data_prove'), ora_prove: strOrNull('ora_prove'), data_evento: strOrNull('data_evento'), ora_evento: strOrNull('ora_evento'), data_smontaggio: strOrNull('data_smontaggio'), ora_smontaggio: strOrNull('ora_smontaggio'), materiale: strOrEmpty('materiale'), tecnici: strOrEmpty('tecnici'), note_operative: strOrEmpty('note_operative'), venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null), costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null) })
    } else if (category === 'allestimenti') {
      const qty = numOrNull('quantita') ?? 1; const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      Object.assign(record, { descrizione: strOrEmpty('descrizione'), quantita: qty, area_utilizzo: strOrEmpty('area_utilizzo'), data_montaggio: strOrNull('data_montaggio'), ora_montaggio: strOrNull('ora_montaggio'), data_smontaggio: strOrNull('data_smontaggio'), ora_smontaggio: strOrNull('ora_smontaggio'), note_operative: strOrEmpty('note_operative'), venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null), costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null) })
    } else if (category === 'staff_interno') {
      const qty = numOrNull('quantita') ?? 1; const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      Object.assign(record, { nome: strOrEmpty('nome'), cognome: strOrEmpty('cognome'), risorsa: `${strOrEmpty('nome')} ${strOrEmpty('cognome')}`.trim(), ruolo: strOrEmpty('ruolo'), quantita: qty, data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'), note: strOrEmpty('note_operative'), note_operative: strOrEmpty('note_operative'), venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null), costo_giornaliero: numOrNull('costo_giornaliero'), costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null) })
    } else if (category === 'staff_esterno') {
      const qty = numOrNull('quantita') ?? 1; const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      Object.assign(record, { nome: strOrEmpty('nome'), cognome: strOrEmpty('cognome'), ruolo: strOrEmpty('ruolo'), quantita: qty, data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'), lingue: strOrEmpty('lingue'), abbigliamento: strOrEmpty('abbigliamento'), note_operative: strOrEmpty('note_operative'), venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null), costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null) })
    } else if (category === 'grafica_stampa') {
      const qty = numOrNull('quantita') ?? 1; const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      Object.assign(record, { tipo_materiale: strOrEmpty('tipo_materiale'), quantita: qty, formato: strOrEmpty('formato'), data_consegna: strOrNull('data_consegna'), note_operative: strOrEmpty('note_operative'), venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null), costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null) })
    } else {
      const qty = numOrNull('quantita') ?? 1; const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      Object.assign(record, { tipologia: strOrEmpty('tipologia') || null, descrizione: strOrEmpty('descrizione'), quantita: qty, data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), note: strOrEmpty('note'), venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null), costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null) })
    }

    let error: { message: string } | null = null
    if (editingId) {
      const res = await supabase.from(catMeta.table).update(record).eq('id', editingId)
      error = res.error
    } else {
      record.id = crypto.randomUUID()
      const res = await supabase.from(catMeta.table).insert(record)
      error = res.error
    }
    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    setShowForm(false); setEditingId(null)
    await loadItems()
  }

  async function handleDelete() {
    if (!deletingId) return
    await supabase.from(catMeta.table).delete().eq('id', deletingId)
    setDeletingId(null)
    await loadItems()
  }

  function resetExtraForm() {
    setExtraForm({ descrizione: '', quantita: '1', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '', note: '', data: event.dataInizio || '', ora_inizio: '', ora_fine: '' })
  }

  function startAddExtra() { resetExtraForm(); setEditingExtraId(null); setShowExtraForm(true) }

  function startEditExtra(item: Record<string, unknown>) {
    const f: Record<string, string | number | boolean> = {}
    for (const [k, v] of Object.entries(item)) {
      if (v === null || v === undefined) f[k] = ''
      else if (typeof v === 'boolean') f[k] = v
      else f[k] = String(v)
    }
    setExtraForm(f)
    setEditingExtraId(item.id as string)
    setShowExtraForm(true)
  }

  async function handleSaveExtra() {
    setSaving(true); setSaveError(null)
    const qty = Number(extraForm.quantita) || 1
    const vu = extraForm.venduto_unitario ? Number(extraForm.venduto_unitario) : null
    const cu = extraForm.costo_unitario ? Number(extraForm.costo_unitario) : null
    const record: Record<string, unknown> = {
      event_id: event.id,
      supplier_id: supplierId,
      descrizione: String(extraForm.descrizione || '') || 'Extra',
      quantita: qty,
      venduto_unitario: vu ?? 0,
      venduto_totale: extraForm.venduto_totale ? Number(extraForm.venduto_totale) : (vu ? vu * qty : 0),
      costo_unitario: cu ?? 0,
      costo_totale: extraForm.costo_totale ? Number(extraForm.costo_totale) : (cu ? cu * qty : 0),
      note: String(extraForm.note || ''),
      data: extraForm.data || null,
      ora_inizio: extraForm.ora_inizio || null,
      ora_fine: extraForm.ora_fine || null,
    }
    let error: { message: string } | null = null
    if (editingExtraId) {
      const res = await supabase.from('event_varie_details').update(record).eq('id', editingExtraId)
      error = res.error
    } else {
      record.id = crypto.randomUUID()
      const res = await supabase.from('event_varie_details').insert(record)
      error = res.error
    }
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setShowExtraForm(false); setEditingExtraId(null)
    await loadItems()
  }

  async function handleDeleteExtra() {
    if (!deletingExtraId) return
    await supabase.from('event_varie_details').delete().eq('id', deletingExtraId)
    setDeletingExtraId(null)
    await loadItems()
  }

  function getItemTitle(item: Record<string, unknown>): string {
    switch (category) {
      case 'hotel': { const _s = (item.sotto_categoria as string) || 'pernottamento'; const _l = HOTEL_KEY_TO_LABEL[_s] || _s; const _t = item.titolo as string; return _t ? `${_l} - ${_t}` : _l }
      case 'transfer': return (item.titolo as string) || 'Transfer'
      case 'ristorante': return (item.tipologia_servizio as string) || 'Ristorante'
      case 'experience': return (item.nome_attivita as string) || (item.tipologia as string) || 'Experience'
      case 'catering': return (item.tipologia as string) || 'Catering'
      case 'audio_video': return (item.tipologia_servizio as string) || 'Audio Video'
      case 'allestimenti': return (item.descrizione as string) || 'Allestimento'
      case 'staff_interno': { const sn = [(item.nome as string), (item.cognome as string)].filter(Boolean).join(' ') || (item.risorsa as string); return sn ? `${sn} - ${(item.ruolo as string) || 'Staff'}` : (item.ruolo as string) || 'Staff Simmetria' }
      case 'staff_esterno': { const sn = [(item.nome as string), (item.cognome as string)].filter(Boolean).join(' '); return sn ? `${sn} - ${(item.ruolo as string) || 'Staff'}` : (item.ruolo as string) || 'Staff Esterno' }
      case 'grafica_stampa': return (item.tipo_materiale as string) || 'Grafica'
      default: { const tip = (item.tipologia as string); const desc = (item.descrizione as string) || 'Voce'; return tip ? `${tip} — ${desc}` : desc }
    }
  }

  function getItemEcon(item: Record<string, unknown>): { venduto: number; costo: number } {
    let venduto = 0, costo = 0
    if (category === 'ristorante') {
      const pax = (item.pax_confermati as number) ?? (item.pax_previsti as number) ?? 1
      venduto = (item.budget_totale as number) ?? ((item.budget_per_persona as number) ? (item.budget_per_persona as number) * pax : 0)
      costo = (item.costo_totale_reale as number) ?? ((item.costo_per_persona as number) ? (item.costo_per_persona as number) * pax : 0)
    } else if (category === 'catering') {
      const pax = (item.pax as number) ?? 1
      venduto = (item.venduto_totale as number) ?? ((item.venduto_per_persona as number) ? (item.venduto_per_persona as number) * pax : 0)
      costo = (item.costo_totale as number) ?? ((item.costo_per_persona as number) ? (item.costo_per_persona as number) * pax : 0)
    } else if (category === 'staff_interno') {
      venduto = (item.venduto_totale as number) ?? 0
      costo = (item.costo_totale as number) ?? (item.costo_giornaliero as number) ?? 0
    } else {
      const qty = (item.quantita as number) ?? (item.pax as number) ?? 1
      venduto = (item.venduto_totale as number) ?? ((item.venduto_unitario as number) ? (item.venduto_unitario as number) * qty : 0)
      costo = (item.costo_totale as number) ?? ((item.costo_unitario as number) ? (item.costo_unitario as number) * qty : 0)
    }
    return { venduto, costo }
  }

  const upd = (key: string, val: string | number | boolean) => setForm(prev => ({ ...prev, [key]: val }))
  const inp = (key: string, label: string, type = 'text') => (
    <div>
      <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>{label}</label>
      <input type={type} value={String(form[key] ?? '')} onChange={e => upd(key, e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }} />
    </div>
  )
  const sel = (key: string, label: string, options: string[]) => (
    <div>
      <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>{label}</label>
      <select value={String(form[key] ?? '')} onChange={e => upd(key, e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
        <option value="">-- Seleziona --</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
  const chk = (key: string, label: string) => (
    <div className="flex items-center gap-2">
      <input type="checkbox" checked={!!form[key]} onChange={e => upd(key, e.target.checked)} id={`scp_${key}_${supplierId}`} />
      <label htmlFor={`scp_${key}_${supplierId}`} className="text-xs" style={{ color: 'var(--text)' }}>{label}</label>
    </div>
  )
  const ivaFields = () => (
    <div className="sm:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 mt-3" style={{ borderTop: '1px solid var(--line)' }}>
      {sel('aliquota_iva_venduto', 'IVA Venduto %', IVA_OPTIONS)}
      {chk('iva_inclusa_venduto', 'IVA inclusa nel venduto')}
      {sel('aliquota_iva_costo', 'IVA Costo %', IVA_OPTIONS)}
      {chk('iva_inclusa_costo', 'IVA inclusa nel costo')}
    </div>
  )

  const renderForm = () => {
    if (category === 'hotel') {
      const sotto = String(form.sotto_categoria || 'pernottamento')
      const svc = HOTEL_SERVIZI.find(s => s.key === sotto)
      const group = svc?.group || 'servizi'

      const renderFieldsBySotto = () => {
        if (sotto === 'pernottamento') {
          const payMode = String(form.payment_mode || 'cliente')
          return (
            <>
              {inp('check_in_date', 'Check-in data', 'date')}{inp('check_in_time', 'Check-in ora', 'time')}
              {inp('check_out_date', 'Check-out data', 'date')}{inp('check_out_time', 'Check-out ora', 'time')}
              <div>
                <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Tipologia camera</label>
                <select value={String(form.room_type || '')} onChange={e => upd('room_type', e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
                  <option value="">-- Seleziona --</option>
                  {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="text-[10px] uppercase tracking-wide block mb-1.5" style={{ color: 'var(--muted)' }}>Modalita pagamento</label>
                <div className="flex gap-2">
                  {[{k:'cliente',l:'Cliente'},{k:'simmetria',l:'Simmetria'},{k:'misto',l:'Misto'}].map(o => (
                    <button key={o.k} type="button"
                      onClick={() => {
                        upd('payment_mode', o.k)
                        if (o.k === 'cliente') upd('rooms_simmetria_count', '')
                        if (o.k === 'simmetria') upd('rooms_client_count', '')
                      }}
                      className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: payMode === o.k ? 'var(--red)' : 'var(--panel2)',
                        color: payMode === o.k ? '#fff' : 'var(--text)',
                        border: `1px solid ${payMode === o.k ? 'var(--red)' : 'var(--line)'}`,
                      }}>{o.l}</button>
                  ))}
                </div>
              </div>
              {(payMode === 'cliente' || payMode === 'misto') && (
                <>
                  {inp('rooms_client_count', 'N. Camere cliente', 'number')}
                  {inp('room_rate_client', 'Tariffa/camera cliente', 'number')}
                </>
              )}
              {(payMode === 'simmetria' || payMode === 'misto') && (
                <>
                  {inp('rooms_simmetria_count', 'N. Camere Simmetria', 'number')}
                  {inp('room_cost_simmetria', 'Costo/camera Simmetria', 'number')}
                </>
              )}
              {(payMode === 'cliente' || payMode === 'misto') && (
                <div className="sm:col-span-3" style={{ borderTop: '1px solid var(--line)', paddingTop: '10px', marginTop: '4px' }}>
                  <div className="flex items-center gap-3 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!form.commissione_attiva} onChange={e => upd('commissione_attiva', e.target.checked)} className="w-4 h-4 rounded" />
                      <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>Commissione attiva</span>
                    </label>
                  </div>
                  {!!form.commissione_attiva && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {inp('commissione_percentuale', 'Commissione %', 'number')}
                      {inp('commissione_base', 'Base calcolo', 'number')}
                      <div>
                        <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Importo commissione</label>
                        <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--green)', border: '1px solid var(--line)' }}>
                          {(() => {
                            const base = Number(form.commissione_base) || (Number(form.rooms_client_count) * Number(form.room_rate_client)) || 0
                            const pct = Number(form.commissione_percentuale) || 0
                            return base && pct ? `€ ${(base * pct / 100).toFixed(2)}` : '—'
                          })()}
                        </div>
                      </div>
                      {inp('commissione_note', 'Note commissione')}
                    </div>
                  )}
                </div>
              )}
              <div className="sm:col-span-3">{inp('note', 'Note camere / Rooming list')}</div>
            </>
          )
        }
        if (group === 'meeting') return (
          <>
            {inp('data', 'Data', 'date')}{inp('ora_inizio', 'Ora inizio', 'time')}{inp('ora_fine', 'Ora fine', 'time')}
            {inp('luogo', 'Nome sala')}{inp('meeting_pax', 'Pax', 'number')}{inp('meeting_setup', 'Disposizione sala')}
            {inp('meeting_equipment', 'Attrezzature')}{inp('quantita', 'N. Sale', 'number')}
            {chk('natural_light_preference', 'Preferenza luce naturale')}
            <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
          </>
        )
        if (group === 'fb') return (
          <>
            {inp('data', 'Data', 'date')}{inp('ora_inizio', 'Ora inizio', 'time')}{inp('ora_fine', 'Ora fine', 'time')}
            {inp('pax', 'Pax', 'number')}{inp('luogo', 'Sala / Location')}
            <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
          </>
        )
        // group === 'servizi'
        if (sotto === 'city_tax') return (
          <>
            {inp('quantita', 'N. Notti', 'number')}{inp('pax', 'N. Persone', 'number')}
            <div className="sm:col-span-3">{inp('note_operative', 'Note')}</div>
          </>
        )
        if (sotto === 'parking') return (
          <>
            {inp('quantita', 'N. Posti', 'number')}{inp('data', 'Data inizio', 'date')}{inp('ora_inizio', 'Data fine (o note)', 'text')}
            <div className="sm:col-span-3">{inp('note_operative', 'Note')}</div>
          </>
        )
        return (
          <>
            {inp('data', 'Data', 'date')}{inp('ora_inizio', 'Ora', 'time')}{inp('quantita', 'Quantita', 'number')}
            <div className="sm:col-span-3">{inp('note_operative', 'Note')}</div>
          </>
        )
      }

      const econLabel = sotto === 'pernottamento' ? 'camera' : (group === 'fb' ? 'pax' : 'unita')

      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Tipo servizio</label>
              <select value={sotto} onChange={e => upd('sotto_categoria', e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
                <optgroup label="Alloggio">
                  {HOTEL_SERVIZI.filter(s => s.group === 'alloggio').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </optgroup>
                <optgroup label="Sale">
                  {HOTEL_SERVIZI.filter(s => s.group === 'meeting').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </optgroup>
                <optgroup label="F&B">
                  {HOTEL_SERVIZI.filter(s => s.group === 'fb').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </optgroup>
                <optgroup label="Servizi">
                  {HOTEL_SERVIZI.filter(s => s.group === 'servizi').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </optgroup>
              </select>
            </div>
            {inp('titolo', 'Titolo / Descrizione')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" style={{ borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
            {renderFieldsBySotto()}
          </div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Economico</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {inp('venduto_unitario', `Venduto/${econLabel}`, 'number')}{inp('venduto_totale', 'Venduto totale', 'number')}
              {inp('costo_unitario', `Costo/${econLabel}`, 'number')}{inp('costo_totale', 'Costo totale', 'number')}
            </div>
            {ivaFields()}
          </div>
        </div>
      )
    }
    if (category === 'transfer') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('titolo', 'Titolo corsa')}{inp('data', 'Data', 'date')}{inp('ora_inizio', 'Ora', 'time')}
        {inp('partenza', 'Partenza')}{inp('destinazione', 'Destinazione')}{inp('quantita', 'Pax/Mezzi', 'number')}
        {inp('venduto_unitario', 'Venduto unit.', 'number')}{inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo unit.', 'number')}{inp('costo_totale', 'Costo totale', 'number')}
        <div className="sm:col-span-3">{inp('note', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (category === 'ristorante') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sel('tipologia_servizio', 'Tipologia', RISTORANTE_TIPOLOGIE)}
        {inp('data', 'Data', 'date')}{inp('ora_inizio', 'Ora inizio', 'time')}{inp('ora_fine', 'Ora fine', 'time')}
        {inp('pax_previsti', 'Pax previsti', 'number')}{inp('pax_confermati', 'Pax confermati', 'number')}
        {sel('menu_portate', 'Tipo menu', RISTORANTE_MENU_TYPES)}{inp('nome_sala', 'Sala')}{inp('note_location', 'Note location')}
        {chk('beverage_incluso', 'Beverage incluso')}{chk('area_riservata', 'Area riservata')}{chk('sala_privata', 'Sala privata')}
        {chk('esclusiva_parziale', 'Esclusiva parziale')}{chk('esclusiva_totale', 'Esclusiva totale')}
        {inp('num_vegetariani', 'Vegetariani', 'number')}{inp('num_vegani', 'Vegani', 'number')}
        {inp('allergie', 'Allergie')}{inp('intolleranze', 'Intolleranze')}{inp('richieste_alimentari', 'Richieste alimentari')}
        {inp('budget_per_persona', 'Venduto/persona', 'number')}{inp('budget_totale', 'Venduto totale', 'number')}
        {inp('costo_per_persona', 'Costo/persona', 'number')}{inp('costo_totale_reale', 'Costo totale', 'number')}
        <div className="sm:col-span-3">{inp('menu_descrizione', 'Descrizione menu')}</div>
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (category === 'experience') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {isDmc && (
          <div>
            <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Categoria servizio DMC</label>
            <select value={String(form.dmc_categoria ?? '')} onChange={e => upd('dmc_categoria', e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
              <option value="">-- Seleziona --</option>
              {DMC_CATEGORIE.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
        )}
        {inp('nome_attivita', 'Nome attivita')}{sel('tipologia', 'Tipologia', EXPERIENCE_TIPOLOGIE)}
        {inp('data', 'Data', 'date')}{inp('ora_inizio', 'Ora inizio', 'time')}{inp('ora_fine', 'Ora fine', 'time')}
        {inp('location', 'Location')}{inp('pax', 'Pax', 'number')}{inp('durata_minuti', 'Durata (min)', 'number')}
        {inp('venduto_unitario', 'Venduto/pax', 'number')}{inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo/pax', 'number')}{inp('costo_totale', 'Costo totale', 'number')}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (category === 'catering') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sel('tipologia', 'Tipologia', CATERING_TIPOLOGIE)}
        {inp('data', 'Data', 'date')}{inp('ora_inizio', 'Ora inizio', 'time')}{inp('ora_fine', 'Ora fine', 'time')}
        {inp('pax', 'Pax', 'number')}
        {inp('venduto_per_persona', 'Venduto/pax', 'number')}{inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_per_persona', 'Costo/pax', 'number')}{inp('costo_totale', 'Costo totale', 'number')}
        <div className="sm:col-span-3">{inp('note', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (category === 'audio_video') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('tipologia_servizio', 'Servizio')}{inp('quantita', 'Quantita', 'number')}
        {inp('data_montaggio', 'Data montaggio', 'date')}{inp('ora_montaggio', 'Ora montaggio', 'time')}
        {inp('data_prove', 'Data prove', 'date')}{inp('ora_prove', 'Ora prove', 'time')}
        {inp('data_evento', 'Data evento', 'date')}{inp('ora_evento', 'Ora evento', 'time')}
        {inp('data_smontaggio', 'Data smontaggio', 'date')}{inp('ora_smontaggio', 'Ora smontaggio', 'time')}
        {inp('materiale', 'Materiale')}{inp('tecnici', 'Tecnici')}
        {inp('venduto_unitario', 'Venduto unit.', 'number')}{inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo unit.', 'number')}{inp('costo_totale', 'Costo totale', 'number')}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (category === 'allestimenti') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('descrizione', 'Descrizione')}{inp('quantita', 'Quantita', 'number')}{inp('area_utilizzo', 'Area utilizzo')}
        {inp('data_montaggio', 'Data montaggio', 'date')}{inp('ora_montaggio', 'Ora montaggio', 'time')}
        {inp('data_smontaggio', 'Data smontaggio', 'date')}{inp('ora_smontaggio', 'Ora smontaggio', 'time')}
        {inp('venduto_unitario', 'Venduto unit.', 'number')}{inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo unit.', 'number')}{inp('costo_totale', 'Costo totale', 'number')}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (category === 'staff_interno') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('nome', 'Nome')}{inp('cognome', 'Cognome')}{sel('ruolo', 'Ruolo', STAFF_INT_RUOLI)}
        {inp('data', 'Data', 'date')}{inp('ora_inizio', 'Ora inizio', 'time')}{inp('ora_fine', 'Ora fine', 'time')}
        {inp('quantita', 'Quantita', 'number')}
        {inp('venduto_unitario', 'Venduto/unit.', 'number')}{inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo/unit.', 'number')}{inp('costo_giornaliero', 'Costo giornaliero', 'number')}{inp('costo_totale', 'Costo totale', 'number')}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (category === 'staff_esterno') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('nome', 'Nome')}{inp('cognome', 'Cognome')}{sel('ruolo', 'Ruolo', STAFF_EXT_RUOLI)}
        {inp('quantita', 'Quantita', 'number')}
        {inp('data', 'Data', 'date')}{inp('ora_inizio', 'Ora inizio', 'time')}{inp('ora_fine', 'Ora fine', 'time')}
        {inp('lingue', 'Lingue')}{inp('abbigliamento', 'Abbigliamento')}
        {inp('venduto_unitario', 'Venduto/unit.', 'number')}{inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo/unit.', 'number')}{inp('costo_totale', 'Costo totale', 'number')}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (category === 'grafica_stampa') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sel('tipo_materiale', 'Tipo materiale', GRAFICA_TIPI)}{inp('quantita', 'Quantita', 'number')}{inp('formato', 'Formato')}
        {inp('data_consegna', 'Data consegna', 'date')}
        {inp('venduto_unitario', 'Venduto unit.', 'number')}{inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo unit.', 'number')}{inp('costo_totale', 'Costo totale', 'number')}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Tipologia</label>
          <select value={String(form.tipologia || '')} onChange={e => upd('tipologia', e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
            <option value="">— Generica —</option>
            {VARIE_TIPOLOGIE.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {inp('descrizione', 'Descrizione')}{inp('quantita', 'Quantita', 'number')}
        {inp('data', 'Data', 'date')}{inp('ora_inizio', 'Ora', 'time')}
        {inp('venduto_unitario', 'Venduto/unit.', 'number')}{inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo/unit.', 'number')}{inp('costo_totale', 'Costo totale', 'number')}
        <div className="sm:col-span-3">{inp('note', 'Note')}</div>
        {ivaFields()}
      </div>
    )
  }

  return (
    <div className="px-5 pb-5 pt-2 space-y-4" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          Scheda {CATEGORY_LABELS[category]} ({items.length})
        </p>
        <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--red2)', color: '#fff' }}>
          <Plus className="w-3 h-3" /> Aggiungi
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{editingId ? 'Modifica' : 'Nuova voce'}</p>
            <button onClick={() => { setShowForm(false); setEditingId(null) }}><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
          </div>
          {renderForm()}
          {saveError && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>Errore: {saveError}</p>}
          <div className="flex items-center gap-2 pt-2 justify-end" style={{ borderTop: '1px solid var(--line)' }}>
            <button onClick={() => { setShowForm(false); setEditingId(null); setSaveError(null) }} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ color: 'var(--muted)' }}>Annulla</button>
            <button disabled={saving} onClick={handleSave} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--red2)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Salvataggio...' : editingId ? 'Salva' : 'Aggiungi'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse text-xs text-center py-4" style={{ color: 'var(--muted)' }}>Caricamento...</div>
      ) : items.length === 0 && !showForm ? (
        <p className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}>Nessuna voce. Clicca "Aggiungi" per inserire.</p>
      ) : items.length > 0 ? (
        <div className="space-y-2">
          {items.map(item => {
            const id = item.id as string
            const econ = getItemEcon(item)
            const margine = econ.venduto - econ.costo
            return (
              <div key={id} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--panel2)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{getItemTitle(item)}</span>
                    {isDmc && (item.dmc_categoria as string) && (
                      <span className="text-[9px] uppercase px-1.5 py-0.5 rounded" style={{ fontFamily: 'var(--font-mono)', background: DMC_CAT_COLOR[item.dmc_categoria as string] || 'var(--muted)', color: '#fff', letterSpacing: '0.03em' }}>
                        {DMC_CAT_LABEL[item.dmc_categoria as string] || (item.dmc_categoria as string)}
                      </span>
                    )}
                    {(econ.venduto > 0 || econ.costo > 0) && (
                      <span className="text-xs" style={{ color: margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>
                        {'\u20AC'}{margine.toLocaleString('it-IT', { minimumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                    {(item.data as string) && <span>{item.data as string}</span>}
                    {(item.ora_inizio as string) && <span>{(item.ora_inizio as string).slice(0, 5)}</span>}
                    {(item.partenza as string) && (item.destinazione as string) && <span>{item.partenza as string} → {item.destinazione as string}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(item)} className="p-1.5 rounded hover:bg-white/10">
                    <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                  </button>
                  <button onClick={() => setDeletingId(id)} className="p-1.5 rounded hover:bg-white/10">
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {isDmc && items.length > 0 && (() => {
        const breakdown: Record<string, number> = {}
        let total = 0
        for (const item of items) {
          const econ = getItemEcon(item)
          const cat = (item.dmc_categoria as string) || 'altro'
          breakdown[cat] = (breakdown[cat] || 0) + econ.costo
          total += econ.costo
        }
        const hasOverlap = otherSupplierCategories && (
          otherSupplierCategories.some(c => c.toLowerCase().includes('hotel') || c.toLowerCase().includes('albergo')) && breakdown['hotel'] ||
          otherSupplierCategories.some(c => c.toLowerCase().includes('transfer') || c.toLowerCase().includes('trasporto') || c.toLowerCase().includes('ncc')) && breakdown['transfer']
        )
        return (
          <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
            <p className="text-[9px] uppercase tracking-wider mb-2 font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>Breakdown DMC</p>
            <p className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
              {Object.entries(breakdown).filter(([, v]) => v > 0).map(([k, v]) => `${DMC_CAT_LABEL[k] || k}: \u20AC${v.toLocaleString('it-IT')}`).join(' \u00B7 ')}
              {total > 0 && ` \u00B7 Totale: \u20AC${total.toLocaleString('it-IT')}`}
            </p>
            {hasOverlap && (
              <p className="text-xs mt-2 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>
                \u26A0\uFE0F Hai fornitori Hotel/Transfer separati oltre al DMC — verifica il doppio conteggio
              </p>
            )}
          </div>
        )
      })()}

      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingId(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Elimina voce</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Questa azione elimina la voce. Il fornitore NON viene eliminato.</p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setDeletingId(null)}>Annulla</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={handleDelete}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {showExtras && (
        <div className="pt-3 mt-3" style={{ borderTop: '1px dashed var(--line)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Voci extra ({extras.length})
            </p>
            <button onClick={startAddExtra} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
              <Plus className="w-3 h-3" /> Aggiungi extra
            </button>
          </div>

          {showExtraForm && (
            <div className="p-4 rounded-xl space-y-3 mb-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{editingExtraId ? 'Modifica extra' : 'Nuovo extra'}</p>
                <button onClick={() => { setShowExtraForm(false); setEditingExtraId(null) }}><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Descrizione</label>
                  <input value={String(extraForm.descrizione || '')} onChange={e => setExtraForm(f => ({ ...f, descrizione: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)' }} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Quantita</label>
                  <input type="number" value={String(extraForm.quantita || '')} onChange={e => {
                    const qty = Number(e.target.value) || 1
                    setExtraForm(f => {
                      const vu = Number(f.venduto_unitario) || 0
                      const cu = Number(f.costo_unitario) || 0
                      return { ...f, quantita: e.target.value, venduto_totale: vu ? String(vu * qty) : '', costo_totale: cu ? String(cu * qty) : '' }
                    })
                  }} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)' }} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Data</label>
                  <input type="date" value={String(extraForm.data || '')} onChange={e => setExtraForm(f => ({ ...f, data: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)' }} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Ora inizio</label>
                  <input type="time" value={String(extraForm.ora_inizio || '')} onChange={e => setExtraForm(f => ({ ...f, ora_inizio: e.target.value }))} placeholder="09:00" className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)' }} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Ora fine</label>
                  <input type="time" value={String(extraForm.ora_fine || '')} onChange={e => setExtraForm(f => ({ ...f, ora_fine: e.target.value }))} placeholder="10:00" className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)' }} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Venduto/unit.</label>
                  <input type="number" value={String(extraForm.venduto_unitario || '')} onChange={e => {
                    const vu = Number(e.target.value) || 0
                    const qty = Number(extraForm.quantita) || 1
                    setExtraForm(f => ({ ...f, venduto_unitario: e.target.value, venduto_totale: vu ? String(vu * qty) : '' }))
                  }} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)' }} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Venduto totale</label>
                  <input type="number" value={String(extraForm.venduto_totale || '')} onChange={e => setExtraForm(f => ({ ...f, venduto_totale: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)' }} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Costo/unit.</label>
                  <input type="number" value={String(extraForm.costo_unitario || '')} onChange={e => {
                    const cu = Number(e.target.value) || 0
                    const qty = Number(extraForm.quantita) || 1
                    setExtraForm(f => ({ ...f, costo_unitario: e.target.value, costo_totale: cu ? String(cu * qty) : '' }))
                  }} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)' }} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Costo totale</label>
                  <input type="number" value={String(extraForm.costo_totale || '')} onChange={e => setExtraForm(f => ({ ...f, costo_totale: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)' }} />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Note</label>
                  <input value={String(extraForm.note || '')} onChange={e => setExtraForm(f => ({ ...f, note: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)' }} />
                </div>
              </div>
              {saveError && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>Errore: {saveError}</p>}
              <div className="flex items-center gap-2 pt-2 justify-end" style={{ borderTop: '1px solid var(--line)' }}>
                <button onClick={() => { setShowExtraForm(false); setEditingExtraId(null); setSaveError(null) }} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ color: 'var(--muted)' }}>Annulla</button>
                <button disabled={saving} onClick={handleSaveExtra} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--red2)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Salvataggio...' : editingExtraId ? 'Salva' : 'Aggiungi'}
                </button>
              </div>
            </div>
          )}

          {extras.length > 0 && (
            <div className="space-y-2">
              {extras.map(item => {
                const id = item.id as string
                const qty = (item.quantita as number) ?? 1
                const venduto = (item.venduto_totale as number) ?? ((item.venduto_unitario as number) ? (item.venduto_unitario as number) * qty : 0)
                const costo = (item.costo_totale as number) ?? ((item.costo_unitario as number) ? (item.costo_unitario as number) * qty : 0)
                const margine = venduto - costo
                return (
                  <div key={id} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--panel2)', border: '1px dashed var(--line)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--line)', color: 'var(--muted)' }}>Extra</span>
                        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{(item.descrizione as string) || 'Extra'}</span>
                        {(item.data as string) && <span className="text-xs" style={{ color: 'var(--muted)' }}>{fmtDate(item.data as string)}</span>}
                        {(item.ora_inizio as string) && <span className="text-xs" style={{ color: 'var(--muted)' }}>{(item.ora_inizio as string).slice(0, 5)}{(item.ora_fine as string) ? `–${(item.ora_fine as string).slice(0, 5)}` : ''}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                        {venduto > 0 && <span>Venduto: {'\u20AC'}{venduto.toLocaleString('it-IT')}</span>}
                        {costo > 0 && <span>Costo: {'\u20AC'}{costo.toLocaleString('it-IT')}</span>}
                        {(venduto > 0 || costo > 0) && (
                          <span style={{ color: margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>
                            Margine: {'\u20AC'}{margine.toLocaleString('it-IT')}
                          </span>
                        )}
                      </div>
                      {(item.note as string) && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{item.note as string}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => startEditExtra(item)} className="p-1.5 rounded hover:bg-white/10">
                        <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                      </button>
                      <button onClick={() => setDeletingExtraId(id)} className="p-1.5 rounded hover:bg-white/10">
                        <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {deletingExtraId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingExtraId(null)}>
              <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
                <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Elimina extra</p>
                <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Questa azione elimina la voce extra.</p>
                <div className="flex gap-3 justify-end">
                  <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setDeletingExtraId(null)}>Annulla</button>
                  <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={handleDeleteExtra}>Elimina</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

