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
  Search,
  X,
  ArrowLeft,
  TrendingUp,
  AlertCircle,
  MessageSquare,
  GitBranch,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Zap,
  Plus,
  Edit3,
  Trash2,
  Upload,
  Download,
  Eye,
  Link2,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { loadTasksFromStorage, cacheEventsSnapshot, loadWorkflowsFromStorage } from '@/lib/storage'
import { fetchEvents, upsertEvent, updateEvent as updateEventRemote, deleteEvent as deleteEventRemote } from '@/lib/events-service'
import { fetchTasksByEvent, upsertTask, changeTaskStatus } from '@/lib/tasks-service'
import { fetchSuppliers } from '@/lib/suppliers-service'
import { fetchBudgets } from '@/lib/budgets-service'
import { fetchCommunications } from '@/lib/communications-service'
import { fetchClients as fetchClientsService } from '@/lib/clients-service'
import type { Client } from '@/data/clients'
import { fetchAllProfiles } from '@/lib/profiles'
import { supabase } from '@/lib/supabase'
import { useRealtimeTable } from '@/lib/use-realtime'
import { detectSupplierCategory, SupplierCategoryPanel, type CategoryType } from '@/components/TabOperativo'
import AnimatedLaserBorder from '@/components/AnimatedLaserBorder'
import TabBudget from '@/components/TabBudget'
import { setFlyContext } from '@/lib/fly'
import { daysLeft, fmtShort, fmtLong } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Supplier } from '@/data/suppliers'
import type { Messaggio } from '@/data/comunicazioni'
import type { Uscita } from '@/data/amministrazione'
import type { EventoWorkflow } from '@/data/workflow'

const STATI = ['Tutti', 'bozza', 'pianificazione', 'in_corso', 'completato']
type StatoEvento = Event['stato']

type TabId = 'overview' | 'task' | 'team' | 'fornitori' | 'budget' | 'comunicazioni' | 'documenti' | 'programma' | 'timeline'

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

const LINK_CATEGORIES: { value: CategoryType; label: string }[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'ristorante', label: 'Ristorante' },
  { value: 'experience', label: 'Location / Attivita' },
  { value: 'catering', label: 'Catering' },
  { value: 'audio_video', label: 'Audio Video' },
  { value: 'allestimenti', label: 'Allestimenti' },
  { value: 'staff_interno', label: 'Staff Simmetria' },
  { value: 'staff_esterno', label: 'Staff Esterno' },
  { value: 'grafica_stampa', label: 'Grafica / Stampa' },
  { value: 'varie', label: 'Varie' },
]

function SupplierServiceBadge({ eventId, supplierId, category }: { eventId: string; supplierId: string; category: CategoryType }) {
  const [count, setCount] = useState(0)
  const [totals, setTotals] = useState({ venduto: 0, costo: 0 })

  useEffect(() => {
    const TABLES: Record<CategoryType, string> = {
      hotel: 'event_hotel_details', transfer: 'event_supplier_services',
      ristorante: 'event_restaurant_details', experience: 'event_experience_details',
      catering: 'event_catering_details', audio_video: 'event_audio_video_details',
      allestimenti: 'event_allestimenti_details', staff_interno: 'event_staff_interno_details',
      staff_esterno: 'event_staff_esterno_details', grafica_stampa: 'event_grafica_stampa_details',
      varie: 'event_varie_details',
    }
    const table = TABLES[category]
    if (!table) return

    let query = supabase.from(table).select('*').eq('event_id', eventId).eq('supplier_id', supplierId)
    if (category === 'transfer') query = query.eq('categoria', 'transfer')

    query.then(({ data }) => {
      if (!data) return
      setCount(data.length)
      let venduto = 0, costo = 0
      for (const row of data as Record<string, unknown>[]) {
        if (category === 'ristorante') {
          const pax = (row.pax_confermati as number) ?? (row.pax_previsti as number) ?? 1
          venduto += (row.budget_totale as number) ?? ((row.budget_per_persona as number) ? (row.budget_per_persona as number) * pax : 0)
          costo += (row.costo_totale_reale as number) ?? ((row.costo_per_persona as number) ? (row.costo_per_persona as number) * pax : 0)
        } else if (category === 'catering') {
          const pax = (row.pax as number) ?? 1
          venduto += (row.venduto_totale as number) ?? ((row.venduto_per_persona as number) ? (row.venduto_per_persona as number) * pax : 0)
          costo += (row.costo_totale as number) ?? ((row.costo_per_persona as number) ? (row.costo_per_persona as number) * pax : 0)
        } else if (category === 'staff_interno') {
          venduto += (row.venduto_totale as number) ?? 0
          costo += (row.costo_totale as number) ?? (row.costo_giornaliero as number) ?? 0
        } else {
          const qty = (row.quantita as number) ?? (row.pax as number) ?? 1
          venduto += (row.venduto_totale as number) ?? ((row.venduto_unitario as number) ? (row.venduto_unitario as number) * qty : 0)
          costo += (row.costo_totale as number) ?? ((row.costo_unitario as number) ? (row.costo_unitario as number) * qty : 0)
        }
      }
      setTotals({ venduto, costo })
    })
  }, [eventId, supplierId, category])

  if (count === 0) return null

  const margine = totals.venduto - totals.costo
  const fmt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>
        {count} {count === 1 ? 'servizio' : 'servizi'}
      </span>
      {(totals.venduto > 0 || totals.costo > 0) && (
        <span style={{ color: margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>
          {'\u20AC'}{fmt(margine)}
        </span>
      )}
    </div>
  )
}

function TabFornitori({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [links, setLinks] = useState<EventSupplierLink[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null)
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null)
  const [toast, setToast] = useState<{ supplierId: string; nome: string } | null>(null)
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [pendingLink, setPendingLink] = useState<string | null>(null)
  const [linkCategory, setLinkCategory] = useState<CategoryType | ''>('')

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

  function beginLink(supplierId: string) {
    setPendingLink(supplierId)
    setLinkCategory('')
  }

  async function confirmLink() {
    if (!pendingLink || !linkCategory) return
    const { error } = await supabase
      .from('event_suppliers')
      .insert({ event_id: event.id, supplier_id: pendingLink, service_category: linkCategory })
    if (!error) {
      setAdding(false)
      setSearch('')
      setPendingLink(null)
      setLinkCategory('')
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
              <button key={s.id} onClick={() => beginLink(s.id)}
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

      {pendingLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPendingLink(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Seleziona categoria</p>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              Come verra utilizzato questo fornitore in questo evento?
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {LINK_CATEGORIES.map(cat => (
                <button key={cat.value} onClick={() => setLinkCategory(cat.value)}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-left transition-all"
                  style={{
                    background: linkCategory === cat.value ? 'rgba(208,0,58,0.15)' : 'var(--panel2)',
                    border: `1px solid ${linkCategory === cat.value ? 'var(--red2)' : 'var(--line)'}`,
                    color: linkCategory === cat.value ? 'var(--red2)' : 'var(--text)',
                  }}>
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setPendingLink(null)}>Annulla</button>
              <button disabled={!linkCategory} onClick={confirmLink}
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ background: 'var(--red2)', color: '#fff' }}>Conferma</button>
            </div>
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
            const link = links.find(l => l.supplier_id === sup.id)
            const catType = (link?.service_category as CategoryType) || detectSupplierCategory(sup.categoria)
            const hasStoredCat = !!(link?.service_category)
            const isExpanded = expandedSupplier === sup.id
            return (
              <div key={sup.id} className="panel overflow-hidden" style={{ border: '1px solid var(--line)' }}>
                <div className="p-4 flex items-center gap-4">
                  <button
                    onClick={() => setExpandedSupplier(isExpanded ? null : sup.id)}
                    className="p-1 rounded transition-transform"
                    style={{ color: 'var(--muted)' }}>
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{sup.nome}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                        {sup.categoria}{sup.location ? ` · ${sup.location}` : ''}{sup.city ? ` · ${sup.city}` : ''}
                      </p>
                      <SupplierServiceBadge eventId={event.id} supplierId={sup.id} category={catType} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select value={catType}
                      onChange={async (e) => {
                        const newCat = e.target.value as CategoryType
                        if (link) {
                          await supabase.from('event_suppliers').update({ service_category: newCat }).eq('id', link.id)
                          await loadLinks()
                        }
                      }}
                      className="px-2 py-1.5 rounded-lg text-xs font-medium"
                      style={{ background: 'var(--panel2)', border: `1px solid ${hasStoredCat ? 'var(--line)' : 'var(--yellow)'}`, color: 'var(--text)', maxWidth: '130px' }}>
                      {LINK_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <button
                      onClick={() => setExpandedSupplier(isExpanded ? null : sup.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                      style={{ background: isExpanded ? 'rgba(208,0,58,0.15)' : 'rgba(208,0,58,0.08)', color: 'var(--red2)', border: '1px solid rgba(208,0,58,0.25)' }}>
                      <Plus className="w-3.5 h-3.5 inline mr-1" />
                      Servizi
                    </button>
                    <button onClick={() => setConfirmUnlink(sup.id)}
                      className="p-1.5 rounded-lg transition-all hover:bg-white/10" title="Rimuovi fornitore dall'evento">
                      <Trash2 className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid var(--line)', background: 'var(--bg)' }}>
                    <SupplierCategoryPanel event={event} supplierId={sup.id} category={catType} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Distance & Logistics Section */}
      <DistanceLogistics linkedSuppliers={linkedSuppliers} eventLocation={event.location} />

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

// ─── Distance & Logistics (Haversine) ────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function DistanceLogistics({ linkedSuppliers, eventLocation }: { linkedSuppliers: Supplier[]; eventLocation: string }) {
  const geoSuppliers = linkedSuppliers.filter(s => s.latitude && s.longitude)
  if (geoSuppliers.length < 2) return null

  const pairs: { from: Supplier; to: Supplier; km: number }[] = []
  for (let i = 0; i < geoSuppliers.length; i++) {
    for (let j = i + 1; j < geoSuppliers.length; j++) {
      const a = geoSuppliers[i]
      const b = geoSuppliers[j]
      const km = haversineKm(a.latitude!, a.longitude!, b.latitude!, b.longitude!)
      pairs.push({ from: a, to: b, km })
    }
  }
  pairs.sort((a, b) => a.km - b.km)

  return (
    <div className="panel p-5 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
          <MapPin className="w-4 h-4" style={{ color: 'var(--blue)' }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Distanze e logistica</p>
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Distanze approssimative tra i fornitori con coordinate ({geoSuppliers.length} su {linkedSuppliers.length})
            {eventLocation && <> · Evento: {eventLocation}</>}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--line)' }}>
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ background: 'var(--panel2)' }}>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Da</th>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>A</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Distanza</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Tempo stimato</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => {
              const driveMin = Math.round((p.km / 60) * 60)
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>
                    <span>{p.from.nome}</span>
                    <span className="ml-1 text-[10px]" style={{ color: 'var(--muted)' }}>({p.from.city || p.from.location})</span>
                  </td>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>
                    <span>{p.to.nome}</span>
                    <span className="ml-1 text-[10px]" style={{ color: 'var(--muted)' }}>({p.to.city || p.to.location})</span>
                  </td>
                  <td className="text-right px-3 py-2 font-semibold" style={{ color: p.km < 10 ? 'var(--green)' : p.km < 50 ? 'var(--blue)' : 'var(--red2)' }}>
                    {p.km < 1 ? `${Math.round(p.km * 1000)} m` : `${p.km.toFixed(1)} km`}
                  </td>
                  <td className="text-right px-3 py-2" style={{ color: 'var(--muted)' }}>
                    {driveMin < 60 ? `~${driveMin} min` : `~${Math.floor(driveMin / 60)}h ${driveMin % 60}min`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {geoSuppliers.length < linkedSuppliers.length && (
        <p className="text-[10px] mt-2" style={{ color: 'var(--muted)' }}>
          {linkedSuppliers.length - geoSuppliers.length} fornitori senza coordinate non sono inclusi nel calcolo.
          Aggiungi latitudine/longitudine nella scheda fornitore per includerli.
        </p>
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
  nome: string
  categoria: string
  event_id: string | null
  file_path: string
  file_name: string
  file_type: string
  file_size: number
  uploaded_by: string
  created_at: string
}

const DOC_CATEGORIE = [
  'Budget', 'Contratti', 'Preventivi', 'Hotel', 'Transfer', 'Ristoranti',
  'Fornitori', 'Rooming List', 'Presentazioni', 'Materiali Evento',
  'Foto / Video', 'Fatture', 'Varie',
]

function getFileLabel(mimeType: string): string {
  const FILE_ICONS: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'application/vnd.ms-powerpoint': 'PPT',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  }
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
  const [docCategoria, setDocCategoria] = useState('Materiali Evento')
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null)

  async function loadDocs() {
    const { data } = await supabase
      .from('documents')
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

    for (const file of Array.from(files)) {
      const storagePath = `${event.id}/${Date.now()}_${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file)

      if (uploadError) {
        console.error('Upload error:', uploadError.message)
        continue
      }

      await supabase.from('documents').insert({
        nome: file.name.replace(/\.[^/.]+$/, ''),
        categoria: docCategoria,
        event_id: event.id,
        file_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || 'application/octet-stream',
        uploaded_by: '',
      })
    }

    await loadDocs()
    setUploading(false)
    e.target.value = ''
  }

  async function handleDownload(doc: EventDocument) {
    const { data, error } = await supabase.storage
      .from('documents')
      .download(doc.file_path)
    if (error || !data) {
      alert('Errore download: ' + (error?.message ?? 'file non trovato'))
      return
    }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.file_name
    a.click()
    URL.revokeObjectURL(url)
  }

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')

  function handlePreview(doc: EventDocument) {
    const ext = doc.file_name.split('.').pop()?.toLowerCase() ?? ''
    const previewable = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp']
    if (!previewable.includes(ext)) { handleDownload(doc); return }
    const { data } = supabase.storage.from('documents').getPublicUrl(doc.file_path)
    if (data?.publicUrl) { setPreviewUrl(data.publicUrl); setPreviewName(doc.nome || doc.file_name) }
  }

  async function handleDelete(id: string) {
    const doc = docs.find(d => d.id === id)
    if (!doc) return
    await supabase.storage.from('documents').remove([doc.file_path])
    await supabase.from('documents').delete().eq('id', id)
    setDeletingDoc(null)
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento documenti...</div></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--muted)' }}>
          Documenti Evento ({docs.length})
        </p>
        <div className="flex items-center gap-2">
          <select value={docCategoria} onChange={e => setDocCategoria(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs" style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            {DOC_CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
            style={{ background: 'rgba(208,0,58,0.12)', color: 'var(--red2)', border: '1px solid rgba(208,0,58,0.35)' }}>
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'Caricamento...' : 'Carica'}
            <input type="file" className="hidden" onChange={handleUpload} multiple disabled={uploading}
              accept=".pdf,.xlsx,.xls,.pptx,.ppt,.docx,.jpg,.jpeg,.png" />
          </label>
        </div>
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
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{doc.nome || doc.file_name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {doc.categoria} · {formatFileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => handlePreview(doc)} title="Apri"
                    className="p-2 rounded-lg transition-all hover:bg-white/10">
                    <Eye className="w-4 h-4" style={{ color: 'var(--green)' }} />
                  </button>
                  <button onClick={() => handleDownload(doc)} title="Scarica"
                    className="p-2 rounded-lg transition-all hover:bg-white/10">
                    <Download className="w-4 h-4" style={{ color: 'var(--blue)' }} />
                  </button>
                  <button onClick={() => setDeletingDoc(doc.id)} title="Elimina"
                    className="p-2 rounded-lg transition-all hover:bg-white/10">
                    <Trash2 className="w-4 h-4" style={{ color: 'var(--red2)' }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deletingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingDoc(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Eliminare documento?</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Il file verra eliminato definitivamente.</p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setDeletingDoc(null)}>Annulla</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={() => handleDelete(deletingDoc)}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{previewName}</p>
            <button onClick={() => { setPreviewUrl(null); setPreviewName('') }}
              className="p-2 rounded-lg hover:bg-white/10">
              <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            {previewUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)
              ? <img src={previewUrl} alt={previewName} className="max-w-full max-h-[85vh] rounded-lg object-contain" />
              : <iframe src={previewUrl} className="w-full h-full rounded-lg" style={{ maxWidth: 900, minHeight: '80vh' }} />
            }
          </div>
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
  pax?: number | null
  servizio?: string
  manual?: boolean
}

interface ManualProgramRow {
  id: string
  event_id: string
  supplier_id: string | null
  titolo: string
  categoria: string
  data: string
  ora_inizio: string
  ora_fine: string | null
  luogo: string
  note: string
  pax: number | null
  servizio: string
}

const PROGRAM_CATEGORIES = [
  'Hotel', 'Meeting', 'F&B', 'Ristorante', 'Catering', 'Transfer',
  'Experience', 'Audio Video', 'Allestimenti', 'Staff', 'Grafica/Stampa', 'Varie', 'Altro',
]

function TabProgramma({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [autoEntries, setAutoEntries] = useState<ProgramEntry[]>([])
  const [manualEntries, setManualEntries] = useState<ManualProgramRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    supplier_id: '',
    titolo: '',
    categoria: 'Altro',
    data: event.dataInizio || '',
    ora_inizio: '09:00',
    ora_fine: '',
    luogo: '',
    note: '',
    pax: '',
    servizio: '',
  })

  function resetForm() {
    setFormData({
      supplier_id: '',
      titolo: '',
      categoria: 'Altro',
      data: event.dataInizio || '',
      ora_inizio: '09:00',
      ora_fine: '',
      luogo: '',
      note: '',
      pax: '',
      servizio: '',
    })
    setEditingId(null)
    setShowForm(false)
  }

  async function loadAll() {
    const [autoRes, manualRes] = await Promise.all([
      loadAutoEntries(),
      supabase.from('event_program').select('*').eq('event_id', event.id),
    ])

    setAutoEntries(autoRes)
    setManualEntries((manualRes.data ?? []) as ManualProgramRow[])
    setLoading(false)
  }

  async function loadAutoEntries(): Promise<ProgramEntry[]> {
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
          id: svc.id, supplier_id: svc.supplier_id,
          titolo: svc.titolo,
          categoria: SVC_CATEGORIES.find(c => c.value === svc.categoria)?.label ?? svc.categoria,
          data: svc.data, ora_inizio: svc.ora_inizio, ora_fine: svc.ora_fine,
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
          program.push({ id: h.id + '-cin', supplier_id: h.supplier_id, titolo: 'Check-in Hotel', categoria: 'Hotel', data: h.check_in_date, ora_inizio: h.check_in_time || '14:00', ora_fine: null, luogo: h.luogo, note: roomInfo })
        }
        if (h.check_out_date) {
          const roomInfo = [h.quantita ? `${h.quantita} camere` : '', h.room_type].filter(Boolean).join(' ')
          program.push({ id: h.id + '-cout', supplier_id: h.supplier_id, titolo: 'Check-out Hotel', categoria: 'Hotel', data: h.check_out_date, ora_inizio: h.check_out_time || '10:00', ora_fine: null, luogo: h.luogo, note: roomInfo })
        }
      } else if (h.tipo === 'sala_meeting') {
        if (h.data && h.ora_inizio) {
          program.push({ id: h.id + '-meet', supplier_id: h.supplier_id, titolo: `Meeting${h.luogo ? ' - ' + h.luogo : ''}${h.meeting_pax ? ' ' + h.meeting_pax + ' pax' : ''}`, categoria: 'Meeting', data: h.data, ora_inizio: h.ora_inizio, ora_fine: h.ora_fine, luogo: h.luogo, note: [h.meeting_setup, h.meeting_equipment, h.note].filter(Boolean).join(' | ') })
        }
      } else {
        if (h.data && h.ora_inizio) {
          program.push({ id: h.id, supplier_id: h.supplier_id, titolo: tipoLabel, categoria: 'F&B', data: h.data, ora_inizio: h.ora_inizio, ora_fine: null, luogo: h.luogo, note: h.note })
        }
      }
    }

    for (const r of (restRes.data ?? []) as RestaurantDetail[]) {
      if (r.data && r.ora_inizio) {
        program.push({ id: r.id + '-start', supplier_id: r.supplier_id, titolo: r.tipologia_servizio || 'Servizio ristorante', categoria: 'Ristorante', data: r.data, ora_inizio: r.ora_inizio, ora_fine: r.ora_fine, luogo: r.nome_sala, note: r.pax_confermati ? `${r.pax_confermati} pax` : '' })
      }
    }

    for (const e of (expRes.data ?? []) as ExperienceDetail[]) {
      if (e.data && e.ora_inizio) {
        program.push({ id: e.id, supplier_id: e.supplier_id ?? '', titolo: e.nome_attivita || 'Experience', categoria: 'Experience', data: e.data, ora_inizio: e.ora_inizio, ora_fine: e.ora_fine, luogo: e.location, note: [e.pax ? `${e.pax} pax` : '', e.durata_minuti ? `${e.durata_minuti} min` : '', e.note_operative].filter(Boolean).join(' | ') })
      }
    }

    for (const c of (catRes.data ?? []) as CateringDetail[]) {
      const ora = c.ora_inizio || c.ora
      if (c.data && ora) {
        program.push({ id: c.id, supplier_id: c.supplier_id ?? '', titolo: c.tipologia || 'Catering', categoria: 'Catering', data: c.data, ora_inizio: ora, ora_fine: c.ora_fine, luogo: '', note: c.pax ? `${c.pax} pax` : '' })
      }
    }

    for (const si of (staffIntRes.data ?? []) as StaffInternoDetail[]) {
      if (si.data && si.ora_inizio) {
        const nome = [(si as any).nome, (si as any).cognome].filter(Boolean).join(' ') || si.risorsa || ''
        const label = si.ruolo ? (nome ? `${si.ruolo} - ${nome}` : si.ruolo) : (nome || 'Staff Simmetria')
        program.push({ id: si.id, supplier_id: '', titolo: label, categoria: 'Staff Simmetria', data: si.data, ora_inizio: si.ora_inizio, ora_fine: si.ora_fine, luogo: '', note: si.note || '' })
      }
    }

    for (const se of (staffExtRes.data ?? []) as StaffEsternoDetail[]) {
      if (se.data && se.ora_inizio) {
        const nome = [(se as any).nome, (se as any).cognome].filter(Boolean).join(' ')
        const label = se.ruolo ? (nome ? `${se.ruolo} - ${nome}` : `${se.ruolo}${se.quantita > 1 ? ' x' + se.quantita : ''}`) : (nome || 'Staff Esterno')
        program.push({ id: se.id, supplier_id: se.supplier_id ?? '', titolo: label, categoria: 'Staff Esterno', data: se.data, ora_inizio: se.ora_inizio, ora_fine: se.ora_fine, luogo: '', note: [se.lingue, se.note].filter(Boolean).join(' | ') })
      }
    }

    for (const v of (varieRes.data ?? []) as VarieDetail[]) {
      if (v.data && v.ora_inizio) {
        program.push({ id: v.id, supplier_id: v.supplier_id ?? '', titolo: v.descrizione || 'Varie', categoria: 'Varie', data: v.data, ora_inizio: v.ora_inizio, ora_fine: null, luogo: '', note: v.note || '' })
      }
    }

    for (const av of (avRes.data ?? []) as Record<string, unknown>[]) {
      if (av.data_montaggio && av.ora_montaggio) program.push({ id: av.id + '-mont', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Montaggio AV', categoria: 'Audio Video', data: av.data_montaggio as string, ora_inizio: av.ora_montaggio as string, ora_fine: null, luogo: '', note: (av.tipologia_servizio as string) || '' })
      if (av.data_prove && av.ora_prove) program.push({ id: av.id + '-prove', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Prove AV', categoria: 'Audio Video', data: av.data_prove as string, ora_inizio: av.ora_prove as string, ora_fine: null, luogo: '', note: '' })
      if (av.data_evento && av.ora_evento) program.push({ id: av.id + '-evt', supplier_id: (av.supplier_id as string) ?? '', titolo: (av.tipologia_servizio as string) || 'Servizio AV', categoria: 'Audio Video', data: av.data_evento as string, ora_inizio: av.ora_evento as string, ora_fine: null, luogo: '', note: '' })
      if (av.data_smontaggio && av.ora_smontaggio) program.push({ id: av.id + '-smont', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Smontaggio AV', categoria: 'Audio Video', data: av.data_smontaggio as string, ora_inizio: av.ora_smontaggio as string, ora_fine: null, luogo: '', note: '' })
    }

    for (const al of (allestRes.data ?? []) as Record<string, unknown>[]) {
      if (al.data_montaggio && al.ora_montaggio) program.push({ id: al.id + '-mont', supplier_id: (al.supplier_id as string) ?? '', titolo: `Montaggio: ${(al.descrizione as string) || 'Allestimento'}`, categoria: 'Allestimenti', data: al.data_montaggio as string, ora_inizio: al.ora_montaggio as string, ora_fine: null, luogo: (al.area_utilizzo as string) || '', note: '' })
      if (al.data_smontaggio && al.ora_smontaggio) program.push({ id: al.id + '-smont', supplier_id: (al.supplier_id as string) ?? '', titolo: `Smontaggio: ${(al.descrizione as string) || 'Allestimento'}`, categoria: 'Allestimenti', data: al.data_smontaggio as string, ora_inizio: al.ora_smontaggio as string, ora_fine: null, luogo: (al.area_utilizzo as string) || '', note: '' })
    }

    for (const g of (graficaRes.data ?? []) as Record<string, unknown>[]) {
      if (g.data_consegna) program.push({ id: g.id as string, supplier_id: (g.supplier_id as string) ?? '', titolo: `Consegna: ${(g.tipo_materiale as string) || 'Materiale'}`, categoria: 'Grafica/Stampa', data: g.data_consegna as string, ora_inizio: '09:00', ora_fine: null, luogo: '', note: (g.formato as string) || '' })
    }

    return program
  }

  useEffect(() => { loadAll() }, [event.id])

  const allEntries = useMemo(() => {
    const merged: ProgramEntry[] = [
      ...autoEntries,
      ...manualEntries.map(m => ({
        id: m.id,
        supplier_id: m.supplier_id || '',
        titolo: m.titolo,
        categoria: m.categoria,
        data: m.data,
        ora_inizio: m.ora_inizio,
        ora_fine: m.ora_fine,
        luogo: m.luogo,
        note: m.note,
        pax: m.pax,
        servizio: m.servizio,
        manual: true,
      })),
    ]
    merged.sort((a, b) => {
      const cmpDate = a.data.localeCompare(b.data)
      if (cmpDate !== 0) return cmpDate
      return a.ora_inizio.localeCompare(b.ora_inizio)
    })
    return merged
  }, [autoEntries, manualEntries])

  const grouped = allEntries.reduce<Record<string, ProgramEntry[]>>((acc, e) => {
    if (!acc[e.data]) acc[e.data] = []
    acc[e.data].push(e)
    return acc
  }, {})

  function openEdit(entry: ProgramEntry) {
    const m = manualEntries.find(r => r.id === entry.id)
    if (!m) return
    setFormData({
      supplier_id: m.supplier_id || '',
      titolo: m.titolo,
      categoria: m.categoria,
      data: m.data,
      ora_inizio: m.ora_inizio,
      ora_fine: m.ora_fine || '',
      luogo: m.luogo,
      note: m.note,
      pax: m.pax ? String(m.pax) : '',
      servizio: m.servizio,
    })
    setEditingId(m.id)
    setShowForm(true)
  }

  async function handleSave() {
    if (!formData.titolo.trim() || !formData.data || !formData.ora_inizio) return
    const payload = {
      event_id: event.id,
      supplier_id: formData.supplier_id || null,
      titolo: formData.titolo.trim(),
      categoria: formData.categoria,
      data: formData.data,
      ora_inizio: formData.ora_inizio,
      ora_fine: formData.ora_fine || null,
      luogo: formData.luogo.trim(),
      note: formData.note.trim(),
      pax: formData.pax ? parseInt(formData.pax) : null,
      servizio: formData.servizio.trim(),
    }

    if (editingId) {
      await supabase.from('event_program').update(payload).eq('id', editingId)
    } else {
      await supabase.from('event_program').insert(payload)
    }
    resetForm()
    await loadAll()
  }

  async function handleDelete(id: string) {
    await supabase.from('event_program').delete().eq('id', id)
    await loadAll()
  }

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento programma...</div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--muted)' }}>
          Programma evento
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>
            {allEntries.length} attivita
          </span>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}
          >
            <Plus className="w-3.5 h-3.5" /> Aggiungi
          </button>
        </div>
      </div>

      {showForm && (
        <div className="panel p-5 space-y-4" style={{ border: '1px solid var(--red2)', borderRadius: '12px' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {editingId ? 'Modifica voce programma' : 'Nuova voce programma'}
            </p>
            <button onClick={resetForm} className="p-1 rounded hover:bg-black/10"><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Fornitore</label>
              <select
                value={formData.supplier_id}
                onChange={e => setFormData(prev => ({ ...prev, supplier_id: e.target.value, servizio: '' }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              >
                <option value="">-- Nessun fornitore --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.nome}{s.categoria ? ` (${s.categoria})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Servizio collegato</label>
              <input
                value={formData.servizio}
                onChange={e => setFormData(prev => ({ ...prev, servizio: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="es. Coffee break, Allestimento palco..."
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Titolo *</label>
              <input
                value={formData.titolo}
                onChange={e => setFormData(prev => ({ ...prev, titolo: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="es. Coffee break, Meeting plenaria..."
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Categoria</label>
              <select
                value={formData.categoria}
                onChange={e => setFormData(prev => ({ ...prev, categoria: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              >
                {PROGRAM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Data *</label>
              <input
                type="date"
                value={formData.data}
                onChange={e => setFormData(prev => ({ ...prev, data: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Ora inizio *</label>
                <input
                  type="time"
                  value={formData.ora_inizio}
                  onChange={e => setFormData(prev => ({ ...prev, ora_inizio: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Ora fine</label>
                <input
                  type="time"
                  value={formData.ora_fine}
                  onChange={e => setFormData(prev => ({ ...prev, ora_fine: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Location / Sala</label>
              <input
                value={formData.luogo}
                onChange={e => setFormData(prev => ({ ...prev, luogo: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="es. Sala Galileo, Terrazza..."
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Pax</label>
              <input
                type="number"
                value={formData.pax}
                onChange={e => setFormData(prev => ({ ...prev, pax: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="Numero partecipanti"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Note operative</label>
              <textarea
                value={formData.note}
                onChange={e => setFormData(prev => ({ ...prev, note: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="Note operative, istruzioni..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ color: 'var(--muted)' }}>Annulla</button>
            <button
              onClick={handleSave}
              disabled={!formData.titolo.trim() || !formData.data || !formData.ora_inizio}
              className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}
            >
              {editingId ? 'Salva modifiche' : 'Aggiungi al programma'}
            </button>
          </div>
        </div>
      )}

      {allEntries.length === 0 && !showForm && (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessuna voce nel programma</p>
          <p className="text-xs mt-1">Aggiungi voci manuali o compila i servizi dei fornitori per generare il programma</p>
        </div>
      )}

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
                      style={{ borderColor: entry.manual ? 'var(--blue)' : 'var(--red2)', background: 'var(--bg)' }} />
                    <div className="flex-1 panel p-4" style={{ border: entry.manual ? '1px solid rgba(59,130,246,0.3)' : undefined }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                              {entry.ora_inizio?.slice(0, 5)}
                              {entry.ora_fine ? ` - ${entry.ora_fine.slice(0, 5)}` : ''}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: entry.manual ? 'rgba(59,130,246,0.1)' : 'rgba(208,0,58,0.1)', color: entry.manual ? 'var(--blue)' : 'var(--red2)' }}>
                              {entry.categoria}
                            </span>
                            {entry.pax && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                                <Users className="w-3 h-3 inline mr-0.5" />{entry.pax} pax
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium mt-1" style={{ color: 'var(--text)' }}>
                            {entry.titolo}
                          </p>
                          {sup && (
                            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                              <Truck className="w-3 h-3 inline mr-1" />{sup.nome}
                            </p>
                          )}
                          {entry.servizio && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                              <Link2 className="w-3 h-3 inline mr-1" />{entry.servizio}
                            </p>
                          )}
                          {entry.luogo && (
                            <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                              <MapPin className="w-3 h-3 inline" />{entry.luogo}
                            </div>
                          )}
                          {entry.note && <p className="text-xs mt-1 italic" style={{ color: 'var(--muted)' }}>{entry.note}</p>}
                        </div>
                        {entry.manual && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => openEdit(entry)} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
                              <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                            </button>
                            <button onClick={() => handleDelete(entry.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                            </button>
                          </div>
                        )}
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


function BudgetTabContainer({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  return <TabBudget event={event} suppliers={suppliers} />
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
    { id: 'fornitori', label: `Fornitori${eventSuppliers.length > 0 ? ` (${eventSuppliers.length})` : ''}` },
    { id: 'programma', label: 'Programma' },
    { id: 'budget', label: 'Budget' },
    { id: 'task', label: `Task${totalTasks > 0 ? ` (${totalTasks})` : ''}` },
    { id: 'team', label: `Team (${event.team.length})` },
    { id: 'documenti', label: 'Documenti' },
    { id: 'comunicazioni', label: `Comunicazioni${eventMsg.length > 0 ? ` (${eventMsg.length})` : ''}` },
    { id: 'timeline', label: 'Timeline' },
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
            <div className="flex flex-col gap-2 w-full sm:w-auto sm:min-w-[160px]">
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
            <div className="flex items-center gap-2 overflow-x-auto">
              {statiSequenza.map((s, i) => (
                <button key={s} onClick={() => onStatusChange(event, s)}
                  className="flex-1 min-w-[70px] py-2 rounded-lg text-[11px] font-medium transition-all"
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
        {activeTab === 'budget' && <BudgetTabContainer event={event} suppliers={suppliers} />}
        {activeTab === 'comunicazioni' && <TabComunicazioni event={event} comunicazioni={comunicazioni} />}
        {activeTab === 'documenti' && <TabDocumenti event={event} />}
        {activeTab === 'programma' && <TabProgramma event={event} suppliers={suppliers} />}
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

  // Set Fly AI context
  useEffect(() => {
    setFlyContext({
      page: 'eventi',
      eventId: selectedEvent?.id ?? undefined,
      clientId: selectedEvent?.cliente ?? undefined,
    })
    return () => { setFlyContext({ page: 'eventi', eventId: undefined, clientId: undefined }) }
  }, [selectedEvent])

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
