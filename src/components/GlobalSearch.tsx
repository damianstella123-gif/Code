import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Calendar,
  CheckSquare,
  Users,
  Truck,
  MessageSquare,
  GitBranch,
  UserCog,
  X,
  Zap,
  ArrowRight,
  Hash,
  Clock,
  AlertTriangle,
  TrendingUp,
  Lock,
} from 'lucide-react'
import { events } from '@/data/events'
import { tasks } from '@/data/tasks'
import { clients } from '@/data/clients'
import { suppliers } from '@/data/suppliers'
import { users } from '@/data/users'
import { messaggi } from '@/data/comunicazioni'
import { workflowsDemo } from '@/data/workflow'
import { loadUser } from '@/lib/auth'
import { loadWorkflowsFromStorage } from '@/lib/storage'
import { daysLeft } from '@/lib/format'

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultType = 'evento' | 'task' | 'cliente' | 'fornitore' | 'utente' | 'comunicazione' | 'workflow'

interface SearchResult {
  type: ResultType
  id: string
  title: string
  subtitle: string
  badge?: { label: string; color: string }
  urgency?: 'critical' | 'warning' | 'ok'
  route: string
  score: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function eventColor(stato: string): string {
  switch (stato) {
    case 'in_corso': return 'var(--red2)'
    case 'pianificazione': return 'var(--blue)'
    case 'completato': return 'var(--green)'
    default: return 'var(--muted)'
  }
}

function taskColor(p: string, s: string): string {
  if (s === 'completato') return 'var(--green)'
  if (p === 'alta') return 'var(--red2)'
  if (p === 'media') return 'var(--yellow)'
  return 'var(--muted)'
}

function typeIcon(type: ResultType) {
  switch (type) {
    case 'evento': return Calendar
    case 'task': return CheckSquare
    case 'cliente': return Users
    case 'fornitore': return Truck
    case 'utente': return UserCog
    case 'comunicazione': return MessageSquare
    case 'workflow': return GitBranch
  }
}

function typeLabel(type: ResultType): string {
  const map: Record<ResultType, string> = {
    evento: 'Evento',
    task: 'Task',
    cliente: 'Cliente',
    fornitore: 'Fornitore',
    utente: 'Utente',
    comunicazione: 'Messaggio',
    workflow: 'Workflow',
  }
  return map[type]
}

function typeColor(type: ResultType): string {
  switch (type) {
    case 'evento': return 'var(--red2)'
    case 'task': return 'var(--blue)'
    case 'cliente': return 'var(--green)'
    case 'fornitore': return 'var(--yellow)'
    case 'utente': return '#a78bfa'
    case 'comunicazione': return 'var(--blue)'
    case 'workflow': return 'var(--muted)'
  }
}

function matchScore(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return 0
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  if (t.includes(q)) return 60
  const words = q.split(/\s+/)
  const hits = words.filter(w => t.includes(w)).length
  if (hits === words.length) return 50
  if (hits > 0) return 20 * (hits / words.length)
  return 0
}

function score(fields: string[], query: string): number {
  return Math.max(...fields.map(f => matchScore(f, query)))
}

// ─── Permission filters ───────────────────────────────────────────────────────

function getVisibleEvents(ruolo: string, userId: string) {
  if (ruolo === 'Admin' || ruolo === 'Finance') return events
  if (ruolo === 'Manager' || ruolo === 'Commerciale')
    return events.filter(e => e.responsabile === userId || e.team.includes(userId))
  if (ruolo === 'Operativo')
    return events.filter(e => e.team.includes(userId))
  return [] // Fornitore
}
function getVisibleTasks(ruolo: string, userId: string) {
  if (ruolo === 'Admin' || ruolo === 'Manager') return tasks
  if (ruolo === 'Finance') return tasks.filter(t => !t.evento)
  return tasks.filter(t => t.assegnatario === userId)
}
function getVisibleUsers(ruolo: string) {
  if (ruolo === 'Admin' || ruolo === 'Manager') return users
  return []
}
function getVisibleClients(ruolo: string) {
  if (ruolo === 'Admin' || ruolo === 'Manager' || ruolo === 'Commerciale') return clients
  return []
}
function getVisibleSuppliers(ruolo: string) {
  if (ruolo === 'Admin' || ruolo === 'Manager' || ruolo === 'Finance') return suppliers
  return []
}
function getVisibleMessages(ruolo: string, userId: string) {
  if (ruolo === 'Admin') return messaggi
  return messaggi.filter(m => m.mittente === userId || m.destinatari.includes(userId))
}
function getVisibleWorkflows(ruolo: string, userId: string) {
  if (ruolo === 'Admin' || ruolo === 'Finance') return workflowsDemo
  const myEvtIds = getVisibleEvents(ruolo, userId).map(e => e.id)
  return workflowsDemo.filter(w => myEvtIds.includes(w.eventoId))
}


// ─── Smart suggestions (no query) ────────────────────────────────────────────

function getSmartSuggestions(ruolo: string, userId: string): SearchResult[] {
  const results: SearchResult[] = []

  // Urgent tasks
  const urgentTasks = getVisibleTasks(ruolo, userId)
    .filter(t => t.priorita === 'alta' && t.stato !== 'completato')
    .slice(0, 2)
  urgentTasks.forEach(t => {
    const dl = daysLeft(t.scadenza)
    results.push({
      type: 'task',
      id: t.id,
      title: t.titolo,
      subtitle: `Scadenza: ${new Date(t.scadenza).toLocaleDateString('it-IT')} · ${dl < 0 ? `${Math.abs(dl)}g scaduto` : `tra ${dl}g`}`,
      badge: { label: 'Urgente', color: 'var(--red2)' },
      urgency: dl < 0 ? 'critical' : 'warning',
      route: '/task',
      score: 90,
    })
  })

  // Active events
  const activeEvents = getVisibleEvents(ruolo, userId)
    .filter(e => e.stato === 'in_corso')
    .slice(0, 2)
  activeEvents.forEach(e => {
    const dl = daysLeft(e.dataInizio)
    results.push({
      type: 'evento',
      id: e.id,
      title: e.nome,
      subtitle: `${e.location} · ${new Date(e.dataInizio).toLocaleDateString('it-IT')}`,
      badge: { label: 'In Corso', color: 'var(--red2)' },
      urgency: dl <= 7 ? 'warning' : 'ok',
      route: '/eventi',
      score: 85,
    })
  })

  // Blocked workflows
  const wfs = loadWorkflowsFromStorage()
  getVisibleWorkflows(ruolo, userId).forEach(wfBase => {
    const wf = wfs.find((w: typeof wfBase) => w.id === wfBase.id) ?? wfBase
    const faseAttiva = wf.fasi.find((f: { ordine: number }) => f.ordine === wf.faseCorrenteOrdine)
    if (!faseAttiva) return
    const hasBlocker = faseAttiva.taskCriticiIds?.some((tid: string) => {
      const t = tasks.find(x => x.id === tid)
      return t && t.stato !== 'completato'
    })
    if (hasBlocker) {
      const evName = events.find(e => e.id === wf.eventoId)?.nome ?? wf.eventoId
      results.push({
        type: 'workflow',
        id: wf.id,
        title: evName,
        subtitle: `Bloccato in "${faseAttiva.nome}" — task critici aperti`,
        badge: { label: 'Bloccato', color: 'var(--red2)' },
        urgency: 'critical',
        route: '/workflow',
        score: 88,
      })
    }
  })

  return results.slice(0, 6)
}

// ─── Main search function ─────────────────────────────────────────────────────

function runSearch(query: string, ruolo: string, userId: string): SearchResult[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  const results: SearchResult[] = []

  // Events
  getVisibleEvents(ruolo, userId).forEach(ev => {
    const s = score([ev.nome, ev.descrizione, ev.location, ev.cliente], q)
    if (s > 0) {
      const dl = daysLeft(ev.dataInizio)
      results.push({
        type: 'evento', id: ev.id,
        title: ev.nome,
        subtitle: `${ev.location} · ${new Date(ev.dataInizio).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}`,
        badge: {
          label: ev.stato === 'in_corso' ? 'In Corso' : ev.stato === 'pianificazione' ? 'Pianificazione' : ev.stato === 'completato' ? 'Completato' : 'Bozza',
          color: eventColor(ev.stato),
        },
        urgency: ev.stato === 'in_corso' && dl <= 7 ? 'warning' : undefined,
        route: '/eventi',
        score: s,
      })
    }
  })

  // Tasks
  getVisibleTasks(ruolo, userId).forEach(t => {
    const assignee = users.find(u => u.id === t.assegnatario)
    const s = score([t.titolo, t.descrizione, assignee?.nome ?? ''], q)
    if (s > 0) {
      const dl = daysLeft(t.scadenza)
      results.push({
        type: 'task', id: t.id,
        title: t.titolo,
        subtitle: `${assignee?.nome ?? '—'} · ${new Date(t.scadenza).toLocaleDateString('it-IT')}`,
        badge: {
          label: t.stato === 'completato' ? 'Completato' : t.stato === 'in_corso' ? 'In Corso' : 'Da Fare',
          color: taskColor(t.priorita, t.stato),
        },
        urgency: t.priorita === 'alta' && t.stato !== 'completato' ? (dl < 0 ? 'critical' : 'warning') : undefined,
        route: '/task',
        score: s + (t.priorita === 'alta' ? 10 : 0),
      })
    }
  })

  // Clients
  getVisibleClients(ruolo).forEach(c => {
    const s = score([c.nome, c.settore, c.referente, c.email], q)
    if (s > 0) {
      results.push({
        type: 'cliente', id: c.id,
        title: c.nome,
        subtitle: `${c.settore} · ${c.citta}`,
        badge: {
          label: c.stato === 'vip' ? 'VIP' : c.stato === 'prospect' ? 'Prospect' : c.stato === 'attivo' ? 'Attivo' : 'Perso',
          color: c.stato === 'vip' ? 'var(--yellow)' : c.stato === 'attivo' ? 'var(--green)' : c.stato === 'prospect' ? 'var(--blue)' : 'var(--muted)',
        },
        route: '/crm',
        score: s,
      })
    }
  })

  // Suppliers
  getVisibleSuppliers(ruolo).forEach(s_ => {
    const s = score([s_.nome, s_.categoria, s_.referente, s_.location], q)
    if (s > 0) {
      results.push({
        type: 'fornitore', id: s_.id,
        title: s_.nome,
        subtitle: `${s_.categoria} · ${s_.location} · ★${s_.rating}`,
        badge: {
          label: s_.statoContratto === 'attivo' ? 'Attivo' : s_.statoContratto === 'in_scadenza' ? 'In Scadenza' : 'Scaduto',
          color: s_.statoContratto === 'attivo' ? 'var(--green)' : s_.statoContratto === 'in_scadenza' ? 'var(--yellow)' : 'var(--red2)',
        },
        urgency: s_.statoContratto === 'scaduto' ? 'critical' : s_.statoContratto === 'in_scadenza' ? 'warning' : undefined,
        route: '/fornitori',
        score: s,
      })
    }
  })

  // Users
  getVisibleUsers(ruolo).forEach(u => {
    const s = score([u.nome, u.email, u.ruolo, u.reparto], q)
    if (s > 0) {
      results.push({
        type: 'utente', id: u.id,
        title: u.nome,
        subtitle: `${u.ruolo} · ${u.reparto}`,
        badge: {
          label: u.stato === 'attivo' ? 'Attivo' : u.stato === 'ferie' ? 'Ferie' : 'Malattia',
          color: u.stato === 'attivo' ? 'var(--green)' : 'var(--yellow)',
        },
        route: '/utenti',
        score: s,
      })
    }
  })

  // Communications
  getVisibleMessages(ruolo, userId).forEach(m => {
    const sender = users.find(u => u.id === m.mittente)
    const s = score([m.oggetto, m.corpo.slice(0, 80), sender?.nome ?? ''], q)
    if (s > 0) {
      results.push({
        type: 'comunicazione', id: m.id,
        title: m.oggetto,
        subtitle: `Da ${sender?.nome ?? '—'} · ${new Date(m.data).toLocaleDateString('it-IT')}`,
        badge: {
          label: m.priorita === 'alta' ? 'Urgente' : m.priorita === 'media' ? 'Normale' : 'Bassa',
          color: m.priorita === 'alta' ? 'var(--red2)' : m.priorita === 'media' ? 'var(--blue)' : 'var(--muted)',
        },
        route: '/comunicazioni',
        score: s,
      })
    }
  })

  // Workflows
  const wfs = loadWorkflowsFromStorage()
  getVisibleWorkflows(ruolo, userId).forEach(wfBase => {
    const wf = wfs.find((w: typeof wfBase) => w.id === wfBase.id) ?? wfBase
    const evName = events.find(e => e.id === wf.eventoId)?.nome ?? wf.eventoId
    const faseAttiva = wf.fasi.find((f: { ordine: number }) => f.ordine === wf.faseCorrenteOrdine)
    const s = score([evName, faseAttiva?.nome ?? ''], q)
    if (s > 0) {
      const pct = Math.round(wf.fasi.reduce((acc: number, f: { avanzamento: number }) => acc + f.avanzamento, 0) / wf.fasi.length)
      const blocked = faseAttiva?.taskCriticiIds?.some((tid: string) => {
        const t = tasks.find(x => x.id === tid)
        return t && t.stato !== 'completato'
      })
      results.push({
        type: 'workflow', id: wf.id,
        title: evName,
        subtitle: `${faseAttiva?.nome ?? 'N/D'} · ${pct}% completato`,
        badge: {
          label: blocked ? 'Bloccato' : pct === 100 ? 'Completo' : 'In Corso',
          color: blocked ? 'var(--red2)' : pct === 100 ? 'var(--green)' : 'var(--blue)',
        },
        urgency: blocked ? 'critical' : undefined,
        route: '/workflow',
        score: s,
      })
    }
  })

  return results
    .sort((a, b) => b.score - a.score || (b.urgency === 'critical' ? 1 : 0) - (a.urgency === 'critical' ? 1 : 0))
    .slice(0, 12)
}

// ─── Result item ──────────────────────────────────────────────────────────────

function ResultItem({ result, query, isActive, onClick }: {
  result: SearchResult
  query: string
  isActive: boolean
  onClick: () => void
}) {
  const Icon = typeIcon(result.type)
  const tColor = typeColor(result.type)

  // Highlight matching text
  function highlight(text: string) {
    if (!query.trim()) return <span>{text}</span>
    const q = query.toLowerCase().trim()
    const idx = text.toLowerCase().indexOf(q)
    if (idx === -1) return <span>{text}</span>
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(208,0,58,0.25)', color: 'var(--red2)', borderRadius: 2, padding: '0 1px' }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
      style={{
        background: isActive ? 'rgba(208,0,58,0.07)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--red2)' : '2px solid transparent',
      }}
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${tColor}15`, border: `1px solid ${tColor}25` }}>
        <Icon className="w-3.5 h-3.5" style={{ color: tColor }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium px-1.5 py-0.5 rounded"
            style={{ background: `${tColor}12`, color: tColor, fontSize: 10, letterSpacing: '0.04em' }}>
            {typeLabel(result.type)}
          </span>
          {result.urgency === 'critical' && (
            <AlertTriangle className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--red2)' }} />
          )}
          {result.urgency === 'warning' && (
            <Zap className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--yellow)' }} />
          )}
        </div>
        <p className="text-sm font-medium mt-0.5 truncate" style={{ color: 'var(--text)' }}>
          {highlight(result.title)}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{result.subtitle}</p>
      </div>

      {/* Badge */}
      {result.badge && (
        <span className="text-xs px-2 py-0.5 rounded flex-shrink-0 font-medium whitespace-nowrap"
          style={{ background: `${result.badge.color}15`, color: result.badge.color, border: `1px solid ${result.badge.color}25` }}>
          {result.badge.label}
        </span>
      )}

      {/* Arrow */}
      <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 opacity-40 group-hover:opacity-100" style={{ color: 'var(--muted)' }} />
    </button>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label, icon: Icon, color }: { label: string; icon: typeof Search; color: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5"
      style={{ borderBottom: '1px solid var(--line)', background: 'rgba(255,255,255,0.01)' }}>
      <Icon className="w-3 h-3" style={{ color }} />
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
    </div>
  )
}

// ─── Main GlobalSearch ────────────────────────────────────────────────────────

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const currentUser = loadUser()
  const ruolo = currentUser?.ruolo ?? 'Admin'
  const userId = currentUser?.id ?? ''

  const results = useMemo(() => {
    if (query.trim().length < 1) return []
    return runSearch(query, ruolo, userId)
  }, [query, ruolo, userId])

  const suggestions = useMemo(() => {
    if (query.trim()) return []
    return getSmartSuggestions(ruolo, userId)
  }, [query, ruolo, userId])

  const displayed = query.trim() ? results : suggestions
  const isEmpty = displayed.length === 0 && open

  // Keyboard navigation
  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, displayed.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && displayed[activeIdx]) {
      navigate(displayed[activeIdx].route)
      setOpen(false)
      setQuery('')
      inputRef.current?.blur()
    }
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
  }, [open, displayed, activeIdx, navigate])

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Group results by type for display
  const grouped = useMemo(() => {
    const map: Record<string, SearchResult[]> = {}
    displayed.forEach(r => {
      ;(map[r.type] ??= []).push(r)
    })
    return map
  }, [displayed])

  const flatDisplayed = useMemo(() => displayed, [displayed])

  function navigate_(route: string) {
    navigate(route)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  return (
    <div className="relative" style={{ flex: 1, maxWidth: 420 }}>
      {/* Input */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
        style={{
          background: open ? 'var(--panel2)' : 'var(--panel)',
          border: `1px solid ${open ? 'rgba(208,0,58,0.4)' : 'var(--line)'}`,
          boxShadow: open ? '0 0 0 3px rgba(208,0,58,0.08)' : 'none',
        }}
      >
        <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: open ? 'var(--red2)' : 'var(--muted)' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKey}
          placeholder="Cerca eventi, task, clienti…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: 13,
            minWidth: 0,
          }}
        />
        {query && (
          <button onMouseDown={e => { e.preventDefault(); setQuery('') }}
            className="p-0.5 rounded hover:bg-white/10 flex-shrink-0 transition-all">
            <X className="w-3 h-3" style={{ color: 'var(--muted)' }} />
          </button>
        )}
        <kbd className="hidden lg:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs flex-shrink-0"
          style={{ background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--line)', fontSize: 10 }}>
          <span style={{ fontSize: 11 }}>⌘</span>K
        </kbd>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-2 rounded-2xl overflow-hidden animate-fade-in"
          style={{
            background: 'var(--panel)',
            border: '1px solid rgba(208,0,58,0.15)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.65), 0 0 40px rgba(208,0,58,0.06)',
            zIndex: 500,
            maxHeight: 480,
            overflowY: 'auto',
          }}
        >
          {/* Smart suggestions header (no query) */}
          {!query.trim() && suggestions.length > 0 && (
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--line)' }}>
              <Zap className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--yellow)' }}>Suggerimenti Fly</span>
              <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>Priorità operativa</span>
            </div>
          )}

          {/* Results header (with query) */}
          {query.trim() && results.length > 0 && (
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--line)' }}>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {results.length} risultat{results.length === 1 ? 'o' : 'i'} per "<span style={{ color: 'var(--text)' }}>{query}</span>"
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>↑↓ naviga</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--panel2)', color: 'var(--muted)', border: '1px solid var(--line)', fontSize: 10 }}>↵</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {isEmpty && query.trim() && (
            <div className="py-10 text-center">
              <Hash className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: 'var(--muted)' }} />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun risultato per "{query}"</p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)', opacity: 0.6 }}>Prova con un termine diverso</p>
            </div>
          )}

          {/* Empty state — no suggestions */}
          {!query.trim() && suggestions.length === 0 && (
            <div className="py-8 text-center">
              <Search className="w-7 h-7 mx-auto mb-2 opacity-20" style={{ color: 'var(--muted)' }} />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Inizia a digitare per cercare</p>
            </div>
          )}

          {/* Grouped results */}
          {!query.trim()
            ? /* Suggestions flat */
              flatDisplayed.map((result, i) => (
                <ResultItem
                  key={result.type + result.id}
                  result={result}
                  query={query}
                  isActive={i === activeIdx}
                  onClick={() => navigate_(result.route)}
                />
              ))
            : /* Search results grouped by type */
              Object.entries(grouped).map(([type, typeResults]) => {
                const Icon = typeIcon(type as ResultType)
                const color = typeColor(type as ResultType)
                return (
                  <div key={type}>
                    <SectionHeader
                      label={typeLabel(type as ResultType) + (typeResults.length > 1 ? `s (${typeResults.length})` : '')}
                      icon={Icon}
                      color={color}
                    />
                    {typeResults.map(result => {
                      const globalIdx = flatDisplayed.findIndex(r => r.id === result.id && r.type === result.type)
                      return (
                        <ResultItem
                          key={result.type + result.id}
                          result={result}
                          query={query}
                          isActive={globalIdx === activeIdx}
                          onClick={() => navigate_(result.route)}
                        />
                      )
                    })}
                  </div>
                )
              })
          }

          {/* Footer */}
          {displayed.length > 0 && (
            <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap"
              style={{ borderTop: '1px solid var(--line)', background: 'rgba(255,255,255,0.01)' }}>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Risultati in tempo reale</span>
              </div>
              {ruolo !== 'Admin' && (
                <div className="flex items-center gap-1 ml-auto">
                  <Lock className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>Filtrato per {ruolo}</span>
                </div>
              )}
              {ruolo === 'Admin' && (
                <div className="flex items-center gap-1 ml-auto">
                  <TrendingUp className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>Accesso completo</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
