import { supabase } from './supabase'
import { logError } from './error-log'
import { fetchTasksByEvent } from './tasks-service'

export interface HandoverRecap {
  tasks: {
    total: number
    completed: number
    open: number
    overdue: number
    overdueList: { title: string; dueDate: string }[]
  }
  upcomingDeadlines: { title: string; dueDate: string }[]
  budget: { total: number; used: number; pctUsed: number } | null
  suppliers: { total: number; confirmed: number; pending: number } | null
  documentsCount: number
}

export interface HandoverParams {
  eventId: string
  toUserId: string
  recap: HandoverRecap
  note: string
  stayInTeam: boolean
  makeResponsible: boolean
}

export async function computeHandoverRecap(eventId: string): Promise<HandoverRecap> {
  const today = new Date().toISOString().slice(0, 10)

  const [tasksResult, suppliersResult, docsResult, budgetResult] = await Promise.all([
    fetchTasksByEvent(eventId),
    supabase.from('event_suppliers').select('stato_conferma').eq('event_id', eventId),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('event_id', eventId),
    supabase.from('event_budget_lines').select('importo, tipo').eq('event_id', eventId),
  ])

  const tasks = tasksResult
  const completed = tasks.filter(t => t.stato === 'completato').length
  const open = tasks.filter(t => t.stato !== 'completato').length
  const overdue = tasks.filter(t => t.stato !== 'completato' && t.scadenza && t.scadenza < today)
  const upcoming = tasks
    .filter(t => t.stato !== 'completato' && t.scadenza && t.scadenza >= today)
    .slice(0, 5)

  const suppData = suppliersResult.data ?? []
  const suppliers = suppData.length > 0 ? {
    total: suppData.length,
    confirmed: suppData.filter((s: any) => s.stato_conferma === 'confermato').length,
    pending: suppData.filter((s: any) => s.stato_conferma !== 'confermato').length,
  } : null

  const budgetLines = budgetResult.data ?? []
  let budget: HandoverRecap['budget'] = null
  if (budgetLines.length > 0) {
    const costs = budgetLines.filter((l: any) => l.tipo === 'costo')
    const revenues = budgetLines.filter((l: any) => l.tipo === 'ricavo')
    const totalBudget = revenues.reduce((sum: number, l: any) => sum + (Number(l.importo) || 0), 0)
    const usedBudget = costs.reduce((sum: number, l: any) => sum + (Number(l.importo) || 0), 0)
    if (totalBudget > 0) {
      budget = { total: totalBudget, used: usedBudget, pctUsed: Math.round((usedBudget / totalBudget) * 100) }
    }
  }

  return {
    tasks: {
      total: tasks.length,
      completed,
      open,
      overdue: overdue.length,
      overdueList: overdue.map(t => ({ title: t.titolo, dueDate: t.scadenza })),
    },
    upcomingDeadlines: upcoming.map(t => ({ title: t.titolo, dueDate: t.scadenza })),
    budget,
    suppliers,
    documentsCount: docsResult.count ?? 0,
  }
}

export async function executeHandover(params: HandoverParams): Promise<{ error: string | null }> {
  const { eventId, toUserId, recap, note, stayInTeam, makeResponsible } = params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const fromUserId = user.id

  const { error: insertErr } = await supabase.from('event_handovers').insert({
    event_id: eventId,
    from_user: fromUserId,
    to_user: toUserId,
    recap_snapshot: recap,
    note: note || null,
    stayed_in_team: stayInTeam,
    made_responsible: makeResponsible,
  })
  if (insertErr) {
    logError('handover-service', 'executeHandover:insert', insertErr)
    return { error: insertErr.message }
  }

  const { data: ev } = await supabase
    .from('events')
    .select('project_manager_id, team_member_ids, title')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev) return { error: 'Evento non trovato' }

  let newPm = ev.project_manager_id
  let newTeam: string[] = [...(ev.team_member_ids ?? [])]

  if (makeResponsible) {
    newPm = toUserId
  } else {
    if (!newTeam.includes(toUserId)) {
      newTeam.push(toUserId)
    }
  }

  if (!stayInTeam) {
    newTeam = newTeam.filter(id => id !== fromUserId)
    if (newPm === fromUserId && !makeResponsible) {
      newPm = toUserId
    }
  }

  const updatePatch: Record<string, any> = { team_member_ids: newTeam }
  if (newPm !== ev.project_manager_id) {
    updatePatch.project_manager_id = newPm
  }

  const { error: updateErr } = await supabase
    .from('events')
    .update(updatePatch)
    .eq('id', eventId)
  if (updateErr) {
    logError('handover-service', 'executeHandover:updateEvent', updateErr)
    return { error: updateErr.message }
  }

  const { data: fromProfile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', fromUserId)
    .maybeSingle()
  const fromName = fromProfile ? `${fromProfile.first_name} ${fromProfile.last_name}`.trim() : 'Un collega'

  await supabase.rpc('create_notification_for_user', {
    p_user_id: toUserId,
    p_title: 'Passaggio di consegne',
    p_message: `${fromName} ti ha passato l'evento "${ev.title}"${note ? ` — Nota: ${note}` : ''}`,
    p_type: 'event_handover',
    p_entity_type: 'event',
    p_entity_id: eventId,
  })

  await supabase.from('audit_log').insert({
    user_id: fromUserId,
    action: 'HANDOVER',
    table_name: 'events',
    record_id: eventId,
    old_data: { project_manager_id: ev.project_manager_id, team_member_ids: ev.team_member_ids },
    new_data: { project_manager_id: newPm, team_member_ids: newTeam, to_user: toUserId, made_responsible: makeResponsible, stayed_in_team: stayInTeam },
  })

  return { error: null }
}
