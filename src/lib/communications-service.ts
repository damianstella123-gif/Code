import { supabase } from './supabase'
import { logError } from './error-log'
import { loadUser } from './auth'
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
    logError('communications-service', 'fetchCommunications', error)
    throw new Error(error.message)
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
    logError('communications-service', 'upsertCommunication', error)
    throw new Error(error.message)
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
    logError('communications-service', 'updateCommunication', error)
    throw new Error(error.message)
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
    logError('communications-service', 'markCommunicationRead', getErr)
    throw new Error(getErr.message)
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
    logError('communications-service', 'deleteCommunication', error)
    throw new Error(error.message)
  }
  return true
}

// ─── Thread System ──────────────────────────────────────────────────────────

export interface ThreadRow {
  id: string
  event_id: string
  titolo: string
  creato_da: string
  stato: 'aperto' | 'chiuso' | 'archiviato'
  priorita: 'bassa' | 'normale' | 'alta' | 'critica'
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface ThreadMessageRow {
  id: string
  thread_id: string
  author_id: string
  testo: string
  letto_da: string[]
  edited_at: string | null
  created_at: string
}

export interface ThreadParticipant {
  id: string
  thread_id: string
  user_id: string
  ruolo: 'creator' | 'partecipante' | 'osservatore'
  notifiche_enabled: boolean
}

export async function createThread(
  eventId: string,
  titolo: string,
  priorita: string = 'normale',
  partecipantiIds: string[] = []
): Promise<ThreadRow | null> {
  const user = loadUser()
  if (!user) return null

  const { data: thread, error } = await supabase.from('comunicazioni_thread')
    .insert({
      event_id: eventId,
      titolo,
      priorita,
      creato_da: user.id,
    })
    .select()
    .maybeSingle()

  if (error) {
    logError('communications-service', 'createThread', error)
    return null
  }
  if (!thread) return null

  const participants = [
    { thread_id: thread.id, user_id: user.id, ruolo: 'creator' },
    ...partecipantiIds
      .filter(id => id !== user.id)
      .map(id => ({ thread_id: thread.id, user_id: id, ruolo: 'partecipante' })),
  ]

  await supabase.from('comunicazioni_participants').insert(participants)
  return thread as ThreadRow
}

export async function addMessageToThread(
  threadId: string,
  testo: string
): Promise<ThreadMessageRow | null> {
  const user = loadUser()
  if (!user) return null

  const { data: msg, error } = await supabase.from('comunicazioni_messages')
    .insert({
      thread_id: threadId,
      author_id: user.id,
      testo,
      letto_da: [user.id],
    })
    .select()
    .maybeSingle()

  if (error) {
    logError('communications-service', 'addMessageToThread', error)
    return null
  }

  if (msg) {
    await supabase.from('comunicazioni_thread')
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', threadId)
  }

  return msg as ThreadMessageRow | null
}

export async function getThreads(eventId: string): Promise<ThreadRow[]> {
  const { data, error } = await supabase.from('comunicazioni_thread')
    .select('*')
    .eq('event_id', eventId)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  if (error) {
    logError('communications-service', 'getThreads', error)
    return []
  }
  return (data || []) as ThreadRow[]
}

export async function getThreadMessages(threadId: string): Promise<ThreadMessageRow[]> {
  const { data, error } = await supabase.from('comunicazioni_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (error) {
    logError('communications-service', 'getThreadMessages', error)
    return []
  }
  return (data || []) as ThreadMessageRow[]
}

export async function getThreadParticipants(threadId: string): Promise<ThreadParticipant[]> {
  const { data, error } = await supabase.from('comunicazioni_participants')
    .select('*')
    .eq('thread_id', threadId)

  if (error) {
    logError('communications-service', 'getThreadParticipants', error)
    return []
  }
  return (data || []) as ThreadParticipant[]
}

export async function addParticipant(threadId: string, userId: string, ruolo: string = 'partecipante'): Promise<void> {
  await supabase.from('comunicazioni_participants')
    .upsert({ thread_id: threadId, user_id: userId, ruolo }, { onConflict: 'thread_id,user_id' })
}

export async function markThreadMessagesRead(threadId: string): Promise<void> {
  const user = loadUser()
  if (!user) return

  const { data: msgs } = await supabase.from('comunicazioni_messages')
    .select('id, letto_da')
    .eq('thread_id', threadId)

  if (!msgs) return

  for (const msg of msgs) {
    const existing: string[] = (msg.letto_da || []) as string[]
    if (!existing.includes(user.id)) {
      await supabase.from('comunicazioni_messages')
        .update({ letto_da: [...existing, user.id] })
        .eq('id', msg.id)
    }
  }
}

export async function closeThread(threadId: string): Promise<void> {
  await supabase.from('comunicazioni_thread')
    .update({ stato: 'chiuso', updated_at: new Date().toISOString() })
    .eq('id', threadId)
}

export async function reopenThread(threadId: string): Promise<void> {
  await supabase.from('comunicazioni_thread')
    .update({ stato: 'aperto', updated_at: new Date().toISOString() })
    .eq('id', threadId)
}

export async function getUnreadCountForEvent(eventId: string): Promise<number> {
  const user = loadUser()
  if (!user) return 0

  const { data: threads } = await supabase.from('comunicazioni_thread')
    .select('id')
    .eq('event_id', eventId)

  if (!threads || threads.length === 0) return 0

  const threadIds = threads.map(t => t.id)

  const { data: msgs } = await supabase.from('comunicazioni_messages')
    .select('id, letto_da, author_id')
    .in('thread_id', threadIds)

  if (!msgs) return 0

  return msgs.filter(m =>
    m.author_id !== user.id &&
    !(m.letto_da as string[] || []).includes(user.id)
  ).length
}

export async function deleteMessage(messageId: string): Promise<void> {
  await supabase.from('comunicazioni_messages').delete().eq('id', messageId)
}

export async function editMessage(messageId: string, newText: string): Promise<void> {
  await supabase.from('comunicazioni_messages')
    .update({ testo: newText, edited_at: new Date().toISOString() })
    .eq('id', messageId)
}
