import JSZip from 'jszip'
import { supabase } from './supabase'
import { logError } from './error-log'

export interface CreativeTemplate {
  id: string
  name: string
  description: string
  template_type: string
  file_path: string
  original_file_name: string
  file_size: number
  mime_type: string
  placeholder_keys: string[]
  client_id: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PptxInspectionResult {
  valid: boolean
  placeholderKeys: string[]
  warnings: string[]
  error?: string
}

interface UploadParams {
  name: string
  description?: string
  file: File
  clientId?: string | null
}

const PLACEHOLDER_REGEX = /\{\{([A-Z0-9_]+)\}\}/g
const PARTIAL_PLACEHOLDER_REGEX = /\{\{|\}\}/g
const MAX_FILE_SIZE = 25 * 1024 * 1024
const BUCKET = 'templates'

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function extractTextRuns(xml: string): string[] {
  const runs: string[] = []
  const atRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g
  let match: RegExpExecArray | null
  while ((match = atRegex.exec(xml)) !== null) {
    runs.push(decodeXmlEntities(match[1]))
  }
  return runs
}

export async function inspectPptxTemplate(file: File): Promise<PptxInspectionResult> {
  if (!file.name.toLowerCase().endsWith('.pptx')) {
    return { valid: false, placeholderKeys: [], warnings: [], error: 'Il file deve essere in formato .pptx' }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, placeholderKeys: [], warnings: [], error: 'Il file supera il limite di 25 MB' }
  }

  let zip: JSZip
  try {
    const buffer = await file.arrayBuffer()
    zip = await JSZip.loadAsync(buffer)
  } catch {
    return { valid: false, placeholderKeys: [], warnings: [], error: 'File PPTX corrotto o non leggibile' }
  }

  if (!zip.file('[Content_Types].xml')) {
    return { valid: false, placeholderKeys: [], warnings: [], error: 'Archivio non valido: manca [Content_Types].xml' }
  }
  if (!zip.file('ppt/presentation.xml')) {
    return { valid: false, placeholderKeys: [], warnings: [], error: 'Archivio non valido: manca ppt/presentation.xml' }
  }

  const placeholders = new Set<string>()
  const warnings: string[] = []
  let hasPartialSyntax = false

  const slideFiles = Object.keys(zip.files).filter(
    name => /^ppt\/slides\/slide\d+\.xml$/.test(name)
  )

  for (const slidePath of slideFiles) {
    const content = await zip.file(slidePath)!.async('string')
    const runs = extractTextRuns(content)

    for (const run of runs) {
      let m: RegExpExecArray | null
      PLACEHOLDER_REGEX.lastIndex = 0
      while ((m = PLACEHOLDER_REGEX.exec(run)) !== null) {
        placeholders.add(m[1])
      }
      PARTIAL_PLACEHOLDER_REGEX.lastIndex = 0
      if (PARTIAL_PLACEHOLDER_REGEX.test(run) && !PLACEHOLDER_REGEX.test(run)) {
        hasPartialSyntax = true
      }
    }
  }

  if (placeholders.size === 0) {
    warnings.push('Nessun placeholder valido trovato nel template.')
  }
  if (hasPartialSyntax) {
    warnings.push(
      'Rilevata sintassi parziale {{ o }}. Un placeholder potrebbe essere diviso tra più formattazioni di testo. ' +
      'Assicurati che ogni {{NOME}} sia in un unico blocco di testo.'
    )
  }

  const sorted = [...placeholders].sort()
  return { valid: true, placeholderKeys: sorted, warnings }
}

export async function checkCanManageGlobalCreative(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!data) return false
  return ['Admin', 'Super Admin', 'Regista'].includes(data.role)
}

export async function fetchCreativeTemplates(): Promise<CreativeTemplate[]> {
  const { data, error } = await supabase
    .from('creative_templates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    logError('creative-template-service', 'fetchCreativeTemplates', error)
    return []
  }
  return data ?? []
}

export async function uploadCreativeTemplate(params: UploadParams): Promise<{ data?: CreativeTemplate; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessione scaduta. Effettua nuovamente il login.' }

  const canManage = await checkCanManageGlobalCreative()
  if (!canManage) return { error: 'Non hai i permessi per gestire i template.' }

  const inspection = await inspectPptxTemplate(params.file)
  if (!inspection.valid) return { error: inspection.error ?? 'File PPTX non valido.' }

  const templateId = crypto.randomUUID()
  const filePath = `${templateId}/source.pptx`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, params.file, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      upsert: false,
    })

  if (uploadError) {
    logError('creative-template-service', 'uploadCreativeTemplate:storage', uploadError)
    return { error: 'Errore durante il caricamento del file. Riprova.' }
  }

  const row = {
    id: templateId,
    name: params.name.trim(),
    description: (params.description ?? '').trim(),
    template_type: 'pptx',
    file_path: filePath,
    original_file_name: params.file.name,
    file_size: params.file.size,
    mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    placeholder_keys: inspection.placeholderKeys,
    client_id: params.clientId || null,
    is_active: true,
    created_by: user.id,
  }

  const { data, error: dbError } = await supabase
    .from('creative_templates')
    .insert(row)
    .select()
    .single()

  if (dbError) {
    logError('creative-template-service', 'uploadCreativeTemplate:db', dbError)
    await supabase.storage.from(BUCKET).remove([filePath])
    return { error: 'Errore durante il salvataggio del template. Riprova.' }
  }

  return { data }
}

export async function setCreativeTemplateActive(id: string, active: boolean): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('creative_templates')
    .update({ is_active: active })
    .eq('id', id)
  if (error) {
    logError('creative-template-service', 'setCreativeTemplateActive', error)
    return { error: 'Errore durante l\'aggiornamento dello stato.' }
  }
  return {}
}

export async function getCreativeTemplateDownloadUrl(filePath: string): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 300)
  if (error || !data?.signedUrl) {
    logError('creative-template-service', 'getCreativeTemplateDownloadUrl', error)
    return { error: 'Impossibile generare il link di download.' }
  }
  return { url: data.signedUrl }
}
