import { supabase } from './supabase'

// ── Types ────────────────────────────────────────────────────────────

export interface InvitationRecipientInput {
  first_name: string
  last_name: string
  email: string
}

export interface InvitationBatch {
  id: string
  event_id: string
  site_id: string
  status: 'draft' | 'sending' | 'completed' | 'failed'
  email_subject: string
  email_message: string
  total_count: number
  sent_count: number
  failed_count: number
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface CreateInvitationBatchResult {
  batch_id: string
  recipient_count: number
  skipped_registered: number
}

// ── Error translation ────────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Devi essere autenticato per inviare inviti.',
  NOT_AUTHORIZED: 'Non hai i permessi per gestire le iscrizioni di questo evento.',
  SITE_NOT_FOUND: 'Sito di registrazione non trovato per questo evento.',
  SITE_NOT_PUBLISHED: 'Il sito di registrazione deve essere pubblicato per inviare inviti.',
  INVALID_SUBJECT: "L'oggetto dell'email deve avere tra 1 e 200 caratteri.",
  INVALID_MESSAGE: "Il messaggio dell'email non può superare 10.000 caratteri.",
  INVALID_RECIPIENTS: 'Uno o più destinatari contengono dati non validi.',
  DUPLICATE_EMAIL: 'La lista contiene indirizzi email duplicati.',
  NO_NEW_RECIPIENTS: 'Tutti i destinatari risultano già iscritti a questo evento.',
}

function translateError(raw: string): string {
  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (raw.includes(code)) return ERROR_MESSAGES[code]
  }
  return 'Errore durante la creazione del batch di inviti.'
}

// ── Helpers ──────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateLocally(recipients: InvitationRecipientInput[]): void {
  const seen = new Set<string>()
  for (const r of recipients) {
    const fn = (r.first_name ?? '').trim()
    const ln = (r.last_name ?? '').trim()
    const em = (r.email ?? '').trim().toLowerCase()
    if (!fn || !ln) throw new Error(ERROR_MESSAGES.INVALID_RECIPIENTS)
    if (!EMAIL_RE.test(em)) throw new Error(ERROR_MESSAGES.INVALID_RECIPIENTS)
    if (seen.has(em)) throw new Error(ERROR_MESSAGES.DUPLICATE_EMAIL)
    seen.add(em)
  }
}

// ── Batch fields (never fetch recipient rows) ────────────────────────

const BATCH_COLUMNS =
  'id, event_id, site_id, status, email_subject, email_message, total_count, sent_count, failed_count, started_at, completed_at, created_at'

// ── Public API ───────────────────────────────────────────────────────

export async function createRegistrationInvitationBatch(
  eventId: string,
  siteId: string,
  subject: string,
  message: string,
  recipients: InvitationRecipientInput[],
): Promise<CreateInvitationBatchResult> {
  if (!eventId?.trim() || !siteId?.trim()) {
    throw new Error(ERROR_MESSAGES.SITE_NOT_FOUND)
  }

  const trimmedSubject = subject?.trim() ?? ''
  const trimmedMessage = message ?? ''

  if (trimmedSubject.length < 1 || trimmedSubject.length > 200) {
    throw new Error(ERROR_MESSAGES.INVALID_SUBJECT)
  }
  if (trimmedMessage.length > 10_000) {
    throw new Error(ERROR_MESSAGES.INVALID_MESSAGE)
  }
  if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 5_000) {
    throw new Error(ERROR_MESSAGES.INVALID_RECIPIENTS)
  }

  validateLocally(recipients)

  const cleaned = recipients.map((r) => ({
    first_name: r.first_name.trim(),
    last_name: r.last_name.trim(),
    email: r.email.trim().toLowerCase(),
  }))

  const { data, error } = await supabase.rpc('create_registration_invitation_batch', {
    p_event_id: eventId,
    p_site_id: siteId,
    p_email_subject: trimmedSubject,
    p_email_message: trimmedMessage,
    p_recipients: cleaned,
  })

  if (error) throw new Error(translateError(error.message))

  const result = data as Record<string, unknown> | null
  if (
    !result ||
    typeof result.batch_id !== 'string' ||
    typeof result.recipient_count !== 'number' ||
    typeof result.skipped_registered !== 'number'
  ) {
    throw new Error('Errore durante la creazione del batch di inviti.')
  }

  return {
    batch_id: result.batch_id,
    recipient_count: result.recipient_count,
    skipped_registered: result.skipped_registered,
  }
}

export async function fetchRegistrationInvitationBatches(
  eventId: string,
  siteId: string,
): Promise<InvitationBatch[]> {
  const { data, error } = await supabase
    .from('invitation_batches')
    .select(BATCH_COLUMNS)
    .eq('event_id', eventId)
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(translateError(error.message))
  return (data ?? []) as InvitationBatch[]
}

export async function fetchRegistrationInvitationBatch(
  batchId: string,
): Promise<InvitationBatch | null> {
  if (!batchId?.trim()) return null

  const { data, error } = await supabase
    .from('invitation_batches')
    .select(BATCH_COLUMNS)
    .eq('id', batchId)
    .maybeSingle()

  if (error) throw new Error(translateError(error.message))
  return (data as InvitationBatch) ?? null
}
