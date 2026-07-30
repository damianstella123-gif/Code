import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Shield, Activity, AlertTriangle, FileWarning, ScrollText, Settings,
  RefreshCw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  CheckCircle2, Info, Zap,
} from 'lucide-react'
import { loadUser, isAdmin, isSuperAdmin } from '@/lib/auth'
import {
  fetchSecurityOverview,
  fetchSentinelAlerts,
  resolveSentinelAlert,
  fetchSecurityErrors,
  fetchSecurityAudit,
  fetchFlySecuritySummary,
  type SecurityOverview,
  type SentinelAlert,
  type SentinelSeverity,
  type SentinelStatus,
  type SentinelFilters,
  type SecurityError,
  type ErrorFilters,
  type AuditEntry,
  type AuditFilters,
  type SystemControl,
  type ControlStatus,
  type PaginatedResult,
  type FlySecuritySummary,
} from '@/lib/security-center-service'

// ─── Shared primitives ──────────────────────────────────────────────────────

type Tab = 'panoramica' | 'monitoraggio' | 'errori' | 'audit' | 'controlli'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'panoramica', label: 'Panoramica', icon: Shield },
  { id: 'monitoraggio', label: 'Monitoraggio', icon: Activity },
  { id: 'errori', label: 'Errori', icon: FileWarning },
  { id: 'audit', label: 'Accessi e Audit', icon: ScrollText },
  { id: 'controlli', label: 'Controlli', icon: Settings },
]

const PAGE_SIZE = 20

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ora'
  if (mins < 60) return `${mins}m fa`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h fa`
  return `${Math.floor(hrs / 24)}g fa`
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function StatusBadge({ status, label }: { status: ControlStatus; label: string }) {
  const styles: Record<ControlStatus, { bg: string; color: string }> = {
    active: { bg: 'rgba(22,163,74,0.12)', color: '#16a34a' },
    inactive: { bg: 'rgba(217,119,6,0.12)', color: '#d97706' },
    unverified: { bg: 'rgba(217,119,6,0.12)', color: '#d97706' },
    available_disabled: { bg: 'rgba(59,130,246,0.12)', color: '#2563eb' },
    not_configured: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
  }
  const s = styles[status]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {label}
    </span>
  )
}

function SeverityBadge({ severity }: { severity: SentinelSeverity }) {
  const map: Record<SentinelSeverity, { bg: string; color: string; label: string }> = {
    critical: { bg: 'rgba(220,38,38,0.12)', color: '#dc2626', label: 'CRITICO' },
    warning: { bg: 'rgba(217,119,6,0.12)', color: '#d97706', label: 'WARNING' },
    info: { bg: 'rgba(37,99,235,0.12)', color: '#2563eb', label: 'INFO' },
  }
  const s = map[severity]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  )
}

function AlertStatusBadge({ status }: { status: SentinelStatus }) {
  const map: Record<SentinelStatus, { bg: string; color: string; label: string }> = {
    new: { bg: 'rgba(220,38,38,0.1)', color: '#dc2626', label: 'NUOVO' },
    acknowledged: { bg: 'rgba(217,119,6,0.1)', color: '#d97706', label: 'ACK' },
    resolved: { bg: 'rgba(22,163,74,0.1)', color: '#16a34a', label: 'RISOLTO' },
  }
  const s = map[status]
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function Pagination({
  page, total, pageSize, onPage,
}: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between pt-3 mt-3" style={{ borderTop: '1px solid var(--line)' }}>
      <span className="text-xs" style={{ color: 'var(--muted)' }}>
        Pagina {page} di {pages} ({total} totali)
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onPage(page - 1)} disabled={page <= 1}
          className="p-2 rounded-lg transition-colors disabled:opacity-30"
          style={{ background: 'var(--bg)', minWidth: 44, minHeight: 44 }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPage(page + 1)} disabled={page >= pages}
          className="p-2 rounded-lg transition-colors disabled:opacity-30"
          style={{ background: 'var(--bg)', minWidth: 44, minHeight: 44 }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: 'var(--red2)' }} />
      <span className="ml-3 text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <Shield className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--muted)', opacity: 0.4 }} />
      <p className="text-sm" style={{ color: 'var(--muted)' }}>{message}</p>
    </div>
  )
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3"
      style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626' }}>
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(220,38,38,0.12)', minHeight: 44 }}>
          <RefreshCw className="w-3.5 h-3.5" /> Riprova
        </button>
      )}
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl p-4 ${className}`} style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
      {children}
    </div>
  )
}

// ─── Tab: Panoramica ─────────────────────────────────────────────────────────

function Panoramica() {
  const [data, setData] = useState<SecurityOverview | null>(null)
  const [fly, setFly] = useState<FlySecuritySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [overview, flySummary] = await Promise.all([
        fetchSecurityOverview(),
        fetchFlySecuritySummary(),
      ])
      setData(overview)
      setFly(flySummary)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingState />
  if (error) return <ErrorBanner message={error} onRetry={load} />
  if (!data) return <EmptyState message="Nessun dato disponibile." />

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" style={{ color: '#dc2626' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Alert Aperti</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{data.sentinel.total}</div>
          {data.sentinel.critical > 0 && (
            <span className="text-xs" style={{ color: '#dc2626' }}>{data.sentinel.critical} critici</span>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-2">
            <FileWarning className="w-4 h-4" style={{ color: '#d97706' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Errori 24h</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{data.errors24h}</div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-2">
            <ScrollText className="w-4 h-4" style={{ color: '#2563eb' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Audit 24h</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{data.audit24h}</div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4" style={{ color: '#6b7280' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Fly Errori 24h</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            {data.flyFailures24h !== null ? data.flyFailures24h : '—'}
          </div>
          {data.flyFailures24h === null && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Non disponibile</span>
          )}
        </Card>
      </div>

      {/* Fly details */}
      {fly && (
        <Card>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Fly Assistant — Ultime 24h</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>{fly.total24h}</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Chiamate</div>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: fly.errors24h > 0 ? '#dc2626' : 'var(--text)' }}>{fly.errors24h}</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Errori</div>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: fly.rateLimited24h > 0 ? '#d97706' : 'var(--text)' }}>{fly.rateLimited24h}</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Rate Limited</div>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                {fly.estimatedCost24h !== null ? `€${fly.estimatedCost24h}` : '—'}
              </div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Costo stimato</div>
            </div>
          </div>
        </Card>
      )}

      {/* Auth status */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Info className="w-4 h-4" style={{ color: '#d97706' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Autenticazione fallita</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Non verificato — i tentativi di accesso non riusciti non vengono attualmente registrati.
        </p>
      </Card>

      <p className="text-xs text-right" style={{ color: 'var(--muted)' }}>
        Ultimo aggiornamento: {fmtDate(data.lastUpdated)}
      </p>
    </div>
  )
}

// ─── Tab: Monitoraggio ───────────────────────────────────────────────────────

function Monitoraggio() {
  const [result, setResult] = useState<PaginatedResult<SentinelAlert> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [severityFilter, setSeverityFilter] = useState<SentinelSeverity | ''>('')
  const [statusFilter, setStatusFilter] = useState<SentinelStatus | ''>('')
  const [resolving, setResolving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: SentinelFilters = {}
      if (severityFilter) filters.severity = severityFilter
      if (statusFilter) filters.status = statusFilter
      const r = await fetchSentinelAlerts(filters, page, PAGE_SIZE)
      setResult(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento.')
    } finally {
      setLoading(false)
    }
  }, [page, severityFilter, statusFilter])

  useEffect(() => { load() }, [load])

  async function handleResolve(id: string) {
    if (resolving) return
    setResolving(id)
    try {
      const updated = await resolveSentinelAlert(id)
      setResult(prev => prev ? {
        ...prev,
        data: prev.data.map(a => a.id === id ? updated : a),
      } : prev)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore nella risoluzione.')
    } finally {
      setResolving(null)
    }
  }

  const FilterBar = () => (
    <div className="flex flex-wrap gap-2 mb-4">
      <select
        value={severityFilter}
        onChange={e => { setSeverityFilter(e.target.value as SentinelSeverity | ''); setPage(1) }}
        className="rounded-lg px-3 py-2 text-xs"
        style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', minHeight: 44 }}
      >
        <option value="">Tutte le severità</option>
        <option value="critical">Critico</option>
        <option value="warning">Warning</option>
        <option value="info">Info</option>
      </select>
      <select
        value={statusFilter}
        onChange={e => { setStatusFilter(e.target.value as SentinelStatus | ''); setPage(1) }}
        className="rounded-lg px-3 py-2 text-xs"
        style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', minHeight: 44 }}
      >
        <option value="">Tutti gli stati</option>
        <option value="new">Nuovo</option>
        <option value="acknowledged">Riconosciuto</option>
        <option value="resolved">Risolto</option>
      </select>
      <button onClick={load} className="ml-auto p-2 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--line)', minHeight: 44, minWidth: 44 }}>
        <RefreshCw className="w-4 h-4" style={{ color: 'var(--muted)' }} />
      </button>
    </div>
  )

  return (
    <div>
      <FilterBar />
      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? <LoadingState /> : !result || result.data.length === 0 ? (
        <EmptyState message={`Nessun alert ${severityFilter ? 'di tipo ' + severityFilter : ''} ${statusFilter ? 'con stato ' + statusFilter : ''} trovato.`} />
      ) : (
        <>
          <div className="space-y-2">
            {result.data.map(a => (
              <Card key={a.id}>
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={a.severity} />
                    <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{a.category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>{timeAgo(a.created_at)}</span>
                    <AlertStatusBadge status={a.status} />
                  </div>
                </div>
                <p className="text-[13px] mb-2" style={{ color: 'var(--text)' }}>{a.message}</p>
                {a.status === 'new' && (
                  <button
                    onClick={() => handleResolve(a.id)}
                    disabled={resolving === a.id}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
                    style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.2)', minHeight: 44 }}
                  >
                    {resolving === a.id ? 'Risoluzione...' : 'Segna come risolto'}
                  </button>
                )}
              </Card>
            ))}
          </div>
          <Pagination page={result.page} total={result.total} pageSize={result.pageSize} onPage={setPage} />
        </>
      )}
    </div>
  )
}

// ─── Tab: Errori ─────────────────────────────────────────────────────────────

function Errori() {
  const user = loadUser()
  const isSA = isSuperAdmin(user)
  const [result, setResult] = useState<PaginatedResult<SecurityError> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [paginaFilter, setPaginaFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: ErrorFilters = {}
      if (paginaFilter) filters.pagina = paginaFilter
      const r = await fetchSecurityErrors(filters, page, PAGE_SIZE)
      setResult(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento.')
    } finally {
      setLoading(false)
    }
  }, [page, paginaFilter])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text" value={paginaFilter} placeholder="Filtra per pagina..."
          onChange={e => { setPaginaFilter(e.target.value); setPage(1) }}
          className="rounded-lg px-3 py-2 text-xs flex-1 min-w-[160px]"
          style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', minHeight: 44 }}
        />
        <button onClick={load} className="p-2 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--line)', minHeight: 44, minWidth: 44 }}>
          <RefreshCw className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      {!isSA && (
        <div className="rounded-lg px-3 py-2 mb-4 text-xs" style={{ background: 'rgba(59,130,246,0.08)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.15)' }}>
          <Info className="w-3.5 h-3.5 inline mr-1.5" style={{ verticalAlign: 'text-bottom' }} />
          I dettagli tecnici completi sono disponibili solo per Super Admin.
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? <LoadingState /> : !result || result.data.length === 0 ? (
        <EmptyState message="Nessun errore trovato." />
      ) : (
        <>
          <div className="space-y-2">
            {result.data.map(e => (
              <Card key={e.id}>
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-mono font-semibold" style={{ color: 'var(--red2)' }}>{e.pagina}</span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{fmtDate(e.created_at)}</span>
                </div>
                <p className="text-[13px]" style={{ color: 'var(--text)' }}>
                  <strong>{e.azione}</strong>: {e.messaggio}
                </p>
                {isSA && e.dettaglio && Object.keys(e.dettaglio).length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded"
                      style={{ color: 'var(--muted)', background: 'var(--bg)', minHeight: 44, minWidth: 44 }}
                    >
                      {expanded === e.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      Dettagli
                    </button>
                    {expanded === e.id && (
                      <pre className="mt-2 p-2 rounded text-[11px] font-mono overflow-x-auto"
                        style={{ background: 'var(--bg)', color: 'var(--muted)', maxHeight: 200 }}>
                        {JSON.stringify(e.dettaglio, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
          <Pagination page={result.page} total={result.total} pageSize={result.pageSize} onPage={setPage} />
        </>
      )}
    </div>
  )
}

// ─── Tab: Accessi e Audit ────────────────────────────────────────────────────

function AccessiAudit() {
  const user = loadUser()
  const isSA = isSuperAdmin(user)
  const [result, setResult] = useState<PaginatedResult<AuditEntry> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [tableFilter, setTableFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: AuditFilters = {}
      if (tableFilter) filters.table_name = tableFilter
      if (actionFilter) filters.action = actionFilter
      const r = await fetchSecurityAudit(filters, page, PAGE_SIZE)
      setResult(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento.')
    } finally {
      setLoading(false)
    }
  }, [page, tableFilter, actionFilter])

  useEffect(() => { load() }, [load])

  const ACTION_COLORS: Record<string, string> = {
    DELETE: '#dc2626',
    UPDATE: '#d97706',
    INSERT: '#16a34a',
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1) }}
          className="rounded-lg px-3 py-2 text-xs"
          style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', minHeight: 44 }}
        >
          <option value="">Tutte le azioni</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>
        <input
          type="text" value={tableFilter} placeholder="Filtra per entità..."
          onChange={e => { setTableFilter(e.target.value); setPage(1) }}
          className="rounded-lg px-3 py-2 text-xs flex-1 min-w-[140px]"
          style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', minHeight: 44 }}
        />
        <button onClick={load} className="p-2 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--line)', minHeight: 44, minWidth: 44 }}>
          <RefreshCw className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      {/* Auth failure notice */}
      <Card className="mb-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 flex-shrink-0" style={{ color: '#d97706' }} />
          <div>
            <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>Autenticazione fallita</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Non verificato — nessuna fonte dati disponibile per i tentativi di login non riusciti.</p>
          </div>
        </div>
      </Card>

      {!isSA && (
        <div className="rounded-lg px-3 py-2 mb-4 text-xs" style={{ background: 'rgba(59,130,246,0.08)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.15)' }}>
          <Info className="w-3.5 h-3.5 inline mr-1.5" style={{ verticalAlign: 'text-bottom' }} />
          I dettagli tecnici (dati prima/dopo, email, ID record) sono disponibili solo per Super Admin.
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading ? <LoadingState /> : !result || result.data.length === 0 ? (
        <EmptyState message="Nessuna voce di audit trovata." />
      ) : (
        <>
          <div className="space-y-2">
            {result.data.map(entry => (
              <Card key={entry.id}>
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{ color: ACTION_COLORS[entry.action] ?? 'var(--text)', background: `${ACTION_COLORS[entry.action] ?? 'var(--muted)'}18` }}>
                      {entry.action}
                    </span>
                    {entry.table_name && (
                      <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{entry.table_name}</span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{fmtDate(entry.created_at)}</span>
                </div>

                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text)' }}>
                  <span>Autore: {entry.actor_label}</span>
                  {isSA && entry.record_id && (
                    <span className="font-mono" style={{ color: 'var(--muted)' }}>#{entry.record_id.slice(0, 8)}</span>
                  )}
                </div>

                {isSA && (entry.old_data || entry.new_data) && (
                  <div className="mt-2">
                    <button
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                      className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded"
                      style={{ color: 'var(--muted)', background: 'var(--bg)', minHeight: 44, minWidth: 44 }}
                    >
                      {expanded === entry.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      Dettagli tecnici
                    </button>
                    {expanded === entry.id && (
                      <div className="mt-2 space-y-2">
                        {entry.old_data && (
                          <div>
                            <span className="text-[10px] font-mono uppercase font-bold" style={{ color: '#dc2626' }}>Prima</span>
                            <pre className="mt-1 p-2 rounded text-[11px] font-mono overflow-x-auto"
                              style={{ background: 'var(--bg)', color: 'var(--muted)', maxHeight: 200 }}>
                              {JSON.stringify(entry.old_data, null, 2)}
                            </pre>
                          </div>
                        )}
                        {entry.new_data && (
                          <div>
                            <span className="text-[10px] font-mono uppercase font-bold" style={{ color: '#16a34a' }}>Dopo</span>
                            <pre className="mt-1 p-2 rounded text-[11px] font-mono overflow-x-auto"
                              style={{ background: 'var(--bg)', color: 'var(--muted)', maxHeight: 200 }}>
                              {JSON.stringify(entry.new_data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
          <Pagination page={result.page} total={result.total} pageSize={result.pageSize} onPage={setPage} />
        </>
      )}
    </div>
  )
}

// ─── Tab: Controlli di Sistema ───────────────────────────────────────────────

function ControlliSistema() {
  const [controls, setControls] = useState<SystemControl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchSecurityOverview()
      .then(d => setControls(d.controls))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Errore nel caricamento.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />
  if (error) return <ErrorBanner message={error} />

  return (
    <div className="space-y-3">
      <div className="rounded-lg px-3 py-2 text-xs mb-2"
        style={{ background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.15)', color: '#d97706' }}>
        I controlli elencati riflettono lo stato reale della configurazione.
        Gli elementi non ancora implementati sono indicati come tali.
      </div>

      {controls.map(c => (
        <Card key={c.id}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {c.status === 'active' ? (
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#16a34a' }} />
                ) : (
                  <Info className="w-4 h-4 flex-shrink-0" style={{ color: '#d97706' }} />
                )}
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.label}</span>
              </div>
              <p className="text-xs pl-6" style={{ color: 'var(--muted)' }}>{c.description}</p>
            </div>
            <StatusBadge status={c.status} label={c.statusLabel} />
          </div>
        </Card>
      ))}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CentroSicurezza() {
  const user = loadUser()
  const [activeTab, setActiveTab] = useState<Tab>('panoramica')

  if (!isAdmin(user)) {
    return <Navigate to="/dashboard" replace />
  }

  const TabContent = () => {
    switch (activeTab) {
      case 'panoramica': return <Panoramica />
      case 'monitoraggio': return <Monitoraggio />
      case 'errori': return <Errori />
      case 'audit': return <AccessiAudit />
      case 'controlli': return <ControlliSistema />
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Shield className="w-6 h-6" style={{ color: 'var(--red2)' }} />
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Centro Sicurezza</h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Monitoraggio, errori e audit del sistema Synergy
          </p>
        </div>

        {/* Tab bar — scrollable on mobile */}
        <div className="mb-6 -mx-4 px-4 overflow-x-auto">
          <div className="flex gap-1 min-w-max border-b" style={{ borderColor: 'var(--line)' }}>
            {TABS.map(t => {
              const active = activeTab === t.id
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap relative"
                  style={{
                    color: active ? 'var(--red2)' : 'var(--muted)',
                    minHeight: 44,
                  }}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                  {active && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{ background: 'var(--red2)' }} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab content */}
        <TabContent />
      </div>
    </div>
  )
}
