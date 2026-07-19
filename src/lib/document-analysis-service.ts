import { supabase } from './supabase'

interface AnalysisResult {
  success: boolean
  status?: string
  chunks_created?: number
  error?: string
}

const ERROR_MAP: Record<string, string> = {
  'Autenticazione richiesta': 'Sessione scaduta. Effettua nuovamente il login.',
  'Non autorizzato': 'Sessione scaduta. Effettua nuovamente il login.',
  'Documento non trovato o accesso negato': 'Documento non trovato o accesso negato.',
}

function translateError(message: string): string {
  if (ERROR_MAP[message]) return ERROR_MAP[message]
  if (message.includes('Permesso negato')) return 'Non hai i permessi per elaborare questo documento.'
  if (message.includes('troppo grande')) return 'Il file supera il limite di dimensione consentito.'
  if (message.includes('ANTHROPIC_API_KEY')) return 'Servizio di analisi non configurato. Contattare l\'amministratore.'
  if (message.includes('Formato legacy')) return 'Formato non supportato. Convertire in DOCX/XLSX/PPTX.'
  if (message.includes('limite di token')) return 'Documento troppo lungo per l\'analisi automatica.'
  if (message.includes('Nessun testo estraibile')) return 'Nessun testo estraibile dal documento.'
  if (message.length > 200) return 'Errore durante l\'elaborazione del documento.'
  return message
}

export async function analyzeDocument(documentId: string, force = false): Promise<AnalysisResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return { success: false, error: 'Sessione scaduta. Effettua nuovamente il login.' }
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-ingest`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ document_id: documentId, force }),
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: translateError(data.error || 'Errore sconosciuto') }
    }

    if (data.status === 'errore' || data.status === 'non_supportato') {
      return { success: false, status: data.status, error: translateError(data.reason || 'Errore durante l\'analisi') }
    }

    return { success: true, status: data.status, chunks_created: data.chunks_created }
  } catch {
    return { success: false, error: 'Impossibile raggiungere il server. Verifica la connessione.' }
  }
}
