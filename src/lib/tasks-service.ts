import { supabase } from './supabase'
import type { Task } from '@/data/tasks'

interface TaskRow {
  id: string
  event_id: string | null
  title: string
  description: string
  assigned_to: string
  priority: Task['priorita']
  status: Task['stato']
  due_date: string
  created_at: string
  updated_at: string
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    titolo: r.title,
    descrizione: r.description ?? '',
    assegnatario: r.assigned_to ?? '',
    evento: r.event_id,
    priorita: r.priority,
    stato: r.status,
    scadenza: r.due_date,
    creatoIl: r.created_at?.slice(0, 10) ?? '',
  }
}

function taskToRow(t: Task): Omit<TaskRow, 'updated_at'> {
  return {
    id: t.id,
    event_id: t.evento && t.evento.length > 0 ? t.evento : null,
    title: t.titolo,
    description: t.descrizione ?? '',
    assigned_to: t.assegnatario ?? '',
    priority: t.priorita,
    status: t.stato,
    due_date: t.scadenza,
    created_at: t.creatoIl ? new Date(t.creatoIl).toISOString() : new Date().toISOString(),
  }
}

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true })
    .limit(500)
  if (error) {
    console.error('fetchTasks error:', error.message)
    return []
  }
  return ((data ?? []) as TaskRow[]).map(rowToTask)
}

export async function fetchTasksByEvent(eventId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('event_id', eventId)
    .order('due_date', { ascending: true })
  if (error) {
    console.error('fetchTasksByEvent error:', error.message)
    return []
  }
  return ((data ?? []) as TaskRow[]).map(rowToTask)
}

export async function createTask(task: Task): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(taskToRow(task))
    .select()
    .maybeSingle()
  if (error) {
    console.error('createTask error:', error.message)
    return null
  }
  return data ? rowToTask(data as TaskRow) : null
}

export async function upsertTask(task: Task): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .upsert(taskToRow(task), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('upsertTask error:', error.message)
    return null
  }
  return data ? rowToTask(data as TaskRow) : null
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<Task | null> {
  const dbPatch: Partial<TaskRow> = {}
  if (patch.titolo !== undefined) dbPatch.title = patch.titolo
  if (patch.descrizione !== undefined) dbPatch.description = patch.descrizione
  if (patch.assegnatario !== undefined) dbPatch.assigned_to = patch.assegnatario
  if (patch.evento !== undefined) dbPatch.event_id = patch.evento && patch.evento.length > 0 ? patch.evento : null
  if (patch.priorita !== undefined) dbPatch.priority = patch.priorita
  if (patch.stato !== undefined) dbPatch.status = patch.stato
  if (patch.scadenza !== undefined) dbPatch.due_date = patch.scadenza

  const { data, error } = await supabase
    .from('tasks')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    console.error('updateTask error:', error.message)
    return null
  }
  return data ? rowToTask(data as TaskRow) : null
}

export async function changeTaskStatus(id: string, status: Task['stato']): Promise<Task | null> {
  return updateTask(id, { stato: status })
}

export async function deleteTask(id: string): Promise<boolean> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) {
    console.error('deleteTask error:', error.message)
    return false
  }
  return true
}
