import { supabase } from './supabase'

export interface EmailMessage {
  id: string
  event_id: string | null
  client_id: string | null
  recipient_email: string
  subject: string
  body: string
  attachments: string[]
  status: 'bozza' | 'inviata' | 'errore'
  sent_at: string | null
  created_by: string
  created_at: string
}

export async function fetchEmails(): Promise<EmailMessage[]> {
  const { data, error } = await supabase
    .from('email_messages')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error('fetchEmails', error); return [] }
  return (data ?? []) as EmailMessage[]
}

export async function fetchEmailsByEvent(eventId: string): Promise<EmailMessage[]> {
  const { data, error } = await supabase
    .from('email_messages')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) { console.error('fetchEmailsByEvent', error); return [] }
  return (data ?? []) as EmailMessage[]
}

export async function fetchEmailsByClient(clientId: string): Promise<EmailMessage[]> {
  const { data, error } = await supabase
    .from('email_messages')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) { console.error('fetchEmailsByClient', error); return [] }
  return (data ?? []) as EmailMessage[]
}

export async function upsertEmail(email: Partial<EmailMessage> & { recipient_email: string; subject: string; body: string; created_by: string }): Promise<EmailMessage | null> {
  const { data, error } = await supabase
    .from('email_messages')
    .upsert(email)
    .select()
    .maybeSingle()
  if (error) { console.error('upsertEmail', error); return null }
  return data as EmailMessage | null
}

export async function deleteEmail(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('email_messages')
    .delete()
    .eq('id', id)
  if (error) { console.error('deleteEmail', error); return false }
  return true
}

export async function sendEmail(id: string): Promise<{ success: boolean; error?: string }> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email_id: id }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Network error' }))
    return { success: false, error: err.error || `HTTP ${response.status}` }
  }
  const result = await response.json()
  if (result.error) return { success: false, error: result.error }
  return { success: true }
}
