import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { ChevronDown, Edit3, Save, Euro, Download, FileSpreadsheet, AlertTriangle, CheckCircle2, Clock, ShieldCheck, Lock, Plus, Pencil, Paperclip, Trash2, FileText, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadUser } from '@/lib/auth'
import { fetchProfile } from '@/lib/profiles'
import { useToast } from '@/lib/toast'
import { cloneBudgetVersion } from '@/lib/budget-versions-service'
import { calcRowEconomics, normalizzaImporto, calcRowCommission, calcRowNetto } from '@/lib/event-economics'
import { isSupportedTable, fetchLineRecord, recordToEditableData, saveLine, hasSupplierField, createMinimalLine } from '@/lib/economic-lines-service'
import type { EditableLineData } from '@/lib/economic-lines-service'
import BudgetLineEditModal from '@/components/BudgetLineEditModal'
import { fmtDate as fmtDateCentral, friendlyError } from '@/lib/format'
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
  vendutoNetto: number
  costoNetto: number
  aliquota_iva_venduto: string
  iva_inclusa_venduto: boolean
  aliquota_iva_costo: string
  iva_inclusa_costo: boolean
  commissione_pct: number | null
  commissione_importo: number | null
  commissione: number
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

  const [editingLine, setEditingLine] = useState<{ id: string; table: string; categoria: string } | null>(null)
  const [cloning, setCloning] = useState(false)
  const [addingLine, setAddingLine] = useState<string | null>(null)
  const [addLineDropdown, setAddLineDropdown] = useState<string | null>(null)

  // ─── Version attachments ──────────────────────────────────
  const [versionDocs, setVersionDocs] = useState<any[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  // ─── Inline editing state ─────────────────────────────────
  const [inlineEdit, setInlineEdit] = useState<{ id: string; table: string; data: EditableLineData; original: BudgetLine } | null>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [inlineSaving, setInlineSaving] = useState(false)
  const inlineRowRef = useRef<HTMLDivElement | null>(null)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function startInlineEdit(item: BudgetLine) {
    if (!isSupportedTable(item.table)) return
    if (inlineEdit?.id === item.id) return
    setInlineError(null)
    const record = await fetchLineRecord(item.table, item.id)
    if (!record) return
    const data = recordToEditableData(item.table, record)
    if (!data) return
    setInlineEdit({ id: item.id, table: item.table, data, original: item })
  }

  function cancelInlineEdit() {
    setInlineEdit(null)
    setInlineError(null)
  }

  async function commitInlineEdit() {
    if (!inlineEdit || inlineSaving) return
    setInlineSaving(true)
    setInlineError(null)
    const result = await saveLine(inlineEdit.data)
    setInlineSaving(false)
    if (!result.success) {
      setInlineError(result.error || 'Errore durante il salvataggio')
      return
    }
    setInlineEdit(null)
    loadData()
    console.log('[TabBudget] commitInlineEdit: loadData triggered')
    showToast('Voce economica aggiornata', 'success')
  }

  function updateInlineField(field: keyof EditableLineData, value: string | number) {
    if (!inlineEdit) return
    setInlineEdit(prev => prev ? { ...prev, data: { ...prev.data, [field]: value } } : null)
  }

  function getInlinePreview(data: EditableLineData) {
    const fakeRow: Record<string, unknown> = {
      aliquota_iva_venduto: data.aliquotaIvaVenduto,
      iva_inclusa_venduto: data.ivaInclusaVenduto,
      aliquota_iva_costo: data.aliquotaIvaCosto,
      iva_inclusa_costo: data.ivaInclusaCosto,
      commissione_pct: data.commissionePct,
      commissione_importo: data.commissioneImporto,
    }
    const { vendutoNetto, costoNetto } = calcRowNetto(fakeRow, data.vendutoTotale, data.costoTotale)
    calcRowCommission(fakeRow, costoNetto)
    const margine = vendutoNetto - costoNetto
    const marginePct = vendutoNetto > 0 ? (margine / vendutoNetto) * 100 : 0
    return { margine, marginePct }
  }

  function handleInlineBlur() {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    blurTimerRef.current = setTimeout(() => {
      if (inlineRowRef.current && !inlineRowRef.current.contains(document.activeElement)) {
        commitInlineEdit()
      }
    }, 200)
  }

  function handleInlineFocus() {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
  }

  async function saveFee(newPct: number) {
    setSavingFee(true)
    setFeePct(newPct)
    setEditingFee(false)
    const { error } = await supabase.from('events').update({ fee_agenzia_pct: newPct }).eq('id', event.id)
    setSavingFee(false)
    if (error) showToast(friendlyError(error), 'error')
  }

  async function saveTarget(newTarget: number) {
    setMargineTarget(newTarget)
    setEditingTarget(false)
    const { error } = await supabase.from('events').update({ margine_target: newTarget }).eq('id', event.id)
    if (error) showToast(friendlyError(error), 'error')
  }

  // ─── Version attachments helpers ──────────────────────────
  const loadVersionDocs = useCallback(async (versionId: string | null) => {
    if (!versionId) { setVersionDocs([]); return }
    setDocsLoading(true)
    const { data } = await supabase.from('event_documents').select('*').eq('budget_version_id', versionId).order('created_at', { ascending: false })
    setVersionDocs(data || [])
    setDocsLoading(false)
  }, [])

  async function uploadVersionDoc(file: File) {
    if (!activeVersion || !user) return
    setUploading(true)
    const path = `${event.id}/${activeVersion}/${Date.now()}_${file.name}`
    const { error: storageErr } = await supabase.storage.from('event-documents').upload(path, file)
    if (storageErr) { showToast(`Errore upload: ${storageErr.message}`, 'error'); setUploading(false); return }
    const { error: dbErr } = await supabase.from('event_documents').insert({
      event_id: event.id,
      budget_version_id: activeVersion,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: path,
      uploaded_by: user.id,
      uploaded_by_name: [user.nome, user.cognome].filter(Boolean).join(' ') || user.email || 'Utente',
    })
    setUploading(false)
    if (dbErr) { showToast(`Errore salvataggio: ${dbErr.message}`, 'error'); return }
    showToast('Documento allegato', 'success')
    loadVersionDocs(activeVersion)
  }

  async function downloadVersionDoc(storagePath: string) {
    const { data, error } = await supabase.storage.from('event-documents').createSignedUrl(storagePath, 60)
    if (error || !data?.signedUrl) { showToast('Errore generazione link', 'error'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function deleteVersionDoc(doc: any) {
    if (!window.confirm(`Eliminare "${doc.file_name}"?`)) return
    await supabase.storage.from('event-documents').remove([doc.storage_path])
    await supabase.from('event_documents').delete().eq('id', doc.id)
    showToast('Documento rimosso', 'success')
    loadVersionDocs(activeVersion)
  }

  useEffect(() => { loadVersionDocs(activeVersion) }, [activeVersion, loadVersionDocs])

  // ─── Budget Versions ───────────────────────────────────────
  useEffect(() => { setUser(loadUser()) }, [])

  useEffect(() => {
    supabase.from('budget_versions')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setVersions(data || [])
        if (data?.length) {
          const approved = data.filter(v => v.tipo === 'preventivo' && v.stato === 'approvato')
          const defaultVersion = approved.length > 0 ? approved[approved.length - 1] : data[data.length - 1]
          setActiveVersion(defaultVersion.id)
        }
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
    if (cloning) return
    setCloning(true)
    const result = await cloneBudgetVersion({
      sourceVersionId: fromId,
      targetType: 'consuntivo',
      targetName: 'Consuntivo',
    })
    if (!result.success) {
      showToast(result.error || 'Errore durante la creazione del consuntivo', 'error')
      setCloning(false)
      return
    }
    const { data: freshVersions } = await supabase.from('budget_versions')
      .select('*').eq('event_id', event.id).order('created_at', { ascending: true })
    setVersions(freshVersions || [])
    setActiveVersion(result.newVersionId!)
    showToast('Consuntivo creato', 'success')
    setCloning(false)
  }

  async function duplicateVersion(fromId: string) {
    if (cloning) return
    setCloning(true)
    const source = versions.find(v => v.id === fromId)
    const result = await cloneBudgetVersion({
      sourceVersionId: fromId,
      targetType: 'preventivo',
      targetName: `${source?.nome || 'Preventivo'} (copia)`,
    })
    if (!result.success) {
      showToast(result.error || 'Errore durante la duplicazione', 'error')
      setCloning(false)
      return
    }
    const { data: freshVersions } = await supabase.from('budget_versions')
      .select('*').eq('event_id', event.id).order('created_at', { ascending: true })
    setVersions(freshVersions || [])
    setActiveVersion(result.newVersionId!)
    showToast('Versione duplicata', 'success')
    setCloning(false)
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
    console.log('[TabBudget] loadData called', { eventId: event.id, activeVersion })
    const vFilter = activeVersion
    const bvq = (table: string) => {
      let q = supabase.from(table as any).select('*').eq('event_id', event.id)
      if (vFilter) q = q.or(`budget_version_id.eq.${vFilter},budget_version_id.is.null`)
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
      const vendutoNetto = normalizzaImporto(
        opts.venduto,
        (row.aliquota_iva_venduto as string | number | null) ?? 22,
        (row.iva_inclusa_venduto as boolean) ?? false
      )
      const costoNetto = normalizzaImporto(
        opts.costo,
        (row.aliquota_iva_costo as string | number | null) ?? 22,
        (row.iva_inclusa_costo as boolean) ?? false
      )
      const commissione = calcRowCommission(row, costoNetto)
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
        vendutoNetto,
        costoNetto,
        aliquota_iva_venduto: (row.aliquota_iva_venduto as string) || '22',
        iva_inclusa_venduto: (row.iva_inclusa_venduto as boolean) ?? false,
        aliquota_iva_costo: (row.aliquota_iva_costo as string) || '22',
        iva_inclusa_costo: (row.iva_inclusa_costo as boolean) ?? false,
        commissione_pct: opts.commissione_pct ?? null,
        commissione_importo: opts.commissione_importo ?? null,
        commissione,
        margine,
        marginePct,
        stato_conferma: resolveStato(row.supplier_id as string),
        dateLabel: opts.dateLabel || '',
      })
    }

    // TRANSFER
    for (const s of (svcRes.data ?? []) as Record<string, unknown>[]) {
      const { venduto, costo } = calcRowEconomics(s, 'transfer')
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
      pushLine(r, resolveCat(r.supplier_id as string, 'RISTORANTE'), 'event_restaurant_details', {
        descrizione: (r.tipologia_servizio as string) || 'Ristorante', qty: pax, venduto, costo,
        dateLabel: fmtDate(r.data),
      })
    }

    // LOCATION / EXPERIENCE
    for (const e of (expRes.data ?? []) as Record<string, unknown>[]) {
      const pax = (e.pax as number) ?? 1
      const { venduto, costo } = calcRowEconomics(e, 'experience')
      pushLine(e, resolveCat(e.supplier_id as string, 'LOCATION / EXPERIENCE'), 'event_experience_details', {
        descrizione: (e.nome_attivita as string) || 'Experience', qty: pax, venduto, costo,
        dateLabel: fmtDate(e.data),
      })
    }

    // CATERING
    for (const c of (catRes.data ?? []) as Record<string, unknown>[]) {
      const pax = (c.pax as number) ?? 1
      const { venduto, costo } = calcRowEconomics(c, 'catering')
      pushLine(c, resolveCat(c.supplier_id as string, 'CATERING'), 'event_catering_details', {
        descrizione: (c.tipologia as string) || 'Catering', qty: pax, venduto, costo,
        dateLabel: fmtDate(c.data),
      })
    }

    // STAFF SIMMETRIA
    for (const si of (staffIntRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (si.quantita as number) ?? 1
      const { venduto, costo } = calcRowEconomics(si, 'staff_interno')
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
      pushLine(g, resolveCat(g.supplier_id as string, 'GRAFICA'), 'event_grafica_stampa_details', {
        descrizione: (g.tipo_materiale as string) || (g.descrizione as string) || 'Grafica', qty, venduto, costo,
        dateLabel: fmtDate(g.data_consegna),
      })
    }

    // VARIE
    for (const v of (varieRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (v.quantita as number) ?? 1
      const { venduto, costo } = calcRowEconomics(v, 'varie')
      pushLine(v, resolveCat(v.supplier_id as string, 'VARIE'), 'event_varie_details', {
        descrizione: (v.tipologia as string) ? `${v.tipologia} — ${(v.descrizione as string) || 'Voce'}` : (v.descrizione as string) || 'Voce varia', qty, venduto, costo,
        dateLabel: fmtDate(v.data),
      })
    }

    console.log('[TabBudget] loadData finished, lines count:', all.length, 'sample:', all.slice(0, 3))
    setLines(all)
    setLoading(false)
  }, [event.id, suppliers, activeVersion])

  useEffect(() => { if (activeVersion !== null || versions.length === 0) loadData() }, [loadData, activeVersion, versions.length])

  // Aggregated totals — all based on net (VAT-excluded) amounts
  const totals = useMemo(() => {
    const venduto = lines.reduce((s, l) => s + l.vendutoNetto, 0)
    const costo = lines.reduce((s, l) => s + l.costoNetto, 0)
    const fee = venduto * feePct / 100
    const commissioni = lines.reduce((s, l) => s + l.commissione, 0)
    const ricavi = venduto + fee + commissioni
    const margine = ricavi - costo
    const marginePct = ricavi > 0 ? (margine / ricavi) * 100 : 0
    return { venduto, costo, fee, commissioni, ricavi, margine, marginePct }
  }, [lines, feePct])

  const fmt = (n: number) => '\u20AC' + n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtN = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Confirmed vs estimated split — uses net amounts
  const confirmSplit = useMemo(() => {
    const confermati = lines.filter(l => l.stato_conferma !== 'richiesto')
    const stimati = lines.filter(l => l.stato_conferma === 'richiesto')
    const costoConfermato = confermati.reduce((s, l) => s + l.costoNetto, 0)
    const costoStimato = stimati.reduce((s, l) => s + l.costoNetto, 0)
    const vendutoConfermato = confermati.reduce((s, l) => s + l.vendutoNetto, 0)
    const vendutoStimato = stimati.reduce((s, l) => s + l.vendutoNetto, 0)
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
      const catV = items.reduce((s, i) => s + i.vendutoNetto, 0)
      const catC = items.reduce((s, i) => s + i.costoNetto, 0)
      const catComm = items.reduce((s, i) => s + i.commissione, 0)
      const catFee = catV * feePct / 100
      const catRicavi = catV + catFee + catComm
      const catMp = catRicavi > 0 ? ((catRicavi - catC) / catRicavi) * 100 : 0
      if (catMp < margineTarget && catMp >= 0) catWarnings.push(`${cat} (${catMp.toFixed(0)}%)`)
    }
    if (catWarnings.length > 0) {
      result.push({ type: 'warning', message: `Margine sotto target per: ${catWarnings.join(', ')}` })
    }

    // Lines without costs
    const noCost = lines.filter(l => l.costoNetto === 0 && l.vendutoNetto === 0)
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
    console.log('[TabBudget] grouped recomputed', { categoriesCount: CATEGORY_ORDER.filter(cat => map[cat] && map[cat].length > 0).length })
    return CATEGORY_ORDER
      .filter(cat => map[cat] && map[cat].length > 0)
      .map(cat => ({ label: cat, items: map[cat] }))
  }, [lines])


  const EXPORT_LABELS: Record<string, string> = {
    'HOTEL': 'CAMERE', 'TRANSFER': 'TRASPORTI', 'RISTORANTE': 'RISTORANTI',
    'LOCATION / EXPERIENCE': 'MEETING E SERVIZI F&B', 'CATERING': 'CATERING',
    'AUDIO VIDEO': 'AUDIO VIDEO', 'ALLESTIMENTI': 'ALLESTIMENTI',
    'STAFF': 'STAFF ESTERNO', 'GRAFICA': 'GRAFICA E STAMPA', 'VARIE': 'VARIE ED EXTRA',
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
  async function exportPdfInterno() {
    const doc = new jsPDF({ orientation: 'landscape' })
    const evName = event.nome || 'Evento'
    const clientName = getClientName()
    const exportGroups = getExportGroups()
    const paxCount = event.partecipanti ?? 0
    let responsabileName = ''
    if (event.responsabile) {
      const p = await fetchProfile(event.responsabile)
      if (p) responsabileName = [p.first_name, p.last_name].filter(Boolean).join(' ')
    }

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text('Simmetria Immagine e Comunicazione Srl', 250, 10, { align: 'right' })
    doc.text('Viale Egeo 8 | 00144 Roma', 250, 14, { align: 'right' })

    doc.setFontSize(14)
    doc.setTextColor(208, 0, 58)
    doc.text('BUDGET INTERNO', 14, 16)
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text('Importi economici al netto IVA', 14, 22)
    doc.setFontSize(11)
    doc.setTextColor(0)
    doc.text(evName, 14, 28)
    doc.setFontSize(9)
    doc.setTextColor(80)
    let headerY = 34
    if (clientName) { doc.text(`Cliente: ${clientName}`, 14, headerY); headerY += 6 }
    if (paxCount > 0) { doc.text(`${paxCount} partecipanti`, 14, headerY); headerY += 6 }
    doc.text(`Preventivo al ${fmtDateCentral(new Date().toISOString())}`, 14, headerY)

    let startY = headerY + 6

    for (const cat of exportGroups) {
      const catV = cat.items.reduce((s, i) => s + i.vendutoNetto, 0)
      const catC = cat.items.reduce((s, i) => s + i.costoNetto, 0)
      const catComm = cat.items.reduce((s, i) => s + i.commissione, 0)
      const catFee = catV * feePct / 100
      const catRicavi = catV + catFee + catComm
      const catM = catRicavi - catC
      const catMp = catRicavi > 0 ? (catM / catRicavi * 100).toFixed(1) : '0.0'

      const body: unknown[][] = cat.items.map(item => {
        const itemFee = item.vendutoNetto * feePct / 100
        const itemRicavi = item.vendutoNetto + itemFee + item.commissione
        const itemMargine = itemRicavi - item.costoNetto
        const itemMp = itemRicavi > 0 ? ((itemMargine / itemRicavi) * 100).toFixed(1) : '0.0'
        const statoLabel = item.stato_conferma === 'contrattualizzato' ? 'C' : item.stato_conferma === 'confermato' ? 'OK' : '?'
        return [
          item.descrizione,
          item.fornitore || '-',
          statoLabel,
          String(item.qty),
          fmtN(item.vendutoNetto),
          fmtN(item.costoNetto),
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
        head: [[cat.label, 'Fornitore', 'St.', 'Qty', 'Venduto netto', 'Costo netto', `Fee ${feePct}%`, 'Margine', 'M%']],
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
      const cv = cat.items.reduce((s, i) => s + i.vendutoNetto, 0)
      const cc = cat.items.reduce((s, i) => s + i.costoNetto, 0)
      const catComm = cat.items.reduce((s, i) => s + i.commissione, 0)
      const cf = cv * feePct / 100
      const cm = cv + cf + catComm - cc
      return [cat.label, fmtN(cv), fmtN(cc), fmtN(cf), fmtN(cm)]
    })
    riepilogoBody.push([
      { content: 'Sub-total (Venduto Servizi)', styles: { fontStyle: 'bold' } },
      { content: fmtN(totals.venduto), styles: { fontStyle: 'bold' } },
      { content: fmtN(totals.costo), styles: { fontStyle: 'bold' } },
      { content: fmtN(totals.fee), styles: { fontStyle: 'bold' } },
      { content: fmtN(totals.margine), styles: { fontStyle: 'bold' } },
    ])
    if (totals.commissioni > 0) {
      riepilogoBody.push([
        { content: 'COMMISSIONI (interno)', styles: { fontStyle: 'italic' } },
        { content: '', styles: {} },
        { content: '', styles: {} },
        { content: '', styles: {} },
        { content: fmtN(totals.commissioni), styles: { fontStyle: 'bold' } },
      ])
    }

    const feeFinaleInterno = totals.venduto * feePct / 100
    riepilogoBody.push([
      { content: `SIMMETRIA Fee (${feePct}%)`, styles: { fontStyle: 'italic' } },
      { content: fmtN(feeFinaleInterno), styles: {} },
      '', '', '',
    ])
    riepilogoBody.push([
      { content: 'Totale GENERALE', styles: { fontStyle: 'bold' } },
      { content: fmtN(totals.venduto + feeFinaleInterno), styles: { fontStyle: 'bold' } },
      '', '', '',
    ])

    autoTable(doc, {
      startY: startY + 4,
      head: [['RIEPILOGO DEI SERVIZI (netto IVA)', 'Venduto netto', 'Costi netto', 'Fee', 'Margine']],
      body: riepilogoBody as string[][],
      theme: 'grid',
      headStyles: { fillColor: [208, 0, 58], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    })

    startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
    const totaleGeneraleInterno = totals.venduto + feeFinaleInterno
    const acconto30Interno = totaleGeneraleInterno * 0.3
    const saldo70Interno = totaleGeneraleInterno * 0.7
    doc.setFontSize(7.5)
    doc.setTextColor(80)
    doc.text('Tutti i costi si intendono IVA 22% non inclusa.', 14, startY)
    doc.text('Si intendono escluse le spese extra impreviste e non conteggiate.', 14, startY + 4)
    if (paxCount > 0) doc.text(`Tutti i servizi sono offerti per un minimo garantito di ${paxCount} persone.`, 14, startY + 8)
    const footerOffset = paxCount > 0 ? 16 : 12
    doc.setFontSize(8)
    doc.setTextColor(0)
    doc.text('Condizioni di pagamento:', 14, startY + footerOffset)
    doc.setFontSize(7.5)
    doc.setTextColor(80)
    doc.text(`> acconto 30% all\u2019ordine: \u20AC ${fmtN(acconto30Interno)}`, 14, startY + footerOffset + 5)
    doc.text(`> saldo ed eventuali extra a 60 gg data fattura fine evento: \u20AC ${fmtN(saldo70Interno)}`, 14, startY + footerOffset + 10)
    const sigY = startY + footerOffset + 20
    const todayStr = fmtDateCentral(new Date().toISOString())
    doc.setFontSize(8)
    doc.setTextColor(0)
    doc.text(`Roma, ${todayStr}`, 14, sigY)
    if (responsabileName) {
      doc.text(responsabileName, 14, sigY + 5)
      doc.text('Partner', 14, sigY + 10)
    }
    doc.setFontSize(7)
    doc.setTextColor(100)
    doc.text('Simmetria Immagine e Comunicazione Srl', 250, sigY, { align: 'right' })
    doc.text('Viale Egeo 8, 00144 Roma', 250, sigY + 4, { align: 'right' })
    doc.text('PI/CF: 03856751007 - SDI: M5UXCR1', 250, sigY + 8, { align: 'right' })

    const filename = `${sanitizeFilename(evName)}_${sanitizeFilename(clientName)}_Budget_Interno.pdf`
    doc.save(filename)
  }

  // ═══════════════════════════════════════════════════════════
  // PDF CLIENTE
  // ═══════════════════════════════════════════════════════════
  async function exportPdfCliente() {
    const doc = new jsPDF()
    const evName = event.nome || 'Evento'
    const clientName = getClientName()
    const exportGroups = getExportGroups()
    const paxCount = event.partecipanti ?? 0
    let responsabileName = ''
    if (event.responsabile) {
      const p = await fetchProfile(event.responsabile)
      if (p) responsabileName = [p.first_name, p.last_name].filter(Boolean).join(' ')
    }

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text('Simmetria Immagine e Comunicazione Srl', 196, 10, { align: 'right' })
    doc.text('Viale Egeo 8 | 00144 Roma', 196, 14, { align: 'right' })

    doc.setFontSize(14)
    doc.setTextColor(208, 0, 58)
    doc.text(evName.toUpperCase(), 14, 20)

    doc.setFontSize(9)
    doc.setTextColor(80)
    let hdrY = 28
    if (clientName) { doc.text(`Cliente: ${clientName}`, 14, hdrY); hdrY += 6 }
    if (paxCount > 0) { doc.text(`${paxCount} partecipanti`, 14, hdrY); hdrY += 6 }
    doc.text(`Preventivo al ${fmtDateCentral(new Date().toISOString())}`, 14, hdrY)

    let startY = hdrY + 6

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
    const clientTotal = lines.reduce((s, l) => s + l.venduto, 0)
    const feeCliente = clientTotal * feePct / 100
    const totaleGeneraleCliente = clientTotal + feeCliente
    riepilogoBody.push([
      { content: 'Sub-total (Venduto Servizi)', styles: { fontStyle: 'bold' } },
      { content: `\u20AC ${fmtN(clientTotal)}`, styles: { fontStyle: 'bold' } },
    ])
    riepilogoBody.push([
      { content: `SIMMETRIA Fee (${feePct}%)`, styles: { fontStyle: 'italic' } },
      { content: `\u20AC ${fmtN(feeCliente)}`, styles: {} },
    ])
    riepilogoBody.push([
      { content: 'Totale GENERALE', styles: { fontStyle: 'bold' } },
      { content: `\u20AC ${fmtN(totaleGeneraleCliente)}`, styles: { fontStyle: 'bold' } },
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
    const acconto30C = totaleGeneraleCliente * 0.3
    const saldo70C = totaleGeneraleCliente * 0.7
    doc.setFontSize(7.5)
    doc.setTextColor(80)
    doc.text('Tutti i costi si intendono IVA 22% non inclusa.', 14, startY)
    doc.text('Si intendono escluse le spese extra impreviste e non conteggiate.', 14, startY + 4)
    if (paxCount > 0) doc.text(`Tutti i servizi sono offerti per un minimo garantito di ${paxCount} persone.`, 14, startY + 8)
    const footOffC = paxCount > 0 ? 16 : 12
    doc.setFontSize(8)
    doc.setTextColor(0)
    doc.text('Condizioni di pagamento:', 14, startY + footOffC)
    doc.setFontSize(7.5)
    doc.setTextColor(80)
    doc.text(`> acconto 30% all\u2019ordine: \u20AC ${fmtN(acconto30C)}`, 14, startY + footOffC + 5)
    doc.text(`> saldo ed eventuali extra a 60 gg data fattura fine evento: \u20AC ${fmtN(saldo70C)}`, 14, startY + footOffC + 10)
    const sigYC = startY + footOffC + 20
    const todayC = fmtDateCentral(new Date().toISOString())
    doc.setFontSize(8)
    doc.setTextColor(0)
    doc.text(`Roma, ${todayC}`, 14, sigYC)
    if (responsabileName) {
      doc.text(responsabileName, 14, sigYC + 5)
      doc.text('Partner', 14, sigYC + 10)
    }
    doc.setFontSize(7)
    doc.setTextColor(100)
    doc.text('Simmetria Immagine e Comunicazione Srl', 196, sigYC, { align: 'right' })
    doc.text('Viale Egeo 8, 00144 Roma', 196, sigYC + 4, { align: 'right' })
    doc.text('PI/CF: 03856751007 - SDI: M5UXCR1', 196, sigYC + 8, { align: 'right' })

    const filename = `${sanitizeFilename(evName)}_${sanitizeFilename(clientName)}_Budget_Cliente.pdf`
    doc.save(filename)
  }

  // ═══════════════════════════════════════════════════════════
  // EXCEL INTERNO
  // ═══════════════════════════════════════════════════════════
  async function exportExcelInterno() {
    const evName = event.nome || 'Evento'
    const clientName = getClientName()
    const exportGroups = getExportGroups()
    const paxCount = event.partecipanti ?? 0
    let responsabileName = ''
    if (event.responsabile) {
      const p = await fetchProfile(event.responsabile)
      if (p) responsabileName = [p.first_name, p.last_name].filter(Boolean).join(' ')
    }

    const rows: (string | number | null)[][] = []
    rows.push(['Simmetria Immagine e Comunicazione Srl'])
    rows.push(['Viale Egeo 8 | 00144 Roma'])
    rows.push([])
    rows.push([evName.toUpperCase()])
    if (clientName) rows.push([`Cliente: ${clientName}`])
    if (paxCount > 0) rows.push([`${paxCount} partecipanti`])
    rows.push([`Preventivo al ${fmtDateCentral(new Date().toISOString())}`])
    rows.push([])
    rows.push([])

    const header = ['DESCRIZIONE', 'FORNITORE', 'STATO', 'Qty', 'Prezzo Unit. Venduto', 'Totale Venduto', 'Qty', 'Costo Unit.', 'Totale Costo', 'Margine', 'Margine %']

    for (const cat of exportGroups) {
      rows.push([cat.label, '', '', '', '', '', '', '', '', '', ''])
      rows.push(header)
      for (const item of cat.items) {
        const itemFee = item.vendutoNetto * feePct / 100
        const itemRicavi = item.vendutoNetto + itemFee + item.commissione
        const itemMargine = itemRicavi - item.costoNetto
        const itemMp = itemRicavi > 0 ? ((itemMargine / itemRicavi) * 100) : 0
        const statoLabel = STATO_CONFIG[item.stato_conferma].label
        const vendutoUnit = item.qty > 0 ? item.vendutoNetto / item.qty : item.vendutoNetto
        const costoUnit = item.qty > 0 ? item.costoNetto / item.qty : item.costoNetto
        rows.push([item.descrizione, item.fornitore || '', statoLabel, item.qty, vendutoUnit, item.vendutoNetto, item.qty, costoUnit, item.costoNetto, itemMargine, itemMp / 100])
      }
      const catV = cat.items.reduce((s, i) => s + i.vendutoNetto, 0)
      const catC = cat.items.reduce((s, i) => s + i.costoNetto, 0)
      const catComm = cat.items.reduce((s, i) => s + i.commissione, 0)
      const catFee = catV * feePct / 100
      const catRicavi = catV + catFee + catComm
      const catM = catRicavi - catC
      const catMp = catRicavi > 0 ? catM / catRicavi : 0
      rows.push([`Totale ${cat.label}`, '', '', '', '', catV, '', '', catC, catM, catMp])
      rows.push([])
    }

    rows.push([])
    rows.push(['RIEPILOGO (netto IVA)', '', '', '', '', 'VENDUTO', '', '', 'COSTI', 'MARGINE', ''])
    for (const cat of exportGroups) {
      const cv = cat.items.reduce((s, i) => s + i.vendutoNetto, 0)
      const cc = cat.items.reduce((s, i) => s + i.costoNetto, 0)
      const catComm = cat.items.reduce((s, i) => s + i.commissione, 0)
      const cf = cv * feePct / 100
      const cm = cv + cf + catComm - cc
      rows.push([cat.label, '', '', '', '', cv, '', '', cc, cm, ''])
    }
    rows.push(['Sub-total (Venduto Servizi)', '', '', '', '', totals.venduto, '', '', totals.costo, totals.margine, totals.marginePct / 100])
    const feeFinale = totals.venduto * feePct / 100
    rows.push([`SIMMETRIA Fee (${feePct}%)`, '', '', '', '', feeFinale, '', '', '', '', ''])
    rows.push(['Totale GENERALE', '', '', '', '', totals.venduto + feeFinale, '', '', '', '', ''])
    if (totals.commissioni > 0) {
      rows.push(['COMMISSIONI (interno)', '', '', '', '', '', '', '', '', totals.commissioni, ''])
    }
    rows.push([])
    const totGenInt = totals.venduto + totals.venduto * feePct / 100
    const acc30Int = totGenInt * 0.3
    const sal70Int = totGenInt * 0.7
    rows.push(['Tutti i costi si intendono IVA 22% non inclusa.'])
    rows.push(['Si intendono escluse le spese extra impreviste e non conteggiate.'])
    if (paxCount > 0) rows.push([`Tutti i servizi sono offerti per un minimo garantito di ${paxCount} persone.`])
    rows.push([])
    rows.push(['Condizioni di pagamento:'])
    rows.push([`> acconto 30% all\u2019ordine: \u20AC ${fmtN(acc30Int)}`])
    rows.push([`> saldo ed eventuali extra a 60 gg data fattura fine evento: \u20AC ${fmtN(sal70Int)}`])
    rows.push([])
    const todayInt = fmtDateCentral(new Date().toISOString())
    rows.push([`Roma, ${todayInt}`, '', '', '', '', '', '', '', '', '', ''])
    if (responsabileName) rows.push([responsabileName, '', '', '', '', '', '', '', '', 'Simmetria Immagine e Comunicazione Srl', ''])
    if (responsabileName) rows.push(['Partner', '', '', '', '', '', '', '', '', 'Viale Egeo 8, 00144 Roma', ''])
    if (!responsabileName) rows.push(['', '', '', '', '', '', '', '', '', 'Simmetria Immagine e Comunicazione Srl', ''])
    if (!responsabileName) rows.push(['', '', '', '', '', '', '', '', '', 'Viale Egeo 8, 00144 Roma', ''])
    rows.push(['', '', '', '', '', '', '', '', '', 'PI/CF: 03856751007 - SDI: M5UXCR1', ''])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Budget Interno')
    const filename = `${sanitizeFilename(evName)}_${sanitizeFilename(clientName)}_Budget_Interno.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // ═══════════════════════════════════════════════════════════
  // EXCEL CLIENTE
  // ═══════════════════════════════════════════════════════════
  async function exportExcelCliente() {
    const evName = event.nome || 'Evento'
    const clientName = getClientName()
    const exportGroups = getExportGroups()
    const paxCount = event.partecipanti ?? 0
    let responsabileName = ''
    if (event.responsabile) {
      const p = await fetchProfile(event.responsabile)
      if (p) responsabileName = [p.first_name, p.last_name].filter(Boolean).join(' ')
    }

    const rows: (string | number | null)[][] = []
    rows.push(['Simmetria Immagine e Comunicazione Srl'])
    rows.push(['Viale Egeo 8 | 00144 Roma'])
    rows.push([])
    rows.push([evName.toUpperCase()])
    if (clientName) rows.push([`Cliente: ${clientName}`])
    if (paxCount > 0) rows.push([`${paxCount} partecipanti`])
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
    const clientTotalXls = lines.reduce((s, l) => s + l.venduto, 0)
    const feeClienteXls = clientTotalXls * feePct / 100
    const totGenClienteXls = clientTotalXls + feeClienteXls
    rows.push(['Sub-total (Venduto Servizi)', '', '', '', clientTotalXls])
    rows.push([`SIMMETRIA Fee (${feePct}%)`, '', '', '', feeClienteXls])
    rows.push(['Totale GENERALE', '', '', '', totGenClienteXls])
    rows.push([])
    const acc30Xls = totGenClienteXls * 0.3
    const sal70Xls = totGenClienteXls * 0.7
    rows.push(['Tutti i costi si intendono IVA 22% non inclusa.'])
    rows.push(['Si intendono escluse le spese extra impreviste e non conteggiate.'])
    if (paxCount > 0) rows.push([`Tutti i servizi sono offerti per un minimo garantito di ${paxCount} persone.`])
    rows.push([])
    rows.push(['Condizioni di pagamento:'])
    rows.push([`> acconto 30% all\u2019ordine: \u20AC ${fmtN(acc30Xls)}`])
    rows.push([`> saldo ed eventuali extra a 60 gg data fattura fine evento: \u20AC ${fmtN(sal70Xls)}`])
    rows.push([])
    const todayXls = fmtDateCentral(new Date().toISOString())
    rows.push([`Roma, ${todayXls}`, '', '', '', ''])
    if (responsabileName) rows.push([responsabileName, '', '', 'Simmetria Immagine e Comunicazione Srl', ''])
    if (responsabileName) rows.push(['Partner', '', '', 'Viale Egeo 8, 00144 Roma', ''])
    if (!responsabileName) rows.push(['', '', '', 'Simmetria Immagine e Comunicazione Srl', ''])
    if (!responsabileName) rows.push(['', '', '', 'Viale Egeo 8, 00144 Roma', ''])
    rows.push(['', '', '', 'PI/CF: 03856751007 - SDI: M5UXCR1', ''])

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

  const pendingNewLineRef = useRef<string | null>(null)

  useEffect(() => {
    if (pendingNewLineRef.current) {
      const found = lines.find(l => l.id === pendingNewLineRef.current)
      if (found && isSupportedTable(found.table)) startInlineEdit(found)
      pendingNewLineRef.current = null
    }
  }, [lines])

  async function handleAddLine(catLabel: string, supplierId: string, table: string) {
    setAddingLine(catLabel)
    setAddLineDropdown(null)
    try {
      const result = await createMinimalLine(table, event.id, supplierId, activeVersion)
      if (!result) {
        showToast('Impossibile creare la voce', 'error')
        setAddingLine(null)
        return
      }
      pendingNewLineRef.current = result.id
      await loadData()
    } catch {
      showToast('Errore nella creazione della voce', 'error')
    }
    setAddingLine(null)
  }

  function renderAddLineButton(cat: { label: string; items: BudgetLine[] }) {
    const pairs = new Map<string, { supplierId: string; table: string; supplierName: string }>()
    for (const item of cat.items) {
      if (!item.supplierId) continue
      const key = `${item.supplierId}::${item.table}`
      if (!pairs.has(key)) pairs.set(key, { supplierId: item.supplierId, table: item.table, supplierName: item.fornitore || 'Fornitore' })
    }
    if (pairs.size === 0) return null
    const isAdding = addingLine === cat.label
    const entries = Array.from(pairs.values())

    if (entries.length === 1) {
      const { supplierId, table } = entries[0]
      return (
        <div className="px-4 py-2" style={{ borderTop: '1px solid var(--line)' }}>
          <button
            disabled={isAdding}
            onClick={() => handleAddLine(cat.label, supplierId, table)}
            className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-40"
            style={{ color: 'var(--accent)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            {isAdding ? 'Creazione...' : '+ Nuova voce'}
          </button>
        </div>
      )
    }

    return (
      <div className="px-4 py-2 relative" style={{ borderTop: '1px solid var(--line)' }}>
        <button
          disabled={isAdding}
          onClick={() => setAddLineDropdown(prev => prev === cat.label ? null : cat.label)}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-40"
          style={{ color: 'var(--accent)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          {isAdding ? 'Creazione...' : '+ Nuova voce'}
        </button>
        {addLineDropdown === cat.label && (
          <div className="absolute left-4 mt-1 z-30 rounded-lg shadow-lg py-1 min-w-[180px]" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
            {entries.map(({ supplierId, table, supplierName }) => (
              <button
                key={`${supplierId}-${table}`}
                onClick={() => handleAddLine(cat.label, supplierId, table)}
                className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 transition-colors"
                style={{ color: 'var(--text)' }}
              >
                {supplierName}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderBudgetLine(item: BudgetLine) {
    const isExpanded = expandedId === item.id
    const statoConf = STATO_CONFIG[item.stato_conferma]
    const Icon = statoConf.icon
    const isInlineEditing = inlineEdit?.id === item.id
    const canInlineEdit = isSupportedTable(item.table)

    if (isInlineEditing && inlineEdit) {
      const preview = getInlinePreview(inlineEdit.data)
      const hasSupplier = hasSupplierField(item.table)
      const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); commitInlineEdit() }
        if (e.key === 'Escape') { e.preventDefault(); cancelInlineEdit() }
      }
      const inputCls = "bg-transparent border rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1"
      const inputStyle = { color: 'var(--text)', borderColor: 'var(--line)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties
      return (
        <div key={item.id} ref={inlineRowRef} className="group relative" style={{ borderBottom: '1px solid var(--line)', background: 'rgba(255,255,255,0.02)' }} onBlur={handleInlineBlur} onFocus={handleInlineFocus}>
          <div className="w-full text-left pl-4 pr-11 md:px-4 py-2 flex items-center gap-3">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${isExpanded ? '' : '-rotate-90'}`} style={{ color: 'var(--muted)' }} />
            <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: statoConf.color }} />
            <div className="flex-1 min-w-0">
              <input
                autoFocus
                className={inputCls + " w-full font-medium"}
                style={inputStyle}
                value={inlineEdit.data.descrizione}
                onChange={e => updateInlineField('descrizione', e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Descrizione"
              />
              {item.dateLabel && <span className="text-[10px] truncate block mt-0.5" style={{ color: 'var(--muted)' }}>{item.dateLabel}</span>}
            </div>
            {hasSupplier ? (
              <select
                className={inputCls + " w-24 hidden md:block"}
                style={inputStyle}
                value={inlineEdit.data.supplierId}
                onChange={e => updateInlineField('supplierId', e.target.value)}
                onKeyDown={onKeyDown}
              >
                <option value="">-</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            ) : (
              <span className="w-32 text-xs truncate hidden md:block" style={{ color: 'var(--muted)' }} title={item.fornitore || undefined}>{item.fornitore || '-'}</span>
            )}
            <input
              className={inputCls + " w-10 text-right"}
              style={inputStyle}
              type="number"
              min={0}
              value={inlineEdit.data.quantita}
              onChange={e => updateInlineField('quantita', parseFloat(e.target.value) || 0)}
              onKeyDown={onKeyDown}
            />
            <input
              className={inputCls + " w-20 text-right"}
              style={inputStyle}
              type="number"
              step="0.01"
              value={inlineEdit.data.vendutoTotale}
              onChange={e => updateInlineField('vendutoTotale', parseFloat(e.target.value) || 0)}
              onKeyDown={onKeyDown}
            />
            <input
              className={inputCls + " w-20 text-right"}
              style={{ ...inputStyle, color: 'var(--yellow)' }}
              type="number"
              step="0.01"
              value={inlineEdit.data.costoTotale}
              onChange={e => updateInlineField('costoTotale', parseFloat(e.target.value) || 0)}
              onKeyDown={onKeyDown}
            />
            {item.commissione_pct != null && item.commissione_pct > 0 ? (
              <span className="w-14 text-[10px] text-right" style={{ color: 'var(--green)' }}>+{item.commissione_pct}%</span>
            ) : (
              <span className="w-14" />
            )}
            <span className="w-20 text-xs text-right font-medium" style={{ color: preview.margine >= 0 ? 'var(--green)' : 'var(--red2)', opacity: 0.75 }} title="Anteprima non salvata">
              {fmt(preview.margine)} <span className="text-[8px]">{'\u2022'}</span>
            </span>
            <span className="w-10 text-xs text-right font-medium" style={{ color: preview.marginePct >= margineTarget ? 'var(--green)' : preview.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)', opacity: 0.75 }} title="Anteprima non salvata">
              {preview.marginePct.toFixed(0)}% <span className="text-[8px]">{'\u2022'}</span>
            </span>
          </div>
          {inlineError && (
            <p className="text-[11px] px-4 pb-1.5" style={{ color: 'var(--red2)' }}>{inlineError}</p>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setEditingLine({ id: item.id, table: item.table, categoria: item.categoria }) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 md:p-1 md:top-2.5 md:translate-y-0 rounded transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-white/10"
            style={{ background: 'var(--panel2)' }}
            title="Modifica voce economica"
          >
            <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
          </button>
        </div>
      )
    }

    return (
      <div key={item.id} className="group relative" style={{ borderBottom: '1px solid var(--line)' }}>
        <button
          className="w-full text-left pl-4 pr-11 md:px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
          onClick={() => setExpandedId(isExpanded ? null : item.id)}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${isExpanded ? '' : '-rotate-90'}`} style={{ color: 'var(--muted)' }} />
          <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: statoConf.color }} />
          <div className="flex-1 min-w-0">
            <span
              className={`text-xs font-medium truncate block${canInlineEdit ? ' editable-field' : ''}`}
              style={{ color: 'var(--text)', cursor: canInlineEdit ? 'text' : undefined }}
              onClick={canInlineEdit ? (e) => { e.stopPropagation(); startInlineEdit(item) } : undefined}
              title={canInlineEdit ? 'Clicca per modificare inline' : undefined}
            >{item.descrizione || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Descrizione...</span>}</span>
            {item.dateLabel && <span className="text-[10px] truncate block" style={{ color: 'var(--muted)' }}>{item.dateLabel}</span>}
          </div>
          <span className={`w-32 text-xs truncate hidden md:block${canInlineEdit ? ' editable-field' : ''}`} style={{ color: 'var(--muted)', cursor: canInlineEdit ? 'text' : undefined }} onClick={canInlineEdit ? (e) => { e.stopPropagation(); startInlineEdit(item) } : undefined} title={canInlineEdit ? 'Clicca per modificare inline' : (item.fornitore || undefined)}>{item.fornitore || '-'}</span>
          <span className={`w-10 text-xs text-right${canInlineEdit ? ' editable-field' : ''}`} style={{ color: 'var(--text)', cursor: canInlineEdit ? 'text' : undefined }} onClick={canInlineEdit ? (e) => { e.stopPropagation(); startInlineEdit(item) } : undefined} title={canInlineEdit ? 'Clicca per modificare inline' : undefined}>{item.qty}</span>
          <span className={`w-20 text-xs text-right${canInlineEdit ? ' editable-field' : ''}`} style={{ color: 'var(--text)', cursor: canInlineEdit ? 'text' : undefined }} onClick={canInlineEdit ? (e) => { e.stopPropagation(); startInlineEdit(item) } : undefined} title={canInlineEdit ? 'Clicca per modificare inline' : undefined}>{fmt(item.venduto)}</span>
          <span className={`w-20 text-xs text-right${canInlineEdit ? ' editable-field' : ''}`} style={{ color: 'var(--yellow)', cursor: canInlineEdit ? 'text' : undefined }} onClick={canInlineEdit ? (e) => { e.stopPropagation(); startInlineEdit(item) } : undefined} title={canInlineEdit ? 'Clicca per modificare inline' : undefined}>{fmt(item.costo)}</span>
          {item.commissione_pct != null && item.commissione_pct > 0 && (
            <span className="w-14 text-[10px] text-right" style={{ color: 'var(--green)' }} title="Commissione hotel sul costo">+{item.commissione_pct}%</span>
          )}
          {(item.commissione_pct == null || item.commissione_pct <= 0) && (
            <span className="w-14" />
          )}
          <span className="w-20 text-xs text-right font-medium" style={{ color: item.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(item.margine)}</span>
          <span className="w-10 text-xs text-right font-medium" style={{ color: item.marginePct >= margineTarget ? 'var(--green)' : item.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }}>{item.marginePct.toFixed(0)}%</span>
        </button>
        {isSupportedTable(item.table) && (
          <button
            onClick={(e) => { e.stopPropagation(); setEditingLine({ id: item.id, table: item.table, categoria: item.categoria }) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 md:p-1 md:top-2.5 md:translate-y-0 rounded transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-white/10"
            style={{ background: 'var(--panel2)' }}
            title="Modifica voce economica"
          >
            <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
          </button>
        )}
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
              <Detail label="Venduto netto" value={fmt(item.vendutoNetto)} />
              <Detail label="Costo netto" value={fmt(item.costoNetto)} />
              {item.commissione_pct != null && item.commissione_pct > 0 && (
                <Detail label="Commissione" value={`${item.commissione_pct}% sul costo netto = ${fmt(item.commissione)}`} />
              )}
              <Detail label="Margine" value={fmt(item.margine)} />
              <Detail label="Margine %" value={`${item.marginePct.toFixed(1)}%`} />
            </div>
            {item.stato_conferma === 'richiesto' && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,194,75,0.08)', border: '1px solid rgba(255,194,75,0.2)' }}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
                  <span style={{ color: 'var(--yellow)' }}>Costo stimato - fornitore non confermato.</span>
                </div>
                {isSupportedTable(item.table) && (
                  <button
                    onClick={() => setEditingLine({ id: item.id, table: item.table, categoria: item.categoria })}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    <Pencil className="w-3 h-3" /> Modifica
                  </button>
                )}
              </div>
            )}
            {item.stato_conferma !== 'richiesto' && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(56,210,125,0.06)', border: '1px solid rgba(56,210,125,0.15)' }}>
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                  <span style={{ color: 'var(--muted)' }}>Costo confermato.</span>
                </div>
                {isSupportedTable(item.table) && (
                  <button
                    onClick={() => setEditingLine({ id: item.id, table: item.table, categoria: item.categoria })}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    <Pencil className="w-3 h-3" /> Modifica
                  </button>
                )}
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
          <div style={{ background: 'var(--panel2)', borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                    <button onClick={() => approveVersion(v.id)} disabled={cloning}
                      style={{ padding: '5px 12px', borderRadius: 8, cursor: cloning ? 'not-allowed' : 'pointer', border: '1px solid var(--green)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', opacity: cloning ? 0.5 : 1 }}>
                      Approva
                    </button>
                  )}
                  {v.stato === 'approvato' && !versions.some(x => x.tipo === 'consuntivo' && x.source_version_id === v.id) && (
                    <button onClick={() => createConsuntivo(v.id)} disabled={cloning}
                      style={{ padding: '5px 12px', borderRadius: 8, cursor: cloning ? 'not-allowed' : 'pointer', border: '1px solid var(--blue)', background: 'rgba(58,123,213,0.08)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--blue)', opacity: cloning ? 0.5 : 1 }}>
                      {cloning ? 'Clonazione...' : 'Crea consuntivo'}
                    </button>
                  )}
                  <button onClick={() => duplicateVersion(v.id)} disabled={cloning}
                    style={{ padding: '5px 12px', borderRadius: 8, cursor: cloning ? 'not-allowed' : 'pointer', border: '1px solid var(--line)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', opacity: cloning ? 0.5 : 1 }}>
                    {cloning ? 'Clonazione...' : 'Duplica'}
                  </button>
                </>
              )}
            </div>

            {/* ── Allegati versione ── */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <input ref={fileInputRef} type="file" accept="application/pdf,image/*" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadVersionDoc(f); e.target.value = '' }} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.5 : 1 }}>
                <Paperclip className="w-3 h-3" /> {uploading ? 'Upload...' : '+ Allega documento'}
              </button>

              {docsLoading && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>Caricamento...</span>}

              {versionDocs.map(doc => (
                <div key={doc.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: 'var(--panel)', border: '1px solid var(--line)', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text)', maxWidth: 260 }}>
                  <FileText className="w-3 h-3 shrink-0" style={{ color: 'var(--muted)' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={doc.file_name}>{doc.file_name}</span>
                  <button onClick={() => downloadVersionDoc(doc.storage_path)} title="Scarica"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--blue)', display: 'flex' }}>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button onClick={() => deleteVersionDoc(doc)} title="Elimina"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--red2)', display: 'flex' }}>
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
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
            <Kpi label="Sub-total (Venduto Servizi)" value={fmt(totals.venduto)} color="var(--text)" />
            <Kpi label="Totale GENERALE" value={fmt(totals.venduto + (totals.venduto * feePct / 100))} color="var(--text)" />
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
              <Kpi label="Commissioni" value={fmt(totals.commissioni)} color="var(--green)" />
            )}
            <Kpi label="Totale Ricavi" value={fmt(totals.ricavi)} color="var(--text)" />
          </div>
          <p className="text-[10px] text-right" style={{ color: 'var(--muted)' }}>Importi economici al netto IVA</p>
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
            const catV = cat.items.reduce((s, i) => s + i.vendutoNetto, 0)
            const catC = cat.items.reduce((s, i) => s + i.costoNetto, 0)
            const catComm = cat.items.reduce((s, i) => s + i.commissione, 0)
            const catFee = catV * feePct / 100
            const catRicavi = catV + catFee + catComm
            const catM = catRicavi - catC
            const catMp = catRicavi > 0 ? (catM / catRicavi) * 100 : 0
            const catStimati = cat.items.filter(i => i.stato_conferma === 'richiesto').length
            const isUnderTarget = catMp < margineTarget && catMp >= 0

            return (
              <div key={cat.label} className="panel overflow-hidden" style={{ border: isUnderTarget ? '1px solid rgba(255,194,75,0.3)' : undefined }}>
                {/* Category header */}
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--panel2)' }}>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold tracking-wide" style={{ color: 'var(--text)' }}>{getExportLabel(cat.label)}</p>
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
                  <span className="w-14" />
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
                {renderAddLineButton(cat)}
              </div>
            )
          })}
        </div>
      )}

      {/* Grand total */}
      {lines.length > 0 && (
        <div className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs px-2">
            <span className="font-bold tracking-wide" style={{ color: 'var(--text)' }}>Sub-total (Venduto Servizi)</span>
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
          <p className="text-[10px] text-right mt-1" style={{ color: 'var(--muted)' }}>Importi economici al netto IVA</p>
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

      {/* ══════ EDIT MODAL ══════ */}
      {editingLine && (
        <BudgetLineEditModal
          lineId={editingLine.id}
          table={editingLine.table}
          categoria={editingLine.categoria}
          suppliers={suppliers}
          onClose={() => setEditingLine(null)}
          onSaved={() => {
            setEditingLine(null)
            loadData()
            showToast('Voce economica aggiornata', 'success')
          }}
        />
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
