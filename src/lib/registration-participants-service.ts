import { supabase } from './supabase'

export type RegistrationStatus = 'confirmed' | 'waitlist' | 'cancelled'

export interface EventRegistration {
  id: string
  site_id: string
  event_id: string
  registration_status: RegistrationStatus
  first_name: string
  last_name: string
  email: string
  phone: string
  company: string
  job_title: string
  dietary_requirements: string
  accessibility_requirements: string
  custom_answers: Record<string, unknown>
  privacy_accepted: boolean
  marketing_consent: boolean
  qr_token: string
  checked_in_at: string | null
  checked_in_by: string | null
  created_at: string
  updated_at: string
}

export async function fetchEventRegistrations(
  eventId: string,
  siteId?: string,
): Promise<EventRegistration[]> {
  let query = supabase
    .from('event_registrations_readable')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (siteId) {
    query = query.eq('site_id', siteId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as EventRegistration[]
}

export async function updateRegistrationStatus(
  id: string,
  status: RegistrationStatus,
): Promise<EventRegistration> {
  const { data, error } = await supabase
    .from('event_registrations')
    .update({ registration_status: status })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as EventRegistration
}

export async function checkInRegistration(id: string): Promise<EventRegistration> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Autenticazione richiesta.')

  const { data, error } = await supabase
    .from('event_registrations')
    .update({
      checked_in_at: new Date().toISOString(),
      checked_in_by: user.id,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as EventRegistration
}

export async function undoRegistrationCheckIn(id: string): Promise<EventRegistration> {
  const { data, error } = await supabase
    .from('event_registrations')
    .update({
      checked_in_at: null,
      checked_in_by: null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as EventRegistration
}

export async function findRegistrationByQr(
  eventId: string,
  qrToken: string,
): Promise<EventRegistration | null> {
  const { data, error } = await supabase
    .from('event_registrations_readable')
    .select('*')
    .eq('event_id', eventId)
    .eq('qr_token', qrToken)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as EventRegistration | null
}

export function getRegistrationStats(registrations: EventRegistration[]) {
  return {
    total: registrations.length,
    confirmed: registrations.filter((r) => r.registration_status === 'confirmed').length,
    waitlist: registrations.filter((r) => r.registration_status === 'waitlist').length,
    cancelled: registrations.filter((r) => r.registration_status === 'cancelled').length,
    checkedIn: registrations.filter((r) => r.checked_in_at !== null).length,
  }
}
