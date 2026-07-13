import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Send, X, Calendar, Users, Briefcase, CheckSquare, PawPrint, Check, XCircle, CreditCard, MessageSquare, FileText, UserCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackAction } from '@/lib/impact-tracker'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Client } from '@/data/clients'

interface CommandBarProps {
  events: Event[]
  tasks: Task[]
  clients: Client[]
  onFilter?: (filter: string) => void
}

interface FlyEntity {
  type: 'event' | 'supplier' | 'task' | 'client'
  id: string
  nome?: string
  data?: string
  stato?: string
  categoria?: string
  citta?: string
  scadenza?: string
  priorita?: string
  [key: string]: unknown
}

interface FlyProposal {
  action: string
  params: Record<string, unknown>
}

interface EventDraftProposal {
  nome: string
  location: string
  pax: number
  budget: number
  giorni: number
  fornitori: { id: string; nome: string; categoria: string }[]
}

interface FlyMessage {
  role: 'user' | 'assistant'
  content: string
  entities?: FlyEntity[]
  proposal?: FlyProposal | null
  proposalStatus?: 'pending' | 'confirmed' | 'rejected' | 'executing' | 'done' | 'failed'
  eventProposal?: EventDraftProposal | null
  eventProposalStatus?: 'pending' | 'executing' | 'done' | 'failed' | 'rejected'
}

// ─── Slash Command Types ─────────────────────────────────────────────────────

interface CommandAction {
  label: string
  fn: () => void
}

interface CommandResult {
  type: string
  id: string
  title: string
  meta: string
  actions: CommandAction[]
}

const VALID_COMMANDS = ['evento', 'task', 'pagamento', 'persona', 'ferie', 'comunicazioni', 'dossier'] as const

function parseCommand(query: string): { type: string; search: string } | null {
  if (!query.startsWith('/')) return null
  const parts = query.split(' ')
  const cmd = parts[0].slice(1).toLowerCase()
  const search = parts.slice(1).join(' ').trim()
  if (!(VALID_COMMANDS as readonly string[]).includes(cmd)) return null
  return { type: cmd, search }
}

const CMD_ICONS: Record<string, typeof Calendar> = {
  evento: Calendar,
  task: CheckSquare,
  pagamento: CreditCard,
  persona: UserCircle,
  ferie: Calendar,
  comunicazioni: MessageSquare,
  dossier: FileText,
}

// ─── Entity Card ──────────────────────────────────────────────────────────────

function getCountdown(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const now = new Date()
  const diff = Math.ceil((target.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return `T+${Math.abs(diff)}`
  if (diff === 0) return 'OGGI'
  return `T-${diff}`
}

const ENTITY_ICONS: Record<string, typeof Calendar> = {
  event: Calendar,
  supplier: Briefcase,
  task: CheckSquare,
  client: Users,
}

const STATO_COLORS: Record<string, string> = {
  pianificazione: 'var(--blue)',
  in_corso: 'var(--green)',
  completato: 'var(--muted)',
  bozza: 'var(--yellow)',
  attivo: 'var(--green)',
  lead: 'var(--blue)',
  da_fare: 'var(--yellow)',
  in_lavorazione: 'var(--blue)',
  completata: 'var(--green)',
}

function EntityCard({ entity, navigate }: { entity: FlyEntity; navigate: (path: string) => void }) {
  const Icon = ENTITY_ICONS[entity.type] || Calendar
  const countdown = entity.type === 'event' ? getCountdown(entity.data as string) : null
  const statoColor = STATO_COLORS[(entity.stato || '').toLowerCase()] || 'var(--muted)'

  function handleClick() {
    switch (entity.type) {
      case 'event': navigate(`/eventi?id=${entity.id}`); break
      case 'supplier': navigate('/fornitori'); break
      case 'task': navigate('/task'); break
      case 'client': navigate(`/crm?client=${entity.id}`); break
    }
  }

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)',
        background: 'var(--panel2)', cursor: 'pointer', textAlign: 'left',
        transition: 'border-color 150ms, background 150ms',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--red2)'; (e.currentTarget as HTMLElement).style.background = 'rgba(208,0,58,0.04)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.background = 'var(--panel2)' }}
    >
      <Icon style={{ width: 14, height: 14, color: 'var(--muted)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entity.nome || entity.id}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          {entity.stato && (
            <span style={{ padding: '1px 5px', borderRadius: 3, background: `${statoColor}18`, color: statoColor, fontWeight: 600, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              {entity.stato}
            </span>
          )}
          {entity.data && <span>{entity.data}</span>}
          {entity.categoria && <span>{entity.categoria}</span>}
          {entity.citta && <span>{entity.citta}</span>}
          {entity.scadenza && <span>{entity.scadenza}</span>}
        </div>
      </div>
      {countdown && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, color: countdown.startsWith('T+') ? 'var(--red2)' : countdown === 'OGGI' ? 'var(--yellow)' : 'var(--green)', flexShrink: 0 }}>
          {countdown}
        </span>
      )}
    </button>
  )
}

// ─── Main CommandBar ──────────────────────────────────────────────────────────

export default function CommandBar({ events, tasks, clients }: CommandBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [flyOpen, setFlyOpen] = useState(false)
  const [flyHistory, setFlyHistory] = useState<FlyMessage[]>([])
  const [flyLoading, setFlyLoading] = useState(false)
  const [flyInput, setFlyInput] = useState('')
  const [flyError, setFlyError] = useState<string | null>(null)
  const flyEndRef = useRef<HTMLDivElement>(null)

  const [smartSuggestions, setSmartSuggestions] = useState<{label:string;query:string}[]>([])
  const [recentQueries, setRecentQueries] = useState<string[]>([])

  // Slash command state
  const [commandResults, setCommandResults] = useState<CommandResult[]>([])
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1)
  const [commandLoading, setCommandLoading] = useState(false)
  const commandDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false)
        setCommandResults([])
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    const path = location.pathname
    const hour = new Date().getHours()
    const sugg: {label:string;query:string}[] = []

    if (hour >= 8 && hour <= 10) sugg.push({ label: 'Briefing mattino', query: 'cosa ho oggi?' })
    if (hour >= 16 && hour <= 18) sugg.push({ label: 'Riepilogo giornata', query: 'cosa ho completato oggi?' })

    if (path.includes('/eventi/') && path.split('/').length > 2) {
      sugg.push(
        { label: 'Margine evento', query: 'qual e\' il margine di questo evento?' },
        { label: 'Task aperti', query: 'quali task sono aperti su questo evento?' },
        { label: 'Green Report', query: 'genera il green report di questo evento' }
      )
    } else if (path === '/fornitori') {
      sugg.push(
        { label: 'Hotel Milano', query: 'fornitori hotel a Milano' },
        { label: 'DMC estero', query: 'fornitori DMC per eventi internazionali' }
      )
    } else if (path === '/calendario') {
      sugg.push(
        { label: 'Questa settimana', query: 'cosa ho questa settimana?' },
        { label: 'Conflitti', query: 'ci sono sovrapposizioni nel calendario?' }
      )
    } else if (path === '/amministrazione') {
      sugg.push(
        { label: 'In attesa', query: 'quali pagamenti aspettano approvazione?' },
        { label: 'Liquidita\'', query: 'qual e\' la liquidita\' complessiva?' }
      )
    }

    sugg.push(
      { label: 'Cosa fare adesso', query: 'cosa dovrei fare adesso?' },
      { label: 'Scadenze oggi', query: 'cosa scade oggi o domani?' }
    )

    setSmartSuggestions(sugg.slice(0, 5))

    try {
      const r = JSON.parse(localStorage.getItem('fly_recent') || '[]')
      setRecentQueries(r.slice(0, 3))
    } catch { /* ignore */ }
  }, [location.pathname])

  useEffect(() => {
    flyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [flyHistory, flyLoading])

  // ─── Slash Command Fetching ──────────────────────────────────────────────────

  const fetchCommandResults = useCallback(async (cmd: { type: string; search: string }) => {
    setCommandLoading(true)
    const results: CommandResult[] = []

    try {
      switch (cmd.type) {
        case 'evento': {
          const filtered = events
            .filter(e => !cmd.search || e.nome.toLowerCase().includes(cmd.search.toLowerCase()) || e.cliente.toLowerCase().includes(cmd.search.toLowerCase()))
            .slice(0, 5)
          for (const e of filtered) {
            results.push({
              type: 'evento', id: e.id,
              title: e.nome,
              meta: `${e.cliente || '—'} \u00B7 ${e.dataInizio || ''} \u00B7 ${e.stato}`,
              actions: [
                { label: 'Apri', fn: () => { navigate(`/eventi?id=${e.id}`); closeBar() } },
                { label: 'Budget', fn: () => { navigate(`/eventi?id=${e.id}&tab=budget`); closeBar() } },
                { label: 'Chat', fn: () => { navigate(`/eventi?id=${e.id}&tab=comunicazioni`); closeBar() } },
              ],
            })
          }
          break
        }
        case 'task': {
          const filtered = tasks
            .filter(t => {
              const matchSearch = !cmd.search || t.titolo.toLowerCase().includes(cmd.search.toLowerCase())
              const isActive = t.stato !== 'completato'
              return matchSearch && isActive
            })
            .slice(0, 5)
          for (const t of filtered) {
            results.push({
              type: 'task', id: t.id,
              title: t.titolo,
              meta: `${t.stato} \u00B7 ${t.scadenza || 'nessuna scadenza'} \u00B7 ${t.assegnatario || 'non assegnato'}`,
              actions: [
                { label: 'Apri', fn: () => { navigate('/task'); closeBar() } },
                { label: 'Completa', fn: async () => { await supabase.from('tasks').update({ status: 'completato' }).eq('id', t.id); closeBar() } },
              ],
            })
          }
          break
        }
        case 'pagamento': {
          const { data: payments } = await supabase.from('event_payments')
            .select('id, importo, descrizione, stato_approvazione, event_id, supplier_id, events(title), suppliers(nome)')
            .eq('stato_approvazione', 'in_attesa')
            .order('created_at', { ascending: false })
            .limit(5)
          for (const p of payments || []) {
            const evName = (p as any).events?.title || ''
            const supName = (p as any).suppliers?.nome || ''
            const label = supName || evName || p.descrizione || 'Pagamento'
            if (!cmd.search || label.toLowerCase().includes(cmd.search.toLowerCase())) {
              results.push({
                type: 'pagamento', id: p.id,
                title: label,
                meta: `\u20AC${Number(p.importo).toLocaleString('it-IT')} \u00B7 ${evName}`,
                actions: [
                  { label: 'Apri', fn: () => { navigate('/amministrazione'); closeBar() } },
                  { label: 'Approva', fn: async () => { await supabase.from('event_payments').update({ stato_approvazione: 'approvato', approvato_da: undefined, approvato_at: new Date().toISOString() }).eq('id', p.id); closeBar() } },
                ],
              })
            }
          }
          break
        }
        case 'persona': {
          const { data: profiles } = await supabase.from('profiles')
            .select('id, first_name, last_name, role, stato')
            .eq('stato', 'attivo')
            .order('first_name')
          const filtered = (profiles || [])
            .filter(p => !cmd.search || `${p.first_name} ${p.last_name}`.toLowerCase().includes(cmd.search.toLowerCase()))
            .slice(0, 5)
          for (const p of filtered) {
            results.push({
              type: 'persona', id: p.id,
              title: `${p.first_name} ${p.last_name}`,
              meta: p.role || '—',
              actions: [
                { label: 'Profilo', fn: () => { navigate('/utenti'); closeBar() } },
                { label: 'Chat', fn: () => { navigate('/comunicazioni'); closeBar() } },
              ],
            })
          }
          break
        }
        case 'ferie': {
          const { data: leaves } = await supabase.from('leave_requests')
            .select('id, tipo, data_inizio, data_fine, stato, profiles(first_name, last_name)')
            .eq('stato', 'in_attesa')
            .order('created_at', { ascending: false })
            .limit(5)
          for (const l of leaves || []) {
            const prof = (l as any).profiles
            const name = prof ? `${prof.first_name} ${prof.last_name}` : '—'
            if (!cmd.search || name.toLowerCase().includes(cmd.search.toLowerCase())) {
              results.push({
                type: 'ferie', id: l.id,
                title: `${name} — ${l.tipo}`,
                meta: `${l.data_inizio} a ${l.data_fine} \u00B7 ${l.stato}`,
                actions: [
                  { label: 'Gestisci', fn: () => { navigate('/amministrazione?tab=ferie'); closeBar() } },
                ],
              })
            }
          }
          break
        }
        case 'comunicazioni': {
          const { data: threads } = await supabase.from('comunicazioni_threads')
            .select('id, oggetto, stato, event_id, events(title)')
            .eq('stato', 'aperto')
            .order('updated_at', { ascending: false })
            .limit(5)
          for (const t of threads || []) {
            const evName = (t as any).events?.title || ''
            if (!cmd.search || t.oggetto.toLowerCase().includes(cmd.search.toLowerCase()) || evName.toLowerCase().includes(cmd.search.toLowerCase())) {
              results.push({
                type: 'comunicazioni', id: t.id,
                title: t.oggetto,
                meta: `${evName} \u00B7 ${t.stato}`,
                actions: [
                  { label: 'Apri', fn: () => { navigate(`/eventi?id=${t.event_id}&tab=comunicazioni`); closeBar() } },
                ],
              })
            }
          }
          break
        }
        case 'dossier': {
          const { data: docs } = await supabase.from('dossiers')
            .select('id, titolo, stato, scadenza')
            .order('created_at', { ascending: false })
            .limit(5)
          for (const d of docs || []) {
            if (!cmd.search || (d.titolo || '').toLowerCase().includes(cmd.search.toLowerCase())) {
              results.push({
                type: 'dossier', id: d.id,
                title: d.titolo || 'Senza titolo',
                meta: `${d.stato || '—'} \u00B7 ${d.scadenza || 'nessuna scadenza'}`,
                actions: [
                  { label: 'Apri', fn: () => { navigate('/dossier'); closeBar() } },
                ],
              })
            }
          }
          break
        }
      }
    } catch { /* ignore fetch errors */ }

    setCommandResults(results)
    setSelectedResultIndex(-1)
    setCommandLoading(false)
  }, [events, tasks, navigate])

  function closeBar() {
    setQuery('')
    setFocused(false)
    setCommandResults([])
    setSelectedResultIndex(-1)
  }

  // ─── Query Change Handler ────────────────────────────────────────────────────

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setSelectedResultIndex(-1)

    const cmd = parseCommand(value)
    if (cmd) {
      if (commandDebounceRef.current) clearTimeout(commandDebounceRef.current)
      commandDebounceRef.current = setTimeout(() => fetchCommandResults(cmd), 200)
    } else {
      setCommandResults([])
    }
  }, [fetchCommandResults])

  // ─── Basic search results (non-slash) ────────────────────────────────────────

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || q.startsWith('/')) return null

    const matchedEvents = events
      .filter(e => e.nome.toLowerCase().includes(q) || e.location.toLowerCase().includes(q))
      .slice(0, 5)
    const matchedTasks = tasks
      .filter(t => t.titolo.toLowerCase().includes(q))
      .slice(0, 5)
    const matchedClients = clients
      .filter(c => c.nome.toLowerCase().includes(q))
      .slice(0, 5)

    if (matchedEvents.length === 0 && matchedTasks.length === 0 && matchedClients.length === 0) return null
    return { events: matchedEvents, tasks: matchedTasks, clients: matchedClients }
  }, [query, events, tasks, clients])

  const handleSelect = useCallback((type: 'event' | 'task' | 'client', id: string) => {
    setQuery('')
    setFocused(false)
    setCommandResults([])
    if (type === 'event') navigate(`/eventi?id=${id}`)
    else if (type === 'task') navigate('/task')
    else navigate('/crm')
  }, [navigate])

  // ─── Keyboard navigation ────────────────────────────────────────────────────

  const handleBarKeyDown = (e: React.KeyboardEvent) => {
    // Slash command results navigation
    if (commandResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedResultIndex(prev => Math.min(prev + 1, commandResults.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedResultIndex(prev => Math.max(prev - 1, -1))
        return
      }
      if (e.key === 'Enter' && selectedResultIndex >= 0) {
        e.preventDefault()
        const result = commandResults[selectedResultIndex]
        if (result.actions[0]) result.actions[0].fn()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setCommandResults([])
        setSelectedResultIndex(-1)
        return
      }
    }

    if (e.key === 'Escape') {
      setFocused(false)
      setCommandResults([])
      inputRef.current?.blur()
      return
    }

    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      if (!query.startsWith('/')) {
        openFlyWithQuery(query)
      }
    }
  }

  // ─── Fly AI ─────────────────────────────────────────────────────────────────

  const [flyStreaming, setFlyStreaming] = useState(false)

  const askFly = useCallback(async (text: string) => {
    if (!text.trim() || flyLoading) return
    if (!navigator.onLine) {
      setFlyError('Fly non \u00E8 disponibile offline. Riconnettiti per usarla.')
      return
    }

    const userMsg: FlyMessage = { role: 'user', content: text.trim() }
    const newHistory = [...flyHistory, userMsg]
    setFlyHistory(newHistory)
    setFlyInput('')
    setFlyError(null)
    setFlyLoading(true)
    setFlyStreaming(true)

    const assistantIdx = newHistory.length
    const streamingHistory = [...newHistory, { role: 'assistant' as const, content: '' }]
    setFlyHistory(streamingHistory)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Non autenticato')

      const res = await fetch('https://vbsligpuwjzvywkpkhdn.supabase.co/functions/v1/fly-gateway', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZic2xpZ3B1d2p6dnl3a3BraGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDIyNDAsImV4cCI6MjA5NjgxODI0MH0.YaHlfxvKtht8WSg9xWxT3nrFxsJAmC4HcgunLqZwiOQ',
        },
        body: JSON.stringify({ message: text.trim(), history: flyHistory }),
      })

      if (!res.ok) {
        const errBody = await res.text()
        let errMsg = 'Errore di connessione'
        try { errMsg = JSON.parse(errBody).error || errMsg } catch {}
        throw new Error(errMsg)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('Stream non disponibile')

      const decoder = new TextDecoder()
      let accumulated = ''
      let entities: FlyEntity[] = []
      let proposal: FlyProposal | null = null
      let eventProposal: EventDraftProposal | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') break

          try {
            const parsed = JSON.parse(payload)
            if (parsed.type === 'text') {
              accumulated += parsed.content
              setFlyHistory(prev => {
                const updated = [...prev]
                updated[assistantIdx] = { ...updated[assistantIdx], content: accumulated }
                return updated
              })
            } else if (parsed.type === 'meta') {
              entities = Array.isArray(parsed.entities) ? parsed.entities : []
              proposal = parsed.proposal || null
              eventProposal = parsed.eventProposal || null
            }
          } catch {}
        }
      }

      setFlyHistory(prev => {
        const updated = [...prev]
        updated[assistantIdx] = {
          ...updated[assistantIdx],
          content: accumulated || '(nessuna risposta)',
          entities, proposal,
          proposalStatus: proposal ? 'pending' : undefined,
          eventProposal,
          eventProposalStatus: eventProposal ? 'pending' : undefined,
        }
        return updated
      })
      trackAction('fly_query')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore imprevisto'
      setFlyError(msg)
      setFlyHistory(newHistory)
    } finally {
      setFlyLoading(false)
      setFlyStreaming(false)
    }
  }, [flyHistory, flyLoading])

  const confirmProposal = useCallback(async (msgIndex: number) => {
    const msg = flyHistory[msgIndex]
    if (!msg?.proposal || msg.proposalStatus !== 'pending') return
    const updated = [...flyHistory]
    updated[msgIndex] = { ...msg, proposalStatus: 'executing' }
    setFlyHistory(updated)
    try {
      const { data, error } = await supabase.functions.invoke('fly-gateway', { body: { action: 'execute', proposal: msg.proposal } })
      if (error) throw new Error(error.message)
      if (!data?.success) throw new Error(data?.message || 'Errore esecuzione')
      const final = [...updated]
      final[msgIndex] = { ...msg, proposalStatus: 'done' }
      final.push({ role: 'assistant', content: `Fatto. ${data.message}` })
      setFlyHistory(final)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Errore'
      const final = [...updated]
      final[msgIndex] = { ...msg, proposalStatus: 'failed' }
      final.push({ role: 'assistant', content: `Errore: ${errMsg}` })
      setFlyHistory(final)
    }
  }, [flyHistory])

  const rejectProposal = useCallback((msgIndex: number) => {
    const msg = flyHistory[msgIndex]
    if (!msg?.proposal || msg.proposalStatus !== 'pending') return
    const updated = [...flyHistory]
    updated[msgIndex] = { ...msg, proposalStatus: 'rejected' }
    updated.push({ role: 'assistant', content: 'Ok, azione annullata.' })
    setFlyHistory(updated)
  }, [flyHistory])

  const confirmEventDraft = useCallback(async (msgIndex: number) => {
    const msg = flyHistory[msgIndex]
    if (!msg?.eventProposal || msg.eventProposalStatus !== 'pending') return
    const updated = [...flyHistory]
    updated[msgIndex] = { ...msg, eventProposalStatus: 'executing' }
    setFlyHistory(updated)
    try {
      const { data, error } = await supabase.functions.invoke('fly-gateway', { body: { action: 'execute', proposal: { action: 'create_event_draft', params: msg.eventProposal } } })
      if (error) throw new Error(error.message)
      if (!data?.success) throw new Error(data?.message || 'Errore creazione bozza')
      const final = [...updated]
      final[msgIndex] = { ...msg, eventProposalStatus: 'done' }
      const linkedCount = data.data?.fornitori_collegati || 0
      final.push({ role: 'assistant', content: `Bozza creata con ${linkedCount} fornitori precollegati. Aprila in EMS per completarla.` })
      setFlyHistory(final)
      trackAction('fly_propose_event')
      if (data.data?.event_id) setTimeout(() => navigate(`/eventi/${data.data.event_id}`), 600)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Errore'
      const final = [...updated]
      final[msgIndex] = { ...msg, eventProposalStatus: 'failed' }
      final.push({ role: 'assistant', content: `Errore: ${errMsg}` })
      setFlyHistory(final)
    }
  }, [flyHistory])

  const rejectEventDraft = useCallback((msgIndex: number) => {
    const msg = flyHistory[msgIndex]
    if (!msg?.eventProposal || msg.eventProposalStatus !== 'pending') return
    const updated = [...flyHistory]
    updated[msgIndex] = { ...msg, eventProposalStatus: 'rejected' }
    updated.push({ role: 'assistant', content: 'Ok, proposta evento annullata.' })
    setFlyHistory(updated)
  }, [flyHistory])

  const saveRecent = useCallback((q: string) => {
    try {
      const prev = JSON.parse(localStorage.getItem('fly_recent') || '[]')
      const updated = [q, ...prev.filter((x: string) => x !== q)].slice(0, 5)
      localStorage.setItem('fly_recent', JSON.stringify(updated))
      setRecentQueries(updated.slice(0, 3))
    } catch { /* ignore */ }
  }, [])

  const openFlyWithQuery = useCallback((text: string) => {
    setFlyOpen(true)
    setFocused(false)
    setQuery('')
    setCommandResults([])
    if (text.trim()) {
      saveRecent(text.trim())
      setFlyInput(text.trim())
      askFly(text.trim())
    }
  }, [askFly, saveRecent])

  const handleFlyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      askFly(flyInput)
    }
  }

  const isSlashMode = query.startsWith('/')
  const showDropdown = focused

  // ─── Command Hint ────────────────────────────────────────────────────────────

  const commandHint = useMemo(() => {
    if (!isSlashMode) return null
    const partial = query.slice(1).split(' ')[0].toLowerCase()
    if (!partial) return VALID_COMMANDS.map(c => `/${c}`).join('  ')
    const matches = VALID_COMMANDS.filter(c => c.startsWith(partial) && c !== partial)
    if (matches.length === 0) return null
    return matches.map(c => `/${c}`).join('  ')
  }, [query, isSlashMode])

  return (
    <div ref={containerRef} className="cmd-bar-wrapper" data-onboarding="commandbar">
      <div className="cmd-bar">
        <PawPrint style={{ width: 14, height: 14, color: isSlashMode ? 'var(--green)' : 'var(--red2)', flexShrink: 0, transition: 'color 0.2s' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleBarKeyDown}
          placeholder="Cerca o scrivi / per i comandi..."
          className="cmd-bar-input"
        />
        {query && (
          <button onClick={closeBar} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--muted)', display: 'flex' }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="cmd-dropdown">
          {/* Slash command results */}
          {isSlashMode ? (
            <div style={{ padding: '8px 0' }}>
              {/* Command hint */}
              {commandHint && commandResults.length === 0 && !commandLoading && (
                <div style={{ padding: '8px 16px' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.1em', color: 'var(--muted)', marginBottom: 6 }}>COMANDI DISPONIBILI</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {commandHint.split('  ').map(c => (
                      <button key={c} onClick={() => { handleQueryChange(c + ' '); inputRef.current?.focus() }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel2)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', cursor: 'pointer', transition: 'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)' }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {commandLoading && (
                <div style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                  Caricamento...
                </div>
              )}

              {commandResults.length > 0 && (
                <div>
                  {commandResults.map((result, idx) => {
                    const Icon = CMD_ICONS[result.type] || Calendar
                    const isSelected = idx === selectedResultIndex
                    return (
                      <div
                        key={result.id}
                        onClick={() => { if (result.actions[0]) result.actions[0].fn() }}
                        style={{
                          padding: '10px 16px',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--panel2)' : 'transparent',
                          borderLeft: isSelected ? '2px solid var(--red2)' : '2px solid transparent',
                          transition: 'background 0.1s, border-color 0.1s',
                        }}
                        onMouseEnter={() => setSelectedResultIndex(idx)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Icon style={{ width: 14, height: 14, color: 'var(--muted)', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {result.title}
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                              {result.meta}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        {result.actions.length > 0 && (
                          <div style={{ display: 'flex', gap: 5, marginTop: 6, marginLeft: 24 }}>
                            {result.actions.map((action, ai) => (
                              <button
                                key={ai}
                                onClick={(e) => { e.stopPropagation(); action.fn() }}
                                style={{
                                  padding: '3px 9px', borderRadius: 4,
                                  fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 500,
                                  border: ai === 0 ? '1px solid var(--red2)' : '1px solid var(--line)',
                                  background: ai === 0 ? 'rgba(208,0,58,0.06)' : 'transparent',
                                  color: ai === 0 ? 'var(--red2)' : 'var(--muted)',
                                  cursor: 'pointer', transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = ai === 0 ? 'rgba(208,0,58,0.12)' : 'var(--panel2)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = ai === 0 ? 'rgba(208,0,58,0.06)' : 'transparent' }}
                              >
                                {action.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {!commandLoading && commandResults.length === 0 && !commandHint && query.length > 2 && (
                <div style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                  Nessun risultato
                </div>
              )}
            </div>
          ) : !query.trim() ? (
            <div style={{ padding: '12px 16px' }}>
              {recentQueries.length > 0 && (
                <>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--muted)', marginBottom: 6 }}>RECENTI</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                    {recentQueries.map(r => (
                      <button key={r} onClick={() => openFlyWithQuery(r)} style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid var(--line)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>
                        {r.slice(0, 30)}{r.length > 30 ? '...' : ''}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--muted)', marginBottom: 6 }}>COMANDI RAPIDI</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                {VALID_COMMANDS.slice(0, 5).map(c => (
                  <button key={c} onClick={() => { handleQueryChange(`/${c} `); inputRef.current?.focus() }}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', cursor: 'pointer' }}
                  >
                    /{c}
                  </button>
                ))}
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.12em', color: 'var(--muted)', marginBottom: 6 }}>SUGGERITI PER TE</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {smartSuggestions.map(s => (
                  <button
                    key={s.query}
                    onClick={() => openFlyWithQuery(s.query)}
                    style={{ padding: '6px 12px', borderRadius: 99, border: '1px solid var(--line)', background: 'var(--panel2)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red2)'; e.currentTarget.style.color = 'var(--red2)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--text)' }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="cmd-results">
              {results && results.events.length > 0 && (
                <div className="cmd-group">
                  <span className="cmd-group-label">EVENTI</span>
                  {results.events.map(e => (
                    <button key={e.id} className="cmd-result" onClick={() => handleSelect('event', e.id)}>
                      <span className="cmd-result-name">{e.nome}</span>
                      <span className="cmd-result-ctx">{e.location} · {e.stato}</span>
                    </button>
                  ))}
                </div>
              )}
              {results && results.tasks.length > 0 && (
                <div className="cmd-group">
                  <span className="cmd-group-label">TASK</span>
                  {results.tasks.map(t => (
                    <button key={t.id} className="cmd-result" onClick={() => handleSelect('task', t.id)}>
                      <span className="cmd-result-name">{t.titolo}</span>
                      <span className="cmd-result-ctx">{t.stato} · {t.assegnatario || 'non assegnato'}</span>
                    </button>
                  ))}
                </div>
              )}
              {results && results.clients.length > 0 && (
                <div className="cmd-group">
                  <span className="cmd-group-label">CLIENTI</span>
                  {results.clients.map(c => (
                    <button key={c.id} className="cmd-result" onClick={() => handleSelect('client', c.id)}>
                      <span className="cmd-result-name">{c.nome}</span>
                      <span className="cmd-result-ctx">{c.settore} · {c.stato}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="cmd-group" style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4 }}>
                <button className="cmd-result" onClick={() => openFlyWithQuery(query)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PawPrint style={{ width: 12, height: 12, color: 'var(--muted)', flexShrink: 0 }} />
                  <span className="cmd-result-name" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    CHIEDI A FLY
                  </span>
                  <span className="cmd-result-ctx">"{query}"</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fly Conversation Panel */}
      {flyOpen && (
        <div className="fly-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PawPrint style={{ width: 14, height: 14, color: 'var(--muted)', transition: 'opacity 0.8s ease', animation: flyLoading ? 'fly-paw-pulse 1.6s ease-in-out infinite' : 'none' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)' }}>FLY</span>
              {flyLoading && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>sta cercando...</span>}
            </div>
            <button onClick={() => setFlyOpen(false)} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
            {flyHistory.length === 0 && !flyLoading && (
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Chiedi qualsiasi cosa sui tuoi dati
                </p>
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  {['Cosa scade questa settimana?', 'Eventi di questo mese', 'Fornitori categoria hotel'].map(s => (
                    <button key={s} onClick={() => askFly(s)} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {flyHistory.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', width: msg.role === 'assistant' ? '100%' : undefined }}>
                {msg.role === 'user' ? (
                  <div style={{ background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', fontSize: '12px', color: 'var(--text)' }}>
                    {msg.content}
                  </div>
                ) : (
                  <div>
                    <div style={{ borderLeft: '2px solid var(--red2)', paddingLeft: 12, fontSize: '12px', lineHeight: '1.6', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                      {flyStreaming && i === flyHistory.length - 1 && msg.role === 'assistant' && <span className="fly-cursor" />}
                    </div>
                    {msg.entities && msg.entities.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                        {msg.entities.slice(0, 5).map((ent, ei) => <EntityCard key={ei} entity={ent} navigate={navigate} />)}
                      </div>
                    )}
                    {msg.proposal && msg.proposalStatus === 'pending' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(208,0,58,0.04)', border: '1px solid rgba(208,0,58,0.15)' }}>
                        <button onClick={() => confirmProposal(i)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, background: 'var(--green)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          <Check style={{ width: 12, height: 12 }} /> Conferma
                        </button>
                        <button onClick={() => rejectProposal(i)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          <XCircle style={{ width: 12, height: 12 }} /> Annulla
                        </button>
                      </div>
                    )}
                    {msg.proposal && msg.proposalStatus === 'executing' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <PawPrint style={{ width: 12, height: 12, color: 'var(--muted)', animation: 'fly-paw-pulse 1.6s ease-in-out infinite' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>Esecuzione...</span>
                      </div>
                    )}
                    {msg.proposal && msg.proposalStatus === 'done' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <Check style={{ width: 12, height: 12, color: 'var(--green)' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--green)' }}>Eseguita</span>
                      </div>
                    )}
                    {msg.proposal && (msg.proposalStatus === 'failed' || msg.proposalStatus === 'rejected') && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <XCircle style={{ width: 12, height: 12, color: msg.proposalStatus === 'failed' ? 'var(--red2)' : 'var(--muted)' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: msg.proposalStatus === 'failed' ? 'var(--red2)' : 'var(--muted)' }}>
                          {msg.proposalStatus === 'failed' ? 'Non riuscita' : 'Annullata'}
                        </span>
                      </div>
                    )}
                    {msg.eventProposal && msg.eventProposalStatus === 'pending' && (
                      <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(208,0,58,0.2)', background: 'rgba(208,0,58,0.03)' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--red2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>PROPOSTA EVENTO</div>
                        <div style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{msg.eventProposal.nome}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                          {msg.eventProposal.location && <span>{msg.eventProposal.location}</span>}
                          {msg.eventProposal.pax && <span>{msg.eventProposal.pax} pax</span>}
                          {msg.eventProposal.budget && <span>Budget: {msg.eventProposal.budget.toLocaleString('it-IT')} EUR</span>}
                          {msg.eventProposal.giorni && <span>{msg.eventProposal.giorni}g</span>}
                        </div>
                        {msg.eventProposal.fornitori && msg.eventProposal.fornitori.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Fornitori</div>
                            {msg.eventProposal.fornitori.slice(0, 5).map((f, fi) => (
                              <div key={fi} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)', padding: '2px 0' }}>
                                {f.nome} <span style={{ color: 'var(--muted)' }}>({f.categoria})</span>
                              </div>
                            ))}
                            {msg.eventProposal.fornitori.length > 5 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>...e altri {msg.eventProposal.fornitori.length - 5}</div>}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => confirmEventDraft(i)} style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--red2)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Crea come bozza</button>
                          <button onClick={() => rejectEventDraft(i)} style={{ padding: '6px 14px', borderRadius: 6, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Annulla</button>
                        </div>
                      </div>
                    )}
                    {msg.eventProposal && msg.eventProposalStatus === 'executing' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <PawPrint style={{ width: 12, height: 12, color: 'var(--muted)', animation: 'fly-paw-pulse 1.6s ease-in-out infinite' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>Creazione bozza...</span>
                      </div>
                    )}
                    {msg.eventProposal && (msg.eventProposalStatus === 'done' || msg.eventProposalStatus === 'failed' || msg.eventProposalStatus === 'rejected') && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        {msg.eventProposalStatus === 'done' ? <Check style={{ width: 12, height: 12, color: 'var(--green)' }} /> : <XCircle style={{ width: 12, height: 12, color: msg.eventProposalStatus === 'failed' ? 'var(--red2)' : 'var(--muted)' }} />}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: msg.eventProposalStatus === 'done' ? 'var(--green)' : msg.eventProposalStatus === 'failed' ? 'var(--red2)' : 'var(--muted)' }}>
                          {msg.eventProposalStatus === 'done' ? 'Bozza creata' : msg.eventProposalStatus === 'failed' ? 'Creazione fallita' : 'Proposta annullata'}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {flyLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PawPrint className="w-3.5 h-3.5" style={{ color: 'var(--muted)', animation: 'fly-paw-pulse 1.6s ease-in-out infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>Fly sta cercando...</span>
              </div>
            )}

            {flyError && (
              <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '11px', color: 'var(--red2)', fontFamily: 'var(--font-mono)' }}>
                {flyError}
              </div>
            )}

            <div ref={flyEndRef} />
          </div>

          <div style={{ padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <input
              type="text"
              value={flyInput}
              onChange={e => setFlyInput(e.target.value)}
              onKeyDown={handleFlyKeyDown}
              placeholder="Scrivi a Fly..."
              disabled={flyLoading}
              autoFocus
              style={{ flex: 1, background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', fontSize: '12px', color: 'var(--text)', fontFamily: 'var(--font-mono)', outline: 'none' }}
            />
            <button
              onClick={() => askFly(flyInput)}
              disabled={flyLoading || !flyInput.trim()}
              style={{ background: 'var(--red2)', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: flyLoading || !flyInput.trim() ? 'not-allowed' : 'pointer', opacity: flyLoading || !flyInput.trim() ? 0.4 : 1, display: 'flex', alignItems: 'center' }}
            >
              <Send className="w-3.5 h-3.5" style={{ color: 'white' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
