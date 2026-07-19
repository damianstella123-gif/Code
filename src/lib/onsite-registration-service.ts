import { supabase } from '@/lib/supabase'

export interface OnsiteRegistration {
  registration_id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  job_title: string | null
  registration_status: string
  checked_in_at: string | null
  dietary_requirements: string | null
  accessibility_requirements: string | null
}

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Autenticazione richiesta.',
  NOT_AUTHORIZED: 'Non hai i permessi per questa operazione.',
  INVALID_QR: 'Codice QR non valido.',
  REGISTRATION_NOT_FOUND: 'Registrazione non trovata.',
  NOT_CONFIRMED: 'La registrazione non è confermata.',
  ALREADY_CHECKED_IN: 'Partecipante già registrato al check-in.',
}

function translateError(code: string): string {
  return ERROR_MESSAGES[code] || 'Errore imprevisto.'
}

function validateNonEmpty(value: string | undefined | null, label: string): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) throw new Error(`${label} è obbligatorio.`)
  return trimmed
}

export async function lookupOnsiteRegistration(
  eventId: string,
  qrToken: string
): Promise<OnsiteRegistration> {
  const pEventId = validateNonEmpty(eventId, 'Event ID')
  const pQrToken = validateNonEmpty(qrToken, 'QR Token')

  const { data, error } = await supabase.rpc('lookup_onsite_registration_by_qr', {
    p_event_id: pEventId,
    p_qr_token: pQrToken,
  })

  if (error) throw new Error('Errore imprevisto.')
  if (data?.error) throw new Error(translateError(data.error))

  if (!data?.registration_id || typeof data.registration_id !== 'string' ||
      typeof data.registration_status !== 'string') {
    throw new Error('Risposta del servizio non valida.')
  }

  return data as OnsiteRegistration
}

export async function checkInOnsiteRegistration(
  eventId: string,
  qrToken: string
): Promise<OnsiteRegistration> {
  const pEventId = validateNonEmpty(eventId, 'Event ID')
  const pQrToken = validateNonEmpty(qrToken, 'QR Token')

  const { data, error } = await supabase.rpc('onsite_check_in_by_qr', {
    p_event_id: pEventId,
    p_qr_token: pQrToken,
  })

  if (error) throw new Error('Errore imprevisto.')
  if (data?.error) throw new Error(translateError(data.error))

  if (!data?.registration_id || typeof data.registration_id !== 'string' ||
      typeof data.registration_status !== 'string') {
    throw new Error('Risposta del servizio non valida.')
  }

  return data as OnsiteRegistration
}

export async function undoOnsiteRegistrationCheckIn(
  registrationId: string
): Promise<{ registration_id: string; status: string }> {
  const pId = validateNonEmpty(registrationId, 'Registration ID')

  const { data, error } = await supabase.rpc('onsite_undo_check_in', {
    p_registration_id: pId,
  })

  if (error) throw new Error('Errore imprevisto.')
  if (data?.error) throw new Error(translateError(data.error))

  if (!data?.registration_id || typeof data.registration_id !== 'string' ||
      typeof data.status !== 'string') {
    throw new Error('Risposta del servizio non valida.')
  }

  return data as { registration_id: string; status: string }
}
