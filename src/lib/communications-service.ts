import { supabase } from './supabase'
import type { Messaggio, Priorita, TipoCanale } from '@/data/comunicazioni'

interface CommunicationRow {
  id: string
  event_id: string | null
  task_id: string | null
  sender: string
  recipient: string | null
  recipients: string[] | null
  subject: string
  content: string
  status: 'sent' | 'draft' | 'archived'
  priority: Priorita
  channel: TipoCanale
  sent_at: string | null
  read_by: string[] | null
  attachments: string[] | null
  created_at: string
  updated_at: string
}

function rowToMsg(r: CommunicationRow): Messaggio {
  const recipients = (r.recipients && r.recipients.length > 0)
    ? r.recipients
    : (r.recipient ? [r.recipient] : [])
  return {
    id: r.id,
    mittente: r.sender,
    destinatari: recipients,
    oggetto: r.subject,
    corpo: r.content ?? '',
    eventoId: r.event_id,
    taskId: r.task_id,
    priorita: r.priority,
    data: r.sent_at ?? r.created_at,
    letto: r.read_by ?? [],
    canale: r.channel,
    allegati: r.attachments ?? [],
  }
}

function msgToRow(m: Messaggio): Omit<CommunicationRow, 'created_at' | 'updated_at'> {
  return {
    id: m.id,
    event_id: m.eventoId && m.eventoId.length > 0 ? m.eventoId : null,
    task_id: m.taskId && m.taskId.length > 0 ? m.taskId : null,
    sender: m.mittente,
    recipient: m.destinatari[0] ?? null,
    recipients: m.destinatari ?? [],
    subject: m.oggetto,
    content: m.corpo ?? '',
    status: 'sent',
    priority: m.priorita,
    channel: m.canale,
    sent_at: m.data ? new Date(m.data).toISOString() : new Date().toISOString(),
    read_by: m.letto ?? [],
    attachments: m.allegati ?? [],
  }
}

export async function fetchCommunications(): Promise<Messaggio[]> {
  const { data, error } = await supabase
    .from('communications')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(1000)
  if (error) {
    console.error('fetchCommunications error:', error.message)
    return []
  }
  return ((data ?? []) as CommunicationRow[]).map(rowToMsg)
}

export async function upsertCommunication(msg: Messaggio): Promise<Messaggio | null> {
  const { data, error } = await supabase
    .from('communications')
    .upsert(msgToRow(msg), { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('upsertCommunication error:', error.message)
    return null
  }
  return data ? rowToMsg(data as CommunicationRow) : null
}

export async function updateCommunication(id: string, patch: Partial<Messaggio>): Promise<Messaggio | null> {
  const dbPatch: Partial<CommunicationRow> = {}
  if (patch.mittente !== undefined) dbPatch.sender = patch.mittente
  if (patch.destinatari !== undefined) {
    dbPatch.recipients = patch.destinatari
    dbPatch.recipient = patch.destinatari[0] ?? null
  }
  if (patch.oggetto !== undefined) dbPatch.subject = patch.oggetto
  if (patch.corpo !== undefined) dbPatch.content = patch.corpo
  if (patch.eventoId !== undefined) dbPatch.event_id = patch.eventoId && patch.eventoId.length > 0 ? patch.eventoId : null
  if (patch.taskId !== undefined) dbPatch.task_id = patch.taskId && patch.taskId.length > 0 ? patch.taskId : null
  if (patch.priorita !== undefined) dbPatch.priority = patch.priorita
  if (patch.canale !== undefined) dbPatch.channel = patch.canale
  if (patch.data !== undefined) dbPatch.sent_at = new Date(patch.data).toISOString()
  if (patch.letto !== undefined) dbPatch.read_by = patch.letto
  if (patch.allegati !== undefined) dbPatch.attachments = patch.allegati

  const { data, error } = await supabase
    .from('communications')
    .update(dbPatch)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) {
    console.error('updateCommunication error:', error.message)
    return null
  }
  return data ? rowToMsg(data as CommunicationRow) : null
}

export async function markCommunicationRead(id: string, userId: string): Promise<Messaggio | null> {
  const { data: current, error: getErr } = await supabase
    .from('communications')
    .select('read_by')
    .eq('id', id)
    .maybeSingle()
  if (getErr) {
    console.error('markCommunicationRead get error:', getErr.message)
    return null
  }
  const existing: string[] = (current?.read_by ?? []) as string[]
  if (existing.includes(userId)) {
    const { data: row } = await supabase.from('communications').select('*').eq('id', id).maybeSingle()
    return row ? rowToMsg(row as CommunicationRow) : null
  }
  return updateCommunication(id, { letto: [...existing, userId] })
}

export async function deleteCommunication(id: string): Promise<boolean> {
  const { error } = await supabase.from('communications').delete().eq('id', id)
  if (error) {
    console.error('deleteCommunication error:', error.message)
    return false
  }
  return true
}
