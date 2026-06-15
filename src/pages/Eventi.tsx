import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Calendar,
  MapPin,
  Users,
  CheckSquare,
  Truck,
  Clock,
  ChevronRight,
  Search,
  X,
  ArrowLeft,
  TrendingUp,
  AlertCircle,
  Euro,
  MessageSquare,
  GitBranch,
  Palette,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Zap,
  Plus,
  Edit3,
  Trash2,
  Package,
  Upload,
  Plus as PlusIcon,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { loadTasksFromStorage, cacheEventsSnapshot } from '@/lib/storage'
import { fetchEvents, upsertEvent, updateEvent as updateEventRemote, deleteEvent as deleteEventRemote } from '@/lib/events-service'
import { fetchSuppliers } from '@/lib/suppliers-service'
import { fetchBudgets, upsertBudget, deleteBudget } from '@/lib/budgets-service'
import { fetchCommunications } from '@/lib/communications-service'
import { fetchPackagesByEvent, upsertClientPackage, updateClientPackage, deleteClientPackage, uploadPackageFile, type ClientPackage } from '@/lib/packages-service'
import { fetchCreativeProjects, type CreativeProject } from '@/lib/creative-service'
import { fetchSocialContents, type SocialContent } from '@/lib/social-service'
import { fetchClients as fetchClientsService } from '@/lib/clients-service'
import type { Client } from '@/data/clients'
import { fetchAllProfiles } from '@/lib/profiles'
import { supabase } from '@/lib/supabase'
import { daysLeft, fmtShort, fmtLong } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Supplier } from '@/data/suppliers'
import type { Messaggio } from '@/data/comunicazioni'
import type { Uscita } from '@/data/amministrazione'

const STATI = ['Tutti', 'bozza', 'pianificazione', 'in_corso', 'completato']
type StatoEvento = Event['stato']

type TabId = 'overview' | 'task' | 'team' | 'fornitori' | 'budget' | 'comunicazioni' | 'timeline' | 'creative' | 'social' | 'presentazioni' | 'pacchetto'

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

function getVisibleEvents(ruolo: string, userId: string, eventList: Event[]): Event[] {
  switch (ruolo) {
    case 'Admin':
    case 'Partner':
    case 'Finance':
    case 'Commerciale':
      return eventList
    case 'Manager':
    case 'Operativo':
    case 'Fornitore':
    default:
      return eventList.filter(e => e.team.includes(userId) || e.responsabile === userId)
  }
}

function getTimeline(event: Event) {
  const start = new Date(event.dataInizio)
  const end = new Date(event.dataFine)
  const now = new Date()
  return [
    { label: 'Avvio Pianificazione', date: new Date(start.getTime() - 60 * 86400000), done: now > new Date(start.getTime() - 60 * 86400000) },
    { label: 'Conferma Fornitori', date: new Date(start.getTime() - 30 * 86400000), done: now > new Date(start.getTime() - 30 * 86400000) },
    { label: 'Briefing Team', date: new Date(start.getTime() - 7 * 86400000), done: now > new Date(start.getTime() - 7 * 86400000) },
    { label: 'Inizio Evento', date: start, done: now >= start, current: now >= start && now <= end },
    { label: 'Fine Evento', date: end, done: now > end },
    { label: 'Report & Fatturazione', date: new Date(end.getTime() + 7 * 86400000), done: now > new Date(end.getTime() + 7 * 86400000) },
  ]
}

// ─── Event Form Modal ─────────────────────────────────────────────────────────

interface InternalUser {
  id: string
  nome: string
  avatar: string
}

function EventFormModal({ event, internalUsers, clients, onSave, onCancel }: {
  event?: Event
  internalUsers: InternalUser[]
  clients: { id: string; nome: string }[]
  onSave: (e: Event) => void
  onCancel: () => void
}) {
  const [nome, setNome] = useState(event?.nome ?? '')
  const [descrizione, setDescrizione] = useState(event?.descrizione ?? '')
  const [cliente, setCliente] = useState(event?.cliente ?? '')
  const [dataInizio, setDataInizio] = useState(event?.dataInizio ?? '')
  const [dataFine, setDataFine] = useState(event?.dataFine ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [budget, setBudget] = useState(event?.budget?.toString() ?? '')
  const [stato, setStato] = useState<StatoEvento>(event?.stato ?? 'bozza')
  const [partecipanti, setPartecipanti] = useState(event?.partecipanti?.toString() ?? '')
  const [responsabile, setResponsabile] = useState(event?.responsabile ?? (loadUser()?.id ?? ''))
  const [teamIds, setTeamIds] = useState<string[]>(event?.team ?? [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !dataInizio || !location.trim()) return
    const newEvent: Event = {
      id: event?.id ?? `evt_${Date.now()}`,
      nome: nome.trim(),
      descrizione: descrizione.trim(),
      cliente,
      dataInizio,
      dataFine: dataFine || dataInizio,
      location: location.trim(),
      budget: parseInt(budget) || 0,
      stato,
      partecipanti: parseInt(partecipanti) || 0,
      responsabile,
      team: teamIds.length > 0 ? teamIds : (responsabile ? [responsabile] : []),
    }
    onSave(newEvent)
  }

  const toggleTeamMember = (id: string) => {
    setTeamIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
            {event ? 'Modifica Evento' : 'Nuovo Evento'}
          </h2>
          <button onClick={onCancel} className="p-2 rounded-lg transition-all hover:bg-white/5">
            <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Nome evento *</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} required
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
              placeholder="Es. Corporate Summit 2026" />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Descrizione</label>
            <textarea value={descrizione} onChange={e => setDescrizione(e.target.value)} rows={2}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Data inizio *</label>
              <input type="date" value={dataInizio} onChange={e => setDataInizio(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Data fine</label>
              <input type="date" value={dataFine} onChange={e => setDataFine(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Location *</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="Es. MiCo Milano" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Partecipanti</label>
              <input type="number" value={partecipanti} onChange={e => setPartecipanti(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Cliente</label>
              <select value={cliente} onChange={e => setCliente(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">— Nessuno —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Budget (EUR)</label>
              <input type="number" value={budget} onChange={e => setBudget(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Stato</label>
              <select value={stato} onChange={e => setStato(e.target.value as StatoEvento)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="bozza">Bozza</option>
                <option value="pianificazione">Pianificazione</option>
                <option value="in_corso">In Corso</option>
                <option value="completato">Completato</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Responsabile</label>
              <select value={responsabile} onChange={e => setResponsabile(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                {internalUsers.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--muted)' }}>Team</label>
            <div className="flex flex-wrap gap-2">
              {internalUsers.map(u => (
                <button key={u.id} type="button" onClick={() => toggleTeamMember(u.id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: teamIds.includes(u.id) ? 'rgba(208,0,58,0.12)' : 'var(--panel)',
                    color: teamIds.includes(u.id) ? 'var(--red2)' : 'var(--muted)',
                    border: `1px solid ${teamIds.includes(u.id) ? 'rgba(208,0,58,0.3)' : 'var(--line)'}`,
                  }}>
                  <img src={u.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                  {u.nome.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="submit" className="btn-primary flex-1 py-3 rounded-xl text-sm font-semibold">
              {event ? 'Salva Modifiche' : 'Crea Evento'}
            </button>
            <button type="button" onClick={onCancel}
              className="px-6 py-3 rounded-xl text-sm font-medium"
              style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────

function DeleteConfirm({ eventName, onConfirm, onCancel }: {
  eventName: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,49,95,0.12)' }}>
            <Trash2 className="w-5 h-5" style={{ color: 'var(--red2)' }} />
          </div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Elimina evento</h3>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
          Sei sicuro di voler eliminare <strong style={{ color: 'var(--text)' }}>"{eventName}"</strong>? Questa azione non può essere annullata.
        </p>
        <div className="flex gap-3">
          <button onClick={onConfirm}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'var(--red2)' }}>
            Elimina
          </button>
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-medium"
            style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab content components ───────────────────────────────────────────────────

function TabOverview({ event, progress, completedTasks, totalTasks, budgets, clients }: {
  event: Event
  progress: number
  completedTasks: number
  totalTasks: number
  budgets: Uscita[]
  clients: Client[]
}) {
  const eventUscite = budgets.filter(u => u.eventoId === event.id)
  const totUscite = eventUscite.reduce((s, u) => s + u.importo, 0)
  const speso = totUscite > 0 ? totUscite : Math.round(event.budget * 0.62)
  const residuo = event.budget - speso
  const usoPct = event.budget > 0 ? Math.round((speso / event.budget) * 100) : 0

  const cliente = clients.find(c => c.id === event.cliente)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cliente && (
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Cliente</p>
          <div>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>{cliente.nome}</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{cliente.settore}</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{cliente.referente}</p>
          </div>
        </div>
      )}

      <div className="panel p-5 md:col-span-2">
        <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Budget Overview</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Budget Totale', value: event.budget, color: 'var(--green)' },
            { label: 'Speso (est.)', value: speso, color: 'var(--yellow)' },
            { label: 'Residuo', value: residuo, color: residuo >= 0 ? 'var(--blue)' : 'var(--red2)' },
          ].map(item => (
            <div key={item.label} className="text-center p-4 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{item.label}</p>
              <p className="text-xl font-bold mt-1" style={{ color: item.color }}>
                €{item.value.toLocaleString('it-IT')}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="flex text-xs justify-between mb-1" style={{ color: 'var(--muted)' }}>
            <span>Utilizzo budget</span>
            <span>{usoPct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(usoPct, 100)}%`, background: usoPct > 90 ? 'var(--red2)' : usoPct > 70 ? 'var(--yellow)' : 'var(--blue)' }} />
          </div>
        </div>
      </div>

      {totalTasks > 0 && (
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Avanzamento Task</p>
          <div className="flex items-end gap-4">
            <div className="text-4xl font-bold" style={{ color: progress >= 80 ? 'var(--green)' : progress >= 50 ? 'var(--blue)' : 'var(--red2)' }}>
              {progress}%
            </div>
            <div className="flex-1 pb-1">
              <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>{completedTasks}/{totalTasks} completati</p>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${progress}%`, background: progress >= 80 ? 'var(--green)' : progress >= 50 ? 'var(--blue)' : 'var(--red2)' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel p-5">
        <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Flusso Finanziario</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4" style={{ color: 'var(--green)' }} />
              <span className="text-sm" style={{ color: 'var(--muted)' }}>Entrate previste</span>
            </div>
            <span className="font-semibold text-sm" style={{ color: 'var(--green)' }}>
              €{event.budget.toLocaleString('it-IT')}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--yellow)' }} />
              <span className="text-sm" style={{ color: 'var(--muted)' }}>Uscite stimate</span>
            </div>
            <span className="font-semibold text-sm" style={{ color: 'var(--yellow)' }}>
              €{speso.toLocaleString('it-IT')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TabTask({ event }: { event: Event }) {
  const [filter, setFilter] = useState<'tutti' | 'da_fare' | 'in_corso' | 'completato'>('tutti')
  const allTasks = loadTasksFromStorage()
  const eventTasks = allTasks.filter(t => t.evento === event.id)
  const filtered = filter === 'tutti' ? eventTasks : eventTasks.filter(t => t.stato === filter)

  const counts = {
    da_fare: eventTasks.filter(t => t.stato === 'da_fare').length,
    in_corso: eventTasks.filter(t => t.stato === 'in_corso').length,
    completato: eventTasks.filter(t => t.stato === 'completato').length,
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {([
          { id: 'tutti', label: `Tutti (${eventTasks.length})` },
          { id: 'da_fare', label: `Da fare (${counts.da_fare})` },
          { id: 'in_corso', label: `In corso (${counts.in_corso})` },
          { id: 'completato', label: `Completati (${counts.completato})` },
        ] as const).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filter === f.id ? 'rgba(208,0,58,0.12)' : 'var(--panel)',
              color: filter === f.id ? 'var(--red2)' : 'var(--muted)',
              border: `1px solid ${filter === f.id ? 'rgba(208,0,58,0.35)' : 'var(--line)'}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun task in questa categoria</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const dl = daysLeft(task.scadenza)
            const isOverdue = dl < 0
            const priColor = task.priorita === 'alta' ? 'var(--red2)' : task.priorita === 'media' ? 'var(--yellow)' : 'var(--muted)'
            const sColor = task.stato === 'completato' ? 'var(--green)' : task.stato === 'in_corso' ? 'var(--blue)' : 'var(--yellow)'
            const statoBg = task.stato === 'completato' ? 'rgba(56,210,125,0.12)' : task.stato === 'in_corso' ? 'rgba(77,180,255,0.12)' : 'rgba(255,194,75,0.12)'
            return (
              <div key={task.id} className="panel p-4 flex items-center gap-4">
                <div className="w-1.5 h-12 rounded-full flex-shrink-0" style={{ background: priColor }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{task.titolo}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{task.descrizione}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs px-2 py-1 rounded" style={{ background: statoBg, color: sColor }}>
                    {task.stato === 'da_fare' ? 'Da fare' : task.stato === 'in_corso' ? 'In corso' : 'Fatto'}
                  </span>
                  <span className="text-xs flex items-center gap-1"
                    style={{ color: isOverdue ? 'var(--red2)' : 'var(--muted)' }}>
                    <Clock className="w-3 h-3" />
                    {isOverdue ? `${Math.abs(dl)}gg ritardo` : `${dl}gg`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TabTeam({ event: _event }: { event: Event }) {
  return (
    <div className="space-y-4">
      <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Gestione team disponibile dal profilo utente</p>
      </div>
    </div>
  )
}

function TabFornitori({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const eventSuppliers = suppliers.filter(s => s.eventiId.includes(event.id))

  if (eventSuppliers.length === 0) {
    const fallback = suppliers.slice(0, event.stato === 'completato' ? 3 : 2)
    return <TabFornitoriList suppliers={fallback} />
  }
  return <TabFornitoriList suppliers={eventSuppliers} />
}

function TabFornitoriList({ suppliers: list }: { suppliers: Supplier[] }) {
  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun fornitore assegnato a questo evento</p>
        </div>
      ) : list.map(sup => (
        <div key={sup.id} className="panel p-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(208,0,58,0.1)' }}>
              <Truck className="w-6 h-6" style={{ color: 'var(--red2)' }} />
            </div>
            <div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>{sup.nome}</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{sup.categoria} · {sup.location}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {sup.servizi.slice(0, 3).map(s => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded"
                    style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>{s}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="flex items-center gap-1 justify-end">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full"
                  style={{ background: i < Math.round(sup.rating) ? 'var(--yellow)' : 'var(--line)' }} />
              ))}
              <span className="text-xs ml-1" style={{ color: 'var(--yellow)' }}>{sup.rating}</span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{sup.referente}</p>
            <span className="inline-block text-xs px-2 py-0.5 rounded mt-1"
              style={{
                background: sup.stato === 'attivo' ? 'rgba(56,210,125,0.15)' : 'rgba(155,163,170,0.15)',
                color: sup.stato === 'attivo' ? 'var(--green)' : 'var(--muted)',
              }}>
              {sup.stato === 'attivo' ? 'Confermato' : 'In attesa'}
            </span>
            <p className="text-xs mt-1.5"
              style={{
                color: sup.statoContratto === 'attivo' ? 'var(--green)' : sup.statoContratto === 'in_scadenza' ? 'var(--yellow)' : 'var(--red2)',
              }}>
              Contratto: {sup.statoContratto}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function TabBudget({ event, budgets, suppliers, onRefresh }: { event: Event; budgets: Uscita[]; suppliers: Supplier[]; onRefresh: () => void }) {
  const eventUscite = budgets.filter(u => u.eventoId === event.id)
  const totUscite = eventUscite.reduce((s, u) => s + (u.unitPrice !== null ? u.unitPrice * u.quantity : u.importo), 0)
  const margine = event.budget - totUscite
  const usoPct = event.budget > 0 ? Math.min(Math.round((totUscite / event.budget) * 100), 100) : 0
  const [editing, setEditing] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  async function handleAddRow() {
    const id = crypto.randomUUID()
    const newRow: Uscita = {
      id,
      fornitoreId: '',
      eventoId: event.id,
      categoria: '',
      importo: 0,
      quantity: 1,
      unitPrice: 0,
      stato: 'in_attesa',
      scadenza: new Date().toISOString().slice(0, 10),
      dataPagamento: null,
      note: '',
      fatturaId: null,
    }
    await upsertBudget(newRow)
    onRefresh()
    setEditing(id)
  }

  async function handleSaveRow(u: Uscita) {
    const importo = u.unitPrice !== null ? u.unitPrice * u.quantity : u.importo
    await upsertBudget({ ...u, importo })
    onRefresh()
    setEditing(null)
  }

  async function handleDeleteRow(id: string) {
    await deleteBudget(id)
    onRefresh()
  }

  async function exportXLSX() {
    setExporting(true)
    const XLSX = await import('xlsx')
    const rows: Record<string, string | number>[] = eventUscite.map(u => ({
      'Voce': u.note || u.categoria,
      'Fornitore': suppliers.find(s => s.id === u.fornitoreId)?.nome ?? '',
      'Quantita': u.quantity,
      'Prezzo Unitario': u.unitPrice ?? u.importo,
      'Totale Riga': u.unitPrice !== null ? u.unitPrice * u.quantity : u.importo,
      'Stato': u.stato,
      'Scadenza': u.scadenza,
    }))
    rows.push({ 'Voce': '', 'Fornitore': '', 'Quantita': '', 'Prezzo Unitario': '', 'Totale Riga': '', 'Stato': '', 'Scadenza': '' })
    rows.push({ 'Voce': 'TOTALE USCITE', 'Fornitore': '', 'Quantita': '', 'Prezzo Unitario': '', 'Totale Riga': totUscite, 'Stato': '', 'Scadenza': '' })
    rows.push({ 'Voce': 'BUDGET EVENTO', 'Fornitore': '', 'Quantita': '', 'Prezzo Unitario': '', 'Totale Riga': event.budget, 'Stato': '', 'Scadenza': '' })
    rows.push({ 'Voce': 'MARGINE', 'Fornitore': '', 'Quantita': '', 'Prezzo Unitario': '', 'Totale Riga': margine, 'Stato': '', 'Scadenza': '' })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Budget')
    XLSX.writeFile(wb, `Budget_${event.nome.replace(/\s+/g, '_')}.xlsx`)
    setExporting(false)
  }

  async function exportPDF() {
    setExporting(true)
    const jsPDFModule = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDFModule.default()
    doc.setFontSize(16)
    doc.text(`Budget - ${event.nome}`, 14, 20)
    doc.setFontSize(10)
    doc.text(`Budget totale: ${event.budget.toLocaleString('it-IT')} EUR | Uscite: ${totUscite.toLocaleString('it-IT')} EUR | Margine: ${margine.toLocaleString('it-IT')} EUR`, 14, 30)

    const tableData = eventUscite.map(u => [
      u.note || u.categoria,
      suppliers.find(s => s.id === u.fornitoreId)?.nome ?? '-',
      u.quantity.toString(),
      (u.unitPrice ?? u.importo).toLocaleString('it-IT') + ' EUR',
      (u.unitPrice !== null ? u.unitPrice * u.quantity : u.importo).toLocaleString('it-IT') + ' EUR',
      u.stato,
    ])
    autoTable(doc, {
      startY: 36,
      head: [['Voce', 'Fornitore', 'Qty', 'Prezzo Unit.', 'Totale', 'Stato']],
      body: tableData,
      foot: [['', '', '', 'TOTALE', totUscite.toLocaleString('it-IT') + ' EUR', '']],
    })
    doc.save(`Budget_${event.nome.replace(/\s+/g, '_')}.pdf`)
    setExporting(false)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Budget Totale', value: event.budget, color: 'var(--text)' },
          { label: 'Entrate Prev.', value: event.budget, color: 'var(--green)' },
          { label: 'Uscite', value: totUscite, color: 'var(--yellow)' },
          { label: 'Margine', value: margine, color: margine >= 0 ? 'var(--green)' : 'var(--red2)' },
        ].map(k => (
          <div key={k.label} className="panel p-4 text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{k.label}</p>
            <p className="text-xl font-bold mt-1" style={{ color: k.color }}>
              {'\u20AC'}{k.value.toLocaleString('it-IT')}
            </p>
          </div>
        ))}
      </div>

      <div className="panel p-5">
        <div className="flex justify-between text-xs mb-2">
          <span style={{ color: 'var(--muted)' }}>Utilizzo budget</span>
          <span style={{ color: usoPct > 90 ? 'var(--red2)' : 'var(--text)' }}>{usoPct}%</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${usoPct}%`, background: usoPct > 90 ? 'var(--red2)' : usoPct > 70 ? 'var(--yellow)' : 'var(--green)' }} />
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={handleAddRow}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          <Plus className="w-3.5 h-3.5" /> Aggiungi Voce
        </button>
        <button onClick={exportXLSX} disabled={exporting || eventUscite.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium disabled:opacity-40"
          style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <FileText className="w-3.5 h-3.5" /> Export XLSX
        </button>
        <button onClick={exportPDF} disabled={exporting || eventUscite.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium disabled:opacity-40"
          style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <FileText className="w-3.5 h-3.5" /> Export PDF
        </button>
      </div>

      {/* Budget table */}
      {eventUscite.length > 0 ? (
        <div className="panel rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--panel2)' }}>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--muted)' }}>Voce</th>
                  <th className="text-left px-3 py-2.5 font-semibold" style={{ color: 'var(--muted)' }}>Fornitore</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--muted)' }}>Qty</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--muted)' }}>Prezzo Unit.</th>
                  <th className="text-right px-3 py-2.5 font-semibold" style={{ color: 'var(--muted)' }}>Totale</th>
                  <th className="text-center px-3 py-2.5 font-semibold" style={{ color: 'var(--muted)' }}>Stato</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {eventUscite.map(u => (
                  <BudgetRow key={u.id} row={u} suppliers={suppliers}
                    isEditing={editing === u.id}
                    onEdit={() => setEditing(u.id)}
                    onSave={handleSaveRow}
                    onCancel={() => setEditing(null)}
                    onDelete={() => handleDeleteRow(u.id)} />
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td colSpan={4} className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--text)' }}>Totale Generale</td>
                  <td className="px-3 py-2.5 text-right font-bold" style={{ color: 'var(--yellow)' }}>
                    {'\u20AC'}{totUscite.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Euro className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessuna voce budget per questo evento</p>
          <p className="text-xs mt-1">Clicca "Aggiungi Voce" per iniziare</p>
        </div>
      )}
    </div>
  )
}

function BudgetRow({ row, suppliers, isEditing, onEdit, onSave, onCancel, onDelete }: {
  row: Uscita
  suppliers: Supplier[]
  isEditing: boolean
  onEdit: () => void
  onSave: (u: Uscita) => void
  onCancel: () => void
  onDelete: () => void
}) {
  const [local, setLocal] = useState(row)

  useEffect(() => { setLocal(row) }, [row])

  const rowTotal = local.unitPrice !== null ? local.unitPrice * local.quantity : local.importo

  if (!isEditing) {
    const sup = suppliers.find(s => s.id === row.fornitoreId)
    const total = row.unitPrice !== null ? row.unitPrice * row.quantity : row.importo
    return (
      <tr className="hover:bg-white/5 transition-colors" style={{ borderBottom: '1px solid var(--line)' }}>
        <td className="px-3 py-2.5" style={{ color: 'var(--text)' }}>{row.note || row.categoria || '-'}</td>
        <td className="px-3 py-2.5" style={{ color: 'var(--muted)' }}>{sup?.nome ?? '-'}</td>
        <td className="px-3 py-2.5 text-right" style={{ color: 'var(--text)' }}>{row.quantity}</td>
        <td className="px-3 py-2.5 text-right" style={{ color: 'var(--text)' }}>{'\u20AC'}{(row.unitPrice ?? row.importo).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
        <td className="px-3 py-2.5 text-right font-medium" style={{ color: 'var(--yellow)' }}>{'\u20AC'}{total.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
        <td className="px-3 py-2.5 text-center">
          <span className="text-xs px-1.5 py-0.5 rounded capitalize"
            style={{ background: row.stato === 'pagato' ? 'rgba(56,210,125,0.12)' : row.stato === 'scaduto' ? 'rgba(255,49,95,0.12)' : 'rgba(255,194,75,0.12)', color: row.stato === 'pagato' ? 'var(--green)' : row.stato === 'scaduto' ? 'var(--red2)' : 'var(--yellow)' }}>
            {row.stato.replace(/_/g, ' ')}
          </span>
        </td>
        <td className="px-2 py-2.5">
          <div className="flex gap-1">
            <button onClick={onEdit} className="p-1 rounded hover:bg-white/10"><Edit3 className="w-3 h-3" style={{ color: 'var(--muted)' }} /></button>
            <button onClick={onDelete} className="p-1 rounded hover:bg-white/10"><Trash2 className="w-3 h-3" style={{ color: 'var(--red2)' }} /></button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--line)', background: 'rgba(208,0,58,0.03)' }}>
      <td className="px-2 py-2">
        <input value={local.note} onChange={e => setLocal({ ...local, note: e.target.value })} placeholder="Descrizione voce"
          className="w-full px-2 py-1 rounded text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
      </td>
      <td className="px-2 py-2">
        <select value={local.fornitoreId} onChange={e => setLocal({ ...local, fornitoreId: e.target.value })}
          className="w-full px-2 py-1 rounded text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <option value="">-</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <input type="number" min="1" step="1" value={local.quantity} onChange={e => setLocal({ ...local, quantity: Number(e.target.value) || 1 })}
          className="w-16 px-2 py-1 rounded text-xs text-right" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
      </td>
      <td className="px-2 py-2">
        <input type="number" min="0" step="0.01" value={local.unitPrice ?? ''} onChange={e => setLocal({ ...local, unitPrice: Number(e.target.value) || 0 })}
          className="w-24 px-2 py-1 rounded text-xs text-right" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
      </td>
      <td className="px-3 py-2 text-right font-medium text-xs" style={{ color: 'var(--yellow)' }}>
        {'\u20AC'}{rowTotal.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
      </td>
      <td className="px-2 py-2">
        <select value={local.stato} onChange={e => setLocal({ ...local, stato: e.target.value as Uscita['stato'] })}
          className="w-full px-2 py-1 rounded text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <option value="in_attesa">In attesa</option>
          <option value="pagato">Pagato</option>
          <option value="scaduto">Scaduto</option>
          <option value="annullato">Annullato</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-1">
          <button onClick={() => onSave(local)} className="p-1 rounded hover:bg-white/10"><CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} /></button>
          <button onClick={onCancel} className="p-1 rounded hover:bg-white/10"><X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} /></button>
        </div>
      </td>
    </tr>
  )
}

function TabComunicazioni({ event, comunicazioni }: { event: Event; comunicazioni: Messaggio[] }) {
  const currentUser = loadUser()
  const userId = currentUser?.id ?? ''
  const evtMsg = comunicazioni.filter(m => m.eventoId === event.id)

  return (
    <div className="space-y-3">
      {evtMsg.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessuna comunicazione per questo evento</p>
        </div>
      ) : evtMsg.map(msg => {
        const unread = !msg.letto.includes(userId) && msg.destinatari.includes(userId)
        const priColor = msg.priorita === 'alta' ? 'var(--red2)' : msg.priorita === 'media' ? 'var(--yellow)' : 'var(--muted)'
        return (
          <div key={msg.id} className="panel p-5"
            style={{ border: unread ? '1px solid rgba(77,180,255,0.3)' : '1px solid var(--line)' }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: 'var(--panel2)' }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{msg.oggetto}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      Da: {msg.mittente} · {new Date(msg.data).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {unread && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--blue)' }} />}
                    {msg.priorita === 'alta' && <Zap className="w-3.5 h-3.5" style={{ color: priColor }} />}
                  </div>
                </div>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--muted)', whiteSpace: 'pre-line' }}>
                  {msg.corpo.slice(0, 200)}{msg.corpo.length > 200 ? '...' : ''}
                </p>
                {msg.allegati.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {msg.allegati.map(a => (
                      <span key={a} className="flex items-center gap-1 text-xs px-2 py-1 rounded"
                        style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                        <FileText className="w-3 h-3" />{a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TabTimeline({ event }: { event: Event }) {
  const allTasks = loadTasksFromStorage()
  const eventTasks = allTasks.filter(t => t.evento === event.id)
  const timeline = getTimeline(event)

  return (
    <div className="space-y-4">
      <div className="panel p-6">
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-0.5" style={{ background: 'var(--line)' }} />
          <div className="space-y-6">
            {timeline.map((milestone, i) => (
              <div key={i} className="flex items-start gap-5 relative">
                <div className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2"
                  style={{
                    background: milestone.done
                      ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                      : 'var(--panel2)',
                    borderColor: milestone.done ? 'var(--red2)' : 'var(--line)',
                    boxShadow: milestone.done ? 'var(--shadow-red)' : 'none',
                  }}>
                  {milestone.done
                    ? <CheckSquare className="w-4 h-4 text-white" />
                    : <Clock className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                  }
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold" style={{ color: milestone.done ? 'var(--text)' : 'var(--muted)' }}>
                      {milestone.label}
                    </p>
                    {(milestone as { current?: boolean }).current && (
                      <span className="text-xs px-2 py-0.5 rounded-full animate-pulse"
                        style={{ background: 'rgba(208,0,58,0.2)', color: 'var(--red2)' }}>
                        In corso
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                    {fmtLong(milestone.date.toISOString())}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {eventTasks.length > 0 && (
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="w-4 h-4" style={{ color: 'var(--blue)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Scadenze task</h3>
          </div>
          <div className="space-y-2">
            {[...eventTasks]
              .sort((a, b) => new Date(a.scadenza).getTime() - new Date(b.scadenza).getTime())
              .map(t => {
                const dl = daysLeft(t.scadenza)
                const isOverdue = dl < 0
                const priColor = t.priorita === 'alta' ? 'var(--red2)' : t.priorita === 'media' ? 'var(--yellow)' : 'var(--muted)'
                return (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: 'var(--panel2)' }}>
                    <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: priColor }} />
                    <p className="flex-1 text-sm truncate" style={{ color: t.stato === 'completato' ? 'var(--muted)' : 'var(--text)', textDecoration: t.stato === 'completato' ? 'line-through' : 'none' }}>
                      {t.titolo}
                    </p>
                    <span className="text-xs flex-shrink-0 font-medium"
                      style={{ color: isOverdue ? 'var(--red2)' : dl <= 3 ? 'var(--yellow)' : 'var(--muted)' }}>
                      {fmtShort(t.scadenza)}
                    </span>
                  </div>
                )
              })
            }
          </div>
        </div>
      )}
    </div>
  )
}

function TabCreative({ event }: { event: Event }) {
  const [projects, setProjects] = useState<CreativeProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCreativeProjects().then(all => {
      setProjects(all.filter(p => p.event_id === event.id))
      setLoading(false)
    })
  }, [event.id])

  const statusColor = (s: string) => {
    switch (s) {
      case 'completato': return 'var(--green)'
      case 'in_lavorazione': return '#a855f7'
      case 'in_revisione': return 'var(--yellow)'
      case 'approvato': return 'var(--blue)'
      default: return 'var(--muted)'
    }
  }

  return (
    <div className="space-y-5">
      <div className="panel p-5"
        style={{ border: '1px solid rgba(208,0,58,0.15)', background: 'linear-gradient(135deg, rgba(208,0,58,0.03) 0%, var(--panel) 70%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-4 h-4" style={{ color: 'var(--red2)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Materiali Creativi</h3>
          <span className="text-xs px-2 py-0.5 rounded-full ml-auto"
            style={{ background: 'rgba(208,0,58,0.12)', color: 'var(--red2)' }}>
            {projects.length} {projects.length === 1 ? 'progetto' : 'progetti'}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Materiali creativi collegati a "{event.nome}"
        </p>
      </div>

      {loading ? (
        <div className="panel p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="panel p-8 text-center">
          <Palette className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--muted)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun materiale creativo collegato</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Crea progetti dal Creative Studio e collegali a questo evento</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {projects.map(p => (
            <div key={p.id} className="panel p-4 transition-all hover:bg-white/5"
              style={{ border: '1px solid var(--line)' }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{p.title}</p>
                  <p className="text-xs capitalize" style={{ color: 'var(--muted)' }}>{p.type.replace(/_/g, ' ')}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0"
                  style={{ background: `${statusColor(p.status)}18`, color: statusColor(p.status), border: `1px solid ${statusColor(p.status)}30` }}>
                  {p.status.replace(/_/g, ' ')}
                </span>
              </div>
              {p.due_date && (
                <div className="flex items-center gap-1.5 mt-2">
                  <Clock className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs" style={{ color: daysLeft(p.due_date) < 0 ? 'var(--red2)' : 'var(--muted)' }}>
                    {fmtShort(p.due_date)}
                  </span>
                </div>
              )}
              {p.output_format && (
                <div className="flex items-center gap-1.5 mt-1">
                  <FileText className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{p.output_format}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabSocial({ event }: { event: Event }) {
  const [contents, setContents] = useState<SocialContent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSocialContents().then(all => {
      setContents(all.filter(c => c.event_id === event.id))
      setLoading(false)
    })
  }, [event.id])

  const statusColor = (s: string) => {
    switch (s) {
      case 'pubblicato': return 'var(--green)'
      case 'approvato': return 'var(--blue)'
      case 'in_lavorazione': return 'var(--yellow)'
      default: return 'var(--muted)'
    }
  }

  return (
    <div className="space-y-5">
      <div className="panel p-5"
        style={{ border: '1px solid rgba(249,115,22,0.15)', background: 'linear-gradient(135deg, rgba(249,115,22,0.03) 0%, var(--panel) 70%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4" style={{ color: '#f97316' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Contenuti Social</h3>
          <span className="text-xs px-2 py-0.5 rounded-full ml-auto"
            style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}>
            {contents.length} {contents.length === 1 ? 'contenuto' : 'contenuti'}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Contenuti social collegati a "{event.nome}"
        </p>
      </div>

      {loading ? (
        <div className="panel p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</p>
        </div>
      ) : contents.length === 0 ? (
        <div className="panel p-8 text-center">
          <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--muted)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun contenuto social collegato</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Crea contenuti dal Social Studio e collegali a questo evento</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {contents.map(c => (
            <div key={c.id} className="panel p-4 transition-all hover:bg-white/5"
              style={{ border: '1px solid var(--line)' }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{c.title}</p>
                  <p className="text-xs capitalize" style={{ color: 'var(--muted)' }}>{c.channel.replace(/_/g, ' ')}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0"
                  style={{ background: `${statusColor(c.status)}18`, color: statusColor(c.status), border: `1px solid ${statusColor(c.status)}30` }}>
                  {c.status.replace(/_/g, ' ')}
                </span>
              </div>
              {c.publish_date && (
                <div className="flex items-center gap-1.5 mt-2">
                  <Clock className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {fmtShort(c.publish_date)}
                  </span>
                </div>
              )}
              {c.copy && (
                <p className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--muted)' }}>{c.copy}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabPresentazioni({ event }: { event: Event }) {
  const [versions, setVersions] = useState<{ id: string; template_name: string; status: string; notes: string; file_url: string | null; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('presentation_versions')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setVersions(data)
        setLoading(false)
      })
  }, [event.id])

  const statusColor = (s: string) => {
    switch (s) {
      case 'pronto': return 'var(--green)'
      case 'generazione_richiesta': return 'var(--blue)'
      case 'errore': return 'var(--red2)'
      default: return 'var(--muted)'
    }
  }
  const statusLabel = (s: string) => {
    switch (s) {
      case 'bozza': return 'Bozza'
      case 'generazione_richiesta': return 'In Generazione'
      case 'pronto': return 'Pronto'
      case 'errore': return 'Errore'
      default: return s
    }
  }

  return (
    <div className="space-y-5">
      <div className="panel p-5"
        style={{ border: '1px solid rgba(77,180,255,0.15)', background: 'linear-gradient(135deg, rgba(77,180,255,0.03) 0%, var(--panel) 70%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-4 h-4" style={{ color: 'var(--blue)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Presentazioni</h3>
          <span className="text-xs px-2 py-0.5 rounded-full ml-auto"
            style={{ background: 'rgba(77,180,255,0.12)', color: 'var(--blue)' }}>
            {versions.length} {versions.length === 1 ? 'versione' : 'versioni'}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Presentazioni generate per "{event.nome}"
        </p>
      </div>

      {loading ? (
        <div className="panel p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</p>
        </div>
      ) : versions.length === 0 ? (
        <div className="panel p-8 text-center">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--muted)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessuna presentazione per questo evento</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Crea presentazioni dal modulo Presentazioni e collegale a questo evento</p>
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map(v => (
            <div key={v.id} className="panel p-4 flex items-center gap-4 transition-all hover:bg-white/5"
              style={{ border: '1px solid var(--line)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(77,180,255,0.1)' }}>
                <FileText className="w-5 h-5" style={{ color: 'var(--blue)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{v.template_name}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {new Date(v.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
                {v.notes && <p className="text-xs mt-1 truncate" style={{ color: 'var(--muted)' }}>{v.notes}</p>}
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ background: `${statusColor(v.status)}18`, color: statusColor(v.status), border: `1px solid ${statusColor(v.status)}30` }}>
                {statusLabel(v.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabPacchetto({ event }: { event: Event }) {
  const [packages, setPackages] = useState<ClientPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)

  useEffect(() => {
    fetchPackagesByEvent(event.id).then(p => { setPackages(p); setLoading(false) })
  }, [event.id])

  async function handleCreate() {
    const result = await upsertClientPackage({
      event_id: event.id,
      client_id: event.cliente,
      status: 'bozza',
    })
    if (result) setPackages(prev => [result, ...prev])
  }

  async function handleStatusChange(pkg: ClientPackage, status: string) {
    const patch: Partial<ClientPackage> = { status }
    if (status === 'inviato') patch.sent_at = new Date().toISOString()
    const result = await updateClientPackage(pkg.id, patch)
    if (result) setPackages(prev => prev.map(p => p.id === result.id ? result : p))
  }

  async function handleFileUpload(pkg: ClientPackage, type: 'pptx' | 'pdf_presentation' | 'xlsx' | 'pdf_budget', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(`${pkg.id}_${type}`)
    const url = await uploadPackageFile(file, pkg.id, type)
    if (url) {
      const field = type === 'pptx' ? 'pptx_url' : type === 'pdf_presentation' ? 'pdf_presentation_url' : type === 'xlsx' ? 'xlsx_url' : 'pdf_budget_url'
      const result = await updateClientPackage(pkg.id, { [field]: url })
      if (result) setPackages(prev => prev.map(p => p.id === result.id ? result : p))
    }
    setUploading(null)
  }

  async function handleDelete(id: string) {
    await deleteClientPackage(id)
    setPackages(prev => prev.filter(p => p.id !== id))
  }

  if (loading) return <div className="text-center py-8" style={{ color: 'var(--muted)' }}>Caricamento...</div>

  const fileTypes: { key: 'pptx' | 'pdf_presentation' | 'xlsx' | 'pdf_budget'; label: string; field: keyof ClientPackage; accept: string }[] = [
    { key: 'pptx', label: 'Presentazione PPTX', field: 'pptx_url', accept: '.pptx,.ppt' },
    { key: 'pdf_presentation', label: 'Presentazione PDF', field: 'pdf_presentation_url', accept: '.pdf' },
    { key: 'xlsx', label: 'Budget XLSX', field: 'xlsx_url', accept: '.xlsx,.xls' },
    { key: 'pdf_budget', label: 'Budget PDF', field: 'pdf_budget_url', accept: '.pdf' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Pacchetto Cliente</h3>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Raccoglie presentazione, budget e documenti per il cliente.
          </p>
        </div>
        <button onClick={handleCreate}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          <PlusIcon className="w-3.5 h-3.5" /> Nuovo Pacchetto
        </button>
      </div>

      {packages.length === 0 ? (
        <div className="text-center py-8 panel rounded-xl">
          <Package className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--muted)' }} />
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Nessun pacchetto creato per questo evento.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {packages.map(pkg => {
            const statusColors: Record<string, string> = {
              bozza: '#9ba3aa', in_preparazione: '#4db4ff', pronto: '#38d27d', inviato: '#22c55e', archiviato: '#6b7280',
            }
            const statusLabels: Record<string, string> = {
              bozza: 'Bozza', in_preparazione: 'In Preparazione', pronto: 'Pronto', inviato: 'Inviato', archiviato: 'Archiviato',
            }
            const color = statusColors[pkg.status] ?? '#9ba3aa'
            return (
              <div key={pkg.id} className="panel p-5 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ background: `${color}20`, color }}>
                    {statusLabels[pkg.status] ?? pkg.status}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {new Date(pkg.created_at).toLocaleDateString('it-IT')}
                  </span>
                </div>

                {/* File slots */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {fileTypes.map(ft => {
                    const url = pkg[ft.field] as string | null
                    const isUploading = uploading === `${pkg.id}_${ft.key}`
                    return (
                      <div key={ft.key} className="flex items-center gap-2 p-3 rounded-xl"
                        style={{ background: 'var(--bg)', border: `1px solid ${url ? 'rgba(56,210,125,0.3)' : 'var(--line)'}` }}>
                        <FileText className="w-4 h-4 flex-shrink-0" style={{ color: url ? 'var(--green)' : 'var(--muted)' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: url ? 'var(--text)' : 'var(--muted)' }}>
                            {ft.label}
                          </p>
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: 'var(--blue)' }}>
                              Scarica
                            </a>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--muted)' }}>Non caricato</span>
                          )}
                        </div>
                        <label className="flex-shrink-0 p-1.5 rounded-lg cursor-pointer hover:bg-white/10 transition-all"
                          title={`Carica ${ft.label}`}>
                          <Upload className="w-3.5 h-3.5" style={{ color: isUploading ? 'var(--yellow)' : 'var(--muted)' }} />
                          <input type="file" className="hidden" accept={ft.accept}
                            onChange={e => handleFileUpload(pkg, ft.key, e)} />
                        </label>
                      </div>
                    )
                  })}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                  <select value={pkg.status} onChange={e => handleStatusChange(pkg, e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-xs"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                    <option value="bozza">Bozza</option>
                    <option value="in_preparazione">In Preparazione</option>
                    <option value="pronto">Pronto</option>
                    <option value="inviato">Inviato</option>
                    <option value="archiviato">Archiviato</option>
                  </select>
                  <button onClick={() => handleDelete(pkg.id)} className="p-1.5 rounded-lg hover:bg-white/10">
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                  </button>
                </div>

                {pkg.sent_at && (
                  <p className="text-xs" style={{ color: 'var(--green)' }}>
                    Inviato il {new Date(pkg.sent_at).toLocaleDateString('it-IT')}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Technical status */}
      <div className="p-3 rounded-xl text-xs space-y-1" style={{ background: 'rgba(77,180,255,0.06)', border: '1px solid rgba(77,180,255,0.2)' }}>
        <p className="font-medium" style={{ color: 'var(--blue)' }}>Stato tecnico file</p>
        <p style={{ color: 'var(--muted)' }}>
          La generazione automatica di PPTX e XLSX da dati evento richiede una Edge Function dedicata (non ancora attiva).
          Per ora puoi caricare manualmente i file esportati da Budget (XLSX/PDF) e Presentazioni (PPTX/PDF).
        </p>
      </div>
    </div>
  )
}

// ─── EventDetail ──────────────────────────────────────────────────────────────

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
  onRefreshBudgets: () => void
}

function EventDetail({ event, onBack, onEdit, onDelete, onStatusChange, budgets, suppliers, comunicazioni, clients, onRefreshBudgets }: EventDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const allTasks = loadTasksFromStorage()
  const eventTasks = allTasks.filter(t => t.evento === event.id)
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
    { id: 'task', label: `Task${totalTasks > 0 ? ` (${totalTasks})` : ''}` },
    { id: 'team', label: `Team (${event.team.length})` },
    { id: 'fornitori', label: `Fornitori${eventSuppliers.length > 0 ? ` (${eventSuppliers.length})` : ''}` },
    { id: 'budget', label: 'Budget' },
    { id: 'comunicazioni', label: `Comunicazioni${eventMsg.length > 0 ? ` (${eventMsg.length})` : ''}` },
    { id: 'timeline', label: 'Timeline' },
    { id: 'creative', label: 'Creative Studio' },
    { id: 'social', label: 'Social' },
    { id: 'presentazioni', label: 'Presentazioni' },
    { id: 'pacchetto', label: 'Pacchetto' },
  ]

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
          style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="w-4 h-4" /> Torna agli eventi
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => onEdit(event)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            <Edit3 className="w-4 h-4" /> Modifica
          </button>
          <button onClick={() => onDelete(event)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
            style={{ background: 'rgba(255,49,95,0.08)', border: '1px solid rgba(255,49,95,0.2)', color: 'var(--red2)' }}>
            <Trash2 className="w-4 h-4" /> Elimina
          </button>
        </div>
      </div>

      {/* Hero panel */}
      <div className="panel p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ background: `linear-gradient(135deg, ${statoColor(event.stato)} 0%, transparent 60%)` }} />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <span className="text-xs px-3 py-1 rounded-full font-semibold"
                  style={{
                    background: `${statoColor(event.stato)}20`,
                    color: statoColor(event.stato),
                    border: `1px solid ${statoColor(event.stato)}40`,
                  }}>
                  {statoLabel(event.stato)}
                </span>
                {clients.find(c => c.id === event.cliente) && (
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    Cliente: <span style={{ color: 'var(--text)' }}>{clients.find(c => c.id === event.cliente)!.nome}</span>
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{event.nome}</h1>
              <p className="mt-1 text-sm max-w-xl" style={{ color: 'var(--muted)' }}>{event.descrizione}</p>
              <div className="flex flex-wrap gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                  <MapPin className="w-4 h-4" />{event.location}
                </div>
                <div className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                  <Calendar className="w-4 h-4" />
                  {fmtShort(event.dataInizio)} – {fmtShort(event.dataFine)}
                </div>
                <div className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                  <Users className="w-4 h-4" />{event.partecipanti} partecipanti
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 min-w-[160px]">
              <div className="px-4 py-3 rounded-xl text-center" style={{ background: 'var(--panel2)' }}>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Budget</p>
                <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--green)' }}>
                  €{event.budget.toLocaleString('it-IT')}
                </p>
              </div>
              <div className="px-4 py-3 rounded-xl text-center" style={{ background: 'var(--panel2)' }}>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {isOver ? 'Concluso' : days > 0 ? 'Al via tra' : 'In corso'}
                </p>
                <p className="text-xl font-bold mt-0.5"
                  style={{ color: isOver ? 'var(--muted)' : days > 0 ? 'var(--blue)' : 'var(--red2)' }}>
                  {isOver ? '—' : days > 0 ? `${days}gg` : 'Live'}
                </p>
              </div>
            </div>
          </div>

          {/* Status change strip */}
          <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
            <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>Avanzamento stato</p>
            <div className="flex items-center gap-2">
              {statiSequenza.map((s, i) => (
                <button key={s} onClick={() => onStatusChange(event, s)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: i <= currentIdx
                      ? `${statoColor(s)}20`
                      : 'var(--panel2)',
                    color: i <= currentIdx ? statoColor(s) : 'var(--muted)',
                    border: `1px solid ${i === currentIdx ? statoColor(s) + '60' : 'var(--line)'}`,
                    fontWeight: i === currentIdx ? 700 : 500,
                  }}>
                  {statoLabel(s)}
                </button>
              ))}
            </div>
          </div>

          {totalTasks > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span style={{ color: 'var(--muted)' }}>Avanzamento task ({completedTasks}/{totalTasks})</span>
                <span style={{ color: progress >= 80 ? 'var(--green)' : 'var(--text)' }}>{progress}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${progress}%`,
                    background: progress >= 80 ? 'var(--green)' : progress >= 50 ? 'var(--blue)' : 'linear-gradient(90deg, var(--red) 0%, var(--red2) 100%)',
                  }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto p-1 rounded-xl"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
            style={{
              background: activeTab === tab.id
                ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                : 'transparent',
              color: activeTab === tab.id ? 'white' : 'var(--muted)',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div key={activeTab} className="animate-fade-in">
        {activeTab === 'overview' && (
          <TabOverview event={event} progress={progress} completedTasks={completedTasks} totalTasks={totalTasks} budgets={budgets} clients={clients} />
        )}
        {activeTab === 'task' && <TabTask event={event} />}
        {activeTab === 'team' && <TabTeam event={event} />}
        {activeTab === 'fornitori' && <TabFornitori event={event} suppliers={suppliers} />}
        {activeTab === 'budget' && <TabBudget event={event} budgets={budgets} suppliers={suppliers} onRefresh={onRefreshBudgets} />}
        {activeTab === 'comunicazioni' && <TabComunicazioni event={event} comunicazioni={comunicazioni} />}
        {activeTab === 'timeline' && <TabTimeline event={event} />}
        {activeTab === 'creative' && <TabCreative event={event} />}
        {activeTab === 'social' && <TabSocial event={event} />}
        {activeTab === 'presentazioni' && <TabPresentazioni event={event} />}
        {activeTab === 'pacchetto' && <TabPacchetto event={event} />}
      </div>
    </div>
  )
}

// ─── Events list page ─────────────────────────────────────────────────────────

export default function Eventi() {
  const currentUser = loadUser()
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

  // Load events
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

  // Load budgets, suppliers, communications, clients
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

  // Load internal users from profiles
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
    const refreshed = await refreshEvents()
    if (selectedEvent && selectedEvent.id === event.id) {
      const fresh = refreshed.find(e => e.id === event.id) ?? remote
      setSelectedEvent(fresh)
    }
  }, [refreshEvents, selectedEvent])

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
    })
  }, [visibleEvents, search, filterStato])

  const overlays = (
    <>
      {showForm && (
        <EventFormModal
          event={editingEvent}
          internalUsers={internalUsers}
          clients={clientsList}
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
          className="fixed top-6 right-6 z-[60] px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{ background: 'var(--panel)', border: '1px solid var(--red2)', color: 'var(--red2)' }}
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
          onRefreshBudgets={() => fetchBudgets().then(setBudgets)}
        />
      </>
    )
  }

  return (
    <div className="space-y-6">
      {overlays}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Eventi</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            {filtered.length} evento{filtered.length !== 1 ? 'i' : ''} visibili
          </p>
        </div>
        <button onClick={() => { setEditingEvent(undefined); setShowForm(true) }}
          className="btn-primary flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold">
          <Plus className="w-4 h-4" /> Nuovo evento
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Totali', value: visibleEvents.length, color: 'var(--text)' },
          { label: 'In Corso', value: visibleEvents.filter(e => e.stato === 'in_corso').length, color: 'var(--red2)' },
          { label: 'Pianificazione', value: visibleEvents.filter(e => e.stato === 'pianificazione').length, color: 'var(--blue)' },
          { label: 'Completati', value: visibleEvents.filter(e => e.stato === 'completato').length, color: 'var(--green)' },
        ].map((kpi, i) => (
          <div key={i} className="panel p-4 text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{kpi.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl flex-1"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input type="text" placeholder="Cerca evento o location..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none" style={{ color: 'var(--text)' }} />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATI.map(stato => (
            <button key={stato} onClick={() => setFilterStato(stato)}
              className="px-4 py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: filterStato === stato
                  ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                  : 'var(--panel)',
                color: filterStato === stato ? 'white' : 'var(--muted)',
                border: '1px solid var(--line)',
              }}>
              {stato === 'Tutti' ? 'Tutti' : statoLabel(stato)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-12 text-center" style={{ color: 'var(--muted)' }}>
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nessun evento trovato</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((event, i) => {
            const cliente = clientsList.find(c => c.id === event.cliente)
            const responsabile = internalUsers.find(u => u.id === event.responsabile)
            const teamMembers = internalUsers.filter(u => event.team.includes(u.id)).slice(0, 4)
            const allTasks = loadTasksFromStorage()
            const eventTaskList = allTasks.filter(t => t.evento === event.id)
            const completedCount = eventTaskList.filter(t => t.stato === 'completato').length
            const progressPct = eventTaskList.length > 0
              ? Math.round((completedCount / eventTaskList.length) * 100) : 0
            const days = daysLeft(event.dataInizio)
            const isOver = daysLeft(event.dataFine) < 0

            return (
              <div key={event.id}
                className="panel hover-card p-5 cursor-pointer animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => setSelectedEvent(event)}>
                <div className="flex items-start gap-4">
                  <div className="w-1.5 rounded-full flex-shrink-0 self-stretch"
                    style={{ background: statoColor(event.stato), minHeight: '60px' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-0.5 rounded font-medium"
                            style={{ background: `${statoColor(event.stato)}15`, color: statoColor(event.stato) }}>
                            {statoLabel(event.stato)}
                          </span>
                          {cliente && (
                            <span className="text-xs" style={{ color: 'var(--muted)' }}>{cliente.nome}</span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{event.nome}</h3>
                        <div className="flex flex-wrap gap-3 mt-2 text-sm">
                          <span className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                            <MapPin className="w-3.5 h-3.5" />{event.location}
                          </span>
                          <span className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                            <Calendar className="w-3.5 h-3.5" />
                            {fmtShort(event.dataInizio)} – {fmtShort(event.dataFine)}
                          </span>
                          <span className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                            <Users className="w-3.5 h-3.5" />{event.partecipanti}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <p className="text-lg font-bold" style={{ color: 'var(--green)' }}>
                          €{event.budget.toLocaleString('it-IT')}
                        </p>
                        <div className="flex items-center gap-1">
                          {isOver ? (
                            <span className="text-xs" style={{ color: 'var(--muted)' }}>Concluso</span>
                          ) : days > 0 ? (
                            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--blue)' }}>
                              <Clock className="w-3 h-3" />{days}gg
                            </span>
                          ) : (
                            <span className="text-xs flex items-center gap-1 animate-pulse" style={{ color: 'var(--red2)' }}>
                              <AlertCircle className="w-3 h-3" />Live
                            </span>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5" style={{ color: 'var(--muted)' }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3"
                      style={{ borderTop: '1px solid var(--line)' }}>
                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                          {teamMembers.map(m => (
                            <img key={m.id} src={m.avatar} alt={m.nome}
                              className="w-7 h-7 rounded-lg object-cover border-2"
                              style={{ borderColor: 'var(--panel)' }} title={m.nome} />
                          ))}
                        </div>
                        {responsabile && (
                          <span className="text-xs" style={{ color: 'var(--muted)' }}>
                            Resp: {responsabile.nome.split(' ')[0]}
                          </span>
                        )}
                      </div>
                      {eventTaskList.length > 0 && (
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                          <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
                            <div className="h-full rounded-full"
                              style={{
                                width: `${progressPct}%`,
                                background: progressPct >= 80 ? 'var(--green)' : progressPct >= 50 ? 'var(--blue)' : 'var(--red2)',
                              }} />
                          </div>
                          <span className="text-xs" style={{ color: 'var(--muted)' }}>{progressPct}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
