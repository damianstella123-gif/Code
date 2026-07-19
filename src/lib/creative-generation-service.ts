import { supabase } from './supabase'
import { logError } from './error-log'

export type CreativeGenerationStatus =
  | 'queued'
  | 'generating'
  | 'completed'
  | 'error'

export interface CreativeGeneration {
  id: string
  creative_project_id: string | null
  template_id: string
  event_id: string | null
  client_id: string | null
  generation_status: CreativeGenerationStatus
  input_payload: Record<string, unknown>
  output_path: string | null
  error_message: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface GeneratePptxResult {
  generation_id: string
  status: 'completed'
}

export async function generateCreativePptx(
  creativeProjectId: string,
  templateId: string,
  values: Record<string, string>,
): Promise<GeneratePptxResult> {
  if (!creativeProjectId || typeof creativeProjectId !== 'string') {
    throw new Error('ID progetto creativo non valido.')
  }
  if (!templateId || typeof templateId !== 'string') {
    throw new Error('ID template non valido.')
  }
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error('I valori forniti non sono validi.')
  }

  const { data, error } = await supabase.functions.invoke(
    'creative-generate-pptx',
    {
      body: {
        creative_project_id: creativeProjectId,
        template_id: templateId,
        values,
      },
    },
  )

  if (error) {
    logError('creative-generation', 'generateCreativePptx', error)

    if (error.message?.includes('401') || error.message?.includes('Auth')) {
      throw new Error('Sessione scaduta. Effettua nuovamente il login.')
    }
    if (error.message?.includes('403')) {
      throw new Error('Non hai i permessi per questa operazione.')
    }
    if (error.message?.includes('404')) {
      throw new Error('Progetto o template non trovato.')
    }
    throw new Error('Errore nella generazione del documento.')
  }

  if (
    !data ||
    typeof data !== 'object' ||
    typeof data.generation_id !== 'string' ||
    data.status !== 'completed'
  ) {
    throw new Error('Risposta non valida dal servizio di generazione.')
  }

  return {
    generation_id: data.generation_id,
    status: 'completed',
  }
}

export async function fetchCreativeGenerations(
  creativeProjectId: string,
): Promise<CreativeGeneration[]> {
  if (!creativeProjectId) {
    throw new Error('ID progetto creativo richiesto.')
  }

  const { data, error } = await supabase
    .from('creative_generations')
    .select('*')
    .eq('creative_project_id', creativeProjectId)
    .order('created_at', { ascending: false })

  if (error) {
    logError('creative-generation', 'fetchCreativeGenerations', error)
    throw new Error('Impossibile caricare le generazioni.')
  }

  return (data ?? []) as CreativeGeneration[]
}

export async function getCreativeGenerationDownloadUrl(
  outputPath: string,
): Promise<string> {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('Percorso file non valido.')
  }

  const { data, error } = await supabase.storage
    .from('creative-files')
    .createSignedUrl(outputPath, 300)

  if (error || !data?.signedUrl) {
    logError('creative-generation', 'getCreativeGenerationDownloadUrl', error)
    throw new Error('Impossibile generare il link di download.')
  }

  return data.signedUrl
}
