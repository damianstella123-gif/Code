import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  CheckSquare,
  Euro,
  Users,
  Clock,
  AlertTriangle,
  ArrowRight,
  Zap,
  MessageSquare,
  Truck,
  Bell,
  BarChart3,
  CreditCard,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { getVisibleEvents, getVisibleTasks } from '@/lib/permissions'
import { daysLeft, fmtShort, eventColorByStato, eventLabelByStato, taskPriColor } from '@/lib/format'
import { fetchEvents } from '@/lib/events-service'
import { fetchTasks } from '@/lib/tasks-service'
import { fetchClients } from '@/lib/clients-service'
import { fetchSuppliers } from '@/lib/suppliers-service'
import { fetchBudgets } from '@/lib/budgets-service'
import { fetchCommunications } from '@/lib/communications-service'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Supplier } from '@/data/suppliers'
import type { Client } from '@/data/clients'
import type { Uscita } from '@/data/amministrazione'
import type { Messaggio } from '@/data/comunicazioni'

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon: Icon, color = 'var(--red2)', action, onAction, children, delay = 0 }: {
  title: string; icon: React.ElementType; color?: string; action?: string; onAction?: () => void
  children: React.ReactNode; delay?: number
}) {
  return (
    <div className="panel p-5 animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${color}15` }}>
            <Icon className="w-3.5 h-3.5" style={{ color }} />
          </div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
        </div>
        {action && (
          <button onClick={onAction}
            className="flex items-center gap-1 text-xs transition-all hover:opacity-80"
            style={{ color: 'var(--muted)' }}>
            {action} <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color, onClick, delay = 0 }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType
  color: string; onClick?: () => void; delay?: number
}) {
  return (
    <div className="panel p-5 hover-card cursor-pointer animate-fade-in flex flex-col gap-3"
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</p>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15` }}>
          <Icon className="w-4.5 h-4.5" style={{ color, width: 18, height: 18 }} />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>{value}</p>
        {sub && <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{sub}</p>}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const currentUser = loadUser()
  const ruolo = currentUser?.ruolo ?? 'Admin'
  const userId = currentUser?.id ?? ''

  const [liveTasks, setLiveTasks] = useState<Task[]>([])
  const [liveEvents, setLiveEvents] = useState<Event[]>([])
  const [liveClients, setLiveClients] = useState<Client[]>([])
  const [liveSuppliers, setLiveSuppliers] = useState<Supplier[]>([])
  const [liveBudgets, setLiveBudgets] = useState<Uscita[]>([])
  const [liveCommunications, setLiveCommunications] = useState<Messaggio[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [ev, tk, cl, sp, bg, cm] = await Promise.all([
        fetchEvents(),
        fetchTasks(),
        fetchClients(),
        fetchSuppliers(),
        fetchBudgets(),
        fetchCommunications(),
      ])
      setLiveEvents(ev)
      setLiveTasks(tk)
      setLiveClients(cl)
      setLiveSuppliers(sp)
      setLiveBudgets(bg)
      setLiveCommunications(cm)
      setLoading(false)
    }
    load()
  }, [])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const myEvents = useMemo(() => getVisibleEvents(ruolo, userId, liveEvents), [ruolo, userId, liveEvents])
  const myTasks = useMemo(() => getVisibleTasks(ruolo, userId, liveTasks), [ruolo, userId, liveTasks])

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const eventiAttivi = myEvents.filter(e => e.stato === 'in_corso' || e.stato === 'pianificazione').length
    const taskAperti = myTasks.filter(t => t.stato !== 'completato').length
    const taskUrgentiN = myTasks.filter(t => t.priorita === 'alta' && t.stato !== 'completato').length
    const taskCompletati = myTasks.filter(t => t.stato === 'completato').length
    const completionRate = myTasks.length > 0 ? Math.round((taskCompletati / myTasks.length) * 100) : 0

    // Budget totale eventi visibili
    const budgetTotale = myEvents.reduce((s, e) => s + e.budget, 0)
    // Uscite totali da Supabase
    const usciteTotale = liveBudgets.reduce((s, u) => s + (u.importo ?? 0), 0)
    const margineStimato = budgetTotale - usciteTotale

    // Pagamenti sospesi
    const pagamentiSospesi = liveBudgets.filter(b => b.stato === 'in_attesa').length

    // Clienti attivi
    const clientiAttivi = liveClients.filter(c => c.stato === 'attivo' || c.stato === 'vip').length

    // Fornitori critici (contratto scaduto o in scadenza)
    const fornitoriCritici = liveSuppliers.filter(s =>
      s.statoContratto === 'scaduto' || s.statoContratto === 'in_scadenza'
    ).length

    // Comunicazioni non lette dall'utente corrente
    const comunicazioniNonLette = liveCommunications.filter(m =>
      !m.letto.includes(userId) && m.destinatari.includes(userId)
    ).length

    return {
      eventiAttivi, taskAperti, taskUrgentiN,
      budgetTotale, margineStimato, pagamentiSospesi,
      clientiAttivi, fornitoriCritici, comunicazioniNonLette,
      completionRate, usciteTotale,
    }
  }, [myEvents, myTasks, liveBudgets, liveClients, liveSuppliers, liveCommunications, userId])

  // ── Sections data ─────────────────────────────────────────────────────────

  const prossimEventi = useMemo(() =>
    [...myEvents]
      .filter(e => e.stato !== 'completato')
      .sort((a, b) => new Date(a.dataInizio).getTime() - new Date(b.dataInizio).getTime())
      .slice(0, 5)
  , [myEvents])

  const urgentTasks = useMemo(() =>
    myTasks
      .filter(t => t.priorita === 'alta' && t.stato !== 'completato')
      .sort((a, b) => new Date(a.scadenza).getTime() - new Date(b.scadenza).getTime())
      .slice(0, 5)
  , [myTasks])

  const scadenzeCalendario = useMemo(() => {
    const prossime = myTasks
      .filter(t => t.stato !== 'completato')
      .map(t => ({ label: t.titolo, date: t.scadenza, type: 'task' as const, id: t.id, dl: daysLeft(t.scadenza) }))
    const evtProssimi = myEvents
      .filter(e => e.stato !== 'completato')
      .map(e => ({ label: e.nome, date: e.dataInizio, type: 'event' as const, id: e.id, dl: daysLeft(e.dataInizio) }))
    return [...prossime, ...evtProssimi]
      .filter(x => x.dl >= 0 && x.dl <= 14)
      .sort((a, b) => a.dl - b.dl)
      .slice(0, 6)
  }, [myEvents, myTasks])

  const comunicazioniRecenti = useMemo(() =>
    [...liveCommunications]
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      .slice(0, 4)
  , [liveCommunications])

  const alertAmministrativi = useMemo(() => {
    const alerts: { label: string; sub: string; level: 'critical' | 'warning'; route: string }[] = []
    const scaduti = liveBudgets.filter(b => b.stato === 'scaduto')
    if (scaduti.length > 0)
      alerts.push({ label: `${scaduti.length} pagament${scaduti.length > 1 ? 'i scaduti' : 'o scaduto'}`, sub: `Totale: €${scaduti.reduce((s, e) => s + (e.importo ?? 0), 0).toLocaleString('it-IT')}`, level: 'critical', route: '/amministrazione' })
    const inAttesa = liveBudgets.filter(b => b.stato === 'in_attesa')
    if (inAttesa.length > 0)
      alerts.push({ label: `${inAttesa.length} pagament${inAttesa.length > 1 ? 'i in attesa' : 'o in attesa'}`, sub: `Totale: €${inAttesa.reduce((s, e) => s + (e.importo ?? 0), 0).toLocaleString('it-IT')}`, level: 'warning', route: '/amministrazione' })
    const fornitoriProblema = liveSuppliers.filter(s => s.statoContratto === 'scaduto' || s.statoContratto === 'in_scadenza')
    if (fornitoriProblema.length > 0)
      alerts.push({ label: `${fornitoriProblema.length} fornitor${fornitoriProblema.length > 1 ? 'i con contratto critico' : 'e con contratto critico'}`, sub: fornitoriProblema.slice(0, 2).map(f => f.nome).join(', '), level: 'warning', route: '/fornitori' })
    return alerts.slice(0, 4)
  }, [liveBudgets, liveSuppliers])

  // ── Fly suggestions ───────────────────────────────────────────────────────

  const flySuggestions = useMemo(() => {
    const tips: { text: string; chip: string; color: string; route: string }[] = []
    if (kpi.taskUrgentiN > 0)
      tips.push({ text: `${kpi.taskUrgentiN} task urgenti senza completamento — rischio scadenza.`, chip: 'Vedi Task', color: 'var(--red2)', route: '/task' })
    if (kpi.fornitoriCritici > 0)
      tips.push({ text: `${kpi.fornitoriCritici} fornitor${kpi.fornitoriCritici > 1 ? 'i' : 'e'} con contratto scaduto o in scadenza.`, chip: 'Fornitori', color: 'var(--yellow)', route: '/fornitori' })
    if (kpi.comunicazioniNonLette > 0)
      tips.push({ text: `Hai ${kpi.comunicazioniNonLette} comunicazioni non lette.`, chip: 'Comunicazioni', color: 'var(--blue)', route: '/comunicazioni' })
    if (kpi.pagamentiSospesi > 0)
      tips.push({ text: `${kpi.pagamentiSospesi} pagamenti in attesa.`, chip: 'Amministrazione', color: 'var(--yellow)', route: '/amministrazione' })
    if (tips.length === 0)
      tips.push({ text: 'Tutto sotto controllo! Nessuna urgenza operativa rilevata. Ottimo lavoro.', chip: 'Dashboard', color: 'var(--green)', route: '/dashboard' })
    return tips.slice(0, 3)
  }, [kpi])

  // ── KPI cards by role ─────────────────────────────────────────────────────

  const kpiCards = useMemo(() => {
    const all = [
      { id: 'eventi', label: 'Eventi Attivi', value: kpi.eventiAttivi, sub: `su ${myEvents.length} totali`, icon: Calendar, color: 'var(--red2)', route: '/eventi' },
      { id: 'task', label: 'Task Aperti', value: kpi.taskAperti, sub: `${kpi.taskUrgentiN} urgenti`, icon: CheckSquare, color: 'var(--blue)', route: '/task' },
      { id: 'urgenti', label: 'Task Urgenti', value: kpi.taskUrgentiN, sub: 'priorità alta', icon: Zap, color: kpi.taskUrgentiN > 0 ? 'var(--red2)' : 'var(--green)', route: '/task' },
      { id: 'budget', label: 'Budget Totale', value: `€${(kpi.budgetTotale / 1000).toFixed(0)}K`, sub: 'eventi visibili', icon: Euro, color: 'var(--green)', route: '/amministrazione' },
      { id: 'margine', label: 'Margine Stimato', value: `€${(kpi.margineStimato / 1000).toFixed(0)}K`, sub: `usc. €${(kpi.usciteTotale / 1000).toFixed(0)}K`, icon: BarChart3, color: kpi.margineStimato >= 0 ? 'var(--green)' : 'var(--red2)', route: '/amministrazione' },
      { id: 'pagamenti', label: 'Pagam. Sospesi', value: kpi.pagamentiSospesi, sub: 'in attesa', icon: CreditCard, color: kpi.pagamentiSospesi > 0 ? 'var(--yellow)' : 'var(--muted)', route: '/amministrazione' },
      { id: 'clienti', label: 'Clienti Attivi', value: kpi.clientiAttivi, sub: `su ${liveClients.length} totali`, icon: Users, color: 'var(--blue)', route: '/crm' },
      { id: 'fornitori', label: 'Fornitori Critici', value: kpi.fornitoriCritici, sub: 'contratto critico', icon: Truck, color: kpi.fornitoriCritici > 0 ? 'var(--yellow)' : 'var(--muted)', route: '/fornitori' },
      { id: 'comunicazioni', label: 'Non Lette', value: kpi.comunicazioniNonLette, sub: 'comunicazioni', icon: MessageSquare, color: kpi.comunicazioniNonLette > 0 ? 'var(--blue)' : 'var(--muted)', route: '/comunicazioni' },
    ]
    const visible: string[] = (() => {
      if (ruolo === 'Admin' || ruolo === 'Partner') return ['eventi', 'task', 'urgenti', 'budget', 'margine', 'pagamenti', 'clienti']
      if (ruolo === 'Manager') return ['eventi', 'task', 'urgenti']
      if (ruolo === 'Operativo') return ['task', 'urgenti', 'comunicazioni']
      if (ruolo === 'Finance') return ['budget', 'margine', 'pagamenti', 'fornitori']
      if (ruolo === 'Commerciale') return ['clienti', 'eventi', 'comunicazioni', 'task']
      if (ruolo === 'Fornitore') return ['task', 'urgenti']
      return ['eventi', 'task', 'urgenti']
    })()
    return all.filter(k => visible.includes(k.id))
  }, [kpi, myEvents.length, liveClients.length, ruolo])

  // ── Mini calendar ─────────────────────────────────────────────────────────

  const calendarData = useMemo(() => {
    const d = new Date(today)
    const year = d.getFullYear()
    const month = d.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstDay = new Date(year, month, 1).getDay()
    const adjusted = firstDay === 0 ? 6 : firstDay - 1
    const cells: { day: number | null; isToday: boolean; hasEvent: boolean; hasTask: boolean }[] = []
    for (let i = 0; i < adjusted; i++) cells.push({ day: null, isToday: false, hasEvent: false, hasTask: false })
    for (let i = 1; i <= daysInMonth; i++) {
      const cellDate = new Date(year, month, i)
      cells.push({
        day: i,
        isToday: i === today.getDate(),
        hasEvent: liveEvents.some((e: Event) => {
          const s = new Date(e.dataInizio); const f = new Date(e.dataFine)
          return cellDate >= s && cellDate <= f
        }),
        hasTask: liveTasks.some((t: Task) => {
          const td = new Date(t.scadenza); td.setHours(0,0,0,0)
          return td.getTime() === cellDate.getTime() && t.stato !== 'completato'
        }),
      })
    }
    return cells
  }, [today, liveEvents, liveTasks])

  const canSeeAdmin = ['Admin', 'Partner', 'Finance'].includes(ruolo)
  const canSeeCRM = ['Admin', 'Partner', 'Commerciale', 'Manager'].includes(ruolo)

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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Dashboard</h1>
          <p className="mt-1 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
            Benvenuto, {currentUser?.nome?.split(' ')[0] ?? 'utente'}
            <span className="text-xs px-2 py-0.5 rounded capitalize"
              style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)', border: '1px solid rgba(208,0,58,0.2)' }}>
              {ruolo}
            </span>
          </p>
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {today.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map((k, i) => (
          <KpiCard key={k.id} label={k.label} value={k.value} sub={k.sub} icon={k.icon} color={k.color}
            delay={i * 60} onClick={() => navigate(k.route)} />
        ))}
      </div>

      {/* Main 3-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Col 1-2: Prossimi eventi + Task urgenti */}
        <div className="lg:col-span-2 space-y-5">

          {/* Prossimi eventi */}
          <Section title="Prossimi eventi" icon={Calendar} action="Tutti" onAction={() => navigate('/eventi')} delay={100}>
            {prossimEventi.length === 0
              ? <p className="text-sm text-center py-4" style={{ color: 'var(--muted)' }}>Nessun evento attivo</p>
              : (
                <div className="space-y-2">
                  {prossimEventi.map(ev => {
                    const color = eventColorByStato(ev.stato)
                    const dl = daysLeft(ev.dataInizio)
                    const completati = liveTasks.filter((t: Task) => t.evento === ev.id && t.stato === 'completato').length
                    const totali = liveTasks.filter((t: Task) => t.evento === ev.id).length
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
                              {ev.location} · {fmtShort(ev.dataInizio)}
                            </p>
                            {dl >= 0 && dl <= 14 && (
                              <span className="text-xs flex-shrink-0"
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
                              <span className="text-xs flex-shrink-0" style={{ color: 'var(--muted)' }}>{pct}%</span>
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                            €{(ev.budget / 1000).toFixed(0)}K
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

          {/* Task urgenti */}
          <Section title="Task urgenti" icon={Zap} color="var(--red2)" action="Tutti" onAction={() => navigate('/task')} delay={150}>
            {urgentTasks.length === 0
              ? <p className="text-sm text-center py-4" style={{ color: 'var(--muted)' }}>Nessun task urgente</p>
              : (
                <div className="space-y-2">
                  {urgentTasks.map(t => {
                    const dl = daysLeft(t.scadenza)
                    const overdue = dl < 0
                    const color = taskPriColor(t.priorita, t.stato)
                    return (
                      <button key={t.id}
                        onClick={() => navigate('/task')}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all hover:bg-white/5"
                        style={{ background: 'var(--panel2)', border: `1px solid ${overdue ? 'rgba(255,49,95,0.2)' : 'var(--line)'}` }}>
                        <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ background: color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{t.titolo}</p>
                          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{t.assegnatario || '—'}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" style={{ color: overdue ? 'var(--red2)' : 'var(--muted)' }} />
                            <span className="text-xs font-medium"
                              style={{ color: overdue ? 'var(--red2)' : dl <= 3 ? 'var(--yellow)' : 'var(--muted)' }}>
                              {overdue ? `${Math.abs(dl)}g scad.` : `${dl}g`}
                            </span>
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{fmtShort(t.scadenza)}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            }
          </Section>

          {/* Alert amministrativi (Admin/Finance) */}
          {canSeeAdmin && alertAmministrativi.length > 0 && (
            <Section title="Alert amministrativi" icon={Bell} color="var(--yellow)" action="Amministrazione" onAction={() => navigate('/amministrazione')} delay={250}>
              <div className="space-y-2">
                {alertAmministrativi.map((a, i) => (
                  <button key={i}
                    onClick={() => navigate(a.route)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all hover:bg-white/5"
                    style={{
                      background: 'var(--panel2)',
                      border: `1px solid ${a.level === 'critical' ? 'rgba(255,49,95,0.2)' : 'rgba(255,194,75,0.15)'}`,
                    }}>
                    <AlertTriangle className="w-4 h-4 flex-shrink-0"
                      style={{ color: a.level === 'critical' ? 'var(--red2)' : 'var(--yellow)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{a.label}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{a.sub}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Col 3: sidebar panels */}
        <div className="space-y-5">

          {/* Mini Calendar */}
          <div className="panel p-5 animate-fade-in" style={{ animationDelay: '120ms' }}>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4" style={{ color: 'var(--red2)' }} />
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                {today.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
              </h2>
            </div>
            <div className="grid grid-cols-7 text-center text-xs mb-1">
              {['L','M','M','G','V','S','D'].map((d, i) => (
                <div key={i} className="py-1" style={{ color: 'var(--muted)' }}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {calendarData.slice(0, 42).map((cell, i) => (
                <div key={i}
                  className="aspect-square flex flex-col items-center justify-center text-xs rounded-lg relative"
                  style={{
                    background: cell.isToday
                      ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                      : cell.hasEvent ? 'rgba(77,180,255,0.08)' : 'transparent',
                    color: cell.isToday ? 'white' : cell.day ? 'var(--text)' : 'transparent',
                    fontWeight: cell.isToday ? 700 : 400,
                  }}>
                  {cell.day}
                  {!cell.isToday && (cell.hasEvent || cell.hasTask) && (
                    <div className="absolute bottom-0.5 flex gap-0.5">
                      {cell.hasEvent && <div className="w-1 h-1 rounded-full" style={{ background: 'var(--blue)' }} />}
                      {cell.hasTask && <div className="w-1 h-1 rounded-full" style={{ background: 'var(--red2)' }} />}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--muted)' }}>· eventi</span>
                <span style={{ color: 'var(--text)' }}>{liveEvents.filter((e: Event) => new Date(e.dataInizio).getMonth() === today.getMonth()).length} questo mese</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--muted)' }}>· task in scadenza</span>
                <span style={{ color: 'var(--text)' }}>{scadenzeCalendario.filter(x => x.type === 'task').length} nei prossimi 14g</span>
              </div>
            </div>
          </div>

          {/* Scadenze prossime */}
          <Section title="Prossime scadenze" icon={Clock} color="var(--blue)" action="Calendario" onAction={() => navigate('/calendario')} delay={160}>
            {scadenzeCalendario.length === 0
              ? <p className="text-xs text-center py-3" style={{ color: 'var(--muted)' }}>Nessuna scadenza nei prossimi 14 giorni</p>
              : (
                <div className="space-y-1.5">
                  {scadenzeCalendario.map((item, i) => (
                    <button key={i}
                      onClick={() => navigate(item.type === 'task' ? '/task' : '/eventi')}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-all hover:bg-white/5"
                      style={{ background: 'var(--panel2)' }}>
                      {item.type === 'task'
                        ? <CheckSquare className="w-3.5 h-3.5 flex-shrink-0" style={{ color: item.dl <= 2 ? 'var(--red2)' : 'var(--blue)' }} />
                        : <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--red2)' }} />
                      }
                      <p className="text-xs truncate flex-1" style={{ color: 'var(--text)' }}>{item.label}</p>
                      <span className="text-xs flex-shrink-0 font-medium"
                        style={{ color: item.dl === 0 ? 'var(--red2)' : item.dl <= 2 ? 'var(--yellow)' : 'var(--muted)' }}>
                        {item.dl === 0 ? 'Oggi' : `${item.dl}g`}
                      </span>
                    </button>
                  ))}
                </div>
              )
            }
          </Section>

          {/* Comunicazioni recenti */}
          <Section title="Comunicazioni" icon={MessageSquare} color="var(--blue)" action="Tutte" onAction={() => navigate('/comunicazioni')} delay={200}>
            {comunicazioniRecenti.length === 0
              ? <p className="text-xs text-center py-3" style={{ color: 'var(--muted)' }}>Nessun messaggio</p>
              : (
                <div className="space-y-1.5">
                  {comunicazioniRecenti.map(m => {
                    const unread = !m.letto.includes(userId) && m.destinatari.includes(userId)
                    return (
                      <button key={m.id}
                        onClick={() => navigate('/comunicazioni')}
                        className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-all hover:bg-white/5"
                        style={{ background: 'var(--panel2)', border: unread ? '1px solid rgba(77,180,255,0.2)' : '1px solid transparent' }}>
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                          style={{ background: 'rgba(77,180,255,0.1)', color: 'var(--blue)' }}>
                          {m.mittente.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate" style={{ color: unread ? 'var(--text)' : 'var(--muted)', fontWeight: unread ? 600 : 400 }}>
                            {m.oggetto}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--muted)' }}>{m.mittente}</p>
                        </div>
                        {unread && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--blue)' }} />}
                        {m.priorita === 'alta' && <Zap className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--red2)' }} />}
                      </button>
                    )
                  })}
                </div>
              )
            }
          </Section>

          {/* CRM snippet (Admin/Manager/Commerciale) */}
          {canSeeCRM && (
            <Section title="Top clienti" icon={Users} color="var(--green)" action="CRM" onAction={() => navigate('/crm')} delay={240}>
              <div className="space-y-1.5">
                {liveClients
                  .filter(c => c.stato === 'vip' || c.stato === 'attivo')
                  .sort((a, b) => b.fatturato - a.fatturato)
                  .slice(0, 4)
                  .map(c => (
                    <button key={c.id}
                      onClick={() => navigate('/crm')}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-all hover:bg-white/5"
                      style={{ background: 'var(--panel2)' }}>
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                        style={{ background: c.stato === 'vip' ? 'rgba(255,194,75,0.15)' : 'rgba(56,210,125,0.1)', color: c.stato === 'vip' ? 'var(--yellow)' : 'var(--green)' }}>
                        {c.nome.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{c.nome}</p>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>{c.settore}</p>
                      </div>
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--muted)' }}>
                        €{(c.fatturato / 1000).toFixed(0)}K
                      </span>
                    </button>
                  ))}
              </div>
            </Section>
          )}

          {/* Fly suggestions */}
          <div className="panel p-5 animate-fade-in" style={{ animationDelay: '280ms', border: '1px solid rgba(208,0,58,0.15)', background: 'linear-gradient(135deg, rgba(208,0,58,0.04) 0%, var(--panel) 60%)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(208,0,58,0.15)', boxShadow: '0 0 12px rgba(208,0,58,0.2)' }}>
                <Zap className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
              </div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Fly suggerisce</h2>
            </div>
            <div className="space-y-3">
              {flySuggestions.map((tip, i) => (
                <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{tip.text}</p>
                  <button
                    onClick={() => navigate(tip.route)}
                    className="mt-2 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all hover:opacity-80"
                    style={{ background: `${tip.color}15`, color: tip.color, border: `1px solid ${tip.color}25` }}>
                    {tip.chip} <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="panel p-4 animate-fade-in" style={{ animationDelay: '320ms' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Completamento</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: kpi.completionRate >= 50 ? 'var(--green)' : 'var(--yellow)' }}>
                {kpi.completionRate}%
              </p>
              <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${kpi.completionRate}%`, background: kpi.completionRate >= 50 ? 'var(--green)' : 'var(--yellow)' }} />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>task</p>
            </div>
            <div className="panel p-4 animate-fade-in" style={{ animationDelay: '360ms' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Fornitori</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--blue)' }}>
                {liveSuppliers.filter(s => s.stato === 'attivo').length}<span className="text-sm font-normal" style={{ color: 'var(--muted)' }}>/{liveSuppliers.length}</span>
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>attivi</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
