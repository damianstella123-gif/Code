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
  Download,
  Building2,
  UtensilsCrossed,
  Plus as PlusIcon,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { loadTasksFromStorage, cacheEventsSnapshot, loadWorkflowsFromStorage } from '@/lib/storage'
import { fetchEvents, upsertEvent, updateEvent as updateEventRemote, deleteEvent as deleteEventRemote } from '@/lib/events-service'
import { fetchTasksByEvent, upsertTask, changeTaskStatus } from '@/lib/tasks-service'
import { fetchSuppliers } from '@/lib/suppliers-service'
import { fetchBudgets } from '@/lib/budgets-service'
import { fetchCommunications } from '@/lib/communications-service'
import { fetchPackagesByEvent, upsertClientPackage, updateClientPackage, deleteClientPackage, uploadPackageFile, type ClientPackage } from '@/lib/packages-service'
import { fetchCreativeProjects, type CreativeProject } from '@/lib/creative-service'
import { fetchSocialContents, type SocialContent } from '@/lib/social-service'
import { fetchClients as fetchClientsService } from '@/lib/clients-service'
import type { Client } from '@/data/clients'
import { fetchAllProfiles } from '@/lib/profiles'
import { supabase } from '@/lib/supabase'
import { useRealtimeTable } from '@/lib/use-realtime'
import { daysLeft, fmtShort, fmtLong } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Supplier } from '@/data/suppliers'
import type { Messaggio } from '@/data/comunicazioni'
import type { Uscita } from '@/data/amministrazione'
import type { EventoWorkflow } from '@/data/workflow'

const STATI = ['Tutti', 'bozza', 'pianificazione', 'in_corso', 'completato']
type StatoEvento = Event['stato']

type TabId = 'overview' | 'task' | 'team' | 'fornitori' | 'budget' | 'comunicazioni' | 'documenti' | 'programma' | 'timeline' | 'creative' | 'social' | 'presentazioni' | 'pacchetto'

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

function EventFormModal({ event, internalUsers, allClients, onSave, onCancel }: {
  event?: Event
  internalUsers: InternalUser[]
  allClients: Client[]
  onSave: (e: Event) => void
  onCancel: () => void
}) {
  const existingClient = allClients.find(c => c.id === event?.cliente)
  const [nome, setNome] = useState(event?.nome ?? '')
  const [descrizione, setDescrizione] = useState(event?.descrizione ?? '')
  const [selectedCompany, setSelectedCompany] = useState(existingClient?.nome?.trim().toUpperCase() ?? '')
  const [cliente, setCliente] = useState(event?.cliente ?? '')
  const [dataInizio, setDataInizio] = useState(event?.dataInizio ?? '')
  const [dataFine, setDataFine] = useState(event?.dataFine ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [budget, setBudget] = useState(event?.budget?.toString() ?? '')
  const [stato, setStato] = useState<StatoEvento>(event?.stato ?? 'bozza')
  const [partecipanti, setPartecipanti] = useState(event?.partecipanti?.toString() ?? '')
  const [responsabile, setResponsabile] = useState(event?.responsabile ?? (loadUser()?.id ?? ''))
  const [teamIds, setTeamIds] = useState<string[]>(event?.team ?? [])

  const uniqueCompanies = useMemo(() => {
    const seen = new Set<string>()
    const result: { key: string; label: string }[] = []
    for (const c of allClients) {
      const key = c.nome.trim().toUpperCase()
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ key, label: c.nome })
      }
    }
    return result.sort((a, b) => a.label.localeCompare(b.label))
  }, [allClients])

  const companyReferenti = useMemo(() => {
    if (!selectedCompany) return []
    return allClients
      .filter(c => c.nome.trim().toUpperCase() === selectedCompany)
      .sort((a, b) => (a.referente ?? '').localeCompare(b.referente ?? ''))
  }, [allClients, selectedCompany])

  function handleCompanyChange(companyKey: string) {
    setSelectedCompany(companyKey)
    setCliente('')
  }

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
      ricavo_cliente: event?.ricavo_cliente ?? null,
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
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Azienda / Cliente</label>
              <select value={selectedCompany} onChange={e => handleCompanyChange(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">— Nessuno —</option>
                {uniqueCompanies.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Referente</label>
              <select value={cliente} onChange={e => setCliente(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
                disabled={!selectedCompany}>
                <option value="">{selectedCompany ? '— Scegli referente —' : '— Seleziona prima azienda —'}</option>
                {companyReferenti.map(c => <option key={c.id} value={c.id}>{c.referente || c.email || c.id}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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

function EventEconomicSummary({ event }: { event: Event }) {
  const [totals, setTotals] = useState({ venduto: 0, costo: 0, margine: 0, marginePct: 0 })

  useEffect(() => {
    async function load() {
      const [svcRes, hotelRes, restRes] = await Promise.all([
        supabase.from('event_supplier_services').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_hotel_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_restaurant_details').select('budget_per_persona,budget_totale,costo_per_persona,costo_totale_reale,pax_confermati,pax_previsti').eq('event_id', event.id),
      ])
      let venduto = 0, costo = 0
      for (const s of (svcRes.data ?? [])) {
        const qty = s.quantita ?? 1
        venduto += s.venduto_totale ?? (s.venduto_unitario ? s.venduto_unitario * qty : 0)
        costo += s.costo_totale ?? (s.costo_unitario ? s.costo_unitario * qty : 0)
      }
      for (const h of (hotelRes.data ?? [])) {
        const qty = h.quantita ?? 1
        venduto += h.venduto_totale ?? (h.venduto_unitario ? h.venduto_unitario * qty : 0)
        costo += h.costo_totale ?? (h.costo_unitario ? h.costo_unitario * qty : 0)
      }
      for (const r of (restRes.data ?? [])) {
        const pax = r.pax_confermati ?? r.pax_previsti ?? 1
        venduto += r.budget_totale ? Number(r.budget_totale) : (r.budget_per_persona ? Number(r.budget_per_persona) * pax : 0)
        costo += r.costo_totale_reale ? Number(r.costo_totale_reale) : (r.costo_per_persona ? Number(r.costo_per_persona) * pax : 0)
      }
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      setTotals({ venduto, costo, margine, marginePct })
    }
    load()
  }, [event.id])

  if (!totals.venduto && !totals.costo) {
    return (
      <div className="panel p-5 md:col-span-2">
        <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Controllo Economico</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Inserisci venduto e costo nei servizi operativi per visualizzare il riepilogo.</p>
      </div>
    )
  }

  return (
    <div className="panel p-5 md:col-span-2">
      <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Controllo Economico</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="text-center p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Venduto</p>
          <p className="text-lg font-bold mt-1" style={{ color: 'var(--text)' }}>{'\u20AC'}{totals.venduto.toLocaleString('it-IT', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="text-center p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Costi</p>
          <p className="text-lg font-bold mt-1" style={{ color: 'var(--yellow)' }}>{'\u20AC'}{totals.costo.toLocaleString('it-IT', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="text-center p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Margine</p>
          <p className="text-lg font-bold mt-1" style={{ color: totals.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{totals.margine.toLocaleString('it-IT', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="text-center p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Margine %</p>
          <p className="text-lg font-bold mt-1" style={{ color: totals.marginePct >= 20 ? 'var(--green)' : totals.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }}>{totals.marginePct.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  )
}

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
  const hasRealData = eventUscite.length > 0

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

      <EventEconomicSummary event={event} />

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
              <span className="text-sm" style={{ color: 'var(--muted)' }}>Budget evento</span>
            </div>
            <span className="font-semibold text-sm" style={{ color: event.budget > 0 ? 'var(--green)' : 'var(--muted)' }}>
              {event.budget > 0 ? `€${event.budget.toLocaleString('it-IT')}` : 'Non inserito'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--yellow)' }} />
              <span className="text-sm" style={{ color: 'var(--muted)' }}>Uscite registrate</span>
            </div>
            <span className="font-semibold text-sm" style={{ color: hasRealData ? 'var(--yellow)' : 'var(--muted)' }}>
              {hasRealData ? `€${totUscite.toLocaleString('it-IT')}` : 'Nessuna'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TabTask({ event }: { event: Event }) {
  const [filter, setFilter] = useState<'tutti' | 'da_fare' | 'in_corso' | 'completato'>('tutti')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<Task['priorita']>('media')

  useEffect(() => {
    fetchTasksByEvent(event.id).then(t => { setTasks(t); setLoading(false) })
  }, [event.id])

  const filtered = filter === 'tutti' ? tasks : tasks.filter(t => t.stato === filter)
  const counts = {
    da_fare: tasks.filter(t => t.stato === 'da_fare').length,
    in_corso: tasks.filter(t => t.stato === 'in_corso').length,
    completato: tasks.filter(t => t.stato === 'completato').length,
  }

  async function handleAdd() {
    if (!newTitle.trim()) return
    const currentUser = loadUser()
    const task: Task = {
      id: `tsk_${Date.now()}`,
      titolo: newTitle.trim(),
      descrizione: '',
      assegnatario: currentUser?.id ?? '',
      evento: event.id,
      priorita: newPriority,
      stato: 'da_fare',
      scadenza: event.dataInizio,
      creatoIl: new Date().toISOString(),
    }
    const saved = await upsertTask(task)
    if (saved) {
      setTasks(prev => [...prev, saved])
      setNewTitle('')
      setAdding(false)
    }
  }

  async function handleStatusChange(taskId: string, newStatus: Task['stato']) {
    const result = await changeTaskStatus(taskId, newStatus)
    if (result) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, stato: newStatus } : t))
    }
  }

  if (loading) {
    return (
      <div className="panel p-10 text-center">
        <div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento task...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {([
            { id: 'tutti', label: `Tutti (${tasks.length})` },
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
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ background: 'rgba(208,0,58,0.12)', color: 'var(--red2)', border: '1px solid rgba(208,0,58,0.35)' }}>
          <Plus className="w-3.5 h-3.5" /> Aggiungi task
        </button>
      </div>

      {adding && (
        <div className="panel p-4 space-y-3" style={{ border: '1px solid rgba(208,0,58,0.2)' }}>
          <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Titolo task..."
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
          <div className="flex items-center gap-3">
            <select value={newPriority} onChange={e => setNewPriority(e.target.value as Task['priorita'])}
              className="px-3 py-2 rounded-lg text-xs focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="bassa">Bassa</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
            <button onClick={handleAdd} className="px-4 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--red2)' }}>
              Crea
            </button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg text-xs" style={{ color: 'var(--muted)' }}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{tasks.length === 0 ? 'Nessun task collegato a questo evento' : 'Nessun task in questa categoria'}</p>
          {tasks.length === 0 && <p className="text-xs mt-1">Usa il pulsante "Aggiungi task" per crearne uno</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const dl = daysLeft(task.scadenza)
            const isOverdue = dl < 0 && task.stato !== 'completato'
            const priColor = task.priorita === 'alta' ? 'var(--red2)' : task.priorita === 'media' ? 'var(--yellow)' : 'var(--muted)'
            const sColor = task.stato === 'completato' ? 'var(--green)' : task.stato === 'in_corso' ? 'var(--blue)' : 'var(--yellow)'
            const statoBg = task.stato === 'completato' ? 'rgba(56,210,125,0.12)' : task.stato === 'in_corso' ? 'rgba(77,180,255,0.12)' : 'rgba(255,194,75,0.12)'
            return (
              <div key={task.id} className="panel p-4 flex items-center gap-4">
                <div className="w-1.5 h-12 rounded-full flex-shrink-0" style={{ background: priColor }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{task.titolo}</p>
                  {task.descrizione && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{task.descrizione}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select value={task.stato} onChange={e => handleStatusChange(task.id, e.target.value as Task['stato'])}
                    className="text-xs px-2 py-1 rounded cursor-pointer focus:outline-none"
                    style={{ background: statoBg, color: sColor, border: 'none' }}>
                    <option value="da_fare">Da fare</option>
                    <option value="in_corso">In corso</option>
                    <option value="completato">Completato</option>
                  </select>
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

function TabTeam({ event, internalUsers }: { event: Event; internalUsers: InternalUser[] }) {
  const teamMembers = internalUsers.filter(u => event.team.includes(u.id))
  const responsabile = internalUsers.find(u => u.id === event.responsabile)

  if (teamMembers.length === 0 && !responsabile) {
    return (
      <div className="space-y-4">
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun membro del team assegnato</p>
          <p className="text-xs mt-1">Modifica l'evento per aggiungere il team</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {responsabile && (
        <div className="panel p-4 flex items-center gap-4" style={{ border: '1px solid rgba(208,0,58,0.2)' }}>
          <img src={responsabile.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{responsabile.nome}</p>
            <p className="text-xs" style={{ color: 'var(--red2)' }}>Responsabile evento</p>
          </div>
        </div>
      )}
      {teamMembers.filter(m => m.id !== event.responsabile).map(m => (
        <div key={m.id} className="panel p-4 flex items-center gap-4">
          <img src={m.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{m.nome}</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Membro team</p>
          </div>
        </div>
      ))}
    </div>
  )
}

interface EventSupplierLink {
  id: string
  event_id: string
  supplier_id: string
  service_category: string
  start_date: string | null
  start_time: string | null
  end_date: string | null
  end_time: string | null
  location: string
  operational_notes: string
}



const SVC_CATEGORIES = [
  { value: 'transfer', label: 'Transfer' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'ristorante', label: 'Ristorante' },
  { value: 'location', label: 'Location' },
  { value: 'allestimento', label: 'Allestimento' },
  { value: 'audiovideo', label: 'Audio Video' },
  { value: 'hostess', label: 'Hostess' },
  { value: 'staff', label: 'Staff' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'altro', label: 'Altro' },
]

interface SupplierService {
  id: string
  event_id: string
  supplier_id: string
  titolo: string
  categoria: string
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  luogo: string
  partenza: string
  destinazione: string
  note: string
  costo_unitario: number | null
  quantita: number | null
  costo_totale: number | null
  venduto_unitario: number | null
  venduto_totale: number | null
}

const emptySvcForm = {
  titolo: '',
  categoria: 'altro',
  data: '',
  ora_inizio: '',
  ora_fine: '',
  luogo: '',
  partenza: '',
  destinazione: '',
  note: '',
  costo_unitario: '',
  quantita: '1',
  costo_totale: '',
  venduto_unitario: '',
  venduto_totale: '',
}

const HOTEL_TIPOS = [
  { value: 'pernottamento', label: 'Pernottamento' },
  { value: 'sala_meeting', label: 'Meeting' },
  { value: 'coffee_break', label: 'Coffee Break' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'coffee_station', label: 'Coffee Station' },
  { value: 'setup_sala', label: 'Setup Sala' },
  { value: 'attrezzature', label: 'Attrezzature Tecniche' },
]

interface HotelDetail {
  id: string
  event_id: string
  supplier_id: string
  tipo: string
  titolo: string
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  check_in_date: string | null
  check_in_time: string | null
  check_out_date: string | null
  check_out_time: string | null
  luogo: string
  quantita: number | null
  note: string
  room_type: string
  meeting_pax: number | null
  meeting_setup: string
  meeting_equipment: string
  natural_light: boolean
  costo_unitario: number | null
  costo_totale: number | null
  venduto_unitario: number | null
  venduto_totale: number | null
}

const emptyHotelForm = {
  titolo: '',
  data: '',
  ora_inizio: '',
  ora_fine: '',
  check_in_date: '',
  check_in_time: '',
  check_out_date: '',
  check_out_time: '',
  luogo: '',
  quantita: '',
  note: '',
  room_type: '',
  meeting_pax: '',
  meeting_setup: '',
  meeting_equipment: '',
  natural_light: false,
  costo_unitario: '',
  costo_totale: '',
  venduto_unitario: '',
  venduto_totale: '',
}

function isHotelSupplier(sup: Supplier): boolean {
  return sup.categoria.toLowerCase().includes('hotel') || sup.categoria.toLowerCase().includes('albergo')
}

function isRestaurantSupplier(sup: Supplier): boolean {
  const c = sup.categoria.toLowerCase()
  return c.includes('ristorante') || c.includes('ristorazione') || c.includes('catering')
}

interface RestaurantDetail {
  id: string
  event_id: string
  supplier_id: string
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  pax_previsti: number | null
  pax_confermati: number | null
  tipologia_servizio: string
  menu_portate: string
  menu_descrizione: string
  budget_per_persona: number | null
  budget_totale: number | null
  costo_per_persona: number | null
  costo_totale_reale: number | null
  area_riservata: boolean
  sala_privata: boolean
  esclusiva_parziale: boolean
  esclusiva_totale: boolean
  nome_sala: string
  note_location: string
  num_vegetariani: number | null
  num_vegani: number | null
  allergie: string
  intolleranze: string
  note_alimentari: string
  setup_tavoli: string
  branding_cliente: string
  richieste_speciali: string
  note_operative: string
}

const emptyRestaurantForm = {
  data: '',
  ora_inizio: '',
  ora_fine: '',
  pax_previsti: '',
  pax_confermati: '',
  tipologia_servizio: '',
  menu_portate: '',
  menu_descrizione: '',
  budget_per_persona: '',
  budget_totale: '',
  costo_per_persona: '',
  costo_totale_reale: '',
  area_riservata: false,
  sala_privata: false,
  esclusiva_parziale: false,
  esclusiva_totale: false,
  nome_sala: '',
  note_location: '',
  num_vegetariani: '',
  num_vegani: '',
  allergie: '',
  intolleranze: '',
  note_alimentari: '',
  setup_tavoli: '',
  branding_cliente: '',
  richieste_speciali: '',
  note_operative: '',
}

function TabFornitori({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [links, setLinks] = useState<EventSupplierLink[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null)
  const [managingServices, setManagingServices] = useState<string | null>(null)
  const [services, setServices] = useState<SupplierService[]>([])
  const [svcForm, setSvcForm] = useState(emptySvcForm)
  const [editingSvcId, setEditingSvcId] = useState<string | null>(null)
  const [showSvcForm, setShowSvcForm] = useState(false)
  const [managingHotel, setManagingHotel] = useState<string | null>(null)
  const [hotelDetails, setHotelDetails] = useState<HotelDetail[]>([])
  const [hotelForm, setHotelForm] = useState(emptyHotelForm)
  const [editingHotelId, setEditingHotelId] = useState<string | null>(null)
  const [showHotelForm, setShowHotelForm] = useState(false)
  const [hotelFormTipo, setHotelFormTipo] = useState('')
  const [managingRestaurant, setManagingRestaurant] = useState<string | null>(null)
  const [restaurantDetail, setRestaurantDetail] = useState<RestaurantDetail | null>(null)
  const [restaurantForm, setRestaurantForm] = useState(emptyRestaurantForm)

  async function loadLinks() {
    const { data } = await supabase
      .from('event_suppliers')
      .select('*')
      .eq('event_id', event.id)
    setLinks((data ?? []) as EventSupplierLink[])
    setLoading(false)
  }

  useEffect(() => { loadLinks() }, [event.id])

  const linkedIds = links.map(l => l.supplier_id)

  async function handleLink(supplierId: string) {
    const { error } = await supabase
      .from('event_suppliers')
      .insert({ event_id: event.id, supplier_id: supplierId })
    if (!error) {
      setAdding(false)
      setSearch('')
      await loadLinks()
    }
  }

  async function handleUnlink(supplierId: string) {
    await supabase.from('event_supplier_services').delete()
      .eq('event_id', event.id).eq('supplier_id', supplierId)
    await supabase.from('event_hotel_details').delete()
      .eq('event_id', event.id).eq('supplier_id', supplierId)
    await supabase.from('event_restaurant_details').delete()
      .eq('event_id', event.id).eq('supplier_id', supplierId)
    const { error } = await supabase
      .from('event_suppliers')
      .delete()
      .eq('event_id', event.id)
      .eq('supplier_id', supplierId)
    if (!error) {
      setLinks(prev => prev.filter(l => l.supplier_id !== supplierId))
      if (managingServices === supplierId) setManagingServices(null)
      if (managingHotel === supplierId) setManagingHotel(null)
      if (managingRestaurant === supplierId) setManagingRestaurant(null)
    }
  }

  async function openServices(supplierId: string) {
    setManagingServices(supplierId)
    setShowSvcForm(false)
    setEditingSvcId(null)
    const { data } = await supabase
      .from('event_supplier_services')
      .select('*')
      .eq('event_id', event.id)
      .eq('supplier_id', supplierId)
      .order('data', { ascending: true })
      .order('ora_inizio', { ascending: true })
    setServices((data ?? []) as SupplierService[])
  }

  function openNewSvc() {
    setSvcForm(emptySvcForm)
    setEditingSvcId(null)
    setShowSvcForm(true)
  }

  function openEditSvc(svc: SupplierService) {
    setSvcForm({
      titolo: svc.titolo,
      categoria: svc.categoria,
      data: svc.data ?? '',
      ora_inizio: svc.ora_inizio?.slice(0, 5) ?? '',
      ora_fine: svc.ora_fine?.slice(0, 5) ?? '',
      luogo: svc.luogo,
      partenza: svc.partenza,
      destinazione: svc.destinazione,
      note: svc.note,
      costo_unitario: svc.costo_unitario?.toString() ?? '',
      quantita: svc.quantita?.toString() ?? '1',
      costo_totale: svc.costo_totale?.toString() ?? '',
      venduto_unitario: svc.venduto_unitario?.toString() ?? '',
      venduto_totale: svc.venduto_totale?.toString() ?? '',
    })
    setEditingSvcId(svc.id)
    setShowSvcForm(true)
  }

  async function saveSvc() {
    if (!svcForm.titolo.trim() || !managingServices) return
    const qty = svcForm.quantita ? parseInt(svcForm.quantita) : 1
    const unitCost = svcForm.costo_unitario ? parseFloat(svcForm.costo_unitario) : null
    const unitVenduto = svcForm.venduto_unitario ? parseFloat(svcForm.venduto_unitario) : null
    const payload = {
      event_id: event.id,
      supplier_id: managingServices,
      titolo: svcForm.titolo.trim(),
      categoria: svcForm.categoria,
      data: svcForm.data || null,
      ora_inizio: svcForm.ora_inizio || null,
      ora_fine: svcForm.ora_fine || null,
      luogo: svcForm.luogo.trim(),
      partenza: svcForm.partenza.trim(),
      destinazione: svcForm.destinazione.trim(),
      note: svcForm.note.trim(),
      costo_unitario: unitCost,
      quantita: qty,
      costo_totale: svcForm.costo_totale ? parseFloat(svcForm.costo_totale) : (unitCost ? unitCost * qty : null),
      venduto_unitario: unitVenduto,
      venduto_totale: svcForm.venduto_totale ? parseFloat(svcForm.venduto_totale) : (unitVenduto ? unitVenduto * qty : null),
    }
    if (editingSvcId) {
      await supabase.from('event_supplier_services').update(payload).eq('id', editingSvcId)
    } else {
      await supabase.from('event_supplier_services').insert(payload)
    }
    setShowSvcForm(false)
    setEditingSvcId(null)
    await openServices(managingServices)
  }

  async function deleteSvc(id: string) {
    if (!managingServices) return
    await supabase.from('event_supplier_services').delete().eq('id', id)
    await openServices(managingServices)
  }

  async function openHotel(supplierId: string) {
    setManagingHotel(supplierId)
    setManagingServices(null)
    setShowHotelForm(false)
    setEditingHotelId(null)
    const { data } = await supabase
      .from('event_hotel_details')
      .select('*')
      .eq('event_id', event.id)
      .eq('supplier_id', supplierId)
      .order('data', { ascending: true })
      .order('ora_inizio', { ascending: true })
    setHotelDetails((data ?? []) as HotelDetail[])
  }

  function openNewHotel(tipo: string) {
    setHotelForm(emptyHotelForm)
    setEditingHotelId(null)
    setHotelFormTipo(tipo)
    setShowHotelForm(true)
  }

  function openEditHotel(h: HotelDetail) {
    setHotelForm({
      titolo: h.titolo,
      data: h.data ?? '',
      ora_inizio: h.ora_inizio?.slice(0, 5) ?? '',
      ora_fine: h.ora_fine?.slice(0, 5) ?? '',
      check_in_date: h.check_in_date ?? '',
      check_in_time: h.check_in_time?.slice(0, 5) ?? '',
      check_out_date: h.check_out_date ?? '',
      check_out_time: h.check_out_time?.slice(0, 5) ?? '',
      luogo: h.luogo,
      quantita: h.quantita?.toString() ?? '',
      note: h.note,
      room_type: h.room_type ?? '',
      meeting_pax: h.meeting_pax?.toString() ?? '',
      meeting_setup: h.meeting_setup ?? '',
      meeting_equipment: h.meeting_equipment ?? '',
      natural_light: h.natural_light ?? false,
      costo_unitario: h.costo_unitario?.toString() ?? '',
      costo_totale: h.costo_totale?.toString() ?? '',
      venduto_unitario: h.venduto_unitario?.toString() ?? '',
      venduto_totale: h.venduto_totale?.toString() ?? '',
    })
    setEditingHotelId(h.id)
    setHotelFormTipo(h.tipo)
    setShowHotelForm(true)
  }

  async function saveHotel() {
    if (!managingHotel || !hotelFormTipo) return
    const isPernottamento = hotelFormTipo === 'pernottamento'
    const isMeeting = hotelFormTipo === 'sala_meeting'
    const payload = {
      event_id: event.id,
      supplier_id: managingHotel,
      tipo: hotelFormTipo,
      titolo: hotelForm.titolo.trim(),
      data: isPernottamento ? null : (hotelForm.data || null),
      ora_inizio: isPernottamento ? null : (hotelForm.ora_inizio || null),
      ora_fine: isPernottamento ? null : (hotelForm.ora_fine || null),
      check_in_date: isPernottamento ? (hotelForm.check_in_date || null) : null,
      check_in_time: isPernottamento ? (hotelForm.check_in_time || null) : null,
      check_out_date: isPernottamento ? (hotelForm.check_out_date || null) : null,
      check_out_time: isPernottamento ? (hotelForm.check_out_time || null) : null,
      luogo: hotelForm.luogo.trim(),
      quantita: hotelForm.quantita ? parseInt(hotelForm.quantita) : null,
      note: hotelForm.note.trim(),
      room_type: isPernottamento ? hotelForm.room_type.trim() : '',
      meeting_pax: isMeeting && hotelForm.meeting_pax ? parseInt(hotelForm.meeting_pax) : null,
      meeting_setup: isMeeting ? hotelForm.meeting_setup.trim() : '',
      meeting_equipment: isMeeting ? hotelForm.meeting_equipment.trim() : '',
      natural_light: isMeeting ? hotelForm.natural_light : false,
      costo_unitario: hotelForm.costo_unitario ? parseFloat(hotelForm.costo_unitario) : null,
      costo_totale: hotelForm.costo_totale ? parseFloat(hotelForm.costo_totale)
        : (hotelForm.costo_unitario && hotelForm.quantita ? parseFloat(hotelForm.costo_unitario) * parseInt(hotelForm.quantita) : null),
      venduto_unitario: hotelForm.venduto_unitario ? parseFloat(hotelForm.venduto_unitario) : null,
      venduto_totale: hotelForm.venduto_totale ? parseFloat(hotelForm.venduto_totale)
        : (hotelForm.venduto_unitario && hotelForm.quantita ? parseFloat(hotelForm.venduto_unitario) * parseInt(hotelForm.quantita) : null),
    }
    if (editingHotelId) {
      await supabase.from('event_hotel_details').update(payload).eq('id', editingHotelId)
    } else {
      await supabase.from('event_hotel_details').insert(payload)
    }
    setShowHotelForm(false)
    setEditingHotelId(null)
    await openHotel(managingHotel)
  }

  async function deleteHotel(id: string) {
    if (!managingHotel) return
    await supabase.from('event_hotel_details').delete().eq('id', id)
    await openHotel(managingHotel)
  }

  async function openRestaurant(supplierId: string) {
    setManagingRestaurant(supplierId)
    setManagingServices(null)
    setManagingHotel(null)
    const { data } = await supabase
      .from('event_restaurant_details')
      .select('*')
      .eq('event_id', event.id)
      .eq('supplier_id', supplierId)
      .maybeSingle()
    if (data) {
      setRestaurantDetail(data as RestaurantDetail)
      setRestaurantForm({
        data: data.data ?? '',
        ora_inizio: data.ora_inizio?.slice(0, 5) ?? '',
        ora_fine: data.ora_fine?.slice(0, 5) ?? '',
        pax_previsti: data.pax_previsti?.toString() ?? '',
        pax_confermati: data.pax_confermati?.toString() ?? '',
        tipologia_servizio: data.tipologia_servizio ?? '',
        menu_portate: data.menu_portate ?? '',
        menu_descrizione: data.menu_descrizione ?? '',
        budget_per_persona: data.budget_per_persona?.toString() ?? '',
        budget_totale: data.budget_totale?.toString() ?? '',
        costo_per_persona: data.costo_per_persona?.toString() ?? '',
        costo_totale_reale: data.costo_totale_reale?.toString() ?? '',
        area_riservata: data.area_riservata ?? false,
        sala_privata: data.sala_privata ?? false,
        esclusiva_parziale: data.esclusiva_parziale ?? false,
        esclusiva_totale: data.esclusiva_totale ?? false,
        nome_sala: data.nome_sala ?? '',
        note_location: data.note_location ?? '',
        num_vegetariani: data.num_vegetariani?.toString() ?? '',
        num_vegani: data.num_vegani?.toString() ?? '',
        allergie: data.allergie ?? '',
        intolleranze: data.intolleranze ?? '',
        note_alimentari: data.note_alimentari ?? '',
        setup_tavoli: data.setup_tavoli ?? '',
        branding_cliente: data.branding_cliente ?? '',
        richieste_speciali: data.richieste_speciali ?? '',
        note_operative: data.note_operative ?? '',
      })
    } else {
      setRestaurantDetail(null)
      setRestaurantForm(emptyRestaurantForm)
    }
  }

  async function saveRestaurant() {
    if (!managingRestaurant) return
    const paxConf = restaurantForm.pax_confermati ? parseInt(restaurantForm.pax_confermati) : null
    const budgetPP = restaurantForm.budget_per_persona ? parseFloat(restaurantForm.budget_per_persona) : null
    const autoTotal = paxConf && budgetPP ? paxConf * budgetPP : null
    const costoPP = restaurantForm.costo_per_persona ? parseFloat(restaurantForm.costo_per_persona) : null
    const autoCostoTotal = paxConf && costoPP ? paxConf * costoPP : null
    const payload = {
      event_id: event.id,
      supplier_id: managingRestaurant,
      data: restaurantForm.data || null,
      ora_inizio: restaurantForm.ora_inizio || null,
      ora_fine: restaurantForm.ora_fine || null,
      pax_previsti: restaurantForm.pax_previsti ? parseInt(restaurantForm.pax_previsti) : null,
      pax_confermati: paxConf,
      tipologia_servizio: restaurantForm.tipologia_servizio,
      menu_portate: restaurantForm.menu_portate,
      menu_descrizione: restaurantForm.menu_descrizione,
      budget_per_persona: budgetPP,
      budget_totale: restaurantForm.budget_totale ? parseFloat(restaurantForm.budget_totale) : autoTotal,
      costo_per_persona: costoPP,
      costo_totale_reale: restaurantForm.costo_totale_reale ? parseFloat(restaurantForm.costo_totale_reale) : autoCostoTotal,
      area_riservata: restaurantForm.area_riservata,
      sala_privata: restaurantForm.sala_privata,
      esclusiva_parziale: restaurantForm.esclusiva_parziale,
      esclusiva_totale: restaurantForm.esclusiva_totale,
      nome_sala: restaurantForm.nome_sala,
      note_location: restaurantForm.note_location,
      num_vegetariani: restaurantForm.num_vegetariani ? parseInt(restaurantForm.num_vegetariani) : null,
      num_vegani: restaurantForm.num_vegani ? parseInt(restaurantForm.num_vegani) : null,
      allergie: restaurantForm.allergie,
      intolleranze: restaurantForm.intolleranze,
      note_alimentari: restaurantForm.note_alimentari,
      setup_tavoli: restaurantForm.setup_tavoli,
      branding_cliente: restaurantForm.branding_cliente,
      richieste_speciali: restaurantForm.richieste_speciali,
      note_operative: restaurantForm.note_operative,
    }
    if (restaurantDetail) {
      await supabase.from('event_restaurant_details').update(payload).eq('id', restaurantDetail.id)
    } else {
      await supabase.from('event_restaurant_details').insert(payload)
    }
    await openRestaurant(managingRestaurant)
  }

  const linkedSuppliers = suppliers.filter(s => linkedIds.includes(s.id))
  const availableSuppliers = suppliers.filter(s =>
    !linkedIds.includes(s.id) &&
    (search === '' || s.nome.toLowerCase().includes(search.toLowerCase()) || s.categoria.toLowerCase().includes(search.toLowerCase()))
  )

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</div></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--muted)' }}>
          Fornitori collegati ({linkedSuppliers.length})
        </p>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(208,0,58,0.12)', color: 'var(--red2)', border: '1px solid rgba(208,0,58,0.35)' }}>
            <Plus className="w-3.5 h-3.5" /> Collega fornitore
          </button>
        )}
      </div>

      {adding && (
        <div className="panel p-4 space-y-3" style={{ border: '1px solid rgba(208,0,58,0.2)' }}>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca fornitore per nome o categoria..."
              className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              autoFocus />
            <button onClick={() => { setAdding(false); setSearch('') }}
              className="p-1.5 rounded-lg" style={{ color: 'var(--muted)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {availableSuppliers.length === 0 ? (
              <p className="text-xs p-2" style={{ color: 'var(--muted)' }}>
                {suppliers.length === 0 ? 'Nessun fornitore nel sistema' : 'Nessun fornitore trovato'}
              </p>
            ) : availableSuppliers.slice(0, 10).map(s => (
              <button key={s.id} onClick={() => handleLink(s.id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-white/5"
                style={{ border: '1px solid var(--line)' }}>
                <Truck className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red2)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{s.nome}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{s.categoria} · {s.location}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {linkedSuppliers.length === 0 && !adding ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun fornitore collegato a questo evento</p>
          <p className="text-xs mt-1">Usa il pulsante "Collega fornitore" per aggiungerne uno</p>
        </div>
      ) : (
        <div className="space-y-3">
          {linkedSuppliers.map(sup => {
            const isHotel = isHotelSupplier(sup)
            const isRestaurant = !isHotel && isRestaurantSupplier(sup)
            const isManaging = isHotel ? managingHotel === sup.id : isRestaurant ? managingRestaurant === sup.id : managingServices === sup.id
            return (
              <div key={sup.id} className="panel overflow-hidden" style={{ border: `1px solid ${isManaging ? 'var(--red2)' : 'var(--line)'}` }}>
                <div className="p-5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 cursor-pointer" onClick={() => setViewingSupplier(sup)}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(208,0,58,0.1)' }}>
                      <Truck className="w-6 h-6" style={{ color: 'var(--red2)' }} />
                    </div>
                    <div>
                      <p className="font-semibold" style={{ color: 'var(--text)' }}>{sup.nome}</p>
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>{sup.categoria} · {sup.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isHotel ? (
                      <button onClick={() => isManaging ? setManagingHotel(null) : openHotel(sup.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/10"
                        style={{ border: '1px solid var(--line)', color: isManaging ? 'var(--red2)' : 'var(--muted)' }}>
                        <Building2 className="w-3.5 h-3.5 inline mr-1" />
                        Scheda Hotel
                      </button>
                    ) : isRestaurant ? (
                      <button onClick={() => isManaging ? setManagingRestaurant(null) : openRestaurant(sup.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/10"
                        style={{ border: '1px solid var(--line)', color: isManaging ? 'var(--red2)' : 'var(--muted)' }}>
                        <UtensilsCrossed className="w-3.5 h-3.5 inline mr-1" />
                        Scheda Ristorante
                      </button>
                    ) : (
                      <button onClick={() => isManaging ? setManagingServices(null) : openServices(sup.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/10"
                        style={{ border: '1px solid var(--line)', color: isManaging ? 'var(--red2)' : 'var(--muted)' }}>
                        <Zap className="w-3.5 h-3.5 inline mr-1" />
                        Gestisci Servizi
                      </button>
                    )}
                    <button onClick={() => handleUnlink(sup.id)}
                      className="p-1.5 rounded-lg transition-all hover:bg-white/10" title="Rimuovi collegamento">
                      <X className="w-4 h-4" style={{ color: 'var(--red2)' }} />
                    </button>
                  </div>
                </div>

                {/* Hotel panel */}
                {isHotel && isManaging && (
                  <div className="px-5 pb-5 pt-2 space-y-5" style={{ borderTop: '1px solid var(--line)' }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                        Scheda Hotel
                      </p>
                    </div>

                    {/* Section buttons */}
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => openNewHotel('pernottamento')}
                        className="px-3 py-2.5 rounded-lg text-xs font-medium text-center transition-all hover:bg-white/10"
                        style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
                        + Pernottamento
                      </button>
                      <button onClick={() => openNewHotel('sala_meeting')}
                        className="px-3 py-2.5 rounded-lg text-xs font-medium text-center transition-all hover:bg-white/10"
                        style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
                        + Meeting
                      </button>
                      <div className="relative">
                        <select
                          onChange={e => { if (e.target.value) { openNewHotel(e.target.value); e.target.value = '' } }}
                          defaultValue=""
                          className="w-full px-3 py-2.5 rounded-lg text-xs font-medium text-center transition-all appearance-none cursor-pointer"
                          style={{ border: '1px solid var(--line)', color: 'var(--text)', background: 'transparent' }}>
                          <option value="" disabled>+ F&B / Altro</option>
                          <option value="coffee_break">Coffee Break</option>
                          <option value="lunch">Lunch</option>
                          <option value="dinner">Dinner</option>
                          <option value="coffee_station">Coffee Station</option>
                          <option value="setup_sala">Setup Sala</option>
                          <option value="attrezzature">Attrezzature</option>
                        </select>
                      </div>
                    </div>

                    {/* Form */}
                    {showHotelForm && (
                      <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                        <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                          {editingHotelId ? 'Modifica' : 'Nuovo'}: {HOTEL_TIPOS.find(t => t.value === hotelFormTipo)?.label}
                        </p>

                        {/* PERNOTTAMENTO form */}
                        {hotelFormTipo === 'pernottamento' && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Check-in data *</label>
                              <input type="date" value={hotelForm.check_in_date} onChange={e => setHotelForm(p => ({ ...p, check_in_date: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Check-out data *</label>
                              <input type="date" value={hotelForm.check_out_date} onChange={e => setHotelForm(p => ({ ...p, check_out_date: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>N. Camere</label>
                              <input type="number" value={hotelForm.quantita} onChange={e => setHotelForm(p => ({ ...p, quantita: e.target.value }))}
                                placeholder="Es. 26"
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Tipologia camera</label>
                              <input type="text" value={hotelForm.room_type} onChange={e => setHotelForm(p => ({ ...p, room_type: e.target.value }))}
                                placeholder="Es. DUS, DUP, Suite"
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Check-in ora</label>
                              <input type="time" value={hotelForm.check_in_time} onChange={e => setHotelForm(p => ({ ...p, check_in_time: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Check-out ora</label>
                              <input type="time" value={hotelForm.check_out_time} onChange={e => setHotelForm(p => ({ ...p, check_out_time: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Note pernottamento</label>
                              <textarea value={hotelForm.note} onChange={e => setHotelForm(p => ({ ...p, note: e.target.value }))}
                                rows={2} placeholder="Richieste particolari, allergeni, late check-out..."
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm resize-none"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                          </div>
                        )}

                        {/* MEETING form */}
                        {hotelFormTipo === 'sala_meeting' && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Data *</label>
                              <input type="date" value={hotelForm.data} onChange={e => setHotelForm(p => ({ ...p, data: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Ora inizio *</label>
                              <input type="time" value={hotelForm.ora_inizio} onChange={e => setHotelForm(p => ({ ...p, ora_inizio: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Ora fine *</label>
                              <input type="time" value={hotelForm.ora_fine} onChange={e => setHotelForm(p => ({ ...p, ora_fine: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Sala</label>
                              <input type="text" value={hotelForm.luogo} onChange={e => setHotelForm(p => ({ ...p, luogo: e.target.value }))}
                                placeholder="Es. Sala Plenaria, Piano 1"
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>N. Pax</label>
                              <input type="number" value={hotelForm.meeting_pax} onChange={e => setHotelForm(p => ({ ...p, meeting_pax: e.target.value }))}
                                placeholder="26"
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Setup sala</label>
                              <select value={hotelForm.meeting_setup} onChange={e => setHotelForm(p => ({ ...p, meeting_setup: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                                <option value="">--</option>
                                <option value="teatro">Teatro</option>
                                <option value="platea">Platea</option>
                                <option value="tavolo_imperiale">Tavolo imperiale</option>
                                <option value="ferro_cavallo">Ferro di cavallo</option>
                                <option value="isole">Isole</option>
                                <option value="boardroom">Boardroom</option>
                                <option value="classe">Classe</option>
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Attrezzature tecniche</label>
                              <input type="text" value={hotelForm.meeting_equipment} onChange={e => setHotelForm(p => ({ ...p, meeting_equipment: e.target.value }))}
                                placeholder="Proiettore, lavagna, microfoni..."
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div className="flex items-end pb-1">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={hotelForm.natural_light} onChange={e => setHotelForm(p => ({ ...p, natural_light: e.target.checked }))}
                                  className="rounded" />
                                <span className="text-xs" style={{ color: 'var(--muted)' }}>Luce naturale</span>
                              </label>
                            </div>
                            <div className="sm:col-span-3">
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Note meeting</label>
                              <textarea value={hotelForm.note} onChange={e => setHotelForm(p => ({ ...p, note: e.target.value }))}
                                rows={2} placeholder="Esigenze particolari..."
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm resize-none"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                          </div>
                        )}

                        {/* F&B / OTHER form */}
                        {hotelFormTipo !== 'pernottamento' && hotelFormTipo !== 'sala_meeting' && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Data *</label>
                              <input type="date" value={hotelForm.data} onChange={e => setHotelForm(p => ({ ...p, data: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Ora *</label>
                              <input type="time" value={hotelForm.ora_inizio} onChange={e => setHotelForm(p => ({ ...p, ora_inizio: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Luogo / Sala</label>
                              <input type="text" value={hotelForm.luogo} onChange={e => setHotelForm(p => ({ ...p, luogo: e.target.value }))}
                                placeholder="Es. Foyer, Terrazza"
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>N. Persone</label>
                              <input type="number" value={hotelForm.quantita} onChange={e => setHotelForm(p => ({ ...p, quantita: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Note</label>
                              <input type="text" value={hotelForm.note} onChange={e => setHotelForm(p => ({ ...p, note: e.target.value }))}
                                placeholder="Menu, allergie, richieste..."
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                          </div>
                        )}

                        {/* Cost fields */}
                        <div className="pt-2 space-y-3" style={{ borderTop: '1px solid var(--line)' }}>
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--red2)' }}>Economica</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Venduto unit.</label>
                              <input type="number" step="0.01" value={hotelForm.venduto_unitario} onChange={e => setHotelForm(p => ({ ...p, venduto_unitario: e.target.value }))}
                                placeholder="0.00"
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Venduto totale</label>
                              <input type="number" step="0.01" value={hotelForm.venduto_totale} onChange={e => setHotelForm(p => ({ ...p, venduto_totale: e.target.value }))}
                                placeholder={hotelForm.venduto_unitario && hotelForm.quantita ? `Auto: ${(parseFloat(hotelForm.venduto_unitario) * parseInt(hotelForm.quantita || '1')).toFixed(2)}` : ''}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Costo unit.</label>
                              <input type="number" step="0.01" value={hotelForm.costo_unitario} onChange={e => setHotelForm(p => ({ ...p, costo_unitario: e.target.value }))}
                                placeholder="0.00"
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Costo totale</label>
                              <input type="number" step="0.01" value={hotelForm.costo_totale} onChange={e => setHotelForm(p => ({ ...p, costo_totale: e.target.value }))}
                                placeholder={hotelForm.costo_unitario && hotelForm.quantita ? `Auto: ${(parseFloat(hotelForm.costo_unitario) * parseInt(hotelForm.quantita || '1')).toFixed(2)}` : ''}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => { setShowHotelForm(false); setEditingHotelId(null) }} className="px-4 py-2 rounded-lg text-xs font-medium"
                            style={{ color: 'var(--muted)' }}>Annulla</button>
                          <button onClick={saveHotel} className="px-4 py-2 rounded-lg text-xs font-medium"
                            style={{ background: 'var(--red2)', color: '#fff' }}>
                            {editingHotelId ? 'Salva' : 'Aggiungi'}
                          </button>
                        </div>
                      </div>
                    )}

                    {hotelDetails.length === 0 && !showHotelForm && (
                      <p className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}>
                        Nessuna voce hotel. Usa i pulsanti sopra per aggiungere servizi.
                      </p>
                    )}

                    {/* Hotel items list grouped by section */}
                    {hotelDetails.length > 0 && (
                      <div className="space-y-3">
                        {/* Pernottamento section */}
                        {hotelDetails.filter(h => h.tipo === 'pernottamento').length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>
                              Pernottamento
                            </p>
                            {hotelDetails.filter(h => h.tipo === 'pernottamento').map(h => (
                              <div key={h.id} className="flex items-start gap-3 p-3 rounded-lg mb-1.5" style={{ background: 'var(--panel2)' }}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text)' }}>
                                    <span className="font-medium">IN {h.check_in_date}{h.check_in_time ? ` ${h.check_in_time.slice(0, 5)}` : ''}</span>
                                    <span style={{ color: 'var(--muted)' }}>→</span>
                                    <span className="font-medium">OUT {h.check_out_date}{h.check_out_time ? ` ${h.check_out_time.slice(0, 5)}` : ''}</span>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-xs flex-wrap" style={{ color: 'var(--muted)' }}>
                                    {h.quantita && <span>{h.quantita} camere</span>}
                                    {h.room_type && <span>{h.room_type}</span>}
                                  </div>
                                  {h.note && <p className="text-xs mt-1 italic" style={{ color: 'var(--muted)' }}>{h.note}</p>}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button onClick={() => openEditHotel(h)} className="p-1.5 rounded hover:bg-white/10">
                                    <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                                  </button>
                                  <button onClick={() => deleteHotel(h.id)} className="p-1.5 rounded hover:bg-white/10">
                                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Meeting section */}
                        {hotelDetails.filter(h => h.tipo === 'sala_meeting').length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>
                              Meeting
                            </p>
                            {hotelDetails.filter(h => h.tipo === 'sala_meeting').map(h => (
                              <div key={h.id} className="flex items-start gap-3 p-3 rounded-lg mb-1.5" style={{ background: 'var(--panel2)' }}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 text-sm flex-wrap" style={{ color: 'var(--text)' }}>
                                    <span className="font-medium">{h.data} {h.ora_inizio?.slice(0, 5)} - {h.ora_fine?.slice(0, 5)}</span>
                                    {h.luogo && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(208,0,58,0.08)', color: 'var(--red2)' }}>{h.luogo}</span>}
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-xs flex-wrap" style={{ color: 'var(--muted)' }}>
                                    {h.meeting_pax && <span>{h.meeting_pax} pax</span>}
                                    {h.meeting_setup && <span>Setup: {h.meeting_setup}</span>}
                                    {h.meeting_equipment && <span>{h.meeting_equipment}</span>}
                                    {h.natural_light && <span>Luce naturale</span>}
                                  </div>
                                  {h.note && <p className="text-xs mt-1 italic" style={{ color: 'var(--muted)' }}>{h.note}</p>}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button onClick={() => openEditHotel(h)} className="p-1.5 rounded hover:bg-white/10">
                                    <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                                  </button>
                                  <button onClick={() => deleteHotel(h.id)} className="p-1.5 rounded hover:bg-white/10">
                                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* F&B / Other section */}
                        {hotelDetails.filter(h => h.tipo !== 'pernottamento' && h.tipo !== 'sala_meeting').length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>
                              F&B / Servizi
                            </p>
                            {hotelDetails.filter(h => h.tipo !== 'pernottamento' && h.tipo !== 'sala_meeting').map(h => {
                              const tipoLabel = HOTEL_TIPOS.find(t => t.value === h.tipo)?.label ?? h.tipo
                              return (
                                <div key={h.id} className="flex items-start gap-3 p-3 rounded-lg mb-1.5" style={{ background: 'var(--panel2)' }}>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                                      <span className="font-medium">{tipoLabel}</span>
                                      {h.data && <span className="text-xs" style={{ color: 'var(--muted)' }}>{h.data} {h.ora_inizio?.slice(0, 5) ?? ''}</span>}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs flex-wrap" style={{ color: 'var(--muted)' }}>
                                      {h.luogo && <span>{h.luogo}</span>}
                                      {h.quantita && <span>{h.quantita} pax</span>}
                                    </div>
                                    {h.note && <p className="text-xs mt-1 italic" style={{ color: 'var(--muted)' }}>{h.note}</p>}
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button onClick={() => openEditHotel(h)} className="p-1.5 rounded hover:bg-white/10">
                                      <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                                    </button>
                                    <button onClick={() => deleteHotel(h.id)} className="p-1.5 rounded hover:bg-white/10">
                                      <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Restaurant panel */}
                {isRestaurant && isManaging && (
                  <div className="px-5 pb-5 pt-2 space-y-5" style={{ borderTop: '1px solid var(--line)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                      Scheda Ristorante
                    </p>

                    {/* Sezione 1: Informazioni Evento */}
                    <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--red2)' }}>Informazioni Evento</p>
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Data</label>
                          <input type="date" value={restaurantForm.data} onChange={e => setRestaurantForm(p => ({ ...p, data: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Ora inizio</label>
                          <input type="time" value={restaurantForm.ora_inizio} onChange={e => setRestaurantForm(p => ({ ...p, ora_inizio: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Ora fine</label>
                          <input type="time" value={restaurantForm.ora_fine} onChange={e => setRestaurantForm(p => ({ ...p, ora_fine: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Pax previsti</label>
                          <input type="number" value={restaurantForm.pax_previsti} onChange={e => setRestaurantForm(p => ({ ...p, pax_previsti: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Pax confermati</label>
                          <input type="number" value={restaurantForm.pax_confermati} onChange={e => setRestaurantForm(p => ({ ...p, pax_confermati: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                      </div>
                    </div>

                    {/* Sezione 2: Tipologia Servizio */}
                    <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--red2)' }}>Tipologia Servizio</p>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {['Pranzo', 'Cena', 'Aperitivo', 'Aperitivo Rinforzato', 'Cena di Gala'].map(tipo => (
                          <button key={tipo}
                            onClick={() => setRestaurantForm(p => ({ ...p, tipologia_servizio: tipo }))}
                            className="px-3 py-2 rounded-lg text-xs font-medium text-center transition-all"
                            style={{
                              border: `1px solid ${restaurantForm.tipologia_servizio === tipo ? 'var(--red2)' : 'var(--line)'}`,
                              background: restaurantForm.tipologia_servizio === tipo ? 'rgba(208,0,58,0.1)' : 'transparent',
                              color: restaurantForm.tipologia_servizio === tipo ? 'var(--red2)' : 'var(--text)',
                            }}>
                            {tipo}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sezione 3: Menu */}
                    <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--red2)' }}>Menu</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {['2 Portate', '3 Portate', '4 Portate', 'Menu Personalizzato'].map(m => (
                          <button key={m}
                            onClick={() => setRestaurantForm(p => ({ ...p, menu_portate: m }))}
                            className="px-3 py-2 rounded-lg text-xs font-medium text-center transition-all"
                            style={{
                              border: `1px solid ${restaurantForm.menu_portate === m ? 'var(--red2)' : 'var(--line)'}`,
                              background: restaurantForm.menu_portate === m ? 'rgba(208,0,58,0.1)' : 'transparent',
                              color: restaurantForm.menu_portate === m ? 'var(--red2)' : 'var(--text)',
                            }}>
                            {m}
                          </button>
                        ))}
                      </div>
                      <div>
                        <label className="text-xs" style={{ color: 'var(--muted)' }}>Descrizione menu</label>
                        <textarea value={restaurantForm.menu_descrizione} onChange={e => setRestaurantForm(p => ({ ...p, menu_descrizione: e.target.value }))}
                          rows={3} placeholder="Antipasto, primo, secondo, dessert..."
                          className="w-full mt-1 px-3 py-2 rounded-lg text-sm resize-none"
                          style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                      </div>
                    </div>

                    {/* Sezione 4: Economica */}
                    <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--red2)' }}>Economica</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Venduto /persona</label>
                          <input type="number" step="0.01" value={restaurantForm.budget_per_persona}
                            onChange={e => setRestaurantForm(p => ({ ...p, budget_per_persona: e.target.value }))}
                            placeholder="70.00"
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Venduto totale</label>
                          <input type="number" step="0.01" value={restaurantForm.budget_totale}
                            onChange={e => setRestaurantForm(p => ({ ...p, budget_totale: e.target.value }))}
                            placeholder={restaurantForm.pax_confermati && restaurantForm.budget_per_persona
                              ? `${(parseInt(restaurantForm.pax_confermati) * parseFloat(restaurantForm.budget_per_persona)).toFixed(2)}`
                              : 'Pax x Venduto/pax'}
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Costo /persona</label>
                          <input type="number" step="0.01" value={restaurantForm.costo_per_persona}
                            onChange={e => setRestaurantForm(p => ({ ...p, costo_per_persona: e.target.value }))}
                            placeholder="55.00"
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Costo totale</label>
                          <input type="number" step="0.01" value={restaurantForm.costo_totale_reale}
                            onChange={e => setRestaurantForm(p => ({ ...p, costo_totale_reale: e.target.value }))}
                            placeholder={restaurantForm.pax_confermati && restaurantForm.costo_per_persona
                              ? `${(parseInt(restaurantForm.pax_confermati) * parseFloat(restaurantForm.costo_per_persona)).toFixed(2)}`
                              : 'Pax x Costo/pax'}
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                      </div>
                    </div>

                    {/* Sezione 5: Privacy e Location */}
                    <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--red2)' }}>Privacy e Location</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={restaurantForm.area_riservata} onChange={e => setRestaurantForm(p => ({ ...p, area_riservata: e.target.checked }))} className="rounded" />
                          <span className="text-xs" style={{ color: 'var(--text)' }}>Area riservata</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={restaurantForm.sala_privata} onChange={e => setRestaurantForm(p => ({ ...p, sala_privata: e.target.checked }))} className="rounded" />
                          <span className="text-xs" style={{ color: 'var(--text)' }}>Sala privata</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={restaurantForm.esclusiva_parziale} onChange={e => setRestaurantForm(p => ({ ...p, esclusiva_parziale: e.target.checked }))} className="rounded" />
                          <span className="text-xs" style={{ color: 'var(--text)' }}>Esclusiva parziale</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={restaurantForm.esclusiva_totale} onChange={e => setRestaurantForm(p => ({ ...p, esclusiva_totale: e.target.checked }))} className="rounded" />
                          <span className="text-xs" style={{ color: 'var(--text)' }}>Esclusiva totale</span>
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Nome sala</label>
                          <input type="text" value={restaurantForm.nome_sala} onChange={e => setRestaurantForm(p => ({ ...p, nome_sala: e.target.value }))}
                            placeholder="Es. Sala degli Specchi"
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Note location</label>
                          <input type="text" value={restaurantForm.note_location} onChange={e => setRestaurantForm(p => ({ ...p, note_location: e.target.value }))}
                            placeholder="Piano, accesso, parcheggio..."
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                      </div>
                    </div>

                    {/* Sezione 6: Esigenze Alimentari */}
                    <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--red2)' }}>Esigenze Alimentari</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>N. Vegetariani</label>
                          <input type="number" value={restaurantForm.num_vegetariani} onChange={e => setRestaurantForm(p => ({ ...p, num_vegetariani: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>N. Vegani</label>
                          <input type="number" value={restaurantForm.num_vegani} onChange={e => setRestaurantForm(p => ({ ...p, num_vegani: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Allergie</label>
                          <input type="text" value={restaurantForm.allergie} onChange={e => setRestaurantForm(p => ({ ...p, allergie: e.target.value }))}
                            placeholder="Glutine, lattosio..."
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Intolleranze</label>
                          <input type="text" value={restaurantForm.intolleranze} onChange={e => setRestaurantForm(p => ({ ...p, intolleranze: e.target.value }))}
                            placeholder="Frutta a guscio..."
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs" style={{ color: 'var(--muted)' }}>Richieste alimentari particolari</label>
                        <textarea value={restaurantForm.note_alimentari} onChange={e => setRestaurantForm(p => ({ ...p, note_alimentari: e.target.value }))}
                          rows={2} placeholder="Esigenze specifiche, menu bambini..."
                          className="w-full mt-1 px-3 py-2 rounded-lg text-sm resize-none"
                          style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                      </div>
                    </div>

                    {/* Sezione 7: Note Operative */}
                    <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--red2)' }}>Note Operative</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Setup tavoli</label>
                          <input type="text" value={restaurantForm.setup_tavoli} onChange={e => setRestaurantForm(p => ({ ...p, setup_tavoli: e.target.value }))}
                            placeholder="Tavolo unico, tavoli rotondi..."
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Branding cliente</label>
                          <input type="text" value={restaurantForm.branding_cliente} onChange={e => setRestaurantForm(p => ({ ...p, branding_cliente: e.target.value }))}
                            placeholder="Segnaposto, centerpiece..."
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Richieste speciali</label>
                          <input type="text" value={restaurantForm.richieste_speciali} onChange={e => setRestaurantForm(p => ({ ...p, richieste_speciali: e.target.value }))}
                            placeholder="Torta, musica, DJ..."
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: 'var(--muted)' }}>Note operative</label>
                          <input type="text" value={restaurantForm.note_operative} onChange={e => setRestaurantForm(p => ({ ...p, note_operative: e.target.value }))}
                            placeholder="Indicazioni aggiuntive..."
                            className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                      </div>
                    </div>

                    {/* Save button */}
                    <div className="flex justify-end">
                      <button onClick={saveRestaurant}
                        className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
                        style={{ background: 'var(--red2)', color: '#fff' }}>
                        {restaurantDetail ? 'Salva modifiche' : 'Salva scheda'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Services panel (non-hotel, non-restaurant) */}
                {!isHotel && !isRestaurant && isManaging && (
                  <div className="px-5 pb-5 pt-2 space-y-4" style={{ borderTop: '1px solid var(--line)' }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                        Servizi operativi ({services.length})
                      </p>
                      <button onClick={openNewSvc} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
                        style={{ background: 'var(--red2)', color: '#fff' }}>
                        <Plus className="w-3 h-3" /> Nuovo servizio
                      </button>
                    </div>

                    {showSvcForm && (
                      <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                        <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                          {editingSvcId ? 'Modifica servizio' : 'Nuovo servizio'}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <label className="text-xs" style={{ color: 'var(--muted)' }}>Titolo *</label>
                            <input type="text" value={svcForm.titolo} onChange={e => setSvcForm(p => ({ ...p, titolo: e.target.value }))}
                              placeholder="Es. Transfer Aeroporto → Hotel"
                              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                          </div>
                          <div>
                            <label className="text-xs" style={{ color: 'var(--muted)' }}>Categoria</label>
                            <select value={svcForm.categoria} onChange={e => setSvcForm(p => ({ ...p, categoria: e.target.value }))}
                              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                              {SVC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs" style={{ color: 'var(--muted)' }}>Data</label>
                            <input type="date" value={svcForm.data} onChange={e => setSvcForm(p => ({ ...p, data: e.target.value }))}
                              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                          </div>
                          <div>
                            <label className="text-xs" style={{ color: 'var(--muted)' }}>Ora inizio</label>
                            <input type="time" value={svcForm.ora_inizio} onChange={e => setSvcForm(p => ({ ...p, ora_inizio: e.target.value }))}
                              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                          </div>
                          <div>
                            <label className="text-xs" style={{ color: 'var(--muted)' }}>Ora fine</label>
                            <input type="time" value={svcForm.ora_fine} onChange={e => setSvcForm(p => ({ ...p, ora_fine: e.target.value }))}
                              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                          </div>
                          <div>
                            <label className="text-xs" style={{ color: 'var(--muted)' }}>Luogo</label>
                            <input type="text" value={svcForm.luogo} onChange={e => setSvcForm(p => ({ ...p, luogo: e.target.value }))}
                              placeholder="Es. Hotel Continental"
                              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                          </div>
                          <div>
                            <label className="text-xs" style={{ color: 'var(--muted)' }}>Partenza</label>
                            <input type="text" value={svcForm.partenza} onChange={e => setSvcForm(p => ({ ...p, partenza: e.target.value }))}
                              placeholder="Es. Milano Linate"
                              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                          </div>
                          <div>
                            <label className="text-xs" style={{ color: 'var(--muted)' }}>Destinazione</label>
                            <input type="text" value={svcForm.destinazione} onChange={e => setSvcForm(p => ({ ...p, destinazione: e.target.value }))}
                              placeholder="Es. Hotel Continental"
                              className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="text-xs" style={{ color: 'var(--muted)' }}>Note operative</label>
                            <textarea value={svcForm.note} onChange={e => setSvcForm(p => ({ ...p, note: e.target.value }))}
                              rows={2} placeholder="Note aggiuntive..."
                              className="w-full mt-1 px-3 py-2 rounded-lg text-sm resize-none"
                              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                          </div>
                        </div>
                        {/* Cost fields */}
                        <div className="pt-2 space-y-3" style={{ borderTop: '1px solid var(--line)' }}>
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--red2)' }}>Economica</p>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Quantita</label>
                              <input type="number" value={svcForm.quantita} onChange={e => setSvcForm(p => ({ ...p, quantita: e.target.value }))}
                                placeholder="1"
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Venduto unit.</label>
                              <input type="number" step="0.01" value={svcForm.venduto_unitario} onChange={e => setSvcForm(p => ({ ...p, venduto_unitario: e.target.value }))}
                                placeholder="0.00"
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Venduto totale</label>
                              <input type="number" step="0.01" value={svcForm.venduto_totale} onChange={e => setSvcForm(p => ({ ...p, venduto_totale: e.target.value }))}
                                placeholder={svcForm.venduto_unitario && svcForm.quantita ? `${(parseFloat(svcForm.venduto_unitario) * parseInt(svcForm.quantita || '1')).toFixed(2)}` : ''}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Costo unit.</label>
                              <input type="number" step="0.01" value={svcForm.costo_unitario} onChange={e => setSvcForm(p => ({ ...p, costo_unitario: e.target.value }))}
                                placeholder="0.00"
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                            <div>
                              <label className="text-xs" style={{ color: 'var(--muted)' }}>Costo totale</label>
                              <input type="number" step="0.01" value={svcForm.costo_totale} onChange={e => setSvcForm(p => ({ ...p, costo_totale: e.target.value }))}
                                placeholder={svcForm.costo_unitario && svcForm.quantita ? `${(parseFloat(svcForm.costo_unitario) * parseInt(svcForm.quantita || '1')).toFixed(2)}` : ''}
                                className="w-full mt-1 px-3 py-2 rounded-lg text-sm"
                                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => { setShowSvcForm(false); setEditingSvcId(null) }} className="px-4 py-2 rounded-lg text-xs font-medium"
                            style={{ color: 'var(--muted)' }}>Annulla</button>
                          <button onClick={saveSvc} className="px-4 py-2 rounded-lg text-xs font-medium"
                            style={{ background: 'var(--red2)', color: '#fff', opacity: !svcForm.titolo.trim() ? 0.5 : 1 }}>
                            {editingSvcId ? 'Salva' : 'Aggiungi'}
                          </button>
                        </div>
                      </div>
                    )}

                    {services.length === 0 && !showSvcForm && (
                      <p className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}>
                        Nessun servizio operativo. Aggiungi i servizi per questo fornitore.
                      </p>
                    )}

                    {services.length > 0 && (
                      <div className="space-y-2">
                        {services.map(svc => (
                          <div key={svc.id} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--panel2)' }}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{svc.titolo}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full"
                                  style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>
                                  {SVC_CATEGORIES.find(c => c.value === svc.categoria)?.label ?? svc.categoria}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                                {svc.data && <span>{svc.data} {svc.ora_inizio?.slice(0, 5) ?? ''}{svc.ora_fine ? ` - ${svc.ora_fine.slice(0, 5)}` : ''}</span>}
                                {svc.partenza && svc.destinazione && <span>{svc.partenza} → {svc.destinazione}</span>}
                                {svc.luogo && !svc.partenza && <span>{svc.luogo}</span>}
                              </div>
                              {svc.note && <p className="text-xs mt-1 italic" style={{ color: 'var(--muted)' }}>{svc.note}</p>}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => openEditSvc(svc)} className="p-1.5 rounded hover:bg-white/10">
                                <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                              </button>
                              <button onClick={() => deleteSvc(svc.id)} className="p-1.5 rounded hover:bg-white/10">
                                <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {viewingSupplier && (
        <SupplierDetailModal supplier={viewingSupplier} onClose={() => setViewingSupplier(null)} />
      )}
    </div>
  )
}

function SupplierDetailModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(208,0,58,0.1)' }}>
              <Truck className="w-7 h-7" style={{ color: 'var(--red2)' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{supplier.nome}</h2>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{supplier.categoria}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition-all hover:bg-white/5">
            <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <DetailField label="Email" value={supplier.email} />
            <DetailField label="Telefono" value={supplier.telefono} />
            <DetailField label="Referente" value={supplier.referente} />
            <DetailField label="Tel. Referente" value={supplier.referenteTelefono} />
            <DetailField label="Location" value={supplier.location} />
            <DetailField label="Sito Web" value={supplier.sito} />
            <DetailField label="P.IVA" value={supplier.piva} />
            <DetailField label="Stato" value={supplier.stato === 'attivo' ? 'Attivo' : 'Inattivo'} />
          </div>

          {supplier.servizi.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide font-medium mb-2" style={{ color: 'var(--muted)' }}>Servizi</p>
              <div className="flex flex-wrap gap-1.5">
                {supplier.servizi.map(s => (
                  <span key={s} className="text-xs px-2.5 py-1 rounded-lg"
                    style={{ background: 'var(--panel2)', color: 'var(--text)' }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="text-center p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Rating</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--yellow)' }}>{supplier.rating}/5</p>
            </div>
            <div className="text-center p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Contratto</p>
              <p className="text-sm font-semibold mt-1" style={{
                color: supplier.statoContratto === 'attivo' ? 'var(--green)' : supplier.statoContratto === 'in_scadenza' ? 'var(--yellow)' : 'var(--red2)'
              }}>{supplier.statoContratto}</p>
            </div>
            <div className="text-center p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Costo medio</p>
              <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text)' }}>
                {supplier.costoMedioPerEvento > 0 ? `€${supplier.costoMedioPerEvento.toLocaleString('it-IT')}` : 'N/D'}
              </p>
            </div>
          </div>

          {supplier.noteOperative && (
            <div>
              <p className="text-xs uppercase tracking-wide font-medium mb-2" style={{ color: 'var(--muted)' }}>Note operative</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{supplier.noteOperative}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-sm mt-0.5" style={{ color: value ? 'var(--text)' : 'var(--muted)' }}>
        {value || 'Non inserito'}
      </p>
    </div>
  )
}

function TabBudget({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [lines, setLines] = useState<{ categoria: string; items: { titolo: string; fornitore: string; qty: number; venduto: number; costo: number; margine: number; marginePct: number }[] }[]>([])
  const [totals, setTotals] = useState({ venduto: 0, costo: 0, margine: 0, marginePct: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [svcRes, hotelRes, restRes] = await Promise.all([
        supabase.from('event_supplier_services').select('*').eq('event_id', event.id),
        supabase.from('event_hotel_details').select('*').eq('event_id', event.id),
        supabase.from('event_restaurant_details').select('*').eq('event_id', event.id),
      ])
      const grouped: Record<string, { titolo: string; fornitore: string; qty: number; venduto: number; costo: number; margine: number; marginePct: number }[]> = {}

      for (const s of (svcRes.data ?? []) as SupplierService[]) {
        const qty = s.quantita ?? 1
        const venduto = s.venduto_totale ?? (s.venduto_unitario ? s.venduto_unitario * qty : 0)
        const costo = s.costo_totale ?? (s.costo_unitario ? s.costo_unitario * qty : 0)
        if (!venduto && !costo) continue
        const margine = venduto - costo
        const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
        const cat = suppliers.find(sup => sup.id === s.supplier_id)?.categoria ?? 'Altro'
        if (!grouped[cat]) grouped[cat] = []
        grouped[cat].push({ titolo: s.titolo, fornitore: suppliers.find(sup => sup.id === s.supplier_id)?.nome ?? '', qty, venduto, costo, margine, marginePct })
      }

      for (const h of (hotelRes.data ?? []) as HotelDetail[]) {
        const qty = h.quantita ?? 1
        const venduto = h.venduto_totale ?? (h.venduto_unitario ? h.venduto_unitario * qty : 0)
        const costo = h.costo_totale ?? (h.costo_unitario ? h.costo_unitario * qty : 0)
        if (!venduto && !costo) continue
        const margine = venduto - costo
        const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
        const label = h.titolo || HOTEL_TIPOS.find(t => t.value === h.tipo)?.label || h.tipo
        if (!grouped['Hotel']) grouped['Hotel'] = []
        grouped['Hotel'].push({ titolo: label, fornitore: suppliers.find(sup => sup.id === h.supplier_id)?.nome ?? '', qty, venduto, costo, margine, marginePct })
      }

      for (const r of (restRes.data ?? []) as RestaurantDetail[]) {
        const pax = r.pax_confermati ?? r.pax_previsti ?? 1
        const venduto = r.budget_totale ? Number(r.budget_totale) : (r.budget_per_persona ? Number(r.budget_per_persona) * pax : 0)
        const costo = r.costo_totale_reale ? Number(r.costo_totale_reale) : (r.costo_per_persona ? Number(r.costo_per_persona) * pax : 0)
        if (!venduto && !costo) continue
        const margine = venduto - costo
        const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
        const label = r.tipologia_servizio || 'Servizio ristorante'
        if (!grouped['Ristorante']) grouped['Ristorante'] = []
        grouped['Ristorante'].push({ titolo: label, fornitore: suppliers.find(sup => sup.id === r.supplier_id)?.nome ?? '', qty: pax, venduto, costo, margine, marginePct })
      }

      const result = Object.entries(grouped).map(([categoria, items]) => ({ categoria, items }))
      result.sort((a, b) => a.categoria.localeCompare(b.categoria))
      setLines(result)

      const totVenduto = result.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.venduto, 0), 0)
      const totCosto = result.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.costo, 0), 0)
      const totMargine = totVenduto - totCosto
      const totMarginePct = totVenduto > 0 ? (totMargine / totVenduto) * 100 : 0
      setTotals({ venduto: totVenduto, costo: totCosto, margine: totMargine, marginePct: totMarginePct })
      setLoading(false)
    }
    load()
  }, [event.id, suppliers])

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento budget...</div></div>
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="panel p-4 text-center">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Venduto Cliente</p>
          <p className="text-xl font-bold mt-1" style={{ color: 'var(--text)' }}>{'\u20AC'}{totals.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="panel p-4 text-center">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Costi Reali</p>
          <p className="text-xl font-bold mt-1" style={{ color: 'var(--yellow)' }}>{'\u20AC'}{totals.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="panel p-4 text-center">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Margine</p>
          <p className="text-xl font-bold mt-1" style={{ color: totals.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{totals.margine.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="panel p-4 text-center">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Margine %</p>
          <p className="text-xl font-bold mt-1" style={{ color: totals.marginePct >= 20 ? 'var(--green)' : totals.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }}>{totals.marginePct.toFixed(1)}%</p>
        </div>
      </div>

      {/* Margin bar */}
      {totals.venduto > 0 && (
        <div className="panel p-5">
          <div className="flex justify-between text-xs mb-2">
            <span style={{ color: 'var(--muted)' }}>Margine operativo</span>
            <span style={{ color: totals.marginePct >= 20 ? 'var(--green)' : 'var(--yellow)' }}>{totals.marginePct.toFixed(1)}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(Math.max(totals.marginePct, 0), 100)}%`, background: totals.marginePct >= 20 ? 'var(--green)' : totals.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }} />
          </div>
        </div>
      )}

      {/* Categories breakdown */}
      {lines.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Euro className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun dato economico</p>
          <p className="text-xs mt-1">Inserisci venduto e costo nei servizi operativi (tab Fornitori)</p>
        </div>
      ) : (
        <div className="space-y-4">
          {lines.map(group => {
            const catVenduto = group.items.reduce((s, i) => s + i.venduto, 0)
            const catCosto = group.items.reduce((s, i) => s + i.costo, 0)
            const catMargine = catVenduto - catCosto
            const catMarginePct = catVenduto > 0 ? (catMargine / catVenduto) * 100 : 0
            return (
              <div key={group.categoria} className="panel overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--panel2)' }}>
                  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{group.categoria}</p>
                  <div className="flex items-center gap-4 text-xs">
                    <span style={{ color: 'var(--muted)' }}>V: <strong style={{ color: 'var(--text)' }}>{'\u20AC'}{catVenduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</strong></span>
                    <span style={{ color: 'var(--muted)' }}>C: <strong style={{ color: 'var(--yellow)' }}>{'\u20AC'}{catCosto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</strong></span>
                    <span style={{ color: 'var(--muted)' }}>M: <strong style={{ color: catMargine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{catMargine.toLocaleString('it-IT', { minimumFractionDigits: 2 })} ({catMarginePct.toFixed(0)}%)</strong></span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)' }}>
                        <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Servizio</th>
                        <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Fornitore</th>
                        <th className="text-right px-4 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Qty</th>
                        <th className="text-right px-4 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Venduto</th>
                        <th className="text-right px-4 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Costo</th>
                        <th className="text-right px-4 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Margine</th>
                        <th className="text-right px-4 py-2 font-semibold" style={{ color: 'var(--muted)' }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td className="px-4 py-2.5" style={{ color: 'var(--text)' }}>{item.titolo}</td>
                          <td className="px-4 py-2.5" style={{ color: 'var(--muted)' }}>{item.fornitore}</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: 'var(--text)' }}>{item.qty}</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: 'var(--text)' }}>{'\u20AC'}{item.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5 text-right" style={{ color: 'var(--yellow)' }}>{'\u20AC'}{item.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5 text-right font-medium" style={{ color: item.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{item.margine.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5 text-right font-medium" style={{ color: item.marginePct >= 20 ? 'var(--green)' : item.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }}>{item.marginePct.toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Grand total row */}
      {lines.length > 0 && (
        <div className="panel p-4">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 font-bold" style={{ color: 'var(--text)' }}>TOTALE EVENTO</td>
                <td className="py-1 text-right" style={{ color: 'var(--text)' }}>{'\u20AC'}{totals.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                <td className="py-1 text-right" style={{ color: 'var(--yellow)' }}>{'\u20AC'}{totals.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                <td className="py-1 text-right font-bold" style={{ color: totals.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{totals.margine.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                <td className="py-1 text-right font-bold" style={{ color: totals.marginePct >= 20 ? 'var(--green)' : 'var(--yellow)' }}>{totals.marginePct.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
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

interface EventDocument {
  id: string
  event_id: string
  file_name: string
  file_type: string
  file_size: number
  storage_path: string
  uploaded_by: string
  uploaded_by_name: string
  created_at: string
}

const FILE_ICONS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
}

function getFileLabel(mimeType: string): string {
  if (FILE_ICONS[mimeType]) return FILE_ICONS[mimeType]
  if (mimeType.startsWith('image/')) return 'IMG'
  return 'FILE'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function TabDocumenti({ event }: { event: Event }) {
  const [docs, setDocs] = useState<EventDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  async function loadDocs() {
    const { data } = await supabase
      .from('event_documents')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
    setDocs((data ?? []) as EventDocument[])
    setLoading(false)
  }

  useEffect(() => { loadDocs() }, [event.id])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    const currentUser = loadUser()
    const userName = currentUser?.nome ?? 'Utente'

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() ?? ''
      const storagePath = `${event.id}/${Date.now()}_${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('event-documents')
        .upload(storagePath, file)

      if (uploadError) {
        console.error('Upload error:', uploadError.message)
        continue
      }

      await supabase.from('event_documents').insert({
        event_id: event.id,
        file_name: file.name,
        file_type: file.type || `application/${ext}`,
        file_size: file.size,
        storage_path: storagePath,
        uploaded_by: currentUser?.id ?? '',
        uploaded_by_name: userName,
      })
    }

    await loadDocs()
    setUploading(false)
    e.target.value = ''
  }

  async function handleDownload(doc: EventDocument) {
    const { data } = await supabase.storage
      .from('event-documents')
      .createSignedUrl(doc.storage_path, 60)
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    }
  }

  async function handleDelete(doc: EventDocument) {
    await supabase.storage.from('event-documents').remove([doc.storage_path])
    await supabase.from('event_documents').delete().eq('id', doc.id)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
  }

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento documenti...</div></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--muted)' }}>
          Documenti ({docs.length})
        </p>
        <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
          style={{ background: 'rgba(208,0,58,0.12)', color: 'var(--red2)', border: '1px solid rgba(208,0,58,0.35)' }}>
          <Upload className="w-3.5 h-3.5" />
          {uploading ? 'Caricamento...' : 'Carica documento'}
          <input type="file" className="hidden" onChange={handleUpload} multiple disabled={uploading}
            accept=".pdf,.xlsx,.xls,.pptx,.ppt,.docx,.jpg,.jpeg,.png,.gif,.webp" />
        </label>
      </div>

      {docs.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun documento caricato per questo evento</p>
          <p className="text-xs mt-1">Carica PDF, Excel, PowerPoint, Word o immagini</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const label = getFileLabel(doc.file_type)
            const labelColor = label === 'PDF' ? 'var(--red2)' : label === 'XLSX' || label === 'XLS' ? 'var(--green)' : label === 'PPTX' || label === 'PPT' ? '#e67e22' : label === 'DOCX' ? 'var(--blue)' : 'var(--muted)'
            return (
              <div key={doc.id} className="panel p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{ background: `${labelColor}15`, color: labelColor }}>
                  {label}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{doc.file_name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {formatFileSize(doc.file_size)} · {doc.uploaded_by_name || 'Utente'} · {new Date(doc.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => handleDownload(doc)} title="Scarica"
                    className="p-2 rounded-lg transition-all hover:bg-white/10">
                    <Download className="w-4 h-4" style={{ color: 'var(--blue)' }} />
                  </button>
                  <button onClick={() => handleDelete(doc)} title="Elimina"
                    className="p-2 rounded-lg transition-all hover:bg-white/10">
                    <Trash2 className="w-4 h-4" style={{ color: 'var(--red2)' }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface ProgramEntry {
  id: string
  supplier_id: string
  titolo: string
  categoria: string
  data: string
  ora_inizio: string
  ora_fine: string | null
  luogo: string
  note: string
}

function TabProgramma({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [entries, setEntries] = useState<ProgramEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [svcRes, hotelRes, restRes] = await Promise.all([
        supabase.from('event_supplier_services').select('*').eq('event_id', event.id),
        supabase.from('event_hotel_details').select('*').eq('event_id', event.id),
        supabase.from('event_restaurant_details').select('*').eq('event_id', event.id),
      ])

      const program: ProgramEntry[] = []

      for (const svc of (svcRes.data ?? []) as SupplierService[]) {
        if (svc.data && svc.ora_inizio) {
          program.push({
            id: svc.id,
            supplier_id: svc.supplier_id,
            titolo: svc.titolo,
            categoria: SVC_CATEGORIES.find(c => c.value === svc.categoria)?.label ?? svc.categoria,
            data: svc.data,
            ora_inizio: svc.ora_inizio,
            ora_fine: svc.ora_fine,
            luogo: svc.partenza && svc.destinazione ? `${svc.partenza} → ${svc.destinazione}` : svc.luogo,
            note: svc.note,
          })
        }
      }

      for (const h of (hotelRes.data ?? []) as HotelDetail[]) {
        const tipoLabel = HOTEL_TIPOS.find(t => t.value === h.tipo)?.label ?? h.tipo

        if (h.tipo === 'pernottamento') {
          if (h.check_in_date) {
            const roomInfo = [h.quantita ? `${h.quantita} camere` : '', h.room_type].filter(Boolean).join(' ')
            program.push({
              id: h.id + '-cin',
              supplier_id: h.supplier_id,
              titolo: 'Check-in Hotel',
              categoria: 'Hotel',
              data: h.check_in_date,
              ora_inizio: h.check_in_time || '14:00',
              ora_fine: null,
              luogo: h.luogo,
              note: roomInfo,
            })
          }
          if (h.check_out_date) {
            const roomInfo = [h.quantita ? `${h.quantita} camere` : '', h.room_type].filter(Boolean).join(' ')
            program.push({
              id: h.id + '-cout',
              supplier_id: h.supplier_id,
              titolo: 'Check-out Hotel',
              categoria: 'Hotel',
              data: h.check_out_date,
              ora_inizio: h.check_out_time || '10:00',
              ora_fine: null,
              luogo: h.luogo,
              note: roomInfo,
            })
          }
        } else if (h.tipo === 'sala_meeting') {
          if (h.data && h.ora_inizio) {
            program.push({
              id: h.id + '-meet',
              supplier_id: h.supplier_id,
              titolo: `Meeting${h.luogo ? ' - ' + h.luogo : ''}${h.meeting_pax ? ' ' + h.meeting_pax + ' pax' : ''}`,
              categoria: 'Meeting',
              data: h.data,
              ora_inizio: h.ora_inizio,
              ora_fine: h.ora_fine,
              luogo: h.luogo,
              note: [h.meeting_setup, h.meeting_equipment, h.note].filter(Boolean).join(' | '),
            })
          }
          if (h.data && h.ora_fine) {
            program.push({
              id: h.id + '-meetend',
              supplier_id: h.supplier_id,
              titolo: 'Fine meeting',
              categoria: 'Meeting',
              data: h.data,
              ora_inizio: h.ora_fine,
              ora_fine: null,
              luogo: h.luogo,
              note: '',
            })
          }
        } else {
          if (h.data && h.ora_inizio) {
            program.push({
              id: h.id,
              supplier_id: h.supplier_id,
              titolo: tipoLabel,
              categoria: 'F&B',
              data: h.data,
              ora_inizio: h.ora_inizio,
              ora_fine: null,
              luogo: h.luogo,
              note: h.note,
            })
          }
        }
      }

      for (const r of (restRes.data ?? []) as RestaurantDetail[]) {
        if (r.data && r.ora_inizio) {
          const label = r.tipologia_servizio || 'Servizio ristorante'
          program.push({
            id: r.id + '-start',
            supplier_id: r.supplier_id,
            titolo: label,
            categoria: 'Ristorante',
            data: r.data,
            ora_inizio: r.ora_inizio,
            ora_fine: r.ora_fine,
            luogo: r.nome_sala,
            note: r.pax_confermati ? `${r.pax_confermati} pax` : '',
          })
        }
        if (r.data && r.ora_fine) {
          program.push({
            id: r.id + '-end',
            supplier_id: r.supplier_id,
            titolo: 'Fine servizio',
            categoria: 'Ristorante',
            data: r.data,
            ora_inizio: r.ora_fine,
            ora_fine: null,
            luogo: r.nome_sala,
            note: '',
          })
        }
      }

      program.sort((a, b) => {
        const cmpDate = a.data.localeCompare(b.data)
        if (cmpDate !== 0) return cmpDate
        return a.ora_inizio.localeCompare(b.ora_inizio)
      })

      setEntries(program)
      setLoading(false)
    }
    load()
  }, [event.id])

  const grouped = entries.reduce<Record<string, ProgramEntry[]>>((acc, e) => {
    if (!acc[e.data]) acc[e.data] = []
    acc[e.data].push(e)
    return acc
  }, {})

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento programma...</div></div>
  }

  if (entries.length === 0) {
    return (
      <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
        <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Nessun servizio operativo inserito</p>
        <p className="text-xs mt-1">Vai nel tab Fornitori, collega i fornitori e aggiungi i servizi operativi per generare il programma</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--muted)' }}>
          Programma evento — generato automaticamente
        </p>
        <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>
          {entries.length} attivita
        </span>
      </div>

      {Object.entries(grouped).map(([dateStr, dayItems]) => (
        <div key={dateStr}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3 px-1"
            style={{ color: 'var(--muted)' }}>
            {new Date(dateStr + 'T00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-2 bottom-2 w-px" style={{ background: 'var(--line)' }} />
            <div className="space-y-3">
              {dayItems.map(entry => {
                const sup = suppliers.find(s => s.id === entry.supplier_id)
                return (
                  <div key={entry.id} className="relative flex items-start gap-3">
                    <div className="absolute left-[-18px] top-2.5 w-2.5 h-2.5 rounded-full border-2"
                      style={{ borderColor: 'var(--red2)', background: 'var(--bg)' }} />
                    <div className="flex-1 panel p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                            {entry.ora_inizio?.slice(0, 5)}
                            {entry.ora_fine ? ` - ${entry.ora_fine.slice(0, 5)}` : ''}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>
                            {entry.categoria}
                          </span>
                        </div>
                        <p className="text-sm font-medium mt-1" style={{ color: 'var(--text)' }}>
                          {entry.titolo}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                          {sup?.nome ?? 'Fornitore'}
                        </p>
                        {entry.luogo && (
                          <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                            <MapPin className="w-3 h-3 inline" />{entry.luogo}
                          </div>
                        )}
                        {entry.note && <p className="text-xs mt-1 italic" style={{ color: 'var(--muted)' }}>{entry.note}</p>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
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
}

function EventDetail({ event, onBack, onEdit, onDelete, onStatusChange, budgets, suppliers, comunicazioni, internalUsers, clients }: EventDetailProps) {
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
    { id: 'documenti', label: 'Documenti' },
    { id: 'programma', label: 'Programma' },
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
      <div className="panel p-6 relative overflow-hidden" style={{ minHeight: '140px' }}>
        <div className="absolute inset-0 opacity-10"
          style={{ background: `linear-gradient(135deg, ${statoColor(event.stato)} 0%, transparent 60%)` }} />
        {(() => {
          const eventClient = clients.find(c => c.id === event.cliente)
          const clientLogo = eventClient?.logoUrl
          return clientLogo ? (
            <img src={clientLogo} alt="" aria-hidden
              className="absolute right-4 top-1/2 -translate-y-1/2 w-44 h-44 object-contain pointer-events-none select-none"
              style={{ opacity: 0.07 }} />
          ) : (
            <div className="absolute right-8 top-1/2 -translate-y-1/2 text-6xl font-black pointer-events-none select-none"
              style={{ opacity: 0.04, color: statoColor(event.stato) }}>
              {event.nome.split(' ').map(w => w[0]).join('').slice(0, 3)}
            </div>
          )
        })()}
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
                {clients.find(c => c.id === event.cliente)?.referente && (
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    Referente: <span style={{ color: 'var(--text)' }}>{clients.find(c => c.id === event.cliente)!.referente}</span>
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
        {activeTab === 'team' && <TabTeam event={event} internalUsers={internalUsers} />}
        {activeTab === 'fornitori' && <TabFornitori event={event} suppliers={suppliers} />}
        {activeTab === 'budget' && <TabBudget event={event} suppliers={suppliers} />}
        {activeTab === 'comunicazioni' && <TabComunicazioni event={event} comunicazioni={comunicazioni} />}
        {activeTab === 'documenti' && <TabDocumenti event={event} />}
        {activeTab === 'programma' && <TabProgramma event={event} suppliers={suppliers} />}
        {activeTab === 'timeline' && <TabTimeline event={event} />}
        {activeTab === 'creative' && <TabCreative event={event} />}
        {activeTab === 'social' && <TabSocial event={event} />}
        {activeTab === 'presentazioni' && <TabPresentazioni event={event} />}
        {activeTab === 'pacchetto' && <TabPacchetto event={event} />}
      </div>
    </div>
  )
}

// ─── Workflow auto-creation ──────────────────────────────────────────────────

const WF_KEY = 'simmetria_workflows'

function createWorkflowForEvent(event: Event) {
  const existing: EventoWorkflow[] = loadWorkflowsFromStorage()
  if (existing.some(w => w.eventoId === event.id)) return
  const now = new Date().toISOString().slice(0, 10)
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

  useRealtimeTable('events', () => {
    fetchEvents().then(remote => { setEventList(remote); cacheEventsSnapshot(remote) })
  })

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
