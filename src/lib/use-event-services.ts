import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

export interface EventSupplierLink {
  id: string
  event_id: string
  supplier_id: string
  service_category: string
  start_date: string | null
  start_time: string | null
  end_date: string | null
  end_time: string | null
  location: string
  operational_notes: string
  stato_conferma: 'richiesto' | 'confermato' | 'contrattualizzato'
  contatto_operativo: string | null
  telefono_operativo: string | null
  email_operativo: string | null
  note_conferma: string
  data_conferma: string | null
}

export interface ServiceTotals {
  venduto: number
  costo: number
  margine: number
  marginePct: number
  count: number
}

export interface SupplierSummary {
  supplierId: string
  category: string
  link: EventSupplierLink
  totals: ServiceTotals
  hasServices: boolean
  hasMissingCosts: boolean
  hasMissingDates: boolean
}

type RawRow = Record<string, unknown>

function calcRowEconomics(row: RawRow, category: string): { venduto: number; costo: number; hasDate: boolean; hasCost: boolean } {
  let venduto = 0
  let costo = 0
  let hasDate = false
  let hasCost = false

  if (category === 'ristorante') {
    const pax = (row.pax_confermati as number) || (row.pax_previsti as number) || 1
    venduto = (row.budget_totale as number) ?? ((row.budget_per_persona as number) ? (row.budget_per_persona as number) * pax : 0)
    costo = (row.costo_totale_reale as number) ?? ((row.costo_per_persona as number) ? (row.costo_per_persona as number) * pax : 0)
    hasDate = !!(row.data && row.ora_inizio)
  } else if (category === 'catering' || category === 'experience') {
    const pax = (row.pax as number) || 1
    venduto = (row.venduto_totale as number) ?? ((row.venduto_unitario as number) || (row.venduto_per_persona as number) ? ((row.venduto_unitario as number) || (row.venduto_per_persona as number) || 0) * pax : 0)
    costo = (row.costo_totale as number) ?? ((row.costo_unitario as number) || (row.costo_per_persona as number) ? ((row.costo_unitario as number) || (row.costo_per_persona as number) || 0) * pax : 0)
    hasDate = !!(row.data && (row.ora_inizio || row.ora))
  } else if (category === 'staff_interno') {
    venduto = (row.venduto_totale as number) || 0
    costo = (row.costo_totale as number) ?? ((row.costo_giornaliero as number) || 0)
    hasDate = !!(row.data && row.ora_inizio)
  } else {
    const qty = (row.quantita as number) || 1
    venduto = (row.venduto_totale as number) ?? ((row.venduto_unitario as number) ? (row.venduto_unitario as number) * qty : 0)
    costo = (row.costo_totale as number) ?? ((row.costo_unitario as number) ? (row.costo_unitario as number) * qty : 0)
    hasDate = !!(row.data && row.ora_inizio)
    if (category === 'hotel') {
      hasDate = !!(row.check_in_date || (row.data && row.ora_inizio))
    }
  }

  hasCost = costo > 0 || venduto > 0

  return { venduto, costo, hasDate, hasCost }
}

export const SERVICE_TABLE_MAP: Record<string, string> = {
  hotel: 'event_hotel_details',
  transfer: 'event_supplier_services',
  ristorante: 'event_restaurant_details',
  experience: 'event_experience_details',
  catering: 'event_catering_details',
  audio_video: 'event_audio_video_details',
  allestimenti: 'event_allestimenti_details',
  staff_interno: 'event_staff_interno_details',
  staff_esterno: 'event_staff_esterno_details',
  grafica_stampa: 'event_grafica_stampa_details',
  varie: 'event_varie_details',
}

export function useEventServices(eventId: string) {
  const [links, setLinks] = useState<EventSupplierLink[]>([])
  const [servicesBySupplier, setServicesBySupplier] = useState<Record<string, RawRow[]>>({})
  const [summaries, setSummaries] = useState<SupplierSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [totalEvent, setTotalEvent] = useState<ServiceTotals>({ venduto: 0, costo: 0, margine: 0, marginePct: 0, count: 0 })

  const reload = useCallback(async () => {
    setLoading(true)

    const [linksRes, svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
      supabase.from('event_suppliers').select('*').eq('event_id', eventId),
      supabase.from('event_supplier_services').select('*').eq('event_id', eventId),
      supabase.from('event_hotel_details').select('*').eq('event_id', eventId),
      supabase.from('event_restaurant_details').select('*').eq('event_id', eventId),
      supabase.from('event_experience_details').select('*').eq('event_id', eventId),
      supabase.from('event_catering_details').select('*').eq('event_id', eventId),
      supabase.from('event_staff_interno_details').select('*').eq('event_id', eventId),
      supabase.from('event_staff_esterno_details').select('*').eq('event_id', eventId),
      supabase.from('event_varie_details').select('*').eq('event_id', eventId),
      supabase.from('event_audio_video_details').select('*').eq('event_id', eventId),
      supabase.from('event_allestimenti_details').select('*').eq('event_id', eventId),
      supabase.from('event_grafica_stampa_details').select('*').eq('event_id', eventId),
    ])

    const rawLinks = (linksRes.data ?? []) as EventSupplierLink[]
    setLinks(rawLinks)

    const allServices: Record<string, RawRow[]> = {}
    const serviceData: Record<string, { category: string; rows: RawRow[] }> = {}

    const catToRows: Record<string, RawRow[]> = {
      transfer: (svcRes.data ?? []) as RawRow[],
      hotel: (hotelRes.data ?? []) as RawRow[],
      ristorante: (restRes.data ?? []) as RawRow[],
      experience: (expRes.data ?? []) as RawRow[],
      catering: (catRes.data ?? []) as RawRow[],
      staff_interno: (staffIntRes.data ?? []) as RawRow[],
      staff_esterno: (staffExtRes.data ?? []) as RawRow[],
      varie: (varieRes.data ?? []) as RawRow[],
      audio_video: (avRes.data ?? []) as RawRow[],
      allestimenti: (allestRes.data ?? []) as RawRow[],
      grafica_stampa: (graficaRes.data ?? []) as RawRow[],
    }

    // Group services by supplier_id
    for (const [cat, rows] of Object.entries(catToRows)) {
      for (const row of rows) {
        const sid = (row.supplier_id as string) || (row.profile_id as string) || '__unlinked__'
        if (!allServices[sid]) allServices[sid] = []
        allServices[sid].push(row)

        if (!serviceData[sid]) serviceData[sid] = { category: cat, rows: [] }
        serviceData[sid].rows.push(row)
      }
    }

    setServicesBySupplier(allServices)

    // Build summaries per linked supplier
    let totalVenduto = 0
    let totalCosto = 0
    let totalCount = 0

    const sums: SupplierSummary[] = rawLinks.map(link => {
      const rows = allServices[link.supplier_id] ?? []
      let venduto = 0
      let costo = 0
      let hasMissingCosts = false
      let hasMissingDates = false

      for (const row of rows) {
        const econ = calcRowEconomics(row, link.service_category)
        venduto += econ.venduto
        costo += econ.costo
        if (!econ.hasCost) hasMissingCosts = true
        if (!econ.hasDate) hasMissingDates = true
      }

      totalVenduto += venduto
      totalCosto += costo
      totalCount += rows.length

      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0

      return {
        supplierId: link.supplier_id,
        category: link.service_category,
        link,
        totals: { venduto, costo, margine, marginePct, count: rows.length },
        hasServices: rows.length > 0,
        hasMissingCosts,
        hasMissingDates,
      }
    })

    setSummaries(sums)

    const evMargine = totalVenduto - totalCosto
    setTotalEvent({
      venduto: totalVenduto,
      costo: totalCosto,
      margine: evMargine,
      marginePct: totalVenduto > 0 ? (evMargine / totalVenduto) * 100 : 0,
      count: totalCount,
    })

    setLoading(false)
  }, [eventId])

  useEffect(() => { reload() }, [reload])

  async function updateLinkStatus(linkId: string, stato: EventSupplierLink['stato_conferma'], note?: string) {
    const patch: Record<string, unknown> = { stato_conferma: stato }
    if (stato === 'confermato' || stato === 'contrattualizzato') {
      patch.data_conferma = new Date().toISOString().slice(0, 10)
    }
    if (note !== undefined) patch.note_conferma = note

    const { error } = await supabase.from('event_suppliers').update(patch).eq('id', linkId)
    if (!error) await reload()
    return !error
  }

  async function updateLinkContact(linkId: string, contact: { contatto_operativo?: string; telefono_operativo?: string; email_operativo?: string }) {
    const { error } = await supabase.from('event_suppliers').update(contact).eq('id', linkId)
    if (!error) await reload()
    return !error
  }

  return {
    links,
    summaries,
    servicesBySupplier,
    totalEvent,
    loading,
    reload,
    updateLinkStatus,
    updateLinkContact,
  }
}
