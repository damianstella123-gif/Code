import { useMemo, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, ListTodo, AlertCircle, MessageSquare, ChevronRight, Palmtree, CreditCard } from 'lucide-react'
import { loadUser, isAdmin } from '@/lib/auth'
import { daysLeft, fmtLong } from '@/lib/format'
import { fetchEvents } from '@/lib/events-service'
import { fetchTasks } from '@/lib/tasks-service'
import { fetchClients } from '@/lib/clients-service'
import { useRealtimeTable } from '@/lib/use-realtime'
import { supabase } from '@/lib/supabase'
import { useChatNotifications } from '@/lib/chat-notifications'
import { useToast } from '@/lib/toast'
import CommandBar from '@/components/CommandBar'
import ShieldStatus from '@/components/ShieldStatus'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Client } from '@/data/clients'

type StoryTag = 'urgente' | 'corso' | 'buona' | 'attesa'
type Category = 'eventi' | 'task' | 'clienti'

type LeaveToday = {
  id: string
  data_fine: string
  profiles?: { first_name: string; last_name: string } | null
}

type Story = {
  id: string
  tag: StoryTag
  tagLabel: string
  headline: string
  dek: string
  meta: string
  category: Category
  score: number
  action: () => void
}

const TAG_LABEL: Record<StoryTag, string> = {
  urgente: 'Urgente',
  corso: 'In corso',
  buona: 'Buona notizia',
  attesa: 'In arrivo',
}

function timeAgoLabel(days: number): string {
  if (days <= 0) return 'oggi'
  if (days === 1) return 'ieri'
  return `${days}g fa`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const currentUser = loadUser()
  const { showToast } = useToast()

  const [liveTasks, setLiveTasks] = useState<Task[]>([])
  const [liveEvents, setLiveEvents] = useState<Event[]>([])
  const [liveClients, setLiveClients] = useState<Client[]>([])
  const [profileMap, setProfileMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'tutto' | Category>('tutto')
  const [now, setNow] = useState(new Date())
  const [feedFilter, setFeedFilter] = useState<string | null>(null)
  const [sentinelAlerts, setSentinelAlerts] = useState<{ id: string; message: string; created_at: string }[]>([])
  const [morningEdition, setMorningEdition] = useState<{ id: string; message: string; created_at: string } | null>(null)
  const [leaves, setLeaves] = useState<LeaveToday[]>([])
  const [pendingPayments, setPendingPayments] = useState(0)
  const admin = isAdmin(currentUser)
  useEffect(() => {
    async function load() {
      try {
        const [ev, tk, cl] = await Promise.all([fetchEvents(), fetchTasks(), fetchClients()])
        setLiveEvents(ev)
        setLiveTasks(tk)
        setLiveClients(cl)

        const userIds = [...new Set([
          ...ev.map(e => e.responsabile).filter(Boolean),
          ...tk.map(t => t.assegnatario).filter(Boolean),
        ])].filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}/.test(id)) as string[]

        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, nome, first_name, last_name')
            .in('id', userIds)
          if (profiles) {
            const map: Record<string, string> = {}
            profiles.forEach((p: any) => {
              const nome = p.nome || ''
              const fullName = [p.first_name, p.last_name]
                .filter(Boolean).join(' ').trim()
              map[p.id] = fullName || nome || 'Utente'
            })
            setProfileMap(map)
          }
        }
      } catch (err) {
        showToast('Errore caricamento dati')
      } finally {
        setLoading(false)
      }
    }
    load()
    // Fetch sentinel critical alerts for admins
    if (isAdmin(currentUser)) {
      supabase.from('sentinel_alerts')
        .select('id, message, created_at')
        .eq('status', 'new')
        .eq('severity', 'critical')
        .order('created_at', { ascending: false })
        .limit(5)
        .then(({ data }) => { if (data) setSentinelAlerts(data) })
    }
    // Fetch today's morning edition for current user
    if (currentUser) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      supabase.from('notifications')
        .select('id, message, created_at')
        .eq('user_id', currentUser.id)
        .eq('type', 'morning_edition')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => { if (data) setMorningEdition(data) })
    }
    // Team members on approved leave today
    const todayISO = new Date().toISOString().split('T')[0]
    supabase.from('leave_requests')
      .select('id, data_fine, profiles(first_name, last_name)')
      .eq('stato', 'approvata')
      .lte('data_inizio', todayISO)
      .gte('data_fine', todayISO)
      .then(({ data }) => { if (data) setLeaves(data as unknown as LeaveToday[]) })
    // Pending payment approvals (admin only)
    if (admin) {
      supabase.from('event_payments')
        .select('id', { count: 'exact', head: true })
        .eq('stato_approvazione', 'in_attesa')
        .then(({ count }) => setPendingPayments(count || 0))
    }
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(clock)
  }, [])

  useRealtimeTable('events', () => { fetchEvents().then(setLiveEvents).catch(() => {}) })
  useRealtimeTable('tasks', () => { fetchTasks().then(setLiveTasks).catch(() => {}) })
  useRealtimeTable('clients', () => { fetchClients().then(setLiveClients).catch(() => {}) })

  useEffect(() => {
    if (liveEvents.length === 0 && liveTasks.length === 0) return
    const userIds = [...new Set([
      ...liveEvents.map(e => e.responsabile).filter(Boolean),
      ...liveTasks.map(t => t.assegnatario).filter(Boolean),
    ])].filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}/.test(id)) as string[]
    if (userIds.length === 0) return

    const missing = userIds.filter(id => !profileMap[id])
    if (missing.length === 0) return

    supabase.from('profiles')
      .select('id, nome, first_name, last_name')
      .in('id', missing)
      .then(({ data }) => {
        if (!data) return
        const newMap: Record<string, string> = {}
        data.forEach((p: any) => {
          const fullName = [p.first_name, p.last_name]
            .filter(Boolean).join(' ').trim()
          newMap[p.id] = fullName || p.nome || 'Utente'
        })
        setProfileMap(prev => ({ ...prev, ...newMap }))
      })
  }, [liveEvents, liveTasks])

  const firstName = currentUser?.first_name ?? currentUser?.nome?.split(' ')[0] ?? ''

  const eventById = useMemo(() => {
    const map = new Map<string, Event>()
    liveEvents.forEach(e => map.set(e.id, e))
    return map
  }, [liveEvents])

  function resolveName(id: string | null | undefined): string {
    if (!id) return 'non assegnato'
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(id)
    if (!isUUID) return id
    return profileMap[id] || 'caricamento...'
  }

  const stories = useMemo<Story[]>(() => {
    const items: Story[] = []

    liveTasks
      .filter(t => t.stato !== 'completato' && daysLeft(t.scadenza) < 0)
      .forEach(t => {
        const ritardo = Math.abs(daysLeft(t.scadenza))
        const ev = t.evento ? eventById.get(t.evento) : undefined
        items.push({
          id: `urg-${t.id}`,
          tag: 'urgente',
          tagLabel: TAG_LABEL.urgente,
          headline: t.titolo,
          dek: ev ? `Collegato a ${ev.nome}. ${t.descrizione}` : t.descrizione,
          meta: `${ritardo}g di ritardo · ${resolveName(t.assegnatario)}`,
          category: 'task',
          score: 100 + ritardo,
          action: () => navigate('/task'),
        })
      })

    liveEvents
      .filter(e => e.stato !== 'completato')
      .forEach(e => {
        const dl = daysLeft(e.dataInizio)
        if (dl < 0 || dl > 21) return
        const relatedTasks = liveTasks.filter(t => t.evento === e.id)
        const done = relatedTasks.filter(t => t.stato === 'completato').length
        const pct = relatedTasks.length > 0 ? Math.round((done / relatedTasks.length) * 100) : 100
        items.push({
          id: `evt-${e.id}`,
          tag: 'corso',
          tagLabel: TAG_LABEL.corso,
          headline: `${e.nome}: pronto al ${pct}%`,
          dek: `${e.location} · ${e.partecipanti} partecipanti attesi. ${dl === 0 ? 'È in scena oggi.' : dl === 1 ? 'Va in scena domani.' : `Va in scena tra ${dl} giorni.`}`,
          meta: `responsabile ${resolveName(e.responsabile)} · budget €${(e.budget / 1000).toFixed(0)}K`,
          category: 'eventi',
          score: 40 + (21 - dl),
          action: () => navigate('/eventi'),
        })
      })

    liveTasks
      .filter(t => t.stato !== 'completato' && t.priorita === 'alta' && daysLeft(t.scadenza) >= 0 && daysLeft(t.scadenza) <= 5)
      .forEach(t => {
        const dl = daysLeft(t.scadenza)
        const ev = t.evento ? eventById.get(t.evento) : undefined
        items.push({
          id: `att-${t.id}`,
          tag: 'attesa',
          tagLabel: TAG_LABEL.attesa,
          headline: t.titolo,
          dek: ev ? `Da chiudere per ${ev.nome}. ${t.descrizione}` : t.descrizione,
          meta: `scade tra ${dl === 0 ? 'oggi' : dl === 1 ? '1 giorno' : `${dl} giorni`} · ${resolveName(t.assegnatario)}`,
          category: 'task',
          score: 60 + (5 - dl),
          action: () => navigate('/task'),
        })
      })

    liveTasks
      .filter(t => t.stato === 'completato')
      .sort((a, b) => new Date(b.scadenza).getTime() - new Date(a.scadenza).getTime())
      .slice(0, 3)
      .forEach(t => {
        const ev = t.evento ? eventById.get(t.evento) : undefined
        items.push({
          id: `ok-${t.id}`,
          tag: 'buona',
          tagLabel: TAG_LABEL.buona,
          headline: `${t.titolo}: completato`,
          dek: ev ? `Un passo avanti per ${ev.nome}.` : 'Attività fuori evento portata a termine.',
          meta: `${resolveName(t.assegnatario)} · ${timeAgoLabel(Math.abs(daysLeft(t.scadenza)))}`,
          category: 'task',
          score: 10,
          action: () => navigate('/task'),
        })
      })

    const attivi = liveClients.filter(c => c.stato === 'attivo' || c.stato === 'vip')
    if (attivi.length > 0) {
      const fatturato = attivi.reduce((s, c) => s + (c.fatturato || 0), 0)
      items.push({
        id: 'clienti-pulse',
        tag: 'buona',
        tagLabel: TAG_LABEL.buona,
        headline: `Il portafoglio clienti vale €${(fatturato / 1000).toFixed(0)}K`,
        dek: `${attivi.length} clienti attivi seguiti dal team in questo momento.`,
        meta: 'aggiornato ora · CRM',
        category: 'clienti',
        score: 5,
        action: () => navigate('/crm'),
      })
    }

    // Sentinel critical alerts
    sentinelAlerts.forEach(a => {
      items.push({
        id: `sentinel-${a.id}`,
        tag: 'urgente',
        tagLabel: 'SENTINEL',
        headline: a.message,
        dek: 'Allarme di sistema rilevato da Sentinel. Verifica nel Centro Sicurezza.',
        meta: `sentinel · ${timeAgoLabel(Math.abs(daysLeft(a.created_at)))}`,
        category: 'task',
        score: 200,
        action: () => navigate('/centro-sicurezza'),
      })
    })

    return items.sort((a, b) => b.score - a.score)
  }, [liveTasks, liveEvents, liveClients, eventById, profileMap, navigate, sentinelAlerts])

  const filteredByTab = tab === 'tutto' ? stories : stories.filter(s => s.category === tab)

  const filteredStories = useMemo(() => {
    if (!feedFilter) return filteredByTab
    if (feedFilter === 'scade_oggi') {
      return filteredByTab.filter(s => s.tag === 'urgente' || s.tag === 'attesa')
    }
    if (feedFilter === 'eventi_in_corso') {
      return filteredByTab.filter(s => s.category === 'eventi')
    }
    if (feedFilter === 'clienti_attivi') {
      return filteredByTab.filter(s => s.category === 'clienti')
    }
    return filteredByTab
  }, [filteredByTab, feedFilter])

  const handleFilter = useCallback((filter: string) => {
    setFeedFilter(prev => prev === filter ? null : filter)
  }, [])

  const kpi = useMemo(() => {
    const taskAperti = liveTasks.filter(t => t.stato !== 'completato' && t.assegnatario === currentUser?.id).length
    const eventiImminenti = liveEvents.filter(e => {
      const dl = daysLeft(e.dataInizio)
      return dl >= 0 && dl <= 14 && e.stato !== 'completato'
    }).length
    const clientiAttivi = liveClients.filter(c => c.stato === 'attivo' || c.stato === 'vip').length
    return { taskAperti, eventiImminenti, clientiAttivi }
  }, [liveTasks, liveEvents, liveClients, currentUser])

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
    <div className="wire-page" style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
      <div className="wire-masthead" style={{ flexWrap: 'wrap', gap: '4px 12px' }}>
        <span className="wire-masthead-title" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Simmetria Synergy{firstName ? ` — Buongiorno, ${firstName}` : ''}</span>
        <div className="wire-masthead-right" style={{ flexShrink: 0 }}>
          <span className="wire-clock" style={{ fontSize: '12px' }}>
            {now.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()} · {now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="wire-live-dot" />
        </div>
      </div>

      <CommandBar
        events={liveEvents}
        tasks={liveTasks}
        clients={liveClients}
        onFilter={handleFilter}
      />

      <div className="wire-ticker" style={{ flexWrap: 'wrap', gap: '4px 12px', fontSize: '14px' }}>
        <span><strong>{kpi.taskAperti}</strong> task aperti</span>
        <span><strong>{kpi.eventiImminenti}</strong> eventi prossimi 14gg</span>
        <span><strong>{kpi.clientiAttivi}</strong> clienti attivi</span>
      </div>

      <DashboardWidgets
        events={liveEvents}
        tasks={liveTasks}
        setTasks={setLiveTasks}
        navigate={navigate}
        leaves={leaves}
        pendingPayments={pendingPayments}
        admin={admin}
      />

      <ShieldStatus />

      <div className="wire-tabs" style={{ flexWrap: 'wrap', gap: '4px' }}>
        {(['tutto', 'eventi', 'task', 'clienti'] as const).map(t => (
          <button
            key={t}
            className={`wire-tab ${tab === t ? 'wire-tab--active' : ''}`}
            onClick={() => { setTab(t); setFeedFilter(null) }}
            style={{ minHeight: 44, fontSize: '14px' }}
          >
            {t}
          </button>
        ))}
        {feedFilter && (
          <button
            className="wire-tab"
            style={{ opacity: 1, color: 'var(--red2)', minHeight: 44, fontSize: '14px' }}
            onClick={() => setFeedFilter(null)}
          >
            × reset filtro
          </button>
        )}
      </div>

      {filteredStories.length === 0 ? (
        <div className="wire-empty" style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', lineHeight: 1.7 }}>
          Il feed e silenzioso. Significa che tutto e sotto controllo<br/>oppure che e ora di mettere in moto qualcosa.
        </div>
      ) : (
        <>
          <UnreadMessagesCard />
          {morningEdition && <MorningEditionCard edition={morningEdition} />}
          {filteredStories.map((s, i) => (
            <button
              key={s.id}
              className="wire-card wire-story"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              onClick={s.action}
            >
              <span className={`wire-story-tag wire-story-tag--${s.tag}`}>{s.tagLabel}</span>
              <span className="wire-story-body">
                <p className="wire-story-headline">{s.headline}</p>
                <p className="wire-story-dek">{s.dek}</p>
                <p className="wire-story-meta">{s.meta}</p>
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}

function UnreadMessagesCard() {
  const navigate = useNavigate()
  const { unread } = useChatNotifications()

  if (unread.total === 0) return null

  const convNames = Array.from(unread.byConversation.keys())
    .slice(0, 3)
    .map(id => {
      const conv = unread.conversations.find(c => c.id === id)
      if (!conv) return null
      if (conv.title) return conv.title
      const user = loadUser()
      const others = conv.participant_ids.filter(pid => pid !== user?.id)
      const p = unread.profiles.find(pr => pr.id === others[0])
      return p ? `${p.first_name} ${p.last_name}` : null
    })
    .filter(Boolean)

  const extra = unread.byConversation.size - 3
  const subtitle = convNames.join(', ') + (extra > 0 ? ` e altre ${extra}` : '')

  return (
    <button
      className="wire-story"
      onClick={() => navigate('/comunicazioni')}
    >
      <span className="wire-story-tag" style={{ color: 'var(--blue)', borderColor: 'var(--blue)' }}>MESSAGGI</span>
      <span className="wire-story-body">
        <p className="wire-story-headline">Hai {unread.total} messagg{unread.total === 1 ? 'io' : 'i'} non lett{unread.total === 1 ? 'o' : 'i'}</p>
        <p className="wire-story-dek">{subtitle}</p>
        <p className="wire-story-meta">adesso</p>
      </span>
    </button>
  )
}

function MorningEditionCard({ edition }: { edition: { id: string; message: string; created_at: string } }) {
  const [expanded, setExpanded] = useState(false)
  const text = edition.message || ''
  const truncated = text.length > 500 && !expanded

  return (
    <div
      className="wire-story"
      style={{
        background: 'var(--panel2)',
        borderTop: '3px solid var(--yellow, #eab308)',
        borderBottom: '3px solid var(--yellow, #eab308)',
        cursor: 'default',
      }}
    >
      <span
        className="wire-story-tag"
        style={{ color: '#ca8a04', borderColor: '#ca8a04', fontSize: 12 }}
      >
        EDIZIONE DEL MATTINO
      </span>
      <span className="wire-story-body">
        <p className="wire-story-headline" style={{ fontSize: 14 }}>Briefing di oggi</p>
        <p className="wire-story-dek" style={{ whiteSpace: 'pre-wrap', maxHeight: truncated ? 180 : undefined, overflow: truncated ? 'hidden' : undefined }}>
          {truncated ? text.slice(0, 500) + '...' : text}
        </p>
        {text.length > 500 && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            className="text-xs font-medium mt-1"
            style={{ color: 'var(--red2)' }}
          >
            {expanded ? 'Riduci' : 'Leggi tutto'}
          </button>
        )}
        <p className="wire-story-meta">
          {new Date(edition.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · fly
        </p>
      </span>
    </div>
  )
}

function DashboardWidgets({ events, tasks, setTasks, navigate, leaves, pendingPayments, admin }: {
  events: Event[]
  tasks: Task[]
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>
  navigate: (path: string) => void
  leaves: LeaveToday[]
  pendingPayments: number
  admin: boolean
}) {
  const { unread } = useChatNotifications()

  const activeEvents = useMemo(() =>
    events.filter(e => e.stato === 'in_corso' || e.stato === 'pianificazione'),
    [events]
  )

  const openTasks = useMemo(() =>
    tasks
      .filter(t => t.stato !== 'completato')
      .sort((a, b) => new Date(a.scadenza).getTime() - new Date(b.scadenza).getTime()),
    [tasks]
  )

  const todayStr = new Date().toISOString().slice(0, 10)
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  const deadlines = useMemo(() => {
    return openTasks.filter(t => {
      const d = t.scadenza?.slice(0, 10)
      return d === todayStr || d === tomorrowStr
    })
  }, [openTasks, todayStr, tomorrowStr])

  async function toggleTask(taskId: string) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, stato: 'completato' } : t))
    await supabase.from('tasks').update({ stato: 'completato' }).eq('id', taskId)
  }

  const unreadConvs = useMemo(() => {
    if (!unread?.byConversation) return []
    return Array.from(unread.byConversation.entries()).slice(0, 3).map(([id, count]) => {
      const conv = unread.conversations?.find(c => c.id === id)
      const title = conv?.title || 'Conversazione'
      return { id, title, count }
    })
  }, [unread])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-3" style={{ maxWidth: 900, margin: '0 auto', minWidth: 0 }}>
      {/* EVENTI */}
      <div
        className="rounded-[14px] p-4 transition-all cursor-pointer group"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={() => navigate('/eventi')}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--red2) 40%, transparent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
      >
        <div className="flex items-center justify-between mb-2 pb-2" style={{ borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)' }} className="uppercase">Eventi</span>
          <Calendar className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        </div>
        <p style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 28, color: 'var(--text)', lineHeight: 1.1 }}>
          {activeEvents.length}
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>attivi</p>
        <div className="space-y-1.5" style={{ minWidth: 0 }}>
          {activeEvents.slice(0, 3).map(e => {
            const dl = daysLeft(e.dataInizio)
            return (
              <div key={e.id} className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{e.nome}</span>
                <span style={{ color: dl <= 7 ? 'var(--red2)' : 'var(--muted)', fontSize: 12, flexShrink: 0 }}>
                  T{dl >= 0 ? `-${dl}` : `+${Math.abs(dl)}`}
                </span>
              </div>
            )
          })}
          {activeEvents.length === 0 && (
            <p style={{ fontSize: 14, color: 'var(--green)' }}>Nessun evento in corso</p>
          )}
        </div>
        <div className="flex items-center gap-1 mt-3 font-medium" style={{ color: 'var(--red2)', fontSize: 12 }}>
          Vedi tutti <ChevronRight className="w-3 h-3" />
        </div>
      </div>

      {/* TASK */}
      <div
        className="rounded-[14px] p-4 transition-all cursor-pointer"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={() => navigate('/task')}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--red2) 40%, transparent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
      >
        <div className="flex items-center justify-between mb-2 pb-2" style={{ borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)' }} className="uppercase">Task</span>
          <ListTodo className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        </div>
        <p style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 28, color: 'var(--text)', lineHeight: 1.1 }}>
          {openTasks.length}
        </p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>aperti</p>
        <div className="space-y-1.5" style={{ minWidth: 0 }}>
          {openTasks.slice(0, 3).map(t => {
            const dl = daysLeft(t.scadenza)
            return (
              <div key={t.id} className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', minWidth: 0 }}>
                <input
                  type="checkbox"
                  className="rounded flex-shrink-0 cursor-pointer"
                  style={{ accentColor: 'var(--green)', width: 20, height: 20, minWidth: 20, minHeight: 20 }}
                  checked={false}
                  onClick={e => { e.stopPropagation(); toggleTask(t.id) }}
                  onChange={() => {}}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{t.titolo}</span>
                <span style={{ color: dl <= 0 ? 'var(--red2)' : dl <= 2 ? 'var(--yellow)' : 'var(--muted)', fontSize: 12, flexShrink: 0 }}>
                  {dl === 0 ? 'oggi' : dl < 0 ? `${Math.abs(dl)}g fa` : `${dl}g`}
                </span>
              </div>
            )
          })}
          {openTasks.length === 0 && (
            <p style={{ fontSize: 14, color: 'var(--green)' }}>Tutti i task completati</p>
          )}
        </div>
        <div className="flex items-center gap-1 mt-3 font-medium" style={{ color: 'var(--red2)', fontSize: 12 }}>
          Vedi tutti <ChevronRight className="w-3 h-3" />
        </div>
      </div>

      {/* SCADENZE */}
      <div
        className="rounded-[14px] p-4 transition-all cursor-pointer"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={() => navigate('/calendario')}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--red2) 40%, transparent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
      >
        <div className="flex items-center justify-between mb-2 pb-2" style={{ borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)' }} className="uppercase">Scadenze</span>
          <AlertCircle className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        </div>
        {deadlines.length > 0 ? (
          <>
            <p style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 28, color: 'var(--red2)', lineHeight: 1.1 }}>
              {deadlines.length}
            </p>
            <div className="flex items-center gap-1.5 mb-3" style={{ flexWrap: 'wrap' }}>
              {deadlines.some(t => t.scadenza?.slice(0, 10) === todayStr) && (
                <span className="uppercase px-1.5 py-0.5 rounded font-bold" style={{ fontSize: 12, background: 'color-mix(in srgb, var(--red2) 15%, transparent)', color: 'var(--red2)' }}>Oggi</span>
              )}
              {deadlines.some(t => t.scadenza?.slice(0, 10) === tomorrowStr) && (
                <span className="uppercase px-1.5 py-0.5 rounded font-bold" style={{ fontSize: 12, background: 'color-mix(in srgb, var(--yellow) 15%, transparent)', color: 'var(--yellow)' }}>Domani</span>
              )}
            </div>
            <div className="space-y-1.5" style={{ minWidth: 0 }}>
              {deadlines.slice(0, 3).map(t => (
                <div key={t.id} style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.titolo}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 28, color: 'var(--green)', lineHeight: 1.1 }}>0</p>
            <p style={{ fontSize: 14, color: 'var(--green)', marginTop: 8 }}>Nessuna scadenza urgente</p>
          </>
        )}
        <div className="flex items-center gap-1 mt-3 font-medium" style={{ color: 'var(--red2)', fontSize: 12 }}>
          Calendario <ChevronRight className="w-3 h-3" />
        </div>
      </div>

      {/* MESSAGGI */}
      <div
        className="rounded-[14px] p-4 transition-all cursor-pointer"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={() => navigate('/comunicazioni')}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--red2) 40%, transparent)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
      >
        <div className="flex items-center justify-between mb-2 pb-2" style={{ borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)' }} className="uppercase">Messaggi</span>
          <MessageSquare className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        </div>
        {unread && unread.total > 0 ? (
          <>
            <p style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 28, color: 'var(--text)', lineHeight: 1.1 }}>
              {unread.total}
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>non letti</p>
            <div className="space-y-1.5" style={{ minWidth: 0 }}>
              {unreadConvs.map(c => (
                <div key={c.id} className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{c.title}</span>
                  <span style={{ color: 'var(--blue)', fontSize: 12, flexShrink: 0 }}>{c.count} nuov{c.count === 1 ? 'o' : 'i'}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 28, color: 'var(--green)', lineHeight: 1.1 }}>0</p>
            <p style={{ fontSize: 14, color: 'var(--green)', marginTop: 8 }}>Tutto letto</p>
          </>
        )}
        <div className="flex items-center gap-1 mt-3 font-medium" style={{ color: 'var(--red2)', fontSize: 12 }}>
          Chat <ChevronRight className="w-3 h-3" />
        </div>
      </div>

      {/* IL TEAM */}
      <div
        className="rounded-[14px] p-4"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
      >
        <div className="flex items-center justify-between mb-2 pb-2" style={{ borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)' }} className="uppercase">Il team</span>
          <Palmtree className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        </div>
        {leaves.length > 0 ? (
          <>
            <p style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 28, color: 'var(--text)', lineHeight: 1.1 }}>
              {leaves.length}
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>in assenza oggi</p>
            <div className="space-y-1.5" style={{ minWidth: 0 }}>
              {leaves.slice(0, 3).map(l => {
                const name = [l.profiles?.first_name, l.profiles?.last_name].filter(Boolean).join(' ').trim() || 'Membro del team'
                return (
                  <div key={l.id} className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{name}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 12, flexShrink: 0 }}>rientra {fmtLong(l.data_fine)}</span>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <p style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 28, color: 'var(--green)', lineHeight: 1.1 }}>0</p>
            <p style={{ fontSize: 14, color: 'var(--green)', marginTop: 8 }}>Tutti presenti</p>
          </>
        )}
      </div>

      {/* PAGAMENTI IN SOSPESO (admin) */}
      {admin && (
        <div
          className="rounded-[14px] p-4 transition-all cursor-pointer"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
          onClick={() => navigate('/amministrazione')}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--red2) 40%, transparent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
        >
          <div className="flex items-center justify-between mb-2 pb-2" style={{ borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'var(--muted)' }} className="uppercase">Pagamenti in sospeso</span>
            <CreditCard className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </div>
          <p style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 28, color: pendingPayments > 0 ? 'var(--red2)' : 'var(--green)', lineHeight: 1.1 }}>
            {pendingPayments}
          </p>
          <p style={{ fontSize: 14, color: pendingPayments > 0 ? 'var(--muted)' : 'var(--green)', marginTop: 8 }}>
            {pendingPayments > 0 ? 'da approvare' : 'Nessun pagamento in attesa'}
          </p>
          <div className="flex items-center gap-1 mt-3 font-medium" style={{ color: 'var(--red2)', fontSize: 12 }}>
            Amministrazione <ChevronRight className="w-3 h-3" />
          </div>
        </div>
      )}
    </div>
  )
}
