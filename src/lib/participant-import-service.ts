import { supabase } from './supabase'
import { checkEventPermission } from './event-members-service'
import * as XLSX from 'xlsx'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParticipantImportDocument {
  id: string
  file_name: string
  file_path: string
  file_type: string
  analysis_status: string
  event_id: string
}

export interface ParticipantImportSheet {
  name: string
  headers: string[]
  rows: string[][]
  headerRowNumber: number
}

export interface ParticipantImportWorkbook {
  sheets: ParticipantImportSheet[]
}

export type ParticipantColumnKey =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'company'
  | 'job_title'
  | 'dietary_requirements'
  | 'accessibility_requirements'
  | 'ignore'

export interface ParticipantColumnMapping {
  sourceIndex: number
  sourceHeader: string
  target: ParticipantColumnKey
}

export interface ParticipantPreviewRow {
  rowIndex: number
  first_name: string
  last_name: string
  email: string
  phone: string
  company: string
  job_title: string
  dietary_requirements: string
  accessibility_requirements: string
  extraFields: Record<string, string>
}

export interface ParticipantPreviewError {
  rowIndex: number
  message: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 25 * 1024 * 1024
const MAX_ROWS = 5000
const MAX_COLS = 100

const ALLOWED_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
])

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireNonEmpty(value: string, label: string): void {
  if (!value || !value.trim()) throw new Error(`${label} non valido.`)
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

const HEADER_MAP: [RegExp, Exclude<ParticipantColumnKey, 'ignore'>][] = [
  [/^(nome|first ?name|name|prenom)$/, 'first_name'],
  [/^(cognome|last ?name|surname|family ?name)$/, 'last_name'],
  [/^(e-?mail|email|mail|posta ?elettronica)$/, 'email'],
  [/^(telefono|phone|mobile|cellulare|cell|tel)$/, 'phone'],
  [/^(azienda|company|societa|organizzazione|org)$/, 'company'],
  [/^(ruolo|qualifica|job ?title|position|posizione|titolo)$/, 'job_title'],
  [/^(intolleranze|allergie|esigenze ?alimentari|dietary ?requirements|dietary ?restrictions|dieta|alimentazione)$/, 'dietary_requirements'],
  [/^(accessibilita|accessibility|special ?needs|disabilita|esigenze ?speciali)$/, 'accessibility_requirements'],
]

function matchHeader(header: string): Exclude<ParticipantColumnKey, 'ignore'> | null {
  const n = normalize(header)
  for (const [re, key] of HEADER_MAP) {
    if (re.test(n)) return key
  }
  return null
}

function isRowEmpty(row: string[]): boolean {
  return row.every(cell => !cell || !cell.trim())
}

const HEADER_SCAN_DEPTH = 20

function scoreHeaderRow(cells: string[]): { score: number; hasFirst: boolean; hasLast: boolean } {
  let score = 0
  let hasFirst = false
  let hasLast = false
  const seen = new Set<string>()
  for (const cell of cells) {
    const matched = matchHeader(cell)
    if (matched && !seen.has(matched)) {
      seen.add(matched)
      score++
      if (matched === 'first_name') hasFirst = true
      if (matched === 'last_name') hasLast = true
    }
  }
  return { score, hasFirst, hasLast }
}

function detectHeaderRow(raw: string[][]): { headerIndex: number; headerCells: string[] } | null {
  const limit = Math.min(raw.length, HEADER_SCAN_DEPTH)
  let bestIndex = -1
  let bestScore = 0
  let bestCells: string[] = []

  for (let i = 0; i < limit; i++) {
    const cells = raw[i].slice(0, MAX_COLS).map(cell => String(cell ?? ''))
    if (isRowEmpty(cells)) continue
    const { score, hasFirst, hasLast } = scoreHeaderRow(cells)
    if (hasFirst && hasLast && score > bestScore) {
      bestScore = score
      bestIndex = i
      bestCells = cells
    }
  }

  if (bestIndex === -1) return null
  return { headerIndex: bestIndex, headerCells: bestCells }
}

function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return ALLOWED_EXTENSIONS.some(ext => lower.endsWith(ext))
}

// ---------------------------------------------------------------------------
// 1. fetchImportableParticipantDocuments
// ---------------------------------------------------------------------------

export async function fetchImportableParticipantDocuments(
  eventId: string,
): Promise<ParticipantImportDocument[]> {
  requireNonEmpty(eventId, 'ID evento')

  const allowed = await checkEventPermission(eventId, 'can_manage_registration')
  if (!allowed) throw new Error('Non hai i permessi per importare partecipanti in questo evento.')

  const { data, error } = await supabase
    .from('documents')
    .select('id, file_name, file_path, file_type, analysis_status, event_id')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (error) throw new Error('Impossibile caricare i documenti dell\'evento.')

  return (data ?? []).filter(
    (doc) => ALLOWED_TYPES.has(doc.file_type) || hasAllowedExtension(doc.file_name),
  ) as ParticipantImportDocument[]
}

// ---------------------------------------------------------------------------
// 2. parseParticipantDocument
// ---------------------------------------------------------------------------

export async function parseParticipantDocument(
  document: ParticipantImportDocument,
): Promise<ParticipantImportWorkbook> {
  requireNonEmpty(document.file_path, 'Percorso file')

  const allowed = await checkEventPermission(document.event_id, 'can_manage_registration')
  if (!allowed) throw new Error('Non hai i permessi per importare partecipanti in questo evento.')

  const { data: blob, error } = await supabase.storage
    .from('documents')
    .download(document.file_path)

  if (error || !blob) throw new Error('Impossibile scaricare il documento.')

  if (blob.size > MAX_FILE_SIZE) {
    throw new Error('Il file supera la dimensione massima consentita (25 MB).')
  }

  const buffer = await blob.arrayBuffer()
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })

  await supabase
    .from('documents')
    .update({ is_participant_data: true })
    .eq('id', document.id)

  const sheets: ParticipantImportSheet[] = []

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName]
    if (!ws) continue

    const raw: string[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      blankrows: false,
    })

    if (raw.length === 0) continue

    const headerInfo = detectHeaderRow(raw)
    if (!headerInfo) continue

    const { headerIndex, headerCells } = headerInfo
    const dataRows: string[][] = []

    for (let i = headerIndex + 1; i < raw.length && dataRows.length < MAX_ROWS; i++) {
      const row = raw[i].slice(0, MAX_COLS).map(cell => String(cell ?? ''))
      if (!isRowEmpty(row)) dataRows.push(row)
    }

    if (dataRows.length > 0) {
      sheets.push({ name: sheetName, headers: headerCells, rows: dataRows, headerRowNumber: headerIndex + 1 })
    }
  }

  if (sheets.length === 0) {
    throw new Error('Il file non contiene fogli con dati validi.')
  }

  return { sheets }
}

// ---------------------------------------------------------------------------
// 3. autoMapParticipantHeaders
// ---------------------------------------------------------------------------

export function autoMapParticipantHeaders(headers: string[]): ParticipantColumnMapping[] {
  const used = new Set<Exclude<ParticipantColumnKey, 'ignore'>>()
  const mappings: ParticipantColumnMapping[] = []

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]
    const matched = matchHeader(header)

    if (matched && !used.has(matched)) {
      used.add(matched)
      mappings.push({ sourceIndex: i, sourceHeader: header, target: matched })
    } else {
      mappings.push({ sourceIndex: i, sourceHeader: header, target: 'ignore' })
    }
  }

  return mappings
}

// ---------------------------------------------------------------------------
// 4. buildParticipantPreview
// ---------------------------------------------------------------------------

export function buildParticipantPreview(
  sheet: ParticipantImportSheet,
  mapping: ParticipantColumnMapping[],
  preserveUnmappedColumns = false,
): { rows: ParticipantPreviewRow[]; errors: ParticipantPreviewError[] } {
  const hasFirstName = mapping.some(m => m.target === 'first_name')
  const hasLastName = mapping.some(m => m.target === 'last_name')

  if (!hasFirstName || !hasLastName) {
    throw new Error('Le colonne "Nome" e "Cognome" sono obbligatorie per l\'importazione.')
  }

  const fieldIndices: Record<Exclude<ParticipantColumnKey, 'ignore'>, number | null> = {
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    company: null,
    job_title: null,
    dietary_requirements: null,
    accessibility_requirements: null,
  }

  const ignoredMappings: ParticipantColumnMapping[] = []

  for (const m of mapping) {
    if (m.target === 'ignore') {
      ignoredMappings.push(m)
    } else {
      fieldIndices[m.target] = m.sourceIndex
    }
  }

  const previewRows: ParticipantPreviewRow[] = []
  const errors: ParticipantPreviewError[] = []

  for (let i = 0; i < sheet.rows.length; i++) {
    const rawRow = sheet.rows[i]
    const rowIndex = sheet.headerRowNumber + 1 + i

    const get = (key: Exclude<ParticipantColumnKey, 'ignore'>): string => {
      const idx = fieldIndices[key]
      if (idx === null || idx >= rawRow.length) return ''
      return (rawRow[idx] ?? '').trim()
    }

    const firstName = get('first_name')
    const lastName = get('last_name')

    if (!firstName && !lastName) continue

    if (!firstName) {
      errors.push({ rowIndex, message: `Riga ${rowIndex}: il campo "Nome" è obbligatorio.` })
      continue
    }

    if (!lastName) {
      errors.push({ rowIndex, message: `Riga ${rowIndex}: il campo "Cognome" è obbligatorio.` })
      continue
    }

    let email = get('email')
    if (email) {
      email = email.toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ rowIndex, message: `Riga ${rowIndex}: indirizzo email non valido.` })
        continue
      }
    }

    const extraFields: Record<string, string> = {}
    if (preserveUnmappedColumns) {
      for (const m of ignoredMappings) {
        const val = (rawRow[m.sourceIndex] ?? '').trim()
        if (val && m.sourceHeader) {
          extraFields[m.sourceHeader] = val
        }
      }
    }

    previewRows.push({
      rowIndex,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: get('phone'),
      company: get('company'),
      job_title: get('job_title'),
      dietary_requirements: get('dietary_requirements'),
      accessibility_requirements: get('accessibility_requirements'),
      extraFields,
    })
  }

  return { rows: previewRows, errors }
}

// ---------------------------------------------------------------------------
// Duplicate & Import Types
// ---------------------------------------------------------------------------

export type ParticipantDuplicateReason = 'email' | 'identity'

export interface ParticipantDuplicate {
  rowIndex: number
  reason: ParticipantDuplicateReason
  message: string
}

export interface ParticipantDuplicateCheck {
  newRows: ParticipantPreviewRow[]
  duplicates: ParticipantDuplicate[]
}

export interface ParticipantImportResult {
  insertedCount: number
  skippedDuplicateCount: number
  insertedIds: string[]
}

// ---------------------------------------------------------------------------
// Duplicate-detection helpers
// ---------------------------------------------------------------------------

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

function identityKey(firstName: string, lastName: string, company: string): string {
  return `${normalize(firstName)}|${normalize(lastName)}|${normalize(company)}`
}

function detectDuplicates(
  rows: ParticipantPreviewRow[],
  existingEmails: Set<string>,
  existingIdentities: Set<string>,
): ParticipantDuplicateCheck {
  const newRows: ParticipantPreviewRow[] = []
  const duplicates: ParticipantDuplicate[] = []

  const seenEmails = new Set<string>()
  const seenIdentities = new Set<string>()

  for (const row of rows) {
    const email = row.email ? normalizeEmail(row.email) : ''
    const idKey = identityKey(row.first_name, row.last_name, row.company)

    if (email && (existingEmails.has(email) || seenEmails.has(email))) {
      duplicates.push({
        rowIndex: row.rowIndex,
        reason: 'email',
        message: `Riga ${row.rowIndex}: partecipante con lo stesso indirizzo email già presente.`,
      })
      continue
    }

    if (existingIdentities.has(idKey) || seenIdentities.has(idKey)) {
      duplicates.push({
        rowIndex: row.rowIndex,
        reason: 'identity',
        message: `Riga ${row.rowIndex}: partecipante con stesso nome, cognome e azienda già presente.`,
      })
      continue
    }

    if (email) seenEmails.add(email)
    seenIdentities.add(idKey)
    newRows.push(row)
  }

  return { newRows, duplicates }
}

// ---------------------------------------------------------------------------
// 5. checkParticipantImportDuplicates
// ---------------------------------------------------------------------------

export async function checkParticipantImportDuplicates(
  eventId: string,
  rows: ParticipantPreviewRow[],
): Promise<ParticipantDuplicateCheck> {
  requireNonEmpty(eventId, 'ID evento')
  if (rows.length === 0) return { newRows: [], duplicates: [] }
  if (rows.length > MAX_ROWS) {
    throw new Error(`Il numero massimo di righe importabili è ${MAX_ROWS}.`)
  }

  const allowed = await checkEventPermission(eventId, 'can_manage_registration')
  if (!allowed) throw new Error('Non hai i permessi per importare partecipanti in questo evento.')

  const { data, error } = await supabase
    .from('event_registrations')
    .select('id, first_name, last_name, email, company')
    .eq('event_id', eventId)

  if (error) throw new Error('Impossibile verificare i partecipanti esistenti.')

  const existingEmails = new Set<string>()
  const existingIdentities = new Set<string>()

  for (const reg of data ?? []) {
    if (reg.email) existingEmails.add(normalizeEmail(reg.email))
    existingIdentities.add(identityKey(reg.first_name ?? '', reg.last_name ?? '', reg.company ?? ''))
  }

  return detectDuplicates(rows, existingEmails, existingIdentities)
}

// ---------------------------------------------------------------------------
// 6. importParticipantRows
// ---------------------------------------------------------------------------

export async function importParticipantRows(
  eventId: string,
  rows: ParticipantPreviewRow[],
): Promise<ParticipantImportResult> {
  requireNonEmpty(eventId, 'ID evento')
  if (!rows || rows.length === 0) {
    throw new Error('Nessuna riga da importare.')
  }
  if (rows.length > MAX_ROWS) {
    throw new Error(`Il numero massimo di righe importabili è ${MAX_ROWS}.`)
  }

  const allowed = await checkEventPermission(eventId, 'can_manage_registration')
  if (!allowed) throw new Error('Non hai i permessi per importare partecipanti in questo evento.')

  const { newRows, duplicates } = await checkParticipantImportDuplicates(eventId, rows)

  if (newRows.length === 0) {
    return {
      insertedCount: 0,
      skippedDuplicateCount: duplicates.length,
      insertedIds: [],
    }
  }

  const payload = newRows.map(row => ({
    site_id: null,
    event_id: eventId,
    source: 'import',
    registration_status: 'confirmed',
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email || null,
    phone: row.phone,
    company: row.company,
    job_title: row.job_title,
    dietary_requirements: row.dietary_requirements,
    accessibility_requirements: row.accessibility_requirements,
    custom_answers: row.extraFields,
    privacy_accepted: false,
    marketing_consent: false,
  }))

  const { data, error } = await supabase
    .from('event_registrations')
    .insert(payload)
    .select('id')

  if (error) {
    if (error.code === '23505') {
      throw new Error('Importazione annullata: uno o più partecipanti risultano già registrati.')
    }
    throw new Error('Errore durante l\'inserimento dei partecipanti. Riprova.')
  }

  return {
    insertedCount: data?.length ?? 0,
    skippedDuplicateCount: duplicates.length,
    insertedIds: (data ?? []).map(r => r.id),
  }
}
