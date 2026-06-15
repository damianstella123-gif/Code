import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  TrendingUp,
  AlertTriangle,
  Euro,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  Download,
  Filter,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  Receipt,
  X,
  Trash2,
  Edit3,
  Upload,
} from 'lucide-react'
import { loadUser, isPartnerUser } from '@/lib/auth'
import type {
  Entrata,
  Uscita,
  Fattura,
  StatoPagamento,
  TipoMovimento,
} from '@/data/amministrazione'
import type { Supplier } from '@/data/suppliers'
import type { Event } from '@/data/events'
import { fetchBudgets, upsertBudget, updateBudget, deleteBudget } from '@/lib/budgets-service'
import { fetchEvents } from '@/lib/events-service'
import { fetchSuppliers } from '@/lib/suppliers-service'
import { fetchClients } from '@/lib/clients-service'
import {
  fetchInvoices, upsertInvoice, deleteInvoice,
  fetchAdminDocuments, upsertAdminDocument, deleteAdminDocument, uploadAdminFile,
  INVOICE_STATUSES, ADMIN_DOC_TYPES,
  type Invoice, type AdminDocument,
} from '@/lib/invoices-service'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SK_ENTRATE = 'simmetria_entrate'
const SK_FATTURE = 'simmetria_fatture'

function loadLocal<T>(key: string): T[] {
  try {
    const r = localStorage.getItem(key)
    return r ? JSON.parse(r) : []
  } catch { return [] }
}
function saveLocal(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify(data))
}

function formatEur(n: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatDateShort(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}
function monthLabel(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
}

function statoPagColor(s: StatoPagamento) {
  switch (s) {
    case 'pagato': return 'var(--green)'
    case 'in_attesa': return 'var(--blue)'
    case 'scaduto': return 'var(--red2)'
    case 'annullato': return 'var(--muted)'
  }
}
function statoPagLabel(s: StatoPagamento) {
  switch (s) {
    case 'pagato': return 'Pagato'
    case 'in_attesa': return 'In Attesa'
    case 'scaduto': return 'Scaduto'
    case 'annullato': return 'Annullato'
  }
}

function statoFatIcon(s: Fattura['stato']) {
  switch (s) {
    case 'pagata': return CheckCircle
    case 'scaduta': return AlertTriangle
    case 'annullata': return XCircle
    default: return FileText
  }
}
function statoFatColor(s: Fattura['stato']) {
  switch (s) {
    case 'pagata': return 'var(--green)'
    case 'emessa': return 'var(--blue)'
    case 'bozza': return 'var(--yellow)'
    case 'scaduta': return 'var(--red2)'
    case 'annullata': return 'var(--muted)'
  }
}
function statoFatLabel(s: Fattura['stato']) {
  switch (s) {
    case 'pagata': return 'Pagata'
    case 'emessa': return 'Emessa'
    case 'bozza': return 'Bozza'
    case 'scaduta': return 'Scaduta'
    case 'annullata': return 'Annullata'
  }
}

let _clients: { id: string; nome: string }[] = []
let _suppliers: Supplier[] = []
let _events: Event[] = []

function clientName(id: string) {
  return _clients.find(c => c.id === id)?.nome ?? id
}
function supplierName(id: string) {
  return _suppliers.find(s => s.id === id)?.nome ?? id
}
function eventName(id: string | null) {
  if (!id) return '—'
  return _events.find(e => e.id === id)?.nome ?? id
}

// ─── Modale nuovo movimento ───────────────────────────────────────────────────

interface NuovoMovimentoModalProps {
  onClose: () => void
  onSave: (tipo: TipoMovimento, importo: number, note: string, eventoId: string | null, soggettoId: string, quantity: number, unitPrice: number | null) => void
  clients: { id: string; nome: string }[]
  suppliers: Supplier[]
  events: Event[]
}

function NuovoMovimentoModal({ onClose, onSave, clients, suppliers, events }: NuovoMovimentoModalProps) {
  const [tipo, setTipo] = useState<TipoMovimento>('entrata')
  const [importo, setImporto] = useState('')
  const [note, setNote] = useState('')
  const [eventoId, setEventoId] = useState<string>('none')
  const [soggettoId, setSoggettoId] = useState<string>('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')

  const computedImporto = useMemo(() => {
    const q = parseInt(quantity) || 1
    const up = parseFloat(unitPrice.replace(',', '.'))
    if (up > 0) return q * up
    return parseFloat(importo.replace(',', '.')) || 0
  }, [quantity, unitPrice, importo])

  function handleSave() {
    const q = parseInt(quantity) || 1
    const up = parseFloat(unitPrice.replace(',', '.'))
    const amt = up > 0 ? q * up : (parseFloat(importo.replace(',', '.')) || 0)
    if (!amt || amt <= 0) return
    const defaultSoggetto = tipo === 'entrata' ? (clients[0]?.id ?? '') : (suppliers[0]?.id ?? '')
    onSave(tipo, amt, note, eventoId === 'none' ? null : eventoId, soggettoId || defaultSoggetto, q, up > 0 ? up : null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--line)' }}>
          <h3 className="font-bold text-lg" style={{ color: 'var(--text)' }}>Aggiungi Movimento</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-all">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Tipo */}
          <div>
            <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Tipo</label>
            <div className="flex gap-2">
              {(['entrata', 'uscita'] as TipoMovimento[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all capitalize"
                  style={{
                    background: tipo === t
                      ? t === 'entrata'
                        ? 'rgba(56,210,125,0.15)'
                        : 'rgba(255,49,95,0.15)'
                      : 'var(--panel2)',
                    color: tipo === t
                      ? t === 'entrata' ? 'var(--green)' : 'var(--red2)'
                      : 'var(--muted)',
                    border: `1px solid ${tipo === t ? (t === 'entrata' ? 'rgba(56,210,125,0.3)' : 'rgba(255,49,95,0.3)') : 'var(--line)'}`,
                  }}
                >
                  {t === 'entrata' ? '+ Entrata' : '− Uscita'}
                </button>
              ))}
            </div>
          </div>

          {/* Importo / Qty+UnitPrice */}
          {tipo === 'uscita' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Quantita</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Prezzo Unitario (€)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={unitPrice}
                    onChange={e => setUnitPrice(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                  />
                </div>
              </div>
              {computedImporto > 0 && (
                <div className="text-sm font-semibold px-1" style={{ color: 'var(--text)' }}>
                  Totale: {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(computedImporto)}
                </div>
              )}
              {!unitPrice && (
                <div>
                  <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Oppure importo totale (€)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={importo}
                    onChange={e => setImporto(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Importo (€)</label>
              <input
                type="number"
                placeholder="0.00"
                value={importo}
                onChange={e => setImporto(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
              />
            </div>
          )}

          {/* Soggetto */}
          <div>
            <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>
              {tipo === 'entrata' ? 'Cliente' : 'Fornitore'}
            </label>
            <select
              value={soggettoId}
              onChange={e => setSoggettoId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            >
              <option value="">Seleziona…</option>
              {tipo === 'entrata'
                ? clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)
                : suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)
              }
            </select>
          </div>

          {/* Evento */}
          <div>
            <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Evento collegato</label>
            <select
              value={eventoId}
              onChange={e => setEventoId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            >
              <option value="none">Nessun evento</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.nome}</option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div>
            <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Note</label>
            <textarea
              rows={3}
              placeholder="Descrizione movimento..."
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'var(--panel2)', color: 'var(--muted)', border: '1px solid var(--line)' }}
            >
              Annulla
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}
            >
              Aggiungi
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function StatoBadge({ stato }: { stato: StatoPagamento }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
      style={{
        background: `${statoPagColor(stato)}15`,
        color: statoPagColor(stato),
      }}
    >
      {stato === 'pagato' && <CheckCircle className="w-3 h-3" />}
      {stato === 'scaduto' && <AlertTriangle className="w-3 h-3" />}
      {statoPagLabel(stato)}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type TabId = 'dashboard' | 'entrate' | 'uscite' | 'fatture' | 'invoices' | 'documenti'

export default function Amministrazione() {
  const currentUser = loadUser()

  // Permission gate
  if (!currentUser || (!isPartnerUser(currentUser) && ['Operativo', 'Commerciale', 'Fornitore'].includes(currentUser.ruolo))) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(208,0,58,0.1)' }}
        >
          <Lock className="w-8 h-8" style={{ color: 'var(--red2)' }} />
        </div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Accesso negato</h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Non hai i permessi per accedere all'area amministrativa.
        </p>
      </div>
    )
  }

  const isManagerOnly = currentUser.ruolo === 'Manager'

  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const paramTab = searchParams.get('tab')
    if (paramTab === 'entrate' || paramTab === 'uscite' || paramTab === 'fatture' || paramTab === 'invoices' || paramTab === 'documenti') return paramTab
    return 'dashboard'
  })
  const [entrate, setEntrate] = useState<Entrata[]>(() => loadLocal(SK_ENTRATE))
  const [uscite, setUscite] = useState<Uscita[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [clients, setClients] = useState<{ id: string; nome: string }[]>([])
  const [fatture, setFatture] = useState<Fattura[]>(() => loadLocal(SK_FATTURE))
  const [showNuovoMovimento, setShowNuovoMovimento] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [adminDocs, setAdminDocs] = useState<AdminDocument[]>([])
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [editingDoc, setEditingDoc] = useState<AdminDocument | null>(null)

  useEffect(() => {
    if (searchParams.has('tab') || searchParams.has('id')) {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchBudgets(), fetchEvents(), fetchSuppliers(), fetchClients(), fetchInvoices(), fetchAdminDocuments()]).then(([bg, ev, sp, cl, inv, docs]) => {
      if (cancelled) return
      setUscite(bg)
      setEvents(ev)
      setSuppliers(sp)
      setClients(cl.map(c => ({ id: c.id, nome: c.nome })))
      setInvoices(inv)
      setAdminDocs(docs)
      _clients = cl.map(c => ({ id: c.id, nome: c.nome }))
      _suppliers = sp
      _events = ev
    })
    return () => { cancelled = true }
  }, [])

  async function refreshUscite() {
    const remote = await fetchBudgets()
    setUscite(remote)
    return remote
  }

  // Filters
  const [filterEvento, setFilterEvento] = useState('tutti')
  const [filterMese, setFilterMese] = useState('tutti')
  const [filterStato, setFilterStato] = useState('tutti')
  const [filterTipo, setFilterTipo] = useState<'tutti' | TipoMovimento>('tutti')

  // ─── Allowed events for Manager ─────────────────────────────────────────────
  const allowedEventIds = useMemo(() => {
    if (!isManagerOnly) return events.map(e => e.id)
    return events
      .filter(e => e.responsabile === currentUser.id || e.team.includes(currentUser.id))
      .map(e => e.id)
  }, [isManagerOnly, currentUser.id])

  const visibleEntrate = useMemo(() =>
    isManagerOnly
      ? entrate.filter(e => e.eventoId === null || allowedEventIds.includes(e.eventoId))
      : entrate,
    [entrate, isManagerOnly, allowedEventIds])

  const visibleUscite = useMemo(() =>
    isManagerOnly
      ? uscite.filter(u => u.eventoId === null || allowedEventIds.includes(u.eventoId))
      : uscite,
    [uscite, isManagerOnly, allowedEventIds])

  const visibleFatture = useMemo(() =>
    isManagerOnly
      ? fatture.filter(f => f.eventoId === null || allowedEventIds.includes(f.eventoId))
      : fatture,
    [fatture, isManagerOnly, allowedEventIds])

  // ─── KPIs ────────────────────────────────────────────────────────────────────
  const totEntrate = visibleEntrate.reduce((s, e) => s + e.importo, 0)
  const totUscite = visibleUscite.reduce((s, u) => s + u.importo, 0)
  const totInAttesa = visibleEntrate.filter(e => e.stato === 'in_attesa').reduce((s, e) => s + e.importo, 0)
  const totScaduto = visibleEntrate.filter(e => e.stato === 'scaduto').reduce((s, e) => s + e.importo, 0)
  const margine = totEntrate - totUscite
  const marginePerc = totEntrate > 0 ? Math.round((margine / totEntrate) * 100) : 0

  const budgetEvents = events
    .filter(e => !isManagerOnly || allowedEventIds.includes(e.id))
    .reduce((s, e) => s + e.budget, 0)

  const alertBudget = visibleUscite.some(u => {
    if (!u.eventoId) return false
    const ev = events.find(e => e.id === u.eventoId)
    if (!ev) return false
    const speso = visibleUscite
      .filter(x => x.eventoId === u.eventoId)
      .reduce((s, x) => s + x.importo, 0)
    return speso > ev.budget * 0.9
  })

  const fattureInScadenza = visibleFatture.filter(f => {
    const days = Math.ceil((new Date(f.scadenza).getTime() - Date.now()) / 86400000)
    return f.stato === 'emessa' && days >= 0 && days <= 7
  }).length

  // ─── Filtered tables ─────────────────────────────────────────────────────────

  function applyFilters<T extends { eventoId: string | null; stato: string }>(
    items: T[],
    dateKey: keyof T
  ) {
    return items.filter(item => {
      const matchEvento = filterEvento === 'tutti' || item.eventoId === filterEvento
      const matchMese = filterMese === 'tutti' || (item[dateKey] as string)?.startsWith(filterMese)
      const matchStato = filterStato === 'tutti' || item.stato === filterStato
      return matchEvento && matchMese && matchStato
    })
  }

  const filteredEntrate = applyFilters(visibleEntrate, 'dataPrevista')
  const filteredUscite = applyFilters(visibleUscite, 'scadenza')
  const filteredFatture = visibleFatture.filter(f => {
    const matchEvento = filterEvento === 'tutti' || f.eventoId === filterEvento
    const matchMese = filterMese === 'tutti' || f.dataEmissione.startsWith(filterMese)
    const matchStato = filterStato === 'tutti' || f.stato === filterStato
    const matchTipo = filterTipo === 'tutti' || f.tipo === filterTipo
    return matchEvento && matchMese && matchStato && matchTipo
  })

  // ─── Actions ─────────────────────────────────────────────────────────────────

  function segnaEntrataPagata(id: string) {
    setEntrate(prev => {
      const updated = prev.map(e =>
        e.id === id ? { ...e, stato: 'pagato' as StatoPagamento, dataPagamento: new Date().toISOString().slice(0, 10) } : e
      )
      saveLocal(SK_ENTRATE, updated)
      return updated
    })
  }

  function segnaUscitaPagata(id: string) {
    const today = new Date().toISOString().slice(0, 10)
    setUscite(prev => prev.map(u =>
      u.id === id ? { ...u, stato: 'pagato' as StatoPagamento, dataPagamento: today } : u
    ))
    updateBudget(id, { stato: 'pagato', dataPagamento: today }).then(() => refreshUscite())
  }

  function eliminaEntrata(id: string) {
    setEntrate(prev => {
      const updated = prev.filter(e => e.id !== id)
      saveLocal(SK_ENTRATE, updated)
      return updated
    })
  }

  function eliminaUscita(id: string) {
    setUscite(prev => prev.filter(u => u.id !== id))
    deleteBudget(id).then(() => refreshUscite())
  }

  function editEntrata(id: string, importo: number, note: string) {
    setEntrate(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, importo, note } : e)
      saveLocal(SK_ENTRATE, updated)
      return updated
    })
  }

  function editUscita(id: string, importo: number, note: string) {
    setUscite(prev => prev.map(u => u.id === id ? { ...u, importo, note } : u))
    updateBudget(id, { importo, note }).then(() => refreshUscite())
  }

  function generaFattura(tipo: TipoMovimento, soggettoId: string, soggetto: string, importo: number, eventoId: string | null) {
    const num = `${tipo === 'entrata' ? 'FT' : 'FP'}-2026-${String(fatture.length + 1).padStart(3, '0')}`
    const newFat: Fattura = {
      id: `fat_new_${Date.now()}`,
      numero: num,
      tipo,
      soggetto,
      soggettoId,
      eventoId,
      importo: Math.round(importo * 1.22),
      imponibile: importo,
      iva: Math.round(importo * 0.22),
      stato: 'bozza',
      dataEmissione: new Date().toISOString().slice(0, 10),
      scadenza: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      note: 'Fattura generata automaticamente',
    }
    setFatture(prev => {
      const updated = [...prev, newFat]
      saveLocal(SK_FATTURE, updated)
      return updated
    })
    alert(`Fattura ${num} creata in bozza.`)
  }

  async function esportaXLSX() {
    const XLSX = await import('xlsx')
    const usciteRows = visibleUscite.map(u => ({
      'Fornitore': supplierName(u.fornitoreId),
      'Evento': eventName(u.eventoId),
      'Categoria': u.categoria,
      'Quantita': u.quantity,
      'Prezzo Unitario': u.unitPrice ?? '',
      'Importo': u.importo,
      'Stato': statoPagLabel(u.stato),
      'Scadenza': u.scadenza,
      'Data Pagamento': u.dataPagamento ?? '',
      'Note': u.note,
    }))
    const entrateRows = visibleEntrate.map(e => ({
      'Cliente': clientName(e.clienteId),
      'Evento': eventName(e.eventoId),
      'Importo': e.importo,
      'Stato': statoPagLabel(e.stato),
      'Data Prevista': e.dataPrevista,
      'Data Pagamento': e.dataPagamento ?? '',
      'Metodo': e.metodoPagamento,
      'Note': e.note,
    }))
    const wb = XLSX.utils.book_new()
    const wsU = XLSX.utils.json_to_sheet(usciteRows)
    const wsE = XLSX.utils.json_to_sheet(entrateRows)
    XLSX.utils.book_append_sheet(wb, wsU, 'Uscite')
    XLSX.utils.book_append_sheet(wb, wsE, 'Entrate')
    XLSX.writeFile(wb, `simmetria_budget_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  async function esportaPDF() {
    const jsPDFModule = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDFModule.default()
    doc.setFontSize(16)
    doc.text('SIMMETRIA HUB - Riepilogo Budget', 14, 20)
    doc.setFontSize(10)
    doc.text(`Data: ${new Date().toLocaleDateString('it-IT')}`, 14, 28)
    doc.text(`Budget eventi: ${formatEur(budgetEvents)}  |  Entrate: ${formatEur(totEntrate)}  |  Uscite: ${formatEur(totUscite)}  |  Margine: ${formatEur(margine)} (${marginePerc}%)`, 14, 34)

    autoTable(doc, {
      startY: 42,
      head: [['Fornitore', 'Evento', 'Categoria', 'Qta', 'P.Unit.', 'Importo', 'Stato', 'Scadenza']],
      body: visibleUscite.map(u => [
        supplierName(u.fornitoreId),
        eventName(u.eventoId),
        u.categoria,
        String(u.quantity),
        u.unitPrice != null ? formatEur(u.unitPrice) : '-',
        formatEur(u.importo),
        statoPagLabel(u.stato),
        u.scadenza,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 30, 60] },
    })

    doc.save(`simmetria_budget_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  function handleNuovoMovimento(tipo: TipoMovimento, importo: number, note: string, eventoId: string | null, soggettoId: string, quantity: number, unitPrice: number | null) {
    const today = new Date().toISOString().slice(0, 10)
    if (tipo === 'entrata') {
      const newE: Entrata = {
        id: `ent_new_${Date.now()}`,
        clienteId: soggettoId,
        eventoId,
        importo,
        stato: 'in_attesa',
        dataPrevista: today,
        dataPagamento: null,
        metodoPagamento: 'bonifico',
        note,
        fatturaId: null,
      }
      setEntrate(prev => { const u = [...prev, newE]; saveLocal(SK_ENTRATE, u); return u })
    } else {
      const newU: Uscita = {
        id: `usc_new_${Date.now()}`,
        fornitoreId: soggettoId,
        eventoId,
        categoria: 'Altro',
        importo,
        quantity,
        unitPrice,
        stato: 'in_attesa',
        scadenza: today,
        dataPagamento: null,
        note,
        fatturaId: null,
      }
      setUscite(prev => [...prev, newU])
      upsertBudget(newU).then(() => refreshUscite())
    }
    setShowNuovoMovimento(false)
  }

  // ─── Months for filter ────────────────────────────────────────────────────────
  const allMonths = useMemo(() => {
    const set = new Set<string>()
    ;[...visibleEntrate.map(e => e.dataPrevista), ...visibleUscite.map(u => u.scadenza), ...visibleFatture.map(f => f.dataEmissione)]
      .forEach(d => set.add(d.slice(0, 7)))
    return Array.from(set).sort()
  }, [visibleEntrate, visibleUscite, visibleFatture])

  const tabs: { id: TabId; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'entrate', label: `Entrate (${filteredEntrate.length})` },
    { id: 'uscite', label: `Uscite (${filteredUscite.length})` },
    { id: 'fatture', label: `Fatture (${filteredFatture.length})` },
    { id: 'invoices', label: `Fatture DB (${invoices.length})` },
    { id: 'documenti', label: `Documenti (${adminDocs.length})` },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Amministrazione</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            Gestione economica e finanziaria
            {isManagerOnly && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(77,180,255,0.1)', color: 'var(--blue)' }}>
                Solo eventi assegnati
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNuovoMovimento(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
          >
            <Plus className="w-4 h-4" /> Movimento
          </button>
          <button
            onClick={esportaXLSX}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}
          >
            <Download className="w-4 h-4" /> XLSX
          </button>
          <button
            onClick={esportaPDF}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Alerts */}
      {(alertBudget || fattureInScadenza > 0 || totScaduto > 0) && (
        <div className="space-y-2">
          {alertBudget && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(255,49,95,0.08)', border: '1px solid rgba(255,49,95,0.25)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red2)' }} />
              <p className="text-sm" style={{ color: 'var(--red2)' }}>
                Attenzione: uno o piu eventi hanno superato il 90% del budget previsto.
              </p>
            </div>
          )}
          {fattureInScadenza > 0 && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(255,194,75,0.08)', border: '1px solid rgba(255,194,75,0.25)' }}>
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--yellow)' }} />
              <p className="text-sm" style={{ color: 'var(--yellow)' }}>
                {fattureInScadenza} fattura{fattureInScadenza !== 1 ? 'e' : ''} in scadenza nei prossimi 7 giorni.
              </p>
            </div>
          )}
          {totScaduto > 0 && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: 'rgba(255,49,95,0.08)', border: '1px solid rgba(255,49,95,0.25)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red2)' }} />
              <p className="text-sm" style={{ color: 'var(--red2)' }}>
                {formatEur(totScaduto)} di pagamenti scaduti da incassare.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: activeTab === tab.id
                ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                : 'transparent',
              color: activeTab === tab.id ? 'white' : 'var(--muted)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters row (not on dashboard) */}
      {activeTab !== 'dashboard' && (
        <div className="flex flex-wrap gap-3">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
          >
            <Filter className="w-4 h-4" style={{ color: 'var(--muted)' }} />
            <select
              value={filterEvento}
              onChange={e => setFilterEvento(e.target.value)}
              className="bg-transparent text-sm focus:outline-none pr-1"
              style={{ color: filterEvento === 'tutti' ? 'var(--muted)' : 'var(--text)' }}
            >
              <option value="tutti">Tutti gli eventi</option>
              {events.filter(ev => !isManagerOnly || allowedEventIds.includes(ev.id)).map(ev => (
                <option key={ev.id} value={ev.id}>{ev.nome}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
          </div>

          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
          >
            <select
              value={filterMese}
              onChange={e => setFilterMese(e.target.value)}
              className="bg-transparent text-sm focus:outline-none"
              style={{ color: filterMese === 'tutti' ? 'var(--muted)' : 'var(--text)' }}
            >
              <option value="tutti">Tutti i mesi</option>
              {allMonths.map(m => (
                <option key={m} value={m}>{monthLabel(m + '-01')}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
          </div>

          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
          >
            <select
              value={filterStato}
              onChange={e => setFilterStato(e.target.value)}
              className="bg-transparent text-sm focus:outline-none"
              style={{ color: filterStato === 'tutti' ? 'var(--muted)' : 'var(--text)' }}
            >
              <option value="tutti">Tutti gli stati</option>
              <option value="pagato">Pagato</option>
              <option value="in_attesa">In attesa</option>
              <option value="scaduto">Scaduto</option>
              <option value="annullato">Annullato</option>
              {activeTab === 'fatture' && (
                <>
                  <option value="emessa">Emessa</option>
                  <option value="bozza">Bozza</option>
                  <option value="pagata">Pagata</option>
                  <option value="scaduta">Scaduta</option>
                </>
              )}
            </select>
            <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
          </div>

          {activeTab === 'fatture' && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
            >
              <select
                value={filterTipo}
                onChange={e => setFilterTipo(e.target.value as typeof filterTipo)}
                className="bg-transparent text-sm focus:outline-none"
                style={{ color: filterTipo === 'tutti' ? 'var(--muted)' : 'var(--text)' }}
              >
                <option value="tutti">Entrate + Uscite</option>
                <option value="entrata">Solo entrate</option>
                <option value="uscita">Solo uscite</option>
              </select>
              <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: DASHBOARD ────────────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6 animate-fade-in">
          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              {
                label: 'Budget Totale Eventi',
                value: formatEur(budgetEvents),
                sub: `${events.filter(e => !isManagerOnly || allowedEventIds.includes(e.id)).length} eventi`,
                color: 'var(--text)',
                icon: Euro,
                bg: 'rgba(255,255,255,0.04)',
              },
              {
                label: 'Ricavi Previsti',
                value: formatEur(totEntrate),
                sub: `${visibleEntrate.length} voci`,
                color: 'var(--green)',
                icon: ArrowUpRight,
                bg: 'rgba(56,210,125,0.06)',
              },
              {
                label: 'Costi Fornitori',
                value: formatEur(totUscite),
                sub: `${visibleUscite.length} voci`,
                color: 'var(--red2)',
                icon: ArrowDownRight,
                bg: 'rgba(255,49,95,0.06)',
              },
              {
                label: 'Margine Stimato',
                value: formatEur(margine),
                sub: `${marginePerc}% sui ricavi`,
                color: margine >= 0 ? 'var(--green)' : 'var(--red2)',
                icon: TrendingUp,
                bg: margine >= 0 ? 'rgba(56,210,125,0.06)' : 'rgba(255,49,95,0.06)',
              },
              {
                label: 'Pagamenti in Sospeso',
                value: formatEur(totInAttesa),
                sub: `${visibleEntrate.filter(e => e.stato === 'in_attesa').length} movimenti`,
                color: 'var(--yellow)',
                icon: Clock,
                bg: 'rgba(255,194,75,0.06)',
              },
              {
                label: 'Fatture da Emettere',
                value: String(visibleFatture.filter(f => f.stato === 'bozza').length),
                sub: `Scadute: ${visibleFatture.filter(f => f.stato === 'scaduta').length}`,
                color: 'var(--blue)',
                icon: Receipt,
                bg: 'rgba(77,180,255,0.06)',
              },
            ].map((kpi, i) => {
              const Icon = kpi.icon
              return (
                <div
                  key={i}
                  className="panel p-5 flex flex-col gap-3"
                  style={{ background: kpi.bg, border: `1px solid ${kpi.color}20` }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{kpi.label}</p>
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: `${kpi.color}15` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: kpi.color }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{kpi.sub}</p>
                </div>
              )
            })}
          </div>

          {/* Budget per evento */}
          <div className="panel p-5">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Budget vs Speso per Evento</h3>
            <div className="space-y-4">
              {events
                .filter(ev => !isManagerOnly || allowedEventIds.includes(ev.id))
                .map(ev => {
                  const speso = uscite.filter(u => u.eventoId === ev.id).reduce((s, u) => s + u.importo, 0)
                  const perc = Math.min(100, Math.round((speso / ev.budget) * 100))
                  const overBudget = speso > ev.budget * 0.9
                  const barColor = perc >= 100 ? 'var(--red2)' : perc >= 80 ? 'var(--yellow)' : 'var(--green)'
                  return (
                    <div key={ev.id}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span style={{ color: 'var(--text)' }}>{ev.nome}</span>
                        <span style={{ color: overBudget ? 'var(--red2)' : 'var(--muted)' }}>
                          {formatEur(speso)} / {formatEur(ev.budget)} {overBudget && '⚠'}
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${perc}%`, background: barColor }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Ultimi movimenti */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="panel p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--green)' }} /> Entrate recenti
              </h3>
              <div className="space-y-2.5">
                {visibleEntrate.slice(0, 5).map(e => (
                  <div key={e.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{clientName(e.clienteId)}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{eventName(e.eventoId)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--green)' }}>{formatEur(e.importo)}</p>
                      <StatoBadge stato={e.stato} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <ArrowDownRight className="w-4 h-4" style={{ color: 'var(--red2)' }} /> Uscite recenti
              </h3>
              <div className="space-y-2.5">
                {visibleUscite.slice(0, 5).map(u => (
                  <div key={u.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{supplierName(u.fornitoreId)}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{u.categoria} · {eventName(u.eventoId)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--red2)' }}>{formatEur(u.importo)}</p>
                      <StatoBadge stato={u.stato} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: ENTRATE ──────────────────────────────────────────────────────── */}
      {activeTab === 'entrate' && (
        <div className="panel overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--green)' }} />
              <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Entrate</span>
            </div>
            <span className="text-sm font-bold" style={{ color: 'var(--green)' }}>
              {formatEur(filteredEntrate.reduce((s, e) => s + e.importo, 0))}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--panel2)', borderBottom: '1px solid var(--line)' }}>
                  {['Cliente', 'Evento', 'Importo', 'Stato', 'Data prevista', 'Metodo', 'Note', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEntrate.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
                      Nessun movimento trovato
                    </td>
                  </tr>
                ) : filteredEntrate.map((e, i) => (
                  <tr
                    key={e.id}
                    style={{
                      borderBottom: '1px solid var(--line)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}
                  >
                    <td className="px-4 py-3" style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>{clientName(e.clienteId)}</td>
                    <td className="px-4 py-3 max-w-[160px]">
                      <span className="truncate block text-xs" style={{ color: 'var(--muted)' }}>{eventName(e.eventoId)}</span>
                    </td>
                    <td className="px-4 py-3 font-bold" style={{ color: 'var(--green)', whiteSpace: 'nowrap' }}>{formatEur(e.importo)}</td>
                    <td className="px-4 py-3"><StatoBadge stato={e.stato} /></td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatDateShort(e.dataPrevista)}</td>
                    <td className="px-4 py-3 text-xs capitalize" style={{ color: 'var(--muted)' }}>{e.metodoPagamento}</td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <span className="text-xs truncate block" style={{ color: 'var(--muted)' }}>{e.note}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {e.stato !== 'pagato' && e.stato !== 'annullato' && (
                          <button
                            onClick={() => segnaEntrataPagata(e.id)}
                            className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80 whitespace-nowrap"
                            style={{ background: 'rgba(56,210,125,0.12)', color: 'var(--green)', border: '1px solid rgba(56,210,125,0.25)' }}
                          >
                            Segna pagato
                          </button>
                        )}
                        {!e.fatturaId && (
                          <button
                            onClick={() => generaFattura('entrata', e.clienteId, clientName(e.clienteId), e.importo, e.eventoId)}
                            className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80 whitespace-nowrap"
                            style={{ background: 'rgba(77,180,255,0.1)', color: 'var(--blue)', border: '1px solid rgba(77,180,255,0.25)' }}
                          >
                            Fattura
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const newAmt = prompt('Nuovo importo:', String(e.importo))
                            if (newAmt) editEntrata(e.id, parseFloat(newAmt) || e.importo, e.note)
                          }}
                          className="p-1.5 rounded-lg transition-all hover:bg-white/10"
                          title="Modifica importo"
                        >
                          <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                        </button>
                        <button
                          onClick={() => { if (confirm('Eliminare questa entrata?')) eliminaEntrata(e.id) }}
                          className="p-1.5 rounded-lg transition-all hover:bg-white/10"
                          title="Elimina"
                        >
                          <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB: USCITE ───────────────────────────────────────────────────────── */}
      {activeTab === 'uscite' && (
        <div className="panel overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4" style={{ color: 'var(--red2)' }} />
              <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Uscite</span>
            </div>
            <span className="text-sm font-bold" style={{ color: 'var(--red2)' }}>
              {formatEur(filteredUscite.reduce((s, u) => s + u.importo, 0))}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--panel2)', borderBottom: '1px solid var(--line)' }}>
                  {['Fornitore', 'Evento', 'Categoria', 'Qty', 'P.Unit.', 'Totale', 'Stato', 'Scadenza', 'Note', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUscite.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
                      Nessun movimento trovato
                    </td>
                  </tr>
                ) : filteredUscite.map((u, i) => {
                  const isScad = new Date(u.scadenza) < new Date() && u.stato !== 'pagato'
                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: '1px solid var(--line)',
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      }}
                    >
                      <td className="px-4 py-3" style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>{supplierName(u.fornitoreId)}</td>
                      <td className="px-4 py-3 max-w-[160px]">
                        <span className="truncate block text-xs" style={{ color: 'var(--muted)' }}>{eventName(u.eventoId)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>{u.categoria}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text)' }}>{u.quantity ?? 1}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{u.unitPrice != null ? formatEur(u.unitPrice) : '—'}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: 'var(--red2)', whiteSpace: 'nowrap' }}>{formatEur(u.importo)}</td>
                      <td className="px-4 py-3"><StatoBadge stato={u.stato} /></td>
                      <td className="px-4 py-3 text-xs" style={{ color: isScad ? 'var(--red2)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {formatDateShort(u.scadenza)} {isScad && '!'}
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <span className="text-xs truncate block" style={{ color: 'var(--muted)' }}>{u.note}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {u.stato !== 'pagato' && u.stato !== 'annullato' && (
                            <button
                              onClick={() => segnaUscitaPagata(u.id)}
                              className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80 whitespace-nowrap"
                              style={{ background: 'rgba(56,210,125,0.12)', color: 'var(--green)', border: '1px solid rgba(56,210,125,0.25)' }}
                            >
                              Segna pagato
                            </button>
                          )}
                          {!u.fatturaId && (
                            <button
                              onClick={() => generaFattura('uscita', u.fornitoreId, supplierName(u.fornitoreId), u.importo, u.eventoId)}
                              className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80 whitespace-nowrap"
                              style={{ background: 'rgba(77,180,255,0.1)', color: 'var(--blue)', border: '1px solid rgba(77,180,255,0.25)' }}
                            >
                              Fattura
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const newAmt = prompt('Nuovo importo:', String(u.importo))
                              if (newAmt) editUscita(u.id, parseFloat(newAmt) || u.importo, u.note)
                            }}
                            className="p-1.5 rounded-lg transition-all hover:bg-white/10"
                            title="Modifica importo"
                          >
                            <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                          </button>
                          <button
                            onClick={() => { if (confirm('Eliminare questa uscita?')) eliminaUscita(u.id) }}
                            className="p-1.5 rounded-lg transition-all hover:bg-white/10"
                            title="Elimina"
                          >
                            <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB: FATTURE ──────────────────────────────────────────────────────── */}
      {activeTab === 'fatture' && (
        <div className="panel overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4" style={{ color: 'var(--blue)' }} />
              <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Registro Fatture</span>
            </div>
            <span className="text-sm" style={{ color: 'var(--muted)' }}>
              {filteredFatture.length} fatture · {formatEur(filteredFatture.reduce((s, f) => s + f.importo, 0))} totale
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--panel2)', borderBottom: '1px solid var(--line)' }}>
                  {['N. Fattura', 'Tipo', 'Soggetto', 'Evento', 'Imponibile', 'IVA', 'Totale', 'Stato', 'Emessa', 'Scadenza'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredFatture.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
                      Nessuna fattura trovata
                    </td>
                  </tr>
                ) : filteredFatture.map((f, i) => {
                  const Icon = statoFatIcon(f.stato)
                  const isScad = f.stato === 'scaduta' || (new Date(f.scadenza) < new Date() && f.stato === 'emessa')
                  return (
                    <tr
                      key={f.id}
                      style={{
                        borderBottom: '1px solid var(--line)',
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>{f.numero}</td>
                      <td className="px-4 py-3">
                        <span
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded w-fit"
                          style={{
                            background: f.tipo === 'entrata' ? 'rgba(56,210,125,0.12)' : 'rgba(255,49,95,0.12)',
                            color: f.tipo === 'entrata' ? 'var(--green)' : 'var(--red2)',
                          }}
                        >
                          {f.tipo === 'entrata'
                            ? <ArrowUpRight className="w-3 h-3" />
                            : <ArrowDownRight className="w-3 h-3" />}
                          {f.tipo === 'entrata' ? 'Entrata' : 'Uscita'}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
                        <span className="truncate block text-xs" style={{ color: 'var(--text)' }}>{f.soggetto}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[140px]">
                        <span className="truncate block text-xs" style={{ color: 'var(--muted)' }}>{eventName(f.eventoId)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatEur(f.imponibile)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatEur(f.iva)}</td>
                      <td className="px-4 py-3 font-bold text-xs" style={{
                        color: f.tipo === 'entrata' ? 'var(--green)' : 'var(--red2)',
                        whiteSpace: 'nowrap',
                      }}>{formatEur(f.importo)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                          style={{ background: `${statoFatColor(f.stato)}15`, color: statoFatColor(f.stato) }}
                        >
                          <Icon className="w-3 h-3" />
                          {statoFatLabel(f.stato)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatDate(f.dataEmissione)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: isScad ? 'var(--red2)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(f.scadenza)} {isScad && '⚠'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal nuovo movimento */}
      {showNuovoMovimento && (
        <NuovoMovimentoModal
          onClose={() => setShowNuovoMovimento(false)}
          onSave={handleNuovoMovimento}
          clients={clients}
          suppliers={suppliers}
          events={events}
        />
      )}

      {/* ─── TAB: INVOICES (Supabase) ─────────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Fatture gestite su Supabase. Per collegamento futuro con Fatture in Cloud.
            </p>
            <button onClick={() => { setEditingInvoice(null); setShowInvoiceForm(true) }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
              <Plus className="w-3.5 h-3.5" /> Nuova Fattura
            </button>
          </div>
          {invoices.length === 0 ? (
            <div className="text-center py-10 panel rounded-2xl">
              <Receipt className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--muted)' }} />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessuna fattura registrata</p>
            </div>
          ) : (
            <div className="panel rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ color: 'var(--text)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--muted)' }}>Numero</th>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--muted)' }}>Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--muted)' }}>Soggetto</th>
                      <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: 'var(--muted)' }}>Importo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--muted)' }}>Stato</th>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--muted)' }}>Scadenza</th>
                      <th className="px-4 py-3 text-right text-xs font-medium" style={{ color: 'var(--muted)' }}>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => {
                      const subject = inv.type === 'emessa'
                        ? (clients.find(c => c.id === inv.client_id)?.nome ?? '-')
                        : (suppliers.find(s => s.id === inv.supplier_id)?.nome ?? '-')
                      const st = INVOICE_STATUSES.find(s => s.id === inv.status)
                      return (
                        <tr key={inv.id} style={{ borderBottom: '1px solid var(--line)' }} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-medium">{inv.number || '-'}</td>
                          <td className="px-4 py-3 text-xs capitalize">{inv.type}</td>
                          <td className="px-4 py-3 text-xs">{subject}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatEur(inv.amount)}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${st?.color ?? '#9ba3aa'}20`, color: st?.color ?? '#9ba3aa' }}>
                              {st?.label ?? inv.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {inv.external_url && (
                                <a href={inv.external_url} target="_blank" rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg hover:bg-white/10" title="Apri in Fatture in Cloud">
                                  <FileText className="w-3.5 h-3.5" style={{ color: 'var(--blue)' }} />
                                </a>
                              )}
                              <button onClick={() => { setEditingInvoice(inv); setShowInvoiceForm(true) }}
                                className="p-1.5 rounded-lg hover:bg-white/10">
                                <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                              </button>
                              <button onClick={async () => { await deleteInvoice(inv.id); setInvoices(prev => prev.filter(i => i.id !== inv.id)) }}
                                className="p-1.5 rounded-lg hover:bg-white/10">
                                <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: DOCUMENTI ────────────────────────────────────────────────────── */}
      {activeTab === 'documenti' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Documenti amministrativi: contratti, ricevute, note di credito, F24.
            </p>
            <button onClick={() => { setEditingDoc(null); setShowDocForm(true) }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
              <Plus className="w-3.5 h-3.5" /> Nuovo Documento
            </button>
          </div>
          {adminDocs.length === 0 ? (
            <div className="text-center py-10 panel rounded-2xl">
              <FileText className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--muted)' }} />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun documento amministrativo</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {adminDocs.map(doc => {
                const typeLabel = ADMIN_DOC_TYPES.find(t => t.id === doc.type)?.label ?? doc.type
                return (
                  <div key={doc.id} className="panel p-4 rounded-xl space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-medium" style={{ color: 'var(--text)' }}>{doc.title}</h4>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>{typeLabel}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingDoc(doc); setShowDocForm(true) }} className="p-1 rounded hover:bg-white/10">
                          <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                        </button>
                        <button onClick={async () => { await deleteAdminDocument(doc.id); setAdminDocs(prev => prev.filter(d => d.id !== doc.id)) }}
                          className="p-1 rounded hover:bg-white/10">
                          <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                        </button>
                      </div>
                    </div>
                    {doc.notes && <p className="text-xs" style={{ color: 'var(--muted)' }}>{doc.notes}</p>}
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-medium flex items-center gap-1" style={{ color: 'var(--blue)' }}>
                        <Download className="w-3 h-3" /> Scarica file
                      </a>
                    )}
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{formatDate(doc.created_at)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Invoice Form Modal */}
      {showInvoiceForm && (
        <InvoiceFormModal
          invoice={editingInvoice}
          events={events}
          clients={clients}
          suppliers={suppliers}
          onClose={() => setShowInvoiceForm(false)}
          onSave={async (data) => {
            const result = await upsertInvoice(data)
            if (result) {
              if (editingInvoice) {
                setInvoices(prev => prev.map(i => i.id === result.id ? result : i))
              } else {
                setInvoices(prev => [result, ...prev])
              }
            }
            setShowInvoiceForm(false)
          }}
        />
      )}

      {/* Document Form Modal */}
      {showDocForm && (
        <DocFormModal
          doc={editingDoc}
          events={events}
          clients={clients}
          suppliers={suppliers}
          onClose={() => setShowDocForm(false)}
          onSave={async (data) => {
            const result = await upsertAdminDocument(data)
            if (result) {
              if (editingDoc) {
                setAdminDocs(prev => prev.map(d => d.id === result.id ? result : d))
              } else {
                setAdminDocs(prev => [result, ...prev])
              }
            }
            setShowDocForm(false)
          }}
        />
      )}
    </div>
  )
}

function InvoiceFormModal({ invoice, events, clients, suppliers, onClose, onSave }: {
  invoice: Invoice | null
  events: Event[]
  clients: { id: string; nome: string }[]
  suppliers: Supplier[]
  onClose: () => void
  onSave: (data: Partial<Invoice> & { type: string }) => void
}) {
  const [type, setType] = useState<'emessa' | 'ricevuta'>(invoice?.type ?? 'emessa')
  const [number, setNumber] = useState(invoice?.number ?? '')
  const [amount, setAmount] = useState(invoice?.amount?.toString() ?? '')
  const [vatAmount, setVatAmount] = useState(invoice?.vat_amount?.toString() ?? '0')
  const [status, setStatus] = useState(invoice?.status ?? 'bozza')
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? '')
  const [eventId, setEventId] = useState(invoice?.event_id ?? '')
  const [clientId, setClientId] = useState(invoice?.client_id ?? '')
  const [supplierId, setSupplierId] = useState(invoice?.supplier_id ?? '')
  const [externalUrl, setExternalUrl] = useState(invoice?.external_url ?? '')
  const [ficId, setFicId] = useState(invoice?.fatture_in_cloud_id ?? '')
  const [notes, setNotes] = useState(invoice?.notes ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{invoice ? 'Modifica Fattura' : 'Nuova Fattura'}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Tipo</label>
              <select value={type} onChange={e => setType(e.target.value as 'emessa' | 'ricevuta')}
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="emessa">Emessa (attiva)</option>
                <option value="ricevuta">Ricevuta (passiva)</option>
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Numero</label>
              <input value={number} onChange={e => setNumber(e.target.value)} placeholder="FT-2026-001"
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Importo</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>IVA</label>
              <input type="number" value={vatAmount} onChange={e => setVatAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Stato</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                {INVOICE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Evento</label>
              <select value={eventId} onChange={e => setEventId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">Nessuno</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>{type === 'emessa' ? 'Cliente' : 'Fornitore'}</label>
              {type === 'emessa' ? (
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                  <option value="">Seleziona</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              ) : (
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                  <option value="">Seleziona</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Scadenza</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>ID Fatture in Cloud</label>
              <input value={ficId} onChange={e => setFicId(e.target.value)} placeholder="Opzionale"
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Link esterno (Fatture in Cloud)</label>
            <input value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://..."
              className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note" rows={2}
            className="w-full px-3 py-2 rounded-xl text-sm resize-none" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
        </div>
        <button onClick={() => onSave({
          ...(invoice?.id ? { id: invoice.id } : {}),
          type, number, amount: Number(amount) || 0, vat_amount: Number(vatAmount) || 0,
          status, due_date: dueDate || null,
          event_id: eventId || null, client_id: clientId || null, supplier_id: supplierId || null,
          fatture_in_cloud_id: ficId || null, external_url: externalUrl || null, notes,
        })} disabled={!number && !amount}
          className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          {invoice ? 'Salva Modifiche' : 'Crea Fattura'}
        </button>
      </div>
    </div>
  )
}

function DocFormModal({ doc, events, clients, suppliers, onClose, onSave }: {
  doc: AdminDocument | null
  events: Event[]
  clients: { id: string; nome: string }[]
  suppliers: Supplier[]
  onClose: () => void
  onSave: (data: Partial<AdminDocument> & { title: string }) => void
}) {
  const [title, setTitle] = useState(doc?.title ?? '')
  const [type, setType] = useState(doc?.type ?? 'altro')
  const [eventId, setEventId] = useState(doc?.event_id ?? '')
  const [clientId, setClientId] = useState(doc?.client_id ?? '')
  const [supplierId, setSupplierId] = useState(doc?.supplier_id ?? '')
  const [notes, setNotes] = useState(doc?.notes ?? '')
  const [fileUrl, setFileUrl] = useState(doc?.file_url ?? '')
  const [uploading, setUploading] = useState(false)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const id = doc?.id ?? crypto.randomUUID()
    const url = await uploadAdminFile(file, id)
    if (url) setFileUrl(url)
    setUploading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{doc ? 'Modifica Documento' : 'Nuovo Documento'}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo documento"
            className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Tipo</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                {ADMIN_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Evento</label>
              <select value={eventId} onChange={e => setEventId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">Nessuno</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Cliente</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">Nessuno</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Fornitore</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">Nessuno</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note" rows={2}
            className="w-full px-3 py-2 rounded-xl text-sm resize-none" style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <Upload className="w-4 h-4" />
              {uploading ? 'Caricamento...' : 'Carica file'}
              <input type="file" className="hidden" onChange={handleFileUpload} />
            </label>
            {fileUrl && <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: 'var(--blue)' }}>File caricato</a>}
          </div>
        </div>
        <button onClick={() => onSave({
          ...(doc?.id ? { id: doc.id } : {}),
          title, type,
          event_id: eventId || null, client_id: clientId || null, supplier_id: supplierId || null,
          file_url: fileUrl || null, notes,
        })} disabled={!title.trim()}
          className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          {doc ? 'Salva Modifiche' : 'Crea Documento'}
        </button>
      </div>
    </div>
  )
}
