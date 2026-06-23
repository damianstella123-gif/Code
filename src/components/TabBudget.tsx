import { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronDown, Edit3, Save, Euro, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AnimatedLaserBorder from '@/components/AnimatedLaserBorder'
import type { Event } from '@/data/events'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
  margine: number
  marginePct: number
}

export default function TabBudget({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [lines, setLines] = useState<BudgetLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editVenduto, setEditVenduto] = useState('')
  const [editCosto, setEditCosto] = useState('')
  const [editIvaVenduto, setEditIvaVenduto] = useState('22')
  const [editIvaInclVenduto, setEditIvaInclVenduto] = useState(false)
  const [editIvaCosto, setEditIvaCosto] = useState('22')
  const [editIvaInclCosto, setEditIvaInclCosto] = useState(false)

  const [feePct, setFeePct] = useState(event.fee_agenzia_pct ?? 6)
  const [editingFee, setEditingFee] = useState(false)
  const [feeInput, setFeeInput] = useState(String(event.fee_agenzia_pct ?? 6))

  async function saveFee(newPct: number) {
    setFeePct(newPct)
    setEditingFee(false)
    await supabase.from('events').update({ fee_agenzia_pct: newPct }).eq('id', event.id)
  }

  function getSupName(id: string | null | undefined) {
    if (!id) return ''
    return suppliers.find(s => s.id === id)?.nome ?? ''
  }

  const loadData = useCallback(async () => {
    const [linksRes, svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
      supabase.from('event_suppliers').select('supplier_id, service_category').eq('event_id', event.id),
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

    // Build supplier_id -> budget category map from user's choice
    const catMap: Record<string, string> = {}
    for (const link of (linksRes.data ?? []) as { supplier_id: string; service_category: string }[]) {
      if (link.service_category) {
        catMap[link.supplier_id] = SERVICE_CAT_TO_BUDGET[link.service_category] || 'VARIE'
      }
    }

    function resolveCat(supplierId: string | null | undefined, fallback: string): string {
      if (supplierId && catMap[supplierId]) return catMap[supplierId]
      return fallback
    }

    const all: BudgetLine[] = []

    function pushLine(row: Record<string, unknown>, categoria: string, table: string, opts: {
      descrizione: string
      qty: number
      venduto: number
      costo: number
      sotto?: string
    }) {
      const margine = opts.venduto - opts.costo
      const marginePct = opts.venduto > 0 ? (margine / opts.venduto) * 100 : 0
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
        margine,
        marginePct,
      })
    }

    // TRANSFER
    for (const s of (svcRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (s.quantita as number) ?? 1
      const venduto = (s.venduto_totale as number) ?? ((s.venduto_unitario as number) ? (s.venduto_unitario as number) * qty : 0)
      const costo = (s.costo_totale as number) ?? ((s.costo_unitario as number) ? (s.costo_unitario as number) * qty : 0)
      if (!venduto && !costo) continue
      pushLine(s, resolveCat(s.supplier_id as string, 'TRANSFER'), 'event_supplier_services', {
        descrizione: (s.titolo as string) || 'Transfer',
        qty, venduto, costo,
      })
    }

    // HOTEL
    for (const h of (hotelRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (h.quantita as number) ?? 1
      const venduto = (h.venduto_totale as number) ?? ((h.venduto_unitario as number) ? (h.venduto_unitario as number) * qty : 0)
      const costo = (h.costo_totale as number) ?? ((h.costo_unitario as number) ? (h.costo_unitario as number) * qty : 0)
      if (!venduto && !costo) continue
      pushLine(h, resolveCat(h.supplier_id as string, 'HOTEL'), 'event_hotel_details', {
        descrizione: (h.titolo as string) || (h.tipo as string) || 'Hotel',
        qty, venduto, costo,
      })
    }

    // RISTORANTE
    for (const r of (restRes.data ?? []) as Record<string, unknown>[]) {
      const pax = (r.pax_confermati as number) ?? (r.pax_previsti as number) ?? 1
      const venduto = (r.budget_totale as number) ?? ((r.budget_per_persona as number) ? (r.budget_per_persona as number) * pax : 0)
      const costo = (r.costo_totale_reale as number) ?? ((r.costo_per_persona as number) ? (r.costo_per_persona as number) * pax : 0)
      if (!venduto && !costo) continue
      pushLine(r, resolveCat(r.supplier_id as string, 'RISTORANTE'), 'event_restaurant_details', {
        descrizione: (r.tipologia_servizio as string) || 'Ristorante',
        qty: pax, venduto, costo,
      })
    }

    // LOCATION / EXPERIENCE
    for (const e of (expRes.data ?? []) as Record<string, unknown>[]) {
      const pax = (e.pax as number) ?? 1
      const venduto = (e.venduto_totale as number) ?? ((e.venduto_unitario as number) ? (e.venduto_unitario as number) * pax : 0)
      const costo = (e.costo_totale as number) ?? ((e.costo_unitario as number) ? (e.costo_unitario as number) * pax : 0)
      if (!venduto && !costo) continue
      pushLine(e, resolveCat(e.supplier_id as string, 'LOCATION / EXPERIENCE'), 'event_experience_details', {
        descrizione: (e.nome_attivita as string) || 'Experience',
        qty: pax, venduto, costo,
      })
    }

    // CATERING
    for (const c of (catRes.data ?? []) as Record<string, unknown>[]) {
      const pax = (c.pax as number) ?? 1
      const venduto = (c.venduto_totale as number) ?? ((c.venduto_per_persona as number) ? (c.venduto_per_persona as number) * pax : 0)
      const costo = (c.costo_totale as number) ?? ((c.costo_per_persona as number) ? (c.costo_per_persona as number) * pax : 0)
      if (!venduto && !costo) continue
      pushLine(c, resolveCat(c.supplier_id as string, 'CATERING'), 'event_catering_details', {
        descrizione: (c.tipologia as string) || 'Catering',
        qty: pax, venduto, costo,
      })
    }

    // STAFF SIMMETRIA
    for (const si of (staffIntRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (si.quantita as number) ?? 1
      const venduto = (si.venduto_totale as number) ?? ((si.venduto_unitario as number) ? (si.venduto_unitario as number) * qty : 0)
      const costo = (si.costo_totale as number) ?? (si.costo_giornaliero as number) ?? ((si.costo_unitario as number) ? (si.costo_unitario as number) * qty : 0)
      if (!venduto && !costo) continue
      const nome = [(si.nome as string), (si.cognome as string)].filter(Boolean).join(' ') || (si.risorsa as string)
      pushLine(si, resolveCat(si.supplier_id as string, 'STAFF'), 'event_staff_interno_details', {
        descrizione: nome ? `${nome} - ${(si.ruolo as string) || 'Staff'}` : (si.ruolo as string) || 'Staff Simmetria',
        qty, venduto, costo,
        sotto: 'staff_simmetria',
      })
    }

    // STAFF ESTERNO
    for (const se of (staffExtRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (se.quantita as number) ?? 1
      const venduto = (se.venduto_totale as number) ?? ((se.venduto_unitario as number) ? (se.venduto_unitario as number) * qty : 0)
      const costo = (se.costo_totale as number) ?? ((se.costo_unitario as number) ? (se.costo_unitario as number) * qty : 0)
      if (!venduto && !costo) continue
      const nome = [(se.nome as string), (se.cognome as string)].filter(Boolean).join(' ')
      pushLine(se, resolveCat(se.supplier_id as string, 'STAFF'), 'event_staff_esterno_details', {
        descrizione: nome ? `${nome} - ${(se.ruolo as string) || 'Staff'}` : (se.ruolo as string) || 'Staff Esterno',
        qty, venduto, costo,
        sotto: 'staff_esterno',
      })
    }

    // AUDIO VIDEO
    for (const av of (avRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (av.quantita as number) ?? 1
      const venduto = (av.venduto_totale as number) ?? ((av.venduto_unitario as number) ? (av.venduto_unitario as number) * qty : 0)
      const costo = (av.costo_totale as number) ?? ((av.costo_unitario as number) ? (av.costo_unitario as number) * qty : 0)
      if (!venduto && !costo) continue
      pushLine(av, resolveCat(av.supplier_id as string, 'AUDIO VIDEO'), 'event_audio_video_details', {
        descrizione: (av.tipologia_servizio as string) || (av.descrizione as string) || 'Audio Video',
        qty, venduto, costo,
      })
    }

    // ALLESTIMENTI
    for (const al of (allestRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (al.quantita as number) ?? 1
      const venduto = (al.venduto_totale as number) ?? ((al.venduto_unitario as number) ? (al.venduto_unitario as number) * qty : 0)
      const costo = (al.costo_totale as number) ?? ((al.costo_unitario as number) ? (al.costo_unitario as number) * qty : 0)
      if (!venduto && !costo) continue
      pushLine(al, resolveCat(al.supplier_id as string, 'ALLESTIMENTI'), 'event_allestimenti_details', {
        descrizione: (al.descrizione as string) || 'Allestimento',
        qty, venduto, costo,
      })
    }

    // GRAFICA
    for (const g of (graficaRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (g.quantita as number) ?? 1
      const venduto = (g.venduto_totale as number) ?? ((g.venduto_unitario as number) ? (g.venduto_unitario as number) * qty : 0)
      const costo = (g.costo_totale as number) ?? ((g.costo_unitario as number) ? (g.costo_unitario as number) * qty : 0)
      if (!venduto && !costo) continue
      pushLine(g, resolveCat(g.supplier_id as string, 'GRAFICA'), 'event_grafica_stampa_details', {
        descrizione: (g.tipo_materiale as string) || (g.descrizione as string) || 'Grafica',
        qty, venduto, costo,
      })
    }

    // VARIE
    for (const v of (varieRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (v.quantita as number) ?? 1
      const venduto = (v.venduto_totale as number) ?? ((v.venduto_unitario as number) ? (v.venduto_unitario as number) * qty : 0)
      const costo = (v.costo_totale as number) ?? ((v.costo_unitario as number) ? (v.costo_unitario as number) * qty : 0)
      if (!venduto && !costo) continue
      pushLine(v, resolveCat(v.supplier_id as string, 'VARIE'), 'event_varie_details', {
        descrizione: (v.descrizione as string) || 'Voce varia',
        qty, venduto, costo,
      })
    }

    setLines(all)
    setLoading(false)
  }, [event.id, suppliers])

  useEffect(() => { loadData() }, [loadData])

  // Aggregated totals
  const totals = useMemo(() => {
    const venduto = lines.reduce((s, l) => s + l.venduto, 0)
    const costo = lines.reduce((s, l) => s + l.costo, 0)
    const fee = venduto * feePct / 100
    const ricavi = venduto + fee
    const margine = ricavi - costo
    const marginePct = ricavi > 0 ? (margine / ricavi) * 100 : 0
    return { venduto, costo, fee, ricavi, margine, marginePct }
  }, [lines, feePct])

  // Group by category (only those with data), sorted per CATEGORY_ORDER
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

  // Inline edit: writes back to the source table
  function startEdit(line: BudgetLine) {
    setEditingId(line.id)
    setEditVenduto(String(line.venduto))
    setEditCosto(String(line.costo))
    setEditIvaVenduto(line.aliquota_iva_venduto)
    setEditIvaInclVenduto(line.iva_inclusa_venduto)
    setEditIvaCosto(line.aliquota_iva_costo)
    setEditIvaInclCosto(line.iva_inclusa_costo)
  }

  async function saveEdit(line: BudgetLine) {
    setSaving(true)
    const vt = Number(editVenduto) || 0
    const ct = Number(editCosto) || 0

    const patch: Record<string, unknown> = {
      aliquota_iva_venduto: editIvaVenduto,
      iva_inclusa_venduto: editIvaInclVenduto,
      aliquota_iva_costo: editIvaCosto,
      iva_inclusa_costo: editIvaInclCosto,
    }

    // Write totals back to source table using the correct column names
    if (line.table === 'event_restaurant_details') {
      patch.budget_totale = vt
      if (line.qty > 0) patch.budget_per_persona = vt / line.qty
      patch.costo_totale_reale = ct
      if (line.qty > 0) patch.costo_per_persona = ct / line.qty
    } else if (line.table === 'event_catering_details') {
      patch.venduto_totale = vt
      if (line.qty > 0) patch.venduto_per_persona = vt / line.qty
      patch.costo_totale = ct
      if (line.qty > 0) patch.costo_per_persona = ct / line.qty
    } else if (line.table === 'event_staff_interno_details') {
      patch.venduto_totale = vt
      patch.costo_totale = ct
    } else {
      // All other tables use venduto_totale / costo_totale + unit prices
      patch.venduto_totale = vt
      patch.costo_totale = ct
      if (line.qty > 0) {
        patch.venduto_unitario = vt / line.qty
        patch.costo_unitario = ct / line.qty
      }
    }

    await supabase.from(line.table).update(patch).eq('id', line.id)
    setEditingId(null)
    setSaving(false)
    await loadData()
  }

  const fmt = (n: number) => '\u20AC' + n.toLocaleString('it-IT', { minimumFractionDigits: 2 })
  const fmtN = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 })

  function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_')
  }

  function exportPdfInterno() {
    const doc = new jsPDF({ orientation: 'landscape' })
    const evName = event.nome || 'Evento'
    const clientName = event.cliente || ''

    doc.setFontSize(16)
    doc.text('BUDGET INTERNO', 14, 18)
    doc.setFontSize(10)
    doc.text(`Evento: ${evName}`, 14, 26)
    if (clientName) doc.text(`Cliente: ${clientName}`, 14, 32)
    doc.text(`Data: ${new Date().toLocaleDateString('it-IT')}`, 14, clientName ? 38 : 32)

    let startY = clientName ? 44 : 38

    for (const cat of grouped) {
      const catV = cat.items.reduce((s, i) => s + i.venduto, 0)
      const catC = cat.items.reduce((s, i) => s + i.costo, 0)
      const catM = catV - catC
      const catMp = catV > 0 ? (catM / catV * 100).toFixed(1) : '0.0'

      const body: (string | { content: string; styles: { fontStyle: string } })[][] = cat.items.map(item => [
        item.descrizione,
        item.fornitore || '-',
        String(item.qty),
        fmtN(item.venduto),
        `${item.aliquota_iva_venduto}%`,
        fmtN(item.costo),
        `${item.aliquota_iva_costo}%`,
        fmtN(item.margine),
        `${item.marginePct.toFixed(1)}%`,
      ])

      body.push([
        { content: `TOTALE ${cat.label}`, styles: { fontStyle: 'bold' } },
        '', '',
        { content: fmtN(catV), styles: { fontStyle: 'bold' } },
        '',
        { content: fmtN(catC), styles: { fontStyle: 'bold' } },
        '',
        { content: fmtN(catM), styles: { fontStyle: 'bold' } },
        { content: `${catMp}%`, styles: { fontStyle: 'bold' } },
      ])

      autoTable(doc, {
        startY,
        head: [[cat.label, 'Fornitore', 'Qty', 'Venduto', 'IVA V.', 'Costo', 'IVA C.', 'Margine', 'M%']],
        body: body as unknown as string[][],
        theme: 'grid',
        headStyles: { fillColor: [30, 30, 30], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 60 },
          2: { halign: 'right', cellWidth: 15 },
          3: { halign: 'right', cellWidth: 28 },
          4: { halign: 'right', cellWidth: 18 },
          5: { halign: 'right', cellWidth: 28 },
          6: { halign: 'right', cellWidth: 18 },
          7: { halign: 'right', cellWidth: 28 },
          8: { halign: 'right', cellWidth: 18 },
        },
        margin: { left: 14, right: 14 },
      })
      startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
    }

    // Grand totals
    autoTable(doc, {
      startY,
      head: [['', 'Venduto Servizi', 'Fee Simmetria', 'Totale Ricavi', 'Totale Costi', 'Margine Netto', 'Margine %']],
      body: [[
        'TOTALE EVENTO',
        fmtN(totals.venduto),
        `${fmtN(totals.fee)} (${feePct}%)`,
        fmtN(totals.ricavi),
        fmtN(totals.costo),
        fmtN(totals.margine),
        `${totals.marginePct.toFixed(1)}%`,
      ]],
      theme: 'grid',
      headStyles: { fillColor: [180, 0, 40], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9, fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    })

    const filename = `${sanitizeFilename(evName)}_${sanitizeFilename(clientName)}_Budget_Interno.pdf`
    doc.save(filename)
  }

  function exportPdfCliente() {
    const doc = new jsPDF()
    const evName = event.nome || 'Evento'
    const clientName = event.cliente || ''

    doc.setFontSize(18)
    doc.text('PREVENTIVO', 14, 22)
    doc.setFontSize(11)
    doc.text(`Evento: ${evName}`, 14, 32)
    if (clientName) doc.text(`Cliente: ${clientName}`, 14, 39)
    doc.setFontSize(9)
    doc.text(`Data: ${new Date().toLocaleDateString('it-IT')}`, 14, clientName ? 47 : 39)

    let startY = clientName ? 54 : 46

    for (const cat of grouped) {
      const catV = cat.items.reduce((s, i) => s + i.venduto, 0)

      const body: (string | { content: string; styles: { fontStyle: string } })[][] = cat.items.map(item => {
        const unitario = item.qty > 0 ? item.venduto / item.qty : item.venduto
        return [
          item.descrizione,
          String(item.qty),
          fmtN(unitario),
          fmtN(item.venduto),
          `${item.aliquota_iva_venduto}%`,
        ]
      })

      body.push([
        { content: `Totale ${cat.label}`, styles: { fontStyle: 'bold' } },
        '', '',
        { content: fmtN(catV), styles: { fontStyle: 'bold' } },
        '',
      ])

      autoTable(doc, {
        startY,
        head: [[cat.label, 'Qty', 'Prezzo Unit.', 'Totale', 'IVA']],
        body: body as unknown as string[][],
        theme: 'striped',
        headStyles: { fillColor: [30, 30, 30], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 75 },
          1: { halign: 'right', cellWidth: 18 },
          2: { halign: 'right', cellWidth: 30 },
          3: { halign: 'right', cellWidth: 30 },
          4: { halign: 'right', cellWidth: 20 },
        },
        margin: { left: 14, right: 14 },
      })
      startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
    }

    // Grand total for client
    autoTable(doc, {
      startY,
      body: [[
        { content: 'TOTALE PREVENTIVO', styles: { fontStyle: 'bold', fontSize: 11 } },
        { content: `EUR ${fmtN(totals.venduto)}`, styles: { fontStyle: 'bold', fontSize: 11, halign: 'right' } },
      ]],
      theme: 'plain',
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 70 } },
      margin: { left: 14, right: 14 },
    })

    startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4
    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text('I prezzi indicati sono da intendersi IVA esclusa salvo diversa indicazione.', 14, startY)

    const filename = `${sanitizeFilename(evName)}_${sanitizeFilename(clientName)}_Budget_Cliente.pdf`
    doc.save(filename)
  }

  function renderBudgetLine(item: BudgetLine) {
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
          <span className="w-24 text-xs truncate hidden md:block" style={{ color: 'var(--muted)' }}>
            {SOTTO_LABELS[item.sotto_categoria] || item.sotto_categoria || '-'}
          </span>
          <span className="w-24 text-xs truncate hidden md:block" style={{ color: 'var(--muted)' }}>{item.fornitore || '-'}</span>
          <span className="w-10 text-xs text-right" style={{ color: 'var(--text)' }}>{item.qty}</span>
          <span className="w-20 text-xs text-right" style={{ color: 'var(--text)' }}>{fmt(item.venduto)}</span>
          <span className="w-20 text-xs text-right" style={{ color: 'var(--yellow)' }}>{fmt(item.costo)}</span>
          <span className="w-14 text-xs text-right hidden md:block" style={{ color: 'var(--muted)' }}>{item.aliquota_iva_venduto}%</span>
          <span className="w-20 text-xs text-right font-medium" style={{ color: item.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(item.margine)}</span>
          <span className="w-10 text-xs text-right font-medium" style={{ color: item.marginePct >= 20 ? 'var(--green)' : item.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }}>{item.marginePct.toFixed(0)}%</span>
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 pt-2" style={{ background: 'var(--bg)' }}>
            {isEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Venduto cliente" value={editVenduto} onChange={setEditVenduto} type="number" />
                  <Field label="Costo reale" value={editCosto} onChange={setEditCosto} type="number" />
                  <div>
                    <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>IVA Venduto</label>
                    <div className="flex gap-1">
                      <select value={editIvaVenduto} onChange={e => setEditIvaVenduto(e.target.value)}
                        className="flex-1 px-2 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                        {['0','4','5','10','22'].map(v => <option key={v} value={v}>{v}%</option>)}
                      </select>
                      <select value={editIvaInclVenduto ? 'i' : 'e'} onChange={e => setEditIvaInclVenduto(e.target.value === 'i')}
                        className="w-16 px-1 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                        <option value="e">Escl</option>
                        <option value="i">Incl</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>IVA Costo</label>
                    <div className="flex gap-1">
                      <select value={editIvaCosto} onChange={e => setEditIvaCosto(e.target.value)}
                        className="flex-1 px-2 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                        {['0','4','5','10','22'].map(v => <option key={v} value={v}>{v}%</option>)}
                      </select>
                      <select value={editIvaInclCosto ? 'i' : 'e'} onChange={e => setEditIvaInclCosto(e.target.value === 'i')}
                        className="w-16 px-1 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                        <option value="e">Escl</option>
                        <option value="i">Incl</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)' }}>
                  {(() => {
                    const v = Number(editVenduto) || 0; const c = Number(editCosto) || 0
                    const m = v - c; const mp = v > 0 ? (m / v) * 100 : 0
                    return <span style={{ color: 'var(--muted)' }}>Margine: <strong style={{ color: m >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(m)} ({mp.toFixed(1)}%)</strong></span>
                  })()}
                </div>
                <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
                  <button disabled={saving} onClick={() => saveEdit(item)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
                    style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
                    <Save className="w-3 h-3" /> {saving ? 'Salvataggio...' : 'Salva'}
                  </button>
                  <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>Annulla</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 mb-3">
                  <Detail label="Descrizione" value={item.descrizione} />
                  {item.sotto_categoria && item.sotto_categoria !== 'staff_simmetria' && item.sotto_categoria !== 'staff_esterno' && (
                    <Detail label="Sotto-categoria" value={SOTTO_LABELS[item.sotto_categoria] || item.sotto_categoria} />
                  )}
                  {item.fornitore && <Detail label="Fornitore" value={item.fornitore} />}
                  <Detail label="Quantita" value={String(item.qty)} />
                  <Detail label="Venduto cliente" value={fmt(item.venduto)} />
                  <Detail label="Costo reale" value={fmt(item.costo)} />
                  <Detail label="IVA Venduto" value={`${item.aliquota_iva_venduto}% ${item.iva_inclusa_venduto ? '(inclusa)' : '(esclusa)'}`} />
                  <Detail label="IVA Costo" value={`${item.aliquota_iva_costo}% ${item.iva_inclusa_costo ? '(inclusa)' : '(esclusa)'}`} />
                  <Detail label="Margine" value={fmt(item.margine)} />
                  <Detail label="Margine %" value={`${item.marginePct.toFixed(1)}%`} />
                </div>
                <div className="pt-2" style={{ borderTop: '1px solid var(--line)' }}>
                  <button onClick={() => startEdit(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                    style={{ background: 'var(--panel2)', color: 'var(--blue)' }}>
                    <Edit3 className="w-3 h-3" /> Modifica venduto/costo
                  </button>
                </div>
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
      {/* Summary - Fee Simmetria */}
      <AnimatedLaserBorder loading={saving}>
        <div className="panel p-5 space-y-4">
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
            <Kpi label="Totale Ricavi" value={fmt(totals.ricavi)} color="var(--text)" />
          </div>
          <div className="h-px" style={{ background: 'var(--line)' }} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Kpi label="Totale Costi" value={fmt(totals.costo)} color="var(--yellow)" />
            <Kpi label="Margine Netto" value={fmt(totals.margine)} color={totals.margine >= 0 ? 'var(--green)' : 'var(--red2)'} />
            <Kpi label="Margine %" value={`${totals.marginePct.toFixed(1)}%`} color={totals.marginePct >= 20 ? 'var(--green)' : totals.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)'} />
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

      {/* PDF Export buttons */}
      {lines.length > 0 && (
        <div className="flex items-center gap-3">
          <button onClick={exportPdfInterno}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            <Download className="w-3.5 h-3.5" /> Scarica Budget Interno
          </button>
          <button onClick={exportPdfCliente}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: '#fff' }}>
            <Download className="w-3.5 h-3.5" /> Scarica Budget Cliente
          </button>
        </div>
      )}

      {/* Category breakdown */}
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
            const catM = catV - catC
            const catMp = catV > 0 ? (catM / catV) * 100 : 0

            return (
              <div key={cat.label} className="panel overflow-hidden">
                {/* Category header */}
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--panel2)' }}>
                  <p className="text-sm font-bold tracking-wide" style={{ color: 'var(--text)' }}>{cat.label}</p>
                  <div className="flex items-center gap-4 text-xs">
                    <span style={{ color: 'var(--muted)' }}>V: <strong style={{ color: 'var(--text)' }}>{fmt(catV)}</strong></span>
                    <span style={{ color: 'var(--muted)' }}>C: <strong style={{ color: 'var(--yellow)' }}>{fmt(catC)}</strong></span>
                    <span style={{ color: 'var(--muted)' }}>M: <strong style={{ color: catM >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(catM)} ({catMp.toFixed(0)}%)</strong></span>
                  </div>
                </div>

                {/* Column headers */}
                <div className="hidden md:flex px-4 py-1.5 items-center gap-3 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--muted)', borderBottom: '1px solid var(--line)' }}>
                  <span className="w-4" />
                  <span className="flex-1">Descrizione</span>
                  <span className="w-24">Sotto-cat.</span>
                  <span className="w-24">Fornitore</span>
                  <span className="w-10 text-right">Qty</span>
                  <span className="w-20 text-right">Venduto</span>
                  <span className="w-20 text-right">Costo</span>
                  <span className="w-14 text-right">IVA</span>
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
              <span style={{ color: 'var(--muted)' }}>Margine: <strong style={{ color: totals.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(totals.margine)}</strong></span>
              <strong style={{ color: totals.marginePct >= 20 ? 'var(--green)' : 'var(--yellow)' }}>{totals.marginePct.toFixed(1)}%</strong>
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

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>{label}</label>
      <input type={type} step={type === 'number' ? '0.01' : undefined} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-xs"
        style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }} />
    </div>
  )
}
