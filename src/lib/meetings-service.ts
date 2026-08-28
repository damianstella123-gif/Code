import { supabase } from './supabase'
import { logError } from './error-log'
import { computeHandoverRecap, type HandoverRecap } from './handover-service'

export interface Meeting {
  id: string
  meeting_date: string
  created_by: string
  presenti: string | null
  temi_generali: string | null
  decisioni_trasversali: string | null
  created_at: string
}

export interface MeetingEventNote {
  id: string
  meeting_id: string
  event_id: string
  stato_snapshot: HandoverRecap | null
  punti_discussi: string | null
  decisioni: string | null
  azioni: string | null
  criticita: string | null
  lezioni_imparate: string | null
  created_at: string
}

export async function fetchMeetings(): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .order('meeting_date', { ascending: false })
  if (error) {
    logError('meetings-service', 'fetchMeetings', error)
    return []
  }
  return data ?? []
}

export async function fetchMeetingById(id: string): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    logError('meetings-service', 'fetchMeetingById', error)
    return null
  }
  return data
}

export async function fetchMeetingNotes(meetingId: string): Promise<MeetingEventNote[]> {
  const { data, error } = await supabase
    .from('meeting_event_notes')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: true })
  if (error) {
    logError('meetings-service', 'fetchMeetingNotes', error)
    return []
  }
  return data ?? []
}

export async function createMeeting(meeting: Partial<Meeting>): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .insert({
      meeting_date: meeting.meeting_date || new Date().toISOString().slice(0, 10),
      presenti: meeting.presenti || null,
      temi_generali: meeting.temi_generali || null,
      decisioni_trasversali: meeting.decisioni_trasversali || null,
    })
    .select()
    .maybeSingle()
  if (error) {
    logError('meetings-service', 'createMeeting', error)
    throw new Error(error.message)
  }
  return data
}

export async function updateMeeting(id: string, patch: Partial<Meeting>): Promise<void> {
  const { error } = await supabase
    .from('meetings')
    .update({
      presenti: patch.presenti,
      temi_generali: patch.temi_generali,
      decisioni_trasversali: patch.decisioni_trasversali,
    })
    .eq('id', id)
  if (error) {
    logError('meetings-service', 'updateMeeting', error)
    throw new Error(error.message)
  }
}

export async function upsertEventNote(note: Partial<MeetingEventNote> & { meeting_id: string; event_id: string }): Promise<void> {
  const existing = await supabase
    .from('meeting_event_notes')
    .select('id')
    .eq('meeting_id', note.meeting_id)
    .eq('event_id', note.event_id)
    .maybeSingle()

  if (existing.data) {
    const { error } = await supabase
      .from('meeting_event_notes')
      .update({
        stato_snapshot: note.stato_snapshot,
        punti_discussi: note.punti_discussi,
        decisioni: note.decisioni,
        azioni: note.azioni,
        criticita: note.criticita,
        lezioni_imparate: note.lezioni_imparate,
      })
      .eq('id', existing.data.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('meeting_event_notes')
      .insert({
        meeting_id: note.meeting_id,
        event_id: note.event_id,
        stato_snapshot: note.stato_snapshot,
        punti_discussi: note.punti_discussi,
        decisioni: note.decisioni,
        azioni: note.azioni,
        criticita: note.criticita,
        lezioni_imparate: note.lezioni_imparate,
      })
    if (error) throw new Error(error.message)
  }
}

export { computeHandoverRecap as computeEventRecap }
export type { HandoverRecap as EventRecap }
