import { supabase } from './supabase'

export type RawRow = Record<string, unknown>

export interface RowEconomics {
  venduto: number
  costo: number
  hasDate: boolean
}

export function calcRowEconomics(row: RawRow, category: string): RowEconomics {
  let venduto = 0
  let costo = 0
  let hasDate = false

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
  } else if (category === 'hotel') {
    const tipo = row.tipo as string
    const paymentMode = row.payment_mode as string
    if (tipo === 'pernottamento' && paymentMode) {
      const roomsClient = (row.rooms_client_count as number) || 0
      const roomRateClient = (row.room_rate_client as number) || 0
      const roomsSimmetria = (row.rooms_simmetria_count as number) || 0
      const roomCostSimmetria = (row.room_cost_simmetria as number) || 0
      venduto = (row.venduto_totale as number) || (roomsClient * roomRateClient)
      costo = (row.costo_totale as number) || (roomsSimmetria * roomCostSimmetria)
    } else {
      const qty = (row.quantita as number) || 1
      venduto = (row.venduto_totale as number) ?? ((row.venduto_unitario as number) ? (row.venduto_unitario as number) * qty : 0)
      costo = (row.costo_totale as number) ?? ((row.costo_unitario as number) ? (row.costo_unitario as number) * qty : 0)
    }
    hasDate = !!(row.check_in_date || (row.data && row.ora_inizio))
  } else {
    const qty = (row.quantita as number) || 1
    venduto = (row.venduto_totale as number) ?? ((row.venduto_unitario as number) ? (row.venduto_unitario as number) * qty : 0)
    costo = (row.costo_totale as number) ?? ((row.costo_unitario as number) ? (row.costo_unitario as number) * qty : 0)
    hasDate = !!(row.data && row.ora_inizio)
  }

  venduto += (row.venduto_area_speciale as number) || 0
  costo += (row.costo_area_speciale as number) || 0

  return { venduto, costo, hasDate }
}

export function normalizzaImporto(importo: number, aliquota: string | number | null, inclusa: boolean): number {
  if (!importo || importo === 0) return 0
  if (inclusa) {
    const pct = parseFloat(String(aliquota || 22)) || 22
    return importo / (1 + pct / 100)
  }
  return importo
}

export function calcRowNetto(row: RawRow, venduto: number, costo: number): { vendutoNetto: number; costoNetto: number } {
  const vendutoNetto = normalizzaImporto(
    venduto,
    (row.aliquota_iva_venduto as string | number | null) ?? 22,
    (row.iva_inclusa_venduto as boolean) ?? false
  )
  const costoNetto = normalizzaImporto(
    costo,
    (row.aliquota_iva_costo as string | number | null) ?? 22,
    (row.iva_inclusa_costo as boolean) ?? false
  )
  return { vendutoNetto, costoNetto }
}

export function calcRowCommission(row: RawRow, costo: number): number {
  const commImporto = (row.commissione_importo as number) || 0
  const commPct = (row.commissione_pct as number) || 0
  if (commImporto > 0) return commImporto
  if (commPct > 0 && costo > 0) return costo * commPct / 100
  return 0
}

export interface EventEconomicsSummary {
  eventId: string
  venduto: number
  costo: number
  fee: number
  commissioni: number
  ricavi: number
  margine: number
  marginePct: number
  lineCount: number
}

export async function fetchAllEventsEconomics(feePctByEvent: Record<string, number>): Promise<EventEconomicsSummary[]> {
  const IVA_COLS = ', aliquota_iva_venduto, iva_inclusa_venduto, aliquota_iva_costo, iva_inclusa_costo'
  const [svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
    supabase.from('event_supplier_services').select('event_id, supplier_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo, dmc_categoria' + IVA_COLS),
    supabase.from('event_hotel_details').select('event_id, supplier_id, tipo, payment_mode, rooms_client_count, room_rate_client, rooms_simmetria_count, room_cost_simmetria, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, check_in_date, data, ora_inizio, commissione_pct, commissione_importo, costo_area_speciale, venduto_area_speciale' + IVA_COLS),
    supabase.from('event_restaurant_details').select('event_id, supplier_id, budget_totale, budget_per_persona, pax_confermati, pax_previsti, costo_totale_reale, costo_per_persona, data, ora_inizio, commissione_pct, commissione_importo, costo_area_speciale, venduto_area_speciale' + IVA_COLS),
    supabase.from('event_experience_details').select('event_id, supplier_id, venduto_totale, venduto_per_persona, costo_totale, costo_per_persona, pax, data, ora_inizio, ora, commissione_pct, commissione_importo, dmc_categoria' + IVA_COLS),
    supabase.from('event_catering_details').select('event_id, supplier_id, venduto_totale, venduto_per_persona, costo_totale, costo_per_persona, pax, data, ora_inizio, ora, commissione_pct, commissione_importo' + IVA_COLS),
    supabase.from('event_staff_interno_details').select('event_id, profile_id, venduto_totale, costo_totale, costo_giornaliero, data, ora_inizio, commissione_pct, commissione_importo' + IVA_COLS),
    supabase.from('event_staff_esterno_details').select('event_id, supplier_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo' + IVA_COLS),
    supabase.from('event_varie_details').select('event_id, supplier_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo, costo_area_speciale, venduto_area_speciale' + IVA_COLS),
    supabase.from('event_audio_video_details').select('event_id, supplier_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo' + IVA_COLS),
    supabase.from('event_allestimenti_details').select('event_id, supplier_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo' + IVA_COLS),
    supabase.from('event_grafica_stampa_details').select('event_id, supplier_id, venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita, data, ora_inizio, commissione_pct, commissione_importo' + IVA_COLS),
  ])

  const catToRows: { category: string; rows: RawRow[] }[] = [
    { category: 'transfer', rows: ((svcRes.data ?? []) as unknown) as RawRow[] },
    { category: 'hotel', rows: ((hotelRes.data ?? []) as unknown) as RawRow[] },
    { category: 'ristorante', rows: ((restRes.data ?? []) as unknown) as RawRow[] },
    { category: 'experience', rows: ((expRes.data ?? []) as unknown) as RawRow[] },
    { category: 'catering', rows: ((catRes.data ?? []) as unknown) as RawRow[] },
    { category: 'staff_interno', rows: ((staffIntRes.data ?? []) as unknown) as RawRow[] },
    { category: 'staff_esterno', rows: ((staffExtRes.data ?? []) as unknown) as RawRow[] },
    { category: 'varie', rows: ((varieRes.data ?? []) as unknown) as RawRow[] },
    { category: 'audio_video', rows: ((avRes.data ?? []) as unknown) as RawRow[] },
    { category: 'allestimenti', rows: ((allestRes.data ?? []) as unknown) as RawRow[] },
    { category: 'grafica_stampa', rows: ((graficaRes.data ?? []) as unknown) as RawRow[] },
  ]

  const byEvent: Record<string, { venduto: number; costo: number; commissioni: number; count: number }> = {}

  for (const { category, rows } of catToRows) {
    for (const row of rows) {
      const eid = row.event_id as string
      if (!eid) continue
      const econ = calcRowEconomics(row, category)
      if (!econ.venduto && !econ.costo) continue
      const { vendutoNetto, costoNetto } = calcRowNetto(row, econ.venduto, econ.costo)
      if (!byEvent[eid]) byEvent[eid] = { venduto: 0, costo: 0, commissioni: 0, count: 0 }
      byEvent[eid].venduto += vendutoNetto
      byEvent[eid].costo += costoNetto
      byEvent[eid].count += 1
      byEvent[eid].commissioni += calcRowCommission(row, costoNetto)
    }
  }

  return Object.entries(byEvent).map(([eventId, d]) => {
    const feePct = feePctByEvent[eventId] ?? 6
    const fee = d.venduto * feePct / 100
    const ricavi = d.venduto + fee + d.commissioni
    const margine = ricavi - d.costo
    const marginePct = ricavi > 0 ? (margine / ricavi) * 100 : 0
    return { eventId, venduto: d.venduto, costo: d.costo, fee, commissioni: d.commissioni, ricavi, margine, marginePct, lineCount: d.count }
  })
}
