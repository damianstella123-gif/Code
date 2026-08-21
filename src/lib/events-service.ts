import { supabase } from './supabase'
import { addDaysISO, diffDaysISO } from './format'
import { logError } from './error-log'
import { getCached, setCache, invalidateCache } from './cache'
import type { Event } from '@/data/events'

interface EventRow {
  id: string
  title: string
  description: string
  client: string
  client_id: string | null
  location: string
  start_date: string
  end_date: string
  status: Event['stato']
  budget: number | string
  ricavo_cliente: number | null
  fee_agenzia_pct: number | null
  margine_target: number | null
  attendees: number
  project_manager_id: string
  team_member_ids: string[]
  created_at: string
  updated_at: string
  archiviato_da?: string | null
}

function rowToEvent(r: EventRow): Event {
  return {
    id: r.id,
    nome: r.title,
    descrizione: r.description ?? '',
    cliente: r.client ?? '',
    clientId: r.client_id ?? null,
    dataInizio: r.start_date,
    dataFine: r.end_date,
    location: r.location ?? '',
    budget: typeof r.budget === 'string' ? Number(r.budget) : r.budget,
    ricavo_cliente: r.ricavo_cliente ?? null,
    fee_agenzia_pct: r.fee_agenzia_pct ?? 6,
    margine_target: r.margine_target ?? 25,
    stato: r.status,
    partecipanti: r.attendees ?? 0,
    responsabile: r.project_manager_id ?? '',
    team: r.team_member_ids ?? [],
  }
}

function eventToRow(e: Event): Omit<EventRow, 'created_at' | 'updated_at'> {
  return {
    id: e.id,
    title: e.nome,
    description: e.descrizione ?? '',
    client: e.cliente ?? '',
    client_id: e.clientId ?? null,
    location: e.location ?? '',
    start_date: e.dataInizio,
    end_date: e.dataFine,
    status: e.stato,
    budget: e.budget,
    ricavo_cliente: e.ricavo_cliente ?? null,
    fee_agenzia_pct: e.fee_agenzia_pct ?? 6,
    margine_target: e.margine_target ?? 25,
    attendees: e.partecipanti ?? 0,
    project_manager_id: e.responsabile ?? '',
    team_member_ids: e.team ?? [],
  }
}

export async function fetchEvents(): Promise<Event[]> {
  const cached = getCached<Event[]>('events_list')
  if (cached) return cached
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .or('archiviato.is.null,archiviato.eq.false')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) {
    logError('events-service', 'fetchEvents', error)
    throw new Error(error.message)
  }
  const result = ((data ?? []) as EventRow[]).map(rowToEvent)
  setCache('events_list', result)
  return result
}

export async function fetchEventById(id: string): Promise<Event | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    logError('events-service', 'fetchEventById', error)
    return null
  }
  return data ? rowToEvent(data as EventRow) : null
}

export async function createEvent(event: Event): Promise<Event | null> {
  const row = eventToRow(event)
  const { data, error } = await supabase
    .from('events')
    .insert(row)
    .select()
    .maybeSingle()
  if (error) {
    logError('events-service', 'createEvent', error)
    throw new Error(error.message)
  }
  invalidateCache('events_list')
  return data ? rowToEvent(data as EventRow) : null
}

export async function upsertEvent(event: Event): Promise<Event | null> {
  const row = eventToRow(event)
  const { data, error } = await supabase
    .from('events')
    .upsert(row, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    logError('events-service', 'upsertEvent', error)
    throw new Error(error.message)
  }
  invalidateCache('events_list')
  return data ? rowToEvent(data as EventRow) : null
}

export async function updateEvent(id: string, patch: Partial<Event>): Promise<Event | null> {
  const dbPatch: Partial<EventRow> = {}
  if (patch.nome !== undefined) dbPatch.title = patch.nome
  if (patch.descrizione !== undefined) dbPatch.description = patch.descrizione
  if (patch.cliente !== undefined) dbPatch.client = patch.cliente
  if (patch.location !== undefined) dbPatch.location = patch.location
  if (patch.dataInizio !== undefined) dbPatch.start_date = patch.dataInizio
  if (patch.dataFine !== undefined) dbPatch.end_date = patch.dataFine
  if (patch.stato !== undefined) dbPatch.status = patch.stato
  if (patch.budget !== undefined) dbPatch.budget = patch.budget
  if (patch.ricavo_cliente !== undefined) dbPatch.ricavo_cliente = patch.ricavo_cliente
  if (patch.fee_agenzia_pct !== undefined) dbPatch.fee_agenzia_pct = patch.fee_agenzia_pct
  if (patch.margine_target !== undefined) dbPatch.margine_target = patch.margine_target
  if (patch.partecipanti !== undefined) dbPatch.attendees = patch.partecipanti
  if (patch.responsabile !== undefined) dbPatch.project_manager_id = patch.responsabile
  if (patch.team !== undefined) dbPatch.team_member_ids = patch.team

  const { data, error } = await supabase
    .from('events')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    logError('events-service', 'updateEvent', error)
    throw new Error(error.message)
  }
  invalidateCache('events_list')
  return data ? rowToEvent(data as EventRow) : null
}

export async function deleteEvent(id: string): Promise<boolean> {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) {
    logError('events-service', 'deleteEvent', error)
    throw new Error(error.message)
  }
  invalidateCache('events_list')
  return true
}

export type ArchivedEvent = Event & { archiviato_da?: string | null }

export async function fetchArchivedEvents(): Promise<ArchivedEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('archiviato', true)
    .order('end_date', { ascending: false })
    .limit(500)
  if (error) {
    logError('events-service', 'fetchArchivedEvents', error)
    throw new Error(error.message)
  }
  return ((data ?? []) as EventRow[]).map(r => ({ ...rowToEvent(r), archiviato_da: r.archiviato_da ?? null }))
}

export async function archiveEvent(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ archiviato: true, archiviato_at: new Date().toISOString(), archiviato_da: userId })
    .eq('id', id)
  if (error) {
    logError('events-service', 'archiveEvent', error)
    throw new Error(error.message)
  }
  invalidateCache('events_list')
}

export async function restoreEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ archiviato: false, archiviato_at: null, archiviato_da: null })
    .eq('id', id)
  if (error) {
    logError('events-service', 'restoreEvent', error)
    throw new Error(error.message)
  }
  invalidateCache('events_list')
}

export async function fetchAllEventNames(): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) {
    logError('events-service', 'fetchAllEventNames', error)
    throw new Error(error.message)
  }
  return ((data ?? []) as { id: string; title: string }[]).map(r => ({ id: r.id, nome: r.title }))
}

export async function fetchEventsByClientName(clientName: string): Promise<Event[]> {
  const { data: clientRows } = await supabase
    .from('clients')
    .select('id')
    .ilike('name', clientName)
  if (!clientRows || clientRows.length === 0) return []

  const ids = clientRows.map(r => r.id)

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .or(`client.in.(${ids.join(',')}),client_id.in.(${ids.join(',')})`)
    .order('start_date', { ascending: false })
    .limit(50)
  if (error) {
    logError('events-service', 'fetchEventsByClientName', error)
    throw new Error(error.message)
  }
  return ((data ?? []) as EventRow[]).map(rowToEvent)
}

export interface ShiftResult {
  shifted: string[]
  skipped: string[]
}

export async function shiftEventTimeline(eventId: string, deltaDays: number): Promise<ShiftResult> {
  if (deltaDays === 0) return { shifted: [], skipped: [] }

  const shifted: string[] = []
  const skipped: string[] = []

  const shiftDate = (d: string): string => addDaysISO(d, deltaDays)

  async function shiftTable(table: string, dateColumns: string[]): Promise<boolean> {
    const { data: rows, error: fetchErr } = await supabase
      .from(table)
      .select('*')
      .eq('event_id', eventId)
    if (fetchErr) { console.warn(`shiftEventTimeline fetch ${table}:`, fetchErr.message); return false }
    if (!rows || rows.length === 0) return true

    for (const row of rows) {
      const r = row as Record<string, unknown>
      const patch: Record<string, string | null> = {}
      for (const col of dateColumns) {
        const val = r[col]
        if (val && typeof val === 'string') {
          patch[col] = shiftDate(val)
        }
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from(table).update(patch).eq('id', r.id as string)
        if (error) { console.warn(`shiftEventTimeline update ${table}:`, error.message); return false }
      }
    }
    return true
  }

  const tableTasks: { table: string; columns: string[] }[] = [
    { table: 'event_program', columns: ['data'] },
    { table: 'event_supplier_services', columns: ['data'] },
    { table: 'event_hotel_details', columns: ['data', 'check_in_date', 'check_out_date'] },
    { table: 'event_restaurant_details', columns: ['data'] },
    { table: 'event_experience_details', columns: ['data'] },
    { table: 'event_catering_details', columns: ['data'] },
    { table: 'event_staff_esterno_details', columns: ['data'] },
    { table: 'event_staff_interno_details', columns: ['data'] },
    { table: 'event_audio_video_details', columns: ['data_montaggio', 'data_prove', 'data_evento', 'data_smontaggio'] },
    { table: 'event_allestimenti_details', columns: ['data_montaggio', 'data_smontaggio'] },
    { table: 'event_grafica_stampa_details', columns: ['data_consegna'] },
    { table: 'event_varie_details', columns: ['data'] },
  ]

  const results = await Promise.all(
    tableTasks.map(async t => {
      const ok = await shiftTable(t.table, t.columns)
      return { table: t.table, ok }
    })
  )

  for (const r of results) {
    if (r.ok) shifted.push(r.table)
    else skipped.push(r.table)
  }

  return { shifted, skipped }
}

export async function moveEventWithTimelineShift(eventId: string, newStartDate: string): Promise<{ event: Event | null; shift: ShiftResult }> {
  const { data: row } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle()
  if (!row) return { event: null, shift: { shifted: [], skipped: [] } }
  const oldStart = (row as EventRow).start_date
  const oldEnd = (row as EventRow).end_date
  const deltaDays = diffDaysISO(newStartDate, oldStart)
  if (deltaDays === 0) return { event: rowToEvent(row as EventRow), shift: { shifted: [], skipped: [] } }
  const newEnd = addDaysISO(oldEnd, deltaDays)
  const event = await updateEvent(eventId, { dataInizio: newStartDate, dataFine: newEnd })
  const shift = await shiftEventTimeline(eventId, deltaDays)
  return { event, shift }
}

export async function resizeEventOnly(eventId: string, newStartDate: string, newEndDate: string): Promise<Event | null> {
  return await updateEvent(eventId, { dataInizio: newStartDate, dataFine: newEndDate })
}

// ─── Green Report Auto-Generation ────────────────────────────────────────────

export interface GreenReport {
  id: string
  event_id: string
  co2_total_kg: number
  waste_kg: number
  water_liters: number
  energy_kwh: number
  renewable_pct: number
  score_100: number
  recommendations: string[]
  generated_at: string
  updated_at: string
}

export async function regenerateGreenReport(eventId: string): Promise<GreenReport | null> {
  const { data: event } = await supabase.from('events')
    .select('*').eq('id', eventId).maybeSingle()
  if (!event) return null

  const { data: suppliers } = await supabase.from('event_supplier_services')
    .select('*').eq('event_id', eventId)

  const { data: greenData } = await supabase.from('event_green_data')
    .select('distanza_km, pax, mezzo_prevalente').eq('event_id', eventId).maybeSingle()

  const attendees = greenData?.pax || event.attendees || 1
  const locationKm = greenData?.distanza_km || 0

  // CO2 transport
  const mezzo = greenData?.mezzo_prevalente || 'misto'
  const factors: Record<string, number> = { auto: 0.170, treno: 0.041, aereo: 0.255, misto: 0.106 }
  const factor = factors[mezzo] || factors.misto
  const co2_transport = attendees * locationKm * 2 * factor

  // CO2 suppliers
  let co2_suppliers = 0
  if (suppliers) {
    for (const s of suppliers) {
      const cat = ((s as any).categoria || '').toLowerCase()
      if (cat.includes('hotel')) co2_suppliers += (s.quantity || 1) * 2.5 * attendees
      else if (cat.includes('catering') || cat.includes('ristor')) co2_suppliers += (s.quantity || 1) * 1.2 * attendees
      else if (cat.includes('audio') || cat.includes('video')) co2_suppliers += (s.quantity || 1) * 0.3
      else if (cat.includes('stampa') || cat.includes('grafica')) co2_suppliers += (s.quantity || 1) * 0.02
      else co2_suppliers += 1 * attendees
    }
  }

  const co2_total = co2_transport + co2_suppliers
  const waste_kg = attendees * 0.5
  const water_liters = attendees * 2.5

  const startMs = new Date(event.start_date).getTime()
  const endMs = new Date(event.end_date).getTime()
  const durationHours = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60)))
  const energy_kwh = (durationHours * 5) + ((suppliers?.length || 0) * 0.2)

  const locationLower = (event.location || '').toLowerCase()
  const renewable_pct = (locationLower.includes('solar') || locationLower.includes('eco') || locationLower.includes('green')) ? 30 : 0

  // Score 0-100
  let score = 50
  score += (100 - attendees * 0.5) / Math.max(attendees, 1)
  score -= co2_total / 100
  score += renewable_pct / 2
  score = Math.max(0, Math.min(100, Math.round(score)))

  // Recommendations
  const recommendations: string[] = []
  if (co2_total > 200) recommendations.push('Considerare compensazione carbonio')
  if (renewable_pct === 0) recommendations.push('Venue ha opzioni energia rinnovabile?')
  if (waste_kg > attendees * 0.3) recommendations.push('Implementare raccolta differenziata')
  if (attendees > 100) recommendations.push('Preferire trasporto collettivo')
  if (locationKm > 50) recommendations.push('Considerare evento ibrido/online')
  if (co2_suppliers > co2_transport) recommendations.push('Valutare fornitori con certificazioni green')

  const { data: report, error } = await supabase.from('green_reports')
    .upsert({
      event_id: eventId,
      co2_total_kg: co2_total,
      waste_kg,
      water_liters,
      energy_kwh,
      renewable_pct,
      score_100: score,
      recommendations,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'event_id' })
    .select()
    .maybeSingle()

  if (error) {
    logError('events-service', 'regenerateGreenReport', error)
    return null
  }
  return report as GreenReport | null
}

// ─── Event ROI / Performance ────────────────────────────────────────────────

export interface EventROI {
  event_id: string
  title: string
  client: string
  client_name: string
  revenue: number
  costi_totali: number
  costi_hotel: number
  costi_catering: number
  costi_fornitori: number
  costi_staff: number
  costi_varie: number
  margine_eur: number
  margine_pct: number
  roi_pct: number
  on_time_pct: number
  attendees: number
  within_budget: boolean
  data_fine: string
  status: string
}

export async function getEventROI(eventId: string, debug = false): Promise<EventROI | null> {
  const { data: event } = await supabase.from('events')
    .select('*').eq('id', eventId).maybeSingle()
  if (!event) return null

  let clientName = event.client || ''
  const clientKey = event.client_id || event.client
  if (clientKey) {
    const { data: cl } = await supabase.from('clients').select('name').eq('id', clientKey).maybeSingle()
    if (cl?.name) clientName = cl.name
  }

  if (debug) console.log('%c ROI Debug — ' + event.title, 'font-weight:bold;font-size:13px')

  const [hotels, restaurant, catering, staffInt, staffExt, varie, audioVideo, allestimenti, graficaStampa, experience, assicurazioni, agenziaViaggi, tasks] = await Promise.all([
    supabase.from('event_hotel_details').select('costo_totale').eq('event_id', eventId),
    supabase.from('event_restaurant_details').select('costo_totale_reale').eq('event_id', eventId),
    supabase.from('event_catering_details').select('costo_totale').eq('event_id', eventId),
    supabase.from('event_staff_interno_details').select('costo_totale').eq('event_id', eventId),
    supabase.from('event_staff_esterno_details').select('costo_totale').eq('event_id', eventId),
    supabase.from('event_varie_details').select('costo_totale').eq('event_id', eventId),
    supabase.from('event_audio_video_details').select('costo_totale').eq('event_id', eventId),
    supabase.from('event_allestimenti_details').select('costo_totale').eq('event_id', eventId),
    supabase.from('event_grafica_stampa_details').select('costo_totale').eq('event_id', eventId),
    supabase.from('event_experience_details').select('costo_totale').eq('event_id', eventId),
    supabase.from('event_assicurazioni_details').select('costo_totale').eq('event_id', eventId),
    supabase.from('event_agenzia_viaggi_details').select('costo_totale').eq('event_id', eventId),
    supabase.from('tasks').select('status').eq('event_id', eventId),
  ])

  const sum = (rows: any[] | null, field: string) => (rows || []).reduce((s: number, r: any) => s + (Number(r[field]) || 0), 0)

  const costi_hotel = sum(hotels.data, 'costo_totale')
  const costi_restaurant = sum(restaurant.data, 'costo_totale_reale')
  const costi_catering = sum(catering.data, 'costo_totale') + costi_restaurant
  const costi_staff_int = sum(staffInt.data, 'costo_totale')
  const costi_staff_ext = sum(staffExt.data, 'costo_totale')
  const costi_varie = sum(varie.data, 'costo_totale')
  const costi_av = sum(audioVideo.data, 'costo_totale')
  const costi_allestimenti = sum(allestimenti.data, 'costo_totale')
  const costi_grafica = sum(graficaStampa.data, 'costo_totale')
  const costi_experience = sum(experience.data, 'costo_totale')
  const costi_assicurazioni = sum(assicurazioni.data, 'costo_totale')
  const costi_agenzia = sum(agenziaViaggi.data, 'costo_totale')

  const costi_fornitori = costi_av + costi_allestimenti + costi_grafica + costi_experience + costi_assicurazioni + costi_agenzia
  const costi_staff = costi_staff_int + costi_staff_ext
  const costi_totali = costi_hotel + costi_catering + costi_fornitori + costi_staff + costi_varie

  const revenue = Number(event.ricavo_cliente) || 0
  const margine_eur = revenue - costi_totali
  const margine_pct = revenue > 0 ? (margine_eur / revenue) * 100 : 0
  const roi_pct = costi_totali > 0 ? (margine_eur / costi_totali) * 100 : 0

  const tasksAll = tasks.data || []
  const tasksCompleted = tasksAll.filter((t: any) => t.status === 'completato' || t.status === 'done').length
  const on_time_pct = tasksAll.length > 0 ? (tasksCompleted / tasksAll.length) * 100 : 0

  const within_budget = event.margine_target ? margine_pct >= Number(event.margine_target) : costi_totali <= revenue

  if (debug) {
    console.table({
      'Revenue (ricavo_cliente)': `\u20AC${revenue.toLocaleString('it-IT')}`,
      'Hotel': `\u20AC${costi_hotel.toLocaleString('it-IT')}`,
      'Restaurant': `\u20AC${costi_restaurant.toLocaleString('it-IT')}`,
      'Catering (incl. restaurant)': `\u20AC${costi_catering.toLocaleString('it-IT')}`,
      'Audio/Video': `\u20AC${costi_av.toLocaleString('it-IT')}`,
      'Allestimenti': `\u20AC${costi_allestimenti.toLocaleString('it-IT')}`,
      'Grafica/Stampa': `\u20AC${costi_grafica.toLocaleString('it-IT')}`,
      'Experience': `\u20AC${costi_experience.toLocaleString('it-IT')}`,
      'Assicurazioni': `\u20AC${costi_assicurazioni.toLocaleString('it-IT')}`,
      'Agenzia Viaggi': `\u20AC${costi_agenzia.toLocaleString('it-IT')}`,
      'Fornitori (subtotal)': `\u20AC${costi_fornitori.toLocaleString('it-IT')}`,
      'Staff Interno': `\u20AC${costi_staff_int.toLocaleString('it-IT')}`,
      'Staff Esterno': `\u20AC${costi_staff_ext.toLocaleString('it-IT')}`,
      'Staff (subtotal)': `\u20AC${costi_staff.toLocaleString('it-IT')}`,
      'Varie': `\u20AC${costi_varie.toLocaleString('it-IT')}`,
      '─────────────': '─────────',
      'COSTI TOTALI': `\u20AC${costi_totali.toLocaleString('it-IT')}`,
      'MARGINE \u20AC': `\u20AC${margine_eur.toLocaleString('it-IT')}`,
      'MARGINE %': `${margine_pct.toFixed(1)}%`,
      'ROI %': `${roi_pct.toFixed(1)}%`,
      'Tasks completati': `${tasksCompleted}/${tasksAll.length} (${on_time_pct.toFixed(0)}%)`,
      'Within budget': within_budget ? 'SI' : 'NO',
      'Margine target': event.margine_target ? `${event.margine_target}%` : 'N/A',
    })
  }

  return {
    event_id: eventId,
    title: event.title || '',
    client: event.client || '',
    client_name: clientName,
    revenue,
    costi_totali,
    costi_hotel,
    costi_catering,
    costi_fornitori,
    costi_staff,
    costi_varie,
    margine_eur,
    margine_pct,
    roi_pct,
    on_time_pct,
    attendees: Number(event.attendees) || 0,
    within_budget,
    data_fine: event.end_date,
    status: event.status || '',
  }
}

export async function getAllEventsROI(filters?: {
  from?: string; to?: string; status?: string; client?: string
}): Promise<EventROI[]> {
  let q = supabase.from('events').select('id')

  if (filters?.from) q = q.gte('end_date', filters.from)
  if (filters?.to) q = q.lte('end_date', filters.to)
  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.client) {
    const { data: matchingClients } = await supabase.from('clients').select('id').ilike('name', `%${filters.client}%`)
    const clientIds = (matchingClients || []).map(c => c.id)
    if (clientIds.length > 0) {
      q = q.in('client_id', clientIds)
    } else {
      q = q.ilike('client', `%${filters.client}%`)
    }
  }

  const { data: events } = await q.order('end_date', { ascending: false }).limit(50)
  if (!events || events.length === 0) return []

  const results = await Promise.all(events.map(e => getEventROI(e.id)))
  return results.filter((r): r is EventROI => r !== null)
}