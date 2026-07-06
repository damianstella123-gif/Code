import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { addDaysISO } from './format'
import type { Event } from '../data/events'
import { fetchEvents, resizeEventOnly } from './events-service'

export interface TimelineService {
  id: string
  table: string
  categoria: string
  titolo: string
  data: string
  ora: string | null
  fornitore_id: string | null
  pax: number | null
  venduto: number
  costo: number
  raw: Record<string, any>
}

export interface DayData {
  date: string
  services: TimelineService[]
}

function addDays(dateStr: string, days: number): string {
  return addDaysISO(dateStr, days)
}

function generateDays(start: string, end: string): string[] {
  const days: string[] = []
  let current = start
  while (current <= end) {
    days.push(current)
    current = addDays(current, 1)
  }
  return days
}

function normalizeService(row: Record<string, any>, table: string, categoria: string): TimelineService {
  const id = row.id
  let data = row.data ?? row.check_in_date ?? row.data_montaggio ?? row.data_evento ?? row.data_consegna ?? ''
  let ora = row.ora_inizio ?? row.ora ?? row.check_in_time ?? row.ora_montaggio ?? row.ora_evento ?? null
  let titolo = row.titolo ?? row.tipologia_servizio ?? row.nome_attivita ?? row.tipologia ?? row.descrizione ?? row.tipo_materiale ?? row.ruolo ?? row.risorsa ?? categoria

  let venduto = Number(row.venduto_totale ?? row.ricavo_cliente ?? row.budget_totale ?? 0)
  let costo = Number(row.costo_totale ?? 0)
  let pax = row.pax ?? row.pax_previsti ?? row.quantita ?? row.partecipanti ?? null

  return { id, table, categoria, titolo, data, ora, fornitore_id: row.supplier_id ?? row.profile_id ?? null, pax, venduto, costo, raw: row }
}

function normalizeMultiDateService(row: Record<string, any>, table: string, categoria: string, dateColumns: { col: string; label: string }[]): TimelineService[] {
  const results: TimelineService[] = []
  for (const { col, label } of dateColumns) {
    if (row[col]) {
      const oraCol = col.replace('data_', 'ora_')
      results.push({
        id: `${row.id}__${col}`,
        table,
        categoria,
        titolo: `${row.tipologia_servizio ?? row.descrizione ?? categoria} (${label})`,
        data: row[col],
        ora: row[oraCol] ?? null,
        fornitore_id: row.supplier_id ?? null,
        pax: row.quantita ?? null,
        venduto: 0,
        costo: 0,
        raw: row,
      })
    }
  }
  return results
}

export function useEventTimeline(eventId: string) {
  const [event, setEvent] = useState<Event | null>(null)
  const [days, setDays] = useState<DayData[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)

    const events = await fetchEvents()
    const ev = events.find(e => e.id === eventId)
    if (!ev) { setLoading(false); return }
    setEvent(ev)

    const [
      programRes, transferRes, hotelRes, restRes, expRes, catRes,
      staffIntRes, staffExtRes, avRes, allestRes, graficaRes, varieRes
    ] = await Promise.all([
      supabase.from('event_program').select('*').eq('event_id', eventId),
      supabase.from('event_supplier_services').select('*').eq('event_id', eventId),
      supabase.from('event_hotel_details').select('*').eq('event_id', eventId),
      supabase.from('event_restaurant_details').select('*').eq('event_id', eventId),
      supabase.from('event_experience_details').select('*').eq('event_id', eventId),
      supabase.from('event_catering_details').select('*').eq('event_id', eventId),
      supabase.from('event_staff_interno_details').select('*').eq('event_id', eventId),
      supabase.from('event_staff_esterno_details').select('*').eq('event_id', eventId),
      supabase.from('event_audio_video_details').select('*').eq('event_id', eventId),
      supabase.from('event_allestimenti_details').select('*').eq('event_id', eventId),
      supabase.from('event_grafica_stampa_details').select('*').eq('event_id', eventId),
      supabase.from('event_varie_details').select('*').eq('event_id', eventId),
    ])

    const allServices: TimelineService[] = []

    for (const row of (programRes.data ?? [])) {
      allServices.push(normalizeService(row, 'event_program', 'programma'))
    }
    for (const row of (transferRes.data ?? [])) {
      allServices.push(normalizeService(row, 'event_supplier_services', 'transfer'))
    }
    for (const row of (hotelRes.data ?? [])) {
      allServices.push(normalizeService(row, 'event_hotel_details', 'hotel'))
    }
    for (const row of (restRes.data ?? [])) {
      allServices.push(normalizeService(row, 'event_restaurant_details', 'ristorante'))
    }
    for (const row of (expRes.data ?? [])) {
      allServices.push(normalizeService(row, 'event_experience_details', 'experience'))
    }
    for (const row of (catRes.data ?? [])) {
      allServices.push(normalizeService(row, 'event_catering_details', 'catering'))
    }
    for (const row of (staffIntRes.data ?? [])) {
      allServices.push(normalizeService(row, 'event_staff_interno_details', 'staff_interno'))
    }
    for (const row of (staffExtRes.data ?? [])) {
      allServices.push(normalizeService(row, 'event_staff_esterno_details', 'staff_esterno'))
    }
    for (const row of (avRes.data ?? [])) {
      allServices.push(...normalizeMultiDateService(row, 'event_audio_video_details', 'audio_video', [
        { col: 'data_montaggio', label: 'Montaggio' },
        { col: 'data_prove', label: 'Prove' },
        { col: 'data_evento', label: 'Evento' },
        { col: 'data_smontaggio', label: 'Smontaggio' },
      ]))
    }
    for (const row of (allestRes.data ?? [])) {
      allServices.push(...normalizeMultiDateService(row, 'event_allestimenti_details', 'allestimenti', [
        { col: 'data_montaggio', label: 'Montaggio' },
        { col: 'data_smontaggio', label: 'Smontaggio' },
      ]))
    }
    for (const row of (graficaRes.data ?? [])) {
      allServices.push(normalizeService(row, 'event_grafica_stampa_details', 'grafica_stampa'))
    }
    for (const row of (varieRes.data ?? [])) {
      allServices.push(normalizeService(row, 'event_varie_details', 'varie'))
    }

    const dayStrings = generateDays(ev.dataInizio, ev.dataFine)
    const dayMap = new Map<string, TimelineService[]>()
    for (const d of dayStrings) dayMap.set(d, [])

    for (const svc of allServices) {
      if (!svc.data) continue
      const bucket = dayMap.get(svc.data)
      if (bucket) {
        bucket.push(svc)
      }
    }

    const result: DayData[] = dayStrings.map(date => ({
      date,
      services: (dayMap.get(date) ?? []).sort((a, b) => (a.ora ?? '99:99').localeCompare(b.ora ?? '99:99')),
    }))

    setDays(result)
    setLoading(false)
  }, [eventId])

  useEffect(() => { reload() }, [reload])

  const moveService = useCallback(async (service: TimelineService, newDate: string) => {
    if (service.data === newDate) return

    const realId = service.id.includes('__') ? service.id.split('__')[0] : service.id
    const dateCol = service.id.includes('__') ? service.id.split('__')[1] : getDateColumn(service.table)

    const { error } = await supabase
      .from(service.table)
      .update({ [dateCol]: newDate })
      .eq('id', realId)

    if (error) {
      console.error('moveService error:', error.message)
      return
    }

    await reload()
  }, [reload])

  const addDay = useCallback(async () => {
    if (!event) return
    const newEnd = addDays(event.dataFine, 1)
    await resizeEventOnly(event.id, event.dataInizio, newEnd)
    await reload()
  }, [event, reload])

  const removeDay = useCallback(async (strategy: 'move_prev' | 'move_next' | 'delete_all') => {
    if (!event || days.length <= 1) return
    const lastDay = days[days.length - 1]
    const servicesInLastDay = lastDay.services

    if (strategy === 'delete_all') {
      for (const svc of servicesInLastDay) {
        const realId = svc.id.includes('__') ? svc.id.split('__')[0] : svc.id
        await supabase.from(svc.table).delete().eq('id', realId)
      }
    } else {
      const targetDate = strategy === 'move_prev' && days.length >= 2
        ? days[days.length - 2].date
        : days.length >= 2 ? days[days.length - 2].date : lastDay.date

      for (const svc of servicesInLastDay) {
        const realId = svc.id.includes('__') ? svc.id.split('__')[0] : svc.id
        const dateCol = svc.id.includes('__') ? svc.id.split('__')[1] : getDateColumn(svc.table)
        await supabase.from(svc.table).update({ [dateCol]: targetDate }).eq('id', realId)
      }
    }

    const newEnd = addDays(event.dataFine, -1)
    await resizeEventOnly(event.id, event.dataInizio, newEnd)
    await reload()
  }, [event, days, reload])

  return { event, days, loading, reload, moveService, addDay, removeDay }
}

function getDateColumn(table: string): string {
  switch (table) {
    case 'event_hotel_details': return 'check_in_date'
    case 'event_grafica_stampa_details': return 'data_consegna'
    default: return 'data'
  }
}
