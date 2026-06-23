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
  ChevronDown,
  Save,
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
import { SupplierCategoryPanel, detectSupplierCategory, CATEGORY_LABELS } from '@/components/TabOperativo'
import AnimatedLaserBorder from '@/components/AnimatedLaserBorder'
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
      fee_agenzia_pct: event?.fee_agenzia_pct ?? 6,
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
      const [svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
        supabase.from('event_supplier_services').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_hotel_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_restaurant_details').select('budget_per_persona,budget_totale,costo_per_persona,costo_totale_reale,pax_confermati,pax_previsti').eq('event_id', event.id),
        supabase.from('event_experience_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,pax').eq('event_id', event.id),
        supabase.from('event_catering_details').select('venduto_per_persona,venduto_totale,costo_per_persona,costo_totale,pax').eq('event_id', event.id),
        supabase.from('event_staff_interno_details').select('venduto_totale,costo_giornaliero,costo_totale').eq('event_id', event.id),
        supabase.from('event_staff_esterno_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_varie_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_audio_video_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_allestimenti_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
        supabase.from('event_grafica_stampa_details').select('venduto_unitario,venduto_totale,costo_unitario,costo_totale,quantita').eq('event_id', event.id),
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
      for (const e of (expRes.data ?? [])) {
        const pax = e.pax ?? 1
        venduto += e.venduto_totale ?? (e.venduto_unitario ? e.venduto_unitario * pax : 0)
        costo += e.costo_totale ?? (e.costo_unitario ? e.costo_unitario * pax : 0)
      }
      for (const c of (catRes.data ?? [])) {
        const pax = c.pax ?? 1
        venduto += c.venduto_totale ?? (c.venduto_per_persona ? c.venduto_per_persona * pax : 0)
        costo += c.costo_totale ?? (c.costo_per_persona ? c.costo_per_persona * pax : 0)
      }
      for (const si of (staffIntRes.data ?? [])) {
        venduto += si.venduto_totale ? Number(si.venduto_totale) : 0
        costo += si.costo_totale ? Number(si.costo_totale) : (si.costo_giornaliero ? Number(si.costo_giornaliero) : 0)
      }
      for (const se of (staffExtRes.data ?? [])) {
        const qty = se.quantita ?? 1
        venduto += se.venduto_totale ?? (se.venduto_unitario ? se.venduto_unitario * qty : 0)
        costo += se.costo_totale ?? (se.costo_unitario ? se.costo_unitario * qty : 0)
      }
      for (const v of (varieRes.data ?? [])) {
        const qty = v.quantita ?? 1
        venduto += v.venduto_totale ?? (v.venduto_unitario ? v.venduto_unitario * qty : 0)
        costo += v.costo_totale ?? (v.costo_unitario ? v.costo_unitario * qty : 0)
      }
      for (const av of (avRes.data ?? [])) {
        const qty = av.quantita ?? 1
        venduto += av.venduto_totale ?? (av.venduto_unitario ? av.venduto_unitario * qty : 0)
        costo += av.costo_totale ?? (av.costo_unitario ? av.costo_unitario * qty : 0)
      }
      for (const al of (allestRes.data ?? [])) {
        const qty = al.quantita ?? 1
        venduto += al.venduto_totale ?? (al.venduto_unitario ? al.venduto_unitario * qty : 0)
        costo += al.costo_totale ?? (al.costo_unitario ? al.costo_unitario * qty : 0)
      }
      for (const g of (graficaRes.data ?? [])) {
        const qty = g.quantita ?? 1
        venduto += g.venduto_totale ?? (g.venduto_unitario ? g.venduto_unitario * qty : 0)
        costo += g.costo_totale ?? (g.costo_unitario ? g.costo_unitario * qty : 0)
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


interface ExperienceDetail {
  id: string
  event_id: string
  supplier_id: string | null
  nome_attivita: string
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  pax: number | null
  durata_minuti: number | null
  location: string
  note_operative: string
  venduto_unitario: number | null
  venduto_totale: number | null
  costo_unitario: number | null
  costo_totale: number | null
}

interface CateringDetail {
  id: string
  event_id: string
  supplier_id: string | null
  tipologia: string
  data: string | null
  ora: string | null
  ora_inizio: string | null
  ora_fine: string | null
  pax: number | null
  note: string
  venduto_per_persona: number | null
  venduto_totale: number | null
  costo_per_persona: number | null
  costo_totale: number | null
}

interface StaffInternoDetail {
  id: string
  event_id: string
  profile_id: string | null
  risorsa: string
  ruolo: string
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  note: string
  note_operative: string
  venduto_totale: number | null
  costo_giornaliero: number | null
  costo_totale: number | null
}

interface StaffEsternoDetail {
  id: string
  event_id: string
  supplier_id: string | null
  ruolo: string
  quantita: number
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  lingue: string
  abbigliamento: string
  note: string
  note_operative: string
  venduto_unitario: number | null
  venduto_totale: number | null
  costo_unitario: number | null
  costo_totale: number | null
}

interface VarieDetail {
  id: string
  event_id: string
  supplier_id: string | null
  descrizione: string
  quantita: number
  note: string
  data: string | null
  ora_inizio: string | null
  note_operative: string
  venduto_unitario: number | null
  venduto_totale: number | null
  costo_unitario: number | null
  costo_totale: number | null
}

function TabFornitori({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [links, setLinks] = useState<EventSupplierLink[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null)
  const [managingCategory, setManagingCategory] = useState<string | null>(null)
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null)
  const [toast, setToast] = useState<{ supplierId: string; nome: string } | null>(null)
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

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
    const sup = suppliers.find(s => s.id === supplierId)
    setConfirmUnlink(null)

    const tables = [
      'event_supplier_services', 'event_hotel_details', 'event_restaurant_details',
      'event_experience_details', 'event_catering_details', 'event_audio_video_details',
      'event_allestimenti_details', 'event_staff_interno_details', 'event_staff_esterno_details',
      'event_grafica_stampa_details', 'event_varie_details',
    ]
    await Promise.all(tables.map(t => supabase.from(t).delete().eq('event_id', event.id).eq('supplier_id', supplierId)))
    const { error } = await supabase.from('event_suppliers').delete().eq('event_id', event.id).eq('supplier_id', supplierId)
    if (!error) {
      setLinks(prev => prev.filter(l => l.supplier_id !== supplierId))
      if (managingCategory === supplierId) setManagingCategory(null)
      if (toastTimer) clearTimeout(toastTimer)
      setToast({ supplierId, nome: sup?.nome ?? '' })
      const timer = setTimeout(() => setToast(null), 5000)
      setToastTimer(timer)
    }
  }

  async function handleUndoUnlink(supplierId: string) {
    if (toastTimer) clearTimeout(toastTimer)
    setToast(null)
    await supabase.from('event_suppliers').insert({ event_id: event.id, supplier_id: supplierId })
    await loadLinks()
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
            const catType = detectSupplierCategory(sup.categoria)
            const catLabel = CATEGORY_LABELS[catType]
            const isManaging = managingCategory === sup.id
            return (
              <AnimatedLaserBorder key={sup.id} active={isManaging}>
              <div className="panel overflow-hidden" style={{ border: `1px solid ${isManaging ? 'var(--red2)' : 'var(--line)'}` }}>
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
                    <button onClick={() => setManagingCategory(isManaging ? null : sup.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/10"
                      style={{ border: '1px solid var(--line)', color: isManaging ? 'var(--red2)' : 'var(--muted)' }}>
                      <Zap className="w-3.5 h-3.5 inline mr-1" />
                      Scheda {catLabel}
                    </button>
                    <button onClick={() => setConfirmUnlink(sup.id)}
                      className="p-1.5 rounded-lg transition-all hover:bg-white/10" title="Rimuovi fornitore dall'evento">
                      <Trash2 className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                    </button>
                  </div>
                </div>

                {isManaging && (
                  <SupplierCategoryPanel event={event} supplierId={sup.id} category={catType} />
                )}
              </div>
              </AnimatedLaserBorder>
            )
          })}
        </div>
      )}

      {viewingSupplier && (
        <SupplierDetailModal supplier={viewingSupplier} onClose={() => setViewingSupplier(null)} />
      )}

      {confirmUnlink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmUnlink(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Rimuovere fornitore dall'evento?</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Stai per rimuovere questo fornitore dall'evento.<br />
              Il fornitore NON verra eliminato dall'anagrafica fornitori.<br />
              Verra rimosso solamente da questo evento.
            </p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setConfirmUnlink(null)}>Annulla</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={() => handleUnlink(confirmUnlink)}>Elimina fornitore</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>Fornitore rimosso dall'evento</p>
          <button onClick={() => handleUndoUnlink(toast.supplierId)} className="text-sm font-medium px-2 py-1 rounded-lg hover:opacity-80" style={{ color: 'var(--blue)' }}>Annulla</button>
        </div>
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

type BudgetLineSource = 'service' | 'hotel' | 'restaurant' | 'experience' | 'catering' | 'staff_interno' | 'staff_esterno' | 'varie' | 'audio_video' | 'allestimenti' | 'grafica_stampa'
interface BudgetLine {
  id: string
  source: BudgetLineSource
  categoria: string
  titolo: string
  fornitore: string
  supplierId: string
  qty: number
  venduto: number
  costo: number
  margine: number
  marginePct: number
  raw: SupplierService | HotelDetail | RestaurantDetail | ExperienceDetail | CateringDetail | StaffInternoDetail | StaffEsternoDetail | VarieDetail
}

function TabBudget({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [lines, setLines] = useState<BudgetLine[]>([])
  const [totals, setTotals] = useState({ venduto: 0, costo: 0, margine: 0, marginePct: 0 })
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string | number | boolean>>({})
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [feePct, setFeePct] = useState(event.fee_agenzia_pct ?? 6)
  const [editingFee, setEditingFee] = useState(false)
  const [feeInput, setFeeInput] = useState(String(event.fee_agenzia_pct ?? 6))

  async function saveFee(newPct: number) {
    setFeePct(newPct)
    setEditingFee(false)
    await updateEventRemote(event.id, { fee_agenzia_pct: newPct })
  }

  const loadData = useCallback(async () => {
    const [svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
      supabase.from('event_supplier_services').select('*').eq('event_id', event.id),
      supabase.from('event_hotel_details').select('*').eq('event_id', event.id),
      supabase.from('event_restaurant_details').select('*').eq('event_id', event.id),
      supabase.from('event_experience_details').select('*').eq('event_id', event.id),
      supabase.from('event_catering_details').select('*').eq('event_id', event.id),
      supabase.from('event_staff_interno_details').select('*').eq('event_id', event.id),
      supabase.from('event_staff_esterno_details').select('*').eq('event_id', event.id),
      supabase.from('event_varie_details').select('*').eq('event_id', event.id),
      supabase.from('event_audio_video_details').select('*').eq('event_id', event.id),
      supabase.from('event_allestimenti_details').select('*').eq('event_id', event.id),
      supabase.from('event_grafica_stampa_details').select('*').eq('event_id', event.id),
    ])
    const all: BudgetLine[] = []

    for (const s of (svcRes.data ?? []) as SupplierService[]) {
      const qty = s.quantita ?? 1
      const venduto = s.venduto_totale ?? (s.venduto_unitario ? s.venduto_unitario * qty : 0)
      const costo = s.costo_totale ?? (s.costo_unitario ? s.costo_unitario * qty : 0)
      if (!venduto && !costo) continue
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      const sup = suppliers.find(sup => sup.id === s.supplier_id)
      all.push({ id: s.id, source: 'service', categoria: sup?.categoria ?? 'Altro', titolo: s.titolo, fornitore: sup?.nome ?? '', supplierId: s.supplier_id, qty, venduto, costo, margine, marginePct, raw: s })
    }

    for (const h of (hotelRes.data ?? []) as HotelDetail[]) {
      const qty = h.quantita ?? 1
      const venduto = h.venduto_totale ?? (h.venduto_unitario ? h.venduto_unitario * qty : 0)
      const costo = h.costo_totale ?? (h.costo_unitario ? h.costo_unitario * qty : 0)
      if (!venduto && !costo) continue
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      const label = h.titolo || HOTEL_TIPOS.find(t => t.value === h.tipo)?.label || h.tipo
      const sup = suppliers.find(sup => sup.id === h.supplier_id)
      all.push({ id: h.id, source: 'hotel', categoria: 'Hotel', titolo: label, fornitore: sup?.nome ?? '', supplierId: h.supplier_id, qty, venduto, costo, margine, marginePct, raw: h })
    }

    for (const r of (restRes.data ?? []) as RestaurantDetail[]) {
      const pax = r.pax_confermati ?? r.pax_previsti ?? 1
      const venduto = r.budget_totale ? Number(r.budget_totale) : (r.budget_per_persona ? Number(r.budget_per_persona) * pax : 0)
      const costo = r.costo_totale_reale ? Number(r.costo_totale_reale) : (r.costo_per_persona ? Number(r.costo_per_persona) * pax : 0)
      if (!venduto && !costo) continue
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      const label = r.tipologia_servizio || 'Servizio ristorante'
      const sup = suppliers.find(sup => sup.id === r.supplier_id)
      all.push({ id: r.id, source: 'restaurant', categoria: 'Ristorante', titolo: label, fornitore: sup?.nome ?? '', supplierId: r.supplier_id, qty: pax, venduto, costo, margine, marginePct, raw: r })
    }

    for (const e of (expRes.data ?? []) as ExperienceDetail[]) {
      const pax = e.pax ?? 1
      const venduto = e.venduto_totale ?? (e.venduto_unitario ? e.venduto_unitario * pax : 0)
      const costo = e.costo_totale ?? (e.costo_unitario ? e.costo_unitario * pax : 0)
      if (!venduto && !costo) continue
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      const sup = e.supplier_id ? suppliers.find(sup => sup.id === e.supplier_id) : null
      all.push({ id: e.id, source: 'experience', categoria: 'Experience', titolo: e.nome_attivita || 'Experience', fornitore: sup?.nome ?? '', supplierId: e.supplier_id ?? '', qty: pax, venduto, costo, margine, marginePct, raw: e })
    }

    for (const c of (catRes.data ?? []) as CateringDetail[]) {
      const pax = c.pax ?? 1
      const venduto = c.venduto_totale ?? (c.venduto_per_persona ? c.venduto_per_persona * pax : 0)
      const costo = c.costo_totale ?? (c.costo_per_persona ? c.costo_per_persona * pax : 0)
      if (!venduto && !costo) continue
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      const sup = c.supplier_id ? suppliers.find(sup => sup.id === c.supplier_id) : null
      all.push({ id: c.id, source: 'catering', categoria: 'Catering', titolo: c.tipologia || 'Catering', fornitore: sup?.nome ?? '', supplierId: c.supplier_id ?? '', qty: pax, venduto, costo, margine, marginePct, raw: c })
    }

    for (const si of (staffIntRes.data ?? []) as StaffInternoDetail[]) {
      const venduto = si.venduto_totale ? Number(si.venduto_totale) : 0
      const costo = si.costo_totale ? Number(si.costo_totale) : (si.costo_giornaliero ? Number(si.costo_giornaliero) : 0)
      if (!venduto && !costo) continue
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      all.push({ id: si.id, source: 'staff_interno', categoria: 'Staff Simmetria', titolo: si.risorsa || si.ruolo || 'Staff interno', fornitore: 'Simmetria', supplierId: '', qty: 1, venduto, costo, margine, marginePct, raw: si })
    }

    for (const se of (staffExtRes.data ?? []) as StaffEsternoDetail[]) {
      const qty = se.quantita ?? 1
      const venduto = se.venduto_totale ?? (se.venduto_unitario ? se.venduto_unitario * qty : 0)
      const costo = se.costo_totale ?? (se.costo_unitario ? se.costo_unitario * qty : 0)
      if (!venduto && !costo) continue
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      const sup = se.supplier_id ? suppliers.find(sup => sup.id === se.supplier_id) : null
      all.push({ id: se.id, source: 'staff_esterno', categoria: 'Staff Esterno', titolo: se.ruolo || 'Staff esterno', fornitore: sup?.nome ?? '', supplierId: se.supplier_id ?? '', qty, venduto, costo, margine, marginePct, raw: se })
    }

    for (const v of (varieRes.data ?? []) as VarieDetail[]) {
      const qty = v.quantita ?? 1
      const venduto = v.venduto_totale ?? (v.venduto_unitario ? v.venduto_unitario * qty : 0)
      const costo = v.costo_totale ?? (v.costo_unitario ? v.costo_unitario * qty : 0)
      if (!venduto && !costo) continue
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      const sup = v.supplier_id ? suppliers.find(sup => sup.id === v.supplier_id) : null
      all.push({ id: v.id, source: 'varie', categoria: 'Varie', titolo: v.descrizione || 'Voce varia', fornitore: sup?.nome ?? '', supplierId: v.supplier_id ?? '', qty, venduto, costo, margine, marginePct, raw: v })
    }

    for (const av of (avRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (av.quantita as number) ?? 1
      const venduto = (av.venduto_totale as number) ?? ((av.venduto_unitario as number) ? (av.venduto_unitario as number) * qty : 0)
      const costo = (av.costo_totale as number) ?? ((av.costo_unitario as number) ? (av.costo_unitario as number) * qty : 0)
      if (!venduto && !costo) continue
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      const sup = av.supplier_id ? suppliers.find(sup => sup.id === av.supplier_id) : null
      all.push({ id: av.id as string, source: 'audio_video' as BudgetLineSource, categoria: 'Audio Video', titolo: (av.tipologia_servizio as string) || 'Audio Video', fornitore: sup?.nome ?? '', supplierId: (av.supplier_id as string) ?? '', qty, venduto, costo, margine, marginePct, raw: av as unknown as VarieDetail })
    }

    for (const al of (allestRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (al.quantita as number) ?? 1
      const venduto = (al.venduto_totale as number) ?? ((al.venduto_unitario as number) ? (al.venduto_unitario as number) * qty : 0)
      const costo = (al.costo_totale as number) ?? ((al.costo_unitario as number) ? (al.costo_unitario as number) * qty : 0)
      if (!venduto && !costo) continue
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      const sup = al.supplier_id ? suppliers.find(sup => sup.id === al.supplier_id) : null
      all.push({ id: al.id as string, source: 'allestimenti' as BudgetLineSource, categoria: 'Allestimenti', titolo: (al.descrizione as string) || 'Allestimento', fornitore: sup?.nome ?? '', supplierId: (al.supplier_id as string) ?? '', qty, venduto, costo, margine, marginePct, raw: al as unknown as VarieDetail })
    }

    for (const g of (graficaRes.data ?? []) as Record<string, unknown>[]) {
      const qty = (g.quantita as number) ?? 1
      const venduto = (g.venduto_totale as number) ?? ((g.venduto_unitario as number) ? (g.venduto_unitario as number) * qty : 0)
      const costo = (g.costo_totale as number) ?? ((g.costo_unitario as number) ? (g.costo_unitario as number) * qty : 0)
      if (!venduto && !costo) continue
      const margine = venduto - costo
      const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
      const sup = g.supplier_id ? suppliers.find(sup => sup.id === g.supplier_id) : null
      all.push({ id: g.id as string, source: 'grafica_stampa' as BudgetLineSource, categoria: 'Grafica/Stampa', titolo: (g.tipo_materiale as string) || 'Grafica', fornitore: sup?.nome ?? '', supplierId: (g.supplier_id as string) ?? '', qty, venduto, costo, margine, marginePct, raw: g as unknown as VarieDetail })
    }

    all.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.titolo.localeCompare(b.titolo))
    setLines(all)

    const totVenduto = all.reduce((s, i) => s + i.venduto, 0)
    const totCosto = all.reduce((s, i) => s + i.costo, 0)
    const totMargine = totVenduto - totCosto
    const totMarginePct = totVenduto > 0 ? (totMargine / totVenduto) * 100 : 0
    setTotals({ venduto: totVenduto, costo: totCosto, margine: totMargine, marginePct: totMarginePct })
    setLoading(false)
  }, [event.id, suppliers])

  useEffect(() => { loadData() }, [loadData])

  function startEdit(line: BudgetLine) {
    setEditingId(line.id)
    if (line.source === 'service') {
      const s = line.raw as SupplierService
      setEditForm({ titolo: s.titolo, quantita: s.quantita ?? 1, venduto_unitario: s.venduto_unitario ?? '', venduto_totale: s.venduto_totale ?? '', costo_unitario: s.costo_unitario ?? '', costo_totale: s.costo_totale ?? '', data: s.data ?? '', ora_inizio: s.ora_inizio ?? '', ora_fine: s.ora_fine ?? '', luogo: s.luogo ?? '', partenza: s.partenza ?? '', destinazione: s.destinazione ?? '', note: s.note ?? '' })
    } else if (line.source === 'hotel') {
      const h = line.raw as HotelDetail
      setEditForm({ titolo: h.titolo, quantita: h.quantita ?? 1, venduto_unitario: h.venduto_unitario ?? '', venduto_totale: h.venduto_totale ?? '', costo_unitario: h.costo_unitario ?? '', costo_totale: h.costo_totale ?? '', check_in_date: h.check_in_date ?? '', check_in_time: h.check_in_time ?? '', check_out_date: h.check_out_date ?? '', check_out_time: h.check_out_time ?? '', room_type: h.room_type ?? '', note: h.note ?? '' })
    } else if (line.source === 'restaurant') {
      const r = line.raw as RestaurantDetail
      setEditForm({ tipologia_servizio: r.tipologia_servizio ?? '', pax_previsti: r.pax_previsti ?? '', pax_confermati: r.pax_confermati ?? '', budget_per_persona: r.budget_per_persona ?? '', budget_totale: r.budget_totale ?? '', costo_per_persona: r.costo_per_persona ?? '', costo_totale_reale: r.costo_totale_reale ?? '', menu_portate: r.menu_portate ?? '', menu_descrizione: r.menu_descrizione ?? '', area_riservata: r.area_riservata ?? false, allergie: r.allergie ?? '', intolleranze: r.intolleranze ?? '', note_operative: r.note_operative ?? '', data: r.data ?? '', ora_inizio: r.ora_inizio ?? '', ora_fine: r.ora_fine ?? '' })
    } else if (line.source === 'experience') {
      const e = line.raw as ExperienceDetail
      setEditForm({ nome_attivita: e.nome_attivita ?? '', pax: e.pax ?? '', durata_minuti: e.durata_minuti ?? '', location: e.location ?? '', data: e.data ?? '', ora_inizio: e.ora_inizio ?? '', ora_fine: e.ora_fine ?? '', venduto_unitario: e.venduto_unitario ?? '', venduto_totale: e.venduto_totale ?? '', costo_unitario: e.costo_unitario ?? '', costo_totale: e.costo_totale ?? '', note_operative: e.note_operative ?? '' })
    } else if (line.source === 'catering') {
      const c = line.raw as CateringDetail
      setEditForm({ tipologia: c.tipologia ?? '', pax: c.pax ?? '', data: c.data ?? '', ora: c.ora ?? '', venduto_per_persona: c.venduto_per_persona ?? '', venduto_totale: c.venduto_totale ?? '', costo_per_persona: c.costo_per_persona ?? '', costo_totale: c.costo_totale ?? '', note: c.note ?? '' })
    } else if (line.source === 'staff_interno') {
      const si = line.raw as StaffInternoDetail
      setEditForm({ risorsa: si.risorsa ?? '', ruolo: si.ruolo ?? '', data: si.data ?? '', ora_inizio: si.ora_inizio ?? '', ora_fine: si.ora_fine ?? '', venduto_totale: si.venduto_totale ?? '', costo_giornaliero: si.costo_giornaliero ?? '', costo_totale: si.costo_totale ?? '', note: si.note ?? '' })
    } else if (line.source === 'staff_esterno') {
      const se = line.raw as StaffEsternoDetail
      setEditForm({ ruolo: se.ruolo ?? '', quantita: se.quantita ?? 1, data: se.data ?? '', ora_inizio: se.ora_inizio ?? '', ora_fine: se.ora_fine ?? '', lingue: se.lingue ?? '', venduto_unitario: se.venduto_unitario ?? '', venduto_totale: se.venduto_totale ?? '', costo_unitario: se.costo_unitario ?? '', costo_totale: se.costo_totale ?? '', note: se.note ?? '' })
    } else {
      const v = line.raw as VarieDetail
      setEditForm({ descrizione: v.descrizione ?? '', quantita: v.quantita ?? 1, venduto_unitario: v.venduto_unitario ?? '', venduto_totale: v.venduto_totale ?? '', costo_unitario: v.costo_unitario ?? '', costo_totale: v.costo_totale ?? '', note: v.note ?? '' })
    }
  }

  async function saveEdit(line: BudgetLine) {
    setSaving(true)
    const tableMap: Record<BudgetLineSource, string> = {
      service: 'event_supplier_services', hotel: 'event_hotel_details', restaurant: 'event_restaurant_details',
      experience: 'event_experience_details', catering: 'event_catering_details',
      staff_interno: 'event_staff_interno_details', staff_esterno: 'event_staff_esterno_details', varie: 'event_varie_details',
      audio_video: 'event_audio_video_details', allestimenti: 'event_allestimenti_details', grafica_stampa: 'event_grafica_stampa_details',
    }
    const table = tableMap[line.source]

    let patch: Record<string, unknown> = {}
    if (line.source === 'service') {
      const qty = Number(editForm.quantita) || 1
      const vu = editForm.venduto_unitario !== '' ? Number(editForm.venduto_unitario) : null
      const vt = editForm.venduto_totale !== '' ? Number(editForm.venduto_totale) : (vu ? vu * qty : null)
      const cu = editForm.costo_unitario !== '' ? Number(editForm.costo_unitario) : null
      const ct = editForm.costo_totale !== '' ? Number(editForm.costo_totale) : (cu ? cu * qty : null)
      patch = { titolo: editForm.titolo, quantita: qty, venduto_unitario: vu, venduto_totale: vt, costo_unitario: cu, costo_totale: ct, data: editForm.data || null, ora_inizio: editForm.ora_inizio || null, ora_fine: editForm.ora_fine || null, luogo: editForm.luogo || '', partenza: editForm.partenza || '', destinazione: editForm.destinazione || '', note: editForm.note || '' }
    } else if (line.source === 'hotel') {
      const qty = Number(editForm.quantita) || 1
      const vu = editForm.venduto_unitario !== '' ? Number(editForm.venduto_unitario) : null
      const vt = editForm.venduto_totale !== '' ? Number(editForm.venduto_totale) : (vu ? vu * qty : null)
      const cu = editForm.costo_unitario !== '' ? Number(editForm.costo_unitario) : null
      const ct = editForm.costo_totale !== '' ? Number(editForm.costo_totale) : (cu ? cu * qty : null)
      patch = { titolo: editForm.titolo, quantita: qty, venduto_unitario: vu, venduto_totale: vt, costo_unitario: cu, costo_totale: ct, check_in_date: editForm.check_in_date || null, check_in_time: editForm.check_in_time || null, check_out_date: editForm.check_out_date || null, check_out_time: editForm.check_out_time || null, room_type: editForm.room_type || '', note: editForm.note || '' }
    } else if (line.source === 'restaurant') {
      const paxP = editForm.pax_previsti !== '' ? Number(editForm.pax_previsti) : null
      const paxC = editForm.pax_confermati !== '' ? Number(editForm.pax_confermati) : null
      const pax = paxC ?? paxP ?? 1
      const bpp = editForm.budget_per_persona !== '' ? Number(editForm.budget_per_persona) : null
      const bt = editForm.budget_totale !== '' ? Number(editForm.budget_totale) : (bpp ? bpp * pax : null)
      const cpp = editForm.costo_per_persona !== '' ? Number(editForm.costo_per_persona) : null
      const ctr = editForm.costo_totale_reale !== '' ? Number(editForm.costo_totale_reale) : (cpp ? cpp * pax : null)
      patch = { tipologia_servizio: editForm.tipologia_servizio || '', pax_previsti: paxP, pax_confermati: paxC, budget_per_persona: bpp, budget_totale: bt, costo_per_persona: cpp, costo_totale_reale: ctr, menu_portate: editForm.menu_portate || '', menu_descrizione: editForm.menu_descrizione || '', area_riservata: editForm.area_riservata ?? false, allergie: editForm.allergie || '', intolleranze: editForm.intolleranze || '', note_operative: editForm.note_operative || '', data: editForm.data || null, ora_inizio: editForm.ora_inizio || null, ora_fine: editForm.ora_fine || null }
    } else if (line.source === 'experience') {
      const pax = editForm.pax !== '' ? Number(editForm.pax) : null
      const vu = editForm.venduto_unitario !== '' ? Number(editForm.venduto_unitario) : null
      const vt = editForm.venduto_totale !== '' ? Number(editForm.venduto_totale) : (vu && pax ? vu * pax : null)
      const cu = editForm.costo_unitario !== '' ? Number(editForm.costo_unitario) : null
      const ct = editForm.costo_totale !== '' ? Number(editForm.costo_totale) : (cu && pax ? cu * pax : null)
      patch = { nome_attivita: editForm.nome_attivita || '', pax, durata_minuti: editForm.durata_minuti !== '' ? Number(editForm.durata_minuti) : null, location: editForm.location || '', data: editForm.data || null, ora_inizio: editForm.ora_inizio || null, ora_fine: editForm.ora_fine || null, venduto_unitario: vu, venduto_totale: vt, costo_unitario: cu, costo_totale: ct, note_operative: editForm.note_operative || '' }
    } else if (line.source === 'catering') {
      const pax = editForm.pax !== '' ? Number(editForm.pax) : null
      const vpp = editForm.venduto_per_persona !== '' ? Number(editForm.venduto_per_persona) : null
      const vt = editForm.venduto_totale !== '' ? Number(editForm.venduto_totale) : (vpp && pax ? vpp * pax : null)
      const cpp = editForm.costo_per_persona !== '' ? Number(editForm.costo_per_persona) : null
      const ct = editForm.costo_totale !== '' ? Number(editForm.costo_totale) : (cpp && pax ? cpp * pax : null)
      patch = { tipologia: editForm.tipologia || '', pax, data: editForm.data || null, ora: editForm.ora || null, venduto_per_persona: vpp, venduto_totale: vt, costo_per_persona: cpp, costo_totale: ct, note: editForm.note || '' }
    } else if (line.source === 'staff_interno') {
      patch = { risorsa: editForm.risorsa || '', ruolo: editForm.ruolo || '', data: editForm.data || null, ora_inizio: editForm.ora_inizio || null, ora_fine: editForm.ora_fine || null, venduto_totale: editForm.venduto_totale !== '' ? Number(editForm.venduto_totale) : null, costo_giornaliero: editForm.costo_giornaliero !== '' ? Number(editForm.costo_giornaliero) : null, costo_totale: editForm.costo_totale !== '' ? Number(editForm.costo_totale) : null, note: editForm.note || '' }
    } else if (line.source === 'staff_esterno') {
      const qty = Number(editForm.quantita) || 1
      const vu = editForm.venduto_unitario !== '' ? Number(editForm.venduto_unitario) : null
      const vt = editForm.venduto_totale !== '' ? Number(editForm.venduto_totale) : (vu ? vu * qty : null)
      const cu = editForm.costo_unitario !== '' ? Number(editForm.costo_unitario) : null
      const ct = editForm.costo_totale !== '' ? Number(editForm.costo_totale) : (cu ? cu * qty : null)
      patch = { ruolo: editForm.ruolo || '', quantita: qty, data: editForm.data || null, ora_inizio: editForm.ora_inizio || null, ora_fine: editForm.ora_fine || null, lingue: editForm.lingue || '', venduto_unitario: vu, venduto_totale: vt, costo_unitario: cu, costo_totale: ct, note: editForm.note || '' }
    } else {
      const qty = Number(editForm.quantita) || 1
      const vu = editForm.venduto_unitario !== '' ? Number(editForm.venduto_unitario) : null
      const vt = editForm.venduto_totale !== '' ? Number(editForm.venduto_totale) : (vu ? vu * qty : null)
      const cu = editForm.costo_unitario !== '' ? Number(editForm.costo_unitario) : null
      const ct = editForm.costo_totale !== '' ? Number(editForm.costo_totale) : (cu ? cu * qty : null)
      patch = { descrizione: editForm.descrizione || '', quantita: qty, venduto_unitario: vu, venduto_totale: vt, costo_unitario: cu, costo_totale: ct, note: editForm.note || '' }
    }

    await supabase.from(table).update(patch).eq('id', line.id)
    setEditingId(null)
    setSaving(false)
    await loadData()
  }

  async function deleteLine(line: BudgetLine) {
    const tableMap: Record<BudgetLineSource, string> = {
      service: 'event_supplier_services', hotel: 'event_hotel_details', restaurant: 'event_restaurant_details',
      experience: 'event_experience_details', catering: 'event_catering_details',
      staff_interno: 'event_staff_interno_details', staff_esterno: 'event_staff_esterno_details', varie: 'event_varie_details',
      audio_video: 'event_audio_video_details', allestimenti: 'event_allestimenti_details', grafica_stampa: 'event_grafica_stampa_details',
    }
    await supabase.from(tableMap[line.source]).delete().eq('id', line.id)
    setDeletingId(null)
    setExpandedId(null)
    await loadData()
  }

  const grouped = useMemo(() => {
    const map: Record<string, BudgetLine[]> = {}
    for (const l of lines) {
      if (!map[l.categoria]) map[l.categoria] = []
      map[l.categoria].push(l)
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [lines])

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento budget...</div></div>
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <AnimatedLaserBorder loading={saving}>
      <div className="panel p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Totale Venduto Servizi</p>
            <p className="text-xl font-bold mt-1" style={{ color: 'var(--text)' }}>{'\u20AC'}{totals.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center">
            <p className="text-xs flex items-center justify-center gap-1" style={{ color: 'var(--muted)' }}>
              Fee Agenzia
              {!editingFee && (
                <button onClick={() => { setEditingFee(true); setFeeInput(String(feePct)) }}
                  className="opacity-60 hover:opacity-100 transition-opacity">
                  <Edit3 className="w-3 h-3" />
                </button>
              )}
            </p>
            {editingFee ? (
              <div className="flex items-center justify-center gap-1 mt-1">
                <input type="number" step="0.5" min="0" max="100" value={feeInput}
                  onChange={e => setFeeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveFee(Number(feeInput) || 0); if (e.key === 'Escape') setEditingFee(false) }}
                  className="w-16 px-2 py-1 text-center text-sm rounded-lg"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                  autoFocus
                />
                <span className="text-sm" style={{ color: 'var(--muted)' }}>%</span>
                <button onClick={() => saveFee(Number(feeInput) || 0)}
                  className="p-1 rounded-lg hover:bg-white/10"
                  style={{ color: 'var(--green)' }}>
                  <Save className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xl font-bold mt-1" style={{ color: 'var(--blue)' }}>
                {'\u20AC'}{(totals.venduto * feePct / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                <span className="text-xs font-normal ml-1" style={{ color: 'var(--muted)' }}>({feePct}%)</span>
              </p>
            )}
          </div>
          <div className="text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Totale Ricavi</p>
            <p className="text-xl font-bold mt-1" style={{ color: 'var(--text)' }}>{'\u20AC'}{(totals.venduto + totals.venduto * feePct / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="h-px" style={{ background: 'var(--line)' }} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Totale Costi</p>
            <p className="text-xl font-bold mt-1" style={{ color: 'var(--yellow)' }}>{'\u20AC'}{totals.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Margine</p>
            <p className="text-xl font-bold mt-1" style={{ color: (totals.venduto + totals.venduto * feePct / 100 - totals.costo) >= 0 ? 'var(--green)' : 'var(--red2)' }}>
              {'\u20AC'}{(totals.venduto + totals.venduto * feePct / 100 - totals.costo).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Margine %</p>
            {(() => {
              const totalRicavi = totals.venduto + totals.venduto * feePct / 100
              const margine = totalRicavi - totals.costo
              const marginePct = totalRicavi > 0 ? (margine / totalRicavi) * 100 : 0
              return <p className="text-xl font-bold mt-1" style={{ color: marginePct >= 20 ? 'var(--green)' : marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }}>{marginePct.toFixed(1)}%</p>
            })()}
          </div>
        </div>
      </div>
      </AnimatedLaserBorder>

      {/* Margin bar */}
      {totals.venduto > 0 && (
        <div className="panel p-5">
          <div className="flex justify-between text-xs mb-2">
            <span style={{ color: 'var(--muted)' }}>Margine operativo (incl. fee)</span>
            {(() => {
              const totalRicavi = totals.venduto + totals.venduto * feePct / 100
              const marginePct = totalRicavi > 0 ? ((totalRicavi - totals.costo) / totalRicavi) * 100 : 0
              return <span style={{ color: marginePct >= 20 ? 'var(--green)' : 'var(--yellow)' }}>{marginePct.toFixed(1)}%</span>
            })()}
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
            {(() => {
              const totalRicavi = totals.venduto + totals.venduto * feePct / 100
              const marginePct = totalRicavi > 0 ? ((totalRicavi - totals.costo) / totalRicavi) * 100 : 0
              return <div className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(Math.max(marginePct, 0), 100)}%`, background: marginePct >= 20 ? 'var(--green)' : marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }} />
            })()}
          </div>
        </div>
      )}

      {/* Categories breakdown with expandable rows */}
      {lines.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Euro className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun dato economico</p>
          <p className="text-xs mt-1">Inserisci venduto e costo nei servizi operativi (tab Fornitori)</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([categoria, items]) => {
            const catVenduto = items.reduce((s, i) => s + i.venduto, 0)
            const catCosto = items.reduce((s, i) => s + i.costo, 0)
            const catMargine = catVenduto - catCosto
            const catMarginePct = catVenduto > 0 ? (catMargine / catVenduto) * 100 : 0
            return (
              <div key={categoria} className="panel overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--panel2)' }}>
                  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{categoria}</p>
                  <div className="flex items-center gap-4 text-xs">
                    <span style={{ color: 'var(--muted)' }}>V: <strong style={{ color: 'var(--text)' }}>{'\u20AC'}{catVenduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</strong></span>
                    <span style={{ color: 'var(--muted)' }}>C: <strong style={{ color: 'var(--yellow)' }}>{'\u20AC'}{catCosto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</strong></span>
                    <span style={{ color: 'var(--muted)' }}>M: <strong style={{ color: catMargine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{catMargine.toLocaleString('it-IT', { minimumFractionDigits: 2 })} ({catMarginePct.toFixed(0)}%)</strong></span>
                  </div>
                </div>
                <div>
                  {items.map(item => {
                    const isExpanded = expandedId === item.id
                    const isEditing = editingId === item.id
                    return (
                      <div key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <button
                          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:opacity-80 transition-opacity"
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        >
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${isExpanded ? '' : '-rotate-90'}`} style={{ color: 'var(--muted)' }} />
                          <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{item.titolo}</span>
                          <span className="text-xs" style={{ color: 'var(--muted)' }}>{item.fornitore}</span>
                          <span className="text-xs w-8 text-right" style={{ color: 'var(--text)' }}>{item.qty}</span>
                          <span className="text-xs w-20 text-right" style={{ color: 'var(--text)' }}>{'\u20AC'}{item.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                          <span className="text-xs w-20 text-right" style={{ color: 'var(--yellow)' }}>{'\u20AC'}{item.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                          <span className="text-xs w-20 text-right font-medium" style={{ color: item.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{item.margine.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                          <span className="text-xs w-12 text-right font-medium" style={{ color: item.marginePct >= 20 ? 'var(--green)' : item.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }}>{item.marginePct.toFixed(0)}%</span>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1" style={{ background: 'var(--bg)' }}>
                            {isEditing ? (
                              <BudgetLineEditForm source={item.source} form={editForm} setForm={setEditForm} onSave={() => saveEdit(item)} onCancel={() => setEditingId(null)} saving={saving} />
                            ) : (
                              <BudgetLineDetail line={item} onEdit={() => startEdit(item)} onDelete={() => setDeletingId(item.id)} />
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Grand total row */}
      {lines.length > 0 && (
        <div className="panel p-4">
          <div className="flex items-center justify-between text-sm px-2">
            <span className="font-bold" style={{ color: 'var(--text)' }}>TOTALE EVENTO</span>
            <div className="flex items-center gap-6">
              <span style={{ color: 'var(--text)' }}>{'\u20AC'}{totals.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
              <span style={{ color: 'var(--yellow)' }}>{'\u20AC'}{totals.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
              <span className="font-bold" style={{ color: totals.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{totals.margine.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
              <span className="font-bold" style={{ color: totals.marginePct >= 20 ? 'var(--green)' : 'var(--yellow)' }}>{totals.marginePct.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingId(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Elimina voce budget</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Questa azione elimina la voce collegata. Il fornitore NON viene eliminato.</p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setDeletingId(null)}>Annulla</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={() => { const l = lines.find(x => x.id === deletingId); if (l) deleteLine(l) }}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BudgetLineDetail({ line, onEdit, onDelete }: { line: BudgetLine; onEdit: () => void; onDelete: () => void }) {
  const detailFields: { label: string; value: string }[] = []
  const sourceLabels: Record<BudgetLineSource, string> = { service: 'Servizio', hotel: 'Hotel', restaurant: 'Ristorante', experience: 'Experience', catering: 'Catering', staff_interno: 'Staff Simmetria', staff_esterno: 'Staff Esterno', varie: 'Varie', audio_video: 'Audio Video', allestimenti: 'Allestimenti', grafica_stampa: 'Grafica/Stampa' }

  if (line.source === 'service') {
    const s = line.raw as SupplierService
    if (s.data) detailFields.push({ label: 'Data', value: s.data })
    if (s.ora_inizio) detailFields.push({ label: 'Orario', value: `${s.ora_inizio}${s.ora_fine ? ' - ' + s.ora_fine : ''}` })
    if (s.partenza) detailFields.push({ label: 'Partenza', value: s.partenza })
    if (s.destinazione) detailFields.push({ label: 'Destinazione', value: s.destinazione })
    if (s.luogo) detailFields.push({ label: 'Luogo', value: s.luogo })
    detailFields.push({ label: 'Quantita', value: String(s.quantita ?? 1) })
    if (s.venduto_unitario) detailFields.push({ label: 'Venduto unitario', value: `\u20AC${Number(s.venduto_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Venduto totale', value: `\u20AC${line.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (s.costo_unitario) detailFields.push({ label: 'Costo unitario', value: `\u20AC${Number(s.costo_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Costo totale', value: `\u20AC${line.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (s.note) detailFields.push({ label: 'Note', value: s.note })
  } else if (line.source === 'hotel') {
    const h = line.raw as HotelDetail
    if (h.room_type) detailFields.push({ label: 'Tipologia camera', value: h.room_type })
    detailFields.push({ label: 'Quantita', value: String(h.quantita ?? 1) })
    if (h.check_in_date) detailFields.push({ label: 'Check-in', value: `${h.check_in_date}${h.check_in_time ? ' ' + h.check_in_time : ''}` })
    if (h.check_out_date) detailFields.push({ label: 'Check-out', value: `${h.check_out_date}${h.check_out_time ? ' ' + h.check_out_time : ''}` })
    if (h.venduto_unitario) detailFields.push({ label: 'Venduto/camera', value: `\u20AC${Number(h.venduto_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Venduto totale', value: `\u20AC${line.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (h.costo_unitario) detailFields.push({ label: 'Costo/camera', value: `\u20AC${Number(h.costo_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Costo totale', value: `\u20AC${line.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (h.note) detailFields.push({ label: 'Note', value: h.note })
  } else if (line.source === 'restaurant') {
    const r = line.raw as RestaurantDetail
    if (r.data) detailFields.push({ label: 'Data', value: r.data })
    if (r.ora_inizio) detailFields.push({ label: 'Orario', value: `${r.ora_inizio}${r.ora_fine ? ' - ' + r.ora_fine : ''}` })
    if (r.pax_previsti) detailFields.push({ label: 'Pax previsti', value: String(r.pax_previsti) })
    if (r.pax_confermati) detailFields.push({ label: 'Pax confermati', value: String(r.pax_confermati) })
    if (r.menu_portate) detailFields.push({ label: 'Menu', value: r.menu_portate })
    if (r.menu_descrizione) detailFields.push({ label: 'Descrizione menu', value: r.menu_descrizione })
    if (r.budget_per_persona) detailFields.push({ label: 'Venduto/persona', value: `\u20AC${Number(r.budget_per_persona).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Venduto totale', value: `\u20AC${line.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (r.costo_per_persona) detailFields.push({ label: 'Costo/persona', value: `\u20AC${Number(r.costo_per_persona).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Costo totale', value: `\u20AC${line.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (r.area_riservata) detailFields.push({ label: 'Area riservata', value: 'Si' })
    if (r.allergie) detailFields.push({ label: 'Allergie', value: r.allergie })
    if (r.intolleranze) detailFields.push({ label: 'Intolleranze', value: r.intolleranze })
    if (r.note_operative) detailFields.push({ label: 'Note operative', value: r.note_operative })
  } else if (line.source === 'experience') {
    const e = line.raw as ExperienceDetail
    if (e.data) detailFields.push({ label: 'Data', value: e.data })
    if (e.ora_inizio) detailFields.push({ label: 'Orario', value: `${e.ora_inizio}${e.ora_fine ? ' - ' + e.ora_fine : ''}` })
    if (e.pax) detailFields.push({ label: 'Pax', value: String(e.pax) })
    if (e.durata_minuti) detailFields.push({ label: 'Durata', value: `${e.durata_minuti} min` })
    if (e.location) detailFields.push({ label: 'Location', value: e.location })
    if (e.venduto_unitario) detailFields.push({ label: 'Venduto/pax', value: `\u20AC${Number(e.venduto_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Venduto totale', value: `\u20AC${line.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (e.costo_unitario) detailFields.push({ label: 'Costo/pax', value: `\u20AC${Number(e.costo_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Costo totale', value: `\u20AC${line.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (e.note_operative) detailFields.push({ label: 'Note operative', value: e.note_operative })
  } else if (line.source === 'catering') {
    const c = line.raw as CateringDetail
    if (c.tipologia) detailFields.push({ label: 'Tipologia', value: c.tipologia })
    if (c.data) detailFields.push({ label: 'Data', value: c.data })
    if (c.ora) detailFields.push({ label: 'Ora', value: c.ora })
    if (c.pax) detailFields.push({ label: 'Pax', value: String(c.pax) })
    if (c.venduto_per_persona) detailFields.push({ label: 'Venduto/persona', value: `\u20AC${Number(c.venduto_per_persona).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Venduto totale', value: `\u20AC${line.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (c.costo_per_persona) detailFields.push({ label: 'Costo/persona', value: `\u20AC${Number(c.costo_per_persona).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Costo totale', value: `\u20AC${line.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (c.note) detailFields.push({ label: 'Note', value: c.note })
  } else if (line.source === 'staff_interno') {
    const si = line.raw as StaffInternoDetail
    if (si.risorsa) detailFields.push({ label: 'Risorsa', value: si.risorsa })
    if (si.ruolo) detailFields.push({ label: 'Ruolo', value: si.ruolo })
    if (si.data) detailFields.push({ label: 'Data', value: si.data })
    if (si.ora_inizio) detailFields.push({ label: 'Orario', value: `${si.ora_inizio}${si.ora_fine ? ' - ' + si.ora_fine : ''}` })
    if (si.venduto_totale) detailFields.push({ label: 'Venduto', value: `\u20AC${Number(si.venduto_totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (si.costo_giornaliero) detailFields.push({ label: 'Costo giornaliero', value: `\u20AC${Number(si.costo_giornaliero).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Costo totale', value: `\u20AC${line.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (si.note) detailFields.push({ label: 'Note', value: si.note })
  } else if (line.source === 'staff_esterno') {
    const se = line.raw as StaffEsternoDetail
    if (se.ruolo) detailFields.push({ label: 'Ruolo', value: se.ruolo })
    detailFields.push({ label: 'Quantita', value: String(se.quantita) })
    if (se.data) detailFields.push({ label: 'Data', value: se.data })
    if (se.ora_inizio) detailFields.push({ label: 'Orario', value: `${se.ora_inizio}${se.ora_fine ? ' - ' + se.ora_fine : ''}` })
    if (se.lingue) detailFields.push({ label: 'Lingue', value: se.lingue })
    if (se.venduto_unitario) detailFields.push({ label: 'Venduto/unit.', value: `\u20AC${Number(se.venduto_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Venduto totale', value: `\u20AC${line.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (se.costo_unitario) detailFields.push({ label: 'Costo/unit.', value: `\u20AC${Number(se.costo_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Costo totale', value: `\u20AC${line.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (se.note) detailFields.push({ label: 'Note', value: se.note })
  } else {
    const v = line.raw as VarieDetail
    if (v.descrizione) detailFields.push({ label: 'Descrizione', value: v.descrizione })
    detailFields.push({ label: 'Quantita', value: String(v.quantita) })
    if (v.venduto_unitario) detailFields.push({ label: 'Venduto/unit.', value: `\u20AC${Number(v.venduto_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Venduto totale', value: `\u20AC${line.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (v.costo_unitario) detailFields.push({ label: 'Costo/unit.', value: `\u20AC${Number(v.costo_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    detailFields.push({ label: 'Costo totale', value: `\u20AC${line.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (v.note) detailFields.push({ label: 'Note', value: v.note })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>{sourceLabels[line.source]}</span>
        {line.fornitore && <span className="text-xs" style={{ color: 'var(--muted)' }}>Fornitore: <strong style={{ color: 'var(--text)' }}>{line.fornitore}</strong></span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 mb-4">
        {detailFields.map(f => (
          <div key={f.label}>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{f.label}</p>
            <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text)' }}>{f.value}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80" style={{ background: 'var(--panel2)', color: 'var(--blue)' }} onClick={onEdit}>
          <Edit3 className="w-3 h-3" /> Modifica
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80" style={{ background: 'var(--panel2)', color: 'var(--red2)' }} onClick={onDelete}>
          <Trash2 className="w-3 h-3" /> Elimina
        </button>
      </div>
    </div>
  )
}

function BudgetLineEditForm({ source, form, setForm, onSave, onCancel, saving }: { source: BudgetLineSource; form: Record<string, string | number | boolean>; setForm: (f: Record<string, string | number | boolean>) => void; onSave: () => void; onCancel: () => void; saving: boolean }) {
  const upd = (key: string, val: string | number | boolean) => setForm({ ...form, [key]: val })
  const inp = (key: string, label: string, type: string = 'text') => (
    <div>
      <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>{label}</label>
      <input type={type} value={String(form[key] ?? '')} onChange={e => upd(key, e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }} />
    </div>
  )

  return (
    <div>
      {source === 'service' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          {inp('titolo', 'Titolo')}
          {inp('quantita', 'Quantita', 'number')}
          {inp('data', 'Data', 'date')}
          {inp('ora_inizio', 'Ora inizio', 'time')}
          {inp('ora_fine', 'Ora fine', 'time')}
          {inp('luogo', 'Luogo')}
          {inp('partenza', 'Partenza')}
          {inp('destinazione', 'Destinazione')}
          {inp('venduto_unitario', 'Venduto unit.', 'number')}
          {inp('venduto_totale', 'Venduto totale', 'number')}
          {inp('costo_unitario', 'Costo unit.', 'number')}
          {inp('costo_totale', 'Costo totale', 'number')}
          <div className="sm:col-span-3">{inp('note', 'Note')}</div>
        </div>
      )}
      {source === 'hotel' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          {inp('titolo', 'Titolo')}
          {inp('quantita', 'Quantita camere', 'number')}
          {inp('room_type', 'Tipo camera')}
          {inp('check_in_date', 'Check-in data', 'date')}
          {inp('check_in_time', 'Check-in ora', 'time')}
          {inp('check_out_date', 'Check-out data', 'date')}
          {inp('check_out_time', 'Check-out ora', 'time')}
          {inp('venduto_unitario', 'Venduto/camera', 'number')}
          {inp('venduto_totale', 'Venduto totale', 'number')}
          {inp('costo_unitario', 'Costo/camera', 'number')}
          {inp('costo_totale', 'Costo totale', 'number')}
          <div className="sm:col-span-3">{inp('note', 'Note')}</div>
        </div>
      )}
      {source === 'restaurant' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          {inp('tipologia_servizio', 'Tipologia servizio')}
          {inp('pax_previsti', 'Pax previsti', 'number')}
          {inp('pax_confermati', 'Pax confermati', 'number')}
          {inp('data', 'Data', 'date')}
          {inp('ora_inizio', 'Ora inizio', 'time')}
          {inp('ora_fine', 'Ora fine', 'time')}
          {inp('menu_portate', 'Menu portate')}
          {inp('budget_per_persona', 'Venduto/persona', 'number')}
          {inp('budget_totale', 'Venduto totale', 'number')}
          {inp('costo_per_persona', 'Costo/persona', 'number')}
          {inp('costo_totale_reale', 'Costo totale', 'number')}
          {inp('allergie', 'Allergie')}
          {inp('intolleranze', 'Intolleranze')}
          <div className="sm:col-span-3">{inp('menu_descrizione', 'Descrizione menu')}</div>
          <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
          <div className="flex items-center gap-2 sm:col-span-3">
            <input type="checkbox" checked={!!form.area_riservata} onChange={e => upd('area_riservata', e.target.checked)} id="budget_area_ris" />
            <label htmlFor="budget_area_ris" className="text-xs" style={{ color: 'var(--text)' }}>Area riservata</label>
          </div>
        </div>
      )}
      {source === 'experience' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          {inp('nome_attivita', 'Nome attivita')}
          {inp('pax', 'Pax', 'number')}
          {inp('durata_minuti', 'Durata (min)', 'number')}
          {inp('location', 'Location')}
          {inp('data', 'Data', 'date')}
          {inp('ora_inizio', 'Ora inizio', 'time')}
          {inp('ora_fine', 'Ora fine', 'time')}
          {inp('venduto_unitario', 'Venduto/pax', 'number')}
          {inp('venduto_totale', 'Venduto totale', 'number')}
          {inp('costo_unitario', 'Costo/pax', 'number')}
          {inp('costo_totale', 'Costo totale', 'number')}
          <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
        </div>
      )}
      {source === 'catering' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          {inp('tipologia', 'Tipologia')}
          {inp('pax', 'Pax', 'number')}
          {inp('data', 'Data', 'date')}
          {inp('ora', 'Ora', 'time')}
          {inp('venduto_per_persona', 'Venduto/persona', 'number')}
          {inp('venduto_totale', 'Venduto totale', 'number')}
          {inp('costo_per_persona', 'Costo/persona', 'number')}
          {inp('costo_totale', 'Costo totale', 'number')}
          <div className="sm:col-span-3">{inp('note', 'Note')}</div>
        </div>
      )}
      {source === 'staff_interno' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          {inp('risorsa', 'Risorsa')}
          {inp('ruolo', 'Ruolo')}
          {inp('data', 'Data', 'date')}
          {inp('ora_inizio', 'Ora inizio', 'time')}
          {inp('ora_fine', 'Ora fine', 'time')}
          {inp('venduto_totale', 'Venduto', 'number')}
          {inp('costo_giornaliero', 'Costo giornaliero', 'number')}
          {inp('costo_totale', 'Costo totale', 'number')}
          <div className="sm:col-span-3">{inp('note', 'Note')}</div>
        </div>
      )}
      {source === 'staff_esterno' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          {inp('ruolo', 'Ruolo')}
          {inp('quantita', 'Quantita', 'number')}
          {inp('data', 'Data', 'date')}
          {inp('ora_inizio', 'Ora inizio', 'time')}
          {inp('ora_fine', 'Ora fine', 'time')}
          {inp('lingue', 'Lingue')}
          {inp('venduto_unitario', 'Venduto/unit.', 'number')}
          {inp('venduto_totale', 'Venduto totale', 'number')}
          {inp('costo_unitario', 'Costo/unit.', 'number')}
          {inp('costo_totale', 'Costo totale', 'number')}
          <div className="sm:col-span-3">{inp('note', 'Note')}</div>
        </div>
      )}
      {source === 'varie' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          {inp('descrizione', 'Descrizione')}
          {inp('quantita', 'Quantita', 'number')}
          {inp('venduto_unitario', 'Venduto/unit.', 'number')}
          {inp('venduto_totale', 'Venduto totale', 'number')}
          {inp('costo_unitario', 'Costo/unit.', 'number')}
          {inp('costo_totale', 'Costo totale', 'number')}
          <div className="sm:col-span-3">{inp('note', 'Note')}</div>
        </div>
      )}
      <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
        <button disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors" style={{ background: 'var(--blue)', color: '#fff', opacity: saving ? 0.6 : 1 }} onClick={onSave}>
          <Save className="w-3 h-3" /> {saving ? 'Salvataggio...' : 'Salva'}
        </button>
        <button className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--muted)' }} onClick={onCancel}>Annulla</button>
      </div>
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
      const [svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
        supabase.from('event_supplier_services').select('*').eq('event_id', event.id),
        supabase.from('event_hotel_details').select('*').eq('event_id', event.id),
        supabase.from('event_restaurant_details').select('*').eq('event_id', event.id),
        supabase.from('event_experience_details').select('*').eq('event_id', event.id),
        supabase.from('event_catering_details').select('*').eq('event_id', event.id),
        supabase.from('event_staff_interno_details').select('*').eq('event_id', event.id),
        supabase.from('event_staff_esterno_details').select('*').eq('event_id', event.id),
        supabase.from('event_varie_details').select('*').eq('event_id', event.id),
        supabase.from('event_audio_video_details').select('*').eq('event_id', event.id),
        supabase.from('event_allestimenti_details').select('*').eq('event_id', event.id),
        supabase.from('event_grafica_stampa_details').select('*').eq('event_id', event.id),
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

      for (const e of (expRes.data ?? []) as ExperienceDetail[]) {
        if (e.data && e.ora_inizio) {
          program.push({
            id: e.id,
            supplier_id: e.supplier_id ?? '',
            titolo: e.nome_attivita || 'Experience',
            categoria: 'Experience',
            data: e.data,
            ora_inizio: e.ora_inizio,
            ora_fine: e.ora_fine,
            luogo: e.location,
            note: [e.pax ? `${e.pax} pax` : '', e.durata_minuti ? `${e.durata_minuti} min` : '', e.note_operative].filter(Boolean).join(' | '),
          })
        }
      }

      for (const c of (catRes.data ?? []) as CateringDetail[]) {
        const ora = c.ora_inizio || c.ora
        if (c.data && ora) {
          program.push({
            id: c.id,
            supplier_id: c.supplier_id ?? '',
            titolo: c.tipologia || 'Catering',
            categoria: 'Catering',
            data: c.data,
            ora_inizio: ora,
            ora_fine: c.ora_fine,
            luogo: '',
            note: c.pax ? `${c.pax} pax` : '',
          })
        }
      }

      for (const si of (staffIntRes.data ?? []) as StaffInternoDetail[]) {
        if (si.data && si.ora_inizio) {
          program.push({
            id: si.id,
            supplier_id: '',
            titolo: `${si.risorsa || si.ruolo || 'Staff'}${si.ruolo ? ' (' + si.ruolo + ')' : ''}`,
            categoria: 'Staff Simmetria',
            data: si.data,
            ora_inizio: si.ora_inizio,
            ora_fine: si.ora_fine,
            luogo: '',
            note: si.note || '',
          })
        }
      }

      for (const se of (staffExtRes.data ?? []) as StaffEsternoDetail[]) {
        if (se.data && se.ora_inizio) {
          program.push({
            id: se.id,
            supplier_id: se.supplier_id ?? '',
            titolo: `${se.ruolo || 'Staff esterno'}${se.quantita > 1 ? ' x' + se.quantita : ''}`,
            categoria: 'Staff Esterno',
            data: se.data,
            ora_inizio: se.ora_inizio,
            ora_fine: se.ora_fine,
            luogo: '',
            note: [se.lingue, se.note].filter(Boolean).join(' | '),
          })
        }
      }

      for (const v of (varieRes.data ?? []) as VarieDetail[]) {
        if (v.data && v.ora_inizio) {
          program.push({
            id: v.id,
            supplier_id: v.supplier_id ?? '',
            titolo: v.descrizione || 'Varie',
            categoria: 'Varie',
            data: v.data,
            ora_inizio: v.ora_inizio,
            ora_fine: null,
            luogo: '',
            note: v.note || '',
          })
        }
      }

      for (const av of (avRes.data ?? []) as Record<string, unknown>[]) {
        if (av.data_montaggio && av.ora_montaggio) {
          program.push({ id: av.id + '-mont', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Montaggio AV', categoria: 'Audio Video', data: av.data_montaggio as string, ora_inizio: av.ora_montaggio as string, ora_fine: null, luogo: '', note: (av.tipologia_servizio as string) || '' })
        }
        if (av.data_prove && av.ora_prove) {
          program.push({ id: av.id + '-prove', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Prove AV', categoria: 'Audio Video', data: av.data_prove as string, ora_inizio: av.ora_prove as string, ora_fine: null, luogo: '', note: '' })
        }
        if (av.data_evento && av.ora_evento) {
          program.push({ id: av.id + '-evt', supplier_id: (av.supplier_id as string) ?? '', titolo: (av.tipologia_servizio as string) || 'Servizio AV', categoria: 'Audio Video', data: av.data_evento as string, ora_inizio: av.ora_evento as string, ora_fine: null, luogo: '', note: '' })
        }
        if (av.data_smontaggio && av.ora_smontaggio) {
          program.push({ id: av.id + '-smont', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Smontaggio AV', categoria: 'Audio Video', data: av.data_smontaggio as string, ora_inizio: av.ora_smontaggio as string, ora_fine: null, luogo: '', note: '' })
        }
      }

      for (const al of (allestRes.data ?? []) as Record<string, unknown>[]) {
        if (al.data_montaggio && al.ora_montaggio) {
          program.push({ id: al.id + '-mont', supplier_id: (al.supplier_id as string) ?? '', titolo: `Montaggio: ${(al.descrizione as string) || 'Allestimento'}`, categoria: 'Allestimenti', data: al.data_montaggio as string, ora_inizio: al.ora_montaggio as string, ora_fine: null, luogo: (al.area_utilizzo as string) || '', note: '' })
        }
        if (al.data_smontaggio && al.ora_smontaggio) {
          program.push({ id: al.id + '-smont', supplier_id: (al.supplier_id as string) ?? '', titolo: `Smontaggio: ${(al.descrizione as string) || 'Allestimento'}`, categoria: 'Allestimenti', data: al.data_smontaggio as string, ora_inizio: al.ora_smontaggio as string, ora_fine: null, luogo: (al.area_utilizzo as string) || '', note: '' })
        }
      }

      for (const g of (graficaRes.data ?? []) as Record<string, unknown>[]) {
        if (g.data_consegna) {
          program.push({ id: g.id as string, supplier_id: (g.supplier_id as string) ?? '', titolo: `Consegna: ${(g.tipo_materiale as string) || 'Materiale'}`, categoria: 'Grafica/Stampa', data: g.data_consegna as string, ora_inizio: '09:00', ora_fine: null, luogo: '', note: (g.formato as string) || '' })
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
        <p>Nessuna voce inserita</p>
        <p className="text-xs mt-1">Vai nel tab Fornitori, collega i fornitori e compila le schede per generare il programma</p>
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
              <AnimatedLaserBorder key={event.id} active={event.stato === 'in_corso'}>
              <div
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
              </AnimatedLaserBorder>
            )
          })}
        </div>
      )}
    </div>
  )
}
