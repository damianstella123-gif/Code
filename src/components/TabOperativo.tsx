import { useState, useCallback, useEffect } from 'react'
import { Plus, Edit3, Trash2, X, Save, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Supplier { id: string; nome: string; categoria: string }

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
  if (c.includes('experience') || c.includes('location') || c.includes('team building')) return 'experience'
  if (c.includes('audio') || c.includes('video') || c.includes('luci') || c.includes('tecnic')) return 'audio_video'
  if (c.includes('allestiment')) return 'allestimenti'
  if (c.includes('staff') && c.includes('intern')) return 'staff_interno'
  if (c.includes('staff') || c.includes('hostess') || c.includes('steward') || c.includes('promoter')) return 'staff_esterno'
  if (c.includes('grafi') || c.includes('stamp') || c.includes('tipografi')) return 'grafica_stampa'
  return 'varie'
}

export function SupplierCategoryPanel({ event, supplierId, category }: { event: { id: string }; supplierId: string; category: CategoryType }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const catMeta = CATEGORIES.find(c => c.key === category)!

  const loadItems = useCallback(async () => {
    setLoading(true)
    let query = supabase.from(catMeta.table).select('*').eq('event_id', event.id).eq('supplier_id', supplierId)
    if (category === 'transfer') {
      query = query.eq('categoria', 'transfer')
    }
    const { data } = await query.order('created_at', { ascending: true })
    setItems(data ?? [])
    setLoading(false)
  }, [event.id, supplierId, category, catMeta.table])

  useEffect(() => { loadItems() }, [loadItems])

  function resetForm() {
    const base: Record<string, string | number | boolean> = {
      aliquota_iva_venduto: '22', iva_inclusa_venduto: false,
      aliquota_iva_costo: '22', iva_inclusa_costo: false,
    }
    if (category === 'hotel') {
      Object.assign(base, { sotto_categoria: 'pernottamento', titolo: '', data: '', ora_inizio: '', ora_fine: '', check_in_date: '', check_in_time: '', check_out_date: '', check_out_time: '', quantita: '1', pax: '', room_type: '', luogo: '', meeting_pax: '', meeting_setup: '', meeting_equipment: '', natural_light_preference: false, note: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '', aliquota_iva_venduto: '10', aliquota_iva_costo: '10' })
    } else if (category === 'transfer') {
      Object.assign(base, { titolo: '', data: '', ora_inizio: '', ora_fine: '', partenza: '', destinazione: '', quantita: '1', luogo: '', note: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    } else if (category === 'ristorante') {
      Object.assign(base, { tipologia_servizio: '', data: '', ora_inizio: '', ora_fine: '', pax_previsti: '', pax_confermati: '', menu_portate: '', menu_descrizione: '', beverage_incluso: false, area_riservata: false, sala_privata: false, esclusiva_parziale: false, esclusiva_totale: false, nome_sala: '', note_location: '', num_vegetariani: '', num_vegani: '', allergie: '', intolleranze: '', richieste_alimentari: '', note_operative: '', budget_per_persona: '', budget_totale: '', costo_per_persona: '', costo_totale_reale: '', aliquota_iva_venduto: '10', aliquota_iva_costo: '10' })
    } else if (category === 'experience') {
      Object.assign(base, { nome_attivita: '', tipologia: '', data: '', ora_inizio: '', ora_fine: '', location: '', pax: '', durata_minuti: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
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
        quantita: qty,
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
        venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * multiplier : null),
        costo_unitario: cu,
        costo_totale: numOrNull('costo_totale') ?? (cu ? cu * multiplier : null),
      })
    } else if (category === 'transfer') {
      const qty = numOrNull('quantita') ?? 1; const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      Object.assign(record, { titolo: strOrEmpty('titolo') || 'Transfer', categoria: 'transfer', data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'), partenza: strOrEmpty('partenza'), destinazione: strOrEmpty('destinazione'), quantita: qty, luogo: strOrEmpty('luogo'), note: strOrEmpty('note'), venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null), costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null) })
    } else if (category === 'ristorante') {
      const paxP = numOrNull('pax_previsti'); const paxC = numOrNull('pax_confermati'); const pax = paxC ?? paxP ?? 1
      const bpp = numOrNull('budget_per_persona'); const cpp = numOrNull('costo_per_persona')
      Object.assign(record, { tipologia_servizio: strOrEmpty('tipologia_servizio'), data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'), pax_previsti: paxP, pax_confermati: paxC, menu_portate: strOrEmpty('menu_portate'), menu_descrizione: strOrEmpty('menu_descrizione'), beverage_incluso: !!form.beverage_incluso, area_riservata: !!form.area_riservata, sala_privata: !!form.sala_privata, esclusiva_parziale: !!form.esclusiva_parziale, esclusiva_totale: !!form.esclusiva_totale, nome_sala: strOrEmpty('nome_sala'), note_location: strOrEmpty('note_location'), num_vegetariani: strOrEmpty('num_vegetariani'), num_vegani: strOrEmpty('num_vegani'), allergie: strOrEmpty('allergie'), intolleranze: strOrEmpty('intolleranze'), richieste_alimentari: strOrEmpty('richieste_alimentari'), note_operative: strOrEmpty('note_operative'), budget_per_persona: bpp, budget_totale: numOrNull('budget_totale') ?? (bpp ? bpp * pax : null), costo_per_persona: cpp, costo_totale_reale: numOrNull('costo_totale_reale') ?? (cpp ? cpp * pax : null) })
    } else if (category === 'experience') {
      const pax = numOrNull('pax') ?? 1; const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      Object.assign(record, { nome_attivita: strOrEmpty('nome_attivita'), tipologia: strOrEmpty('tipologia'), data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'), location: strOrEmpty('location'), pax, durata_minuti: numOrNull('durata_minuti'), note_operative: strOrEmpty('note_operative'), venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * pax : null), costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * pax : null) })
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
      Object.assign(record, { descrizione: strOrEmpty('descrizione'), quantita: qty, data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), note: strOrEmpty('note'), venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null), costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null) })
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
      default: return (item.descrizione as string) || 'Voce'
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
        if (sotto === 'pernottamento') return (
          <>
            {inp('check_in_date', 'Check-in data', 'date')}{inp('check_in_time', 'Check-in ora', 'time')}
            {inp('check_out_date', 'Check-out data', 'date')}{inp('check_out_time', 'Check-out ora', 'time')}
            {inp('quantita', 'N. Camere', 'number')}{inp('room_type', 'Tipologia camere')}
            <div className="sm:col-span-3">{inp('note', 'Note camere / Rooming list')}</div>
          </>
        )
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
    </div>
  )
}

export function TabOperativo({ event, suppliers }: { event: { id: string }; suppliers: Supplier[] }) {
  const [activeCategory, setActiveCategory] = useState<CategoryType>('hotel')
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const catMeta = CATEGORIES.find(c => c.key === activeCategory)!

  const loadItems = useCallback(async () => {
    setLoading(true)
    let query = supabase.from(catMeta.table).select('*').eq('event_id', event.id)
    if (activeCategory === 'transfer') {
      query = query.eq('categoria', 'transfer')
    }
    const { data } = await query.order('created_at', { ascending: true })
    setItems(data ?? [])
    setLoading(false)
  }, [event.id, activeCategory, catMeta.table])

  useEffect(() => { loadItems() }, [loadItems])

  function resetForm() {
    const base: Record<string, string | number | boolean> = {
      aliquota_iva_venduto: '22', iva_inclusa_venduto: false,
      aliquota_iva_costo: '22', iva_inclusa_costo: false,
      supplier_id: '',
    }
    if (activeCategory === 'hotel') {
      Object.assign(base, { sotto_categoria: 'pernottamento', titolo: '', data: '', ora_inizio: '', ora_fine: '', check_in_date: '', check_in_time: '', check_out_date: '', check_out_time: '', quantita: '1', pax: '', room_type: '', luogo: '', meeting_pax: '', meeting_setup: '', meeting_equipment: '', natural_light_preference: false, note: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '', aliquota_iva_venduto: '10', aliquota_iva_costo: '10' })
    } else if (activeCategory === 'transfer') {
      Object.assign(base, { titolo: '', data: '', ora_inizio: '', ora_fine: '', partenza: '', destinazione: '', quantita: '1', luogo: '', note: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    } else if (activeCategory === 'ristorante') {
      Object.assign(base, { tipologia_servizio: '', data: '', ora_inizio: '', ora_fine: '', pax_previsti: '', pax_confermati: '', menu_portate: '', menu_descrizione: '', beverage_incluso: false, area_riservata: false, sala_privata: false, esclusiva_parziale: false, esclusiva_totale: false, nome_sala: '', note_location: '', num_vegetariani: '', num_vegani: '', allergie: '', intolleranze: '', richieste_alimentari: '', note_operative: '', budget_per_persona: '', budget_totale: '', costo_per_persona: '', costo_totale_reale: '', aliquota_iva_venduto: '10', aliquota_iva_costo: '10' })
    } else if (activeCategory === 'experience') {
      Object.assign(base, { nome_attivita: '', tipologia: '', data: '', ora_inizio: '', ora_fine: '', location: '', pax: '', durata_minuti: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    } else if (activeCategory === 'catering') {
      Object.assign(base, { tipologia: '', data: '', ora_inizio: '', ora_fine: '', pax: '', note: '', venduto_per_persona: '', venduto_totale: '', costo_per_persona: '', costo_totale: '', aliquota_iva_venduto: '10', aliquota_iva_costo: '10' })
    } else if (activeCategory === 'audio_video') {
      Object.assign(base, { tipologia_servizio: '', quantita: '1', data_montaggio: '', ora_montaggio: '', data_prove: '', ora_prove: '', data_evento: '', ora_evento: '', data_smontaggio: '', ora_smontaggio: '', materiale: '', tecnici: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    } else if (activeCategory === 'allestimenti') {
      Object.assign(base, { descrizione: '', quantita: '1', area_utilizzo: '', data_montaggio: '', ora_montaggio: '', data_smontaggio: '', ora_smontaggio: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    } else if (activeCategory === 'staff_interno') {
      Object.assign(base, { nome: '', cognome: '', ruolo: '', data: '', ora_inizio: '', ora_fine: '', quantita: '1', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_giornaliero: '', costo_totale: '' })
    } else if (activeCategory === 'staff_esterno') {
      Object.assign(base, { nome: '', cognome: '', ruolo: '', quantita: '1', data: '', ora_inizio: '', ora_fine: '', lingue: '', abbigliamento: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '' })
    } else if (activeCategory === 'grafica_stampa') {
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
      if (k === 'id' || k === 'event_id' || k === 'created_at' || k === 'updated_at') continue
      f[k] = v == null ? '' : v as string | number | boolean
    }
    setForm(f)
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const record: Record<string, unknown> = { event_id: event.id }

    const numOrNull = (key: string) => form[key] !== '' && form[key] !== undefined ? Number(form[key]) : null
    const strOrNull = (key: string) => (form[key] && String(form[key]).trim()) || null
    const strOrEmpty = (key: string) => String(form[key] ?? '')

    record.aliquota_iva_venduto = strOrEmpty('aliquota_iva_venduto') || '22'
    record.iva_inclusa_venduto = !!form.iva_inclusa_venduto
    record.aliquota_iva_costo = strOrEmpty('aliquota_iva_costo') || '22'
    record.iva_inclusa_costo = !!form.iva_inclusa_costo
    record.supplier_id = strOrNull('supplier_id')

    if (activeCategory === 'hotel') {
      const sotto = strOrEmpty('sotto_categoria') || 'pernottamento'
      const qty = numOrNull('quantita') ?? 1
      const pax = numOrNull('pax')
      const vu = numOrNull('venduto_unitario'); const cu = numOrNull('costo_unitario')
      const multiplier = pax ?? qty
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
        quantita: qty,
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
        venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * multiplier : null),
        costo_unitario: cu,
        costo_totale: numOrNull('costo_totale') ?? (cu ? cu * multiplier : null),
      })
    } else if (activeCategory === 'transfer') {
      const qty = numOrNull('quantita') ?? 1
      const vu = numOrNull('venduto_unitario')
      const cu = numOrNull('costo_unitario')
      Object.assign(record, {
        titolo: strOrEmpty('titolo') || 'Transfer', categoria: 'transfer',
        data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'),
        partenza: strOrEmpty('partenza'), destinazione: strOrEmpty('destinazione'),
        quantita: qty, luogo: strOrEmpty('luogo'), note: strOrEmpty('note'),
        venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null),
        costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null),
      })
    } else if (activeCategory === 'ristorante') {
      const paxP = numOrNull('pax_previsti')
      const paxC = numOrNull('pax_confermati')
      const pax = paxC ?? paxP ?? 1
      const bpp = numOrNull('budget_per_persona')
      const cpp = numOrNull('costo_per_persona')
      Object.assign(record, {
        tipologia_servizio: strOrEmpty('tipologia_servizio'), data: strOrNull('data'),
        ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'),
        pax_previsti: paxP, pax_confermati: paxC,
        menu_portate: strOrEmpty('menu_portate'), menu_descrizione: strOrEmpty('menu_descrizione'),
        beverage_incluso: !!form.beverage_incluso, area_riservata: !!form.area_riservata,
        sala_privata: !!form.sala_privata, esclusiva_parziale: !!form.esclusiva_parziale,
        esclusiva_totale: !!form.esclusiva_totale, nome_sala: strOrEmpty('nome_sala'),
        note_location: strOrEmpty('note_location'),
        num_vegetariani: strOrEmpty('num_vegetariani'), num_vegani: strOrEmpty('num_vegani'),
        allergie: strOrEmpty('allergie'), intolleranze: strOrEmpty('intolleranze'),
        richieste_alimentari: strOrEmpty('richieste_alimentari'), note_operative: strOrEmpty('note_operative'),
        budget_per_persona: bpp, budget_totale: numOrNull('budget_totale') ?? (bpp ? bpp * pax : null),
        costo_per_persona: cpp, costo_totale_reale: numOrNull('costo_totale_reale') ?? (cpp ? cpp * pax : null),
      })
    } else if (activeCategory === 'experience') {
      const pax = numOrNull('pax') ?? 1
      const vu = numOrNull('venduto_unitario')
      const cu = numOrNull('costo_unitario')
      Object.assign(record, {
        nome_attivita: strOrEmpty('nome_attivita'), tipologia: strOrEmpty('tipologia'),
        data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'),
        location: strOrEmpty('location'), pax, durata_minuti: numOrNull('durata_minuti'),
        note_operative: strOrEmpty('note_operative'),
        venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * pax : null),
        costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * pax : null),
      })
    } else if (activeCategory === 'catering') {
      const pax = numOrNull('pax') ?? 1
      const vpp = numOrNull('venduto_per_persona')
      const cpp = numOrNull('costo_per_persona')
      Object.assign(record, {
        tipologia: strOrEmpty('tipologia'), data: strOrNull('data'),
        ora: strOrNull('ora_inizio'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'),
        pax, note: strOrEmpty('note'),
        venduto_per_persona: vpp, venduto_totale: numOrNull('venduto_totale') ?? (vpp ? vpp * pax : null),
        costo_per_persona: cpp, costo_totale: numOrNull('costo_totale') ?? (cpp ? cpp * pax : null),
      })
    } else if (activeCategory === 'audio_video') {
      const qty = numOrNull('quantita') ?? 1
      const vu = numOrNull('venduto_unitario')
      const cu = numOrNull('costo_unitario')
      Object.assign(record, {
        tipologia_servizio: strOrEmpty('tipologia_servizio'), quantita: qty,
        data_montaggio: strOrNull('data_montaggio'), ora_montaggio: strOrNull('ora_montaggio'),
        data_prove: strOrNull('data_prove'), ora_prove: strOrNull('ora_prove'),
        data_evento: strOrNull('data_evento'), ora_evento: strOrNull('ora_evento'),
        data_smontaggio: strOrNull('data_smontaggio'), ora_smontaggio: strOrNull('ora_smontaggio'),
        materiale: strOrEmpty('materiale'), tecnici: strOrEmpty('tecnici'), note_operative: strOrEmpty('note_operative'),
        venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null),
        costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null),
      })
    } else if (activeCategory === 'allestimenti') {
      const qty = numOrNull('quantita') ?? 1
      const vu = numOrNull('venduto_unitario')
      const cu = numOrNull('costo_unitario')
      Object.assign(record, {
        descrizione: strOrEmpty('descrizione'), quantita: qty, area_utilizzo: strOrEmpty('area_utilizzo'),
        data_montaggio: strOrNull('data_montaggio'), ora_montaggio: strOrNull('ora_montaggio'),
        data_smontaggio: strOrNull('data_smontaggio'), ora_smontaggio: strOrNull('ora_smontaggio'),
        note_operative: strOrEmpty('note_operative'),
        venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null),
        costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null),
      })
    } else if (activeCategory === 'staff_interno') {
      const qty = numOrNull('quantita') ?? 1
      const vu = numOrNull('venduto_unitario')
      const cu = numOrNull('costo_unitario')
      Object.assign(record, {
        nome: strOrEmpty('nome'), cognome: strOrEmpty('cognome'),
        risorsa: `${strOrEmpty('nome')} ${strOrEmpty('cognome')}`.trim(),
        ruolo: strOrEmpty('ruolo'), quantita: qty,
        data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'),
        note: strOrEmpty('note_operative'), note_operative: strOrEmpty('note_operative'),
        venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null),
        costo_giornaliero: numOrNull('costo_giornaliero'),
        costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null),
      })
    } else if (activeCategory === 'staff_esterno') {
      const qty = numOrNull('quantita') ?? 1
      const vu = numOrNull('venduto_unitario')
      const cu = numOrNull('costo_unitario')
      Object.assign(record, {
        nome: strOrEmpty('nome'), cognome: strOrEmpty('cognome'),
        ruolo: strOrEmpty('ruolo'), quantita: qty,
        data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'), ora_fine: strOrNull('ora_fine'),
        lingue: strOrEmpty('lingue'), abbigliamento: strOrEmpty('abbigliamento'), note_operative: strOrEmpty('note_operative'),
        venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null),
        costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null),
      })
    } else if (activeCategory === 'grafica_stampa') {
      const qty = numOrNull('quantita') ?? 1
      const vu = numOrNull('venduto_unitario')
      const cu = numOrNull('costo_unitario')
      Object.assign(record, {
        tipo_materiale: strOrEmpty('tipo_materiale'), quantita: qty, formato: strOrEmpty('formato'),
        data_consegna: strOrNull('data_consegna'), note_operative: strOrEmpty('note_operative'),
        venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null),
        costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null),
      })
    } else {
      const qty = numOrNull('quantita') ?? 1
      const vu = numOrNull('venduto_unitario')
      const cu = numOrNull('costo_unitario')
      Object.assign(record, {
        descrizione: strOrEmpty('descrizione'), quantita: qty,
        data: strOrNull('data'), ora_inizio: strOrNull('ora_inizio'),
        note: strOrEmpty('note'),
        venduto_unitario: vu, venduto_totale: numOrNull('venduto_totale') ?? (vu ? vu * qty : null),
        costo_unitario: cu, costo_totale: numOrNull('costo_totale') ?? (cu ? cu * qty : null),
      })
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
    setDeletingId(null); setExpandedId(null)
    await loadItems()
  }

  function getItemTitle(item: Record<string, unknown>): string {
    switch (activeCategory) {
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
      default: return (item.descrizione as string) || 'Voce'
    }
  }

  function getItemEcon(item: Record<string, unknown>): { venduto: number; costo: number } {
    let venduto = 0, costo = 0
    if (activeCategory === 'ristorante') {
      const pax = (item.pax_confermati as number) ?? (item.pax_previsti as number) ?? 1
      venduto = (item.budget_totale as number) ?? ((item.budget_per_persona as number) ? (item.budget_per_persona as number) * pax : 0)
      costo = (item.costo_totale_reale as number) ?? ((item.costo_per_persona as number) ? (item.costo_per_persona as number) * pax : 0)
    } else if (activeCategory === 'catering') {
      const pax = (item.pax as number) ?? 1
      venduto = (item.venduto_totale as number) ?? ((item.venduto_per_persona as number) ? (item.venduto_per_persona as number) * pax : 0)
      costo = (item.costo_totale as number) ?? ((item.costo_per_persona as number) ? (item.costo_per_persona as number) * pax : 0)
    } else if (activeCategory === 'staff_interno') {
      const qty = (item.quantita as number) ?? 1
      venduto = (item.venduto_totale as number) ?? ((item.venduto_unitario as number) ? (item.venduto_unitario as number) * qty : 0)
      costo = (item.costo_totale as number) ?? (item.costo_giornaliero as number) ?? ((item.costo_unitario as number) ? (item.costo_unitario as number) * qty : 0)
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
      <input type="checkbox" checked={!!form[key]} onChange={e => upd(key, e.target.checked)} id={`chk_${key}`} />
      <label htmlFor={`chk_${key}`} className="text-xs" style={{ color: 'var(--text)' }}>{label}</label>
    </div>
  )
  const supplierSel = () => (
    <div>
      <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Fornitore</label>
      <select value={String(form.supplier_id ?? '')} onChange={e => upd('supplier_id', e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
        <option value="">-- Nessuno --</option>
        {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
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
    if (activeCategory === 'hotel') {
      const sotto = String(form.sotto_categoria || 'pernottamento')
      const svc = HOTEL_SERVIZI.find(s => s.key === sotto)
      const group = svc?.group || 'servizi'
      const econLabel = sotto === 'pernottamento' ? 'camera' : (group === 'fb' ? 'pax' : 'unita')

      const renderHotelFields = () => {
        if (sotto === 'pernottamento') return (
          <>
            {inp('check_in_date', 'Check-in data', 'date')}{inp('check_in_time', 'Check-in ora', 'time')}
            {inp('check_out_date', 'Check-out data', 'date')}{inp('check_out_time', 'Check-out ora', 'time')}
            {inp('quantita', 'N. Camere', 'number')}{inp('room_type', 'Tipologia camere')}
            <div className="sm:col-span-3">{inp('note', 'Note camere / Rooming list')}</div>
          </>
        )
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
            {supplierSel()}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" style={{ borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
            {renderHotelFields()}
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
    if (activeCategory === 'transfer') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('titolo', 'Titolo corsa')}
        {inp('data', 'Data', 'date')}
        {inp('ora_inizio', 'Ora', 'time')}
        {inp('partenza', 'Partenza')}
        {inp('destinazione', 'Destinazione')}
        {inp('quantita', 'Pax/Mezzi', 'number')}
        {inp('venduto_unitario', 'Venduto unit.', 'number')}
        {inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo unit.', 'number')}
        {inp('costo_totale', 'Costo totale', 'number')}
        {supplierSel()}
        <div className="sm:col-span-3">{inp('note', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (activeCategory === 'ristorante') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sel('tipologia_servizio', 'Tipologia', RISTORANTE_TIPOLOGIE)}
        {inp('data', 'Data', 'date')}
        {inp('ora_inizio', 'Ora inizio', 'time')}
        {inp('ora_fine', 'Ora fine', 'time')}
        {inp('pax_previsti', 'Pax previsti', 'number')}
        {inp('pax_confermati', 'Pax confermati', 'number')}
        {sel('menu_portate', 'Tipo menu', RISTORANTE_MENU_TYPES)}
        {inp('nome_sala', 'Sala')}
        {inp('note_location', 'Note location')}
        {chk('beverage_incluso', 'Beverage incluso')}
        {chk('area_riservata', 'Area riservata')}
        {chk('sala_privata', 'Sala privata')}
        {chk('esclusiva_parziale', 'Esclusiva parziale')}
        {chk('esclusiva_totale', 'Esclusiva totale')}
        {inp('num_vegetariani', 'Vegetariani', 'number')}
        {inp('num_vegani', 'Vegani', 'number')}
        {inp('allergie', 'Allergie')}
        {inp('intolleranze', 'Intolleranze')}
        {inp('richieste_alimentari', 'Richieste alimentari')}
        {inp('budget_per_persona', 'Venduto/persona', 'number')}
        {inp('budget_totale', 'Venduto totale', 'number')}
        {inp('costo_per_persona', 'Costo/persona', 'number')}
        {inp('costo_totale_reale', 'Costo totale', 'number')}
        {supplierSel()}
        <div className="sm:col-span-3">{inp('menu_descrizione', 'Descrizione menu')}</div>
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (activeCategory === 'experience') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('nome_attivita', 'Nome attivita')}
        {sel('tipologia', 'Tipologia', EXPERIENCE_TIPOLOGIE)}
        {inp('data', 'Data', 'date')}
        {inp('ora_inizio', 'Ora inizio', 'time')}
        {inp('ora_fine', 'Ora fine', 'time')}
        {inp('location', 'Location')}
        {inp('pax', 'Pax', 'number')}
        {inp('durata_minuti', 'Durata (min)', 'number')}
        {inp('venduto_unitario', 'Venduto/pax', 'number')}
        {inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo/pax', 'number')}
        {inp('costo_totale', 'Costo totale', 'number')}
        {supplierSel()}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (activeCategory === 'catering') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sel('tipologia', 'Tipologia', CATERING_TIPOLOGIE)}
        {inp('data', 'Data', 'date')}
        {inp('ora_inizio', 'Ora inizio', 'time')}
        {inp('ora_fine', 'Ora fine', 'time')}
        {inp('pax', 'Pax', 'number')}
        {inp('venduto_per_persona', 'Venduto/pax', 'number')}
        {inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_per_persona', 'Costo/pax', 'number')}
        {inp('costo_totale', 'Costo totale', 'number')}
        {supplierSel()}
        <div className="sm:col-span-3">{inp('note', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (activeCategory === 'audio_video') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('tipologia_servizio', 'Servizio')}
        {inp('quantita', 'Quantita', 'number')}
        {inp('data_montaggio', 'Data montaggio', 'date')}
        {inp('ora_montaggio', 'Ora montaggio', 'time')}
        {inp('data_prove', 'Data prove', 'date')}
        {inp('ora_prove', 'Ora prove', 'time')}
        {inp('data_evento', 'Data evento', 'date')}
        {inp('ora_evento', 'Ora evento', 'time')}
        {inp('data_smontaggio', 'Data smontaggio', 'date')}
        {inp('ora_smontaggio', 'Ora smontaggio', 'time')}
        {inp('materiale', 'Materiale')}
        {inp('tecnici', 'Tecnici')}
        {inp('venduto_unitario', 'Venduto unit.', 'number')}
        {inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo unit.', 'number')}
        {inp('costo_totale', 'Costo totale', 'number')}
        {supplierSel()}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (activeCategory === 'allestimenti') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('descrizione', 'Descrizione')}
        {inp('quantita', 'Quantita', 'number')}
        {inp('area_utilizzo', 'Area utilizzo')}
        {inp('data_montaggio', 'Data montaggio', 'date')}
        {inp('ora_montaggio', 'Ora montaggio', 'time')}
        {inp('data_smontaggio', 'Data smontaggio', 'date')}
        {inp('ora_smontaggio', 'Ora smontaggio', 'time')}
        {inp('venduto_unitario', 'Venduto unit.', 'number')}
        {inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo unit.', 'number')}
        {inp('costo_totale', 'Costo totale', 'number')}
        {supplierSel()}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (activeCategory === 'staff_interno') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('nome', 'Nome')}
        {inp('cognome', 'Cognome')}
        {sel('ruolo', 'Ruolo', STAFF_INT_RUOLI)}
        {inp('data', 'Data', 'date')}
        {inp('ora_inizio', 'Ora inizio', 'time')}
        {inp('ora_fine', 'Ora fine', 'time')}
        {inp('quantita', 'Quantita', 'number')}
        {inp('venduto_unitario', 'Venduto/unit.', 'number')}
        {inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo/unit.', 'number')}
        {inp('costo_giornaliero', 'Costo giornaliero', 'number')}
        {inp('costo_totale', 'Costo totale', 'number')}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (activeCategory === 'staff_esterno') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('nome', 'Nome')}
        {inp('cognome', 'Cognome')}
        {sel('ruolo', 'Ruolo', STAFF_EXT_RUOLI)}
        {inp('quantita', 'Quantita', 'number')}
        {inp('data', 'Data', 'date')}
        {inp('ora_inizio', 'Ora inizio', 'time')}
        {inp('ora_fine', 'Ora fine', 'time')}
        {inp('lingue', 'Lingue')}
        {inp('abbigliamento', 'Abbigliamento')}
        {inp('venduto_unitario', 'Venduto/unit.', 'number')}
        {inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo/unit.', 'number')}
        {inp('costo_totale', 'Costo totale', 'number')}
        {supplierSel()}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    if (activeCategory === 'grafica_stampa') return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sel('tipo_materiale', 'Tipo materiale', GRAFICA_TIPI)}
        {inp('quantita', 'Quantita', 'number')}
        {inp('formato', 'Formato')}
        {inp('data_consegna', 'Data consegna', 'date')}
        {inp('venduto_unitario', 'Venduto unit.', 'number')}
        {inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo unit.', 'number')}
        {inp('costo_totale', 'Costo totale', 'number')}
        {supplierSel()}
        <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        {ivaFields()}
      </div>
    )
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {inp('descrizione', 'Descrizione')}
        {inp('quantita', 'Quantita', 'number')}
        {inp('data', 'Data', 'date')}
        {inp('ora_inizio', 'Ora', 'time')}
        {inp('venduto_unitario', 'Venduto/unit.', 'number')}
        {inp('venduto_totale', 'Venduto totale', 'number')}
        {inp('costo_unitario', 'Costo/unit.', 'number')}
        {inp('costo_totale', 'Costo totale', 'number')}
        {supplierSel()}
        <div className="sm:col-span-3">{inp('note', 'Note')}</div>
        {ivaFields()}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => { setActiveCategory(c.key); setShowForm(false); setExpandedId(null) }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: activeCategory === c.key ? 'var(--red2)' : 'var(--panel2)', color: activeCategory === c.key ? '#fff' : 'var(--muted)' }}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{catMeta.label}</p>
        <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--red2)', color: '#fff' }}>
          <Plus className="w-3 h-3" /> Aggiungi
        </button>
      </div>

      {showForm && (
        <div className="panel p-5 space-y-4" style={{ border: '1px solid var(--blue)' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{editingId ? 'Modifica' : 'Nuova voce'} — {catMeta.label}</p>
            <button onClick={() => { setShowForm(false); setEditingId(null) }}><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
          </div>
          {renderForm()}
          {saveError && <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>Errore: {saveError}</p>}
          <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <button disabled={saving} onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--blue)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
              <Save className="w-3 h-3" /> {saving ? 'Salvataggio...' : 'Salva'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null); setSaveError(null) }} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>Annulla</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</div></div>
      ) : items.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <p className="text-sm">Nessuna voce inserita</p>
          <p className="text-xs mt-1">Clicca "Aggiungi" per inserire la prima voce</p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          {items.map(item => {
            const id = item.id as string
            const isExpanded = expandedId === id
            const econ = getItemEcon(item)
            const margine = econ.venduto - econ.costo

            return (
              <div key={id} style={{ borderBottom: '1px solid var(--line)' }}>
                <button className="w-full text-left px-4 py-3 flex items-center gap-3 hover:opacity-80 transition-opacity" onClick={() => setExpandedId(isExpanded ? null : id)}>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${isExpanded ? '' : '-rotate-90'}`} style={{ color: 'var(--muted)' }} />
                  <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{getItemTitle(item)}</span>
                  {(econ.venduto > 0 || econ.costo > 0) && (
                    <>
                      <span className="text-xs w-20 text-right hidden sm:block" style={{ color: 'var(--text)' }}>{'\u20AC'}{econ.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs w-20 text-right hidden sm:block" style={{ color: 'var(--yellow)' }}>{'\u20AC'}{econ.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs w-16 text-right font-medium" style={{ color: margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{margine.toLocaleString('it-IT', { minimumFractionDigits: 0 })}</span>
                    </>
                  )}
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1" style={{ background: 'var(--bg)' }}>
                    <div className="flex items-center gap-2 pt-3 mt-1" style={{ borderTop: '1px solid var(--line)' }}>
                      <button onClick={() => startEdit(item)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80" style={{ background: 'var(--panel2)', color: 'var(--blue)' }}>
                        <Edit3 className="w-3 h-3" /> Modifica
                      </button>
                      <button onClick={() => setDeletingId(id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80" style={{ background: 'var(--panel2)', color: 'var(--red2)' }}>
                        <Trash2 className="w-3 h-3" /> Elimina
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingId(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Elimina voce</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Vuoi eliminare questa voce? Il fornitore collegato NON viene eliminato.</p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setDeletingId(null)}>Annulla</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={handleDelete}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
