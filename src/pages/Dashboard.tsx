import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { daysLeft } from '@/lib/format'
import { fetchEvents } from '@/lib/events-service'
import { fetchTasks } from '@/lib/tasks-service'
import { fetchClients } from '@/lib/clients-service'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Client } from '@/data/clients'

type StoryTag = 'urgente' | 'corso' | 'buona' | 'attesa'
type Category = 'eventi' | 'task' | 'clienti'

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
  const { resolved, toggleTheme } = useTheme()

  const [liveTasks, setLiveTasks] = useState<Task[]>([])
  const [liveEvents, setLiveEvents] = useState<Event[]>([])
  const [liveClients, setLiveClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'tutto' | Category>('tutto')
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    async function load() {
      const [ev, tk, cl] = await Promise.all([fetchEvents(), fetchTasks(), fetchClients()])
      setLiveEvents(ev)
      setLiveTasks(tk)
      setLiveClients(cl)
      setLoading(false)
    }
    load()
    const clock = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(clock)
  }, [])

  const firstName = currentUser?.first_name ?? currentUser?.nome?.split(' ')[0] ?? ''

  const eventById = useMemo(() => {
    const map = new Map<string, Event>()
    liveEvents.forEach(e => map.set(e.id, e))
    return map
  }, [liveEvents])

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
          meta: `${ritardo}g di ritardo · ${t.assegnatario || 'non assegnato'}`,
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
          meta: `responsabile ${e.responsabile || '—'} · budget €${(e.budget / 1000).toFixed(0)}K`,
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
          meta: `scade tra ${dl === 0 ? 'oggi' : dl === 1 ? '1 giorno' : `${dl} giorni`} · ${t.assegnatario || 'non assegnato'}`,
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
          meta: `${t.assegnatario || 'team'} · ${timeAgoLabel(Math.abs(daysLeft(t.scadenza)))}`,
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

    return items.sort((a, b) => b.score - a.score)
  }, [liveTasks, liveEvents, liveClients, eventById, navigate])

  const filteredStories = tab === 'tutto' ? stories : stories.filter(s => s.category === tab)

  const kpi = useMemo(() => {
    const taskAperti = liveTasks.filter(t => t.stato !== 'completato').length
    const eventiImminenti = liveEvents.filter(e => {
      const dl = daysLeft(e.dataInizio)
      return dl >= 0 && dl <= 14 && e.stato !== 'completato'
    }).length
    const clientiAttivi = liveClients.filter(c => c.stato === 'attivo' || c.stato === 'vip').length
    return { taskAperti, eventiImminenti, clientiAttivi }
  }, [liveTasks, liveEvents, liveClients])

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
    <div className="wire-page">
      <div className="wire-masthead">
        <span className="wire-masthead-title">SIMMETRIA WIRE{firstName ? ` — ${firstName.toUpperCase()}` : ''}</span>
        <div className="wire-masthead-right">
          <span className="wire-clock">
            {now.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()} · {now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button onClick={toggleTheme} className="wire-theme-toggle" title={resolved === 'dark' ? 'Passa a Light' : 'Passa a Dark'}>
            {resolved === 'dark' ? <Moon size={13} style={{ color: 'var(--blue)' }} /> : <Sun size={13} style={{ color: 'var(--yellow)' }} />}
          </button>
        </div>
      </div>

      <div className="wire-ticker">
        <span><strong>{kpi.taskAperti}</strong> task aperti</span>
        <span><strong>{kpi.eventiImminenti}</strong> eventi nei prossimi 14 giorni</span>
        <span><strong>{kpi.clientiAttivi}</strong> clienti attivi</span>
      </div>

      <div className="wire-tabs">
        {(['tutto', 'eventi', 'task', 'clienti'] as const).map(t => (
          <button
            key={t}
            className={`wire-tab ${tab === t ? 'wire-tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {filteredStories.length === 0 ? (
        <div className="wire-empty">Nessuna notizia in questa sezione, per ora.</div>
      ) : (
        filteredStories.map((s, i) => (
          <button
            key={s.id}
            className="wire-story"
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
        ))
      )}
    </div>
  )
}
