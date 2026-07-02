import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, CheckSquare, Users, Clock, ArrowRight, Zap, MessageSquare,
  FileText, AlertTriangle, BarChart3, TrendingUp, Archive, Database,
} from 'lucide-react'
import AnimatedLaserBorder from '@/components/AnimatedLaserBorder'
import { loadUser } from '@/lib/auth'
import { daysLeft, fmtShort, eventColorByStato, eventLabelByStato, taskPriColor } from '@/lib/format'
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

function KpiCard({ label, value, sub, icon: Icon, color, onClick, delay = 0 }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType
  color: string; onClick?: () => void; delay?: number
}) {
  return (
    <div className="kpi-energy-card panel p-5 hover-card cursor-pointer animate-fade-in flex flex-col justify-between gap-3 group"
      style={{ animationDelay: `${delay}ms`, borderRadius: '20px' }}
      onClick={onClick}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)', letterSpacing: '0.06em' }}>{label}</p>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-400 group-hover:scale-110 group-hover:shadow-lg"
          style={{ background: `${color}12`, boxShadow: `0 4px 14px ${color}15` }}>
          <Icon className="w-[18px] h-[18px]" style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight kpi-value-glow" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>{value}</p>
        {sub && <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>{sub}</p>}
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, color = 'var(--red2)', action, onAction, children, delay = 0 }: {
  title: string; icon: React.ElementType; color?: string; action?: string; onAction?: () => void
  children: React.ReactNode; delay?: number
}) {
  return (
    <div className="panel p-6 animate-fade-in" style={{ animationDelay: `${delay}ms`, borderRadius: '22px' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: `${color}10`, boxShadow: `0 2px 8px ${color}08` }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
        </div>
        {action && (
          <button onClick={onAction}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-white/10"
            style={{ color: 'var(--muted)' }}>
            {action} <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  )
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
  const ruolo = currentUser?.ruolo ?? 'Partner'
  const userId = currentUser?.id ?? ''

  const [liveTasks, setLiveTasks] = useState<Task[]>([])
  const [liveEvents, setLiveEvents] = useState<Event[]>([])
  const [liveClients, setLiveClients] = useState<Client[]>([])
  const [liveSuppliers, setLiveSuppliers] = useState<Supplier[]>([])
  const [liveCommunications, setLiveCommunications] = useState<Messaggio[]>([])
  const [archiveCount, setArchiveCount] = useState(0)
  const [recentReferenti, setRecentReferenti] = useState<Referente[]>([])
  const [loading, setLoading] = useState(true)
  const [diagErrors, setDiagErrors] = useState<Record<string, string>>({})

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

  const comunicazioniRecenti = useMemo(() =>
    [...liveCommunications]
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      .slice(0, 4)
  , [liveCommunications])

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
    <div className="space-y-7 relative">
      {/* Ambient radial gradient accent */}
      <div className="absolute top-0 right-0 w-[500px] h-[400px] pointer-events-none opacity-30"
        style={{ background: 'radial-gradient(ellipse at top right, rgba(211,28,48,0.08) 0%, transparent 60%)' }} />
      <div className="absolute bottom-0 left-0 w-[400px] h-[300px] pointer-events-none opacity-20"
        style={{ background: 'radial-gradient(ellipse at bottom left, rgba(77,180,255,0.06) 0%, transparent 60%)' }} />

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 relative">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--muted)', letterSpacing: '0.01em' }}>
            {today.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <h1 className="text-3xl font-bold mt-1.5" style={{ color: 'var(--text)', letterSpacing: '-0.025em' }}>
            {getGreeting()}, {currentUser?.first_name ?? currentUser?.nome?.split(' ')[0] ?? 'utente'}
          </h1>
        </div>
        <span className="text-xs px-3.5 py-1.5 rounded-xl font-semibold"
          style={{ background: 'rgba(208,0,58,0.06)', color: 'var(--red2)', border: '1px solid rgba(208,0,58,0.10)' }}>
          {currentUser?.role ?? ruolo}
        </span>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Task Aperti" value={kpi.taskAperti} sub={`su ${myTasks.length} totali`}
          icon={CheckSquare} color="var(--blue)" delay={0} onClick={() => navigate('/task')} />
        <KpiCard label="Completati" value={kpi.taskCompletati} sub={`${kpi.completionRate}% completamento`}
          icon={TrendingUp} color="var(--green)" delay={50} onClick={() => navigate('/task')} />
        <KpiCard label="In Ritardo" value={kpi.taskInRitardo} sub={kpi.taskInRitardo > 0 ? 'azione richiesta' : 'nessuno'}
          icon={AlertTriangle} color={kpi.taskInRitardo > 0 ? 'var(--red2)' : 'var(--green)'} delay={100} onClick={() => navigate('/task')} />
        <KpiCard label="Eventi Imminenti" value={kpi.eventiImminenti} sub="prossimi 14 giorni"
          icon={Calendar} color="var(--red2)" delay={150} onClick={() => navigate('/eventi')} />
        <KpiCard label="Clienti Attivi" value={kpi.clientiAttivi} sub={`su ${liveClients.length} totali`}
          icon={Users} color="#8b5cf6" delay={200} onClick={() => navigate('/crm')} />
        <KpiCard label="Documenti" value={archiveCount} sub="archivio aziendale"
          icon={Archive} color="var(--yellow)" delay={250} onClick={() => navigate('/archivio')} />
      </div>

      {/* Diagnostic counters */}
      <AnimatedLaserBorder active loading={false} style={{ borderRadius: '18px' }}>
        <div className="panel p-5 animate-fade-in" style={{ border: 'none', borderRadius: '18px' }}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(77,180,255,0.10)' }}>
              <Database className="w-3.5 h-3.5" style={{ color: 'var(--blue)' }} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Diagnostica Supabase</h3>
            <div className="flex-1" />
            <div className="w-2 h-2 rounded-full energy-pulse-dot" style={{ background: 'var(--green)' }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl" style={{ background: 'var(--panel2)' }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Suppliers caricati</p>
            <p className="text-xl font-bold" style={{ color: liveSuppliers.length > 0 ? 'var(--green)' : 'var(--red2)' }}>{liveSuppliers.length}</p>
            {diagErrors.suppliers && <p className="text-[10px] mt-1" style={{ color: 'var(--red2)' }}>{diagErrors.suppliers}</p>}
          </div>
          <div className="p-3.5 rounded-xl" style={{ background: 'var(--panel2)' }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Events caricati</p>
            <p className="text-xl font-bold" style={{ color: liveEvents.length > 0 ? 'var(--green)' : 'var(--red2)' }}>{liveEvents.length}</p>
            {diagErrors.events && <p className="text-[10px] mt-1" style={{ color: 'var(--red2)' }}>{diagErrors.events}</p>}
          </div>
          <div className="p-3.5 rounded-xl" style={{ background: 'var(--panel2)' }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Clients caricati</p>
            <p className="text-xl font-bold" style={{ color: liveClients.length > 0 ? 'var(--green)' : 'var(--red2)' }}>{liveClients.length}</p>
            {diagErrors.clients && <p className="text-[10px] mt-1" style={{ color: 'var(--red2)' }}>{diagErrors.clients}</p>}
          </div>
          <div className="p-3.5 rounded-xl" style={{ background: 'var(--panel2)' }}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>CRM (Referenti)</p>
            <p className="text-xl font-bold" style={{ color: recentReferenti.length > 0 ? 'var(--green)' : 'var(--muted)' }}>{recentReferenti.length}</p>
          </div>
        </div>
      </div>
      </AnimatedLaserBorder>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: 2 cols */}
        <div className="lg:col-span-2 space-y-6">

          {/* Eventi imminenti */}
          <Section title="Eventi imminenti" icon={Calendar} action="Tutti gli eventi" onAction={() => navigate('/eventi')} delay={60}>
            {prossimEventi.length === 0
              ? <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>Nessun evento in programma</p>
              : (
                <div className="space-y-2">
                  {prossimEventi.map(ev => {
                    const color = eventColorByStato(ev.stato)
                    const dl = daysLeft(ev.dataInizio)
                    const completati = liveTasks.filter(t => t.evento === ev.id && t.stato === 'completato').length
                    const totali = liveTasks.filter(t => t.evento === ev.id).length
                    const pct = totali > 0 ? Math.round((completati / totali) * 100) : 0
                    return (
                      <button key={ev.id}
                        onClick={() => navigate('/eventi')}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all hover:bg-white/5"
                        style={{ background: 'var(--panel2)', border: `1px solid ${color}20` }}>
                        <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ background: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{ev.nome}</p>
                            <span className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                              style={{ background: `${color}18`, color }}>
                              {eventLabelByStato(ev.stato)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                              {ev.location} &middot; {fmtShort(ev.dataInizio)}
                            </p>
                            {dl >= 0 && dl <= 14 && (
                              <span className="text-xs flex-shrink-0 font-medium"
                                style={{ color: dl <= 3 ? 'var(--red2)' : dl <= 7 ? 'var(--yellow)' : 'var(--muted)' }}>
                                tra {dl}g
                              </span>
                            )}
                          </div>
                          {totali > 0 && (
                            <div className="flex items-center gap-2 mt-1.5">
                              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                              </div>
                              <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--muted)' }}>{completati}/{totali}</span>
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                            &euro;{(ev.budget / 1000).toFixed(0)}K
                          </p>
                          {ev.team.length > 0 && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{ev.team.length} persone</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            }
          </Section>

          {/* Task in ritardo */}
          {kpi.taskInRitardo > 0 && (
            <Section title="Task in ritardo" icon={AlertTriangle} color="var(--red2)" action="Gestisci" onAction={() => navigate('/task')} delay={120}>
              <div className="space-y-2">
                {taskInRitardoList.map(t => {
                  const dl = daysLeft(t.scadenza)
                  const color = taskPriColor(t.priorita, t.stato)
                  return (
                    <button key={t.id}
                      onClick={() => navigate('/task')}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all hover:bg-white/5"
                      style={{ background: 'var(--panel2)', border: '1px solid rgba(255,49,95,0.12)' }}>
                      <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ background: color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{t.titolo}</p>
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>
                          {t.assegnatario || 'Non assegnato'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" style={{ color: 'var(--red2)' }} />
                          <span className="text-xs font-semibold" style={{ color: 'var(--red2)' }}>
                            {Math.abs(dl)}g scaduto
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{fmtShort(t.scadenza)}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Comunicazioni recenti */}
          <Section title="Comunicazioni recenti" icon={MessageSquare} color="var(--blue)" action="Tutte" onAction={() => navigate('/comunicazioni')} delay={180}>
            {comunicazioniRecenti.length === 0
              ? <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>Nessuna comunicazione</p>
              : (
                <div className="space-y-2">
                  {comunicazioniRecenti.map(m => {
                    const unread = !m.letto.includes(userId) && m.destinatari.includes(userId)
                    return (
                      <button key={m.id}
                        onClick={() => navigate('/comunicazioni')}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all hover:bg-white/5"
                        style={{ background: 'var(--panel2)', border: unread ? '1px solid rgba(77,180,255,0.2)' : '1px solid transparent' }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                          style={{ background: 'rgba(77,180,255,0.1)', color: 'var(--blue)' }}>
                          {(m.mittente || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: unread ? 'var(--text)' : 'var(--muted)', fontWeight: unread ? 600 : 400 }}>
                            {m.oggetto}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{m.mittente} &middot; {fmtShort(m.data)}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {m.priorita === 'alta' && <Zap className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />}
                          {unread && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--blue)' }} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            }
          </Section>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">

          {/* Task progress ring */}
          <div className="panel p-6 animate-fade-in energy-ring-card" style={{ animationDelay: '80ms', borderRadius: '22px' }}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.12)' }}>
                <BarChart3 className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
              </div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Progresso Task</h2>
            </div>
            <div className="flex items-center justify-center py-4">
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90" style={{ filter: 'drop-shadow(0 0 6px rgba(56,210,125,0.25))' }}>
                  <circle cx="50" cy="50" r="40" fill="none" strokeWidth="7" stroke="var(--line)" />
                  <circle cx="50" cy="50" r="40" fill="none" strokeWidth="7" stroke="var(--green)"
                    strokeLinecap="round"
                    strokeDasharray={`${kpi.completionRate * 2.51} 251`}
                    className="progress-ring-animated" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold kpi-value-glow" style={{ color: 'var(--text)' }}>{kpi.completionRate}%</span>
                  <span className="text-[10px]" style={{ color: 'var(--muted)' }}>completamento</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="text-center">
                <p className="text-lg font-bold" style={{ color: 'var(--blue)' }}>{kpi.taskAperti}</p>
                <p className="text-[10px]" style={{ color: 'var(--muted)' }}>Aperti</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold" style={{ color: 'var(--green)' }}>{kpi.taskCompletati}</p>
                <p className="text-[10px]" style={{ color: 'var(--muted)' }}>Chiusi</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold" style={{ color: kpi.taskInRitardo > 0 ? 'var(--red2)' : 'var(--muted)' }}>{kpi.taskInRitardo}</p>
                <p className="text-[10px]" style={{ color: 'var(--muted)' }}>In ritardo</p>
              </div>
            </div>
          </div>

          {/* Top clienti */}
          <Section title="Clienti attivi" icon={Users} color="#8b5cf6" action="CRM" onAction={() => navigate('/crm')} delay={140}>
            <div className="space-y-1.5">
              {liveClients
                .filter(c => c.stato === 'vip' || c.stato === 'attivo')
                .sort((a, b) => b.fatturato - a.fatturato)
                .slice(0, 5)
                .map(c => (
                  <button key={c.id}
                    onClick={() => navigate('/crm')}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-all hover:bg-white/5"
                    style={{ background: 'var(--panel2)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{ background: c.stato === 'vip' ? 'rgba(255,194,75,0.15)' : 'rgba(56,210,125,0.1)', color: c.stato === 'vip' ? 'var(--yellow)' : 'var(--green)' }}>
                      {(c.nome || '?').charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{c.nome}</p>
                      <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{c.settore}</p>
                    </div>
                    <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--muted)' }}>
                      &euro;{(c.fatturato / 1000).toFixed(0)}K
                    </span>
                  </button>
                ))}
            </div>
          </Section>

          {/* Referenti CRM recenti */}
          {recentReferenti.length > 0 && (
            <Section title="Referenti recenti" icon={FileText} color="var(--green)" action="CRM" onAction={() => navigate('/crm')} delay={200}>
              <div className="space-y-1.5">
                {recentReferenti.map(r => (
                  <div key={r.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg"
                    style={{ background: 'var(--panel2)' }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                      style={{ background: r.is_principale ? 'rgba(34,197,94,0.12)' : 'var(--line)', color: r.is_principale ? 'var(--green)' : 'var(--muted)' }}>
                      {(r.nome || '').charAt(0)}{(r.cognome || '').charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                        {r.nome} {r.cognome}
                        {r.is_principale && <span className="ml-1 text-[9px] uppercase" style={{ color: 'var(--green)' }}>P</span>}
                      </p>
                      <p className="text-[10px] truncate" style={{ color: 'var(--muted)' }}>
                        {r.ruolo ? `${r.ruolo} — ` : ''}{r.client_name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Archivio quick stat */}
          <div className="panel p-5 animate-fade-in energy-ring-card" style={{ animationDelay: '260ms', borderRadius: '20px' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(234,179,8,0.1)' }}>
                <Archive className="w-5 h-5" style={{ color: 'var(--yellow)' }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Knowledge Library</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{archiveCount} documenti archiviati</p>
              </div>
              <button onClick={() => navigate('/archivio')}
                className="p-2 rounded-lg hover:bg-white/10 transition-all">
                <ArrowRight className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
