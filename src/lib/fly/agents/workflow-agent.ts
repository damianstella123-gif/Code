import { supabase } from '@/lib/supabase'
import type { Agent, AgentResponse, FlyContext } from '../types'

export const workflowAgent: Agent = {
  id: 'workflow',
  name: 'Workflow Agent',
  description: 'Analizza task, step mancanti e avanzamento',
  keywords: /task|workflow|step|avanzamento|ritard|scadut|completat|aperti|bloccat|da.*fare|assegnat|urgente|priorit/i,

  async handle(query: string, context: FlyContext): Promise<AgentResponse> {
    const q = query.toLowerCase()

    if (context.eventId) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('event_id', context.eventId)

      const { data: eventData } = await supabase
        .from('events')
        .select('title')
        .eq('id', context.eventId)
        .maybeSingle()

      const eventName = (eventData?.title as string) || 'Evento'
      const allTasks = (tasks ?? []) as Record<string, unknown>[]

      if (allTasks.length === 0) {
        return { agent: 'workflow', text: `Nessun task creato per "${eventName}".\n\nCrea task dalla tab Task dell'evento per tracciare l'avanzamento.`, chips: ['Info mancanti', 'Riepilogo evento'] }
      }

      const completati = allTasks.filter(t => t.status === 'completato')
      const inCorso = allTasks.filter(t => t.status === 'in_corso')
      const daFare = allTasks.filter(t => t.status === 'da_fare')
      const highPriority = allTasks.filter(t => t.priority === 'alta' && t.status !== 'completato')
      const overdue = allTasks.filter(t => {
        const due = t.due_date as string
        return due && new Date(due) < new Date() && t.status !== 'completato'
      })

      const pct = Math.round((completati.length / allTasks.length) * 100)

      // Overdue / blocked
      if (/scadut|ritard|bloccat/i.test(q)) {
        if (overdue.length === 0) {
          return { agent: 'workflow', text: `Nessun task scaduto per "${eventName}". Tutto in regola.`, chips: ['Task aperti', 'Avanzamento'] }
        }
        const list = overdue.slice(0, 5).map((t: Record<string, unknown>) => `- ${t.title} (scaduto: ${t.due_date})`).join('\n')
        return {
          agent: 'workflow',
          text: `\u26A0\uFE0F ${overdue.length} task scaduti per "${eventName}":\n\n${list}`,
          chips: ['Task priorita alta', 'Avanzamento', 'Riepilogo evento'],
        }
      }

      // Open tasks
      if (/apert|da.*fare|non.*complet/i.test(q)) {
        const open = [...daFare, ...inCorso]
        if (open.length === 0) {
          return { agent: 'workflow', text: `Tutti i task di "${eventName}" sono completati!`, chips: ['Riepilogo evento', 'Budget'] }
        }
        const list = open.slice(0, 8).map((t: Record<string, unknown>) => {
          const priority = t.priority === 'alta' ? ' [ALTA]' : ''
          return `- ${t.title}${priority} (${t.status})`
        }).join('\n')
        return {
          agent: 'workflow',
          text: `${open.length} task aperti per "${eventName}":\n\n${list}${open.length > 8 ? `\n\n...e altri ${open.length - 8}` : ''}`,
          chips: ['Task scaduti', 'Avanzamento', 'Task urgenti'],
        }
      }

      // Priority tasks
      if (/urgent|priorit|alta/i.test(q)) {
        if (highPriority.length === 0) {
          return { agent: 'workflow', text: `Nessun task ad alta priorita aperto per "${eventName}".`, chips: ['Task aperti', 'Avanzamento'] }
        }
        const list = highPriority.slice(0, 5).map((t: Record<string, unknown>) => `- ${t.title} (${t.status})`).join('\n')
        return {
          agent: 'workflow',
          text: `${highPriority.length} task priorita alta aperti:\n\n${list}`,
          chips: ['Task scaduti', 'Avanzamento'],
        }
      }

      // General progress
      return {
        agent: 'workflow',
        text: `Avanzamento "${eventName}": ${pct}%\n\n- Completati: ${completati.length}\n- In corso: ${inCorso.length}\n- Da fare: ${daFare.length}\n- Scaduti: ${overdue.length}\n- Priorita alta: ${highPriority.length}`,
        chips: ['Task aperti', 'Task scaduti', 'Task urgenti'],
      }
    }

    // No event context - general tasks overview
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .neq('status', 'completato')
      .order('due_date', { ascending: true })
      .limit(50)

    const allTasks = (tasks ?? []) as Record<string, unknown>[]
    const overdue = allTasks.filter(t => {
      const due = t.due_date as string
      return due && new Date(due) < new Date()
    })
    const highPriority = allTasks.filter(t => t.priority === 'alta')

    return {
      agent: 'workflow',
      text: `Task aperti globali: ${allTasks.length}\n\n- Scaduti: ${overdue.length}\n- Priorita alta: ${highPriority.length}\n\nApri un evento per un'analisi dettagliata dei suoi task.`,
      chips: ['Task scaduti', 'Task urgenti', 'Apri un evento'],
    }
  },
}
