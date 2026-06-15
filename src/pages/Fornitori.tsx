import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Globe,
  Star,
  FileText,
  Calendar,
  Euro,
  Shield,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Search,
  X,
  Filter,
  ChevronDown,
  Package,
  User,
  Hash,
  MessageSquare,
  Download,
  Plus,
  Edit3,
  Trash2,
  Save,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { loadTasksFromStorage } from '@/lib/storage'
import { fetchSuppliers, upsertSupplier, deleteSupplier as deleteSupplierRemote } from '@/lib/suppliers-service'
import { fetchEvents } from '@/lib/events-service'
import { fetchBudgets } from '@/lib/budgets-service'
import type { Supplier, StatoContratto } from '@/data/suppliers'
import type { Event } from '@/data/events'
import type { Uscita } from '@/data/amministrazione'

const STORAGE_KEY_FORNITORI = 'simmetria_fornitori'

function cacheSuppliersToStorage(list: Supplier[]) {
  try {
    localStorage.setItem(STORAGE_KEY_FORNITORI, JSON.stringify(list))
  } catch {
    // ignore quota errors
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEur(n: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}
function daysToExpiry(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

function contrattoColor(s: StatoContratto) {
  switch (s) {
    case 'attivo': return 'var(--green)'
    case 'in_scadenza': return 'var(--yellow)'
    case 'scaduto': return 'var(--red2)'
    case 'in_rinnovo': return 'var(--blue)'
    case 'sospeso': return 'var(--muted)'
  }
}
function contrattoLabel(s: StatoContratto) {
  switch (s) {
    case 'attivo': return 'Attivo'
    case 'in_scadenza': return 'In Scadenza'
    case 'scaduto': return 'Scaduto'
    case 'in_rinnovo': return 'In Rinnovo'
    case 'sospeso': return 'Sospeso'
  }
}
function contrattoIcon(s: StatoContratto) {
  switch (s) {
    case 'attivo': return CheckCircle
    case 'in_scadenza': return AlertTriangle
    case 'scaduto': return XCircle
    case 'in_rinnovo': return Clock
    case 'sospeso': return XCircle
  }
}

function docTipoColor(t: string) {
  switch (t) {
    case 'contratto': return 'var(--blue)'
    case 'preventivo': return 'var(--yellow)'
    case 'fattura': return 'var(--green)'
    case 'certificazione': return '#f97316'
    default: return 'var(--muted)'
  }
}

function RatingStars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const w = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={w}
          fill={i <= Math.round(rating) ? 'var(--yellow)' : 'transparent'}
          style={{ color: i <= Math.round(rating) ? 'var(--yellow)' : 'var(--line)' }}
        />
      ))}
    </div>
  )
}

// ─── Supplier Form Modal ──────────────────────────────────────────────────────

function SupplierFormModal({ supplier, events, onSave, onCancel }: {
  supplier?: Supplier; events: Event[]; onSave: (s: Supplier) => void; onCancel: () => void
}) {
  const [nome, setNome] = useState(supplier?.nome ?? '')
  const [email, setEmail] = useState(supplier?.email ?? '')
  const [telefono, setTelefono] = useState(supplier?.telefono ?? '')
  const [categoria, setCategoria] = useState(supplier?.categoria ?? '')
  const [referente, setReferente] = useState(supplier?.referente ?? '')
  const [referenteTelefono, setReferenteTelefono] = useState(supplier?.referenteTelefono ?? '')
  const [location, setLocation] = useState(supplier?.location ?? '')
  const [sito, setSito] = useState(supplier?.sito ?? '')
  const [piva, setPiva] = useState(supplier?.piva ?? '')
  const [stato, setStato] = useState<'attivo' | 'inattivo'>(supplier?.stato ?? 'attivo')
  const [statoContratto, setStatoContratto] = useState<StatoContratto>(supplier?.statoContratto ?? 'attivo')
  const [scadenzaContratto, setScadenzaContratto] = useState(supplier?.scadenzaContratto ?? '')
  const [servizi, setServizi] = useState(supplier?.servizi?.join(', ') ?? '')
  const [noteOperative, setNoteOperative] = useState(supplier?.noteOperative ?? '')
  const [eventiId, setEventiId] = useState<string[]>(supplier?.eventiId ?? [])
  const [costoMedio, setCostoMedio] = useState(supplier?.costoMedioPerEvento?.toString() ?? '')
  const [costoMin, setCostoMin] = useState(supplier?.costoMinimo?.toString() ?? '')
  const [costoMax, setCostoMax] = useState(supplier?.costoMassimo?.toString() ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !email.trim()) return
    const updated: Supplier = {
      id: supplier?.id ?? `sup_${Date.now()}`,
      nome: nome.trim(),
      email: email.trim(),
      telefono: telefono.trim(),
      categoria: categoria.trim(),
      referente: referente.trim(),
      referenteTelefono: referenteTelefono.trim(),
      rating: supplier?.rating ?? 0,
      stato,
      statoContratto,
      scadenzaContratto,
      servizi: servizi.split(',').map(s => s.trim()).filter(Boolean),
      location: location.trim(),
      sito: sito.trim(),
      costoMedioPerEvento: parseInt(costoMedio) || 0,
      costoMinimo: parseInt(costoMin) || 0,
      costoMassimo: parseInt(costoMax) || 0,
      noteOperative: noteOperative.trim(),
      eventiId,
      documenti: supplier?.documenti ?? [],
      recensioni: supplier?.recensioni ?? [],
      piva: piva.trim(),
    }
    onSave(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
            {supplier ? 'Modifica Fornitore' : 'Nuovo Fornitore'}
          </h2>
          <button onClick={onCancel} className="p-2 rounded-lg transition-all hover:bg-white/5">
            <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Nome azienda *</label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Categoria</label>
              <input type="text" value={categoria} onChange={e => setCategoria(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="Es. Audio/Video, Catering..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Telefono</label>
              <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Referente</label>
              <input type="text" value={referente} onChange={e => setReferente(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Tel. referente</label>
              <input type="text" value={referenteTelefono} onChange={e => setReferenteTelefono(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Location</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Sito web</label>
              <input type="text" value={sito} onChange={e => setSito(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>P.IVA</label>
              <input type="text" value={piva} onChange={e => setPiva(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Stato</label>
              <select value={stato} onChange={e => setStato(e.target.value as 'attivo' | 'inattivo')}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="attivo">Attivo</option>
                <option value="inattivo">Inattivo</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Stato contratto</label>
              <select value={statoContratto} onChange={e => setStatoContratto(e.target.value as StatoContratto)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="attivo">Attivo</option>
                <option value="in_scadenza">In Scadenza</option>
                <option value="in_rinnovo">In Rinnovo</option>
                <option value="scaduto">Scaduto</option>
                <option value="sospeso">Sospeso</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Scadenza contratto</label>
              <input type="date" value={scadenzaContratto} onChange={e => setScadenzaContratto(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Costo medio/evento</label>
              <input type="number" value={costoMedio} onChange={e => setCostoMedio(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Costo minimo</label>
              <input type="number" value={costoMin} onChange={e => setCostoMin(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Costo massimo</label>
              <input type="number" value={costoMax} onChange={e => setCostoMax(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Servizi (separati da virgola)</label>
            <input type="text" value={servizi} onChange={e => setServizi(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
              placeholder="Es. Impianti audio, Video proiezione, Illuminazione" />
          </div>

          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--muted)' }}>Eventi collegati</label>
            <div className="flex flex-wrap gap-2">
              {events.map(ev => (
                <button key={ev.id} type="button"
                  onClick={() => setEventiId(prev => prev.includes(ev.id) ? prev.filter(x => x !== ev.id) : [...prev, ev.id])}
                  className="px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: eventiId.includes(ev.id) ? 'rgba(208,0,58,0.12)' : 'var(--panel)',
                    color: eventiId.includes(ev.id) ? 'var(--red2)' : 'var(--muted)',
                    border: `1px solid ${eventiId.includes(ev.id) ? 'rgba(208,0,58,0.3)' : 'var(--line)'}`,
                  }}>
                  {ev.nome}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Note operative</label>
            <textarea value={noteOperative} onChange={e => setNoteOperative(e.target.value)} rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>

          <div className="flex gap-3 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="submit" className="btn-primary flex-1 py-3 rounded-xl text-sm font-semibold">
              {supplier ? 'Salva Modifiche' : 'Crea Fornitore'}
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

// ─── Delete Confirm ──────────────────────────────────────────────────────────

function DeleteConfirm({ name, onConfirm, onCancel }: {
  name: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,49,95,0.12)' }}>
            <Trash2 className="w-5 h-5" style={{ color: 'var(--red2)' }} />
          </div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Elimina fornitore</h3>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
          Sei sicuro di voler eliminare <strong style={{ color: 'var(--text)' }}>"{name}"</strong>?
        </p>
        <div className="flex gap-3">
          <button onClick={onConfirm}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'var(--red2)' }}>Elimina</button>
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-medium"
            style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--line)' }}>Annulla</button>
        </div>
      </div>
    </div>
  )
}

// ─── Supplier Detail ──────────────────────────────────────────────────────────

interface DetailProps {
  supplier: Supplier
  events: Event[]
  budgets: Uscita[]
  onBack: () => void
  showFinance: boolean
  onEdit: (s: Supplier) => void
  onDelete: (s: Supplier) => void
  onSaveNotes: (s: Supplier, notes: string) => void
}

function SupplierDetail({ supplier, events, budgets, onBack, showFinance, onEdit, onDelete, onSaveNotes }: DetailProps) {
  const [tab, setTab] = useState<'overview' | 'eventi' | 'documenti' | 'recensioni'>('overview')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesText, setNotesText] = useState(supplier.noteOperative)

  const linkedEvents = events.filter(e => supplier.eventiId.includes(e.id))
  const totalSpeso = showFinance
    ? budgets.filter(u => u.fornitoreId === supplier.id).reduce((s, u) => s + u.importo, 0)
    : 0
  const ContrattoIcon = contrattoIcon(supplier.statoContratto)
  const days = daysToExpiry(supplier.scadenzaContratto)

  const tabs = [
    { id: 'overview' as const, label: 'Panoramica' },
    { id: 'eventi' as const, label: `Eventi (${linkedEvents.length})` },
    { id: 'documenti' as const, label: `Documenti (${supplier.documenti.length})` },
    { id: 'recensioni' as const, label: `Recensioni (${supplier.recensioni.length})` },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
          style={{ color: 'var(--muted)' }}
        >
          <ArrowLeft className="w-4 h-4" /> Torna ai fornitori
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => onEdit(supplier)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            <Edit3 className="w-4 h-4" /> Modifica
          </button>
          <button onClick={() => onDelete(supplier)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
            style={{ background: 'rgba(255,49,95,0.08)', border: '1px solid rgba(255,49,95,0.2)', color: 'var(--red2)' }}>
            <Trash2 className="w-4 h-4" /> Elimina
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="panel p-6 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            background: `linear-gradient(135deg, ${supplier.stato === 'attivo' ? contrattoColor(supplier.statoContratto) : 'var(--muted)'} 0%, transparent 60%)`,
          }}
        />
        <div className="relative flex flex-wrap items-start gap-6">
          {/* Avatar placeholder */}
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold flex-shrink-0"
            style={{ background: `${contrattoColor(supplier.statoContratto)}20`, color: contrattoColor(supplier.statoContratto) }}
          >
            {supplier.nome.charAt(0)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{
                  background: `${contrattoColor(supplier.statoContratto)}15`,
                  color: contrattoColor(supplier.statoContratto),
                  border: `1px solid ${contrattoColor(supplier.statoContratto)}30`,
                }}
              >
                <ContrattoIcon className="w-3 h-3 inline mr-1 -mt-0.5" />
                {contrattoLabel(supplier.statoContratto)}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                {supplier.categoria}
              </span>
              {supplier.stato === 'inattivo' && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,49,95,0.12)', color: 'var(--red2)' }}>
                  Inattivo
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{supplier.nome}</h1>
            <div className="flex items-center gap-3 mt-1.5">
              <RatingStars rating={supplier.rating} size="sm" />
              <span className="text-sm font-semibold" style={{ color: 'var(--yellow)' }}>{supplier.rating.toFixed(1)}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>({supplier.recensioni.length} recensioni)</span>
            </div>
            {(supplier.statoContratto === 'in_scadenza' || supplier.statoContratto === 'in_rinnovo') && (
              <p className="text-xs mt-2" style={{ color: 'var(--yellow)' }}>
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Contratto scade il {formatDate(supplier.scadenzaContratto)}
                {days > 0 ? ` (tra ${days} giorni)` : ' (scaduto)'}
              </p>
            )}
          </div>

          {/* KPIs */}
          {showFinance && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-shrink-0">
              {[
                { label: 'Costo medio', value: formatEur(supplier.costoMedioPerEvento), color: 'var(--text)' },
                { label: 'Totale speso', value: formatEur(totalSpeso), color: 'var(--red2)' },
                { label: 'Range', value: `${formatEur(supplier.costoMinimo)}–${formatEur(supplier.costoMassimo)}`, color: 'var(--muted)' },
              ].map(k => (
                <div key={k.label} className="text-center p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{k.label}</p>
                  <p className="text-sm font-bold mt-0.5 whitespace-nowrap" style={{ color: k.color }}>{k.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === t.id ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'transparent',
              color: tab === t.id ? 'white' : 'var(--muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
          {/* Recapiti */}
          <div className="panel p-5">
            <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Recapiti</p>
            <div className="space-y-3">
              {[
                { icon: Mail, value: supplier.email, color: 'var(--blue)' },
                { icon: Phone, value: supplier.telefono, color: 'var(--green)' },
                { icon: MapPin, value: supplier.location, color: 'var(--red2)' },
                { icon: Globe, value: supplier.sito, color: 'var(--muted)' },
                { icon: Hash, value: `P.IVA ${supplier.piva}`, color: 'var(--muted)' },
              ].map(item => (
                <div key={item.value} className="flex items-center gap-3">
                  <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: item.color }} />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Referente */}
          <div className="panel p-5">
            <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Referente</p>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                style={{ background: 'var(--panel2)', color: 'var(--text)' }}
              >
                {supplier.referente.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{supplier.referente}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Responsabile commerciale</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                <span style={{ color: 'var(--text)' }}>{supplier.referenteTelefono}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-3.5 h-3.5" style={{ color: 'var(--blue)' }} />
                <span style={{ color: 'var(--text)' }}>{supplier.email}</span>
              </div>
            </div>
          </div>

          {/* Servizi */}
          <div className="panel p-5">
            <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Servizi offerti</p>
            <div className="flex flex-wrap gap-2">
              {supplier.servizi.map(s => (
                <span
                  key={s}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Contratto */}
          <div className="panel p-5">
            <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Contratto</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Stato</span>
                <span
                  className="text-xs px-2.5 py-1 rounded font-semibold"
                  style={{ background: `${contrattoColor(supplier.statoContratto)}15`, color: contrattoColor(supplier.statoContratto) }}
                >
                  {contrattoLabel(supplier.statoContratto)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Scadenza</span>
                <span className="text-sm font-medium" style={{ color: days < 30 ? 'var(--yellow)' : 'var(--text)' }}>
                  {formatDate(supplier.scadenzaContratto)}
                </span>
              </div>
              {showFinance && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>Costo medio/evento</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{formatEur(supplier.costoMedioPerEvento)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>Range</span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {formatEur(supplier.costoMinimo)} – {formatEur(supplier.costoMassimo)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Note operative */}
          <div className="panel p-5 md:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Note operative</p>
              {editingNotes ? (
                <button onClick={() => { onSaveNotes(supplier, notesText); setEditingNotes(false) }}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(56,210,125,0.12)', color: 'var(--green)', border: '1px solid rgba(56,210,125,0.3)' }}>
                  <Save className="w-3 h-3" /> Salva
                </button>
              ) : (
                <button onClick={() => setEditingNotes(true)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'var(--panel2)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
                  <Edit3 className="w-3 h-3" /> Modifica
                </button>
              )}
            </div>
            {editingNotes ? (
              <textarea value={notesText} onChange={e => setNotesText(e.target.value)} rows={4}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{supplier.noteOperative || 'Nessuna nota operativa.'}</p>
            )}
          </div>

          {/* Performance */}
          <div className="panel p-5 md:col-span-2">
            <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Performance</p>
            <div className="flex flex-wrap items-center gap-8">
              <div className="text-center">
                <p className="text-4xl font-bold" style={{ color: 'var(--yellow)' }}>{supplier.rating.toFixed(1)}</p>
                <RatingStars rating={supplier.rating} size="lg" />
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Rating globale</p>
              </div>
              <div className="flex-1 min-w-[180px]">
                {[5, 4, 3, 2, 1].map(star => {
                  const count = supplier.recensioni.filter(r => Math.round(r.voto) === star).length
                  const perc = supplier.recensioni.length > 0 ? (count / supplier.recensioni.length) * 100 : 0
                  return (
                    <div key={star} className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs w-6 text-right" style={{ color: 'var(--muted)' }}>{star}</span>
                      <Star className="w-3 h-3 flex-shrink-0" fill="var(--yellow)" style={{ color: 'var(--yellow)' }} />
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
                        <div className="h-full rounded-full" style={{ width: `${perc}%`, background: 'var(--yellow)' }} />
                      </div>
                      <span className="text-xs w-4" style={{ color: 'var(--muted)' }}>{count}</span>
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Eventi completati', value: supplier.eventiId.length },
                  { label: 'Documenti', value: supplier.documenti.length },
                ].map(k => (
                  <div key={k.label} className="text-center p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
                    <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{k.value}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{k.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Eventi */}
      {tab === 'eventi' && (
        <div className="space-y-3 animate-fade-in">
          {linkedEvents.length === 0 ? (
            <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nessun evento collegato</p>
            </div>
          ) : linkedEvents.map(ev => {
            const statoColor = { in_corso: 'var(--red2)', pianificazione: 'var(--blue)', completato: 'var(--green)', bozza: 'var(--yellow)' }[ev.stato]
            const statoLabel = { in_corso: 'In Corso', pianificazione: 'Pianificazione', completato: 'Completato', bozza: 'Bozza' }[ev.stato]
            const allTasks = loadTasksFromStorage()
            const evTasks = allTasks.filter(t => t.evento === ev.id)
            const spesaEvento = showFinance
              ? budgets.filter(u => u.fornitoreId === supplier.id && u.eventoId === ev.id).reduce((s, u) => s + u.importo, 0)
              : 0
            return (
              <div key={ev.id} className="panel p-5 flex items-start gap-4">
                <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ background: statoColor }} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${statoColor}15`, color: statoColor }}>
                        {statoLabel}
                      </span>
                    </div>
                    {showFinance && spesaEvento > 0 && (
                      <span className="text-sm font-bold" style={{ color: 'var(--red2)' }}>{formatEur(spesaEvento)}</span>
                    )}
                  </div>
                  <p className="font-semibold" style={{ color: 'var(--text)' }}>{ev.nome}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{ev.location}</p>
                  <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(ev.dataInizio).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <span>{ev.partecipanti} partecipanti</span>
                    {evTasks.length > 0 && <span>{evTasks.length} task</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Documenti */}
      {tab === 'documenti' && (
        <div className="space-y-2 animate-fade-in">
          {supplier.documenti.length === 0 ? (
            <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nessun documento</p>
            </div>
          ) : supplier.documenti.map(doc => (
            <div
              key={doc.id}
              className="panel p-4 flex items-center gap-4"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${docTipoColor(doc.tipo)}15` }}
              >
                <FileText className="w-5 h-5" style={{ color: docTipoColor(doc.tipo) }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{doc.nome}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  <span
                    className="capitalize"
                    style={{ color: docTipoColor(doc.tipo) }}
                  >{doc.tipo}</span>
                  {' · '}{formatDate(doc.data)} · {doc.dimensione}
                </p>
              </div>
              <button
                onClick={() => alert(`Download demo: ${doc.nome}`)}
                className="p-2 rounded-lg transition-all hover:bg-white/10 flex-shrink-0"
                title="Scarica documento"
              >
                <Download className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recensioni */}
      {tab === 'recensioni' && (
        <div className="space-y-3 animate-fade-in">
          {supplier.recensioni.length === 0 ? (
            <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nessuna recensione</p>
            </div>
          ) : supplier.recensioni.map(rec => {
            const evRec = events.find(e => e.id === rec.eventoId)
            return (
              <div key={rec.id} className="panel p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg" style={{ background: 'var(--panel2)' }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{rec.autoreId}</p>
                      {evRec && <p className="text-xs" style={{ color: 'var(--muted)' }}>{evRec.nome}</p>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <RatingStars rating={rec.voto} />
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{formatDate(rec.data)}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{rec.testo}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const CATEGORIE = ['Tutte', 'Audio/Video', 'Catering', 'Allestimento', 'Sicurezza', 'Fotografia', 'Tecnologia', 'Trasporti', 'Intrattenimento']
const CONTRATTO_FILTERS: { id: string; label: string }[] = [
  { id: 'tutti', label: 'Tutti' },
  { id: 'attivo', label: 'Attivo' },
  { id: 'in_scadenza', label: 'In Scadenza' },
  { id: 'in_rinnovo', label: 'In Rinnovo' },
  { id: 'sospeso', label: 'Sospeso' },
  { id: 'scaduto', label: 'Scaduto' },
]

export default function Fornitori() {
  const currentUser = loadUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const [supplierList, setSupplierList] = useState<Supplier[]>([])
  const [eventsList, setEventsList] = useState<Event[]>([])
  const [budgetsList, setBudgetsList] = useState<Uscita[]>([])
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('Tutte')
  const [filterContratto, setFilterContratto] = useState('tutti')
  const [filterRating, setFilterRating] = useState('tutti')
  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>(undefined)
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null)

  // Fornitori, Eventi, Budgets: fonte di verita' Supabase. Nessun fallback mock.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchSuppliers(),
      fetchEvents(),
      fetchBudgets(),
    ]).then(([remote, remoteEvents, remoteBudgets]) => {
      if (cancelled) return
      setSupplierList(remote)
      cacheSuppliersToStorage(remote)
      setEventsList(remoteEvents)
      setBudgetsList(remoteBudgets)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const targetId = searchParams.get('id')
    if (!targetId || supplierList.length === 0) return
    const found = supplierList.find(s => s.id === targetId)
    if (found) {
      setSelected(found)
      setSearchParams({}, { replace: true })
    }
  }, [supplierList, searchParams, setSearchParams])

  const refreshSuppliers = useCallback(async () => {
    const remote = await fetchSuppliers()
    setSupplierList(remote)
    cacheSuppliersToStorage(remote)
    return remote
  }, [])

  const handleSave = useCallback(async (s: Supplier) => {
    const saved = await upsertSupplier(s)
    const final = saved ?? s
    const remote = await refreshSuppliers()
    setShowForm(false)
    setEditingSupplier(undefined)
    if (selected && selected.id === final.id) {
      const fresh = remote.find(x => x.id === final.id) ?? final
      setSelected(fresh)
    }
  }, [refreshSuppliers, selected])

  const handleDelete = useCallback(async (s: Supplier) => {
    const ok = await deleteSupplierRemote(s.id)
    if (!ok) return
    await refreshSuppliers()
    setDeletingSupplier(null)
    setSelected(null)
  }, [refreshSuppliers])

  const handleSaveNotes = useCallback(async (s: Supplier, notes: string) => {
    const updated = { ...s, noteOperative: notes }
    const saved = await upsertSupplier(updated)
    const final = saved ?? updated
    await refreshSuppliers()
    if (selected && selected.id === s.id) setSelected(final)
  }, [refreshSuppliers, selected])

  if (!currentUser) return null

  const ruolo = currentUser.ruolo
  const showFinance = ruolo === 'Admin' || ruolo === 'Partner' || ruolo === 'Finance'

  // Determine which supplier IDs this user can see
  const allowedIds = useMemo((): string[] | 'all' => {
    if (ruolo === 'Admin' || ruolo === 'Partner' || ruolo === 'Manager') return 'all'
    if (ruolo === 'Finance') return 'all'
    if (ruolo === 'Fornitore') {
      return supplierList.filter(s => s.referente === currentUser.nome || s.stato === 'attivo').map(s => s.id).slice(0, 1)
    }
    if (ruolo === 'Operativo') {
      const myEventIds = eventsList
        .filter(e => e.team.includes(currentUser.id) || e.responsabile === currentUser.id)
        .map(e => e.id)
      return supplierList.filter(s => s.eventiId.some(eid => myEventIds.includes(eid))).map(s => s.id)
    }
    if (ruolo === 'Commerciale') {
      return supplierList.filter(s => s.stato === 'attivo').map(s => s.id)
    }
    return 'all'
  }, [ruolo, currentUser, supplierList, eventsList])

  const baseList = useMemo(() =>
    allowedIds === 'all' ? supplierList : supplierList.filter(s => allowedIds.includes(s.id)),
    [allowedIds, supplierList])

  const filtered = useMemo(() => {
    return baseList.filter(s => {
      const matchSearch = search === '' ||
        s.nome.toLowerCase().includes(search.toLowerCase()) ||
        s.categoria.toLowerCase().includes(search.toLowerCase()) ||
        s.referente.toLowerCase().includes(search.toLowerCase()) ||
        s.location.toLowerCase().includes(search.toLowerCase())
      const matchCategoria = filterCategoria === 'Tutte' || s.categoria === filterCategoria
      const matchContratto = filterContratto === 'tutti' || s.statoContratto === filterContratto
      const matchRating = filterRating === 'tutti' ||
        (filterRating === '5' && s.rating >= 4.8) ||
        (filterRating === '4' && s.rating >= 4.0 && s.rating < 4.8) ||
        (filterRating === '3' && s.rating < 4.0)
      return matchSearch && matchCategoria && matchContratto && matchRating
    })
  }, [baseList, search, filterCategoria, filterContratto, filterRating])

  // Alerts
  const inScadenza = baseList.filter(s => s.statoContratto === 'in_scadenza' || s.statoContratto === 'in_rinnovo').length
  const scaduti = baseList.filter(s => s.statoContratto === 'scaduto').length

  if (selected) {
    const liveSupplier = supplierList.find(s => s.id === selected.id) ?? selected
    return (
      <>
        {showForm && (
          <SupplierFormModal
            supplier={editingSupplier}
            events={eventsList}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingSupplier(undefined) }}
          />
        )}
        {deletingSupplier && (
          <DeleteConfirm
            name={deletingSupplier.nome}
            onConfirm={() => handleDelete(deletingSupplier)}
            onCancel={() => setDeletingSupplier(null)}
          />
        )}
        <SupplierDetail
          supplier={liveSupplier}
          events={eventsList}
          budgets={budgetsList}
          onBack={() => setSelected(null)}
          showFinance={showFinance}
          onEdit={(s) => { setEditingSupplier(s); setShowForm(true) }}
          onDelete={(s) => setDeletingSupplier(s)}
          onSaveNotes={handleSaveNotes}
        />
      </>
    )
  }

  return (
    <div className="space-y-6">
      {showForm && (
        <SupplierFormModal
          supplier={editingSupplier}
          events={eventsList}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingSupplier(undefined) }}
        />
      )}
      {deletingSupplier && (
        <DeleteConfirm
          name={deletingSupplier.nome}
          onConfirm={() => handleDelete(deletingSupplier)}
          onCancel={() => setDeletingSupplier(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Fornitori</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          {filtered.length} fornitori visibili
          {ruolo === 'Fornitore' && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(77,180,255,0.1)', color: 'var(--blue)' }}>
              Profilo personale
            </span>
          )}
          {ruolo === 'Operativo' && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(77,180,255,0.1)', color: 'var(--blue)' }}>
              Solo eventi assegnati
            </span>
          )}
        </p>
        </div>
        <button onClick={() => { setEditingSupplier(undefined); setShowForm(true) }}
          className="btn-primary flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold">
          <Plus className="w-4 h-4" /> Nuovo fornitore
        </button>
      </div>

      {/* Alerts */}
      {(inScadenza > 0 || scaduti > 0) && (ruolo === 'Admin' || ruolo === 'Partner' || ruolo === 'Manager' || ruolo === 'Finance') && (
        <div className="space-y-2">
          {inScadenza > 0 && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(255,194,75,0.08)', border: '1px solid rgba(255,194,75,0.25)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--yellow)' }} />
              <p className="text-sm" style={{ color: 'var(--yellow)' }}>
                {inScadenza} contratto{inScadenza !== 1 ? 'i' : ''} in scadenza o in fase di rinnovo.
              </p>
            </div>
          )}
          {scaduti > 0 && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(255,49,95,0.08)', border: '1px solid rgba(255,49,95,0.25)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red2)' }} />
              <p className="text-sm" style={{ color: 'var(--red2)' }}>
                {scaduti} contratto{scaduti !== 1 ? 'i' : ''} scaduto{scaduti !== 1 ? 'i' : ''} — azione richiesta.
              </p>
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      {(ruolo === 'Admin' || ruolo === 'Partner' || ruolo === 'Manager' || ruolo === 'Finance') && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Fornitori attivi', value: baseList.filter(s => s.stato === 'attivo').length, color: 'var(--green)' },
            { label: 'Contratti attivi', value: baseList.filter(s => s.statoContratto === 'attivo').length, color: 'var(--blue)' },
            { label: 'In scadenza/rinnovo', value: inScadenza, color: 'var(--yellow)' },
            ...(showFinance ? [{
              label: 'Costo medio tot.',
              value: formatEur(baseList.reduce((s, sup) => s + sup.costoMedioPerEvento, 0) / (baseList.length || 1)),
              color: 'var(--text)',
            }] : [{ label: 'Rating medio', value: (baseList.reduce((s, sup) => s + sup.rating, 0) / (baseList.length || 1)).toFixed(1) + ' ★', color: 'var(--yellow)' }]),
          ].map((kpi, i) => (
            <div key={i} className="panel p-4">
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{kpi.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: kpi.color }}>{String(kpi.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl flex-1 min-w-[200px]"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Cerca fornitore, categoria, referente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--text)' }}
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>

        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          <Filter className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          <select
            value={filterCategoria}
            onChange={e => setFilterCategoria(e.target.value)}
            className="bg-transparent text-sm focus:outline-none"
            style={{ color: filterCategoria === 'Tutte' ? 'var(--muted)' : 'var(--text)' }}
          >
            {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
        </div>

        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          <Shield className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          <select
            value={filterContratto}
            onChange={e => setFilterContratto(e.target.value)}
            className="bg-transparent text-sm focus:outline-none"
            style={{ color: filterContratto === 'tutti' ? 'var(--muted)' : 'var(--text)' }}
          >
            {CONTRATTO_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
        </div>

        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          <Star className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          <select
            value={filterRating}
            onChange={e => setFilterRating(e.target.value)}
            className="bg-transparent text-sm focus:outline-none"
            style={{ color: filterRating === 'tutti' ? 'var(--muted)' : 'var(--text)' }}
          >
            <option value="tutti">Tutti i rating</option>
            <option value="5">Eccellente (4.8+)</option>
            <option value="4">Buono (4.0–4.7)</option>
            <option value="3">Sufficiente (&lt;4.0)</option>
          </select>
          <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="panel p-12 text-center" style={{ color: 'var(--muted)' }}>
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nessun fornitore trovato</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((sup, i) => {
            const ContrattoIcon = contrattoIcon(sup.statoContratto)
            const days = daysToExpiry(sup.scadenzaContratto)
            const expiringSoon = (sup.statoContratto === 'in_scadenza' || sup.statoContratto === 'in_rinnovo') && days < 60
            return (
              <div
                key={sup.id}
                className="panel hover-card p-5 cursor-pointer animate-fade-in"
                style={{
                  animationDelay: `${i * 40}ms`,
                  border: expiringSoon ? '1px solid rgba(255,194,75,0.25)' : undefined,
                }}
                onClick={() => setSelected(sup)}
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0"
                    style={{
                      background: `${sup.stato === 'attivo' ? contrattoColor(sup.statoContratto) : 'var(--muted)'}18`,
                      color: sup.stato === 'attivo' ? contrattoColor(sup.statoContratto) : 'var(--muted)',
                    }}
                  >
                    {sup.nome.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span
                            className="text-xs px-2 py-0.5 rounded font-medium"
                            style={{ background: `${contrattoColor(sup.statoContratto)}15`, color: contrattoColor(sup.statoContratto) }}
                          >
                            <ContrattoIcon className="w-3 h-3 inline mr-1 -mt-0.5" />
                            {contrattoLabel(sup.statoContratto)}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                            {sup.categoria}
                          </span>
                          {sup.stato === 'inattivo' && (
                            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,49,95,0.1)', color: 'var(--red2)' }}>
                              Inattivo
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{sup.nome}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <User className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                          <p className="text-sm" style={{ color: 'var(--muted)' }}>{sup.referente} · {sup.location}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                          <RatingStars rating={sup.rating} />
                          <span className="text-sm font-bold" style={{ color: 'var(--yellow)' }}>{sup.rating.toFixed(1)}</span>
                        </div>
                        {showFinance && (
                          <p className="text-xs" style={{ color: 'var(--muted)' }}>
                            Media: <span style={{ color: 'var(--text)' }}>{formatEur(sup.costoMedioPerEvento)}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3"
                      style={{ borderTop: '1px solid var(--line)' }}
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {sup.servizi.slice(0, 3).map(s => (
                          <span key={s} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                            {s}
                          </span>
                        ))}
                        {sup.servizi.length > 3 && (
                          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                            +{sup.servizi.length - 3}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--muted)' }}>
                        {expiringSoon && (
                          <span className="flex items-center gap-1" style={{ color: 'var(--yellow)' }}>
                            <Clock className="w-3 h-3" />
                            Scade {days > 0 ? `tra ${days}gg` : 'oggi'}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {sup.eventiId.length} eventi
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {sup.documenti.length} doc
                        </span>
                        {showFinance && (
                          <span className="flex items-center gap-1">
                            <Euro className="w-3 h-3" />
                            {formatEur(sup.costoMinimo)}–{formatEur(sup.costoMassimo)}
                          </span>
                        )}
                      </div>
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
