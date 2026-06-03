import { supabase } from './supabase'

/**
 * Test temporaneo di verifica connessione Supabase.
 * Stampa in console l'esito di una semplice SELECT su una tabella esistente.
 * Da rimuovere/disabilitare una volta confermata la connessione.
 */
export interface SupabaseConnectionStatus {
  ok: boolean
  url: string | undefined
  hasAnonKey: boolean
  table: string
  count: number | null
  error?: string
  durationMs: number
}

export async function testSupabaseConnection(): Promise<SupabaseConnectionStatus> {
  const start = performance.now()
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const hasAnonKey = typeof anonKey === 'string' && anonKey.length > 0

  if (!url || !hasAnonKey) {
    return {
      ok: false,
      url,
      hasAnonKey,
      table: 'profiles',
      count: null,
      error: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY',
      durationMs: Math.round(performance.now() - start),
    }
  }

  // Lettura HEAD count: piu' leggera di SELECT *.
  // `profiles` esiste in tutti gli ambienti (creata in Step 1 dell'auth setup).
  const { count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  const durationMs = Math.round(performance.now() - start)

  if (error) {
    return {
      ok: false,
      url,
      hasAnonKey,
      table: 'profiles',
      count: null,
      error: error.message,
      durationMs,
    }
  }

  return {
    ok: true,
    url,
    hasAnonKey,
    table: 'profiles',
    count: count ?? 0,
    durationMs,
  }
}

export function logSupabaseConnectionStatus(): void {
  testSupabaseConnection()
    .then(s => {
      if (s.ok) {
        console.info(
          `[supabase-test] OK — url=${s.url} table=${s.table} count=${s.count} (${s.durationMs}ms)`,
        )
      } else {
        console.error(
          `[supabase-test] FAILED — url=${s.url ?? 'missing'} hasAnonKey=${s.hasAnonKey} error="${s.error}" (${s.durationMs}ms)`,
        )
      }
    })
    .catch(err => {
      console.error('[supabase-test] UNEXPECTED ERROR', err)
    })
}
