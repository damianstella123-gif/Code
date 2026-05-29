import { useState, useMemo, useCallback } from 'react'
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
  Star,
  Zap,
  ImageIcon,
  Type,
  LayoutTemplate,
  Plus,
  Edit3,
  Trash2,
} from 'lucide-react'
import { users } from '@/data/users'
import { suppliers } from '@/data/suppliers'
import { clients } from '@/data/clients'
import { messaggi } from '@/data/comunicazioni'
import { entrate, uscite } from '@/data/amministrazione'
import { loadUser } from '@/lib/auth'
import { loadTasksFromStorage, loadEventsFromStorage, STORAGE_KEYS } from '@/lib/storage'
import { daysLeft, fmtShort, fmtLong } from '@/lib/format'
import type { Event } from '@/data/events'

const STATI = ['Tutti', 'bozza', 'pianificazione', 'in_corso', 'completato']
type StatoEvento = Event['stato']

type TabId = 'overview' | 'task' | 'team' | 'fornitori' | 'budget' | 'comunicazioni' | 'timeline' | 'creative'

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

function EventFormModal({ event, onSave, onCancel }: {
  event?: Event
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

  const internalUsers = users.filter(u => u.ruolo !== 'Fornitore')

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

function TabOverview({ event, progress, completedTasks, totalTasks }: {
  event: Event
  progress: number
  completedTasks: number
  totalTasks: number
}) {
  const responsabile = users.find(u => u.id === event.responsabile)
  const cliente = clients.find(c => c.id === event.cliente)
  const eventEntrate = entrate.filter(e => e.eventoId === event.id)
  const eventUscite = uscite.filter(u => u.eventoId === event.id)
  const totEntrate = eventEntrate.reduce((s, e) => s + e.importo, 0)
  const totUscite = eventUscite.reduce((s, u) => s + u.importo, 0)
  const speso = totUscite > 0 ? totUscite : Math.round(event.budget * 0.62)
  const residuo = event.budget - speso
  const usoPct = event.budget > 0 ? Math.round((speso / event.budget) * 100) : 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {responsabile && (
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Responsabile</p>
          <div className="flex items-center gap-3">
            <img src={responsabile.avatar} alt={responsabile.nome} className="w-12 h-12 rounded-xl object-cover" />
            <div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>{responsabile.nome}</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{responsabile.ruolo} · {responsabile.reparto}</p>
            </div>
          </div>
        </div>
      )}

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
        <div className="grid grid-cols-3 gap-4">
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
              €{totEntrate > 0 ? totEntrate.toLocaleString('it-IT') : event.budget.toLocaleString('it-IT')}
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
            const assignee = users.find(u => u.id === task.assegnatario)
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
                {assignee && (
                  <img src={assignee.avatar} alt={assignee.nome}
                    className="w-8 h-8 rounded-lg object-cover flex-shrink-0" title={assignee.nome} />
                )}
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

function TabTeam({ event }: { event: Event }) {
  const allTasks = loadTasksFromStorage()
  const eventTasks = allTasks.filter(t => t.evento === event.id)
  const eventTeam = users.filter(u => event.team.includes(u.id))
  const responsabile = users.find(u => u.id === event.responsabile)

  return (
    <div className="space-y-4">
      {responsabile && !event.team.includes(responsabile.id) && (
        <div className="panel p-5 flex items-center gap-4"
          style={{ border: '1px solid rgba(208,0,58,0.2)', background: 'rgba(208,0,58,0.03)' }}>
          <div className="relative">
            <img src={responsabile.avatar} alt={responsabile.nome} className="w-12 h-12 rounded-xl object-cover" />
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: 'var(--red2)' }}>
              <Star className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold" style={{ color: 'var(--text)' }}>{responsabile.nome}</p>
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(208,0,58,0.12)', color: 'var(--red2)', border: '1px solid rgba(208,0,58,0.25)' }}>
                Responsabile
              </span>
            </div>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{responsabile.ruolo} · {responsabile.reparto}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {eventTeam.map(member => {
          const memberTasks = eventTasks.filter(t => t.assegnatario === member.id)
          const isResp = member.id === event.responsabile
          const completati = memberTasks.filter(t => t.stato === 'completato').length
          const pct = memberTasks.length > 0 ? Math.round((completati / memberTasks.length) * 100) : 0

          return (
            <div key={member.id} className="panel p-5">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img src={member.avatar} alt={member.nome} className="w-12 h-12 rounded-xl object-cover" />
                  {isResp && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: 'var(--red2)' }}>
                      <Star className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{member.nome}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{member.ruolo}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--line)' }}>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded-lg" style={{ background: 'var(--panel2)' }}>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>Task</p>
                    <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{memberTasks.length}</p>
                  </div>
                  <div className="p-2 rounded-lg" style={{ background: 'var(--panel2)' }}>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>Completati</p>
                    <p className="font-bold text-sm" style={{ color: 'var(--green)' }}>{completati}</p>
                  </div>
                </div>
                {memberTasks.length > 0 && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--muted)' }}>Progresso</span>
                      <span style={{ color: 'var(--text)' }}>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--blue)' : 'var(--red2)' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TabFornitori({ event }: { event: Event }) {
  const eventSuppliers = suppliers.filter(s => s.eventiId.includes(event.id))

  if (eventSuppliers.length === 0) {
    const fallback = suppliers.slice(0, event.stato === 'completato' ? 3 : 2)
    return <TabFornitoriList suppliers={fallback} />
  }
  return <TabFornitoriList suppliers={eventSuppliers} />
}

function TabFornitoriList({ suppliers: list }: { suppliers: typeof suppliers }) {
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

function TabBudget({ event }: { event: Event }) {
  const eventEntrate = entrate.filter(e => e.eventoId === event.id)
  const eventUscite = uscite.filter(u => u.eventoId === event.id)
  const totEntrate = eventEntrate.reduce((s, e) => s + e.importo, 0)
  const totUscite = eventUscite.reduce((s, u) => s + u.importo, 0)
  const margine = (totEntrate || event.budget) - totUscite
  const usoPct = event.budget > 0 ? Math.min(Math.round((totUscite / event.budget) * 100), 100) : 0

  const sColor = (s: string) => {
    switch (s) {
      case 'pagato': return 'var(--green)'
      case 'in_attesa': return 'var(--yellow)'
      case 'scaduto': return 'var(--red2)'
      default: return 'var(--muted)'
    }
  }
  const statoBg = (s: string) => {
    switch (s) {
      case 'pagato': return 'rgba(56,210,125,0.12)'
      case 'in_attesa': return 'rgba(255,194,75,0.12)'
      case 'scaduto': return 'rgba(255,49,95,0.12)'
      default: return 'var(--panel2)'
    }
  }
  const statoLbl = (s: string) => ({ pagato: 'Pagato', in_attesa: 'In attesa', scaduto: 'Scaduto', annullato: 'Annullato' }[s] ?? s)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Budget Totale', value: event.budget, color: 'var(--text)' },
          { label: 'Entrate Prev.', value: totEntrate || event.budget, color: 'var(--green)' },
          { label: 'Uscite', value: totUscite, color: 'var(--yellow)' },
          { label: 'Margine', value: margine, color: margine >= 0 ? 'var(--green)' : 'var(--red2)' },
        ].map(k => (
          <div key={k.label} className="panel p-4 text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{k.label}</p>
            <p className="text-xl font-bold mt-1" style={{ color: k.color }}>
              €{k.value.toLocaleString('it-IT')}
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
        <div className="flex justify-between text-xs mt-2" style={{ color: 'var(--muted)' }}>
          <span>€0</span>
          <span>€{event.budget.toLocaleString('it-IT')}</span>
        </div>
      </div>

      {eventEntrate.length > 0 && (
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <ArrowDownLeft className="w-4 h-4" style={{ color: 'var(--green)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Entrate ({eventEntrate.length})</h3>
          </div>
          <div className="space-y-2">
            {eventEntrate.map(e => {
              const c = clients.find(cl => cl.id === e.clienteId)
              return (
                <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{e.note}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {c?.nome ?? '—'} · Prev. {fmtShort(e.dataPrevista)}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded flex-shrink-0"
                    style={{ background: statoBg(e.stato), color: sColor(e.stato) }}>
                    {statoLbl(e.stato)}
                  </span>
                  <span className="font-semibold text-sm flex-shrink-0" style={{ color: 'var(--green)' }}>
                    €{e.importo.toLocaleString('it-IT')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {eventUscite.length > 0 && (
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--yellow)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Uscite ({eventUscite.length})</h3>
          </div>
          <div className="space-y-2">
            {eventUscite.map(u => {
              const sup = suppliers.find(s => s.id === u.fornitoreId)
              return (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{u.note || u.categoria}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {sup?.nome ?? '—'} · Scad. {fmtShort(u.scadenza)}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded flex-shrink-0"
                    style={{ background: statoBg(u.stato), color: sColor(u.stato) }}>
                    {statoLbl(u.stato)}
                  </span>
                  <span className="font-semibold text-sm flex-shrink-0" style={{ color: 'var(--yellow)' }}>
                    €{u.importo.toLocaleString('it-IT')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {eventEntrate.length === 0 && eventUscite.length === 0 && (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Euro className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessuna voce finanziaria registrata per questo evento</p>
          <p className="text-xs mt-1">Aggiungile dalla sezione Amministrazione</p>
        </div>
      )}
    </div>
  )
}

function TabComunicazioni({ event }: { event: Event }) {
  const currentUser = loadUser()
  const userId = currentUser?.id ?? ''
  const evtMsg = messaggi.filter(m => m.eventoId === event.id)

  return (
    <div className="space-y-3">
      {evtMsg.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessuna comunicazione per questo evento</p>
        </div>
      ) : evtMsg.map(msg => {
        const sender = users.find(u => u.id === msg.mittente)
        const unread = !msg.letto.includes(userId) && msg.destinatari.includes(userId)
        const priColor = msg.priorita === 'alta' ? 'var(--red2)' : msg.priorita === 'media' ? 'var(--yellow)' : 'var(--muted)'
        return (
          <div key={msg.id} className="panel p-5"
            style={{ border: unread ? '1px solid rgba(77,180,255,0.3)' : '1px solid var(--line)' }}>
            <div className="flex items-start gap-3">
              {sender?.avatar
                ? <img src={sender.avatar} alt={sender.nome} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                : <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: 'var(--panel2)' }} />
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{msg.oggetto}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      Da: {sender?.nome ?? '—'} · {new Date(msg.data).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
  const moodColors = ['#1a1a2e', '#16213e', '#0f3460', '#e94560', '#533483', '#2c3e50', '#e8cda2', '#c4a882']
  const fontPairs = [
    { heading: 'Playfair Display', body: 'Lato', style: 'Elegante' },
    { heading: 'Montserrat', body: 'Open Sans', style: 'Moderno' },
    { heading: 'Cormorant Garamond', body: 'Raleway', style: 'Sofisticato' },
    { heading: 'Oswald', body: 'Roboto', style: 'Corporate' },
  ]
  const templates = [
    { nome: 'Invito Formale', icon: LayoutTemplate, desc: 'Carta premium, bordi dorati' },
    { nome: 'Digital Banner', icon: ImageIcon, desc: '1920x1080, social ready' },
    { nome: 'Badge Partecipante', icon: Type, desc: 'Stampa recto-verso' },
    { nome: 'Programma Evento', icon: FileText, desc: 'A4 bifold, 4 pagine' },
  ]

  return (
    <div className="space-y-5">
      <div className="panel p-5"
        style={{ border: '1px solid rgba(208,0,58,0.15)', background: 'linear-gradient(135deg, rgba(208,0,58,0.03) 0%, var(--panel) 70%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-4 h-4" style={{ color: 'var(--red2)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Creative Studio</h3>
          <span className="text-xs px-2 py-0.5 rounded-full ml-auto"
            style={{ background: 'rgba(208,0,58,0.12)', color: 'var(--red2)', border: '1px solid rgba(208,0,58,0.25)' }}>
            Beta
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Identità visiva, materiali comunicativi e branding per "{event.nome}"
        </p>
      </div>

      <div className="panel p-5">
        <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Mood Board</p>
        <div className="flex gap-2 flex-wrap">
          {moodColors.map((c, i) => (
            <button key={i} className="group relative w-12 h-12 rounded-xl transition-all hover:scale-110"
              style={{ background: c, border: '2px solid var(--line)' }}>
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"
                style={{ background: 'rgba(0,0,0,0.4)' }}>
                <span className="text-white text-xs font-mono">{c}</span>
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>Passa sopra per copiare il codice colore</p>
      </div>

      <div className="panel p-5">
        <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Coppie Tipografiche</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fontPairs.map((fp, i) => (
            <div key={i} className="p-4 rounded-xl cursor-pointer transition-all hover:bg-white/5"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs px-2 py-0.5 rounded"
                  style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>
                  {fp.style}
                </span>
              </div>
              <p className="text-lg font-bold" style={{ color: 'var(--text)', fontFamily: 'serif' }}>{fp.heading}</p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{fp.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel p-5">
        <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Template Kit</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {templates.map((t, i) => {
            const Icon = t.icon
            return (
              <button key={i} className="flex items-center gap-4 p-4 rounded-xl text-left transition-all hover:bg-white/5"
                onClick={() => alert(`Download "${t.nome}" avviato (demo)`)}
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(208,0,58,0.1)' }}>
                  <Icon className="w-5 h-5" style={{ color: 'var(--red2)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{t.nome}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.desc}</p>
                </div>
                <span className="text-xs px-2 py-1 rounded flex-shrink-0"
                  style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
                  Scarica
                </span>
              </button>
            )
          })}
        </div>
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
}

function EventDetail({ event, onBack, onEdit, onDelete, onStatusChange }: EventDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const allTasks = loadTasksFromStorage()
  const eventTasks = allTasks.filter(t => t.evento === event.id)
  const eventMsg = messaggi.filter(m => m.eventoId === event.id)
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
          <TabOverview event={event} progress={progress} completedTasks={completedTasks} totalTasks={totalTasks} />
        )}
        {activeTab === 'task' && <TabTask event={event} />}
        {activeTab === 'team' && <TabTeam event={event} />}
        {activeTab === 'fornitori' && <TabFornitori event={event} />}
        {activeTab === 'budget' && <TabBudget event={event} />}
        {activeTab === 'comunicazioni' && <TabComunicazioni event={event} />}
        {activeTab === 'timeline' && <TabTimeline event={event} />}
        {activeTab === 'creative' && <TabCreative event={event} />}
      </div>
    </div>
  )
}

// ─── Events list page ─────────────────────────────────────────────────────────

export default function Eventi() {
  const currentUser = loadUser()
  const [eventList, setEventList] = useState<Event[]>(() => loadEventsFromStorage())
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [search, setSearch] = useState('')
  const [filterStato, setFilterStato] = useState('Tutti')
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | undefined>(undefined)
  const [deletingEvent, setDeletingEvent] = useState<Event | null>(null)

  const saveEvents = useCallback((list: Event[]) => {
    localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(list))
  }, [])

  const handleSave = useCallback((event: Event) => {
    setEventList(prev => {
      const exists = prev.find(e => e.id === event.id)
      const updated = exists ? prev.map(e => e.id === event.id ? event : e) : [event, ...prev]
      saveEvents(updated)
      return updated
    })
    setShowForm(false)
    setEditingEvent(undefined)
    if (selectedEvent && selectedEvent.id === event.id) {
      setSelectedEvent(event)
    }
  }, [saveEvents, selectedEvent])

  const handleDelete = useCallback((event: Event) => {
    setEventList(prev => {
      const updated = prev.filter(e => e.id !== event.id)
      saveEvents(updated)
      return updated
    })
    setDeletingEvent(null)
    setSelectedEvent(null)
  }, [saveEvents])

  const handleStatusChange = useCallback((event: Event, newStato: StatoEvento) => {
    const updated = { ...event, stato: newStato }
    setEventList(prev => {
      const newList = prev.map(e => e.id === event.id ? updated : e)
      saveEvents(newList)
      return newList
    })
    if (selectedEvent && selectedEvent.id === event.id) {
      setSelectedEvent(updated)
    }
  }, [saveEvents, selectedEvent])

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

  if (selectedEvent) {
    const liveEvent = eventList.find(e => e.id === selectedEvent.id) ?? selectedEvent
    return (
      <EventDetail
        event={liveEvent}
        onBack={() => setSelectedEvent(null)}
        onEdit={(evt) => { setEditingEvent(evt); setShowForm(true) }}
        onDelete={(evt) => setDeletingEvent(evt)}
        onStatusChange={handleStatusChange}
      />
    )
  }

  return (
    <div className="space-y-6">
      {showForm && (
        <EventFormModal
          event={editingEvent}
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
            const cliente = clients.find(c => c.id === event.cliente)
            const responsabile = users.find(u => u.id === event.responsabile)
            const teamMembers = users.filter(u => event.team.includes(u.id)).slice(0, 4)
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
