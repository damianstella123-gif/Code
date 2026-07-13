import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Calendar,
  Search,
  X,
  ArrowLeft,
  Plus,
  Edit3,
  Trash2,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { loadTasksFromStorage, cacheEventsSnapshot, loadWorkflowsFromStorage } from '@/lib/storage'
import { fetchEvents, upsertEvent, updateEvent as updateEventRemote, deleteEvent as deleteEventRemote } from '@/lib/events-service'
import { fetchTasksByEvent } from '@/lib/tasks-service'
import { fetchSuppliers } from '@/lib/suppliers-service'
import { fetchBudgets } from '@/lib/budgets-service'
import { fetchCommunications } from '@/lib/communications-service'
import { fetchClients as fetchClientsService } from '@/lib/clients-service'
import type { Client } from '@/data/clients'
import { fetchAllProfiles } from '@/lib/profiles'
import { useRealtimeTable } from '@/lib/use-realtime'
import TabBudget from '@/components/TabBudget'
import TabPagamenti from '@/components/TabPagamenti'
import { useToast } from '@/lib/toast'
import { setFlyContext } from '@/lib/fly'
import { daysLeft, fmtShort, toISO } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Supplier } from '@/data/suppliers'
import type { Messaggio } from '@/data/comunicazioni'
import type { Uscita } from '@/data/amministrazione'
import type { EventoWorkflow } from '@/data/workflow'
import type { StatoEvento, TabId, InternalUser } from './eventi/shared-types'
import { EventFormModal } from './eventi/EventFormModal'
import { DeleteConfirm } from './eventi/DeleteConfirm'
import { TabOverview } from './eventi/tabs/TabOverview'
import { TabFornitori } from './eventi/tabs/TabFornitori'
import { TabProgramma } from './eventi/tabs/TabProgramma'
import { TabDocumenti } from './eventi/tabs/TabDocumenti'
import { TabComunicazioni } from './eventi/tabs/TabComunicazioni'
import { TabTimeline } from './eventi/tabs/TabTimeline'
import { TabGreenReport } from './eventi/tabs/TabGreenReport'

const STATI = ['Tutti', 'bozza', 'pianificazione', 'in_corso', 'completato']

function statoColor(stato: string) {
  switch (stato) {
    case 'in_corso': return 'var(--red2)'
    case 'pianificazione': return 'var(--blue)'
    case 'completato': return 'var(--green)'
    case 'bozza': return 'var(--yellow)'
    default: return 'var(--muted)'
  }
}

function statoLabel(stato: string) {
  switch (stato) {
    case 'in_corso': return 'In Corso'
    case 'pianificazione': return 'Pianificazione'
    case 'completato': return 'Completato'
    case 'bozza': return 'Bozza'
    default: return stato
  }
}

function getVisibleEvents(_ruolo: string, _userId: string, eventList: Event[]): Event[] {
  return eventList
}

// ─── EventStatusBar ─────────────────────────────────────────────────────────

function EventStatusBar({ event, days, isLive, isOver, progressPct, totalTasks, suppliersCount }: {
  event: Event; days: number; isLive: boolean; isOver: boolean; progressPct: number; totalTasks: number; suppliersCount: number
}) {
  const urgency = isOver ? 'over' : isLive ? 'critico' : days <= 7 ? 'critico' : days <= 30 ? 'attenzione' : 'ok'
  const countdownLabel = isOver ? 'CONCLUSO' : isLive ? 'LIVE' : days === 0 ? 'OGGI' : `T-${days}`
  const countdownColor = urgency === 'critico' ? 'var(--red2)' : urgency === 'attenzione' ? 'var(--yellow)' : urgency === 'over' ? 'var(--muted)' : 'var(--green)'
  const countdownBg = urgency === 'critico' ? 'rgba(200,25,46,0.1)' : urgency === 'attenzione' ? 'rgba(234,179,8,0.1)' : urgency === 'over' ? 'rgba(128,128,128,0.08)' : 'rgba(47,168,107,0.1)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0 14px', borderBottom: '1px solid var(--line)', marginBottom: 16, flexWrap: 'wrap' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: countdownColor, background: countdownBg, padding: '3px 10px', borderRadius: 99 }}>
        {countdownLabel}
      </div>

      {totalTasks > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 72, height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: progressPct === 100 ? 'var(--green)' : 'var(--red2)', borderRadius: 2, transition: 'width 0.5s ease' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{progressPct}% task</span>
        </div>
      )}

      {(event as any).budget > 0 && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
          Budget: <strong style={{ color: 'var(--text)' }}>{((event as any).budget || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</strong>
        </span>
      )}

      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
        {suppliersCount} fornitori{(event as any).pax ? ` \u00B7 ${(event as any).pax} pax` : ''}
      </span>
    </div>
  )
}

// ─── BudgetTabContainer ──────────────────────────────────────────────────────

function BudgetTabContainer({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  return <TabBudget event={event} suppliers={suppliers} />
}

// ─── EventDetail ─────────────────────────────────────────────────────────────

interface EventDetailProps {
  event: Event
  onBack: () => void
  onEdit: (event: Event) => void
  onDelete: (event: Event) => void
  onStatusChange: (event: Event, newStato: StatoEvento) => void
  budgets: Uscita[]
  suppliers: Supplier[]
  comunicazioni: Messaggio[]
  internalUsers: InternalUser[]
  clients: Client[]
  onSuppliersChanged: () => void
}

function EventDetail({ event, onBack, onEdit, onDelete, onStatusChange, budgets, suppliers, comunicazioni, internalUsers, clients, onSuppliersChanged }: EventDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [eventTasks, setEventTasks] = useState<Task[]>([])
  const navigateRouter = useNavigate()
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  const navigateToCrm = (clientName: string) => {
    navigateRouter(`/crm?client=${encodeURIComponent(clientName)}`)
  }

  useEffect(() => { fetchTasksByEvent(event.id).then(setEventTasks) }, [event.id])

  useEffect(() => {
    const handler = (ev: globalThis.Event) => setActiveTab((ev as CustomEvent).detail as TabId)
    window.addEventListener('set-event-tab', handler)
    return () => window.removeEventListener('set-event-tab', handler)
  }, [])

  const eventMsg = comunicazioni.filter(m => m.eventoId === event.id)
  const eventSuppliers = suppliers.filter(s => s.eventiId.includes(event.id))

  const completedTasks = eventTasks.filter(t => t.stato === 'completato').length
  const totalTasks = eventTasks.length
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  const days = daysLeft(event.dataInizio)
  const isOver = daysLeft(event.dataFine) < 0

  const statiSequenza: StatoEvento[] = ['bozza', 'pianificazione', 'in_corso', 'completato']
  const currentIdx = statiSequenza.indexOf(event.stato)

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Panoramica' },
    { id: 'fornitori', label: `Fornitori${eventSuppliers.length > 0 ? ` (${eventSuppliers.length})` : ''}` },
    { id: 'programma', label: 'Programma' },
    { id: 'budget', label: 'Budget' },
    { id: 'pagamenti', label: 'Pagamenti' },
    { id: 'documenti', label: 'Documenti' },
    { id: 'comunicazioni', label: `Comunicazioni${eventMsg.length > 0 ? ` (${eventMsg.length})` : ''}` },
    { id: 'green', label: 'Green Report' },
    { id: 'timeline', label: 'Timeline' },
  ]

  const daysEnd = daysLeft(event.dataFine)
  const isLive = days <= 0 && daysEnd >= 0
  let countdownLabel: string
  let countdownColor: string
  if (isOver) { countdownLabel = '\u2014'; countdownColor = 'var(--muted)' }
  else if (isLive) { countdownLabel = 'LIVE'; countdownColor = 'var(--red2)' }
  else { countdownLabel = days === 0 ? 'OGGI' : days === 1 ? 'DOMANI' : `tra ${days}gg`; countdownColor = days <= 7 ? 'var(--red2)' : 'var(--muted)' }

  const statoBadge = (() => {
    switch (event.stato) {
      case 'in_corso': return { color: '#fff', bg: 'var(--red2)' }
      case 'pianificazione': return { color: 'var(--blue)', bg: 'color-mix(in srgb, var(--blue) 12%, transparent)' }
      case 'completato': return { color: 'var(--green)', bg: 'color-mix(in srgb, var(--green) 12%, transparent)' }
      default: return { color: 'var(--muted)', bg: 'var(--line)' }
    }
  })()

  const clienteObj = clients.find(c => c.id === event.cliente)
  const responsabileObj = internalUsers.find(u => u.id === event.responsabile)
  const progressColor = progress >= 80 ? 'var(--green)' : progress >= 50 ? 'var(--blue)' : 'var(--red2)'

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1100px' }}>
      {/* Wire Editorial Header */}
      <div style={{ paddingBottom: '20px', marginBottom: '20px', borderBottom: '1.5px solid var(--text)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--muted)' }}>
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 600,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              padding: '3px 8px', borderRadius: '4px',
              color: statoBadge.color, background: statoBadge.bg,
            }}>
              {statoLabel(event.stato)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
              color: countdownColor,
              animation: isLive ? 'wireLivePulse 2.2s ease-in-out infinite' : undefined,
            }}>
              {countdownLabel}
            </span>
            <button onClick={() => onEdit(event)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '10px', transition: 'color 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--red2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(event)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '10px', transition: 'color 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--red2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, margin: '0 0 8px 0' }}>
          {event.nome}
        </h1>

        <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 8px 0', lineHeight: 1.5 }}>
          {event.location}
          {clienteObj ? ` \u00B7 ${clienteObj.nome}` : ''}
          {' \u00B7 '}{event.partecipanti} partecipanti
          {' \u00B7 '}{fmtShort(event.dataInizio)} - {fmtShort(event.dataFine)}
        </p>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{'\u20AC'}{event.budget.toLocaleString('it-IT')}</span>
          {responsabileObj && <span>{' \u00B7 '}{responsabileObj.nome}</span>}
          {totalTasks > 0 && <span>{' \u00B7 '}{progress}% completato</span>}
        </div>

        {/* Status change strip */}
        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto' }}>
          {statiSequenza.map((s, i) => (
            <button key={s} onClick={() => onStatusChange(event, s)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.04em',
                padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                background: i <= currentIdx ? (i === currentIdx ? statoColor(s) : `color-mix(in srgb, ${statoColor(s)} 15%, transparent)`) : 'var(--line)',
                color: i === currentIdx ? '#fff' : i < currentIdx ? statoColor(s) : 'var(--muted)',
                fontWeight: i === currentIdx ? 700 : 500,
                transition: 'all 0.12s ease',
              }}>
              {statoLabel(s)}
            </button>
          ))}
        </div>

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', borderRadius: '2px', background: progressColor, transition: 'width 0.3s ease' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', flexShrink: 0 }}>{completedTasks}/{totalTasks}</span>
          </div>
        )}
      </div>

      {/* Wire Tabs */}
      <div ref={tabsContainerRef} className="event-detail-tabs" style={{ display: 'flex', gap: '18px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '0', paddingBottom: '8px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={(e) => {
            setActiveTab(tab.id);
            (e.currentTarget as HTMLElement).scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
          }}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em',
              background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              padding: '12px 12px', position: 'relative', minHeight: '44px', flexShrink: 0,
              color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
              opacity: activeTab === tab.id ? 1 : 0.6,
              fontWeight: activeTab === tab.id ? 600 : 400,
              borderBottom: activeTab === tab.id ? '2px solid var(--red2)' : '2px solid transparent',
              transition: 'all 0.12s ease',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Event Status Bar */}
      <EventStatusBar event={event} days={days} isLive={isLive} isOver={isOver} progressPct={progress} totalTasks={totalTasks} suppliersCount={eventSuppliers.length} />

      {/* Tab Content */}
      <div key={activeTab} className="animate-fade-in">
        {activeTab === 'overview' && (
          <TabOverview event={event} progress={progress} completedTasks={completedTasks} totalTasks={totalTasks} budgets={budgets} clients={clients} onClientClick={navigateToCrm} internalUsers={internalUsers} />
        )}
        {activeTab === 'fornitori' && <TabFornitori event={event} suppliers={suppliers} onSuppliersChanged={onSuppliersChanged} />}
        {activeTab === 'budget' && <BudgetTabContainer event={event} suppliers={suppliers} />}
        {activeTab === 'pagamenti' && <TabPagamenti event={event} suppliers={suppliers} />}
        {activeTab === 'comunicazioni' && <TabComunicazioni event={event} comunicazioni={comunicazioni} />}
        {activeTab === 'documenti' && <TabDocumenti event={event} />}
        {activeTab === 'programma' && <TabProgramma event={event} suppliers={suppliers} />}
        {activeTab === 'green' && <TabGreenReport event={event} suppliers={suppliers} />}
        {activeTab === 'timeline' && <TabTimeline event={event} />}
      </div>
    </div>
  )
}

// ─── Workflow auto-creation ──────────────────────────────────────────────────

const WF_KEY = 'simmetria_workflows'

function createWorkflowForEvent(event: Event) {
  const existing: EventoWorkflow[] = loadWorkflowsFromStorage()
  if (existing.some(w => w.eventoId === event.id)) return
  const now = toISO(new Date())
  const wf: EventoWorkflow = {
    id: `wf_${event.id}`,
    eventoId: event.id,
    faseCorrenteOrdine: 1,
    fasi: [
      { id: `f1_${event.id}`, ordine: 1, nome: 'Evento Creato', descrizione: 'Evento registrato nel sistema', stato: 'completata', responsabileId: event.responsabile, taskIds: [], taskCriticiIds: [], deadline: now, avanzamento: 100, log: [], fornitoriIds: [], note: '' },
      { id: `f2_${event.id}`, ordine: 2, nome: 'Pianificazione', descrizione: 'Definizione dettagli operativi, team e fornitori', stato: 'in_attesa', responsabileId: event.responsabile, taskIds: [], taskCriticiIds: [], deadline: event.dataInizio, avanzamento: 0, log: [], fornitoriIds: [], note: '' },
      { id: `f3_${event.id}`, ordine: 3, nome: 'Operativo', descrizione: 'Produzione, allestimenti e coordinamento', stato: 'in_attesa', responsabileId: event.responsabile, taskIds: [], taskCriticiIds: [], deadline: event.dataInizio, avanzamento: 0, log: [], fornitoriIds: [], note: '' },
      { id: `f4_${event.id}`, ordine: 4, nome: 'Chiusura', descrizione: 'Rendiconto, fatturazione e feedback', stato: 'in_attesa', responsabileId: event.responsabile, taskIds: [], taskCriticiIds: [], deadline: event.dataFine, avanzamento: 0, log: [], fornitoriIds: [], note: '' },
    ],
    creatoIl: now,
    aggiornatoIl: now,
  }
  const updated = [...existing, wf]
  try { localStorage.setItem(WF_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
}

// ─── Events list page ─────────────────────────────────────────────────────────

export default function Eventi() {
  const currentUser = loadUser()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [eventList, setEventList] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [search, setSearch] = useState('')
  const [filterStato, setFilterStato] = useState('Tutti')
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | undefined>(undefined)
  const [deletingEvent, setDeletingEvent] = useState<Event | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [budgets, setBudgets] = useState<Uscita[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [comunicazioni, setComunicazioni] = useState<Messaggio[]>([])
  const [internalUsers, setInternalUsers] = useState<InternalUser[]>([])
  const [clientsList, setClientsList] = useState<Client[]>([])

  useEffect(() => {
    let cancelled = false
    fetchEvents().then(remote => {
      if (cancelled) return
      setEventList(remote)
      cacheEventsSnapshot(remote)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useRealtimeTable('events', () => {
    fetchEvents().then(remote => { setEventList(remote); cacheEventsSnapshot(remote) })
  })

  useEffect(() => {
    setFlyContext({
      page: 'eventi',
      eventId: selectedEvent?.id ?? undefined,
      clientId: selectedEvent?.cliente ?? undefined,
    })
    return () => { setFlyContext({ page: 'eventi', eventId: undefined, clientId: undefined }) }
  }, [selectedEvent])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchBudgets(),
      fetchSuppliers(),
      fetchCommunications(),
      fetchClientsService(),
    ]).then(([budgetsData, suppliersData, comunicazioniData, clientsData]) => {
      if (cancelled) return
      setBudgets(budgetsData)
      setSuppliers(suppliersData)
      setComunicazioni(comunicazioniData)
      setClientsList(clientsData)
    }).catch(err => {
      console.error('Error loading data:', err)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    fetchAllProfiles().then(profiles => {
      setInternalUsers(profiles.filter(p => p.is_active).map(p => ({
        id: p.id,
        nome: `${p.first_name} ${p.last_name}`.trim() || p.email,
        avatar: p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.first_name}`,
      })))
    })
  }, [])

  useEffect(() => {
    const targetId = searchParams.get('id')
    if (!targetId || eventList.length === 0) return
    const found = eventList.find(e => e.id === targetId)
    if (found) {
      setSelectedEvent(found)
      setSearchParams({}, { replace: true })
    }
  }, [eventList, searchParams, setSearchParams])

  useEffect(() => {
    if (!errorMessage) return
    const t = setTimeout(() => setErrorMessage(null), 4000)
    return () => clearTimeout(t)
  }, [errorMessage])

  const refreshEvents = useCallback(async () => {
    const remote = await fetchEvents()
    setEventList(remote)
    cacheEventsSnapshot(remote)
    return remote
  }, [])

  const handleSave = useCallback(async (event: Event) => {
    const isEdit = eventList.some(e => e.id === event.id)
    const saved = await upsertEvent(event)
    if (!saved) {
      setErrorMessage(isEdit ? 'Salvataggio modifica fallito. Riprova.' : 'Creazione evento fallita. Riprova.')
      return
    }
    if (!isEdit) {
      createWorkflowForEvent(saved)
    }
    const remote = await refreshEvents()
    setShowForm(false)
    setEditingEvent(undefined)
    if (selectedEvent && selectedEvent.id === saved.id) {
      const fresh = remote.find(e => e.id === saved.id) ?? saved
      setSelectedEvent(fresh)
    }
  }, [eventList, refreshEvents, selectedEvent])

  const handleDelete = useCallback(async (event: Event) => {
    const ok = await deleteEventRemote(event.id)
    if (!ok) {
      setErrorMessage('Eliminazione evento fallita. Riprova.')
      return
    }
    await refreshEvents()
    setDeletingEvent(null)
    setSelectedEvent(null)
  }, [refreshEvents])

  const handleStatusChange = useCallback(async (event: Event, newStato: StatoEvento) => {
    const remote = await updateEventRemote(event.id, { stato: newStato })
    if (!remote) {
      setErrorMessage('Aggiornamento stato fallito. Riprova.')
      return
    }
    if (newStato === 'completato') {
      showToast(`\ud83c\udf89 Evento completato! Ottimo lavoro su ${event.nome}`, 'success')
    }
    const refreshed = await refreshEvents()
    if (selectedEvent && selectedEvent.id === event.id) {
      const fresh = refreshed.find(e => e.id === event.id) ?? remote
      setSelectedEvent(fresh)
    }
  }, [refreshEvents, selectedEvent, showToast])

  const visibleEvents = useMemo(() => {
    if (!currentUser) return []
    return getVisibleEvents(currentUser.ruolo, currentUser.id, eventList)
  }, [currentUser, eventList])

  const filtered = useMemo(() => {
    return visibleEvents.filter(e => {
      const matchSearch = search === '' ||
        e.nome.toLowerCase().includes(search.toLowerCase()) ||
        e.location.toLowerCase().includes(search.toLowerCase())
      const matchStato = filterStato === 'Tutti' || e.stato === filterStato
      return matchSearch && matchStato
    }).sort((a, b) => (a.dataInizio || '').localeCompare(b.dataInizio || ''))
  }, [visibleEvents, search, filterStato])

  const overlays = (
    <>
      {showForm && (
        <EventFormModal
          event={editingEvent}
          internalUsers={internalUsers}
          allClients={clientsList}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingEvent(undefined) }}
        />
      )}
      {deletingEvent && (
        <DeleteConfirm
          eventName={deletingEvent.nome}
          onConfirm={() => handleDelete(deletingEvent)}
          onCancel={() => setDeletingEvent(null)}
        />
      )}
      {errorMessage && (
        <div
          className="fixed top-6 right-6 z-[60] px-4 py-3 rounded-xl text-sm font-medium shadow-sm"
          style={{ background: 'var(--panel-solid)', border: '1px solid var(--red2)', color: 'var(--red2)' }}
        >
          {errorMessage}
        </div>
      )}
    </>
  )

  if (selectedEvent) {
    const liveEvent = eventList.find(e => e.id === selectedEvent.id) ?? selectedEvent
    return (
      <>
        {overlays}
        <EventDetail
          event={liveEvent}
          onBack={() => setSelectedEvent(null)}
          onEdit={(evt) => { setEditingEvent(evt); setShowForm(true) }}
          onDelete={(evt) => setDeletingEvent(evt)}
          onStatusChange={handleStatusChange}
          budgets={budgets}
          suppliers={suppliers}
          comunicazioni={comunicazioni}
          internalUsers={internalUsers}
          clients={clientsList}
          onSuppliersChanged={() => fetchSuppliers().then(setSuppliers)}
        />
      </>
    )
  }

  const statoBadgeStyle = (stato: string): React.CSSProperties => {
    switch (stato) {
      case 'in_corso': return { color: '#fff', background: 'var(--red2)' }
      case 'pianificazione': return { color: 'var(--blue)', background: 'color-mix(in srgb, var(--blue) 12%, transparent)' }
      case 'completato': return { color: 'var(--green)', background: 'color-mix(in srgb, var(--green) 12%, transparent)' }
      default: return { color: 'var(--muted)', background: 'var(--line)' }
    }
  }

  return (
    <div className="wire-page" style={{ maxWidth: '1100px' }}>
      {overlays}

      <div className="wire-masthead">
        <span className="wire-masthead-title">EVENTI — {filtered.length} VISIBILI</span>
        <button onClick={() => { setEditingEvent(undefined); setShowForm(true) }}
          className="wire-theme-toggle" style={{ borderRadius: '8px' }} data-onboarding="new-event">
          <Plus className="w-3.5 h-3.5" style={{ color: 'var(--text)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)' }}>Nuovo evento</span>
        </button>
      </div>

      <div className="wire-ticker">
        <span><strong>{visibleEvents.length}</strong> totali</span>
        <span><strong>{visibleEvents.filter(e => e.stato === 'in_corso').length}</strong> in corso</span>
        <span><strong>{visibleEvents.filter(e => e.stato === 'pianificazione').length}</strong> in pianificazione</span>
        <span><strong>{visibleEvents.filter(e => e.stato === 'completato').length}</strong> completati</span>
      </div>

      <div className="wire-tabs" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
        {STATI.map(stato => (
          <button key={stato} onClick={() => setFilterStato(stato)}
            className={`wire-tab ${filterStato === stato ? 'wire-tab--active' : ''}`}>
            {stato === 'Tutti' ? 'Tutti' : statoLabel(stato)}
          </button>
        ))}
        <div style={{ flex: 1, minWidth: '160px', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input type="text" placeholder="Cerca evento o location..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent focus:outline-none"
            style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }} />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </button>
          )}
          {!search && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Usa Fly ↑ per domande complesse</span>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="wire-empty">
          <Calendar className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>Nessun evento trovato</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px', marginTop: '18px' }}>
          {filtered.map((event) => {
            const cliente = clientsList.find(c => c.id === event.cliente)
            const allTasks = loadTasksFromStorage()
            const eventTaskList = allTasks.filter(t => t.evento === event.id)
            const completedCount = eventTaskList.filter(t => t.stato === 'completato').length
            const progressPct = eventTaskList.length > 0
              ? Math.round((completedCount / eventTaskList.length) * 100) : 0
            const days = daysLeft(event.dataInizio)
            const daysEnd = daysLeft(event.dataFine)
            const isLive = days <= 0 && daysEnd >= 0
            const isOver = daysEnd < 0

            let countdownLabel: string
            let countdownColor: string
            if (isOver) { countdownLabel = '\u2014'; countdownColor = 'var(--muted)' }
            else if (isLive) { countdownLabel = 'LIVE'; countdownColor = 'var(--red2)' }
            else { countdownLabel = days === 0 ? 'OGGI' : days === 1 ? 'DOMANI' : `tra ${days}gg`; countdownColor = days <= 7 ? 'var(--red2)' : 'var(--muted)' }

            const progressColor = progressPct >= 80 ? 'var(--green)' : progressPct >= 50 ? 'var(--blue)' : 'var(--red2)'

            return (
              <div
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                style={{
                  background: 'var(--panel-solid)',
                  border: '1px solid var(--line)',
                  borderRadius: '14px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 600,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    padding: '3px 8px', borderRadius: '4px',
                    ...statoBadgeStyle(event.stato),
                  }}>
                    {statoLabel(event.stato)}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
                    color: countdownColor,
                    animation: isLive ? 'wireLivePulse 2.2s ease-in-out infinite' : undefined,
                  }}>
                    {countdownLabel}
                  </span>
                </div>

                <p style={{
                  fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600,
                  color: 'var(--text)', lineHeight: 1.3, margin: 0,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {event.nome}
                </p>

                <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, lineHeight: 1.4 }}>
                  {event.location}{cliente ? ` · ${cliente.nome}` : ''}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--muted)' }}>
                  <span>{fmtShort(event.dataInizio)}{event.dataFine && event.dataFine !== event.dataInizio ? ` - ${fmtShort(event.dataFine)}` : ''}</span>
                  <span>{event.partecipanti} pax</span>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{'\u20AC'}{Math.round(event.budget / 1000)}K</span>
                </div>

                {eventTaskList.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--line)', overflow: 'hidden' }}>
                      <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: '2px', background: progressColor, transition: 'width 0.3s ease' }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', flexShrink: 0 }}>{progressPct}%</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
