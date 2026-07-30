import { supabase } from './supabase'
import { logError } from './error-log'
import { loadUser, isSuperAdmin, type AuthUser } from './auth'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SentinelSeverity = 'info' | 'warning' | 'critical'
export type SentinelStatus = 'new' | 'acknowledged' | 'resolved'

export interface SentinelAlert {
  id: string
  created_at: string
  severity: SentinelSeverity
  category: string
  message: string
  status: SentinelStatus
  resolved_at: string | null
  resolved_by: string | null
}

export interface SecurityError {
  id: string
  created_at: string
  pagina: string
  azione: string
  messaggio: string
  dettaglio: Record<string, unknown> | null
}

export interface AuditEntry {
  id: string
  created_at: string
  action: string
  table_name: string | null
  record_id: string | null
  actor_label: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

export interface RegistrationEdit {
  id: string
  registration_id: string
  changed_fields: string[]
  source: string
  created_at: string
}

export type ControlStatus = 'active' | 'inactive' | 'unverified' | 'available_disabled' | 'not_configured'

export interface SystemControl {
  id: string
  label: string
  description: string
  status: ControlStatus
  statusLabel: string
}

export interface SecurityOverview {
  sentinel: { critical: number; warning: number; info: number; total: number }
  errors24h: number
  audit24h: number
  flyFailures24h: number | null
  lastUpdated: string
  controls: SystemControl[]
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface SentinelFilters {
  severity?: SentinelSeverity
  status?: SentinelStatus
  dateFrom?: string
  dateTo?: string
}

export interface ErrorFilters {
  pagina?: string
  azione?: string
  dateFrom?: string
  dateTo?: string
}

export interface AuditFilters {
  action?: string
  table_name?: string
  dateFrom?: string
  dateTo?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function svcError(message: string): Error {
  return new Error(message)
}

function translateDbError(action: string, err: { message: string; code?: string }): Error {
  logError('security-center', action, err)
  if (err.code === '42501') return svcError('Permessi insufficienti per questa operazione.')
  return svcError('Errore nel caricamento dei dati. Riprovare più tardi.')
}

function ago24h(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
}

function requireAdmin(): AuthUser {
  const user = loadUser()
  if (!user || (user.role !== 'Admin' && user.role !== 'Super Admin')) {
    throw svcError('Accesso non autorizzato.')
  }
  return user
}

const SAFE_MSG_LEN = 80

function redactMessage(msg: string): string {
  if (msg.length <= SAFE_MSG_LEN) return msg
  return msg.slice(0, SAFE_MSG_LEN) + '...'
}

function buildControls(): SystemControl[] {
  return [
    {
      id: 'mfa',
      label: 'Autenticazione Multi-Fattore (MFA)',
      description: 'Componente disponibile, attualmente disattivato',
      status: 'available_disabled',
      statusLabel: 'Disponibile, non attivo',
    },
    {
      id: 'session_timeout',
      label: 'Timeout Sessione',
      description: 'Non applicato lato server',
      status: 'unverified',
      statusLabel: 'Non verificato',
    },
    {
      id: 'access_logging',
      label: 'Registrazione Accessi',
      description: 'Non attivo — i login non vengono registrati',
      status: 'inactive',
      statusLabel: 'Non attivo',
    },
    {
      id: 'document_access',
      label: 'Log Accesso Documenti',
      description: 'Non attivo — gli accessi ai documenti non vengono tracciati',
      status: 'inactive',
      statusLabel: 'Non attivo',
    },
    {
      id: 'ms365',
      label: 'Microsoft 365 Security',
      description: 'Non configurato',
      status: 'not_configured',
      statusLabel: 'Non configurato',
    },
  ]
}

// ─── 1. fetchSecurityOverview ────────────────────────────────────────────────

export async function fetchSecurityOverview(): Promise<SecurityOverview> {
  requireAdmin()
  const since = ago24h()

  const [sentinelRes, errorsRes, auditRes, flyRes] = await Promise.all([
    supabase
      .from('sentinel_alerts')
      .select('severity, status')
      .in('status', ['new', 'acknowledged']),
    supabase
      .from('error_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since),
    supabase
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since),
    supabase
      .from('fly_logs')
      .select('id', { count: 'exact', head: true })
      .eq('outcome', 'error')
      .gte('created_at', since),
  ])

  if (sentinelRes.error) throw translateDbError('overview.sentinel', sentinelRes.error)
  if (errorsRes.error) throw translateDbError('overview.errors', errorsRes.error)
  if (auditRes.error) throw translateDbError('overview.audit', auditRes.error)

  const alerts = sentinelRes.data ?? []
  const sentinel = { critical: 0, warning: 0, info: 0, total: alerts.length }
  for (const a of alerts) {
    if (a.severity === 'critical') sentinel.critical++
    else if (a.severity === 'warning') sentinel.warning++
    else sentinel.info++
  }

  return {
    sentinel,
    errors24h: errorsRes.count ?? 0,
    audit24h: auditRes.count ?? 0,
    flyFailures24h: flyRes.error ? null : (flyRes.count ?? 0),
    lastUpdated: new Date().toISOString(),
    controls: buildControls(),
  }
}

// ─── 2. fetchSentinelAlerts ──────────────────────────────────────────────────

export async function fetchSentinelAlerts(
  filters: SentinelFilters = {},
  page = 1,
  pageSize = 20,
): Promise<PaginatedResult<SentinelAlert>> {
  requireAdmin()

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('sentinel_alerts')
    .select('id, created_at, severity, category, message, status, resolved_at, resolved_by', { count: 'exact' })

  if (filters.severity) query = query.eq('severity', filters.severity)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)

  query = query.order('created_at', { ascending: false }).range(from, to)

  const { data, error, count } = await query
  if (error) throw translateDbError('fetchSentinelAlerts', error)

  return {
    data: (data ?? []) as SentinelAlert[],
    total: count ?? 0,
    page,
    pageSize,
  }
}

// ─── 3. resolveSentinelAlert ─────────────────────────────────────────────────

export async function resolveSentinelAlert(alertId: string): Promise<SentinelAlert> {
  requireAdmin()
  if (!alertId || typeof alertId !== 'string') {
    throw svcError('ID alert non valido.')
  }

  const { data: current, error: fetchErr } = await supabase
    .from('sentinel_alerts')
    .select('id, status')
    .eq('id', alertId)
    .maybeSingle()

  if (fetchErr) throw translateDbError('resolveSentinelAlert.check', fetchErr)
  if (!current) throw svcError('Alert non trovato.')
  if (current.status === 'resolved') throw svcError('Questo alert è già stato risolto.')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw svcError('Sessione scaduta. Effettuare nuovamente il login.')

  const { data, error } = await supabase
    .from('sentinel_alerts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq('id', alertId)
    .select('id, created_at, severity, category, message, status, resolved_at, resolved_by')
    .single()

  if (error) throw translateDbError('resolveSentinelAlert.update', error)
  return data as SentinelAlert
}

// ─── 4. fetchSecurityErrors ──────────────────────────────────────────────────

export async function fetchSecurityErrors(
  filters: ErrorFilters = {},
  page = 1,
  pageSize = 20,
): Promise<PaginatedResult<SecurityError>> {
  const user = requireAdmin()
  const isSA = isSuperAdmin(user)

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('error_log')
    .select('id, created_at, pagina, azione, messaggio, dettaglio', { count: 'exact' })

  if (filters.pagina) query = query.eq('pagina', filters.pagina)
  if (filters.azione) query = query.eq('azione', filters.azione)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)

  query = query.order('created_at', { ascending: false }).range(from, to)

  const { data, error, count } = await query
  if (error) throw translateDbError('fetchSecurityErrors', error)

  const rows = (data ?? []) as SecurityError[]

  if (!isSA) {
    return {
      data: rows.map(r => ({
        ...r,
        messaggio: redactMessage(r.messaggio),
        dettaglio: null,
      })),
      total: count ?? 0,
      page,
      pageSize,
    }
  }

  return { data: rows, total: count ?? 0, page, pageSize }
}

// ─── 5. fetchSecurityAudit ───────────────────────────────────────────────────

export async function fetchSecurityAudit(
  filters: AuditFilters = {},
  page = 1,
  pageSize = 20,
): Promise<PaginatedResult<AuditEntry>> {
  const user = requireAdmin()
  const isSA = isSuperAdmin(user)

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('audit_log')
    .select('id, created_at, user_id, user_email, action, table_name, record_id, old_data, new_data', { count: 'exact' })

  if (filters.action) query = query.eq('action', filters.action)
  if (filters.table_name) query = query.eq('table_name', filters.table_name)
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo)

  query = query.order('created_at', { ascending: false }).range(from, to)

  const { data, error, count } = await query
  if (error) throw translateDbError('fetchSecurityAudit', error)

  const rows = (data ?? []) as Array<{
    id: string
    created_at: string
    user_id: string | null
    user_email: string | null
    action: string
    table_name: string | null
    record_id: string | null
    old_data: Record<string, unknown> | null
    new_data: Record<string, unknown> | null
  }>

  return {
    data: rows.map(r => ({
      id: r.id,
      created_at: r.created_at,
      action: r.action,
      table_name: r.table_name,
      record_id: isSA ? r.record_id : null,
      actor_label: isSA
        ? (r.user_email ?? r.user_id?.slice(0, 8) ?? 'Sistema')
        : (r.user_id ? 'Utente' : 'Sistema'),
      old_data: isSA ? r.old_data : null,
      new_data: isSA ? r.new_data : null,
    })),
    total: count ?? 0,
    page,
    pageSize,
  }
}

// ─── 6. fetchFlySecuritySummary ──────────────────────────────────────────────

export interface FlySecuritySummary {
  total24h: number
  errors24h: number
  rateLimited24h: number
  estimatedCost24h: number | null
}

export async function fetchFlySecuritySummary(): Promise<FlySecuritySummary | null> {
  requireAdmin()
  const since = ago24h()

  const { data, error } = await supabase
    .from('fly_logs')
    .select('outcome, estimated_cost_eur')
    .gte('created_at', since)

  if (error) {
    logError('security-center', 'fetchFlySecuritySummary', error)
    return null
  }

  const rows = data ?? []
  let errors = 0
  let rateLimited = 0
  let cost = 0

  for (const r of rows) {
    if (r.outcome === 'error') errors++
    if (r.outcome === 'rate_limited') rateLimited++
    cost += Number(r.estimated_cost_eur ?? 0)
  }

  return {
    total24h: rows.length,
    errors24h: errors,
    rateLimited24h: rateLimited,
    estimatedCost24h: Math.round(cost * 100) / 100,
  }
}
