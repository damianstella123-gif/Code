import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TransportMovementStatus =
  | 'draft'
  | 'open'
  | 'closed'
  | 'departed'
  | 'cancelled'

export type TransportAssignmentStatus =
  | 'assigned'
  | 'boarded'
  | 'no_show'
  | 'cancelled'

export interface TransportMovement {
  id: string
  event_id: string
  label: string
  movement_type: string
  departure_at: string | null
  origin: string
  destination: string
  movement_status: TransportMovementStatus
  closed_at: string | null
  closed_by: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface TransportVehicle {
  id: string
  event_id: string
  movement_id: string
  label: string
  vehicle_type: string
  capacity: number | null
  plate: string
  driver_name: string
  driver_phone: string
  sort_order: number
  operational_status: 'boarding' | 'departed' | 'arrived' | 'cancelled'
  departed_at: string | null
  departed_by: string | null
  arrived_at: string | null
  arrived_by: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
}

export type TransportVehicleAction = 'depart' | 'cancel' | 'reopen' | 'arrive'

export interface TransportVehicleTransitionResult {
  vehicle_label: string
  action: TransportVehicleAction
  operational_status: 'boarding' | 'departed' | 'arrived' | 'cancelled'
  departed_at: string | null
  arrived_at: string | null
  occupants: number
  capacity: number | null
}

export interface TransportManifestParticipant {
  assignment_id: string
  registration_id: string
  vehicle_id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  assignment_status: TransportAssignmentStatus
  boarded_at: string | null
}

export interface TransportManifestVehicle {
  id: string
  label: string
  vehicle_type: string
  capacity: number | null
  expected_count: number
  boarded_count: number
  missing_count: number
  no_show_count: number
}

export interface TransportManifest {
  movement: {
    id: string
    event_id: string
    label: string
    movement_type: string
    departure_at: string | null
    origin: string
    destination: string
    movement_status: TransportMovementStatus
  }
  vehicles: TransportManifestVehicle[]
  assignments: TransportManifestParticipant[]
  totals: {
    expected: number
    boarded: number
    missing: number
    no_show: number
  }
}

export interface TransportBoardingParticipant {
  registration_id: string
  first_name: string
  last_name: string
  company: string
  phone: string
  registration_status: string
  assignment_id: string | null
  vehicle_id: string | null
  vehicle_label: string | null
  assignment_status: string | null
  boarded_at: string | null
}

export interface TransportOperationResult {
  assignment_id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  vehicle_label: string
  boarded_at: string | null
  new_status?: string
  totals: {
    expected: number
    boarded: number
    missing: number
    no_show: number
  }
  vehicle_counts: Record<string, {
    expected: number
    boarded: number
    missing: number
    no_show: number
  }>
}

export interface TransportBoardDirectResult {
  success: true
  first_name: string
  last_name: string
  company: string
  phone: string
  vehicle_label: string
  boarded_at: string
}

export interface TransportBoardDirectError {
  success: false
  error: string
}

export type TransportBoardDirectOutcome = TransportBoardDirectResult | TransportBoardDirectError

// ─── Error Handling ──────────────────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Autenticazione richiesta.',
  NOT_AUTHORIZED: 'Non hai i permessi per questa operazione.',
  EVENT_NOT_FOUND: 'Evento non trovato.',
  MOVEMENT_NOT_FOUND: 'Movimento non trovato.',
  MOVEMENT_NOT_EDITABLE: 'Il movimento non è modificabile in questo stato.',
  MOVEMENT_NOT_OPEN: 'Il movimento non è aperto.',
  VEHICLE_NOT_FOUND: 'Veicolo non trovato.',
  VEHICLE_LABEL_EXISTS: 'Esiste già un veicolo con questo nome.',
  VEHICLE_FULL: 'Veicolo al completo.',
  PARTICIPANT_NOT_FOUND: 'Partecipante non trovato.',
  PARTICIPANT_EVENT_MISMATCH: 'Il partecipante non appartiene a questo evento.',
  PARTICIPANT_CANCELLED: 'La registrazione del partecipante è annullata.',
  PARTICIPANT_ALREADY_ASSIGNED: 'Partecipante già assegnato a questo movimento.',
  PARTICIPANT_NOT_ASSIGNED: 'Partecipante non assegnato a questo movimento.',
  ASSIGNMENT_NOT_FOUND: 'Assegnazione non trovata.',
  ASSIGNMENT_NOT_MOVABLE: 'L\'assegnazione non può essere spostata in questo stato.',
  ASSIGNMENT_NOT_BOARDABLE: 'L\'assegnazione non può essere imbarcata in questo stato.',
  ALREADY_BOARDED: 'Partecipante già imbarcato.',
  INVALID_QR: 'Codice QR non valido.',
  INVALID_STATUS: 'Stato non valido.',
  INVALID_TRANSITION: 'Transizione di stato non consentita.',
  SAME_VEHICLE: 'Il veicolo di destinazione è lo stesso di quello attuale.',
  NO_VEHICLES: 'Aggiungere almeno un veicolo prima di aprire il movimento.',
  NO_PARTICIPANTS: 'Nessun partecipante assegnato al movimento.',
  MANIFEST_INCOMPLETE: 'Tutti i partecipanti devono essere imbarcati o segnati come no-show.',
  INVALID_INPUT: 'Dati non validi.',
  CAPACITY_BELOW_BOARDED: 'La capienza non può essere inferiore ai passeggeri già imbarcati.',
  ASSIGNMENT_NOT_BOARDED: 'Il partecipante non risulta imbarcato.',
}

const BOARDING_DIRECT_MESSAGES: Record<string, string> = {
  'Autenticazione richiesta.': ERROR_MESSAGES.AUTH_REQUIRED,
  'Movimento non trovato.': ERROR_MESSAGES.MOVEMENT_NOT_FOUND,
  'Permessi insufficienti per questa operazione.': ERROR_MESSAGES.NOT_AUTHORIZED,
  'Il movimento non è aperto per imbarco.': ERROR_MESSAGES.MOVEMENT_NOT_OPEN,
  'Veicolo non valido per questo movimento.': ERROR_MESSAGES.VEHICLE_NOT_FOUND,
  'Partecipante non trovato o non confermato.': ERROR_MESSAGES.PARTICIPANT_NOT_FOUND,
  'Partecipante già imbarcato.': ERROR_MESSAGES.ALREADY_BOARDED,
  'Capienza veicolo raggiunta.': ERROR_MESSAGES.VEHICLE_FULL,
  'Azione non valida.': ERROR_MESSAGES.INVALID_INPUT,
  'Veicolo non trovato.': ERROR_MESSAGES.VEHICLE_NOT_FOUND,
  'Il mezzo non è in fase di imbarco.': 'Il mezzo non è in fase di imbarco.',
  'Il mezzo è già annullato.': 'Il mezzo è già annullato.',
  'Motivo annullamento obbligatorio (min 5 caratteri).': 'Motivo annullamento obbligatorio (min 5 caratteri).',
  'Il mezzo è già in imbarco.': 'Il mezzo è già in imbarco.',
}

function translateError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: string }).message
    for (const code of Object.keys(ERROR_MESSAGES)) {
      if (msg.includes(code)) return ERROR_MESSAGES[code]
    }
    for (const key of Object.keys(BOARDING_DIRECT_MESSAGES)) {
      if (msg.includes(key)) return BOARDING_DIRECT_MESSAGES[key]
    }
  }
  return 'Errore imprevisto.'
}

function throwTranslated(err: unknown): never {
  throw new Error(translateError(err))
}

function requireNonEmpty(value: string | undefined | null, label: string): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) throw new Error(`${label} è obbligatorio.`)
  return trimmed
}

// ─── Service Functions ───────────────────────────────────────────────────────

export async function fetchTransportMovements(eventId: string): Promise<TransportMovement[]> {
  const id = requireNonEmpty(eventId, 'Event ID')

  const { data, error } = await supabase
    .from('transport_movements')
    .select('*')
    .eq('event_id', id)
    .order('departure_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throwTranslated(error)
  return (data ?? []) as TransportMovement[]
}

export async function saveTransportMovement(input: {
  movementId?: string | null
  eventId?: string | null
  label: string
  movementType?: string
  departureAt?: string | null
  origin?: string
  destination?: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('save_transport_movement', {
    p_movement_id: input.movementId ?? null,
    p_event_id: input.eventId ?? null,
    p_label: input.label,
    p_movement_type: input.movementType ?? 'transfer',
    p_departure_at: input.departureAt ?? null,
    p_origin: input.origin ?? '',
    p_destination: input.destination ?? '',
  })

  if (error) throwTranslated(error)
  return data as string
}

export async function saveTransportVehicle(input: {
  vehicleId?: string | null
  movementId: string
  label: string
  vehicleType?: string
  capacity?: number | null
  plate?: string
  driverName?: string
  driverPhone?: string
  sortOrder?: number
}): Promise<string> {
  const { data, error } = await supabase.rpc('save_transport_vehicle', {
    p_vehicle_id: input.vehicleId ?? null,
    p_movement_id: input.movementId,
    p_label: input.label,
    p_vehicle_type: input.vehicleType ?? 'bus',
    p_capacity: input.capacity ?? null,
    p_plate: input.plate ?? '',
    p_driver_name: input.driverName ?? '',
    p_driver_phone: input.driverPhone ?? '',
    p_sort_order: input.sortOrder ?? 0,
  })

  if (error) throwTranslated(error)
  return data as string
}

export async function assignTransportParticipant(input: {
  movementId: string
  vehicleId: string
  registrationId: string
  notes?: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('assign_transport_participant', {
    p_movement_id: input.movementId,
    p_vehicle_id: input.vehicleId,
    p_registration_id: input.registrationId,
    p_notes: input.notes ?? '',
  })

  if (error) throwTranslated(error)
  return data as string
}

export async function moveTransportParticipant(
  assignmentId: string,
  targetVehicleId: string
): Promise<void> {
  requireNonEmpty(assignmentId, 'Assignment ID')
  requireNonEmpty(targetVehicleId, 'Vehicle ID')

  const { error } = await supabase.rpc('move_transport_participant', {
    p_assignment_id: assignmentId,
    p_target_vehicle_id: targetVehicleId,
  })

  if (error) throwTranslated(error)
}

export async function fetchTransportManifest(movementId: string): Promise<TransportManifest> {
  requireNonEmpty(movementId, 'Movement ID')

  const { data, error } = await supabase.rpc('get_transport_manifest', {
    p_movement_id: movementId,
  })

  if (error) throwTranslated(error)

  if (
    !data ||
    typeof data !== 'object' ||
    !data.movement ||
    !Array.isArray(data.vehicles) ||
    !Array.isArray(data.assignments) ||
    !data.totals
  ) {
    throw new Error('Risposta del servizio non valida.')
  }

  return data as TransportManifest
}

export async function boardTransportAssignment(
  assignmentId: string
): Promise<TransportOperationResult> {
  requireNonEmpty(assignmentId, 'Assignment ID')

  const { data, error } = await supabase.rpc('board_transport_assignment', {
    p_assignment_id: assignmentId,
  })

  if (error) throwTranslated(error)

  if (!data || typeof data !== 'object' || !data.assignment_id || !data.totals) {
    throw new Error('Risposta del servizio non valida.')
  }

  return data as TransportOperationResult
}

export async function boardTransportParticipantByQr(
  movementId: string,
  qrToken: string
): Promise<TransportOperationResult> {
  requireNonEmpty(movementId, 'Movement ID')
  const token = requireNonEmpty(qrToken, 'QR Token')

  const { data, error } = await supabase.rpc('board_transport_participant_by_qr', {
    p_movement_id: movementId,
    p_qr_token: token,
  })

  if (error) throwTranslated(error)

  if (!data || typeof data !== 'object' || !data.assignment_id || !data.totals) {
    throw new Error('Risposta del servizio non valida.')
  }

  return data as TransportOperationResult
}

export async function transitionTransportAssignment(
  assignmentId: string,
  targetStatus: 'assigned' | 'no_show'
): Promise<TransportOperationResult> {
  requireNonEmpty(assignmentId, 'Assignment ID')

  if (targetStatus !== 'assigned' && targetStatus !== 'no_show') {
    throw new Error(ERROR_MESSAGES.INVALID_STATUS)
  }

  const { data, error } = await supabase.rpc('transition_transport_assignment', {
    p_assignment_id: assignmentId,
    p_target_status: targetStatus,
  })

  if (error) throwTranslated(error)

  if (!data || typeof data !== 'object' || !data.assignment_id || !data.totals) {
    throw new Error('Risposta del servizio non valida.')
  }

  return data as TransportOperationResult
}

const VALID_MOVEMENT_TARGETS: TransportMovementStatus[] = [
  'open', 'closed', 'departed', 'cancelled',
]

export async function transitionTransportMovement(
  movementId: string,
  targetStatus: TransportMovementStatus
): Promise<void> {
  requireNonEmpty(movementId, 'Movement ID')

  if (!VALID_MOVEMENT_TARGETS.includes(targetStatus)) {
    throw new Error(ERROR_MESSAGES.INVALID_TRANSITION)
  }

  const { error } = await supabase.rpc('transition_transport_movement', {
    p_movement_id: movementId,
    p_target_status: targetStatus,
  })

  if (error) throwTranslated(error)
}

// ─── Realtime Subscription ───────────────────────────────────────────────────

let realtimeCounter = 0

export function subscribeTransportMovement(
  movementId: string,
  onChange: () => void
): () => void {
  const channelName = `transport-live-${movementId}-${++realtimeCounter}`
  let removed = false

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'transport_movements',
        filter: `id=eq.${movementId}`,
      },
      () => { onChange() }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'transport_vehicles',
        filter: `movement_id=eq.${movementId}`,
      },
      () => { onChange() }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'transport_assignments',
        filter: `movement_id=eq.${movementId}`,
      },
      () => { onChange() }
    )
    .subscribe()

  return () => {
    if (removed) return
    removed = true
    supabase.removeChannel(channel)
  }
}

// ─── Boarding Pool & Direct Board ────────────────────────────────────────────

export async function fetchTransportBoardingPool(
  movementId: string
): Promise<TransportBoardingParticipant[]> {
  if (!movementId || typeof movementId !== 'string' || movementId.trim() === '') {
    throw new Error(ERROR_MESSAGES.INVALID_INPUT)
  }

  const { data, error } = await supabase.rpc('get_transport_boarding_pool', {
    p_movement_id: movementId,
  })

  if (error) throw new Error(translateError(error))
  if (!Array.isArray(data)) throw new Error(ERROR_MESSAGES.INVALID_INPUT)

  return (data as unknown[]).filter(
    (row): row is TransportBoardingParticipant =>
      row !== null &&
      typeof row === 'object' &&
      'registration_id' in row &&
      'first_name' in row &&
      'last_name' in row
  )
}

export async function boardTransportParticipantDirect(
  movementId: string,
  vehicleId: string,
  registrationId: string
): Promise<TransportBoardDirectOutcome> {
  if (
    !movementId || typeof movementId !== 'string' || movementId.trim() === '' ||
    !vehicleId || typeof vehicleId !== 'string' || vehicleId.trim() === '' ||
    !registrationId || typeof registrationId !== 'string' || registrationId.trim() === ''
  ) {
    return { success: false, error: ERROR_MESSAGES.INVALID_INPUT }
  }

  const { data, error } = await supabase.rpc('board_transport_participant_direct', {
    p_movement_id: movementId,
    p_vehicle_id: vehicleId,
    p_registration_id: registrationId,
  })

  if (error) {
    return { success: false, error: translateError(error) }
  }

  const rows = Array.isArray(data) ? data : [data]
  const row = rows[0] as Record<string, unknown> | undefined
  if (!row || typeof row !== 'object' || !('first_name' in row) || !('boarded_at' in row)) {
    return { success: false, error: 'Errore imprevisto.' }
  }

  return {
    success: true,
    first_name: String(row.first_name ?? ''),
    last_name: String(row.last_name ?? ''),
    company: String(row.company ?? ''),
    phone: String(row.phone ?? ''),
    vehicle_label: String(row.vehicle_label ?? ''),
    boarded_at: String(row.boarded_at ?? ''),
  }
}

// ─── Unboard Assignment ──────────────────────────────────────────────────────

export async function unboardTransportAssignment(assignmentId: string): Promise<{ success: boolean; error?: string }> {
  if (!assignmentId || typeof assignmentId !== 'string' || assignmentId.trim() === '') {
    return { success: false, error: ERROR_MESSAGES.INVALID_INPUT }
  }

  const { error } = await supabase.rpc('unboard_transport_assignment', {
    p_assignment_id: assignmentId,
  })

  if (error) {
    return { success: false, error: translateError(error) }
  }

  return { success: true }
}

// ─── Vehicle Transition ──────────────────────────────────────────────────────

const VALID_VEHICLE_ACTIONS: TransportVehicleAction[] = ['depart', 'cancel', 'reopen', 'arrive']

export async function transitionTransportVehicle(
  vehicleId: string,
  action: TransportVehicleAction,
  reason?: string
): Promise<TransportVehicleTransitionResult> {
  if (!vehicleId || typeof vehicleId !== 'string' || vehicleId.trim() === '') {
    throw new Error(ERROR_MESSAGES.INVALID_INPUT)
  }
  if (!action || !VALID_VEHICLE_ACTIONS.includes(action)) {
    throw new Error(ERROR_MESSAGES.INVALID_INPUT)
  }
  if (action === 'cancel') {
    const trimmed = (reason ?? '').trim()
    if (trimmed.length < 5) {
      throw new Error('Motivo annullamento obbligatorio (min 5 caratteri).')
    }
  }

  const { data, error } = await supabase.rpc('transition_transport_vehicle', {
    p_vehicle_id: vehicleId,
    p_action: action,
    p_reason: reason ?? null,
  })

  if (error) throw new Error(translateError(error))

  const result = data as Record<string, unknown> | null
  if (
    !result ||
    typeof result !== 'object' ||
    typeof result.vehicle_label !== 'string' ||
    typeof result.action !== 'string' ||
    typeof result.operational_status !== 'string'
  ) {
    throw new Error('Errore imprevisto.')
  }

  return {
    vehicle_label: result.vehicle_label,
    action: result.action as TransportVehicleAction,
    operational_status: result.operational_status as 'boarding' | 'departed' | 'arrived' | 'cancelled',
    departed_at: result.departed_at as string | null,
    arrived_at: (result.arrived_at as string | null) ?? null,
    occupants: Number(result.occupants ?? 0),
    capacity: result.capacity != null ? Number(result.capacity) : null,
  }
}
