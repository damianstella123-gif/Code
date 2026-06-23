import { supabase } from '@/lib/supabase'
import type { Agent, AgentResponse, FlyContext } from '../types'

export const eventAgent: Agent = {
  id: 'event',
  name: 'Event Agent',
  description: 'Analizza eventi, programma, team e stato operativo',
  keywords: /event[oi]|programma|riepilog|operativ|team|partecipant|location|sede|data.*evento|stato.*evento|manca|incomplet|incongruenz/i,

  async handle(query: string, context: FlyContext): Promise<AgentResponse> {
    const q = query.toLowerCase()

    if (!context.eventId) {
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: true })
        .limit(20)

      const allEvents = events ?? []
      const inCorso = allEvents.filter((e: Record<string, unknown>) => e.status === 'in_corso')
      const pianificazione = allEvents.filter((e: Record<string, unknown>) => e.status === 'pianificazione')

      return {
        agent: 'event',
        text: `${allEvents.length} eventi totali:\n\n- In corso: ${inCorso.length}\n- In pianificazione: ${pianificazione.length}\n\n${inCorso.length > 0 ? `Evento live: ${(inCorso[0] as Record<string, unknown>).title}` : 'Nessun evento live.'}`,
        chips: ['Eventi in corso', 'Prossimi eventi', 'Riepilogo operativo'],
      }
    }

    // Context-specific: we're inside an event
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .eq('id', context.eventId)
      .maybeSingle()

    if (!eventData) {
      return { agent: 'event', text: 'Evento non trovato nel database.', chips: ['Lista eventi'] }
    }

    const event = eventData as Record<string, unknown>
    const eventName = (event.title as string) || 'Evento'

    // Load related data
    const [suppliersRes, servicesRes, programRes, tasksRes] = await Promise.all([
      supabase.from('event_suppliers').select('*').eq('event_id', context.eventId),
      supabase.from('event_supplier_services').select('*').eq('event_id', context.eventId),
      supabase.from('event_program').select('*').eq('event_id', context.eventId),
      supabase.from('tasks').select('*').eq('event_id', context.eventId),
    ])

    const linkedSuppliers = suppliersRes.data ?? []
    const services = servicesRes.data ?? []
    const program = programRes.data ?? []
    const tasks = tasksRes.data ?? []

    // "What's missing?" question
    if (/manc|incomplet|informazion.*manc/i.test(q)) {
      const missing: string[] = []
      if (!event.client) missing.push('Cliente non assegnato')
      if (!event.project_manager_id) missing.push('Responsabile non assegnato')
      if (!event.location) missing.push('Location non specificata')
      if (linkedSuppliers.length === 0) missing.push('Nessun fornitore collegato')
      if (services.length === 0) missing.push('Nessun servizio operativo inserito')
      if (program.length === 0) missing.push('Programma evento vuoto')
      if (tasks.length === 0) missing.push('Nessun task creato')

      const servicesNoTime = services.filter((s: Record<string, unknown>) => !s.ora_inizio)
      if (servicesNoTime.length > 0) missing.push(`${servicesNoTime.length} servizi senza orario`)

      if (missing.length === 0) {
        return { agent: 'event', text: `${eventName} ha tutte le informazioni principali compilate. Evento ben strutturato.`, chips: ['Riepilogo operativo', 'Budget', 'Programma'] }
      }
      return {
        agent: 'event',
        text: `Informazioni mancanti per "${eventName}":\n\n${missing.map(m => `- ${m}`).join('\n')}`,
        chips: ['Riepilogo operativo', 'Budget evento', 'Fornitori'],
      }
    }

    // "Incongruenze" / issues in program
    if (/incongruenz|problema|errore|conflitt/i.test(q)) {
      const issues: string[] = []
      if (program.length === 0) {
        issues.push('Programma evento vuoto: non e possibile verificare incongruenze')
      }
      const tasksOverdue = tasks.filter((t: Record<string, unknown>) => {
        const due = t.due_date as string
        return due && new Date(due) < new Date() && t.status !== 'completato'
      })
      if (tasksOverdue.length > 0) issues.push(`${tasksOverdue.length} task scaduti non completati`)
      if (linkedSuppliers.length > 0 && services.length === 0) {
        issues.push('Fornitori collegati ma nessun servizio operativo inserito')
      }

      if (issues.length === 0) {
        return { agent: 'event', text: `Nessuna incongruenza rilevata per "${eventName}".`, chips: ['Riepilogo operativo', 'Task aperti'] }
      }
      return { agent: 'event', text: `Potenziali problemi per "${eventName}":\n\n${issues.map(i => `- ${i}`).join('\n')}`, chips: ['Task aperti', 'Programma', 'Fornitori'] }
    }

    // Summary / overview
    const taskAperti = tasks.filter((t: Record<string, unknown>) => t.status !== 'completato').length
    const taskCompletati = tasks.filter((t: Record<string, unknown>) => t.status === 'completato').length

    return {
      agent: 'event',
      text: `Riepilogo "${eventName}":\n\n- Stato: ${event.status}\n- Data: ${event.start_date} - ${event.end_date}\n- Location: ${event.location || 'n/d'}\n- Partecipanti: ${event.attendees || 'n/d'}\n- Fornitori: ${linkedSuppliers.length}\n- Servizi operativi: ${services.length}\n- Task: ${taskCompletati}/${tasks.length} completati (${taskAperti} aperti)\n- Voci programma: ${program.length}`,
      chips: ['Info mancanti', 'Incongruenze', 'Budget', 'Task aperti'],
    }
  },
}
