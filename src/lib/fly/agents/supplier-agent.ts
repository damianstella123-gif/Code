import { supabase } from '@/lib/supabase'
import type { Agent, AgentResponse, FlyContext } from '../types'
import { trackAction } from '../../impact-tracker'

export const supplierAgent: Agent = {
  id: 'supplier',
  name: 'Supplier Agent',
  description: 'Analizza fornitori collegati, servizi e completezza dati',
  keywords: /fornitore|fornitori|hotel|transfer|ristorante|catering|allestiment|audio.*video|staff|serviz[io]|orari|scheda.*operat/i,

  async handle(query: string, context: FlyContext): Promise<AgentResponse> {
    const q = query.toLowerCase()

    if (!context.eventId) {
      const { data: suppliers } = await supabase.from('suppliers').select('id, nome, categoria, stato').limit(100)
      const all = suppliers ?? []
      const attivi = all.filter((s: Record<string, unknown>) => s.stato === 'attivo')
      return {
        agent: 'supplier',
        text: `${all.length} fornitori in anagrafica (${attivi.length} attivi).\n\nApri un evento per analizzare i fornitori operativi.`,
        chips: ['Lista fornitori', 'Apri un evento'],
      }
    }

    // Load event suppliers
    const [linksRes, suppliersRes] = await Promise.all([
      supabase.from('event_suppliers').select('supplier_id').eq('event_id', context.eventId),
      supabase.from('suppliers').select('*').limit(200),
    ])

    const links = linksRes.data ?? []
    const allSuppliers = suppliersRes.data ?? []
    const linkedIds = links.map((l: Record<string, unknown>) => l.supplier_id)
    const linked = allSuppliers.filter((s: Record<string, unknown>) => linkedIds.includes(s.id))

    if (linked.length === 0) {
      return { agent: 'supplier', text: 'Nessun fornitore collegato a questo evento.\n\nCollega fornitori dalla tab Fornitori per attivare i servizi operativi.', chips: ['Info mancanti', 'Riepilogo evento'] }
    }

    // Load services
    const [svcRes, hotelRes, restRes, expRes, catRes, avRes, allestRes, staffIntRes, staffExtRes, graficaRes, varieRes] = await Promise.all([
      supabase.from('event_supplier_services').select('supplier_id, titolo, ora_inizio, data').eq('event_id', context.eventId),
      supabase.from('event_hotel_details').select('supplier_id, check_in_date').eq('event_id', context.eventId),
      supabase.from('event_restaurant_details').select('supplier_id, data, ora_inizio').eq('event_id', context.eventId),
      supabase.from('event_experience_details').select('supplier_id, data, ora_inizio').eq('event_id', context.eventId),
      supabase.from('event_catering_details').select('supplier_id, data, ora').eq('event_id', context.eventId),
      supabase.from('event_audio_video_details').select('supplier_id, data_montaggio').eq('event_id', context.eventId),
      supabase.from('event_allestimenti_details').select('supplier_id, data_montaggio').eq('event_id', context.eventId),
      supabase.from('event_staff_interno_details').select('supplier_id, data, ora_inizio').eq('event_id', context.eventId),
      supabase.from('event_staff_esterno_details').select('supplier_id, data, ora_inizio').eq('event_id', context.eventId),
      supabase.from('event_grafica_stampa_details').select('supplier_id, data_consegna').eq('event_id', context.eventId),
      supabase.from('event_varie_details').select('supplier_id, data, ora_inizio').eq('event_id', context.eventId),
    ])

    const allServices = [
      ...(svcRes.data ?? []),
      ...(hotelRes.data ?? []),
      ...(restRes.data ?? []),
      ...(expRes.data ?? []),
      ...(catRes.data ?? []),
      ...(avRes.data ?? []),
      ...(allestRes.data ?? []),
      ...(staffIntRes.data ?? []),
      ...(staffExtRes.data ?? []),
      ...(graficaRes.data ?? []),
      ...(varieRes.data ?? []),
    ] as Record<string, unknown>[]

    // Suppliers without any service entries
    const suppliersWithServices = new Set(allServices.map(s => s.supplier_id))
    const suppliersNoServices = linked.filter((s: Record<string, unknown>) => !suppliersWithServices.has(s.id))

    // Services without time
    if (/orari|ora|tempo|senza.*orar/i.test(q)) {
      const noTime = allServices.filter(s => !s.ora_inizio && !s.ora && !s.check_in_date && !s.data_montaggio && !s.data_consegna)
      if (noTime.length === 0) {
        return { agent: 'supplier', text: 'Tutti i servizi hanno date/orari inseriti.', chips: ['Riepilogo fornitori', 'Budget'] }
      }
      return {
        agent: 'supplier',
        text: `${noTime.length} servizi senza orario/data inserita.\n\nVerifica le schede operative dei fornitori per completare la programmazione.`,
        chips: ['Fornitori senza servizi', 'Riepilogo evento'],
      }
    }

    // Suppliers missing services
    if (/senza.*serviz|non.*inserit|incomplet/i.test(q)) {
      if (suppliersNoServices.length === 0) {
        return { agent: 'supplier', text: 'Tutti i fornitori collegati hanno almeno un servizio operativo inserito.', chips: ['Orari mancanti', 'Budget'] }
      }
      const list = suppliersNoServices.map((s: Record<string, unknown>) => `- ${s.nome} (${s.categoria})`).join('\n')
      return {
        agent: 'supplier',
        text: `${suppliersNoServices.length} fornitori senza servizi inseriti:\n\n${list}\n\nApri la scheda operativa di ciascuno per aggiungere i dettagli.`,
        chips: ['Orari mancanti', 'Riepilogo evento'],
      }
    }

    trackAction('supplier_found', { eventId: context.eventId })

    // Default overview
    const byCategory: Record<string, number> = {}
    for (const s of linked as Record<string, unknown>[]) {
      const cat = (s.categoria as string) || 'Altro'
      byCategory[cat] = (byCategory[cat] || 0) + 1
    }
    const catList = Object.entries(byCategory).map(([cat, n]) => `- ${cat}: ${n}`).join('\n')

    return {
      agent: 'supplier',
      text: `${linked.length} fornitori collegati:\n\n${catList}\n\nServizi operativi totali: ${allServices.length}${suppliersNoServices.length > 0 ? `\n\n\u26A0\uFE0F ${suppliersNoServices.length} fornitori senza servizi inseriti` : ''}`,
      chips: ['Senza orari', 'Fornitori incompleti', 'Budget'],
    }
  },
}
