import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ChevronDown, Edit3, Trash2, Save, Euro, Plus, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AnimatedLaserBorder from '@/components/AnimatedLaserBorder'
import type { Event } from '@/data/events'

interface Supplier {
  id: string
  nome: string
  categoria: string
}

// Category structure matching Simmetria business process
const BUDGET_CATEGORIES = [
  {
    id: 'hotel',
    label: 'HOTEL',
    table: 'event_hotel_details',
    sottocategorie: ['camere', 'city_tax', 'parcheggi', 'meeting_room', 'coffee_break'],
  },
  {
    id: 'transfer',
    label: 'TRANSFER',
    table: 'event_supplier_services',
    sottocategorie: ['auto', 'minivan', 'minibus', 'corse_multiple', 'disposizione'],
  },
  {
    id: 'ristorante',
    label: 'RISTORANTE',
    table: 'event_restaurant_details',
    sottocategorie: ['pranzo', 'cena', 'aperitivo', 'aperitivo_rinforzato', 'area_riservata', 'esclusiva'],
  },
  {
    id: 'location_experience',
    label: 'LOCATION / EXPERIENCE',
    table: 'event_experience_details',
    sottocategorie: [],
  },
  {
    id: 'catering',
    label: 'CATERING',
    table: 'event_catering_details',
    sottocategorie: [],
  },
  {
    id: 'audio_video',
    label: 'AUDIO VIDEO',
    table: 'event_audio_video_details',
    sottocategorie: [],
  },
  {
    id: 'allestimenti',
    label: 'ALLESTIMENTI',
    table: 'event_allestimenti_details',
    sottocategorie: [],
  },
  {
    id: 'staff_simmetria',
    label: 'STAFF SIMMETRIA',
    table: 'event_staff_interno_details',
    sottocategorie: [],
  },
  {
    id: 'staff_esterno',
    label: 'STAFF ESTERNO',
    table: 'event_staff_esterno_details',
    sottocategorie: [],
  },
  {
    id: 'grafica',
    label: 'GRAFICA',
    table: 'event_grafica_stampa_details',
    sottocategorie: [],
  },
  {
    id: 'varie',
    label: 'VARIE',
    table: 'event_varie_details',
    sottocategorie: [],
  },
] as const

type CategoryId = typeof BUDGET_CATEGORIES[number]['id']

const SOTTO_LABELS: Record<string, string> = {
  camere: 'Camere', city_tax: 'City Tax', parcheggi: 'Parcheggi',
  meeting_room: 'Meeting Room', coffee_break: 'Coffee Break',
  auto: 'Auto', minivan: 'Minivan', minibus: 'Minibus',
  corse_multiple: 'Corse Multiple', disposizione: 'Disposizione',
  pranzo: 'Pranzo', cena: 'Cena', aperitivo: 'Aperitivo',
  aperitivo_rinforzato: 'Aperitivo Rinforzato', area_riservata: 'Area Riservata',
  esclusiva: 'Esclusiva',
}

const IVA_OPTIONS = ['0', '4', '5', '10', '22']

interface BudgetLineItem {
  id: string
  categoryId: CategoryId
  table: string
  sotto_categoria: string
  descrizione: string
  fornitore: string
  supplierId: string
  qty: number
  venduto: number
  costo: number
  aliquota_iva_venduto: string
  iva_inclusa_venduto: boolean
  aliquota_iva_costo: string
  iva_inclusa_costo: boolean
  margine: number
  marginePct: number
  raw: Record<string, unknown>
}

async function updateEventFee(eventId: string, feePct: number) {
  await supabase.from('events').update({ fee_agenzia_pct: feePct }).eq('id', eventId)
}

export default function TabBudget({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [lines, setLines] = useState<BudgetLineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string | number | boolean>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingCategory, setAddingCategory] = useState<CategoryId | null>(null)
  const [addForm, setAddForm] = useState<Record<string, string | number | boolean>>({})

  const [feePct, setFeePct] = useState(event.fee_agenzia_pct ?? 6)
  const [editingFee, setEditingFee] = useState(false)
  const [feeInput, setFeeInput] = useState(String(event.fee_agenzia_pct ?? 6))

  async function saveFee(newPct: number) {
    setFeePct(newPct)
    setEditingFee(false)
    await updateEventFee(event.id, newPct)
  }

  const loadData = useCallback(async () => {
    const [svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
      supabase.from('event_supplier_services').select('*').eq('event_id', event.id),
      supabase.from('event_hotel_details').select('*').eq('event_id', event.id),
      supabase.from('event_restaurant_details').select('*').eq('event_id', event.id),
      supabase.from('event_experience_details').select('*').eq('event_id', event.id),
      supabase.from('event_catering_details').select('*').eq('event_id', event.id),
      supabase.from('event_staff_interno_details').select('*').eq('event_id', event.id),
      supabase.from('event_staff_esterno_details').select('*').eq('event_id', event.id),
      supabase.from('event_varie_details').select('*').eq('event_id', event.id),
      supabase.from('event_audio_video_details').select('*').eq('event_id', event.id),
      supabase.from('event_allestimenti_details').select('*').eq('event_id', event.id),
      supabase.from('event_grafica_stampa_details').select('*').eq('event_id', event.id),
    ])

    const all: BudgetLineItem[] = []

    function getSupName(id: string | null | undefined) {
      if (!id) return ''
      return suppliers.find(s => s.id === id)?.nome ?? ''
    }

    // Transfer services
    for (const s of (svcRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (s.quantita as number) ?? 1
      const venduto = (s.venduto_totale as number) ?? ((s.venduto_unitario as number) ? (s.venduto_unitario as number) * qty : 0)
      const costo = (s.costo_totale as number) ?? ((s.costo_unitario as number) ? (s.costo_unitario as number) * qty : 0)
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({
        id: s.id as string, categoryId: 'transfer', table: 'event_supplier_services',
        sotto_categoria: (s.sotto_categoria as string) || 'auto',
        descrizione: (s.titolo as string) || 'Transfer',
        fornitore: getSupName(s.supplier_id as string), supplierId: (s.supplier_id as string) || '',
        qty, venduto, costo,
        aliquota_iva_venduto: (s.aliquota_iva_venduto as string) || '22',
        iva_inclusa_venduto: (s.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (s.aliquota_iva_costo as string) || '22',
        iva_inclusa_costo: (s.iva_inclusa_costo as boolean) ?? false,
        margine, marginePct, raw: s,
      })
    }

    // Hotel
    for (const h of (hotelRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (h.quantita as number) ?? 1
      const venduto = (h.venduto_totale as number) ?? ((h.venduto_unitario as number) ? (h.venduto_unitario as number) * qty : 0)
      const costo = (h.costo_totale as number) ?? ((h.costo_unitario as number) ? (h.costo_unitario as number) * qty : 0)
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({
        id: h.id as string, categoryId: 'hotel', table: 'event_hotel_details',
        sotto_categoria: (h.sotto_categoria as string) || 'camere',
        descrizione: (h.titolo as string) || (h.tipo as string) || 'Camera',
        fornitore: getSupName(h.supplier_id as string), supplierId: (h.supplier_id as string) || '',
        qty, venduto, costo,
        aliquota_iva_venduto: (h.aliquota_iva_venduto as string) || '10',
        iva_inclusa_venduto: (h.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (h.aliquota_iva_costo as string) || '10',
        iva_inclusa_costo: (h.iva_inclusa_costo as boolean) ?? false,
        margine, marginePct, raw: h,
      })
    }

    // Ristorante
    for (const r of (restRes.data ?? []) as Record<string, unknown>[]) {
      const pax = (r.pax_confermati as number) ?? (r.pax_previsti as number) ?? 1
      const venduto = (r.budget_totale as number) ?? ((r.budget_per_persona as number) ? (r.budget_per_persona as number) * pax : 0)
      const costo = (r.costo_totale_reale as number) ?? ((r.costo_per_persona as number) ? (r.costo_per_persona as number) * pax : 0)
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({
        id: r.id as string, categoryId: 'ristorante', table: 'event_restaurant_details',
        sotto_categoria: (r.sotto_categoria as string) || 'pranzo',
        descrizione: (r.tipologia_servizio as string) || 'Ristorante',
        fornitore: getSupName(r.supplier_id as string), supplierId: (r.supplier_id as string) || '',
        qty: pax, venduto, costo,
        aliquota_iva_venduto: (r.aliquota_iva_venduto as string) || '10',
        iva_inclusa_venduto: (r.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (r.aliquota_iva_costo as string) || '10',
        iva_inclusa_costo: (r.iva_inclusa_costo as boolean) ?? false,
        margine, marginePct, raw: r,
      })
    }

    // Location / Experience
    for (const e of (expRes.data ?? []) as Record<string, unknown>[]) {
      const pax = (e.pax as number) ?? 1
      const venduto = (e.venduto_totale as number) ?? ((e.venduto_unitario as number) ? (e.venduto_unitario as number) * pax : 0)
      const costo = (e.costo_totale as number) ?? ((e.costo_unitario as number) ? (e.costo_unitario as number) * pax : 0)
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({
        id: e.id as string, categoryId: 'location_experience', table: 'event_experience_details',
        sotto_categoria: '',
        descrizione: (e.nome_attivita as string) || 'Experience',
        fornitore: getSupName(e.supplier_id as string), supplierId: (e.supplier_id as string) || '',
        qty: pax, venduto, costo,
        aliquota_iva_venduto: (e.aliquota_iva_venduto as string) || '22',
        iva_inclusa_venduto: (e.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (e.aliquota_iva_costo as string) || '22',
        iva_inclusa_costo: (e.iva_inclusa_costo as boolean) ?? false,
        margine, marginePct, raw: e,
      })
    }

    // Catering
    for (const c of (catRes.data ?? []) as Record<string, unknown>[]) {
      const pax = (c.pax as number) ?? 1
      const venduto = (c.venduto_totale as number) ?? ((c.venduto_per_persona as number) ? (c.venduto_per_persona as number) * pax : 0)
      const costo = (c.costo_totale as number) ?? ((c.costo_per_persona as number) ? (c.costo_per_persona as number) * pax : 0)
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({
        id: c.id as string, categoryId: 'catering', table: 'event_catering_details',
        sotto_categoria: '',
        descrizione: (c.tipologia as string) || 'Catering',
        fornitore: getSupName(c.supplier_id as string), supplierId: (c.supplier_id as string) || '',
        qty: pax, venduto, costo,
        aliquota_iva_venduto: (c.aliquota_iva_venduto as string) || '10',
        iva_inclusa_venduto: (c.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (c.aliquota_iva_costo as string) || '10',
        iva_inclusa_costo: (c.iva_inclusa_costo as boolean) ?? false,
        margine, marginePct, raw: c,
      })
    }

    // Staff Simmetria
    for (const si of (staffIntRes.data ?? []) as Record<string, unknown>[]) {
      const venduto = (si.venduto_totale as number) ?? 0
      const costo = (si.costo_totale as number) ?? (si.costo_giornaliero as number) ?? 0
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({
        id: si.id as string, categoryId: 'staff_simmetria', table: 'event_staff_interno_details',
        sotto_categoria: '',
        descrizione: (si.risorsa as string) || (si.ruolo as string) || 'Staff',
        fornitore: 'Simmetria', supplierId: '',
        qty: 1, venduto, costo,
        aliquota_iva_venduto: (si.aliquota_iva_venduto as string) || '22',
        iva_inclusa_venduto: (si.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (si.aliquota_iva_costo as string) || '22',
        iva_inclusa_costo: (si.iva_inclusa_costo as boolean) ?? false,
        margine, marginePct, raw: si,
      })
    }

    // Staff Esterno
    for (const se of (staffExtRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (se.quantita as number) ?? 1
      const venduto = (se.venduto_totale as number) ?? ((se.venduto_unitario as number) ? (se.venduto_unitario as number) * qty : 0)
      const costo = (se.costo_totale as number) ?? ((se.costo_unitario as number) ? (se.costo_unitario as number) * qty : 0)
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({
        id: se.id as string, categoryId: 'staff_esterno', table: 'event_staff_esterno_details',
        sotto_categoria: '',
        descrizione: (se.ruolo as string) || 'Staff esterno',
        fornitore: getSupName(se.supplier_id as string), supplierId: (se.supplier_id as string) || '',
        qty, venduto, costo,
        aliquota_iva_venduto: (se.aliquota_iva_venduto as string) || '22',
        iva_inclusa_venduto: (se.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (se.aliquota_iva_costo as string) || '22',
        iva_inclusa_costo: (se.iva_inclusa_costo as boolean) ?? false,
        margine, marginePct, raw: se,
      })
    }

    // Audio Video
    for (const av of (avRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (av.quantita as number) ?? 1
      const venduto = (av.venduto_totale as number) ?? ((av.venduto_unitario as number) ? (av.venduto_unitario as number) * qty : 0)
      const costo = (av.costo_totale as number) ?? ((av.costo_unitario as number) ? (av.costo_unitario as number) * qty : 0)
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({
        id: av.id as string, categoryId: 'audio_video', table: 'event_audio_video_details',
        sotto_categoria: '',
        descrizione: (av.tipologia_servizio as string) || (av.descrizione as string) || 'Audio Video',
        fornitore: getSupName(av.supplier_id as string), supplierId: (av.supplier_id as string) || '',
        qty, venduto, costo,
        aliquota_iva_venduto: (av.aliquota_iva_venduto as string) || '22',
        iva_inclusa_venduto: (av.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (av.aliquota_iva_costo as string) || '22',
        iva_inclusa_costo: (av.iva_inclusa_costo as boolean) ?? false,
        margine, marginePct, raw: av,
      })
    }

    // Allestimenti
    for (const al of (allestRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (al.quantita as number) ?? 1
      const venduto = (al.venduto_totale as number) ?? ((al.venduto_unitario as number) ? (al.venduto_unitario as number) * qty : 0)
      const costo = (al.costo_totale as number) ?? ((al.costo_unitario as number) ? (al.costo_unitario as number) * qty : 0)
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({
        id: al.id as string, categoryId: 'allestimenti', table: 'event_allestimenti_details',
        sotto_categoria: '',
        descrizione: (al.descrizione as string) || 'Allestimento',
        fornitore: getSupName(al.supplier_id as string), supplierId: (al.supplier_id as string) || '',
        qty, venduto, costo,
        aliquota_iva_venduto: (al.aliquota_iva_venduto as string) || '22',
        iva_inclusa_venduto: (al.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (al.aliquota_iva_costo as string) || '22',
        iva_inclusa_costo: (al.iva_inclusa_costo as boolean) ?? false,
        margine, marginePct, raw: al,
      })
    }

    // Grafica
    for (const g of (graficaRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (g.quantita as number) ?? 1
      const venduto = (g.venduto_totale as number) ?? ((g.venduto_unitario as number) ? (g.venduto_unitario as number) * qty : 0)
      const costo = (g.costo_totale as number) ?? ((g.costo_unitario as number) ? (g.costo_unitario as number) * qty : 0)
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({
        id: g.id as string, categoryId: 'grafica', table: 'event_grafica_stampa_details',
        sotto_categoria: '',
        descrizione: (g.tipo_materiale as string) || (g.descrizione as string) || 'Grafica',
        fornitore: getSupName(g.supplier_id as string), supplierId: (g.supplier_id as string) || '',
        qty, venduto, costo,
        aliquota_iva_venduto: (g.aliquota_iva_venduto as string) || '22',
        iva_inclusa_venduto: (g.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (g.aliquota_iva_costo as string) || '22',
        iva_inclusa_costo: (g.iva_inclusa_costo as boolean) ?? false,
        margine, marginePct, raw: g,
      })
    }

    // Varie
    for (const v of (varieRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (v.quantita as number) ?? 1
      const venduto = (v.venduto_totale as number) ?? ((v.venduto_unitario as number) ? (v.venduto_unitario as number) * qty : 0)
      const costo = (v.costo_totale as number) ?? ((v.costo_unitario as number) ? (v.costo_unitario as number) * qty : 0)
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({
        id: v.id as string, categoryId: 'varie', table: 'event_varie_details',
        sotto_categoria: '',
        descrizione: (v.descrizione as string) || 'Voce varia',
        fornitore: getSupName(v.supplier_id as string), supplierId: (v.supplier_id as string) || '',
        qty, venduto, costo,
        aliquota_iva_venduto: (v.aliquota_iva_venduto as string) || '22',
        iva_inclusa_venduto: (v.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (v.aliquota_iva_costo as string) || '22',
        iva_inclusa_costo: (v.iva_inclusa_costo as boolean) ?? false,
        margine, marginePct, raw: v,
      })
    }

    setLines(all)
    setLoading(false)
  }, [event.id, suppliers])

  useEffect(() => { loadData() }, [loadData])

  const totals = useMemo(() => {
    const venduto = lines.reduce((s, l) => s + l.venduto, 0)
    const costo = lines.reduce((s, l) => s + l.costo, 0)
    const fee = venduto * feePct / 100
    const ricavi = venduto + fee
    const margine = ricavi - costo
    const marginePct = ricavi > 0 ? (margine / ricavi) * 100 : 0
    return { venduto, costo, fee, ricavi, margine, marginePct }
  }, [lines, feePct])

  // Group lines by category (only categories with data)
  const grouped = useMemo(() => {
    const map: Record<string, BudgetLineItem[]> = {}
    for (const l of lines) map[l.categoryId] = [...(map[l.categoryId] || []), l]
    return BUDGET_CATEGORIES
      .filter(cat => map[cat.id] && map[cat.id].length > 0)
      .map(cat => ({ ...cat, items: map[cat.id] }))
  }, [lines])

  function startEdit(line: BudgetLineItem) {
    setEditingId(line.id)
    setEditForm({
      descrizione: line.raw.titolo as string || line.raw.descrizione as string || line.raw.nome_attivita as string || line.raw.tipologia_servizio as string || line.raw.tipologia as string || line.raw.risorsa as string || line.raw.ruolo as string || line.raw.tipo_materiale as string || '',
      sotto_categoria: line.sotto_categoria,
      quantita: line.qty,
      venduto_totale: line.venduto || '',
      costo_totale: line.costo || '',
      aliquota_iva_venduto: line.aliquota_iva_venduto,
      iva_inclusa_venduto: line.iva_inclusa_venduto,
      aliquota_iva_costo: line.aliquota_iva_costo,
      iva_inclusa_costo: line.iva_inclusa_costo,
      supplier_id: line.supplierId,
      note: (line.raw.note as string) || (line.raw.note_operative as string) || '',
    })
  }

  async function saveEdit(line: BudgetLineItem) {
    setSaving(true)
    const qty = Number(editForm.quantita) || 1
    const vt = editForm.venduto_totale !== '' ? Number(editForm.venduto_totale) : 0
    const ct = editForm.costo_totale !== '' ? Number(editForm.costo_totale) : 0

    const patch: Record<string, unknown> = {
      venduto_totale: vt,
      costo_totale: ct,
      aliquota_iva_venduto: editForm.aliquota_iva_venduto || '22',
      iva_inclusa_venduto: editForm.iva_inclusa_venduto ?? false,
      aliquota_iva_costo: editForm.aliquota_iva_costo || '22',
      iva_inclusa_costo: editForm.iva_inclusa_costo ?? false,
    }

    if (line.table === 'event_supplier_services') {
      patch.titolo = editForm.descrizione || ''
      patch.quantita = qty
      patch.sotto_categoria = editForm.sotto_categoria || 'auto'
      patch.venduto_unitario = qty > 0 ? vt / qty : vt
      patch.costo_unitario = qty > 0 ? ct / qty : ct
    } else if (line.table === 'event_hotel_details') {
      patch.titolo = editForm.descrizione || ''
      patch.quantita = qty
      patch.sotto_categoria = editForm.sotto_categoria || 'camere'
      patch.venduto_unitario = qty > 0 ? vt / qty : vt
      patch.costo_unitario = qty > 0 ? ct / qty : ct
    } else if (line.table === 'event_restaurant_details') {
      patch.tipologia_servizio = editForm.descrizione || ''
      patch.pax_confermati = qty
      patch.sotto_categoria = editForm.sotto_categoria || 'pranzo'
      patch.budget_totale = vt
      patch.budget_per_persona = qty > 0 ? vt / qty : vt
      patch.costo_totale_reale = ct
      patch.costo_per_persona = qty > 0 ? ct / qty : ct
    } else if (line.table === 'event_experience_details') {
      patch.nome_attivita = editForm.descrizione || ''
      patch.pax = qty
    } else if (line.table === 'event_catering_details') {
      patch.tipologia = editForm.descrizione || ''
      patch.pax = qty
      patch.venduto_per_persona = qty > 0 ? vt / qty : vt
      patch.costo_per_persona = qty > 0 ? ct / qty : ct
    } else if (line.table === 'event_staff_interno_details') {
      patch.risorsa = editForm.descrizione || ''
    } else if (line.table === 'event_staff_esterno_details') {
      patch.ruolo = editForm.descrizione || ''
      patch.quantita = qty
      patch.venduto_unitario = qty > 0 ? vt / qty : vt
      patch.costo_unitario = qty > 0 ? ct / qty : ct
    } else if (line.table === 'event_audio_video_details') {
      patch.tipologia_servizio = editForm.descrizione || ''
      patch.quantita = qty
    } else if (line.table === 'event_allestimenti_details') {
      patch.descrizione = editForm.descrizione || ''
      patch.quantita = qty
    } else if (line.table === 'event_grafica_stampa_details') {
      patch.tipo_materiale = editForm.descrizione || ''
      patch.quantita = qty
    } else {
      patch.descrizione = editForm.descrizione || ''
      patch.quantita = qty
      patch.venduto_unitario = qty > 0 ? vt / qty : vt
      patch.costo_unitario = qty > 0 ? ct / qty : ct
    }

    if (editForm.note) patch.note = editForm.note

    await supabase.from(line.table).update(patch).eq('id', line.id)
    setEditingId(null)
    setSaving(false)
    await loadData()
  }

  async function deleteLine(line: BudgetLineItem) {
    await supabase.from(line.table).delete().eq('id', line.id)
    setDeletingId(null)
    setExpandedId(null)
    await loadData()
  }

  function initAddForm(categoryId: CategoryId) {
    setAddingCategory(categoryId)
    const cat = BUDGET_CATEGORIES.find(c => c.id === categoryId)!
    setAddForm({
      descrizione: '',
      sotto_categoria: cat.sottocategorie[0] || '',
      quantita: 1,
      venduto_totale: '',
      costo_totale: '',
      aliquota_iva_venduto: '22',
      iva_inclusa_venduto: false,
      aliquota_iva_costo: '22',
      iva_inclusa_costo: false,
      supplier_id: '',
      note: '',
    })
  }

  async function saveNewLine() {
    if (!addingCategory) return
    setSaving(true)
    const cat = BUDGET_CATEGORIES.find(c => c.id === addingCategory)!
    const qty = Number(addForm.quantita) || 1
    const vt = addForm.venduto_totale !== '' ? Number(addForm.venduto_totale) : 0
    const ct = addForm.costo_totale !== '' ? Number(addForm.costo_totale) : 0

    const base: Record<string, unknown> = {
      event_id: event.id,
      venduto_totale: vt,
      costo_totale: ct,
      aliquota_iva_venduto: addForm.aliquota_iva_venduto || '22',
      iva_inclusa_venduto: addForm.iva_inclusa_venduto ?? false,
      aliquota_iva_costo: addForm.aliquota_iva_costo || '22',
      iva_inclusa_costo: addForm.iva_inclusa_costo ?? false,
    }

    if (addForm.supplier_id) base.supplier_id = addForm.supplier_id

    if (cat.table === 'event_supplier_services') {
      base.titolo = addForm.descrizione || 'Transfer'
      base.quantita = qty
      base.sotto_categoria = addForm.sotto_categoria || 'auto'
      base.venduto_unitario = qty > 0 ? vt / qty : vt
      base.costo_unitario = qty > 0 ? ct / qty : ct
      base.categoria = 'Transfer'
    } else if (cat.table === 'event_hotel_details') {
      base.titolo = addForm.descrizione || 'Hotel'
      base.quantita = qty
      base.sotto_categoria = addForm.sotto_categoria || 'camere'
      base.venduto_unitario = qty > 0 ? vt / qty : vt
      base.costo_unitario = qty > 0 ? ct / qty : ct
    } else if (cat.table === 'event_restaurant_details') {
      base.tipologia_servizio = addForm.descrizione || 'Ristorante'
      base.pax_confermati = qty
      base.sotto_categoria = addForm.sotto_categoria || 'pranzo'
      base.budget_totale = vt
      base.budget_per_persona = qty > 0 ? vt / qty : vt
      base.costo_totale_reale = ct
      base.costo_per_persona = qty > 0 ? ct / qty : ct
    } else if (cat.table === 'event_experience_details') {
      base.nome_attivita = addForm.descrizione || 'Experience'
      base.pax = qty
    } else if (cat.table === 'event_catering_details') {
      base.tipologia = addForm.descrizione || 'Catering'
      base.pax = qty
      base.venduto_per_persona = qty > 0 ? vt / qty : vt
      base.costo_per_persona = qty > 0 ? ct / qty : ct
    } else if (cat.table === 'event_staff_interno_details') {
      base.risorsa = addForm.descrizione || 'Staff'
    } else if (cat.table === 'event_staff_esterno_details') {
      base.ruolo = addForm.descrizione || 'Staff esterno'
      base.quantita = qty
      base.venduto_unitario = qty > 0 ? vt / qty : vt
      base.costo_unitario = qty > 0 ? ct / qty : ct
    } else if (cat.table === 'event_audio_video_details') {
      base.tipologia_servizio = addForm.descrizione || 'Audio Video'
      base.quantita = qty
    } else if (cat.table === 'event_allestimenti_details') {
      base.descrizione = addForm.descrizione || 'Allestimento'
      base.quantita = qty
    } else if (cat.table === 'event_grafica_stampa_details') {
      base.tipo_materiale = addForm.descrizione || 'Grafica'
      base.quantita = qty
    } else {
      base.descrizione = addForm.descrizione || 'Voce'
      base.quantita = qty
      base.venduto_unitario = qty > 0 ? vt / qty : vt
      base.costo_unitario = qty > 0 ? ct / qty : ct
    }

    if (addForm.note) base.note = addForm.note

    await supabase.from(cat.table).insert(base)
    setAddingCategory(null)
    setSaving(false)
    await loadData()
  }

  const fmt = (n: number) => '\u20AC' + n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento budget...</div></div>
  }

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <AnimatedLaserBorder loading={saving}>
        <div className="panel p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard label="Totale Venduto Servizi" value={fmt(totals.venduto)} color="var(--text)" />
            <div className="text-center">
              <p className="text-xs flex items-center justify-center gap-1" style={{ color: 'var(--muted)' }}>
                Fee Simmetria
                {!editingFee && (
                  <button onClick={() => { setEditingFee(true); setFeeInput(String(feePct)) }} className="opacity-60 hover:opacity-100 transition-opacity">
                    <Edit3 className="w-3 h-3" />
                  </button>
                )}
              </p>
              {editingFee ? (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <input type="number" step="0.5" min="0" max="100" value={feeInput}
                    onChange={e => setFeeInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveFee(Number(feeInput) || 0); if (e.key === 'Escape') setEditingFee(false) }}
                    className="w-16 px-2 py-1 text-center text-sm rounded-lg"
                    style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                    autoFocus
                  />
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>%</span>
                  <button onClick={() => saveFee(Number(feeInput) || 0)} className="p-1 rounded-lg hover:bg-white/10" style={{ color: 'var(--green)' }}>
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-xl font-bold mt-1" style={{ color: 'var(--blue)' }}>
                  {fmt(totals.fee)}
                  <span className="text-xs font-normal ml-1" style={{ color: 'var(--muted)' }}>({feePct}%)</span>
                </p>
              )}
            </div>
            <KpiCard label="Totale Ricavi" value={fmt(totals.ricavi)} color="var(--text)" />
          </div>
          <div className="h-px" style={{ background: 'var(--line)' }} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard label="Totale Costi" value={fmt(totals.costo)} color="var(--yellow)" />
            <KpiCard label="Margine Netto" value={fmt(totals.margine)} color={totals.margine >= 0 ? 'var(--green)' : 'var(--red2)'} />
            <KpiCard label="Margine %" value={`${totals.marginePct.toFixed(1)}%`} color={totals.marginePct >= 20 ? 'var(--green)' : totals.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)'} />
          </div>
        </div>
      </AnimatedLaserBorder>

      {/* Margin bar */}
      {totals.venduto > 0 && (
        <div className="panel p-4">
          <div className="flex justify-between text-xs mb-2">
            <span style={{ color: 'var(--muted)' }}>Margine operativo</span>
            <span style={{ color: totals.marginePct >= 20 ? 'var(--green)' : 'var(--yellow)' }}>{totals.marginePct.toFixed(1)}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.min(Math.max(totals.marginePct, 0), 100)}%`,
              background: totals.marginePct >= 20 ? 'var(--green)' : totals.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)',
            }} />
          </div>
        </div>
      )}

      {/* Categories */}
      {grouped.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Euro className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun dato economico</p>
          <p className="text-xs mt-1">Aggiungi voci di budget tramite il pulsante + nelle categorie sottostanti</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(cat => {
            const catVenduto = cat.items.reduce((s, i) => s + i.venduto, 0)
            const catCosto = cat.items.reduce((s, i) => s + i.costo, 0)
            const catMargine = catVenduto - catCosto
            const catMarginePct = catVenduto > 0 ? (catMargine / catVenduto) * 100 : 0

            return (
              <div key={cat.id} className="panel overflow-hidden">
                {/* Category header */}
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--panel2)' }}>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-bold tracking-wide" style={{ color: 'var(--text)' }}>{cat.label}</p>
                    <button
                      onClick={() => initAddForm(cat.id)}
                      className="w-6 h-6 rounded-md flex items-center justify-center transition-all hover:scale-110"
                      style={{ background: 'rgba(208,0,58,0.15)', color: 'var(--red2)' }}
                      title="Aggiungi voce"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span style={{ color: 'var(--muted)' }}>V: <strong style={{ color: 'var(--text)' }}>{fmt(catVenduto)}</strong></span>
                    <span style={{ color: 'var(--muted)' }}>C: <strong style={{ color: 'var(--yellow)' }}>{fmt(catCosto)}</strong></span>
                    <span style={{ color: 'var(--muted)' }}>M: <strong style={{ color: catMargine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(catMargine)} ({catMarginePct.toFixed(0)}%)</strong></span>
                  </div>
                </div>

                {/* Table header */}
                <div className="px-4 py-2 flex items-center gap-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
                  <span className="w-4" />
                  <span className="flex-1">Descrizione</span>
                  {cat.sottocategorie.length > 0 && <span className="w-24">Tipo</span>}
                  <span className="w-20 hidden sm:block">Fornitore</span>
                  <span className="w-10 text-right">Qty</span>
                  <span className="w-20 text-right">Venduto</span>
                  <span className="w-20 text-right">Costo</span>
                  <span className="w-16 text-right">IVA V.</span>
                  <span className="w-20 text-right">Margine</span>
                  <span className="w-12 text-right">M%</span>
                </div>

                {/* Lines */}
                {cat.items.map(item => {
                  const isExpanded = expandedId === item.id
                  const isEditing = editingId === item.id
                  return (
                    <div key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <button
                        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${isExpanded ? '' : '-rotate-90'}`} style={{ color: 'var(--muted)' }} />
                        <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{item.descrizione}</span>
                        {cat.sottocategorie.length > 0 && (
                          <span className="w-24 text-xs truncate" style={{ color: 'var(--muted)' }}>
                            {SOTTO_LABELS[item.sotto_categoria] || item.sotto_categoria}
                          </span>
                        )}
                        <span className="w-20 text-xs truncate hidden sm:block" style={{ color: 'var(--muted)' }}>{item.fornitore}</span>
                        <span className="w-10 text-xs text-right" style={{ color: 'var(--text)' }}>{item.qty}</span>
                        <span className="w-20 text-xs text-right" style={{ color: 'var(--text)' }}>{fmt(item.venduto)}</span>
                        <span className="w-20 text-xs text-right" style={{ color: 'var(--yellow)' }}>{fmt(item.costo)}</span>
                        <span className="w-16 text-xs text-right" style={{ color: 'var(--muted)' }}>
                          {item.aliquota_iva_venduto}%{item.iva_inclusa_venduto ? 'i' : 'e'}
                        </span>
                        <span className="w-20 text-xs text-right font-medium" style={{ color: item.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(item.margine)}</span>
                        <span className="w-12 text-xs text-right font-medium" style={{ color: item.marginePct >= 20 ? 'var(--green)' : item.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }}>{item.marginePct.toFixed(0)}%</span>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2" style={{ background: 'var(--bg)' }}>
                          {isEditing ? (
                            <LineEditForm
                              form={editForm}
                              setForm={setEditForm}
                              categoryId={item.categoryId}
                              suppliers={suppliers}
                              saving={saving}
                              onSave={() => saveEdit(item)}
                              onCancel={() => setEditingId(null)}
                            />
                          ) : (
                            <LineDetails
                              line={item}
                              onEdit={() => startEdit(item)}
                              onDelete={() => setDeletingId(item.id)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* Add buttons for empty categories */}
      {grouped.length < BUDGET_CATEGORIES.length && (
        <div className="panel p-4">
          <p className="text-xs font-medium mb-3" style={{ color: 'var(--muted)' }}>Aggiungi categoria:</p>
          <div className="flex flex-wrap gap-2">
            {BUDGET_CATEGORIES
              .filter(cat => !grouped.find(g => g.id === cat.id))
              .map(cat => (
                <button
                  key={cat.id}
                  onClick={() => initAddForm(cat.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                  style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}
                >
                  <Plus className="w-3 h-3" style={{ color: 'var(--red2)' }} />
                  {cat.label}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Grand total row */}
      {lines.length > 0 && (
        <div className="panel p-4">
          <div className="flex items-center justify-between text-sm px-2">
            <span className="font-bold tracking-wide" style={{ color: 'var(--text)' }}>TOTALE EVENTO</span>
            <div className="flex items-center gap-6 text-xs">
              <span>Venduto: <strong style={{ color: 'var(--text)' }}>{fmt(totals.venduto)}</strong></span>
              <span>Costi: <strong style={{ color: 'var(--yellow)' }}>{fmt(totals.costo)}</strong></span>
              <span>Fee: <strong style={{ color: 'var(--blue)' }}>{fmt(totals.fee)}</strong></span>
              <span>Margine: <strong style={{ color: totals.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(totals.margine)}</strong></span>
              <span style={{ color: totals.marginePct >= 20 ? 'var(--green)' : 'var(--yellow)' }}><strong>{totals.marginePct.toFixed(1)}%</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Add line modal */}
      {addingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAddingCategory(null)}>
          <div className="relative w-full max-w-lg mx-4 rounded-2xl p-6 space-y-4" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold" style={{ color: 'var(--text)' }}>
                Aggiungi voce - {BUDGET_CATEGORIES.find(c => c.id === addingCategory)?.label}
              </h3>
              <button onClick={() => setAddingCategory(null)} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <LineEditForm
              form={addForm}
              setForm={setAddForm}
              categoryId={addingCategory}
              suppliers={suppliers}
              saving={saving}
              onSave={saveNewLine}
              onCancel={() => setAddingCategory(null)}
              isNew
            />
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingId(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Elimina voce budget</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Questa azione elimina la voce di budget. Il fornitore NON viene eliminato.</p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setDeletingId(null)}>Annulla</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={() => { const l = lines.find(x => x.id === deletingId); if (l) deleteLine(l) }}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  )
}

function LineDetails({ line, onEdit, onDelete }: { line: BudgetLineItem; onEdit: () => void; onDelete: () => void }) {
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mb-4">
        <DetailField label="Descrizione" value={line.descrizione} />
        {line.sotto_categoria && <DetailField label="Sotto-categoria" value={SOTTO_LABELS[line.sotto_categoria] || line.sotto_categoria} />}
        {line.fornitore && <DetailField label="Fornitore" value={line.fornitore} />}
        <DetailField label="Quantita" value={String(line.qty)} />
        <DetailField label="Venduto cliente" value={`\u20AC${line.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`} />
        <DetailField label="Costo reale" value={`\u20AC${line.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`} />
        <DetailField label="IVA Venduto" value={`${line.aliquota_iva_venduto}% ${line.iva_inclusa_venduto ? '(inclusa)' : '(esclusa)'}`} />
        <DetailField label="IVA Costo" value={`${line.aliquota_iva_costo}% ${line.iva_inclusa_costo ? '(inclusa)' : '(esclusa)'}`} />
        <DetailField label="Margine" value={`\u20AC${line.margine.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`} />
        <DetailField label="Margine %" value={`${line.marginePct.toFixed(1)}%`} />
      </div>
      <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80" style={{ background: 'var(--panel2)', color: 'var(--blue)' }} onClick={onEdit}>
          <Edit3 className="w-3 h-3" /> Modifica
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80" style={{ background: 'var(--panel2)', color: 'var(--red2)' }} onClick={onDelete}>
          <Trash2 className="w-3 h-3" /> Elimina
        </button>
      </div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text)' }}>{value}</p>
    </div>
  )
}

function LineEditForm({ form, setForm, categoryId, suppliers, saving, onSave, onCancel, isNew }: {
  form: Record<string, string | number | boolean>
  setForm: (f: Record<string, string | number | boolean>) => void
  categoryId: CategoryId
  suppliers: Supplier[]
  saving: boolean
  onSave: () => void
  onCancel: () => void
  isNew?: boolean
}) {
  const upd = (key: string, val: string | number | boolean) => setForm({ ...form, [key]: val })
  const cat = BUDGET_CATEGORIES.find(c => c.id === categoryId)!

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Descrizione</label>
          <input type="text" value={String(form.descrizione ?? '')} onChange={e => upd('descrizione', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}
            placeholder="Descrizione voce" />
        </div>

        {cat.sottocategorie.length > 0 && (
          <div>
            <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Sotto-categoria</label>
            <select value={String(form.sotto_categoria ?? '')} onChange={e => upd('sotto_categoria', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
              {cat.sottocategorie.map(sc => (
                <option key={sc} value={sc}>{SOTTO_LABELS[sc] || sc}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Quantita</label>
          <input type="number" min="1" value={String(form.quantita ?? 1)} onChange={e => upd('quantita', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }} />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Venduto cliente</label>
          <input type="number" step="0.01" value={String(form.venduto_totale ?? '')} onChange={e => upd('venduto_totale', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}
            placeholder="0.00" />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Costo reale</label>
          <input type="number" step="0.01" value={String(form.costo_totale ?? '')} onChange={e => upd('costo_totale', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}
            placeholder="0.00" />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Aliquota IVA Venduto</label>
          <select value={String(form.aliquota_iva_venduto ?? '22')} onChange={e => upd('aliquota_iva_venduto', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
            {IVA_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>IVA Venduto</label>
          <select value={form.iva_inclusa_venduto ? 'inclusa' : 'esclusa'} onChange={e => upd('iva_inclusa_venduto', e.target.value === 'inclusa')}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
            <option value="esclusa">Esclusa</option>
            <option value="inclusa">Inclusa</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Aliquota IVA Costo</label>
          <select value={String(form.aliquota_iva_costo ?? '22')} onChange={e => upd('aliquota_iva_costo', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
            {IVA_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>IVA Costo</label>
          <select value={form.iva_inclusa_costo ? 'inclusa' : 'esclusa'} onChange={e => upd('iva_inclusa_costo', e.target.value === 'inclusa')}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
            <option value="esclusa">Esclusa</option>
            <option value="inclusa">Inclusa</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Fornitore</label>
          <select value={String(form.supplier_id ?? '')} onChange={e => upd('supplier_id', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
            <option value="">Nessuno</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>

        <div className="sm:col-span-3">
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Note</label>
          <input type="text" value={String(form.note ?? '')} onChange={e => upd('note', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }} />
        </div>
      </div>

      {/* Margin preview */}
      {(form.venduto_totale || form.costo_totale) && (
        <div className="flex items-center gap-4 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)' }}>
          {(() => {
            const v = Number(form.venduto_totale) || 0
            const c = Number(form.costo_totale) || 0
            const m = v - c
            const mp = v > 0 ? (m / v) * 100 : 0
            return (
              <>
                <span style={{ color: 'var(--muted)' }}>Margine: <strong style={{ color: m >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{m.toLocaleString('it-IT', { minimumFractionDigits: 2 })} ({mp.toFixed(1)}%)</strong></span>
              </>
            )
          })()}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
        <button disabled={saving} onClick={onSave}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
          <Save className="w-3 h-3" /> {saving ? 'Salvataggio...' : isNew ? 'Crea voce' : 'Salva'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>Annulla</button>
      </div>
    </div>
  )
}
