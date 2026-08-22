import { supabase } from './supabase'

export interface AiPill {
  id: string
  title: string
  body: string
  quiz_json: { question: string; options: string[]; correct: number } | null
  sort_order: number
  created_at: string
}

export interface AiPillRead {
  pill_id: string
  user_id: string
  read_at: string
}

export interface AiPillReadWithProfile {
  pill_id: string
  user_id: string
  read_at: string
  nome?: string
}

export async function fetchPills(): Promise<AiPill[]> {
  const { data, error } = await supabase
    .from('ai_pills')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchMyReads(): Promise<AiPillRead[]> {
  const { data, error } = await supabase
    .from('ai_pill_reads')
    .select('*')
  if (error) throw error
  return data ?? []
}

export async function markPillRead(pillId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('ai_pill_reads')
    .upsert({ pill_id: pillId, user_id: user.id }, { onConflict: 'pill_id,user_id' })
  if (error) throw error
}

export async function createPill(pill: { title: string; body: string; quiz_json?: AiPill['quiz_json']; sort_order?: number }): Promise<AiPill> {
  const { data, error } = await supabase
    .from('ai_pills')
    .insert({ title: pill.title, body: pill.body, quiz_json: pill.quiz_json ?? null, sort_order: pill.sort_order ?? 0 })
    .select()
    .maybeSingle()
  if (error) throw error
  return data!
}

export async function updatePill(id: string, updates: Partial<Pick<AiPill, 'title' | 'body' | 'quiz_json' | 'sort_order'>>): Promise<void> {
  const { error } = await supabase
    .from('ai_pills')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}

export async function deletePill(id: string): Promise<void> {
  const { error } = await supabase
    .from('ai_pills')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function fetchAllReadsAdmin(): Promise<AiPillReadWithProfile[]> {
  const { data: reads, error } = await supabase
    .from('ai_pill_reads')
    .select('pill_id, user_id, read_at')
    .order('read_at', { ascending: false })
  if (error) throw error
  if (!reads || reads.length === 0) return []

  const userIds = [...new Set(reads.map(r => r.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, nome')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p.nome]))

  return reads.map(r => ({
    pill_id: r.pill_id,
    user_id: r.user_id,
    read_at: r.read_at,
    nome: profileMap.get(r.user_id) ?? undefined,
  }))
}
