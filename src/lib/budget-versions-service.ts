import { supabase } from '@/lib/supabase'

interface CloneInput {
  sourceVersionId: string
  targetType: 'preventivo' | 'consuntivo'
  targetName: string
}

interface CloneResult {
  success: boolean
  newVersionId?: string
  error?: string
}

const ERROR_MAP: Record<string, string> = {
  AUTH_REQUIRED: 'Devi essere autenticato per eseguire questa operazione.',
  SOURCE_NOT_FOUND: 'La versione sorgente non esiste o è stata eliminata.',
  NOT_PREVENTIVO: 'Il consuntivo può essere creato solo da un preventivo.',
  NOT_APPROVED: 'Il preventivo deve essere approvato prima di creare il consuntivo.',
  CONSUNTIVO_EXISTS: 'Esiste già un consuntivo per questo preventivo.',
  INVALID_TYPE: 'Tipo di versione non valido.',
}

function translateError(msg: string): string {
  for (const [code, label] of Object.entries(ERROR_MAP)) {
    if (msg.includes(code)) return label
  }
  if (msg.includes('permission denied') || msg.includes('insufficient_privilege')) {
    return 'Permessi insufficienti per questa operazione.'
  }
  return `Errore durante la duplicazione: ${msg}`
}

export async function cloneBudgetVersion(input: CloneInput): Promise<CloneResult> {
  const { data, error } = await supabase.rpc('clone_budget_version', {
    p_source_version_id: input.sourceVersionId,
    p_target_type: input.targetType,
    p_target_name: input.targetName,
  })

  if (error) {
    return { success: false, error: translateError(error.message) }
  }

  if (!data) {
    return { success: false, error: 'La funzione non ha restituito un ID valido.' }
  }

  return { success: true, newVersionId: data as string }
}
