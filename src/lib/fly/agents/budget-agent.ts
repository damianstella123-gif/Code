import { supabase } from '@/lib/supabase'
import type { Agent, AgentResponse, FlyContext } from '../types'

export const budgetAgent: Agent = {
  id: 'budget',
  name: 'Budget Agent',
  description: 'Analizza budget, margini, IVA e fee agenzia',
  keywords: /budget|margine|costo|costi|venduto|ricav[oi]|fee|iva|spesa|econom|profit|perdita|guadagn/i,

  async handle(query: string, context: FlyContext): Promise<AgentResponse> {
    const q = query.toLowerCase()

    if (!context.eventId) {
      return { agent: 'budget', text: 'Per analizzare il budget, apri un evento specifico. Il Budget Agent lavora nel contesto di un evento.', chips: ['Apri un evento', 'Lista eventi'] }
    }

    const { data: eventData } = await supabase
      .from('events')
      .select('title, fee_agenzia_pct')
      .eq('id', context.eventId)
      .maybeSingle()

    const eventName = (eventData?.title as string) || 'Evento'
    const feePct = (eventData?.fee_agenzia_pct as number) ?? 6

    // Load all budget tables
    const [svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
      supabase.from('event_supplier_services').select('venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita').eq('event_id', context.eventId),
      supabase.from('event_hotel_details').select('venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita').eq('event_id', context.eventId),
      supabase.from('event_restaurant_details').select('budget_totale, budget_per_persona, costo_totale_reale, costo_per_persona, pax_previsti, pax_confermati').eq('event_id', context.eventId),
      supabase.from('event_experience_details').select('venduto_totale, venduto_unitario, costo_totale, costo_unitario, pax').eq('event_id', context.eventId),
      supabase.from('event_catering_details').select('venduto_totale, venduto_per_persona, costo_totale, costo_per_persona, pax').eq('event_id', context.eventId),
      supabase.from('event_staff_interno_details').select('venduto_totale, costo_totale, costo_giornaliero, quantita').eq('event_id', context.eventId),
      supabase.from('event_staff_esterno_details').select('venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita').eq('event_id', context.eventId),
      supabase.from('event_varie_details').select('venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita').eq('event_id', context.eventId),
      supabase.from('event_audio_video_details').select('venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita').eq('event_id', context.eventId),
      supabase.from('event_allestimenti_details').select('venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita').eq('event_id', context.eventId),
      supabase.from('event_grafica_stampa_details').select('venduto_totale, venduto_unitario, costo_totale, costo_unitario, quantita').eq('event_id', context.eventId),
    ])

    function sumVendutoCosto(rows: Record<string, unknown>[] | null): { venduto: number; costo: number } {
      if (!rows) return { venduto: 0, costo: 0 }
      let venduto = 0, costo = 0
      for (const r of rows) {
        const qty = (r.quantita as number) ?? (r.pax_confermati as number) ?? (r.pax_previsti as number) ?? (r.pax as number) ?? 1
        const v = (r.venduto_totale as number) ?? (r.budget_totale as number) ?? ((r.venduto_unitario as number) ?? (r.venduto_per_persona as number) ?? (r.budget_per_persona as number) ?? 0) * qty
        const c = (r.costo_totale as number) ?? (r.costo_totale_reale as number) ?? ((r.costo_unitario as number) ?? (r.costo_per_persona as number) ?? (r.costo_giornaliero as number) ?? 0) * qty
        venduto += v
        costo += c
      }
      return { venduto, costo }
    }

    const totals = [svcRes.data, hotelRes.data, restRes.data, expRes.data, catRes.data, staffIntRes.data, staffExtRes.data, varieRes.data, avRes.data, allestRes.data, graficaRes.data]
      .reduce((acc, rows) => {
        const { venduto, costo } = sumVendutoCosto(rows as Record<string, unknown>[] | null)
        return { venduto: acc.venduto + venduto, costo: acc.costo + costo }
      }, { venduto: 0, costo: 0 })

    const fee = totals.venduto * feePct / 100
    const ricaviTotali = totals.venduto + fee
    const margine = ricaviTotali - totals.costo
    const marginePct = ricaviTotali > 0 ? (margine / ricaviTotali) * 100 : 0
    const numVoci = [svcRes.data, hotelRes.data, restRes.data, expRes.data, catRes.data, staffIntRes.data, staffExtRes.data, varieRes.data, avRes.data, allestRes.data, graficaRes.data]
      .reduce((n, rows) => n + (rows?.length ?? 0), 0)

    // Margin sufficiency check
    if (/margine.*sufficien|profitt|guadagn|sano|salute/i.test(q)) {
      const assessment = marginePct >= 25 ? 'Eccellente' : marginePct >= 15 ? 'Buono' : marginePct >= 5 ? 'Basso, attenzione' : marginePct >= 0 ? 'Critico, quasi a break-even' : 'NEGATIVO - in perdita'
      const suggestion = marginePct < 15
        ? '\n\nSuggerimento: valutare aumento venduto o riduzione costi per portare il margine sopra il 15%.'
        : '\n\nIl margine e in zona sicura.'
      return {
        agent: 'budget',
        text: `Valutazione margine "${eventName}":\n\nMargine: ${marginePct.toFixed(1)}% (\u20AC${margine.toLocaleString('it-IT', { minimumFractionDigits: 2 })})\nValutazione: ${assessment}${suggestion}`,
        chips: ['Dettaglio budget', 'Costi per categoria', 'Fee agenzia'],
      }
    }

    // Fee question
    if (/fee|agenzia/i.test(q)) {
      return {
        agent: 'budget',
        text: `Fee Agenzia per "${eventName}":\n\n- Percentuale: ${feePct}%\n- Totale venduto servizi: \u20AC${totals.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}\n- Fee calcolata: \u20AC${fee.toLocaleString('it-IT', { minimumFractionDigits: 2 })}\n\nLa fee viene aggiunta ai ricavi totali per calcolare il margine reale.`,
        chips: ['Margine sufficiente?', 'Dettaglio budget'],
      }
    }

    // Default summary
    if (numVoci === 0) {
      return { agent: 'budget', text: `Il budget di "${eventName}" e vuoto. Non ci sono ancora voci economiche inserite.\n\nInserisci venduto e costi nei servizi operativi (tab Fornitori).`, chips: ['Info mancanti', 'Fornitori'] }
    }

    return {
      agent: 'budget',
      text: `Budget "${eventName}":\n\n- Totale venduto servizi: \u20AC${totals.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}\n- Fee agenzia (${feePct}%): \u20AC${fee.toLocaleString('it-IT', { minimumFractionDigits: 2 })}\n- Totale ricavi: \u20AC${ricaviTotali.toLocaleString('it-IT', { minimumFractionDigits: 2 })}\n- Totale costi: \u20AC${totals.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}\n- Margine: \u20AC${margine.toLocaleString('it-IT', { minimumFractionDigits: 2 })} (${marginePct.toFixed(1)}%)\n\nVoci totali: ${numVoci}`,
      chips: ['Margine sufficiente?', 'Fee agenzia', 'Info mancanti'],
    }
  },
}
