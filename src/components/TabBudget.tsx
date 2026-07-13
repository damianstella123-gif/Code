import { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronDown, Edit3, Save, Euro, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Clock, ShieldCheck, Lock, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadUser } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { calcRowEconomics } from '@/lib/event-economics'
import { fmtDate as fmtDateCentral } from '@/lib/format'
import AnimatedLaserBorder from '@/components/AnimatedLaserBorder'
import type { Event } from '@/data/events'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

interface Supplier {
  id: string
  nome: string
  categoria: string
}

const CATEGORY_ORDER = [
  'HOTEL', 'TRANSFER', 'RISTORANTE', 'LOCATION / EXPERIENCE',
  'CATERING', 'AUDIO VIDEO', 'ALLESTIMENTI', 'STAFF',
  'GRAFICA', 'VARIE',
] as const

const SERVICE_CAT_TO_BUDGET: Record<string, string> = {
  hotel: 'HOTEL',
  transfer: 'TRANSFER',
  ristorante: 'RISTORANTE',
  experience: 'LOCATION / EXPERIENCE',
  catering: 'CATERING',
  audio_video: 'AUDIO VIDEO',
  allestimenti: 'ALLESTIMENTI',
  staff_interno: 'STAFF',
  staff_esterno: 'STAFF',
  grafica_stampa: 'GRAFICA',
  varie: 'VARIE',
}

const SOTTO_LABELS: Record<string, string> = {
  camere: 'Camere', city_tax: 'City Tax', parcheggi: 'Parcheggi',
  meeting_room: 'Meeting Room', coffee_break: 'Coffee Break',
  auto: 'Auto', minivan: 'Minivan', minibus: 'Minibus',
  corse_multiple: 'Corse Multiple', disposizione: 'Disposizione',
  pranzo: 'Pranzo', cena: 'Cena', aperitivo: 'Aperitivo',
  aperitivo_rinforzato: 'Aperitivo Rinforzato', area_riservata: 'Area Riservata',
  esclusiva: 'Esclusiva',
  staff_simmetria: 'Staff Simmetria', staff_esterno: 'Staff Esterno',
}

type StatoConferma = 'richiesto' | 'confermato' | 'contrattualizzato'

interface BudgetLine {
  id: string
  categoria: string
  sotto_categoria: string
  descrizione: string
  fornitore: string
  supplierId: string
  table: string
  qty: number
  venduto: number
  costo: number
  aliquota_iva_venduto: string
  iva_inclusa_venduto: boolean
  aliquota_iva_costo: string
  iva_inclusa_costo: boolean
  commissione_pct: number | null
  commissione_importo: number | null
  margine: number
  marginePct: number
  stato_conferma: StatoConferma
  dateLabel: string
}

const STATO_CONFIG: Record<StatoConferma, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  richiesto: { label: 'Stimato', color: 'var(--yellow)', icon: Clock },
  confermato: { label: 'Confermato', color: 'var(--blue)', icon: CheckCircle2 },
  contrattualizzato: { label: 'Contratto', color: 'var(--green)', icon: ShieldCheck },
}

export default function TabBudget({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [lines, setLines] = useState<BudgetLine[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { showToast } = useToast()
  const [user, setUser] = useState<any>(null)

  const [versions, setVersions] = useState<any[]>([])
  const [activeVersion, setActiveVersion] = useState<string | null>(null)
  const [showNewVersion, setShowNewVersion] = useState(false)
  const [newVersionName, setNewVersionName] = useState('')

  const [feePct, setFeePct] = useState(event.fee_agenzia_pct ?? 6)
  const [editingFee, setEditingFee] = useState(false)
  const [feeInput, setFeeInput] = useState(String(event.fee_agenzia_pct ?? 6))
  const [savingFee, setSavingFee] = useState(false)

  const [margineTarget, setMargineTarget] = useState(event.margine_target ?? 25)
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetInput, setTargetInput] = useState(String(event.margine_target ?? 25))

  async function saveFee(newPct: number) {
    setSavingFee(true)
    setFeePct(newPct)
    setEditingFee(false)
    await supabase.from('events').update({ fee_agenzia_pct: newPct }).eq('id', event.id)
    setSavingFee(false)
  }

  async function saveTarget(newTarget: number) {
    setMargineTarget(newTarget)
    setEditingTarget(false)
    await supabase.from('events').update({ margine_target: newTarget }).eq('id', event.id)
  }

  // ─── Budget Versions ───────────────────────────────────────
  useEffect(() => { setUser(loadUser()) }, [])

  useEffect(() => {
    supabase.from('budget_versions')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setVersions(data || [])
        if (data?.length) setActiveVersion(data[0].id)
      })
  }, [event.id])

  async function approveVersion(id: string) {
    await supabase.from('budget_versions').update({ stato: 'rifiutato' })
      .eq('event_id', event.id).eq('tipo', 'preventivo').neq('id', id)
    await supabase.from('budget_versions')
      .update({ stato: 'approvato', approvato_at: new Date().toISOString() })
      .eq('id', id)
    setVersions(prev => prev.map(v => ({
      ...v,
      stato: v.id === id ? 'approvato' : v.tipo === 'preventivo' ? 'rifiutato' : v.stato
    })))
    showToast('Preventivo approvato', 'success')
  }

  async function createConsuntivo(fromId: string) {
    const { data: newV } = await supabase.from('budget_versions')
      .insert({ event_id: event.id, nome: 'Consuntivo', tipo: 'consuntivo', stato: 'bozza', created_by: user?.id })
      .select().single()
    if (!newV) return
    const tables = ['event_hotel_details', 'event_restaurant_details', 'event_experience_details',
      'event_catering_details', 'event_staff_interno_details', 'event_staff_esterno_details',
      'event_varie_details', 'event_audio_video_details', 'event_allestimenti_details',
      'event_grafica_stampa_details', 'event_supplier_services']
    for (const table of tables) {
      const { data: rows } = await supabase.from(table as any).select('*').eq('budget_version_id', fromId)
      if (rows?.length) {
        const copies = rows.map((r: any) => {
          const { id: _id, created_at: _ca, ...rest } = r
          return { ...rest, budget_version_id: newV.id }
        })
        await supabase.from(table as any).insert(copies)
      }
    }
    setVersions(prev => [...prev, newV])
    setActiveVersion(newV.id)
    showToast('Consuntivo creato', 'success')
  }

  async function duplicateVersion(fromId: string) {
    const source = versions.find(v => v.id === fromId)
    const { data: newV } = await supabase.from('budget_versions')
      .insert({ event_id: event.id, nome: `${source?.nome} (copia)`, tipo: 'preventivo', stato: 'bozza', created_by: user?.id })
      .select().single()
    if (!newV) return
    const tables = ['event_hotel_details', 'event_restaurant_details', 'event_experience_details',
      'event_catering_details', 'event_staff_interno_details', 'event_staff_esterno_details',
      'event_varie_details', 'event_audio_video_details', 'event_allestimenti_details',
      'event_grafica_stampa_details', 'event_supplier_services']
    for (const table of tables) {
      const { data: rows } = await supabase.from(table as any).select('*').eq('budget_version_id', fromId)
      if (rows?.length) {
        const copies = rows.map((r: any) => {
          const { id: _id, created_at: _ca, ...rest } = r
          return { ...rest, budget_version_id: newV.id }
        })
        await supabase.from(table as any).insert(copies)
      }
    }
    setVersions(prev => [...prev, newV])
    setActiveVersion(newV.id)
    showToast('Versione duplicata', 'success')
  }

  function getSupName(id: string | null | undefined) {
    if (!id) return ''
    return suppliers.find(s => s.id === id)?.nome ?? ''
  }

  function fmtDate(d: unknown): string {
    if (!d || typeof d !== 'string') return ''
    return fmtDateCentral(d)
  }

  const loadData = useCallback(async () => {
    const vFilter = activeVersion
    const bvq = (table: string) => {
      let q = supabase.from(table as any).select('*').eq('event_id', event.id)
      if (vFilter) q = q.eq('budget_version_id', vFilter)
      return q
    }
    const [linksRes, svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
      supabase.from('event_suppliers').select('supplier_id, service_category, stato_conferma').eq('event_id', event.id),
      bvq('event_supplier_services'),
      bvq('event_hotel_details'),
      bvq('event_restaurant_details'),
      bvq('event_experience_details'),
      bvq('event_catering_details'),
      bvq('event_staff_interno_details'),
      bvq('event_staff_esterno_details'),
      bvq('event_varie_details'),
      bvq('event_audio_video_details'),
      bvq('event_allestimenti_details'),
      bvq('event_grafica_stampa_details'),
    ])

    const catMap: Record<string, string> = {}
    const statoMap: Record<string, StatoConferma> = {}
    for (const link of (linksRes.data ?? []) as { supplier_id: string; service_category: string; stato_conferma: string }[]) {
      if (link.service_category) {
        catMap[link.supplier_id] = SERVICE_CAT_TO_BUDGET[link.service_category] || 'VARIE'
      }
      statoMap[link.supplier_id] = (link.stato_conferma as StatoConferma) || 'richiesto'
    }

    function resolveCat(supplierId: string | null | undefined, fallback: string): string {
      if (supplierId && catMap[supplierId]) return catMap[supplierId]
      return fallback
    }

    function resolveStato(supplierId: string | null | undefined): StatoConferma {
      if (supplierId && statoMap[supplierId]) return statoMap[supplierId]
      return 'richiesto'
    }

    const all: BudgetLine[] = []

    function normalizzaImporto(importo: number, aliquota: string | number | null, inclusa: boolean): number {
      if (!importo || importo === 0) return 0
      if (inclusa) {
        const pct = parseFloat(String(aliquota || 22)) || 22
        return importo / (1 + pct / 100)
      }
      return importo
    }

    function pushLine(row: Record<string, unknown>, categoria: string, table: string, opts: {
      descrizione: string
      qty: number
      venduto: number
      costo: number
      sotto?: string
      commissione_pct?: number | null
      commissione_importo?: number | null
      dateLabel?: string
    }) {
      const costoNetto = normalizzaImporto(
        opts.costo,
        (row.aliquota_iva_costo as string | number | null) ?? 22,
        (row.iva_inclusa_costo as boolean) ?? false
      )
      const vendutoNetto = normalizzaImporto(
        opts.venduto,
        (row.aliquota_iva_venduto as string | number | null) ?? 22,
        (row.iva_inclusa_venduto as boolean) ?? false
      )
      const margine = vendutoNetto - costoNetto
      const marginePct = vendutoNetto > 0 ? (margine / vendutoNetto) * 100 : 0
      all.push({
        id: row.id as string,
        categoria,
        sotto_categoria: opts.sotto || (row.sotto_categoria as string) || '',
        descrizione: opts.descrizione,
        fornitore: getSupName(row.supplier_id as string),
        supplierId: (row.supplier_id as string) || '',
        table,
        qty: opts.qty,
        venduto: opts.venduto,
        costo: opts.costo,
        aliquota_iva_venduto: (row.aliquota_iva_venduto as string) || '22',
        iva_inclusa_venduto: (row.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (row.aliquota_iva_costo as string) || '22',
        iva_inclusa_costo: (row.iva_inclusa_costo as boolean) ?? false,
        commissione_pct: opts.commissione_pct ?? null,
        commissione_importo: opts.commissione_importo ?? null,
        margine,
        marginePct,
        stato_conferma: resolveStato(row.supplier_id as string),
        dateLabel: opts.dateLabel || '',
      })
    }

    // TRANSFER
    for (const s of (svcRes.data ?? []) as Record<string, unknown>[]) {
      const { venduto, costo } = calcRowEconomics(s, 'transfer')
      if (!venduto && !costo) continue
      const qty = (s.quantita as number) ?? 1
      pushLine(s, resolveCat(s.supplier_id as string, 'TRANSFER'), 'event_supplier_services', {
        descrizione: (s.titolo as string) || 'Transfer', qty, venduto, costo,
        dateLabel: fmtDate(s.data),
      })
    }

    // HOTEL
    for (const h of (hotelRes.data ?? []) as Record<string, unknown>[]) {
      const tipo = (h.tipo as string) || ''
      const paymentMode = (h.payment_mode as string) || ''
      const roomType = (h.room_type as string) || ''
      const roomsClient = (h.rooms_client_count as number) || 0
      const roomsSimmetria = (h.rooms_simmetria_count as number) || 0

      const hotelDateLabel = (fmtDate(h.check_in_date) && fmtDate(h.check_out_date))
        ? `${fmtDate(h.check_in_date)} \u2192 ${fmtDate(h.check_out_date)}`
        : fmtDate(h.data)

      const { venduto, costo } = calcRowEconomics(h, 'hotel')
      if (!venduto && !costo) continue

      if (tipo === 'pernottamento' && paymentMode) {
        const totalRoomsQty = roomsClient + roomsSimmetria || 1
        const descParts: string[] = []
        if (roomType) descParts.push(roomType)
        if (roomsClient > 0) descParts.push(`${roomsClient} cam. cliente`)
        if (roomsSimmetria > 0) descParts.push(`${roomsSimmetria} cam. Simmetria`)
        const descrizione = descParts.length > 0 ? descParts.join(' - ') : (h.titolo as string) || 'Pernottamento'

        pushLine(h, resolveCat(h.supplier_id as string, 'HOTEL'), 'event_hotel_details', {
          descrizione, qty: totalRoomsQty, venduto, costo,
          commissione_pct: (h.commissione_pct as number) ?? null,
          commissione_importo: (h.commissione_importo as number) ?? null,
          dateLabel: hotelDateLabel,
        })
      } else {
        const qty = (h.quantita as number) ?? 1
        pushLine(h, resolveCat(h.supplier_id as string, 'HOTEL'), 'event_hotel_details', {
          descrizione: (h.titolo as string) || (h.tipo as string) || 'Hotel', qty, venduto, costo,
          commissione_pct: (h.commissione_pct as number) ?? null,
          dateLabel: hotelDateLabel,
        })
      }
    }

    // RISTORANTE
    for (const r of (restRes.data ?? []) as Record<string, unknown>[]) {
      const pax = (r.pax_confermati as number) ?? (r.pax_previsti as number) ?? 1
      const { venduto, costo } = calcRowEconomics(r, 'ristorante')
      if (!venduto && !costo) continue
      pushLine(r, resolveCat(r.supplier_id as string, 'RISTORANTE'), 'event_restaurant_details', {
        descrizione: (r.tipologia_servizio as string) || 'Ristorante', qty: pax, venduto, costo,
        dateLabel: fmtDate(r.data),
      })
    }

    // LOCATION / EXPERIENCE
    for (const e of (expRes.data ?? []) as Record<string, unknown>[]) {
      const pax = (e.pax as number) ?? 1
      const { venduto, costo } = calcRowEconomics(e, 'experience')
      if (!venduto && !costo) continue
      pushLine(e, resolveCat(e.supplier_id as string, 'LOCATION / EXPERIENCE'), 'event_experience_details', {
        descrizione: (e.nome_attivita as string) || 'Experience', qty: pax, venduto, costo,
        dateLabel: fmtDate(e.data),
      })
    }

    // CATERING
    for (const c of (catRes.data ?? []) as Record<string, unknown>[]) {
      const pax = (c.pax as number) ?? 1
      const { venduto, costo } = calcRowEconomics(c, 'catering')
      if (!venduto && !costo) continue
      pushLine(c, resolveCat(c.supplier_id as string, 'CATERING'), 'event_catering_details', {
        descrizione: (c.tipologia as string) || 'Catering', qty: pax, venduto, costo,
        dateLabel: fmtDate(c.data),
      })
    }

    // STAFF SIMMETRIA
    for (const si of (staffIntRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (si.quantita as number) ?? 1
      const { venduto, costo } = calcRowEconomics(si, 'staff_interno')
      if (!venduto && !costo) continue
      const nome = [(si.nome as string), (si.cognome as string)].filter(Boolean).join(' ') || (si.risorsa as string)
      pushLine(si, resolveCat(si.supplier_id as string, 'STAFF'), 'event_staff_interno_details', {
        descrizione: nome ? `${nome} - ${(si.ruolo as string) || 'Staff'}` : (si.ruolo as string) || 'Staff Simmetria',
        qty, venduto, costo, sotto: 'staff_simmetria',
        dateLabel: fmtDate(si.data),
      })
    }

    // STAFF ESTERNO
    for (const se of (staffExtRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (se.quantita as number) ?? 1
      const { venduto, costo } = calcRowEconomics(se, 'staff_esterno')
      if (!venduto && !costo) continue
      const nome = [(se.nome as string), (se.cognome as string)].filter(Boolean).join(' ')
      pushLine(se, resolveCat(se.supplier_id as string, 'STAFF'), 'event_staff_esterno_details', {
        descrizione: nome ? `${nome} - ${(se.ruolo as string) || 'Staff'}` : (se.ruolo as string) || 'Staff Esterno',
        qty, venduto, costo, sotto: 'staff_esterno',
        dateLabel: fmtDate(se.data),
      })
    }

    // AUDIO VIDEO
    for (const av of (avRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (av.quantita as number) ?? 1
      const { venduto, costo } = calcRowEconomics(av, 'audio_video')
      if (!venduto && !costo) continue
      const avDates: string[] = []
      if (av.data_montaggio) avDates.push(`Mont. ${fmtDate(av.data_montaggio)}`)
      if (av.data_prove) avDates.push(`Prove ${fmtDate(av.data_prove)}`)
      if (av.data_evento) avDates.push(`Evt. ${fmtDate(av.data_evento)}`)
      if (av.data_smontaggio) avDates.push(`Smont. ${fmtDate(av.data_smontaggio)}`)
      pushLine(av, resolveCat(av.supplier_id as string, 'AUDIO VIDEO'), 'event_audio_video_details', {
        descrizione: (av.tipologia_servizio as string) || (av.descrizione as string) || 'Audio Video', qty, venduto, costo,
        dateLabel: avDates.join(' | '),
      })
    }

    // ALLESTIMENTI
    for (const al of (allestRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (al.quantita as number) ?? 1
      const { venduto, costo } = calcRowEconomics(al, 'allestimenti')
      if (!venduto && !costo) continue
      const alDates: string[] = []
      if (al.data_montaggio) alDates.push(`Mont. ${fmtDate(al.data_montaggio)}`)
      if (al.data_smontaggio) alDates.push(`Smont. ${fmtDate(al.data_smontaggio)}`)
      pushLine(al, resolveCat(al.supplier_id as string, 'ALLESTIMENTI'), 'event_allestimenti_details', {
        descrizione: (al.descrizione as string) || 'Allestimento', qty, venduto, costo,
        dateLabel: alDates.join(' | '),
      })
    }

    // GRAFICA
    for (const g of (graficaRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (g.quantita as number) ?? 1
      const { venduto, costo } = calcRowEconomics(g, 'grafica_stampa')
      if (!venduto && !costo) continue
      pushLine(g, resolveCat(g.supplier_id as string, 'GRAFICA'), 'event_grafica_stampa_details', {
        descrizione: (g.tipo_materiale as string) || (g.descrizione as string) || 'Grafica', qty, venduto, costo,
        dateLabel: fmtDate(g.data_consegna),
      })
    }

    // VARIE
    for (const v of (varieRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (v.quantita as number) ?? 1
      const { venduto, costo } = calcRowEconomics(v, 'varie')
      if (!venduto && !costo) continue
      pushLine(v, resolveCat(v.supplier_id as string, 'VARIE'), 'event_varie_details', {
        descrizione: (v.tipologia as string) ? `${v.tipologia} — ${(v.descrizione as string) || 'Voce'}` : (v.descrizione as string) || 'Voce varia', qty, venduto, costo,
        dateLabel: fmtDate(v.data),
      })
    }

    setLines(all)
    setLoading(false)
  }, [event.id, suppliers, activeVersion])

  useEffect(() => { if (activeVersion !== null || versions.length === 0) loadData() }, [loadData, activeVersion, versions.length])

  // Aggregated totals
  const totals = useMemo(() => {
    const venduto = lines.reduce((s, l) => s + l.venduto, 0)
    const costo = lines.reduce((s, l) => s + l.costo, 0)
    const fee = venduto * feePct / 100
    const commissioni = lines.reduce((s, l) => {
      if (l.commissione_importo) return s + l.commissione_importo
      if (l.commissione_pct && l.costo > 0) return s + (l.costo * l.commissione_pct / 100)
      return s
    }, 0)
    const ricavi = venduto + fee + commissioni
    const margine = ricavi - costo
    const marginePct = ricavi > 0 ? (margine / ricavi) * 100 : 0
    return { venduto, costo, fee, commissioni, ricavi, margine, marginePct }
  }, [lines, feePct])

  const fmt = (n: number) => '\u20AC' + n.toLocaleString('it-IT', { minimumFractionDigits: 2 })
  const fmtN = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

  // Confirmed vs estimated split
  const confirmSplit = useMemo(() => {
    const confermati = lines.filter(l => l.stato_conferma !== 'richiesto')
    const stimati = lines.filter(l => l.stato_conferma === 'richiesto')
    const costoConfermato = confermati.reduce((s, l) => s + l.costo, 0)
    const costoStimato = stimati.reduce((s, l) => s + l.costo, 0)
    const vendutoConfermato = confermati.reduce((s, l) => s + l.venduto, 0)
    const vendutoStimato = stimati.reduce((s, l) => s + l.venduto, 0)
    const pctConfermato = totals.costo > 0 ? (costoConfermato / totals.costo) * 100 : 0
    return { costoConfermato, costoStimato, vendutoConfermato, vendutoStimato, pctConfermato, countConfermati: confermati.length, countStimati: stimati.length }
  }, [lines, totals.costo])

  // Alerts
  const alerts = useMemo(() => {
    const result: { type: 'warning' | 'error' | 'success'; message: string }[] = []
    const budgetCliente = event.budget || 0

    if (budgetCliente > 0 && totals.venduto > budgetCliente) {
      result.push({ type: 'error', message: `Budget cliente superato di \u20AC${fmt(totals.venduto - budgetCliente)} (venduto \u20AC${fmt(totals.venduto)} vs budget \u20AC${fmt(budgetCliente)})` })
    }

    if (totals.marginePct < margineTarget && lines.length > 0) {
      result.push({ type: 'warning', message: `Margine ${totals.marginePct.toFixed(1)}% sotto target ${margineTarget}%` })
    }

    // Check categories under target
    const catWarnings: string[] = []
    const catMap: Record<string, BudgetLine[]> = {}
    for (const l of lines) {
      if (!catMap[l.categoria]) catMap[l.categoria] = []
      catMap[l.categoria].push(l)
    }
    for (const [cat, items] of Object.entries(catMap)) {
      const catV = items.reduce((s, i) => s + i.venduto, 0)
      const catC = items.reduce((s, i) => s + i.costo, 0)
      const catFee = catV * feePct / 100
      const catRicavi = catV + catFee
      const catMp = catRicavi > 0 ? ((catRicavi - catC) / catRicavi) * 100 : 0
      if (catMp < margineTarget && catMp >= 0) catWarnings.push(`${cat} (${catMp.toFixed(0)}%)`)
    }
    if (catWarnings.length > 0) {
      result.push({ type: 'warning', message: `Margine sotto target per: ${catWarnings.join(', ')}` })
    }

    // Lines without costs
    const noCost = lines.filter(l => l.costo === 0 && l.venduto === 0)
    if (noCost.length > 0) {
      result.push({ type: 'warning', message: `${noCost.length} ${noCost.length === 1 ? 'voce' : 'voci'} senza valori economici` })
    }

    if (confirmSplit.pctConfermato >= 80 && totals.marginePct >= margineTarget) {
      result.push({ type: 'success', message: `${confirmSplit.pctConfermato.toFixed(0)}% dei costi confermati, margine in target` })
    }

    return result
  }, [lines, totals, feePct, margineTarget, event.budget, confirmSplit.pctConfermato])

  // Group by category
  const grouped = useMemo(() => {
    const map: Record<string, BudgetLine[]> = {}
    for (const l of lines) {
      if (!map[l.categoria]) map[l.categoria] = []
      map[l.categoria].push(l)
    }
    return CATEGORY_ORDER
      .filter(cat => map[cat] && map[cat].length > 0)
      .map(cat => ({ label: cat, items: map[cat] }))
  }, [lines])


  const EXPORT_LABELS: Record<string, string> = {
    'HOTEL': 'HOTEL', 'TRANSFER': 'TRASPORTI', 'RISTORANTE': 'RISTORANTI',
    'LOCATION / EXPERIENCE': 'ATTIVITA\' / LOCATION', 'CATERING': 'CATERING',
    'AUDIO VIDEO': 'AUDIO VIDEO', 'ALLESTIMENTI': 'ALLESTIMENTI',
    'STAFF': 'STAFF', 'GRAFICA': 'GRAFICA / STAMPA', 'VARIE': 'VARIE + EXTRA',
  }

  function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_')
  }

  function getClientName(): string {
    return event.cliente || ''
  }

  function getExportLabel(cat: string): string {
    return EXPORT_LABELS[cat] || cat
  }

  function getExportGroups() {
    const result: { label: string; items: BudgetLine[] }[] = []
    for (const cat of grouped) {
      if (cat.label === 'STAFF') {
        const interni = cat.items.filter(i => i.sotto_categoria === 'staff_simmetria')
        const esterni = cat.items.filter(i => i.sotto_categoria === 'staff_esterno')
        if (interni.length > 0) result.push({ label: 'STAFF SIMMETRIA', items: interni })
        if (esterni.length > 0) result.push({ label: 'STAFF ESTERNO', items: esterni })
      } else {
        result.push({ label: getExportLabel(cat.label), items: cat.items })
      }
    }
    return result
  }

  // ═══════════════════════════════════════════════════════════
  // PDF INTERNO
  // ═══════════════════════════════════════════════════════════
  function exportPdfInterno() {
    const doc = new jsPDF({ orientation: 'landscape' })
    const evName = event.nome || 'Evento'
    const clientName = getClientName()
    const exportGroups = getExportGroups()

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text('Simmetria Immagine e Comunicazione Srl', 250, 10, { align: 'right' })
    doc.text('Viale Egeo 8 | 00144 Roma', 250, 14, { align: 'right' })

    doc.setFontSize(14)
    doc.setTextColor(208, 0, 58)
    doc.text('BUDGET INTERNO', 14, 16)
    doc.setFontSize(11)
    doc.setTextColor(0)
    doc.text(evName, 14, 24)
    doc.setFontSize(9)
    doc.setTextColor(80)
    if (clientName) doc.text(`Cliente: ${clientName}`, 14, 30)
    doc.text(`Preventivo al ${fmtDateCentral(new Date().toISOString())}`, 14, clientName ? 36 : 30)

    let startY = clientName ? 42 : 36

    for (const cat of exportGroups) {
      const catV = cat.items.reduce((s, i) => s + i.venduto, 0)
      const catC = cat.items.reduce((s, i) => s + i.costo, 0)
      const catFee = catV * feePct / 100
      const catM = catV + catFee - catC
      const catMp = (catV + catFee) > 0 ? (catM / (catV + catFee) * 100).toFixed(1) : '0.0'

      const body: unknown[][] = cat.items.map(item => {
        const itemFee = item.venduto * feePct / 100
        const itemMargine = item.venduto + itemFee - item.costo
        const itemMp = (item.venduto + itemFee) > 0 ? ((itemMargine / (item.venduto + itemFee)) * 100).toFixed(1) : '0.0'
        const statoLabel = item.stato_conferma === 'contrattualizzato' ? 'C' : item.stato_conferma === 'confermato' ? 'OK' : '?'
        return [
          item.descrizione,
          item.fornitore || '-',
          statoLabel,
          String(item.qty),
          fmtN(item.venduto),
          fmtN(item.costo),
          fmtN(itemFee),
          fmtN(itemMargine),
          `${itemMp}%`,
        ]
      })

      body.push([
        { content: `Totale ${cat.label}`, styles: { fontStyle: 'bold' } },
        '', '', '',
        { content: fmtN(catV), styles: { fontStyle: 'bold' } },
        { content: fmtN(catC), styles: { fontStyle: 'bold' } },
        { content: fmtN(catFee), styles: { fontStyle: 'bold' } },
        { content: fmtN(catM), styles: { fontStyle: 'bold' } },
        { content: `${catMp}%`, styles: { fontStyle: 'bold' } },
      ])

      autoTable(doc, {
        startY,
        head: [[cat.label, 'Fornitore', 'St.', 'Qty', 'Venduto', 'Costo', `Fee ${feePct}%`, 'Margine', 'M%']],
        body: body as string[][],
        theme: 'grid',
        headStyles: { fillColor: [208, 0, 58], textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 55 }, 1: { cellWidth: 35 }, 2: { halign: 'center', cellWidth: 12 },
          3: { halign: 'right', cellWidth: 12 }, 4: { halign: 'right', cellWidth: 25 },
          5: { halign: 'right', cellWidth: 25 }, 6: { halign: 'right', cellWidth: 22 },
          7: { halign: 'right', cellWidth: 25 }, 8: { halign: 'right', cellWidth: 16 },
        },
        margin: { left: 14, right: 14 },
      })
      startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4
    }

    // RIEPILOGO
    const riepilogoBody: unknown[][] = exportGroups.map(cat => {
      const cv = cat.items.reduce((s, i) => s + i.venduto, 0)
      const cc = cat.items.reduce((s, i) => s + i.costo, 0)
      const cf = cv * feePct / 100
      const cm = cv + cf - cc
      return [cat.label, fmtN(cv), fmtN(cc), fmtN(cf), fmtN(cm)]
    })
    riepilogoBody.push([
      { content: 'TOTALE EVENTO', styles: { fontStyle: 'bold' } },
      { content: fmtN(totals.venduto), styles: { fontStyle: 'bold' } },
      { content: fmtN(totals.costo), styles: { fontStyle: 'bold' } },
      { content: fmtN(totals.fee), styles: { fontStyle: 'bold' } },
      { content: fmtN(totals.margine), styles: { fontStyle: 'bold' } },
    ])
    if (totals.commissioni > 0) {
      riepilogoBody.push([
        { content: 'COMMISSIONI HOTEL (interno)', styles: { fontStyle: 'italic' } },
        { content: '', styles: {} },
        { content: '', styles: {} },
        { content: '', styles: {} },
        { content: fmtN(totals.commissioni), styles: { fontStyle: 'bold' } },
      ])
    }

    autoTable(doc, {
      startY: startY + 4,
      head: [['RIEPILOGO DEI SERVIZI', 'Venduto', 'Costi', 'Fee', 'Margine']],
      body: riepilogoBody as string[][],
      theme: 'grid',
      headStyles: { fillColor: [208, 0, 58], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    })

    const filename = `${sanitizeFilename(evName)}_${sanitizeFilename(clientName)}_Budget_Interno.pdf`
    doc.save(filename)
  }

  // ═══════════════════════════════════════════════════════════
  // PDF CLIENTE
  // ═══════════════════════════════════════════════════════════
  function exportPdfCliente() {
    const doc = new jsPDF()
    const evName = event.nome || 'Evento'
    const clientName = getClientName()
    const exportGroups = getExportGroups()

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text('Simmetria Immagine e Comunicazione Srl', 196, 10, { align: 'right' })
    doc.text('Viale Egeo 8 | 00144 Roma', 196, 14, { align: 'right' })

    doc.setFontSize(14)
    doc.setTextColor(208, 0, 58)
    doc.text(evName.toUpperCase(), 14, 20)

    doc.setFontSize(9)
    doc.setTextColor(80)
    if (clientName) doc.text(`Cliente: ${clientName}`, 14, 28)
    doc.text(`Preventivo al ${fmtDateCentral(new Date().toISOString())}`, 14, clientName ? 34 : 28)

    let startY = clientName ? 40 : 34

    for (const cat of exportGroups) {
      const catV = cat.items.reduce((s, i) => s + i.venduto, 0)
      const body: unknown[][] = cat.items.map(item => {
        const unitario = item.qty > 0 ? item.venduto / item.qty : item.venduto
        return [item.descrizione, String(item.qty), `\u20AC ${fmtN(unitario)}`, `\u20AC ${fmtN(item.venduto)}`]
      })
      body.push([
        { content: `Totale ${cat.label}`, styles: { fontStyle: 'bold' } }, '', '',
        { content: `\u20AC ${fmtN(catV)}`, styles: { fontStyle: 'bold' } },
      ])

      autoTable(doc, {
        startY,
        head: [[cat.label, 'Nr/Qty', 'Costo Unitario', 'Totale']],
        body: body as string[][],
        theme: 'grid',
        headStyles: { fillColor: [208, 0, 58], textColor: 255, fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8.5 },
        columnStyles: { 0: { cellWidth: 85 }, 1: { halign: 'center', cellWidth: 20 }, 2: { halign: 'right', cellWidth: 35 }, 3: { halign: 'right', cellWidth: 35 } },
        margin: { left: 14, right: 14 },
      })
      startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4
    }

    const riepilogoBody: unknown[][] = exportGroups.map(cat => {
      const cv = cat.items.reduce((s, i) => s + i.venduto, 0)
      return [cat.label, `\u20AC ${fmtN(cv)}`]
    })
    riepilogoBody.push([
      { content: 'TOTALE', styles: { fontStyle: 'bold' } },
      { content: `\u20AC ${fmtN(totals.venduto)}`, styles: { fontStyle: 'bold' } },
    ])

    autoTable(doc, {
      startY: startY + 4,
      head: [['RIEPILOGO DEI SERVIZI', 'Totale']],
      body: riepilogoBody as string[][],
      theme: 'grid',
      headStyles: { fillColor: [208, 0, 58], textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 100 }, 1: { halign: 'right', cellWidth: 45 } },
      margin: { left: 14, right: 14 },
    })

    startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text('I prezzi indicati sono da intendersi IVA esclusa salvo diversa indicazione.', 14, startY)

    const filename = `${sanitizeFilename(evName)}_${sanitizeFilename(clientName)}_Budget_Cliente.pdf`
    doc.save(filename)
  }

  // ═══════════════════════════════════════════════════════════
  // EXCEL INTERNO
  // ═══════════════════════════════════════════════════════════
  function exportExcelInterno() {
    const evName = event.nome || 'Evento'
    const clientName = getClientName()
    const exportGroups = getExportGroups()

    const rows: (string | number | null)[][] = []
    rows.push(['Simmetria Immagine e Comunicazione Srl'])
    rows.push(['Viale Egeo 8 | 00144 Roma'])
    rows.push([])
    rows.push([evName.toUpperCase()])
    if (clientName) rows.push([`Cliente: ${clientName}`])
    rows.push([`Preventivo al ${fmtDateCentral(new Date().toISOString())}`])
    rows.push([])
    rows.push([])
    rows.push(['CATEGORIA', 'DESCRIZIONE', 'FORNITORE', 'STATO', 'QTY', 'VENDUTO CLIENTE', 'COSTO REALE', `FEE ${feePct}%`, 'MARGINE NETTO', 'MARGINE %'])

    for (const cat of exportGroups) {
      rows.push([cat.label, '', '', '', '', '', '', '', '', ''])
      for (const item of cat.items) {
        const itemFee = item.venduto * feePct / 100
        const itemMargine = item.venduto + itemFee - item.costo
        const itemMp = (item.venduto + itemFee) > 0 ? ((itemMargine / (item.venduto + itemFee)) * 100) : 0
        const statoLabel = STATO_CONFIG[item.stato_conferma].label
        rows.push(['', item.descrizione, item.fornitore || '', statoLabel, item.qty, item.venduto, item.costo, itemFee, itemMargine, itemMp / 100])
      }
      const catV = cat.items.reduce((s, i) => s + i.venduto, 0)
      const catC = cat.items.reduce((s, i) => s + i.costo, 0)
      const catFee = catV * feePct / 100
      const catM = catV + catFee - catC
      const catMp = (catV + catFee) > 0 ? catM / (catV + catFee) : 0
      rows.push(['', `Totale ${cat.label}`, '', '', '', catV, catC, catFee, catM, catMp])
      rows.push([])
    }

    rows.push([])
    rows.push(['RIEPILOGO', '', '', '', '', 'VENDUTO', 'COSTI', 'FEE', 'MARGINE', ''])
    for (const cat of exportGroups) {
      const cv = cat.items.reduce((s, i) => s + i.venduto, 0)
      const cc = cat.items.reduce((s, i) => s + i.costo, 0)
      const cf = cv * feePct / 100
      const cm = cv + cf - cc
      rows.push([cat.label, '', '', '', '', cv, cc, cf, cm, ''])
    }
    rows.push(['TOTALE EVENTO', '', '', '', '', totals.venduto, totals.costo, totals.fee, totals.margine, totals.marginePct / 100])
    if (totals.commissioni > 0) {
      rows.push(['COMMISSIONI HOTEL (interno)', '', '', '', '', '', '', '', totals.commissioni, ''])
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Budget Interno')
    const filename = `${sanitizeFilename(evName)}_${sanitizeFilename(clientName)}_Budget_Interno.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // ═══════════════════════════════════════════════════════════
  // EXCEL CLIENTE
  // ═══════════════════════════════════════════════════════════
  function exportExcelCliente() {
    const evName = event.nome || 'Evento'
    const clientName = getClientName()
    const exportGroups = getExportGroups()

    const rows: (string | number | null)[][] = []
    rows.push(['Simmetria Immagine e Comunicazione Srl'])
    rows.push(['Viale Egeo 8 | 00144 Roma'])
    rows.push([])
    rows.push([evName.toUpperCase()])
    if (clientName) rows.push([`Cliente: ${clientName}`])
    rows.push([`Preventivo al ${fmtDateCentral(new Date().toISOString())}`])
    rows.push([])
    rows.push([])
    rows.push(['CATEGORIA', 'DESCRIZIONE', 'Nr/Qty', 'COSTO UNITARIO', 'TOTALE'])

    for (const cat of exportGroups) {
      rows.push([cat.label, '', '', '', ''])
      for (const item of cat.items) {
        const unitario = item.qty > 0 ? item.venduto / item.qty : item.venduto
        rows.push(['', item.descrizione, item.qty, unitario, item.venduto])
      }
      const catV = cat.items.reduce((s, i) => s + i.venduto, 0)
      rows.push(['', `Totale ${cat.label}`, '', '', catV])
      rows.push([])
    }

    rows.push([])
    rows.push(['RIEPILOGO DEI SERVIZI', '', '', '', 'TOTALE'])
    for (const cat of exportGroups) {
      const cv = cat.items.reduce((s, i) => s + i.venduto, 0)
      rows.push([cat.label, '', '', '', cv])
    }
    rows.push(['TOTALE', '', '', '', totals.venduto])
    rows.push([])
    rows.push(['I prezzi indicati sono da intendersi IVA esclusa salvo diversa indicazione.'])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 24 }, { wch: 50 }, { wch: 10 }, { wch: 18 }, { wch: 18 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Preventivo Cliente')
    const filename = `${sanitizeFilename(evName)}_${sanitizeFilename(clientName)}_Budget_Cliente.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  function renderBudgetLine(item: BudgetLine) {
    const isExpanded = expandedId === item.id
    const statoConf = STATO_CONFIG[item.stato_conferma]
    const Icon = statoConf.icon

    return (
      <div key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
        <button
          className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
          onClick={() => setExpandedId(isExpanded ? null : item.id)}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${isExpanded ? '' : '-rotate-90'}`} style={{ color: 'var(--muted)' }} />
          <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: statoConf.color }} />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium truncate block" style={{ color: 'var(--text)' }}>{item.descrizione}</span>
            {item.dateLabel && <span className="text-[10px] truncate block" style={{ color: 'var(--muted)' }}>{item.dateLabel}</span>}
          </div>
          <span className="w-24 text-xs truncate hidden md:block" style={{ color: 'var(--muted)' }}>{item.fornitore || '-'}</span>
          <span className="w-10 text-xs text-right" style={{ color: 'var(--text)' }}>{item.qty}</span>
          <span className="w-20 text-xs text-right" style={{ color: 'var(--text)' }}>{fmt(item.venduto)}</span>
          <span className="w-20 text-xs text-right" style={{ color: 'var(--yellow)' }}>{fmt(item.costo)}</span>
          {item.commissione_pct != null && item.commissione_pct > 0 && (
            <span className="w-14 text-[10px] text-right" style={{ color: 'var(--green)' }} title="Commissione hotel sul costo">+{item.commissione_pct}%</span>
          )}
          {(item.commissione_pct == null || item.commissione_pct <= 0) && (
            <span className="w-14" />
          )}
          <span className="w-20 text-xs text-right font-medium" style={{ color: item.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(item.margine)}</span>
          <span className="w-10 text-xs text-right font-medium" style={{ color: item.marginePct >= margineTarget ? 'var(--green)' : item.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }}>{item.marginePct.toFixed(0)}%</span>
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 pt-2" style={{ background: 'var(--bg)' }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mb-3">
              <Detail label="Descrizione" value={item.descrizione} />
              {item.dateLabel && <Detail label="Data" value={item.dateLabel} />}
              {item.sotto_categoria && item.sotto_categoria !== 'staff_simmetria' && item.sotto_categoria !== 'staff_esterno' && (
                <Detail label="Sotto-categoria" value={SOTTO_LABELS[item.sotto_categoria] || item.sotto_categoria} />
              )}
              {item.fornitore && <Detail label="Fornitore" value={item.fornitore} />}
              <Detail label="Stato" value={statoConf.label} />
              <Detail label="Quantita" value={String(item.qty)} />
              <Detail label="Venduto cliente" value={fmt(item.venduto)} />
              <Detail label="Costo reale" value={fmt(item.costo)} />
              <Detail label="IVA Venduto" value={`${item.aliquota_iva_venduto}% ${item.iva_inclusa_venduto ? '(inclusa)' : '(esclusa)'}`} />
              <Detail label="IVA Costo" value={`${item.aliquota_iva_costo}% ${item.iva_inclusa_costo ? '(inclusa)' : '(esclusa)'}`} />
              {item.commissione_pct != null && item.commissione_pct > 0 && (
                <Detail label="Commissione Hotel" value={`${item.commissione_pct}% sul costo = ${fmt(item.costo * item.commissione_pct / 100)}`} />
              )}
              <Detail label="Margine" value={fmt(item.margine)} />
              <Detail label="Margine %" value={`${item.marginePct.toFixed(1)}%`} />
            </div>
            {item.stato_conferma === 'richiesto' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,194,75,0.08)', border: '1px solid rgba(255,194,75,0.2)' }}>
                <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
                <span style={{ color: 'var(--yellow)' }}>Costo stimato - fornitore non confermato. Modifica dal tab Fornitori.</span>
              </div>
            )}
            {item.stato_conferma !== 'richiesto' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(56,210,125,0.06)', border: '1px solid rgba(56,210,125,0.15)' }}>
                <Lock className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                <span style={{ color: 'var(--muted)' }}>Costo confermato. Per modificare i valori vai al tab Fornitori.</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento budget...</div></div>
  }

  return (
    <div className="space-y-5">
      {/* ══════ VERSION SELECTOR ══════ */}
      {versions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {versions.map(v => (
            <button key={v.id}
              onClick={() => setActiveVersion(v.id)}
              style={{
                padding: '6px 14px', borderRadius: 99, flexShrink: 0,
                border: activeVersion === v.id
                  ? v.tipo === 'consuntivo' ? '2px solid var(--green)' : '2px solid var(--red2)'
                  : '1px solid var(--line)',
                background: activeVersion === v.id
                  ? v.tipo === 'consuntivo' ? 'rgba(47,168,107,0.08)' : 'rgba(200,25,46,0.08)'
                  : 'transparent',
                fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer',
                color: activeVersion === v.id
                  ? v.tipo === 'consuntivo' ? 'var(--green)' : 'var(--red2)'
                  : 'var(--muted)',
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}>
              {v.tipo === 'consuntivo' ? '\u2713' : '\uD83D\uDCCB'}
              {v.nome}
              {v.stato === 'approvato' && (
                <span style={{ fontSize: 8, background: 'var(--green)', color: 'white', padding: '1px 5px', borderRadius: 4 }}>
                  APPROVATO
                </span>
              )}
            </button>
          ))}
          <button onClick={() => setShowNewVersion(true)}
            style={{ padding: '6px 14px', borderRadius: 99, flexShrink: 0, border: '1px dashed var(--line)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus className="w-3 h-3" /> Nuova versione
          </button>
        </div>
      )}

      {/* ══════ VERSION TOOLBAR ══════ */}
      {activeVersion && (() => {
        const v = versions.find(x => x.id === activeVersion)
        if (!v) return null
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--panel2)', borderRadius: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, flex: 1, color: 'var(--text)', minWidth: 100 }}>
              {v.nome}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 8px', borderRadius: 4,
              background: v.stato === 'approvato' ? 'rgba(47,168,107,0.1)' : 'var(--panel)',
              color: v.stato === 'approvato' ? 'var(--green)' : 'var(--muted)',
              border: '1px solid var(--line)' }}>
              {v.stato?.toUpperCase()}
            </span>
            {v.tipo === 'preventivo' && (
              <>
                {v.stato !== 'approvato' && (
                  <button onClick={() => approveVersion(v.id)}
                    style={{ padding: '5px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--green)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)' }}>
                    Approva
                  </button>
                )}
                {v.stato === 'approvato' && (
                  <button onClick={() => createConsuntivo(v.id)}
                    style={{ padding: '5px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--blue)', background: 'rgba(58,123,213,0.08)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--blue)' }}>
                    Crea consuntivo
                  </button>
                )}
                <button onClick={() => duplicateVersion(v.id)}
                  style={{ padding: '5px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--line)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                  Duplica
                </button>
              </>
            )}
          </div>
        )
      })()}

      {/* ══════ LEVEL 1: KPI Dashboard ══════ */}
      <AnimatedLaserBorder loading={savingFee}>
        <div className="panel p-5 space-y-4">
          {/* Budget di riferimento + venduto + delta */}
          {event.budget > 0 && (
            <div className="flex items-center justify-between px-2 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="flex items-center gap-4 text-xs">
                <span style={{ color: 'var(--muted)' }}>Budget cliente: <strong style={{ color: 'var(--text)' }}>{fmt(event.budget)}</strong></span>
                <span style={{ color: 'var(--muted)' }}>Venduto: <strong style={{ color: 'var(--text)' }}>{fmt(totals.venduto)}</strong></span>
                {totals.venduto > event.budget ? (
                  <span className="flex items-center gap-1" style={{ color: 'var(--red2)' }}>
                    <AlertTriangle className="w-3 h-3" /> +{fmt(totals.venduto - event.budget)} sopra budget
                  </span>
                ) : (
                  <span style={{ color: 'var(--green)' }}>{fmt(event.budget - totals.venduto)} disponibile</span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Kpi label="Totale Venduto Servizi" value={fmt(totals.venduto)} color="var(--text)" />
            <div className="text-center">
              <p className="text-xs flex items-center justify-center gap-1" style={{ color: 'var(--muted)' }}>
                Fee Simmetria
                {!editingFee && (
                  <button onClick={() => { setEditingFee(true); setFeeInput(String(feePct)) }} className="opacity-60 hover:opacity-100">
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
                    autoFocus />
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
            {totals.commissioni > 0 && (
              <Kpi label="Commissioni Hotel" value={fmt(totals.commissioni)} color="var(--green)" />
            )}
            <Kpi label="Totale Ricavi" value={fmt(totals.ricavi)} color="var(--text)" />
          </div>
          <div className="h-px" style={{ background: 'var(--line)' }} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Totale Costi" value={fmt(totals.costo)} color="var(--yellow)" />
            <Kpi label="Margine Netto" value={fmt(totals.margine)} color={totals.margine >= 0 ? 'var(--green)' : 'var(--red2)'} />
            <Kpi label="Margine %" value={`${totals.marginePct.toFixed(1)}%`} color={totals.marginePct >= margineTarget ? 'var(--green)' : totals.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)'} />
            <div className="text-center">
              <p className="text-xs flex items-center justify-center gap-1" style={{ color: 'var(--muted)' }}>
                Target
                {!editingTarget && (
                  <button onClick={() => { setEditingTarget(true); setTargetInput(String(margineTarget)) }} className="opacity-60 hover:opacity-100">
                    <Edit3 className="w-3 h-3" />
                  </button>
                )}
              </p>
              {editingTarget ? (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <input type="number" step="1" min="0" max="100" value={targetInput}
                    onChange={e => setTargetInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTarget(Number(targetInput) || 25); if (e.key === 'Escape') setEditingTarget(false) }}
                    className="w-16 px-2 py-1 text-center text-sm rounded-lg"
                    style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                    autoFocus />
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>%</span>
                  <button onClick={() => saveTarget(Number(targetInput) || 25)} className="p-1 rounded-lg hover:bg-white/10" style={{ color: 'var(--green)' }}>
                    <Save className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-xl font-bold mt-1" style={{ color: totals.marginePct >= margineTarget ? 'var(--green)' : 'var(--yellow)' }}>
                  {margineTarget}%
                </p>
              )}
            </div>
          </div>
        </div>
      </AnimatedLaserBorder>

      {/* ══════ Completeness bar ══════ */}
      {lines.length > 0 && (
        <div className="panel p-4">
          <div className="flex justify-between text-xs mb-2">
            <span style={{ color: 'var(--muted)' }}>Affidabilita costi ({confirmSplit.pctConfermato.toFixed(0)}% confermati)</span>
            <span style={{ color: 'var(--muted)' }}>
              <span style={{ color: 'var(--green)' }}>{confirmSplit.countConfermati}</span> confermati
              {confirmSplit.countStimati > 0 && <> · <span style={{ color: 'var(--yellow)' }}>{confirmSplit.countStimati}</span> stimati</>}
            </span>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--panel2)' }}>
            <div className="h-full transition-all" style={{
              width: `${confirmSplit.pctConfermato}%`,
              background: 'var(--green)',
              borderRadius: confirmSplit.pctConfermato >= 100 ? '9999px' : '9999px 0 0 9999px',
            }} />
            {confirmSplit.pctConfermato < 100 && (
              <div className="h-full transition-all" style={{
                width: `${100 - confirmSplit.pctConfermato}%`,
                background: 'rgba(255,194,75,0.3)',
                borderRadius: '0 9999px 9999px 0',
              }} />
            )}
          </div>
          <div className="flex justify-between text-[10px] mt-1">
            <span style={{ color: 'var(--green)' }}>{fmt(confirmSplit.costoConfermato)} confermati</span>
            {confirmSplit.costoStimato > 0 && <span style={{ color: 'var(--yellow)' }}>{fmt(confirmSplit.costoStimato)} stimati</span>}
          </div>
        </div>
      )}

      {/* ══════ ALERTS ══════ */}
      {alerts.length > 0 && (
        <div className="panel p-4 space-y-2">
          {alerts.map((alert, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
              style={{
                background: alert.type === 'error' ? 'rgba(208,0,58,0.08)' : alert.type === 'warning' ? 'rgba(255,194,75,0.08)' : 'rgba(56,210,125,0.08)',
                border: `1px solid ${alert.type === 'error' ? 'rgba(208,0,58,0.2)' : alert.type === 'warning' ? 'rgba(255,194,75,0.2)' : 'rgba(56,210,125,0.2)'}`,
              }}>
              {alert.type === 'error' && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--red2)' }} />}
              {alert.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--yellow)' }} />}
              {alert.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--green)' }} />}
              <span style={{ color: alert.type === 'error' ? 'var(--red2)' : alert.type === 'warning' ? 'var(--yellow)' : 'var(--green)' }}>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ══════ Export buttons ══════ */}
      {lines.length > 0 && (
        <div className="panel p-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold mb-3" style={{ color: 'var(--muted)' }}>Esporta Budget</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button onClick={exportPdfInterno}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <Download className="w-3.5 h-3.5" /> PDF Interno
            </button>
            <button onClick={exportExcelInterno}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel Interno
            </button>
            <button onClick={exportPdfCliente}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: '#fff' }}>
              <Download className="w-3.5 h-3.5" /> PDF Cliente
            </button>
            <button onClick={exportExcelCliente}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: '#fff' }}>
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel Cliente
            </button>
          </div>
        </div>
      )}

      {/* ══════ LEVEL 2: Category breakdown ══════ */}
      {grouped.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Euro className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun dato economico</p>
          <p className="text-xs mt-1">I dati vengono generati dai fornitori collegati all'evento (tab Fornitori)</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(cat => {
            const catV = cat.items.reduce((s, i) => s + i.venduto, 0)
            const catC = cat.items.reduce((s, i) => s + i.costo, 0)
            const catFee = catV * feePct / 100
            const catRicavi = catV + catFee
            const catM = catRicavi - catC
            const catMp = catRicavi > 0 ? (catM / catRicavi) * 100 : 0
            const catStimati = cat.items.filter(i => i.stato_conferma === 'richiesto').length
            const isUnderTarget = catMp < margineTarget && catMp >= 0

            return (
              <div key={cat.label} className="panel overflow-hidden" style={{ border: isUnderTarget ? '1px solid rgba(255,194,75,0.3)' : undefined }}>
                {/* Category header */}
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--panel2)' }}>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold tracking-wide" style={{ color: 'var(--text)' }}>{cat.label}</p>
                    {catStimati > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,194,75,0.15)', color: 'var(--yellow)' }}>
                        {catStimati} stimati
                      </span>
                    )}
                    {isUnderTarget && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,194,75,0.15)', color: 'var(--yellow)' }}>
                        sotto target
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span style={{ color: 'var(--muted)' }}>V: <strong style={{ color: 'var(--text)' }}>{fmt(catV)}</strong></span>
                    <span style={{ color: 'var(--muted)' }}>C: <strong style={{ color: 'var(--yellow)' }}>{fmt(catC)}</strong></span>
                    <span style={{ color: 'var(--muted)' }}>M: <strong style={{ color: catM >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(catM)} ({catMp.toFixed(0)}%)</strong></span>
                  </div>
                </div>

                {/* Column headers */}
                <div className="hidden md:flex px-4 py-1.5 items-center gap-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
                  <span className="w-4" />
                  <span className="w-4" />
                  <span className="flex-1">Descrizione</span>
                  <span className="w-24">Fornitore</span>
                  <span className="w-10 text-right">Qty</span>
                  <span className="w-20 text-right">Venduto</span>
                  <span className="w-20 text-right">Costo</span>
                  <span className="w-20 text-right">Margine</span>
                  <span className="w-10 text-right">M%</span>
                </div>

                {/* Lines - with sub-group support for STAFF */}
                {cat.label === 'STAFF' ? (
                  <>
                    {(['staff_simmetria', 'staff_esterno'] as const).map(subGroup => {
                      const subItems = cat.items.filter(i => i.sotto_categoria === subGroup)
                      if (subItems.length === 0) return null
                      const subV = subItems.reduce((s, i) => s + i.venduto, 0)
                      const subC = subItems.reduce((s, i) => s + i.costo, 0)
                      const subM = subV - subC
                      const subMp = subV > 0 ? (subM / subV) * 100 : 0
                      const subLabel = subGroup === 'staff_simmetria' ? 'Staff Simmetria' : 'Staff Esterno'
                      return (
                        <div key={subGroup}>
                          <div className="px-4 py-2 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--line)' }}>
                            <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{subLabel}</p>
                            <div className="flex items-center gap-3 text-[10px]">
                              <span style={{ color: 'var(--muted)' }}>V: <strong style={{ color: 'var(--text)' }}>{fmt(subV)}</strong></span>
                              <span style={{ color: 'var(--muted)' }}>C: <strong style={{ color: 'var(--yellow)' }}>{fmt(subC)}</strong></span>
                              <span style={{ color: 'var(--muted)' }}>M: <strong style={{ color: subM >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(subM)} ({subMp.toFixed(0)}%)</strong></span>
                            </div>
                          </div>
                          {subItems.map(item => renderBudgetLine(item))}
                        </div>
                      )
                    })}
                  </>
                ) : (
                  cat.items.map(item => renderBudgetLine(item))
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Grand total */}
      {lines.length > 0 && (
        <div className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs px-2">
            <span className="font-bold tracking-wide" style={{ color: 'var(--text)' }}>TOTALE EVENTO</span>
            <div className="flex items-center gap-5">
              <span style={{ color: 'var(--muted)' }}>Venduto: <strong style={{ color: 'var(--text)' }}>{fmt(totals.venduto)}</strong></span>
              <span style={{ color: 'var(--muted)' }}>Costi: <strong style={{ color: 'var(--yellow)' }}>{fmt(totals.costo)}</strong></span>
              <span style={{ color: 'var(--muted)' }}>Fee {feePct}%: <strong style={{ color: 'var(--blue)' }}>{fmt(totals.fee)}</strong></span>
              {totals.commissioni > 0 && (
                <span style={{ color: 'var(--muted)' }}>Comm.: <strong style={{ color: 'var(--green)' }}>{fmt(totals.commissioni)}</strong></span>
              )}
              <span style={{ color: 'var(--muted)' }}>Margine: <strong style={{ color: totals.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(totals.margine)}</strong></span>
              <strong style={{ color: totals.marginePct >= margineTarget ? 'var(--green)' : 'var(--yellow)' }}>{totals.marginePct.toFixed(1)}%</strong>
            </div>
          </div>
        </div>
      )}

      {/* ══════ PAGAMENTI SUMMARY ══════ */}
      <PaymentsSummary eventId={event.id} />

      {/* ══════ NEW VERSION MODAL ══════ */}
      {showNewVersion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 24, width: 340 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 12, letterSpacing: '.1em' }}>
              NUOVA VERSIONE BUDGET
            </p>
            <input value={newVersionName} onChange={e => setNewVersionName(e.target.value)}
              placeholder="es. Hotel Quark - Milano" autoFocus
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={async () => {
                const { data } = await supabase.from('budget_versions')
                  .insert({ event_id: event.id, nome: newVersionName || `Preventivo ${versions.length + 1}`, tipo: 'preventivo', stato: 'bozza', created_by: user?.id })
                  .select().single()
                if (data) {
                  setVersions(prev => [...prev, data])
                  setActiveVersion(data.id)
                }
                setShowNewVersion(false)
                setNewVersionName('')
              }} style={{ flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer', background: 'var(--red2)', color: 'white', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                Crea
              </button>
              <button onClick={() => { setShowNewVersion(false); setNewVersionName('') }}
                style={{ flex: 1, padding: '9px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text)' }}>{value}</p>
    </div>
  )
}

function PaymentsSummary({ eventId }: { eventId: string }) {
  const [payments, setPayments] = useState<{ tipo: string; importo: number; data_pagamento: string | null }[]>([])

  useEffect(() => {
    supabase.from('event_payments')
      .select('tipo, importo, data_pagamento')
      .eq('event_id', eventId)
      .order('data_scadenza', { ascending: true })
      .then(({ data }) => { if (data) setPayments(data) })
  }, [eventId])

  if (payments.length === 0) return null

  let incassato = 0, daIncassare = 0, pagato = 0, daPagare = 0
  for (const p of payments) {
    if (p.tipo === 'incasso_cliente') {
      if (p.data_pagamento) incassato += p.importo
      else daIncassare += p.importo
    } else {
      if (p.data_pagamento) pagato += p.importo
      else daPagare += p.importo
    }
  }
  const liquidita = incassato - pagato
  const fmt = (n: number) => '\u20AC' + n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div className="panel p-5 space-y-4">
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 12 }}>
          PAGAMENTI
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(56,210,125,0.06)', border: '1px solid rgba(56,210,125,0.15)' }}>
          <p className="text-[10px] uppercase" style={{ color: 'var(--muted)' }}>Incassato</p>
          <p className="text-sm font-bold mt-1" style={{ color: 'var(--green)' }}>{fmt(incassato)}</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,194,75,0.06)', border: '1px solid rgba(255,194,75,0.15)' }}>
          <p className="text-[10px] uppercase" style={{ color: 'var(--muted)' }}>Da incassare</p>
          <p className="text-sm font-bold mt-1" style={{ color: 'var(--yellow)' }}>{fmt(daIncassare)}</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(208,0,58,0.06)', border: '1px solid rgba(208,0,58,0.15)' }}>
          <p className="text-[10px] uppercase" style={{ color: 'var(--muted)' }}>Pagato</p>
          <p className="text-sm font-bold mt-1" style={{ color: 'var(--red2)' }}>{fmt(pagato)}</p>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <p className="text-[10px] uppercase" style={{ color: 'var(--muted)' }}>Da pagare</p>
          <p className="text-sm font-bold mt-1" style={{ color: '#f59e0b' }}>{fmt(daPagare)}</p>
        </div>
      </div>

      <div className="rounded-xl p-4 text-center" style={{ background: 'var(--panel2)' }}>
        <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Liquidita disponibile</p>
        <p className="text-2xl font-bold mt-1" style={{ color: liquidita >= 0 ? 'var(--green)' : 'var(--red2)' }}>
          {fmt(liquidita)}
        </p>
      </div>

      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>
        Dettagli nella tab Pagamenti
      </p>
    </div>
  )
}
