import { supabase } from './supabase'
import { logError } from './error-log'

// ─── Status / role / category unions ─────────────────────────────────────────

export type SafetyDossierStatus =
  | 'draft'
  | 'collecting'
  | 'review'
  | 'approved'
  | 'archived'

export type SafetyContactRole =
  | 'employer'
  | 'delegated_manager'
  | 'rspp'
  | 'emergency_coordinator'
  | 'signatory'
  | 'client_contact'
  | 'agency_contact'
  | 'onsite_contact'
  | 'external_consultant'
  | 'other'

export type SafetyRequirementStatus =
  | 'required'
  | 'requested'
  | 'received'
  | 'needs_review'
  | 'approved'
  | 'not_applicable'

export type SafetyRequirementCategory =
  | 'general'
  | 'location'
  | 'supplier'
  | 'transport'
  | 'activity'
  | 'temporary_structures'
  | 'catering'
  | 'speakers'
  | 'other'

const DOSSIER_STATUSES: ReadonlySet<string> = new Set<SafetyDossierStatus>([
  'draft', 'collecting', 'review', 'approved', 'archived',
])

const CONTACT_ROLES: ReadonlySet<string> = new Set<SafetyContactRole>([
  'employer', 'delegated_manager', 'rspp', 'emergency_coordinator',
  'signatory', 'client_contact', 'agency_contact', 'onsite_contact',
  'external_consultant', 'other',
])

const REQUIREMENT_STATUSES: ReadonlySet<string> = new Set<SafetyRequirementStatus>([
  'required', 'requested', 'received', 'needs_review', 'approved', 'not_applicable',
])

const REQUIREMENT_CATEGORIES: ReadonlySet<string> = new Set<SafetyRequirementCategory>([
  'general', 'location', 'supplier', 'transport', 'activity',
  'temporary_structures', 'catering', 'speakers', 'other',
])

// ─── Row types ───────────────────────────────────────────────────────────────

export interface SafetyDossier {
  id: string
  event_id: string
  status: SafetyDossierStatus
  activated_by: string
  activated_at: string
  notes: string
  created_at: string
  updated_at: string
}

export interface SafetyContact {
  id: string
  dossier_id: string
  role: SafetyContactRole
  first_name: string
  last_name: string
  organization: string
  email: string
  phone: string
  notes: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SafetyRequirement {
  id: string
  dossier_id: string
  category: SafetyRequirementCategory
  title: string
  description: string
  status: SafetyRequirementStatus
  due_date: string | null
  responsible_id: string | null
  supplier_id: string | null
  document_id: string | null
  notes: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SafetyProgress {
  completed: number
  total: number
  percentage: number
}

export interface SafetyDossierBundle {
  dossier: SafetyDossier
  contacts: SafetyContact[]
  requirements: SafetyRequirement[]
  progress: SafetyProgress
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safetyError(code: string, message: string): Error {
  const e = new Error(message)
  e.name = code
  return e
}

function translateDbError(action: string, err: { message: string; code?: string }): Error {
  logError('safety-service', action, err)
  if (err.code === '23505') return safetyError('DUPLICATE', 'Questo evento ha già un dossier sicurezza attivo.')
  if (err.code === '23503') return safetyError('FK_VIOLATION', 'Riferimento non valido: verificare che l\'elemento collegato esista.')
  if (err.code === '23514') return safetyError('CHECK_VIOLATION', 'Valore non consentito: verificare i campi inseriti.')
  if (err.code === '42501') return safetyError('PERMISSION_DENIED', 'Permessi insufficienti per questa operazione.')
  return safetyError('DB_ERROR', 'Errore durante il salvataggio. Riprovare più tardi.')
}

function validateEventId(eventId: unknown): asserts eventId is string {
  if (typeof eventId !== 'string' || eventId.trim().length === 0) {
    throw safetyError('INVALID_INPUT', 'ID evento non valido.')
  }
}

function validateId(id: unknown, label: string): asserts id is string {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw safetyError('INVALID_INPUT', `${label} non valido.`)
  }
}

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function computeProgress(requirements: SafetyRequirement[]): SafetyProgress {
  const total = requirements.length
  const completed = requirements.filter(
    r => r.status === 'approved' || r.status === 'not_applicable',
  ).length
  return {
    completed,
    total,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
  }
}

async function getAuthUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) {
    throw safetyError('AUTH_REQUIRED', 'Accesso richiesto. Effettuare il login.')
  }
  return session.user.id
}

// ─── 1. fetchSafetyDossier ───────────────────────────────────────────────────

export async function fetchSafetyDossier(
  eventId: string,
): Promise<SafetyDossierBundle | null> {
  validateEventId(eventId)

  const { data: dossier, error: dErr } = await supabase
    .from('safety_dossiers')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle()

  if (dErr) throw translateDbError('fetchSafetyDossier', dErr)
  if (!dossier) return null

  const [contactsRes, reqsRes] = await Promise.all([
    supabase
      .from('safety_contacts')
      .select('*')
      .eq('dossier_id', dossier.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('safety_requirements')
      .select('*')
      .eq('dossier_id', dossier.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  if (contactsRes.error) throw translateDbError('fetchSafetyDossier.contacts', contactsRes.error)
  if (reqsRes.error) throw translateDbError('fetchSafetyDossier.requirements', reqsRes.error)

  const contacts = (contactsRes.data ?? []) as SafetyContact[]
  const requirements = (reqsRes.data ?? []) as SafetyRequirement[]

  return {
    dossier: dossier as SafetyDossier,
    contacts,
    requirements,
    progress: computeProgress(requirements),
  }
}

// ─── 2. activateSafetyDossier ────────────────────────────────────────────────

export async function activateSafetyDossier(
  eventId: string,
): Promise<SafetyDossierBundle> {
  validateEventId(eventId)
  const userId = await getAuthUserId()

  const { data: existing, error: selErr } = await supabase
    .from('safety_dossiers')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle()

  if (selErr) throw translateDbError('activateSafetyDossier.check', selErr)

  if (existing) {
    return {
      dossier: existing as SafetyDossier,
      contacts: [],
      requirements: [],
      progress: { completed: 0, total: 0, percentage: 0 },
    }
  }

  const { data: created, error: insErr } = await supabase
    .from('safety_dossiers')
    .insert({ event_id: eventId, activated_by: userId })
    .select()
    .single()

  if (insErr) throw translateDbError('activateSafetyDossier.insert', insErr)

  return {
    dossier: created as SafetyDossier,
    contacts: [],
    requirements: [],
    progress: { completed: 0, total: 0, percentage: 0 },
  }
}

// ─── 3. updateSafetyDossier ──────────────────────────────────────────────────

export async function updateSafetyDossier(
  dossierId: string,
  patch: { status?: SafetyDossierStatus; notes?: string },
): Promise<SafetyDossier> {
  validateId(dossierId, 'ID dossier')

  const update: Record<string, unknown> = {}

  if (patch.status !== undefined) {
    if (!DOSSIER_STATUSES.has(patch.status)) {
      throw safetyError('INVALID_INPUT', 'Stato dossier non valido.')
    }
    update.status = patch.status
  }
  if (patch.notes !== undefined) {
    update.notes = trimStr(patch.notes)
  }

  if (Object.keys(update).length === 0) {
    throw safetyError('INVALID_INPUT', 'Nessun campo da aggiornare.')
  }

  const { data, error } = await supabase
    .from('safety_dossiers')
    .update(update)
    .eq('id', dossierId)
    .select()
    .single()

  if (error) throw translateDbError('updateSafetyDossier', error)
  return data as SafetyDossier
}

// ─── 4. createSafetyContact ──────────────────────────────────────────────────

interface SafetyContactInput {
  role: SafetyContactRole
  first_name: string
  last_name?: string
  organization?: string
  email?: string
  phone?: string
  notes?: string
  sort_order?: number
}

function validateContactInput(input: SafetyContactInput): Record<string, unknown> {
  if (!CONTACT_ROLES.has(input.role)) {
    throw safetyError('INVALID_INPUT', 'Ruolo sicurezza non valido.')
  }
  const firstName = trimStr(input.first_name)
  if (firstName.length === 0) {
    throw safetyError('INVALID_INPUT', 'Il nome è obbligatorio.')
  }
  const email = trimStr(input.email)
  if (email.length > 0 && !EMAIL_RE.test(email)) {
    throw safetyError('INVALID_INPUT', 'Indirizzo email non valido.')
  }
  return {
    role: input.role,
    first_name: firstName,
    last_name: trimStr(input.last_name),
    organization: trimStr(input.organization),
    email,
    phone: trimStr(input.phone),
    notes: trimStr(input.notes),
    sort_order: typeof input.sort_order === 'number' ? input.sort_order : 0,
  }
}

export async function createSafetyContact(
  dossierId: string,
  input: SafetyContactInput,
): Promise<SafetyContact> {
  validateId(dossierId, 'ID dossier')
  const row = { dossier_id: dossierId, ...validateContactInput(input) }

  const { data, error } = await supabase
    .from('safety_contacts')
    .insert(row)
    .select()
    .single()

  if (error) throw translateDbError('createSafetyContact', error)
  return data as SafetyContact
}

// ─── 5. updateSafetyContact ──────────────────────────────────────────────────

export async function updateSafetyContact(
  contactId: string,
  input: Partial<SafetyContactInput>,
): Promise<SafetyContact> {
  validateId(contactId, 'ID contatto')

  const update: Record<string, unknown> = {}

  if (input.role !== undefined) {
    if (!CONTACT_ROLES.has(input.role)) {
      throw safetyError('INVALID_INPUT', 'Ruolo sicurezza non valido.')
    }
    update.role = input.role
  }
  if (input.first_name !== undefined) {
    const v = trimStr(input.first_name)
    if (v.length === 0) throw safetyError('INVALID_INPUT', 'Il nome è obbligatorio.')
    update.first_name = v
  }
  if (input.last_name !== undefined) update.last_name = trimStr(input.last_name)
  if (input.organization !== undefined) update.organization = trimStr(input.organization)
  if (input.email !== undefined) {
    const v = trimStr(input.email)
    if (v.length > 0 && !EMAIL_RE.test(v)) {
      throw safetyError('INVALID_INPUT', 'Indirizzo email non valido.')
    }
    update.email = v
  }
  if (input.phone !== undefined) update.phone = trimStr(input.phone)
  if (input.notes !== undefined) update.notes = trimStr(input.notes)
  if (input.sort_order !== undefined) update.sort_order = input.sort_order

  if (Object.keys(update).length === 0) {
    throw safetyError('INVALID_INPUT', 'Nessun campo da aggiornare.')
  }

  const { data, error } = await supabase
    .from('safety_contacts')
    .update(update)
    .eq('id', contactId)
    .select()
    .single()

  if (error) throw translateDbError('updateSafetyContact', error)
  return data as SafetyContact
}

// ─── 6. deleteSafetyContact ──────────────────────────────────────────────────

export async function deleteSafetyContact(contactId: string): Promise<void> {
  validateId(contactId, 'ID contatto')
  const { error } = await supabase
    .from('safety_contacts')
    .delete()
    .eq('id', contactId)
  if (error) throw translateDbError('deleteSafetyContact', error)
}

// ─── 7. createSafetyRequirement ──────────────────────────────────────────────

interface SafetyRequirementInput {
  category?: SafetyRequirementCategory
  title: string
  description?: string
  status?: SafetyRequirementStatus
  due_date?: string | null
  responsible_id?: string | null
  supplier_id?: string | null
  document_id?: string | null
  notes?: string
  sort_order?: number
}

function validateRequirementInput(input: SafetyRequirementInput): Record<string, unknown> {
  const title = trimStr(input.title)
  if (title.length === 0) {
    throw safetyError('INVALID_INPUT', 'Il titolo è obbligatorio.')
  }

  const category = input.category ?? 'general'
  if (!REQUIREMENT_CATEGORIES.has(category)) {
    throw safetyError('INVALID_INPUT', 'Categoria requisito non valida.')
  }

  const status = input.status ?? 'required'
  if (!REQUIREMENT_STATUSES.has(status)) {
    throw safetyError('INVALID_INPUT', 'Stato requisito non valido.')
  }

  let dueDate: string | null = null
  if (input.due_date != null && input.due_date !== '') {
    const d = trimStr(input.due_date)
    if (isNaN(Date.parse(d))) {
      throw safetyError('INVALID_INPUT', 'Data di scadenza non valida.')
    }
    dueDate = d
  }

  return {
    category,
    title,
    description: trimStr(input.description),
    status,
    due_date: dueDate,
    responsible_id: input.responsible_id || null,
    supplier_id: input.supplier_id || null,
    document_id: input.document_id || null,
    notes: trimStr(input.notes),
    sort_order: typeof input.sort_order === 'number' ? input.sort_order : 0,
  }
}

export async function createSafetyRequirement(
  dossierId: string,
  input: SafetyRequirementInput,
): Promise<SafetyRequirement> {
  validateId(dossierId, 'ID dossier')
  const row = { dossier_id: dossierId, ...validateRequirementInput(input) }

  const { data, error } = await supabase
    .from('safety_requirements')
    .insert(row)
    .select()
    .single()

  if (error) throw translateDbError('createSafetyRequirement', error)
  return data as SafetyRequirement
}

// ─── 8. updateSafetyRequirement ──────────────────────────────────────────────

export async function updateSafetyRequirement(
  requirementId: string,
  input: Partial<SafetyRequirementInput>,
): Promise<SafetyRequirement> {
  validateId(requirementId, 'ID requisito')

  const update: Record<string, unknown> = {}

  if (input.title !== undefined) {
    const v = trimStr(input.title)
    if (v.length === 0) throw safetyError('INVALID_INPUT', 'Il titolo è obbligatorio.')
    update.title = v
  }
  if (input.category !== undefined) {
    if (!REQUIREMENT_CATEGORIES.has(input.category)) {
      throw safetyError('INVALID_INPUT', 'Categoria requisito non valida.')
    }
    update.category = input.category
  }
  if (input.status !== undefined) {
    if (!REQUIREMENT_STATUSES.has(input.status)) {
      throw safetyError('INVALID_INPUT', 'Stato requisito non valido.')
    }
    update.status = input.status
  }
  if (input.due_date !== undefined) {
    if (input.due_date != null && input.due_date !== '') {
      const d = trimStr(input.due_date)
      if (isNaN(Date.parse(d))) {
        throw safetyError('INVALID_INPUT', 'Data di scadenza non valida.')
      }
      update.due_date = d
    } else {
      update.due_date = null
    }
  }
  if (input.description !== undefined) update.description = trimStr(input.description)
  if (input.responsible_id !== undefined) update.responsible_id = input.responsible_id || null
  if (input.supplier_id !== undefined) update.supplier_id = input.supplier_id || null
  if (input.document_id !== undefined) update.document_id = input.document_id || null
  if (input.notes !== undefined) update.notes = trimStr(input.notes)
  if (input.sort_order !== undefined) update.sort_order = input.sort_order

  if (Object.keys(update).length === 0) {
    throw safetyError('INVALID_INPUT', 'Nessun campo da aggiornare.')
  }

  const { data, error } = await supabase
    .from('safety_requirements')
    .update(update)
    .eq('id', requirementId)
    .select()
    .single()

  if (error) throw translateDbError('updateSafetyRequirement', error)
  return data as SafetyRequirement
}

// ─── 9. deleteSafetyRequirement ──────────────────────────────────────────────

export async function deleteSafetyRequirement(requirementId: string): Promise<void> {
  validateId(requirementId, 'ID requisito')
  const { error } = await supabase
    .from('safety_requirements')
    .delete()
    .eq('id', requirementId)
  if (error) throw translateDbError('deleteSafetyRequirement', error)
}

// ─── 10. buildSafetyConsultantEmail ──────────────────────────────────────────

export interface EventSummary {
  title: string
  start_date: string
  end_date: string
  location: string
  attendees: number | null
  client_name?: string
}

const ROLE_LABELS_IT: Record<SafetyContactRole, string> = {
  employer: 'Datore di Lavoro',
  delegated_manager: 'Dirigente Delegato',
  rspp: 'RSPP',
  emergency_coordinator: 'Coordinatore Emergenza',
  signatory: 'Firmatario',
  client_contact: 'Referente Cliente',
  agency_contact: 'Referente Agenzia',
  onsite_contact: 'Referente On-Site',
  external_consultant: 'Consulente Esterno',
  other: 'Altro',
}

const STATUS_LABELS_IT: Record<SafetyRequirementStatus, string> = {
  required: 'Da richiedere',
  requested: 'Richiesto',
  received: 'Ricevuto',
  needs_review: 'Da verificare',
  approved: 'Approvato',
  not_applicable: 'Non applicabile',
}

const CATEGORY_LABELS_IT: Record<SafetyRequirementCategory, string> = {
  general: 'Generale',
  location: 'Location',
  supplier: 'Fornitore',
  transport: 'Trasporto',
  activity: 'Attività',
  temporary_structures: 'Strutture temporanee',
  catering: 'Catering',
  speakers: 'Relatori',
  other: 'Altro',
}

export function buildSafetyConsultantEmail(
  bundle: SafetyDossierBundle,
  eventSummary: EventSummary,
): { subject: string; body: string } {
  const { dossier, contacts, requirements, progress } = bundle

  const subject = `Dossier Sicurezza – ${eventSummary.title} (${eventSummary.start_date})`

  const lines: string[] = []

  lines.push('Gentile Consulente,')
  lines.push('')
  lines.push(`di seguito il riepilogo del dossier sicurezza per l'evento "${eventSummary.title}".`)
  lines.push('')

  // Event info
  lines.push('══ INFORMAZIONI EVENTO ══')
  lines.push(`Titolo: ${eventSummary.title}`)
  lines.push(`Date: ${eventSummary.start_date} – ${eventSummary.end_date}`)
  lines.push(`Luogo: ${eventSummary.location}`)
  if (eventSummary.attendees != null) {
    lines.push(`Partecipanti previsti: ${eventSummary.attendees}`)
  }
  if (eventSummary.client_name) {
    lines.push(`Cliente: ${eventSummary.client_name}`)
  }
  lines.push(`Stato dossier: ${dossier.status}`)
  lines.push('')

  // Contacts grouped by role
  if (contacts.length > 0) {
    lines.push('══ FIGURE DI RIFERIMENTO ══')
    const byRole = new Map<SafetyContactRole, SafetyContact[]>()
    for (const c of contacts) {
      const list = byRole.get(c.role) ?? []
      list.push(c)
      byRole.set(c.role, list)
    }
    for (const [role, members] of byRole) {
      lines.push(`  ${ROLE_LABELS_IT[role]}:`)
      for (const m of members) {
        const name = [m.first_name, m.last_name].filter(Boolean).join(' ')
        const parts = [name]
        if (m.organization) parts.push(`(${m.organization})`)
        if (m.email) parts.push(`– ${m.email}`)
        if (m.phone) parts.push(`– ${m.phone}`)
        lines.push(`    • ${parts.join(' ')}`)
      }
    }
    lines.push('')
  }

  // Requirements grouped by status
  if (requirements.length > 0) {
    lines.push('══ REQUISITI E DOCUMENTI ══')
    lines.push(`Completamento: ${progress.completed}/${progress.total} (${progress.percentage}%)`)
    lines.push('')

    const byStatus = new Map<SafetyRequirementStatus, SafetyRequirement[]>()
    for (const r of requirements) {
      const list = byStatus.get(r.status) ?? []
      list.push(r)
      byStatus.set(r.status, list)
    }
    for (const [status, items] of byStatus) {
      lines.push(`  ${STATUS_LABELS_IT[status]}:`)
      for (const item of items) {
        const cat = CATEGORY_LABELS_IT[item.category]
        const due = item.due_date ? ` – scadenza: ${item.due_date}` : ''
        const doc = item.document_id ? '' : ' [DOCUMENTO MANCANTE]'
        lines.push(`    • [${cat}] ${item.title}${due}${doc}`)
      }
      lines.push('')
    }
  }

  // Missing documents highlight
  const missing = requirements.filter(
    r => r.status !== 'not_applicable' && r.status !== 'approved' && !r.document_id,
  )
  if (missing.length > 0) {
    lines.push('══ DOCUMENTI MANCANTI ══')
    for (const m of missing) {
      lines.push(`  • ${m.title} (${CATEGORY_LABELS_IT[m.category]})`)
    }
    lines.push('')
  }

  // Dossier notes
  if (dossier.notes.trim().length > 0) {
    lines.push('══ NOTE ══')
    lines.push(dossier.notes.trim())
    lines.push('')
  }

  lines.push('---')
  lines.push('Questo riepilogo è generato a scopo informativo e operativo.')
  lines.push('Non costituisce documento ufficiale né attestazione di conformità normativa.')

  return { subject, body: lines.join('\n') }
}
