import { supabase } from './supabase'
import { logError } from './error-log'

export interface ChatConversation {
  id: string
  title: string | null
  is_group: boolean
  event_id: string | null
  participant_ids: string[]
  created_at: string
  updated_at: string
  last_message_at: string | null
  last_message_preview: string | null
}

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  read_by: string[]
}

export async function fetchConversations(): Promise<ChatConversation[]> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
  if (error) {
    logError('chat-service', 'fetchConversations', error)
    throw new Error(error.message)
  }
  return (data ?? []) as ChatConversation[]
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) {
    logError('chat-service', 'fetchMessages', error)
    throw new Error(error.message)
  }
  return (data ?? []) as ChatMessage[]
}

export async function sendMessage(conversationId: string, senderId: string, content: string): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content, read_by: [senderId] })
    .select()
    .maybeSingle()
  if (error) {
    logError('chat-service', 'sendMessage', error)
    throw new Error(error.message)
  }

  await supabase
    .from('chat_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.slice(0, 100),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  return data as ChatMessage | null
}

export async function markMessagesRead(conversationId: string, userId: string): Promise<void> {
  const { data: unread } = await supabase
    .from('chat_messages')
    .select('id, read_by')
    .eq('conversation_id', conversationId)
    .not('read_by', 'cs', `{${userId}}`)

  if (!unread || unread.length === 0) return

  await Promise.all(
    unread.map(msg =>
      supabase
        .from('chat_messages')
        .update({ read_by: [...(msg.read_by as string[]), userId] })
        .eq('id', msg.id)
    )
  )
}

export async function createConversation(
  participantIds: string[],
  title?: string,
  eventId?: string,
): Promise<ChatConversation | null> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({
      participant_ids: participantIds,
      title: title || null,
      is_group: participantIds.length > 2,
      event_id: eventId || null,
    })
    .select()
    .maybeSingle()
  if (error) {
    logError('chat-service', 'createConversation', error)
    throw new Error(error.message)
  }
  return data as ChatConversation | null
}

export async function findDirectConversation(userId1: string, userId2: string): Promise<ChatConversation | null> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('is_group', false)
    .contains('participant_ids', [userId1, userId2])
  if (error) {
    logError('chat-service', 'findDirectConversation', error)
    throw new Error(error.message)
  }
  const match = (data ?? []).find(
    (c: ChatConversation) => c.participant_ids.length === 2
  )
  return (match as ChatConversation) ?? null
}

export async function updateConversationParticipants(conversationId: string, participantIds: string[]): Promise<boolean> {
  const { error } = await supabase
    .from('chat_conversations')
    .update({ participant_ids: participantIds, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
  if (error) {
    logError('chat-service', 'updateConversationParticipants', error)
    throw new Error(error.message)
  }
  return true
}
