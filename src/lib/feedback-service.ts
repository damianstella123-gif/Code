import { supabase } from './supabase'
import { logError } from './error-log'

export interface Feedback {
  id: string
  titolo: string
  descrizione: string
  categoria: 'Bug' | 'Miglioramento' | 'Funzione mancante' | 'Idea'
  priorita: 'Bassa' | 'Media' | 'Alta'
  modulo: string
  stato: 'Nuovo' | 'In valutazione' | 'Pianificato' | 'Risolto'
  autore_id: string | null
  autore_nome: string
  created_at: string
  updated_at: string
}

export interface FeedbackVoteSummary {
  feedback_id: string
  count: number
  voted_by_me: boolean
}

export interface FeedbackComment {
  id: string
  feedback_id: string
  user_id: string
  author_name: string
  body: string
  created_at: string
  updated_at: string
}

export interface FeedbackResult {
  data: Feedback | null
  error: string | null
}

export async function fetchFeedbacks(): Promise<Feedback[]> {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    logError('feedback-service', 'fetchFeedbacks', error)
    throw new Error(error.message)
  }
  return (data ?? []) as Feedback[]
}

async function getAuthUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

export async function insertFeedback(
  f: Omit<Feedback, 'id' | 'created_at' | 'updated_at' | 'autore_id'>,
): Promise<FeedbackResult> {
  const uid = await getAuthUid()
  if (!uid) return { data: null, error: 'Utente non autenticato' }

  const { data, error } = await supabase
    .from('feedback')
    .insert({
      ...f,
      autore_id: uid,
      updated_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle()

  if (error) {
    logError('feedback-service', 'insertFeedback', error)
    throw new Error(error.message)
  }
  return { data: data as Feedback | null, error: null }
}

export async function updateFeedback(
  id: string,
  fields: Partial<Omit<Feedback, 'id' | 'created_at' | 'autore_id'>>,
): Promise<FeedbackResult> {
  const uid = await getAuthUid()
  if (!uid) return { data: null, error: 'Utente non autenticato' }

  const { data, error } = await supabase
    .from('feedback')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) {
    logError('feedback-service', 'updateFeedback', error)
    throw new Error(error.message)
  }
  if (!data) return { data: null, error: 'Elemento non trovato o permesso negato' }
  return { data: data as Feedback, error: null }
}

export async function deleteFeedback(id: string): Promise<{ success: boolean; error: string | null }> {
  const uid = await getAuthUid()
  if (!uid) return { success: false, error: 'Utente non autenticato' }

  const { error } = await supabase.from('feedback').delete().eq('id', id)
  if (error) {
    logError('feedback-service', 'deleteFeedback', error)
    throw new Error(error.message)
  }
  return { success: true, error: null }
}

// ─── Votes ─────────────────────────────────────────────────────────────────

export async function fetchVoteSummaries(): Promise<Map<string, FeedbackVoteSummary>> {
  const uid = await getAuthUid()
  const { data, error } = await supabase
    .from('feedback_votes')
    .select('feedback_id, user_id')

  if (error) {
    logError('feedback-service', 'fetchVoteSummaries', error)
    return new Map()
  }

  const map = new Map<string, FeedbackVoteSummary>()
  for (const row of data ?? []) {
    const existing = map.get(row.feedback_id)
    if (existing) {
      existing.count += 1
      if (row.user_id === uid) existing.voted_by_me = true
    } else {
      map.set(row.feedback_id, {
        feedback_id: row.feedback_id,
        count: 1,
        voted_by_me: row.user_id === uid,
      })
    }
  }
  return map
}

export async function toggleVote(feedbackId: string): Promise<boolean> {
  const uid = await getAuthUid()
  if (!uid) return false

  const { data: existing } = await supabase
    .from('feedback_votes')
    .select('feedback_id')
    .eq('feedback_id', feedbackId)
    .eq('user_id', uid)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('feedback_votes')
      .delete()
      .eq('feedback_id', feedbackId)
      .eq('user_id', uid)
    return false
  } else {
    await supabase
      .from('feedback_votes')
      .insert({ feedback_id: feedbackId, user_id: uid })
    return true
  }
}

// ─── Comments ──────────────────────────────────────────────────────────────

export async function fetchComments(feedbackId: string): Promise<FeedbackComment[]> {
  const { data, error } = await supabase
    .from('feedback_comments')
    .select('*')
    .eq('feedback_id', feedbackId)
    .order('created_at', { ascending: true })

  if (error) {
    logError('feedback-service', 'fetchComments', error)
    return []
  }
  return (data ?? []) as FeedbackComment[]
}

export async function fetchCommentCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('feedback_comments')
    .select('feedback_id')

  if (error) {
    logError('feedback-service', 'fetchCommentCounts', error)
    return new Map()
  }

  const map = new Map<string, number>()
  for (const row of data ?? []) {
    map.set(row.feedback_id, (map.get(row.feedback_id) ?? 0) + 1)
  }
  return map
}

export async function addComment(feedbackId: string, body: string, authorName: string): Promise<FeedbackComment | null> {
  const uid = await getAuthUid()
  if (!uid) return null

  const { data, error } = await supabase
    .from('feedback_comments')
    .insert({ feedback_id: feedbackId, user_id: uid, author_name: authorName, body })
    .select()
    .maybeSingle()

  if (error) {
    logError('feedback-service', 'addComment', error)
    return null
  }
  return data as FeedbackComment | null
}

export async function deleteComment(commentId: string): Promise<boolean> {
  const { error } = await supabase
    .from('feedback_comments')
    .delete()
    .eq('id', commentId)

  if (error) {
    logError('feedback-service', 'deleteComment', error)
    return false
  }
  return true
}
