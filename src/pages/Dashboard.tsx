import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, CheckSquare, Users, ArrowRight,
  AlertTriangle, TrendingUp, Archive, Sun, Moon,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { daysLeft, eventColorByStato } from '@/lib/format'
import { fetchEvents } from '@/lib/events-service'
import { fetchTasks } from '@/lib/tasks-service'
import { fetchClients } from '@/lib/clients-service'
import { fetchSuppliers } from '@/lib/suppliers-service'
import { fetchCommunications } from '@/lib/communications-service'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Client } from '@/data/clients'
import type { Supplier } from '@/data/suppliers'
import type { Messaggio } from '@/data/comunicazioni'

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

type Referente = {
  id: string
  nome: string
  cognome: string
  ruolo: string
  email: string
  is_principale: boolean
  client_name?: string
}

export default function Dashboard() {
  const navigate = useNavigate()
  const currentUser = loadUser()
  const { resolved, toggleTheme } = useTheme()

  const [liveTasks, setLiveTasks] = useState<Task[]>([])
  const [liveEvents, setLiveEvents] = useState<Event[]>([])
  const [liveClients, setLiveClients] = useState<Client[]>([])
  const [, setLiveSuppliers] = useState<Supplier[]>([])
  const [, setLiveCommunications] = useState<Messaggio[]>([])
  const [archiveCount, setArchiveCount] = useState(0)
  const [, setRecentReferenti] = useState<Referente[]>([])
  const [loading, setLoading] = useState(true)
  const [, setDiagErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      const errors: Record<string, string> = {}

      const [ev, tk, cl, sp, cm] = await Promise.all([
        fetchEvents(),
        fetchTasks(),
        fetchClients(),
        fetchSuppliers(),
        fetchCommunications(),
      ])
      setLiveEvents(ev)
      setLiveTasks(tk)
      setLiveClients(cl)
      setLiveSuppliers(sp)
      setLiveCommunications(cm)

      if (ev.length === 0) errors.events = 'Nessun evento restituito da Supabase'
      if (cl.length === 0) errors.clients = 'Nessun cliente restituito da Supabase'
      if (sp.length === 0) errors.suppliers = 'Nessun fornitore restituito da Supabase'
      setDiagErrors(errors)

      const { count } = await supabase.from('archive_items').select('*', { count: 'exact', head: true })
      setArchiveCount(count ?? 0)

      const { data: refs } = await supabase
        .from('referenti')
        .select('id, nome, cognome, ruolo, email, is_principale, client_id')
        .order('created_at', { ascending: false })
        .limit(5)
      if (refs && refs.length > 0) {
        const clientIds = [...new Set(refs.map(r => r.client_id))]
        const { data: clients } = await supabase.from('clients').select('id, name').in('id', clientIds)
        const clientMap = new Map((clients ?? []).map(c => [c.id, c.name]))
        setRecentReferenti(refs.map(r => ({ ...r, client_name: clientMap.get(r.client_id) ?? '' })))
      }

      setLoading(false)
    }
    load()
  }, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const myEvents = liveEvents
  const myTasks = liveTasks

  const kpi = useMemo(() => {
    const taskAperti = myTasks.filter(t => t.stato !== 'completato').length
    const taskCompletati = myTasks.filter(t => t.stato === 'completato').length
    const taskInRitardo = myTasks.filter(t => t.stato !== 'completato' && daysLeft(t.scadenza) < 0).length
    const eventiImminenti = myEvents.filter(e => {
      const dl = daysLeft(e.dataInizio)
      return dl >= 0 && dl <= 14 && e.stato !== 'completato'
    }).length
    const clientiAttivi = liveClients.filter(c => c.stato === 'attivo' || c.stato === 'vip').length
    const completionRate = myTasks.length > 0 ? Math.round((taskCompletati / myTasks.length) * 100) : 0

    return { taskAperti, taskCompletati, taskInRitardo, eventiImminenti, clientiAttivi, completionRate }
  }, [myEvents, myTasks, liveClients])

  const prossimEventi = useMemo(() =>
    [...myEvents]
      .filter(e => e.stato !== 'completato')
      .sort((a, b) => new Date(a.dataInizio).getTime() - new Date(b.dataInizio).getTime())
      .slice(0, 5)
  , [myEvents])

  const taskInRitardoList = useMemo(() =>
    myTasks
      .filter(t => t.stato !== 'completato' && daysLeft(t.scadenza) < 0)
      .sort((a, b) => daysLeft(a.scadenza) - daysLeft(b.scadenza))
      .slice(0, 5)
  , [myTasks])

  // Build Mission Brief text from real data
  const missionBrief = useMemo(() => {
    const firstName = currentUser?.first_name ?? currentUser?.nome?.split(' ')[0] ?? 'utente'
    const greeting = getGreeting()
    const lines: string[] = []

    lines.push(`${greeting}, ${firstName}.`)

    // General status
    if (kpi.taskInRitardo === 0 && kpi.eventiImminenti <= 2) {
      lines.push('Oggi tutto procede bene.')
    } else if (kpi.taskInRitardo > 3) {
      lines.push(`Attenzione: ${kpi.taskInRitardo} task sono in ritardo.`)
    } else if (kpi.taskInRitardo > 0) {
      lines.push(`${kpi.taskInRitardo} task ${kpi.taskInRitardo === 1 ? 'richiede' : 'richiedono'} attenzione.`)
    } else {
      lines.push('Nessuna urgenza, tutto sotto controllo.')
    }

    // Events insight
    if (kpi.eventiImminenti > 0) {
      const closest = prossimEventi[0]
      if (closest) {
        const dl = daysLeft(closest.dataInizio)
        const taskTotali = myTasks.filter(t => t.evento === closest.id).length
        const taskDone = myTasks.filter(t => t.evento === closest.id && t.stato === 'completato').length
        const pct = taskTotali > 0 ? Math.round((taskDone / taskTotali) * 100) : 100
        if (dl <= 3) {
          lines.push(`${closest.nome} e tra ${dl === 0 ? 'oggi' : dl === 1 ? 'domani' : dl + ' giorni'} — pronto al ${pct}%.`)
        } else {
          lines.push(`${kpi.eventiImminenti} ${kpi.eventiImminenti === 1 ? 'evento' : 'eventi'} nei prossimi 14 giorni.`)
        }
      }
    }

    // Financial pulse (from clients fatturato)
    const fatturatoTotale = liveClients.reduce((sum, c) => sum + (c.fatturato || 0), 0)
    if (fatturatoTotale > 0) {
      lines.push(`Il portafoglio clienti vale €${(fatturatoTotale / 1000).toFixed(0)}K.`)
    }

    // Suggestion
    if (kpi.taskInRitardo > 0 && taskInRitardoList.length > 0) {
      lines.push(`Ti consiglio di iniziare dai task in ritardo.`)
    } else if (prossimEventi.length > 0) {
      lines.push(`Ti consiglio di controllare ${prossimEventi[0].nome}.`)
    } else {
      lines.push('Buon momento per pianificare.')
    }

    return lines
  }, [currentUser, kpi, prossimEventi, myTasks, liveClients, taskInRitardoList])

  // Determine brief status for Fly dot color
  const briefStatus: 'ok' | 'attention' | 'urgent' = useMemo(() => {
    if (kpi.taskInRitardo > 3) return 'urgent'
    if (kpi.taskInRitardo > 0 || kpi.eventiImminenti > 3) return 'attention'
    return 'ok'
  }, [kpi])

  // Build team workload from tasks assignees
  const teamWorkload = useMemo(() => {
    const assigneeMap = new Map<string, { total: number; completed: number }>()
    myTasks.forEach(t => {
      if (!t.assegnatario) return
      const entry = assigneeMap.get(t.assegnatario) ?? { total: 0, completed: 0 }
      entry.total++
      if (t.stato === 'completato') entry.completed++
      assigneeMap.set(t.assegnatario, entry)
    })
    return [...assigneeMap.entries()]
      .map(([name, data]) => ({
        name: name.split(' ')[0] || name,
        fullName: name,
        load: data.total > 0 ? Math.round(((data.total - data.completed) / Math.max(data.total, 8)) * 100) : 0,
        openTasks: data.total - data.completed,
      }))
      .sort((a, b) => b.load - a.load)
      .slice(0, 5)
  }, [myTasks])

  // Decisions from overdue tasks + events needing action
  const decisions = useMemo(() => {
    const items: { text: string; consequence: string; action: () => void; urgent: boolean }[] = []

    // Overdue tasks as decisions
    taskInRitardoList.slice(0, 3).forEach(t => {
      const dl = Math.abs(daysLeft(t.scadenza))
      items.push({
        text: t.titolo,
        consequence: `${dl}g in ritardo${t.assegnatario ? ` — ${t.assegnatario.split(' ')[0]} attende` : ''}`,
        action: () => navigate('/task'),
        urgent: dl > 3,
      })
    })

    // Events very close without full readiness
    prossimEventi.slice(0, 2).forEach(ev => {
      const dl = daysLeft(ev.dataInizio)
      if (dl <= 7 && dl >= 0) {
        const taskTotali = myTasks.filter(t => t.evento === ev.id).length
        const taskDone = myTasks.filter(t => t.evento === ev.id && t.stato === 'completato').length
        const pct = taskTotali > 0 ? Math.round((taskDone / taskTotali) * 100) : 100
        if (pct < 90) {
          items.push({
            text: `Preparazione ${ev.nome}`,
            consequence: `${pct}% pronto — tra ${dl}g`,
            action: () => navigate('/eventi'),
            urgent: dl <= 3,
          })
        }
      }
    })

    return items.slice(0, 5)
  }, [taskInRitardoList, prossimEventi, myTasks, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: 'var(--red2)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Caricamento dati...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="cc-cockpit">
      {/* ═══ PRIMARY DISPLAY — The Main Screen ═══ */}
      <div className="cc-primary-display animate-fade-in">
        {/* Theme pill toggle — top right of display */}
        <button
          onClick={toggleTheme}
          className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-all"
          style={{
            background: 'var(--cc-glass)',
            backdropFilter: 'blur(var(--cc-blur))',
            WebkitBackdropFilter: 'blur(var(--cc-blur))',
            border: '1px solid var(--cc-glass-border)',
            boxShadow: 'var(--shadow-sm)',
          }}
          title={resolved === 'dark' ? 'Passa a Light' : 'Passa a Dark'}
        >
          <div className="relative w-4 h-4 overflow-hidden">
            <Sun
              size={14}
              className="absolute inset-0 m-auto transition-all"
              style={{
                color: 'var(--yellow)',
                opacity: resolved === 'light' ? 1 : 0,
                transform: resolved === 'light' ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.5)',
                transition: 'opacity 200ms ease, transform 200ms ease',
              }}
            />
            <Moon
              size={14}
              className="absolute inset-0 m-auto transition-all"
              style={{
                color: 'var(--blue)',
                opacity: resolved === 'dark' ? 1 : 0,
                transform: resolved === 'dark' ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.5)',
                transition: 'opacity 200ms ease, transform 200ms ease',
              }}
            />
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            {resolved === 'dark' ? 'Dark' : 'Light'}
          </span>
        </button>

        <div className="cc-display-content">
          <div className={`cc-status-beacon cc-status-beacon--${briefStatus}`} />
          <div className="cc-display-text">
            {missionBrief.slice(0, -1).map((line, i) => (
              <p key={i} className={i === 0 ? 'cc-display-headline' : 'cc-display-line'}>{line}</p>
            ))}
            <p className="cc-display-action" onClick={() => {
              if (kpi.taskInRitardo > 0) navigate('/task')
              else if (prossimEventi.length > 0) navigate('/eventi')
              else navigate('/task')
            }}>
              {missionBrief[missionBrief.length - 1]}
              <ArrowRight className="cc-action-arrow" />
            </p>
          </div>
        </div>
      </div>

      {/* ═══ RED THREAD — Horizon Line ═══ */}
      <div className="cc-horizon" />

      {/* ═══ INSTRUMENT BAND — Single Continuous Surface ═══ */}
      <div className="cc-instrument-band animate-fade-in" style={{ animationDelay: '100ms' }}>

        {/* Zone 1: Radar */}
        <div className="cc-zone cc-zone-radar">
          <div className="cc-zone-header">
            <Calendar className="w-3.5 h-3.5" />
            <span>Radar</span>
            <button onClick={() => navigate('/eventi')} className="cc-zone-link">
              Tutti <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="cc-timeline">
            <div className="cc-timeline-labels">
              <span>Oggi</span>
              <span>+7g</span>
              <span>+14g</span>
            </div>
            <div className="cc-timeline-track">
              <div className="cc-timeline-axis" />
              {prossimEventi.map((ev, idx) => {
                const dl = daysLeft(ev.dataInizio)
                const position = Math.min(Math.max((dl / 14) * 100, 2), 96)
                const taskTotali = myTasks.filter(t => t.evento === ev.id).length
                const taskDone = myTasks.filter(t => t.evento === ev.id && t.stato === 'completato').length
                const pct = taskTotali > 0 ? Math.round((taskDone / taskTotali) * 100) : 100
                const color = eventColorByStato(ev.stato)
                const isClose = dl <= 3

                return (
                  <button
                    key={ev.id}
                    className={`cc-node ${isClose ? 'cc-node--imminent' : ''}`}
                    style={{ left: `${position}%`, animationDelay: `${idx * 60 + 200}ms` }}
                    onClick={() => navigate('/eventi')}
                  >
                    <div className="cc-node-dot" style={{ background: color }} />
                    <div className="cc-node-info">
                      <p className="cc-node-name">{ev.nome}</p>
                      <div className="cc-node-meta">
                        <span className="cc-node-days" style={{ color: isClose ? 'var(--red2)' : 'var(--muted)' }}>
                          {dl === 0 ? 'Oggi' : dl === 1 ? 'Domani' : `${dl}g`}
                        </span>
                        <span className="cc-node-budget">&euro;{(ev.budget / 1000).toFixed(0)}K</span>
                        <span className="cc-node-pct-mobile" style={{ color }}>{pct}%</span>
                      </div>
                      <div className="cc-node-readiness">
                        <div className="cc-readiness-track">
                          <div className="cc-readiness-fill" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="cc-readiness-label">{pct}%</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          {prossimEventi.length === 0 && (
            <p className="cc-zone-empty">Nessun evento nei prossimi 14 giorni</p>
          )}
        </div>

        {/* Divider */}
        <div className="cc-divider" />

        {/* Zone 2: Pulse */}
        <div className="cc-zone cc-zone-pulse">
          <div className="cc-zone-header">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Pulse</span>
          </div>
          <div className="cc-pulse-metrics">
            <div className="cc-metric">
              <span className="cc-metric-value">
                &euro;{(liveClients.reduce((s, c) => s + (c.fatturato || 0), 0) / 1000).toFixed(0)}K
              </span>
              <span className="cc-metric-label">Portafoglio</span>
            </div>
            <div className="cc-metric">
              <span className="cc-metric-value" style={{ color: 'var(--green)' }}>
                {kpi.completionRate}%
              </span>
              <span className="cc-metric-label">Delivery</span>
            </div>
            <div className="cc-metric">
              <span className="cc-metric-value" style={{ color: kpi.clientiAttivi > 0 ? 'var(--blue)' : 'var(--muted)' }}>
                {kpi.clientiAttivi}
              </span>
              <span className="cc-metric-label">Clienti attivi</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="cc-divider" />

        {/* Zone 3: Team */}
        <div className="cc-zone cc-zone-team">
          <div className="cc-zone-header">
            <Users className="w-3.5 h-3.5" />
            <span>Team</span>
          </div>
          {teamWorkload.length === 0 ? (
            <p className="cc-zone-empty">Nessun dato team</p>
          ) : (
            <div className="cc-team-rows">
              {teamWorkload.map((member, i) => (
                <div key={i} className="cc-team-row">
                  <span className="cc-team-name" title={member.fullName}>{member.name}</span>
                  <div className="cc-team-gauge">
                    <div
                      className="cc-team-fill"
                      style={{
                        width: `${Math.min(member.load, 100)}%`,
                        background: member.load > 80 ? 'var(--red2)' : member.load > 50 ? 'var(--yellow)' : 'var(--green)',
                      }}
                    />
                  </div>
                  <span className="cc-team-count">{member.openTasks}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="cc-divider" />

        {/* Zone 4: Decisions */}
        <div className="cc-zone cc-zone-decisions">
          <div className="cc-zone-header">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Decisioni</span>
          </div>
          {decisions.length === 0 ? (
            <p className="cc-zone-empty">Nessuna decisione urgente</p>
          ) : (
            <div className="cc-decisions-list">
              {decisions.map((d, i) => (
                <button key={i} className="cc-decision" onClick={d.action}>
                  <div className={`cc-decision-beacon ${d.urgent ? 'cc-decision-beacon--urgent' : ''}`} />
                  <div className="cc-decision-body">
                    <span className="cc-decision-title">{d.text}</span>
                    <span className="cc-decision-sub">{d.consequence}</span>
                  </div>
                  <ArrowRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--muted)', opacity: 0.3 }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ ACTION RAIL — Quick Navigation ═══ */}
      <div className="cc-action-rail animate-fade-in" style={{ animationDelay: '180ms' }}>
        <button onClick={() => navigate('/eventi')} className="cc-rail-item">
          <Calendar className="w-3.5 h-3.5" />
          <span>{kpi.eventiImminenti} eventi</span>
        </button>
        <button onClick={() => navigate('/task')} className="cc-rail-item">
          <CheckSquare className="w-3.5 h-3.5" />
          <span>{kpi.taskAperti} task</span>
        </button>
        <button onClick={() => navigate('/archivio')} className="cc-rail-item">
          <Archive className="w-3.5 h-3.5" />
          <span>{archiveCount} doc</span>
        </button>
      </div>
    </div>
  )
}
