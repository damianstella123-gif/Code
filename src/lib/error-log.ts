import { supabase } from './supabase'

export async function logError(
  pagina: string,
  azione: string,
  error: unknown,
  dettaglio?: Record<string, unknown>
): Promise<void> {
  const messaggio = error instanceof Error ? error.message : String(error)
  console.error(`[${pagina}] ${azione}:`, messaggio)

  try {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('error_log').insert({
      user_id: session?.user?.id ?? null,
      pagina,
      azione,
      messaggio,
      dettaglio: dettaglio ?? {},
    })
  } catch {
    // If logging itself fails, don't crash the app
  }
}

export async function fetchErrorLog(limit = 50): Promise<ErrorLogEntry[]> {
  const { data, error } = await supabase
    .from('error_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('fetchErrorLog:', error.message)
    return []
  }
  return data ?? []
}

export interface ErrorLogEntry {
  id: string
  created_at: string
  user_id: string | null
  pagina: string
  azione: string
  messaggio: string
  dettaglio: Record<string, unknown>
}
