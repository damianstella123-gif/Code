import { supabase } from './supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PublicRegistrationField {
  id: string
  field_key: string
  label: string
  field_type: string
  required: boolean
  options: string[] | null
  placeholder: string | null
  help_text: string | null
  sort_order: number
}

export interface PublicRegistrationSite {
  id: string
  event_id: string
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  logo_url: string | null
  hero_image_url: string | null
  theme: Record<string, unknown> | null
  content: Record<string, unknown> | null
  settings: Record<string, unknown> | null
  privacy_url: string | null
  privacy_text: string | null
  confirmation_message: string | null
  capacity: number | null
  waitlist_enabled: boolean
  opens_at: string | null
  closes_at: string | null
  fields: PublicRegistrationField[]
}

export interface RegistrationSubmission {
  slug: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company: string | null
  job_title: string | null
  dietary_requirements: string | null
  accessibility_requirements: string | null
  custom_answers: Record<string, unknown> | null
  privacy_accepted: boolean
  marketing_consent: boolean
  honeypot: string | null
}

export interface RegistrationResult {
  registration_id: string
  registration_status: string
  qr_token: string | null
  confirmation_message: string | null
  manage_token: string | null
  manage_token_expires_at: string | null
  email_signature: string | null
  email_issued_at: number | null
}

// ─── Error translation ───────────────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  SITE_NOT_AVAILABLE: 'Il sito di registrazione non è disponibile al momento.',
  REGISTRATION_REJECTED: 'La registrazione è stata rifiutata. Verificare i dati inseriti.',
  VALIDATION_ERROR: 'Dati non validi. Controllare i campi obbligatori.',
  REGISTRATION_NOT_COMPLETED: 'Non è stato possibile completare la registrazione. Se hai già inviato questo modulo, controlla la tua email di conferma.',
  EVENT_FULL: 'L\'evento ha raggiunto la capacità massima.',
}

function translateError(msg: string): string {
  for (const [code, translation] of Object.entries(ERROR_MESSAGES)) {
    if (msg.includes(code)) return translation
  }
  return 'Si è verificato un errore. Riprovare più tardi.'
}

// ─── API ─────────────────────────────────────────────────────────────────────

export async function fetchPublicRegistrationSite(slug: string): Promise<PublicRegistrationSite | null> {
  const { data, error } = await supabase.rpc('get_public_registration_site', { p_slug: slug })

  if (error) {
    throw new Error('Impossibile caricare la pagina di registrazione. Riprovare più tardi.')
  }

  if (!data) return null
  return data as unknown as PublicRegistrationSite
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_64_RE = /^[0-9a-fA-F]{64}$/

export type EmailDeliveryStatus = 'sent' | 'already_sent' | 'processing' | 'failed'

export async function sendRegistrationConfirmationEmail(
  registrationId: string,
  qrToken: string,
  manageToken?: string | null,
  emailSignature?: string | null,
  emailIssuedAt?: number | null
): Promise<EmailDeliveryStatus> {
  if (!UUID_RE.test(registrationId) || !UUID_RE.test(qrToken)) {
    return 'failed'
  }

  const body: Record<string, string | number> = { registration_id: registrationId, qr_token: qrToken }
  if (manageToken && HEX_64_RE.test(manageToken)) {
    body.manage_token = manageToken
  }
  if (emailSignature) {
    body.email_signature = emailSignature
  }
  if (typeof emailIssuedAt === 'number' && emailIssuedAt > 0) {
    body.email_issued_at = emailIssuedAt
  }

  try {
    const { data, error } = await supabase.functions.invoke('registration-email-worker', {
      body,
    })

    if (error) return 'failed'

    const status = data?.status
    if (status === 'sent' || status === 'already_sent' || status === 'processing') {
      return status
    }
    return 'failed'
  } catch {
    return 'failed'
  }
}

export async function submitPublicRegistration(input: RegistrationSubmission): Promise<RegistrationResult> {
  const { data, error } = await supabase.rpc('submit_event_registration', {
    p_slug: input.slug,
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_email: input.email,
    p_phone: input.phone,
    p_company: input.company,
    p_job_title: input.job_title,
    p_dietary_requirements: input.dietary_requirements,
    p_accessibility_requirements: input.accessibility_requirements,
    p_custom_answers: input.custom_answers,
    p_privacy_accepted: input.privacy_accepted,
    p_marketing_consent: input.marketing_consent,
    p_honeypot: input.honeypot,
  })

  if (error) {
    throw new Error('Si è verificato un errore. Riprovare più tardi.')
  }

  const result = data as Record<string, unknown> | null
  if (!result || typeof result !== 'object') {
    throw new Error('Si è verificato un errore. Riprovare più tardi.')
  }

  if (typeof result.error === 'string' && result.error.length > 0) {
    throw new Error(translateError(result.error))
  }

  if (
    typeof result.registration_id !== 'string' ||
    typeof result.registration_status !== 'string' ||
    typeof result.qr_token !== 'string'
  ) {
    throw new Error('Si è verificato un errore. Riprovare più tardi.')
  }

  return {
    registration_id: result.registration_id,
    registration_status: result.registration_status,
    qr_token: result.qr_token,
    confirmation_message: typeof result.confirmation_message === 'string' ? result.confirmation_message : null,
    manage_token: typeof result.manage_token === 'string' ? result.manage_token : null,
    manage_token_expires_at: typeof result.manage_token_expires_at === 'string' ? result.manage_token_expires_at : null,
    email_signature: typeof result.email_signature === 'string' ? result.email_signature : null,
    email_issued_at: typeof result.email_issued_at === 'number' ? result.email_issued_at : null,
  }
}

// ─── Self-service registration editing ──────────────────────────────────────

export interface EditableRegistrationField {
  field_key: string
  label: string
  field_type: string
  required: boolean
  options: string[] | null
  placeholder: string
  help_text: string
}

export interface EditableRegistration {
  registration_id: string
  registration_status: string
  phone: string | null
  company: string | null
  job_title: string | null
  dietary_requirements: string | null
  accessibility_requirements: string | null
  marketing_consent: boolean
  custom_answers: Record<string, unknown> | null
  manage_token_expires_at: string | null
  site_title: string
  site_logo_url: string | null
  site_theme: Record<string, unknown>
  event_title: string
  fields: EditableRegistrationField[]
}

export type EditableRegistrationPatch = Partial<{
  phone: string | null
  company: string | null
  job_title: string | null
  dietary_requirements: string | null
  accessibility_requirements: string | null
  marketing_consent: boolean
  custom_answers: Record<string, unknown> | null
}>

export async function fetchEditableRegistration(token: string): Promise<EditableRegistration | null> {
  if (!HEX_64_RE.test(token)) return null

  const { data, error } = await supabase.rpc('get_registration_by_manage_token', { p_manage_token: token })
  if (error || !data) return null

  const d = data as Record<string, unknown>
  if (!d.registration_id) return null

  return d as unknown as EditableRegistration
}

export async function updateEditableRegistration(
  token: string,
  patch: EditableRegistrationPatch
): Promise<{ ok: boolean; error?: string }> {
  if (!HEX_64_RE.test(token)) return { ok: false, error: 'Collegamento non valido.' }

  const { data, error } = await supabase.rpc('update_registration_by_manage_token', {
    p_manage_token: token,
    p_patch: patch,
  })

  if (error) return { ok: false, error: 'Si è verificato un errore. Riprovare più tardi.' }

  const result = data as Record<string, unknown> | null
  if (!result) return { ok: false, error: 'Si è verificato un errore. Riprovare più tardi.' }

  if (typeof result.error === 'string') {
    if (result.error === 'INVALID_TOKEN' || result.error === 'TOKEN_NOT_FOUND') {
      return { ok: false, error: 'Collegamento non valido o scaduto.' }
    }
    if (result.error === 'CANCELLED_REGISTRATION') {
      return { ok: false, error: 'Questa registrazione è stata annullata.' }
    }
    return { ok: false, error: 'Si è verificato un errore. Riprovare più tardi.' }
  }

  return { ok: result.status === 'updated' }
}
