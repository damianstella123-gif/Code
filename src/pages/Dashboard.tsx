import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, CheckSquare, Users, ArrowRight,
  AlertTriangle, TrendingUp, Archive,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
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
    <div className="mc-root">
      {/* ═══ MISSION BRIEF ═══ */}
      <div className="mc-brief animate-fade-in">
        <div className="mc-brief-inner">
          <div className={`mc-fly-dot mc-fly-dot--${briefStatus}`} />
          <div className="mc-brief-text">
            {missionBrief.slice(0, -1).map((line, i) => (
              <p key={i} className={i === 0 ? 'mc-brief-greeting' : 'mc-brief-line'}>{line}</p>
            ))}
            <p className="mc-brief-cta" onClick={() => {
              if (kpi.taskInRitardo > 0) navigate('/task')
              else if (prossimEventi.length > 0) navigate('/eventi')
              else navigate('/task')
            }}>
              {missionBrief[missionBrief.length - 1]}
              <ArrowRight className="mc-cta-arrow" />
            </p>
          </div>
        </div>
      </div>

      {/* ═══ RED THREAD DESCENT ═══ */}
      <div className="mc-thread-descent" />

      {/* ═══ RADAR EVENTI ═══ */}
      <div className="mc-section animate-fade-in" style={{ animationDelay: '80ms' }}>
        <div className="mc-radar">
          <div className="mc-radar-header">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--red2)', opacity: 0.7 }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>
                Radar Eventi
              </span>
            </div>
            <button onClick={() => navigate('/eventi')}
              className="text-[11px] font-medium flex items-center gap-1 transition-opacity hover:opacity-100"
              style={{ color: 'var(--muted)', opacity: 0.6 }}>
              Tutti <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Timeline axis */}
          <div className="mc-timeline">
            <div className="mc-timeline-labels">
              <span>Oggi</span>
              <span>+7g</span>
              <span>+14g</span>
            </div>
            <div className="mc-timeline-track">
              <div className="mc-timeline-line" />
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
                    className={`mc-timeline-node ${isClose ? 'mc-timeline-node--imminent' : ''}`}
                    style={{ left: `${position}%`, animationDelay: `${idx * 60 + 200}ms` }}
                    onClick={() => navigate('/eventi')}
                  >
                    <div className="mc-node-dot" style={{ background: color }} />
                    <div className="mc-node-card">
                      <p className="mc-node-name">{ev.nome}</p>
                      <div className="mc-node-meta">
                        <span className="mc-node-days" style={{ color: isClose ? 'var(--red2)' : 'var(--muted)' }}>
                          {dl === 0 ? 'Oggi' : dl === 1 ? 'Domani' : `${dl}g`}
                        </span>
                        <span className="mc-node-budget">&euro;{(ev.budget / 1000).toFixed(0)}K</span>
                        <span className="mc-node-pct-mobile" style={{ color }}>{pct}%</span>
                      </div>
                      <div className="mc-node-readiness">
                        <div className="mc-readiness-bar">
                          <div className="mc-readiness-fill" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="mc-readiness-pct">{pct}%</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {prossimEventi.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--muted)' }}>
              Nessun evento nei prossimi 14 giorni
            </p>
          )}
        </div>
      </div>

      {/* ═══ MAIN GRID: Pulse + Decisions / Team ═══ */}
      <div className="mc-grid animate-fade-in" style={{ animationDelay: '160ms' }}>
        {/* Left column */}
        <div className="mc-grid-left">
          {/* Pulse Finanziario */}
          <div className="mc-panel mc-pulse">
            <div className="mc-panel-label">
              <TrendingUp className="w-3 h-3" style={{ opacity: 0.6 }} />
              <span>Pulse Finanziario</span>
            </div>
            <div className="mc-pulse-grid">
              <div className="mc-pulse-item">
                <span className="mc-pulse-value">
                  &euro;{(liveClients.reduce((s, c) => s + (c.fatturato || 0), 0) / 1000).toFixed(0)}K
                </span>
                <span className="mc-pulse-label">Portafoglio</span>
              </div>
              <div className="mc-pulse-item">
                <span className="mc-pulse-value" style={{ color: 'var(--green)' }}>
                  {kpi.completionRate}%
                </span>
                <span className="mc-pulse-label">Delivery</span>
              </div>
              <div className="mc-pulse-item">
                <span className="mc-pulse-value" style={{ color: kpi.clientiAttivi > 0 ? 'var(--blue)' : 'var(--muted)' }}>
                  {kpi.clientiAttivi}
                </span>
                <span className="mc-pulse-label">Clienti attivi</span>
              </div>
            </div>
          </div>

          {/* Decisions */}
          <div className="mc-panel mc-decisions">
            <div className="mc-panel-label">
              <AlertTriangle className="w-3 h-3" style={{ opacity: 0.6 }} />
              <span>Decisioni</span>
            </div>
            {decisions.length === 0 ? (
              <p className="mc-empty">Nessuna decisione urgente</p>
            ) : (
              <div className="mc-decisions-list">
                {decisions.map((d, i) => (
                  <button key={i} className="mc-decision-row" onClick={d.action}>
                    <div className={`mc-decision-indicator ${d.urgent ? 'mc-decision-indicator--urgent' : ''}`} />
                    <div className="mc-decision-content">
                      <span className="mc-decision-text">{d.text}</span>
                      <span className="mc-decision-consequence">{d.consequence}</span>
                    </div>
                    <ArrowRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--muted)', opacity: 0.4 }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="mc-grid-right">
          {/* Carico Team */}
          <div className="mc-panel mc-team">
            <div className="mc-panel-label">
              <Users className="w-3 h-3" style={{ opacity: 0.6 }} />
              <span>Carico Team</span>
            </div>
            {teamWorkload.length === 0 ? (
              <p className="mc-empty">Nessun dato team</p>
            ) : (
              <div className="mc-team-list">
                {teamWorkload.map((member, i) => (
                  <div key={i} className="mc-team-row">
                    <span className="mc-team-name" title={member.fullName}>{member.name}</span>
                    <div className="mc-team-bar-wrapper">
                      <div
                        className="mc-team-bar"
                        style={{
                          width: `${Math.min(member.load, 100)}%`,
                          background: member.load > 80 ? 'var(--red2)' : member.load > 50 ? 'var(--yellow)' : 'var(--green)',
                        }}
                      />
                    </div>
                    <span className="mc-team-count">{member.openTasks}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick access */}
          <div className="mc-panel mc-quicklinks">
            <button onClick={() => navigate('/eventi')} className="mc-quicklink">
              <Calendar className="w-3.5 h-3.5" />
              <span>{kpi.eventiImminenti} eventi</span>
            </button>
            <button onClick={() => navigate('/task')} className="mc-quicklink">
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{kpi.taskAperti} task</span>
            </button>
            <button onClick={() => navigate('/archivio')} className="mc-quicklink">
              <Archive className="w-3.5 h-3.5" />
              <span>{archiveCount} doc</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
