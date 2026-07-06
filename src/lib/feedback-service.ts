import { supabase } from './supabase'

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
    console.error('fetchFeedbacks error:', error.message)
    return []
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

  if (error) return { data: null, error: error.message }
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

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: 'Elemento non trovato o permesso negato' }
  return { data: data as Feedback, error: null }
}

export async function deleteFeedback(id: string): Promise<{ success: boolean; error: string | null }> {
  const uid = await getAuthUid()
  if (!uid) return { success: false, error: 'Utente non autenticato' }

  const { error } = await supabase.from('feedback').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  return { success: true, error: null }
}
