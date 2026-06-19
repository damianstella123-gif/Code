import { supabase } from './supabase'
import { loadUser } from './auth'

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

export async function upsertFeedback(f: Omit<Feedback, 'created_at' | 'updated_at'>): Promise<Feedback | null> {
  const user = loadUser()
  const payload = {
    ...f,
    autore_id: f.autore_id || user?.id || null,
    autore_nome: f.autore_nome || (user ? `${user.first_name} ${user.last_name}` : ''),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('feedback')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .maybeSingle()
  if (error) {
    console.error('upsertFeedback error:', error.message)
    return null
  }
  return data as Feedback | null
}

export async function deleteFeedback(id: string): Promise<boolean> {
  const { error } = await supabase.from('feedback').delete().eq('id', id)
  if (error) {
    console.error('deleteFeedback error:', error.message)
    return false
  }
  return true
}
