// COPIA DENO di src/lib/event-economics.ts — ogni modifica va replicata in entrambi i file

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
