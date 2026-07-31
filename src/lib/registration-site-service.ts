import { supabase } from './supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SiteStatus = 'draft' | 'published' | 'closed'
export type FieldType = 'text' | 'email' | 'phone' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date'

export interface RegistrationSite {
  id: string
  event_id: string
  slug: string
  status: SiteStatus
  title: string
  subtitle: string | null
  description: string | null
  logo_url: string | null
  hero_image_url: string | null
  privacy_url: string | null
  privacy_text: string | null
  confirmation_message: string | null
  capacity: number | null
  waitlist_enabled: boolean
  opens_at: string | null
  closes_at: string | null
  published_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  theme: Record<string, unknown> | null
  content: Record<string, unknown> | null
  settings: Record<string, unknown> | null
}

export interface RegistrationFormField {
  id: string
  site_id: string
  field_key: string
  label: string
  field_type: FieldType
  required: boolean
  options: string[] | null
  placeholder: string | null
  help_text: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type RegistrationSiteInsert = Pick<RegistrationSite,
  'event_id' | 'slug' | 'title'
> & Partial<Omit<RegistrationSite, 'id' | 'event_id' | 'slug' | 'title' | 'created_at' | 'updated_at' | 'published_at' | 'created_by'>>

export type RegistrationSiteUpdate = Partial<Omit<RegistrationSite, 'id' | 'event_id' | 'created_at' | 'updated_at' | 'created_by'>>

export type RegistrationFieldInsert = Pick<RegistrationFormField,
  'site_id' | 'field_key' | 'label' | 'field_type'
> & Partial<Omit<RegistrationFormField, 'id' | 'site_id' | 'field_key' | 'label' | 'field_type' | 'created_at' | 'updated_at'>>

export type RegistrationFieldUpdate = Partial<Omit<RegistrationFormField, 'id' | 'site_id' | 'created_at' | 'updated_at'>>

// ─── Slug normalizer ─────────────────────────────────────────────────────────

export function normalizeRegistrationSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/^-|-$/g, '')
}

// ─── Permission check ────────────────────────────────────────────────────────

export async function canManageRegistration(eventId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_event_permission', {
    p_event_id: eventId,
    p_permission: 'can_manage_registration',
  })
  if (error) throw new Error(error.message)
  return data === true
}

// ─── Registration Sites ──────────────────────────────────────────────────────

export async function fetchRegistrationSites(eventId: string): Promise<RegistrationSite[]> {
  const { data, error } = await supabase
    .from('registration_sites')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as RegistrationSite[]
}

export async function createRegistrationSite(payload: RegistrationSiteInsert): Promise<RegistrationSite> {
  const { data, error } = await supabase
    .from('registration_sites')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(error.code === '23505' ? 'DUPLICATE_SLUG' : error.message)
  return data as RegistrationSite
}

export async function updateRegistrationSite(id: string, payload: RegistrationSiteUpdate): Promise<RegistrationSite> {
  const { data, error } = await supabase
    .from('registration_sites')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.code === '23505' ? 'DUPLICATE_SLUG' : error.message)
  return data as RegistrationSite
}

export async function deleteRegistrationSite(id: string): Promise<void> {
  const { error } = await supabase
    .from('registration_sites')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Registration Form Fields ────────────────────────────────────────────────

export async function fetchRegistrationFields(siteId: string): Promise<RegistrationFormField[]> {
  const { data, error } = await supabase
    .from('registration_form_fields')
    .select('*')
    .eq('site_id', siteId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as RegistrationFormField[]
}

export async function createRegistrationField(payload: RegistrationFieldInsert): Promise<RegistrationFormField> {
  const { data, error } = await supabase
    .from('registration_form_fields')
    .insert({
      site_id: payload.site_id,
      field_key: payload.field_key,
      label: payload.label,
      field_type: payload.field_type,
      required: payload.required ?? false,
      options: payload.options ?? null,
      placeholder: payload.placeholder ?? null,
      help_text: payload.help_text ?? null,
      sort_order: payload.sort_order ?? 0,
      is_active: payload.is_active ?? true,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as RegistrationFormField
}

export async function updateRegistrationField(id: string, payload: RegistrationFieldUpdate): Promise<RegistrationFormField> {
  const { data, error } = await supabase
    .from('registration_form_fields')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as RegistrationFormField
}

export async function deleteRegistrationField(id: string): Promise<void> {
  const { error } = await supabase
    .from('registration_form_fields')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function reorderRegistrationFields(fields: { id: string; sort_order: number }[]): Promise<void> {
  const results = await Promise.all(
    fields.map(f =>
      supabase.from('registration_form_fields').update({ sort_order: f.sort_order }).eq('id', f.id)
    )
  )
  const failed = results.find(r => r.error)
  if (failed?.error) throw new Error(failed.error.message)
}

// ─── Registration Modules ───────────────────────────────────────────────────

export type RegistrationModule = 'transport' | 'accommodation' | 'program'

export interface RegistrationModulesResult {
  site_id: string
  active_modules: RegistrationModule[]
  active_preset_fields: number
}

const ALLOWED_MODULES: ReadonlySet<string> = new Set(['transport', 'accommodation', 'program'])

const RPC_ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Autenticazione richiesta.',
  SITE_NOT_FOUND: 'Sito di registrazione non trovato.',
  NOT_AUTHORIZED: 'Non hai i permessi per configurare i moduli.',
  INVALID_MODULES: 'Moduli non validi.',
}

export async function configureRegistrationModules(
  siteId: string,
  modules: RegistrationModule[]
): Promise<RegistrationModulesResult> {
  if (!siteId || typeof siteId !== 'string' || !siteId.trim()) {
    throw new Error('ID sito mancante.')
  }

  for (const m of modules) {
    if (!ALLOWED_MODULES.has(m)) {
      throw new Error('Moduli non validi.')
    }
  }

  const deduplicated = [...new Set(modules)]

  const { data, error } = await supabase.rpc('configure_registration_modules', {
    p_site_id: siteId,
    p_modules: deduplicated,
  })

  if (error) {
    const msg = RPC_ERROR_MESSAGES[error.message] ?? 'Errore nella configurazione dei moduli.'
    throw new Error(msg)
  }

  const result = data as unknown
  if (
    !result ||
    typeof result !== 'object' ||
    typeof (result as Record<string, unknown>).site_id !== 'string' ||
    !Array.isArray((result as Record<string, unknown>).active_modules) ||
    typeof (result as Record<string, unknown>).active_preset_fields !== 'number' ||
    !Number.isFinite((result as Record<string, unknown>).active_preset_fields) ||
    (result as Record<string, unknown>).active_preset_fields as number < 0
  ) {
    throw new Error('Risposta non valida dal server.')
  }

  const obj = result as Record<string, unknown>
  const activeModules = (obj.active_modules as string[]).filter(v => ALLOWED_MODULES.has(v)) as RegistrationModule[]

  return {
    site_id: obj.site_id as string,
    active_modules: activeModules,
    active_preset_fields: obj.active_preset_fields as number,
  }
}

// ─── Registration Branding Assets ──────────────────────────────────────────

export type RegistrationAssetType = 'logo' | 'hero'

const ASSET_BUCKET = 'registration-assets'
const ASSET_MAX_BYTES = 5 * 1024 * 1024
const ASSET_ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function uploadRegistrationAsset(
  eventId: string,
  siteId: string,
  assetType: RegistrationAssetType,
  file: File
): Promise<{ path: string; publicUrl: string }> {
  if (!eventId || !eventId.trim()) throw new Error('ID evento mancante.')
  if (!siteId || !siteId.trim()) throw new Error('ID sito mancante.')

  const ext = ASSET_ALLOWED_MIME[file.type]
  if (!ext) throw new Error('Formato file non supportato. Usa JPEG, PNG o WebP.')
  if (file.size > ASSET_MAX_BYTES) throw new Error('Il file supera la dimensione massima di 5 MB.')

  const path = `${eventId}/${siteId}/${assetType}-${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })

  if (error) throw new Error('Caricamento non riuscito. Verifica i permessi e riprova.')

  const { data: urlData } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(path)

  return { path, publicUrl: urlData.publicUrl }
}

export async function deleteRegistrationAsset(path: string): Promise<void> {
  if (!path || !path.trim() || path.includes('..') || path.startsWith('/')) {
    throw new Error('Percorso file non valido.')
  }

  const { error } = await supabase.storage.from(ASSET_BUCKET).remove([path])
  if (error) throw new Error('Eliminazione non riuscita. Verifica i permessi e riprova.')
}
