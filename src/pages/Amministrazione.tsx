import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
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
import { loadUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { todayISO, addDaysISO, fmtLong, fmtDateShort, fmtDate } from '@/lib/format'
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
import { fetchAllEventsEconomics, type EventEconomicsSummary } from '@/lib/use-event-services'
import { useRealtimeTable } from '@/lib/use-realtime'
import {
  fetchEntrate as fetchEntrateDB,
  fetchFatture as fetchFattureDB,
  upsertEntrata,
  upsertFattura,
  deleteEntrata as deleteEntrataDB,
  bulkImportEntrate,
  bulkImportFatture,
} from '@/lib/admin-service'
import { fetchEventPayments, type EventPayment } from '@/lib/event-payments-service'
import { useToast } from '@/lib/toast'
import { approveLeaveRequest, rejectLeaveRequest } from '@/lib/leave-requests-service'
import { LeaveRequestsPanel } from '@/components/LeaveRequestsPanel'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SK_ENTRATE = 'simmetria_entrate'
const SK_FATTURE = 'simmetria_fatture'
const SK_MIGRATED = 'simmetria_admin_migrated'

function loadLocal<T>(key: string): T[] {
  try {
    const r = localStorage.getItem(key)
    return r ? JSON.parse(r) : []
  } catch { return [] }
}

function formatEur(n: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function formatDate(d: string) {
  return fmtLong(d)
}
function formatDateShort(d: string) {
  return fmtDateShort(d)
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
  const [soggettoSearch, setSoggettoSearch] = useState('')
  const [soggettoOpen, setSoggettoOpen] = useState(false)
  const [soggettoLabel, setSoggettoLabel] = useState('')
  const soggettoRef = useRef<HTMLDivElement>(null)

  const computedImporto = useMemo(() => {
    const q = parseInt(quantity) || 1
    const up = parseFloat(unitPrice.replace(',', '.'))
    if (up > 0) return q * up
    return parseFloat(importo.replace(',', '.')) || 0
  }, [quantity, unitPrice, importo])

  const soggettoList = tipo === 'entrata' ? clients : suppliers
  const filteredSoggetti = soggettoSearch.length > 0
    ? soggettoList.filter(s => s.nome.toLowerCase().includes(soggettoSearch.toLowerCase()))
    : soggettoList.slice(0, 8)

  useEffect(() => {
    setSoggettoId('')
    setSoggettoSearch('')
    setSoggettoLabel('')
    setSoggettoOpen(false)
  }, [tipo])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (soggettoRef.current && !soggettoRef.current.contains(e.target as Node)) {
        setSoggettoOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSave() {
    const q = parseInt(quantity) || 1
    const up = parseFloat(unitPrice.replace(',', '.'))
    const amt = up > 0 ? q * up : (parseFloat(importo.replace(',', '.')) || 0)
    if (!amt || amt <= 0) return
    const defaultSoggetto = tipo === 'entrata' ? (clients[0]?.id ?? '') : (suppliers[0]?.id ?? '')
    onSave(tipo, amt, note, eventoId === 'none' ? null : eventoId, soggettoId || defaultSoggetto, q, up > 0 ? up : null)
  }

  const inputStyle = { background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--line)' }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text)' }}>Aggiungi Movimento</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-all">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Tipo</label>
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
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                  }}
                >
                  {t === 'entrata' ? '+ Entrata' : '− Uscita'}
                </button>
              ))}
            </div>
          </div>

          {tipo === 'uscita' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Quantita</label>
                  <input type="number" min="1" placeholder="1" value={quantity} onChange={e => setQuantity(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Prezzo Unitario</label>
                  <input type="number" placeholder="0.00" value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none" style={inputStyle} />
                </div>
              </div>
              {computedImporto > 0 && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)', paddingLeft: 4 }}>
                  Totale: {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(computedImporto)}
                </div>
              )}
              {!unitPrice && (
                <div>
                  <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Oppure importo totale</label>
                  <input type="number" placeholder="0.00" value={importo} onChange={e => setImporto(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none" style={inputStyle} />
                </div>
              )}
            </div>
          ) : (
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Importo</label>
              <input type="number" placeholder="0.00" value={importo} onChange={e => setImporto(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none" style={inputStyle} />
            </div>
          )}

          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
              {tipo === 'entrata' ? 'Cliente' : 'Fornitore'}
            </label>
            <div ref={soggettoRef} style={{ position: 'relative' }}>
              <input
                type="text"
                value={soggettoLabel}
                placeholder={tipo === 'entrata' ? 'Cerca cliente...' : 'Cerca fornitore...'}
                onChange={e => {
                  setSoggettoLabel(e.target.value)
                  setSoggettoSearch(e.target.value)
                  setSoggettoId('')
                  setSoggettoOpen(true)
                }}
                onFocus={() => setSoggettoOpen(true)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={inputStyle}
              />
              {soggettoOpen && filteredSoggetti.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    maxHeight: 200,
                    overflowY: 'auto',
                    background: 'var(--panel-solid)',
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    boxShadow: 'var(--shadow-md)',
                    marginTop: 4,
                  }}
                >
                  {filteredSoggetti.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors"
                      style={{ color: 'var(--text)', borderBottom: '1px solid var(--line)' }}
                      onClick={() => {
                        setSoggettoId(item.id)
                        setSoggettoLabel(item.nome)
                        setSoggettoSearch('')
                        setSoggettoOpen(false)
                      }}
                    >
                      <span>{item.nome}</span>
                      {'categoria' in item && (item as Supplier).categoria && (
                        <span className="ml-2 text-xs" style={{ color: 'var(--muted)' }}>{(item as Supplier).categoria}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Evento collegato</label>
            <select value={eventoId} onChange={e => setEventoId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none" style={inputStyle}>
              <option value="none">Nessun evento</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Note</label>
            <textarea rows={3} placeholder="Descrizione movimento..." value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none" style={inputStyle} />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl transition-all"
              style={{ background: 'var(--panel2)', color: 'var(--muted)', border: '1px solid var(--line)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, letterSpacing: '0.04em' }}>
              Annulla
            </button>
            <button onClick={handleSave}
              className="flex-1 py-3 rounded-xl transition-all"
              style={{ background: 'var(--text)', color: 'var(--bg)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
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
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: statoPagColor(stato),
        background: `${statoPagColor(stato)}15`,
        padding: '2px 6px',
        borderRadius: 4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}
    >
      {stato === 'pagato' && <CheckCircle className="w-3 h-3" />}
      {stato === 'scaduto' && <AlertTriangle className="w-3 h-3" />}
      {statoPagLabel(stato)}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type TabId = 'dashboard' | 'entrate' | 'uscite' | 'fatture' | 'invoices' | 'documenti' | 'ferie'

export default function Amministrazione() {
  const currentUser = loadUser()

  // Permission gate - only Admin, Super Admin, Amministrazione can access fiscal area
  const FISCAL_ROLES = ['Admin', 'Super Admin', 'Amministrazione']
  if (!currentUser || !FISCAL_ROLES.includes(currentUser.ruolo || currentUser.role || '')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
          <Lock className="w-8 h-8" style={{ color: 'var(--red2)' }} />
        </div>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>Accesso negato</h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          Non hai i permessi per accedere all'area amministrativa.
        </p>
      </div>
    )
  }

  const isManagerOnly = currentUser.ruolo === 'Manager'
  const { showToast } = useToast()

  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const paramTab = searchParams.get('tab')
    if (paramTab === 'entrate' || paramTab === 'uscite' || paramTab === 'fatture' || paramTab === 'invoices' || paramTab === 'documenti' || paramTab === 'ferie') return paramTab
    return 'dashboard'
  })
  const [entrate, setEntrate] = useState<Entrata[]>([])
  const [uscite, setUscite] = useState<Uscita[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [clients, setClients] = useState<{ id: string; nome: string }[]>([])
  const [fatture, setFatture] = useState<Fattura[]>([])
  const [showNuovoMovimento, setShowNuovoMovimento] = useState(false)
  const [expandedDoppioConteggio, setExpandedDoppioConteggio] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [adminDocs, setAdminDocs] = useState<AdminDocument[]>([])
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [editingDoc, setEditingDoc] = useState<AdminDocument | null>(null)
  const [eventEconomics, setEventEconomics] = useState<EventEconomicsSummary[]>([])
  const [eventPaymentsForFilter, setEventPaymentsForFilter] = useState<EventPayment[]>([])
  const [eventIncassiForFilter, setEventIncassiForFilter] = useState<EventPayment[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const [blockingId, setBlockingId] = useState<string | null>(null)
  const [blockNote, setBlockNote] = useState('')
  const [migrationMsg, setMigrationMsg] = useState<string | null>(null)
  const migrationRan = useRef(false)

  useEffect(() => {
    if (searchParams.has('tab') || searchParams.has('id')) {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const loadEntrateFromDB = useCallback(async () => {
    try {
      const data = await fetchEntrateDB()
      setEntrate(data)
    } catch { /* RLS may block if unauthenticated */ }
  }, [])

  const loadFattureFromDB = useCallback(async () => {
    try {
      const data = await fetchFattureDB()
      setFatture(data)
    } catch { /* RLS may block if unauthenticated */ }
  }, [])

  useRealtimeTable('admin_entrate', loadEntrateFromDB)
  useRealtimeTable('admin_fatture', loadFattureFromDB)

  const loadPendingApprovals = useCallback(async () => {
    const { data } = await supabase
      .from('event_payments')
      .select('*, profiles!event_payments_created_by_fkey(first_name, last_name)')
      .eq('stato_approvazione', 'in_attesa')
      .order('created_at', { ascending: false })
    setPendingApprovals(data ?? [])
  }, [])

  useEffect(() => { loadPendingApprovals() }, [loadPendingApprovals])

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchBudgets(), fetchEvents(), fetchSuppliers(), fetchClients(), fetchInvoices(), fetchAdminDocuments(), fetchEntrateDB(), fetchFattureDB()]).then(([bg, ev, sp, cl, inv, docs, ent, fat]) => {
      if (cancelled) return
      setUscite(bg)
      setEvents(ev)
      setSuppliers(sp)
      setClients(cl.map(c => ({ id: c.id, nome: c.nome })))
      setInvoices(inv)
      setAdminDocs(docs)
      setEntrate(ent)
      setFatture(fat)
      _clients = cl.map(c => ({ id: c.id, nome: c.nome }))
      _suppliers = sp
      _events = ev

      const feePctMap: Record<string, number> = {}
      for (const e of ev) feePctMap[e.id] = e.fee_agenzia_pct ?? 6
      fetchAllEventsEconomics(feePctMap).then(econ => {
        if (!cancelled) setEventEconomics(econ)
      })

      // One-time localStorage migration
      if (!migrationRan.current && localStorage.getItem(SK_MIGRATED) !== '1') {
        migrationRan.current = true
        const localEntrate = loadLocal<Entrata>(SK_ENTRATE)
        const localFatture = loadLocal<Fattura>(SK_FATTURE)
        if (localEntrate.length > 0 || localFatture.length > 0) {
          Promise.all([
            bulkImportEntrate(localEntrate),
            bulkImportFatture(localFatture),
          ]).then(async ([nEnt, nFat]) => {
            localStorage.setItem(SK_MIGRATED, '1')
            if (nEnt > 0 || nFat > 0) {
              setMigrationMsg(`Migrazione completata: ${nEnt} entrate e ${nFat} fatture importate da localStorage.`)
              const refreshed = await Promise.all([fetchEntrateDB(), fetchFattureDB()])
              if (!cancelled) {
                setEntrate(refreshed[0])
                setFatture(refreshed[1])
              }
              setTimeout(() => setMigrationMsg(null), 6000)
            }
          }).catch(() => {
            // Migration failed - will retry next load
          })
        } else {
          localStorage.setItem(SK_MIGRATED, '1')
        }
      }
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

  // Load event payments when filtering by specific event
  useEffect(() => {
    if (filterEvento !== 'tutti') {
      fetchEventPayments(filterEvento).then(data => {
        setEventPaymentsForFilter(data.filter(p => p.tipo === 'pagamento_fornitore'))
        setEventIncassiForFilter(data.filter(p => p.tipo === 'incasso_cliente'))
      })
    } else {
      supabase
        .from('event_payments')
        .select('*')
        .eq('tipo', 'pagamento_fornitore')
        .not('data_pagamento', 'is', null)
        .then((res) => {
          setEventPaymentsForFilter((res.data ?? []) as EventPayment[])
        })
      supabase
        .from('event_payments')
        .select('*')
        .eq('tipo', 'incasso_cliente')
        .not('data_pagamento', 'is', null)
        .then((res) => {
          setEventIncassiForFilter((res.data ?? []) as EventPayment[])
        })
    }
  }, [filterEvento])

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
  const totEntrateManuali = visibleEntrate.reduce((s, e) => s + e.importo, 0)
  const totUsciteManuali = visibleUscite.reduce((s, u) => s + u.importo, 0)
  const totInAttesa = visibleEntrate.filter(e => e.stato === 'in_attesa').reduce((s, e) => s + e.importo, 0)
  const totScaduto = visibleEntrate.filter(e => e.stato === 'scaduto').reduce((s, e) => s + e.importo, 0)

  // Event economics (filtered by allowed events for Manager + temporal/event filters)
  const visibleEventEcon = useMemo(() =>
    eventEconomics.filter(ec => {
      if (isManagerOnly && !allowedEventIds.includes(ec.eventId)) return false
      if (filterEvento !== 'tutti' && ec.eventId !== filterEvento) return false
      if (filterMese !== 'tutti') {
        const ev = events.find(e => e.id === ec.eventId)
        if (ev && !ev.dataInizio.startsWith(filterMese)) return false
      }
      return true
    }),
    [eventEconomics, isManagerOnly, allowedEventIds, filterEvento, filterMese, events])

  const totRicaviEventi = visibleEventEcon.reduce((s, ec) => s + ec.ricavi, 0)
  const totCostiEventi = visibleEventEcon.reduce((s, ec) => s + ec.costo, 0)
  const marginePrevisto = totRicaviEventi - totCostiEventi
  const marginePercPrevisto = totRicaviEventi > 0 ? Math.round((marginePrevisto / totRicaviEventi) * 100) : 0

  // Quadro complessivo (both worlds side by side, never fused)
  const margineReale = totEntrateManuali - totUsciteManuali
  const marginePercReale = totEntrateManuali > 0 ? Math.round((margineReale / totEntrateManuali) * 100) : 0

  // Legacy aggregate for PDF/export (still useful)
  const totEntrate = totEntrateManuali + totRicaviEventi
  const totUscite = totUsciteManuali + totCostiEventi
  const margine = totEntrate - totUscite
  const marginePerc = totEntrate > 0 ? Math.round((margine / totEntrate) * 100) : 0

  // ─── DSO / DPO ─────────────────────────────────────────────────────────────
  const { dso, dpo } = useMemo(() => {
    function avgDays(payments: EventPayment[]) {
      const valid = payments.filter(p => p.data_pagamento && p.created_at)
      if (valid.length === 0) return 0
      const totalDays = valid.reduce((sum, p) => {
        const created = new Date(p.created_at).getTime()
        const paid = new Date(p.data_pagamento!).getTime()
        return sum + Math.max(0, (paid - created) / 86400000)
      }, 0)
      return Math.round(totalDays / valid.length)
    }
    return {
      dso: avgDays(eventIncassiForFilter),
      dpo: avgDays(eventPaymentsForFilter),
    }
  }, [eventIncassiForFilter, eventPaymentsForFilter])

  // ─── Double-counting detection ───────────────────────────────────────────────
  const doppioConteggioAlerts = useMemo(() => {
    const alerts: { eventId: string; eventName: string; manuali: number; servizi: number; tipo: 'uscite' | 'entrate' }[] = []
    for (const ec of visibleEventEcon) {
      const usciteManualiEvento = visibleUscite.filter(u => u.eventoId === ec.eventId).reduce((s, u) => s + u.importo, 0)
      if (usciteManualiEvento > 0 && ec.costo > 0) {
        const ev = events.find(e => e.id === ec.eventId)
        alerts.push({ eventId: ec.eventId, eventName: ev?.nome ?? ec.eventId, manuali: usciteManualiEvento, servizi: ec.costo, tipo: 'uscite' })
      }
      const entrateManualiEvento = visibleEntrate.filter(e => e.eventoId === ec.eventId).reduce((s, e) => s + e.importo, 0)
      if (entrateManualiEvento > 0 && ec.venduto > 0) {
        const ev = events.find(e => e.id === ec.eventId)
        alerts.push({ eventId: ec.eventId, eventName: ev?.nome ?? ec.eventId, manuali: entrateManualiEvento, servizi: ec.venduto, tipo: 'entrate' })
      }
    }
    return alerts
  }, [visibleEventEcon, visibleUscite, visibleEntrate, events])

  const filteredEvents = useMemo(() =>
    events.filter(e => {
      if (isManagerOnly && !allowedEventIds.includes(e.id)) return false
      if (filterEvento !== 'tutti' && e.id !== filterEvento) return false
      if (filterMese !== 'tutti' && !e.dataInizio.startsWith(filterMese)) return false
      return true
    }),
    [events, isManagerOnly, allowedEventIds, filterEvento, filterMese])

  const budgetEvents = filteredEvents.reduce((s, e) => s + e.budget, 0)

  const alertBudget = filteredEvents.some(ev => {
    if (ev.budget <= 0) return false
    const costoManuale = visibleUscite.filter(x => x.eventoId === ev.id).reduce((s, x) => s + x.importo, 0)
    const costoServizi = eventEconomics.find(ec => ec.eventId === ev.id)?.costo ?? 0
    return (costoManuale + costoServizi) > ev.budget * 0.9
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

  // Merge event_payments (supplier) into uscite when filtering by event
  const mergedUscite = useMemo(() => {
    if (eventPaymentsForFilter.length === 0) return filteredUscite
    const epAsUscite: Uscita[] = eventPaymentsForFilter.map(p => ({
      id: `ep_${p.id}`,
      fornitoreId: p.supplier_id ?? '',
      eventoId: p.event_id,
      categoria: 'Cash Flow',
      importo: p.importo,
      quantity: 1,
      unitPrice: p.importo,
      scadenza: p.data_scadenza,
      dataPagamento: p.data_pagamento,
      stato: (p.data_pagamento ? 'pagato' : p.data_scadenza < todayISO() ? 'scaduto' : 'in_attesa') as StatoPagamento,
      note: p.descrizione + (p.note ? ` - ${p.note}` : ''),
      fatturaId: null,
    }))
    const existingIds = new Set(filteredUscite.map(u => u.fornitoreId + u.importo + u.scadenza))
    const unique = epAsUscite.filter(ep => !existingIds.has(ep.fornitoreId + ep.importo + ep.scadenza))
    return [...filteredUscite, ...unique]
  }, [filteredUscite, eventPaymentsForFilter])

  const mergedEntrate = useMemo(() => {
    if (eventIncassiForFilter.length === 0) return filteredEntrate
    const epAsEntrate: Entrata[] = eventIncassiForFilter.map(p => ({
      id: `ep_${p.id}`,
      clienteId: '',
      eventoId: p.event_id,
      importo: p.importo,
      stato: (p.data_pagamento ? 'pagato' : p.data_scadenza < todayISO() ? 'scaduto' : 'in_attesa') as StatoPagamento,
      dataPrevista: p.data_scadenza,
      dataPagamento: p.data_pagamento,
      metodoPagamento: 'bonifico' as const,
      note: p.descrizione + (p.note ? ` - ${p.note}` : ''),
      fatturaId: null,
    }))
    const existingIds = new Set(filteredEntrate.map(e => e.clienteId + e.importo + e.dataPrevista))
    const unique = epAsEntrate.filter(ep => !existingIds.has(ep.clienteId + ep.importo + ep.dataPrevista))
    return [...filteredEntrate, ...unique]
  }, [filteredEntrate, eventIncassiForFilter])

  const filteredFatture = visibleFatture.filter(f => {
    const matchEvento = filterEvento === 'tutti' || f.eventoId === filterEvento
    const matchMese = filterMese === 'tutti' || f.dataEmissione.startsWith(filterMese)
    const matchStato = filterStato === 'tutti' || f.stato === filterStato
    const matchTipo = filterTipo === 'tutti' || f.tipo === filterTipo
    return matchEvento && matchMese && matchStato && matchTipo
  })

  // ─── Actions ─────────────────────────────────────────────────────────────────

  function segnaEntrataPagata(id: string) {
    const updated = entrate.find(e => e.id === id)
    if (!updated) return
    const patched = { ...updated, stato: 'pagato' as StatoPagamento, dataPagamento: todayISO() }
    setEntrate(prev => prev.map(e => e.id === id ? patched : e))
    upsertEntrata(patched)
  }

  function segnaUscitaPagata(id: string) {
    const today = todayISO()
    setUscite(prev => prev.map(u =>
      u.id === id ? { ...u, stato: 'pagato' as StatoPagamento, dataPagamento: today } : u
    ))
    updateBudget(id, { stato: 'pagato', dataPagamento: today }).then(() => refreshUscite())
  }

  function eliminaEntrata(id: string) {
    setEntrate(prev => prev.filter(e => e.id !== id))
    deleteEntrataDB(id)
  }

  function eliminaUscita(id: string) {
    setUscite(prev => prev.filter(u => u.id !== id))
    deleteBudget(id).then(() => refreshUscite())
  }

  function editEntrata(id: string, importo: number, note: string) {
    const existing = entrate.find(e => e.id === id)
    if (!existing) return
    const patched = { ...existing, importo, note }
    setEntrate(prev => prev.map(e => e.id === id ? patched : e))
    upsertEntrata(patched)
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
      dataEmissione: todayISO(),
      scadenza: addDaysISO(todayISO(), 30),
      note: 'Fattura generata automaticamente',
    }
    setFatture(prev => [...prev, newFat])
    upsertFattura(newFat)
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
      'Scadenza': u.scadenza ? fmtDate(u.scadenza) : '',
      'Data Pagamento': u.dataPagamento ? fmtDate(u.dataPagamento) : '',
      'Note': u.note,
    }))
    const entrateRows = visibleEntrate.map(e => ({
      'Cliente': clientName(e.clienteId),
      'Evento': eventName(e.eventoId),
      'Importo': e.importo,
      'Stato': statoPagLabel(e.stato),
      'Data Prevista': e.dataPrevista ? fmtDate(e.dataPrevista) : '',
      'Data Pagamento': e.dataPagamento ? fmtDate(e.dataPagamento) : '',
      'Metodo': e.metodoPagamento,
      'Note': e.note,
    }))
    const wb = XLSX.utils.book_new()
    const wsU = XLSX.utils.json_to_sheet(usciteRows)
    const wsE = XLSX.utils.json_to_sheet(entrateRows)
    XLSX.utils.book_append_sheet(wb, wsU, 'Uscite')
    XLSX.utils.book_append_sheet(wb, wsE, 'Entrate')
    XLSX.writeFile(wb, `simmetria_budget_${todayISO()}.xlsx`)
  }

  async function esportaPDF() {
    const jsPDFModule = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDFModule.default()
    doc.setFontSize(16)
    doc.text('SIMMETRIA HUB - Riepilogo Budget', 14, 20)
    doc.setFontSize(10)
    doc.text(`Data: ${fmtDate(new Date().toISOString())}`, 14, 28)
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
        u.scadenza ? fmtDate(u.scadenza) : '',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 30, 60] },
    })

    doc.save(`simmetria_budget_${todayISO()}.pdf`)
  }

  function handleNuovoMovimento(tipo: TipoMovimento, importo: number, note: string, eventoId: string | null, soggettoId: string, quantity: number, unitPrice: number | null) {
    const today = todayISO()
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
      setEntrate(prev => [...prev, newE])
      upsertEntrata(newE)
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

  async function approvePayment(p: any) {
    await supabase.from('event_payments').update({ stato_approvazione: 'approvato', approvato_da: currentUser!.id, approvato_at: new Date().toISOString() }).eq('id', p.id)
    if (p.created_by) {
      const supplierNome = suppliers.find(s => s.id === p.supplier_id)?.nome ?? 'Fornitore'
      await supabase.from('notifications').insert({ user_id: p.created_by, title: 'Pagamento approvato \u2713', message: `Il pagamento di \u20AC${Number(p.importo).toLocaleString('it-IT')} a ${supplierNome} e stato approvato.`, type: 'payment_approved', related_entity_type: 'event_payment', related_entity_id: p.id, is_read: false })
    }
    setPendingApprovals(prev => prev.filter(x => x.id !== p.id))
    showToast('Pagamento approvato')
  }

  async function blockPayment(p: any) {
    if (blockNote.length < 5) return
    await supabase.from('event_payments').update({ stato_approvazione: 'bloccato', approvato_da: currentUser!.id, approvato_at: new Date().toISOString() }).eq('id', p.id)
    if (p.created_by) {
      await supabase.from('notifications').insert({ user_id: p.created_by, title: 'Pagamento bloccato', message: `Il pagamento di \u20AC${Number(p.importo).toLocaleString('it-IT')} e stato bloccato. Motivazione: ${blockNote}`, type: 'payment_blocked', related_entity_type: 'event_payment', related_entity_id: p.id, is_read: false })
    }
    setPendingApprovals(prev => prev.filter(x => x.id !== p.id))
    setBlockingId(null)
    setBlockNote('')
    showToast('Pagamento bloccato')
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'entrate', label: `Entrate (${mergedEntrate.length})` },
    { id: 'uscite', label: `Uscite (${mergedUscite.length})` },
    { id: 'fatture', label: `Fatture (${filteredFatture.length})` },
    { id: 'invoices', label: `Fatture DB (${invoices.length})` },
    { id: 'documenti', label: `Documenti (${adminDocs.length})` },
    { id: 'ferie', label: 'Ferie & Permessi' },
  ]

  // ─── Shared styles ──────────────────────────────────────────────────────────
  const thStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.6, whiteSpace: 'nowrap', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--text)' }
  const thStyleRight: React.CSSProperties = { ...thStyle, textAlign: 'right' }
  const tdStyle: React.CSSProperties = { padding: '10px 14px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }
  const tdMuted: React.CSSProperties = { ...tdStyle, color: 'var(--muted)' }
  const tdAmount: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontWeight: 600 }

  return (
    <div className="space-y-0">
      {/* Migration toast */}
      {migrationMsg && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in" style={{ background: 'var(--green)', color: '#000', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, padding: '10px 16px', borderRadius: 8, maxWidth: 360 }}>
          {migrationMsg}
        </div>
      )}
      {/* Wire Card Header */}
      <div className="wire-card-flat" style={{ padding: '16px', marginBottom: '20px', borderRadius: 12, border: '1px solid var(--line)' }}>
        {/* Wire Masthead */}
        <div className="wire-masthead" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="wire-masthead-title">AMMINISTRAZIONE</span>
            {isManagerOnly && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--blue)', opacity: 0.8 }}>SOLO EVENTI ASSEGNATI</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => setShowNuovoMovimento(true)}
              className="transition-colors"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus className="w-3.5 h-3.5" /> Movimento
            </button>
            <button onClick={esportaXLSX}
              className="transition-colors"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Download className="w-3.5 h-3.5" /> XLSX
            </button>
            <button onClick={esportaPDF}
              className="transition-colors"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        </div>

        {/* Alerts */}
        {(alertBudget || fattureInScadenza > 0 || totScaduto > 0) && (
          <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alertBudget && (
              <div className="flex items-center gap-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red2)' }}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                Uno o piu eventi hanno superato il 90% del budget previsto.
              </div>
            )}
            {fattureInScadenza > 0 && (
              <div className="flex items-center gap-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--yellow)' }}>
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                {fattureInScadenza} fattura{fattureInScadenza !== 1 ? 'e' : ''} in scadenza nei prossimi 7 giorni.
              </div>
            )}
            {totScaduto > 0 && (
              <div className="flex items-center gap-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red2)' }}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {formatEur(totScaduto)} di pagamenti scaduti da incassare.
              </div>
            )}
          </div>
        )}

        {/* Wire Tabs */}
        <div className="wire-tabs" style={{ marginTop: 12 }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`wire-tab ${activeTab === tab.id ? 'wire-tab--active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-3" style={{ marginTop: 10 }}>
          <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <Filter className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            <select value={filterEvento} onChange={e => setFilterEvento(e.target.value)}
              className="bg-transparent focus:outline-none pr-1"
              style={{ color: filterEvento === 'tutti' ? 'var(--muted)' : 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <option value="tutti">Tutti gli eventi</option>
              {events.filter(ev => !isManagerOnly || allowedEventIds.includes(ev.id)).map(ev => (
                <option key={ev.id} value={ev.id}>{ev.nome}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
          </div>

          <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <select value={filterMese} onChange={e => setFilterMese(e.target.value)}
              className="bg-transparent focus:outline-none"
              style={{ color: filterMese === 'tutti' ? 'var(--muted)' : 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <option value="tutti">Tutti i mesi</option>
              {allMonths.map(m => <option key={m} value={m}>{monthLabel(m + '-01')}</option>)}
            </select>
            <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
          </div>

          <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <select value={filterStato} onChange={e => setFilterStato(e.target.value)}
              className="bg-transparent focus:outline-none"
              style={{ color: filterStato === 'tutti' ? 'var(--muted)' : 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
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
            <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <select value={filterTipo} onChange={e => setFilterTipo(e.target.value as typeof filterTipo)}
                className="bg-transparent focus:outline-none"
                style={{ color: filterTipo === 'tutti' ? 'var(--muted)' : 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <option value="tutti">Entrate + Uscite</option>
                <option value="entrata">Solo entrate</option>
                <option value="uscita">Solo uscite</option>
              </select>
              <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
            </div>
          )}
        </div>
      </div>

      {/* ─── TAB: DASHBOARD ────────────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6 animate-fade-in" style={{ paddingTop: 20 }}>

          {/* Pending payment approvals */}
          {pendingApprovals.length > 0 && (
            <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--yellow)', borderRadius: 14, padding: 16 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
                <Clock className="w-4 h-4" style={{ color: 'var(--yellow)' }} />
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--yellow)' }}>
                  Pagamenti in attesa di approvazione ({pendingApprovals.length})
                </p>
              </div>
              <div className="space-y-2">
                {pendingApprovals.map(p => {
                  const evName = events.find(e => e.id === p.event_id)?.nome ?? p.event_id
                  const supName = suppliers.find(s => s.id === p.supplier_id)?.nome ?? '—'
                  const prof = p.profiles as any
                  const pmName = prof ? `${prof.first_name ?? ''} ${prof.last_name ?? ''}`.trim() : '—'
                  return (
                    <div key={p.id} className="wire-card-accent-yellow" style={{ background: 'var(--panel2)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                            {evName} &middot; {supName} &middot; <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>{formatEur(Number(p.importo))}</span>
                          </p>
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                            Richiesto da {pmName} &middot; {fmtDateShort(p.created_at)}
                            {p.descrizione ? ` \u2014 ${p.descrizione}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {blockingId === p.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={blockNote}
                                onChange={e => setBlockNote(e.target.value)}
                                placeholder="Motivazione (min 5 car.)"
                                style={{ background: 'var(--bg3)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: 'var(--text)', width: 180 }}
                              />
                              <button onClick={() => blockPayment(p)} disabled={blockNote.length < 5}
                                className="px-2 py-1 rounded text-[10px] font-bold"
                                style={{ background: 'var(--red2)', color: '#fff', opacity: blockNote.length < 5 ? 0.4 : 1 }}>
                                BLOCCA
                              </button>
                              <button onClick={() => { setBlockingId(null); setBlockNote('') }} className="p-1 rounded hover:opacity-70">
                                <X className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => approvePayment(p)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all hover:opacity-80"
                                style={{ background: 'var(--green)', color: '#000' }}>
                                <CheckCircle className="w-3 h-3" /> APPROVA
                              </button>
                              <button onClick={() => setBlockingId(p.id)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all hover:opacity-80"
                                style={{ background: 'var(--red2)', color: '#fff' }}>
                                <XCircle className="w-3 h-3" /> BLOCCA
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Leave requests pending */}
          <LeaveRequestsPanel />

          {/* Double-counting alerts */}
          {doppioConteggioAlerts.length > 0 && (
            <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--yellow)', borderRadius: 14, padding: 16 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <AlertTriangle className="w-4 h-4" style={{ color: 'var(--yellow)' }} />
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--yellow)' }}>
                  Possibile doppio conteggio rilevato
                </p>
              </div>
              <div className="space-y-2">
                {doppioConteggioAlerts.map(alert => {
                  const key = `${alert.eventId}-${alert.tipo}`
                  const isExpanded = expandedDoppioConteggio === key
                  return (
                    <div key={key}>
                      <button
                        onClick={() => setExpandedDoppioConteggio(isExpanded ? null : key)}
                        className="w-full text-left"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', padding: '6px 0' }}
                      >
                        <span style={{ color: 'var(--yellow)' }}>{alert.tipo === 'uscite' ? 'Costi' : 'Entrate'}:</span>{' '}
                        {alert.eventName} &mdash; {formatEur(alert.manuali)} manuali + {formatEur(alert.servizi)} servizi
                        <ChevronDown className="w-3 h-3 inline-block ml-1" style={{ color: 'var(--muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      </button>
                      {isExpanded && (
                        <div className="grid grid-cols-2 gap-3" style={{ padding: '8px 0 4px 12px' }}>
                          <div>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
                              {alert.tipo === 'uscite' ? 'Uscite manuali' : 'Entrate manuali'}
                            </p>
                            {(alert.tipo === 'uscite'
                              ? visibleUscite.filter(u => u.eventoId === alert.eventId)
                              : visibleEntrate.filter(e => e.eventoId === alert.eventId)
                            ).map((mov: any) => (
                              <div key={mov.id} className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)', marginBottom: 2 }}>
                                <span>{mov.note || (alert.tipo === 'uscite' ? mov.categoria : 'Entrata')}</span>
                                <span>{formatEur(mov.importo)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--yellow)', borderTop: '1px solid var(--line)', paddingTop: 4, marginTop: 4 }}>
                              <span>Totale</span><span>{formatEur(alert.manuali)}</span>
                            </div>
                          </div>
                          <div>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
                              {alert.tipo === 'uscite' ? 'Costi servizi' : 'Ricavi servizi'}
                            </p>
                            <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>
                              <span>Aggregato servizi evento</span>
                              <span>{formatEur(alert.servizi)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* SECTION: ENTRATE REGISTRATE + USCITE REGISTRATE */}
          <div>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12, opacity: 0.7 }}>Movimenti Registrati</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.6 }}>Entrate Registrate</p>
                  <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--green)', opacity: 0.7 }} />
                </div>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, color: 'var(--green)', lineHeight: 1.1 }}>{formatEur(totEntrateManuali)}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{visibleEntrate.length} movimenti</p>
              </div>
              <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.6 }}>Uscite Registrate</p>
                  <ArrowDownRight className="w-4 h-4" style={{ color: 'var(--red2)', opacity: 0.7 }} />
                </div>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, color: 'var(--red2)', lineHeight: 1.1 }}>{formatEur(totUsciteManuali)}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{visibleUscite.length} voci</p>
              </div>
              <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.6 }}>Margine Reale</p>
                  <TrendingUp className="w-4 h-4" style={{ color: margineReale >= 0 ? 'var(--green)' : 'var(--red2)', opacity: 0.7 }} />
                </div>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, color: margineReale >= 0 ? 'var(--green)' : 'var(--red2)', lineHeight: 1.1 }}>{formatEur(margineReale)}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{marginePercReale}% sui ricavi registrati</p>
              </div>
              <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.6 }}>Pagamenti in Sospeso</p>
                  <Clock className="w-4 h-4" style={{ color: 'var(--yellow)', opacity: 0.7 }} />
                </div>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, color: 'var(--yellow)', lineHeight: 1.1 }}>{formatEur(totInAttesa)}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{visibleEntrate.filter(e => e.stato === 'in_attesa').length} movimenti</p>
              </div>
            </div>
          </div>

          {/* SECTION: PREVISTO EVENTI */}
          <div>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12, opacity: 0.7 }}>Previsionale Eventi</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.6 }}>Ricavi Previsti</p>
                  <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--blue)', opacity: 0.7 }} />
                </div>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, color: 'var(--blue)', lineHeight: 1.1 }}>{formatEur(totRicaviEventi)}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{visibleEventEcon.length} eventi · {visibleEventEcon.reduce((s, e) => s + e.lineCount, 0)} righe</p>
              </div>
              <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.6 }}>Costi Previsti</p>
                  <ArrowDownRight className="w-4 h-4" style={{ color: 'var(--blue)', opacity: 0.7 }} />
                </div>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, color: 'var(--blue)', lineHeight: 1.1 }}>{formatEur(totCostiEventi)}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>Da servizi aggregati</p>
              </div>
              <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.6 }}>Margine Previsto</p>
                  <TrendingUp className="w-4 h-4" style={{ color: marginePrevisto >= 0 ? 'var(--green)' : 'var(--red2)', opacity: 0.7 }} />
                </div>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, color: marginePrevisto >= 0 ? 'var(--green)' : 'var(--red2)', lineHeight: 1.1 }}>{formatEur(marginePrevisto)}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{marginePercPrevisto}% sui ricavi previsti</p>
              </div>
              <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.6 }}>Budget Eventi</p>
                  <Euro className="w-4 h-4" style={{ color: 'var(--text)', opacity: 0.7 }} />
                </div>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, color: 'var(--text)', lineHeight: 1.1 }}>{formatEur(budgetEvents)}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{filteredEvents.length} eventi</p>
              </div>
            </div>
          </div>

          {/* SECTION: QUADRO COMPLESSIVO */}
          <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>Quadro Complessivo</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em', marginBottom: 8 }}>Registrato (reale)</p>
                <div className="space-y-2">
                  <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <span style={{ color: 'var(--muted)' }}>Entrate</span>
                    <span style={{ color: 'var(--green)' }}>{formatEur(totEntrateManuali)}</span>
                  </div>
                  <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <span style={{ color: 'var(--muted)' }}>Uscite</span>
                    <span style={{ color: 'var(--red2)' }}>{formatEur(totUsciteManuali)}</span>
                  </div>
                  <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                    <span style={{ color: 'var(--text)' }}>Margine</span>
                    <span style={{ color: margineReale >= 0 ? 'var(--green)' : 'var(--red2)' }}>{formatEur(margineReale)}</span>
                  </div>
                </div>
              </div>
              <div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em', marginBottom: 8 }}>Previsionale (servizi)</p>
                <div className="space-y-2">
                  <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <span style={{ color: 'var(--muted)' }}>Ricavi</span>
                    <span style={{ color: 'var(--blue)' }}>{formatEur(totRicaviEventi)}</span>
                  </div>
                  <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <span style={{ color: 'var(--muted)' }}>Costi</span>
                    <span style={{ color: 'var(--blue)' }}>{formatEur(totCostiEventi)}</span>
                  </div>
                  <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                    <span style={{ color: 'var(--text)' }}>Margine</span>
                    <span style={{ color: marginePrevisto >= 0 ? 'var(--green)' : 'var(--red2)' }}>{formatEur(marginePrevisto)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <span style={{ color: 'var(--muted)' }}>Fatture da emettere</span>
                <span style={{ color: 'var(--blue)' }}>{visibleFatture.filter(f => f.stato === 'bozza').length}</span>
              </div>
              <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 4 }}>
                <span style={{ color: 'var(--muted)' }}>Fatture scadute</span>
                <span style={{ color: 'var(--red2)' }}>{visibleFatture.filter(f => f.stato === 'scaduta').length}</span>
              </div>
            </div>
          </div>

          {/* DSO / DPO */}
          {(dso > 0 || dpo > 0) && (
            <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>Tempi di Incasso e Pagamento</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div style={{ background: 'var(--panel2)', borderRadius: 10, padding: 16 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em', marginBottom: 8 }}>DSO (Days Sales Outstanding)</p>
                  <p style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 600, color: 'var(--text)', lineHeight: 1.1 }}>{dso}<span style={{ fontSize: 14, color: 'var(--muted)', marginLeft: 4 }}>gg</span></p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>I clienti ci pagano mediamente in {dso}gg</p>
                </div>
                <div style={{ background: 'var(--panel2)', borderRadius: 10, padding: 16 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em', marginBottom: 8 }}>DPO (Days Payable Outstanding)</p>
                  <p style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 600, color: 'var(--text)', lineHeight: 1.1 }}>{dpo}<span style={{ fontSize: 14, color: 'var(--muted)', marginLeft: 4 }}>gg</span></p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>Paghiamo i fornitori mediamente in {dpo}gg</p>
                </div>
                <div style={{ background: 'var(--panel2)', borderRadius: 10, padding: 16 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em', marginBottom: 8 }}>Gap Strutturale</p>
                  <p style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 600, color: (dso - dpo) >= 0 ? 'var(--red2)' : 'var(--green)', lineHeight: 1.1 }}>{dso - dpo}<span style={{ fontSize: 14, color: 'var(--muted)', marginLeft: 4 }}>gg</span></p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{(dso - dpo) > 0 ? 'Anticipiamo i fornitori rispetto agli incassi' : 'Incassiamo prima di pagare i fornitori'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Budget per evento */}
          <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>Costi vs Budget per Evento</h3>
            <div className="space-y-4">
              {filteredEvents.map(ev => {
                  const costoManuale = uscite.filter(u => u.eventoId === ev.id).reduce((s, u) => s + u.importo, 0)
                  const costoServizi = eventEconomics.find(ec => ec.eventId === ev.id)?.costo ?? 0
                  const speso = costoManuale + costoServizi
                  const perc = ev.budget > 0 ? Math.min(100, Math.round((speso / ev.budget) * 100)) : 0
                  const overBudget = ev.budget > 0 && speso > ev.budget * 0.9
                  const barColor = perc >= 100 ? 'var(--red2)' : perc >= 80 ? 'var(--yellow)' : 'var(--green)'
                  return (
                    <div key={ev.id}>
                      <div className="flex justify-between" style={{ marginBottom: 4 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{ev.nome}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: overBudget ? 'var(--red2)' : 'var(--muted)' }}>
                          {formatEur(speso)} / {formatEur(ev.budget)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${perc}%`, background: barColor }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Ultimi movimenti */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowUpRight className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} /> Entrate recenti
              </h3>
              <div className="space-y-3">
                {visibleEntrate.slice(0, 5).map(e => (
                  <div key={e.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clientName(e.clienteId)}</p>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eventName(e.eventoId)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600, color: 'var(--green)' }}>{formatEur(e.importo)}</p>
                      <StatoBadge stato={e.stato} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowDownRight className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} /> Uscite recenti
              </h3>
              <div className="space-y-3">
                {visibleUscite.slice(0, 5).map(u => (
                  <div key={u.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{supplierName(u.fornitoreId)}</p>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.categoria} · {eventName(u.eventoId)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 600, color: 'var(--red2)' }}>{formatEur(u.importo)}</p>
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
        <div className="animate-fade-in" style={{ paddingTop: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {mergedEntrate.length} voci
            </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, color: 'var(--green)' }}>
              {formatEur(mergedEntrate.reduce((s, e) => s + e.importo, 0))}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle} className="mobile-hide">Evento</th>
                  <th style={thStyleRight}>Importo</th>
                  <th style={thStyle}>Stato</th>
                  <th style={thStyle}>Data prevista</th>
                  <th style={thStyle} className="mobile-hide">Metodo</th>
                  <th style={thStyle} className="mobile-hide">Note</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {mergedEntrate.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ ...tdMuted, textAlign: 'center', padding: '32px 14px' }}>Nessun movimento trovato</td>
                  </tr>
                ) : mergedEntrate.map(e => {
                  const isFromEvent = e.id.startsWith('ep_')
                  return (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--line)' }}
                    className="hover:bg-[var(--panel2)] transition-colors">
                    <td style={tdStyle}>
                      {clientName(e.clienteId)}
                      {isFromEvent && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'color-mix(in srgb, var(--blue) 12%, transparent)', color: 'var(--blue)', padding: '2px 6px', borderRadius: 4, marginLeft: 6 }}>
                          EMS {e.eventoId ? `\u00B7 ${eventName(e.eventoId)}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="mobile-hide" style={{ ...tdMuted, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{eventName(e.eventoId)}</td>
                    <td style={{ ...tdAmount, color: 'var(--green)' }}>{formatEur(e.importo)}</td>
                    <td style={{ padding: '10px 14px' }}><StatoBadge stato={e.stato} /></td>
                    <td style={tdMuted}>{formatDateShort(e.dataPrevista)}</td>
                    <td className="mobile-hide" style={{ ...tdMuted, textTransform: 'capitalize' }}>{e.metodoPagamento}</td>
                    <td className="mobile-hide" style={{ ...tdMuted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.note}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div className="flex items-center gap-1">
                        {e.stato !== 'pagato' && e.stato !== 'annullato' && (
                          <button onClick={() => segnaEntrataPagata(e.id)}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', padding: '3px 8px', borderRadius: 4, background: 'rgba(56,210,125,0.1)' }}>
                            Pagato
                          </button>
                        )}
                        {!e.fatturaId && (
                          <button onClick={() => generaFattura('entrata', e.clienteId, clientName(e.clienteId), e.importo, e.eventoId)}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--blue)', padding: '3px 8px', borderRadius: 4, background: 'rgba(77,180,255,0.1)' }}>
                            Fattura
                          </button>
                        )}
                        <button onClick={() => { const newAmt = prompt('Nuovo importo:', String(e.importo)); if (newAmt) editEntrata(e.id, parseFloat(newAmt) || e.importo, e.note) }}
                          className="p-1.5 rounded-lg transition-all hover:bg-white/10">
                          <Edit3 className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                        </button>
                        <button onClick={() => { if (confirm('Eliminare questa entrata?')) eliminaEntrata(e.id) }}
                          className="p-1.5 rounded-lg transition-all hover:bg-white/10">
                          <Trash2 className="w-3 h-3" style={{ color: 'var(--red2)' }} />
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

      {/* ─── TAB: USCITE ───────────────────────────────────────────────────────── */}
      {activeTab === 'uscite' && (
        <div className="animate-fade-in" style={{ paddingTop: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {mergedUscite.length} voci
            </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, color: 'var(--red2)' }}>
              {formatEur(mergedUscite.reduce((s, u) => s + u.importo, 0))}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Fornitore</th>
                  <th style={thStyle} className="mobile-hide">Evento</th>
                  <th style={thStyle} className="mobile-hide">Categoria</th>
                  <th style={thStyle} className="mobile-hide">Qty</th>
                  <th style={thStyleRight} className="mobile-hide">P.Unit.</th>
                  <th style={thStyleRight}>Totale</th>
                  <th style={thStyle}>Stato</th>
                  <th style={thStyle}>Scadenza</th>
                  <th style={thStyle} className="mobile-hide">Note</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {mergedUscite.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ ...tdMuted, textAlign: 'center', padding: '32px 14px' }}>Nessun movimento trovato</td>
                  </tr>
                ) : mergedUscite.map(u => {
                  const isScad = u.scadenza < todayISO() && u.stato !== 'pagato'
                  const isFromEvent = u.id.startsWith('ep_')
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--line)' }}
                      className="hover:bg-[var(--panel2)] transition-colors">
                      <td style={tdStyle}>
                        {supplierName(u.fornitoreId)}
                        {isFromEvent && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'color-mix(in srgb, var(--blue) 12%, transparent)', color: 'var(--blue)', padding: '2px 6px', borderRadius: 4, marginLeft: 6 }}>
                            EMS {u.eventoId ? `\u00B7 ${eventName(u.eventoId)}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="mobile-hide" style={{ ...tdMuted, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{eventName(u.eventoId)}</td>
                      <td className="mobile-hide" style={tdMuted}>{u.categoria}</td>
                      <td className="mobile-hide" style={tdStyle}>{u.quantity ?? 1}</td>
                      <td className="mobile-hide" style={{ ...tdAmount, color: 'var(--muted)' }}>{u.unitPrice != null ? formatEur(u.unitPrice) : '—'}</td>
                      <td style={{ ...tdAmount, color: 'var(--red2)' }}>{formatEur(u.importo)}</td>
                      <td style={{ padding: '10px 14px' }}><StatoBadge stato={u.stato} /></td>
                      <td style={{ ...tdMuted, color: isScad ? 'var(--red2)' : 'var(--muted)' }}>
                        {formatDateShort(u.scadenza)} {isScad && '!'}
                      </td>
                      <td className="mobile-hide" style={{ ...tdMuted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.note}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div className="flex items-center gap-1">
                          {u.stato !== 'pagato' && u.stato !== 'annullato' && (
                            <button onClick={() => segnaUscitaPagata(u.id)}
                              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', padding: '3px 8px', borderRadius: 4, background: 'rgba(56,210,125,0.1)' }}>
                              Pagato
                            </button>
                          )}
                          {!u.fatturaId && (
                            <button onClick={() => generaFattura('uscita', u.fornitoreId, supplierName(u.fornitoreId), u.importo, u.eventoId)}
                              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--blue)', padding: '3px 8px', borderRadius: 4, background: 'rgba(77,180,255,0.1)' }}>
                              Fattura
                            </button>
                          )}
                          <button onClick={() => { const newAmt = prompt('Nuovo importo:', String(u.importo)); if (newAmt) editUscita(u.id, parseFloat(newAmt) || u.importo, u.note) }}
                            className="p-1.5 rounded-lg transition-all hover:bg-white/10">
                            <Edit3 className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                          </button>
                          <button onClick={() => { if (confirm('Eliminare questa uscita?')) eliminaUscita(u.id) }}
                            className="p-1.5 rounded-lg transition-all hover:bg-white/10">
                            <Trash2 className="w-3 h-3" style={{ color: 'var(--red2)' }} />
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
        <div className="animate-fade-in" style={{ paddingTop: 14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {filteredFatture.length} fatture
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
              {formatEur(filteredFatture.reduce((s, f) => s + f.importo, 0))} totale
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>N. Fattura</th>
                  <th style={thStyle} className="mobile-hide">Tipo</th>
                  <th style={thStyle}>Soggetto</th>
                  <th style={thStyle} className="mobile-hide">Evento</th>
                  <th style={thStyleRight} className="mobile-hide">Imponibile</th>
                  <th style={thStyleRight} className="mobile-hide">IVA</th>
                  <th style={thStyleRight}>Totale</th>
                  <th style={thStyle}>Stato</th>
                  <th style={thStyle} className="mobile-hide">Emessa</th>
                  <th style={thStyle}>Scadenza</th>
                </tr>
              </thead>
              <tbody>
                {filteredFatture.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ ...tdMuted, textAlign: 'center', padding: '32px 14px' }}>Nessuna fattura trovata</td>
                  </tr>
                ) : filteredFatture.map(f => {
                  const Icon = statoFatIcon(f.stato)
                  const isScad = f.stato === 'scaduta' || (f.scadenza < todayISO() && f.stato === 'emessa')
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--line)' }}
                      className="hover:bg-[var(--panel2)] transition-colors">
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{f.numero}</td>
                      <td className="mobile-hide" style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
                          color: f.tipo === 'entrata' ? 'var(--green)' : 'var(--red2)',
                          background: f.tipo === 'entrata' ? 'rgba(56,210,125,0.12)' : 'rgba(255,49,95,0.12)',
                          padding: '2px 6px', borderRadius: 4,
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                        }}>
                          {f.tipo === 'entrata' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {f.tipo === 'entrata' ? 'ENT' : 'USC'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.soggetto}</td>
                      <td className="mobile-hide" style={{ ...tdMuted, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>{eventName(f.eventoId)}</td>
                      <td className="mobile-hide" style={{ ...tdAmount, color: 'var(--muted)' }}>{formatEur(f.imponibile)}</td>
                      <td className="mobile-hide" style={{ ...tdAmount, color: 'var(--muted)' }}>{formatEur(f.iva)}</td>
                      <td style={{ ...tdAmount, color: f.tipo === 'entrata' ? 'var(--green)' : 'var(--red2)' }}>{formatEur(f.importo)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
                          color: statoFatColor(f.stato),
                          background: `${statoFatColor(f.stato)}15`,
                          padding: '2px 6px', borderRadius: 4,
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                        }}>
                          <Icon className="w-3 h-3" />
                          {statoFatLabel(f.stato)}
                        </span>
                      </td>
                      <td className="mobile-hide" style={tdMuted}>{formatDate(f.dataEmissione)}</td>
                      <td style={{ ...tdMuted, color: isScad ? 'var(--red2)' : 'var(--muted)' }}>
                        {formatDate(f.scadenza)} {isScad && '!'}
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
        <div className="animate-fade-in" style={{ paddingTop: 14 }}>
          <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Fatture Supabase · {invoices.length} voci
            </span>
            <button onClick={() => { setEditingInvoice(null); setShowInvoiceForm(true) }}
              className="transition-colors"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus className="w-3.5 h-3.5" /> Nuova Fattura
            </button>
          </div>
          {invoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Receipt className="w-8 h-8 mx-auto" style={{ color: 'var(--muted)', opacity: 0.4, marginBottom: 8 }} />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Nessuna fattura registrata</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Numero</th>
                    <th style={thStyle} className="mobile-hide">Tipo</th>
                    <th style={thStyle} className="mobile-hide">Soggetto</th>
                    <th style={thStyleRight}>Importo</th>
                    <th style={thStyle}>Stato</th>
                    <th style={thStyle}>Scadenza</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const subject = inv.type === 'emessa'
                      ? (clients.find(c => c.id === inv.client_id)?.nome ?? '-')
                      : (suppliers.find(s => s.id === inv.supplier_id)?.nome ?? '-')
                    const st = INVOICE_STATUSES.find(s => s.id === inv.status)
                    return (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--line)' }}
                        className="hover:bg-[var(--panel2)] transition-colors">
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{inv.number || '-'}</td>
                        <td className="mobile-hide" style={{ ...tdMuted, textTransform: 'capitalize' }}>{inv.type}</td>
                        <td className="mobile-hide" style={tdMuted}>{subject}</td>
                        <td style={{ ...tdAmount, color: 'var(--text)' }}>{formatEur(inv.amount)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
                            color: st?.color ?? 'var(--muted)',
                            background: `${st?.color ?? '#9ba3aa'}20`,
                            padding: '2px 6px', borderRadius: 4,
                          }}>
                            {st?.label ?? inv.status}
                          </span>
                        </td>
                        <td style={tdMuted}>{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div className="flex items-center justify-end gap-1">
                            {inv.external_url && (
                              <a href={inv.external_url} target="_blank" rel="noopener noreferrer"
                                className="p-1.5 rounded-lg hover:bg-white/10">
                                <FileText className="w-3 h-3" style={{ color: 'var(--blue)' }} />
                              </a>
                            )}
                            <button onClick={() => { setEditingInvoice(inv); setShowInvoiceForm(true) }}
                              className="p-1.5 rounded-lg hover:bg-white/10">
                              <Edit3 className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                            </button>
                            <button onClick={async () => { await deleteInvoice(inv.id); setInvoices(prev => prev.filter(i => i.id !== inv.id)) }}
                              className="p-1.5 rounded-lg hover:bg-white/10">
                              <Trash2 className="w-3 h-3" style={{ color: 'var(--red2)' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: DOCUMENTI ────────────────────────────────────────────────────── */}
      {activeTab === 'documenti' && (
        <div className="animate-fade-in" style={{ paddingTop: 14 }}>
          <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Documenti amministrativi · {adminDocs.length}
            </span>
            <button onClick={() => { setEditingDoc(null); setShowDocForm(true) }}
              className="transition-colors"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus className="w-3.5 h-3.5" /> Nuovo Documento
            </button>
          </div>
          {adminDocs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <FileText className="w-8 h-8 mx-auto" style={{ color: 'var(--muted)', opacity: 0.4, marginBottom: 8 }} />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Nessun documento amministrativo</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {adminDocs.map(doc => {
                const typeLabel = ADMIN_DOC_TYPES.find(t => t.id === doc.type)?.label ?? doc.type
                return (
                  <div key={doc.id} style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{doc.title}</h4>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{typeLabel}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingDoc(doc); setShowDocForm(true) }} className="p-1 rounded hover:bg-white/10">
                          <Edit3 className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                        </button>
                        <button onClick={async () => { await deleteAdminDocument(doc.id); setAdminDocs(prev => prev.filter(d => d.id !== doc.id)) }}
                          className="p-1 rounded hover:bg-white/10">
                          <Trash2 className="w-3 h-3" style={{ color: 'var(--red2)' }} />
                        </button>
                      </div>
                    </div>
                    {doc.notes && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>{doc.notes}</p>}
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                        <Download className="w-3 h-3" /> Scarica file
                      </a>
                    )}
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 8, opacity: 0.6 }}>{formatDate(doc.created_at)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'ferie' && (
        <FeriePermessiTab />
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

  const labelStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 6 }
  const inputStyle: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)' }} />
      <div className="relative w-full max-w-lg rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text)' }}>
            {invoice ? 'Modifica Fattura' : 'Nuova Fattura'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Tipo</label>
              <select value={type} onChange={e => setType(e.target.value as 'emessa' | 'ricevuta')}
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
                <option value="emessa">Emessa (attiva)</option>
                <option value="ricevuta">Ricevuta (passiva)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Numero</label>
              <input value={number} onChange={e => setNumber(e.target.value)} placeholder="FT-2026-001"
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label style={labelStyle}>Importo</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>IVA</label>
              <input type="number" value={vatAmount} onChange={e => setVatAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Stato</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
                {INVOICE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Evento</label>
              <select value={eventId} onChange={e => setEventId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
                <option value="">Nessuno</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{type === 'emessa' ? 'Cliente' : 'Fornitore'}</label>
              {type === 'emessa' ? (
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
                  <option value="">Seleziona</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              ) : (
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
                  <option value="">Seleziona</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Scadenza</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>ID Fatture in Cloud</label>
              <input value={ficId} onChange={e => setFicId(e.target.value)} placeholder="Opzionale"
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Link esterno (Fatture in Cloud)</label>
            <input value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://..."
              className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note" rows={2}
            className="w-full px-3 py-2 rounded-xl text-sm resize-none" style={inputStyle} />
        </div>
        <button onClick={() => onSave({
          ...(invoice?.id ? { id: invoice.id } : {}),
          type, number, amount: Number(amount) || 0, vat_amount: Number(vatAmount) || 0,
          status, due_date: dueDate || null,
          event_id: eventId || null, client_id: clientId || null, supplier_id: supplierId || null,
          fatture_in_cloud_id: ficId || null, external_url: externalUrl || null, notes,
        })} disabled={!number && !amount}
          className="w-full py-3 rounded-xl disabled:opacity-40"
          style={{ background: 'var(--text)', color: 'var(--bg)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
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

  const labelStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: 6 }
  const inputStyle: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)' }} />
      <div className="relative w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text)' }}>
            {doc ? 'Modifica Documento' : 'Nuovo Documento'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo documento"
            className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Tipo</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
                {ADMIN_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Evento</label>
              <select value={eventId} onChange={e => setEventId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
                <option value="">Nessuno</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Cliente</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
                <option value="">Nessuno</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fornitore</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
                <option value="">Nessuno</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note" rows={2}
            className="w-full px-3 py-2 rounded-xl text-sm resize-none" style={inputStyle} />
          <div className="flex items-center gap-3">
            <label
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Caricamento...' : 'Carica file'}
              <input type="file" className="hidden" onChange={handleFileUpload} />
            </label>
            {fileUrl && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)' }}>File caricato</span>}
          </div>
        </div>
        <button onClick={() => onSave({
          ...(doc?.id ? { id: doc.id } : {}),
          title, type,
          event_id: eventId || null, client_id: clientId || null, supplier_id: supplierId || null,
          notes, file_url: fileUrl || null,
        })} disabled={!title}
          className="w-full py-3 rounded-xl disabled:opacity-40"
          style={{ background: 'var(--text)', color: 'var(--bg)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
          {doc ? 'Salva Modifiche' : 'Crea Documento'}
        </button>
      </div>
    </div>
  )
}

// ─── Ferie & Permessi Tab ────────────────────────────────────────────────────

interface LeaveRow {
  id: string; user_id: string; tipo: string; data_inizio: string; data_fine: string
  stato: string; motivo: string | null; note_admin: string | null
  approvato_da: string | null; approvato_at: string | null; created_at: string
  profiles?: { first_name: string; last_name: string; avatar_url: string | null; role: string }
}

function FeriePermessiTab() {
  const [leaves, setLeaves] = useState<LeaveRow[]>([])
  const [filter, setFilter] = useState<'tutti' | 'in_attesa' | 'approvata' | 'negata'>('tutti')
  const [filterUser, setFilterUser] = useState('tutti')
  const [profiles, setProfiles] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [denyingId, setDenyingId] = useState<string | null>(null)
  const [denyNote, setDenyNote] = useState('')
  const [showAnnual, setShowAnnual] = useState(false)
  const [annualData, setAnnualData] = useState<{ user_id: string; tipo: string; giorni: number }[]>([])

  const loadLeaves = useCallback(async () => {
    const { data } = await supabase.from('leave_requests')
      .select('*, profiles(first_name, last_name, avatar_url, role)')
      .order('created_at', { ascending: false })
    setLeaves((data ?? []) as LeaveRow[])
  }, [])

  useEffect(() => {
    loadLeaves()
    supabase.from('profiles').select('id, first_name, last_name').eq('stato', 'attivo').order('first_name').then(r => setProfiles(r.data ?? []))
  }, [loadLeaves])

  const filtered = useMemo(() => {
    let list = leaves
    if (filter !== 'tutti') list = list.filter(l => l.stato === filter)
    if (filterUser !== 'tutti') list = list.filter(l => l.user_id === filterUser)
    return list
  }, [leaves, filter, filterUser])

  const countInAttesa = leaves.filter(l => l.stato === 'in_attesa').length
  const countApprovate = leaves.filter(l => l.stato === 'approvata' && new Date(l.data_inizio).getMonth() === new Date().getMonth()).length
  const totalGiorni = leaves.filter(l => l.stato === 'approvata').reduce((s, l) => {
    const d = Math.max(1, Math.round((new Date(l.data_fine).getTime() - new Date(l.data_inizio).getTime()) / 86400000) + 1)
    return s + d
  }, 0)

  const approve = async (id: string, _row: LeaveRow) => {
    await approveLeaveRequest(id)
    loadLeaves()
  }

  const deny = async (id: string, _row: LeaveRow) => {
    if (denyNote.length < 10) return
    await rejectLeaveRequest(id, denyNote)
    setDenyingId(null); setDenyNote('')
    loadLeaves()
  }

  const loadAnnual = async () => {
    const year = new Date().getFullYear()
    const { data } = await supabase.from('leave_requests').select('user_id, tipo, data_inizio, data_fine').eq('stato', 'approvata').gte('data_inizio', `${year}-01-01`).lte('data_inizio', `${year}-12-31`)
    const map: Record<string, Record<string, number>> = {}
    for (const row of data ?? []) {
      const days = Math.max(1, Math.round((new Date(row.data_fine).getTime() - new Date(row.data_inizio).getTime()) / 86400000) + 1)
      if (!map[row.user_id]) map[row.user_id] = {}
      map[row.user_id][row.tipo] = (map[row.user_id][row.tipo] || 0) + days
    }
    const result: { user_id: string; tipo: string; giorni: number }[] = []
    for (const [uid, tipos] of Object.entries(map)) {
      for (const [t, g] of Object.entries(tipos)) result.push({ user_id: uid, tipo: t, giorni: g })
    }
    setAnnualData(result)
    setShowAnnual(true)
  }

  const TIPO_COLORS: Record<string, string> = { ferie: 'var(--blue)', permesso: '#eab308', malattia: '#6b7280', recupero: '#22c55e' }
  const STATO_COLORS: Record<string, string> = { in_attesa: '#eab308', approvata: '#22c55e', negata: 'var(--red2)', annullata: '#6b7280' }

  const calcDays = (d1: string, d2: string) => Math.max(1, Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000) + 1)

  return (
    <div className="animate-fade-in" style={{ paddingTop: 14 }}>
      {/* Ticker */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 14, display: 'flex', gap: 16 }}>
        <span><b style={{ color: '#eab308' }}>{countInAttesa}</b> in attesa</span>
        <span><b style={{ color: '#22c55e' }}>{countApprovate}</b> approvate questo mese</span>
        <span><b style={{ color: 'var(--text)' }}>{totalGiorni}</b> giorni totali approvati</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['tutti', 'in_attesa', 'approvata', 'negata'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 10px', borderRadius: 6, border: filter === f ? '1.5px solid var(--red2)' : '1px solid var(--line)', background: filter === f ? 'rgba(208,0,58,0.06)' : 'transparent', color: filter === f ? 'var(--red2)' : 'var(--muted)', cursor: 'pointer', textTransform: 'capitalize' }}>
            {f === 'tutti' ? 'Tutti' : f.replace('_', ' ')}
          </button>
        ))}
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)' }}>
          <option value="tutti">Tutti gli utenti</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
        </select>
        <button onClick={loadAnnual} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', marginLeft: 'auto' }}>
          Riepilogo annuale
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {['Utente', 'Tipo', 'Dal', 'Al', 'Giorni', 'Stato', 'Azioni'].map(h => (
                <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', padding: '8px 10px', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>
                  {row.profiles?.first_name} {row.profiles?.last_name}
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${TIPO_COLORS[row.tipo] || '#888'}20`, color: TIPO_COLORS[row.tipo] || '#888' }}>{row.tipo}</span>
                </td>
                <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{row.data_inizio}</td>
                <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{row.data_fine}</td>
                <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{calcDays(row.data_inizio, row.data_fine)}</td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${STATO_COLORS[row.stato] || '#888'}20`, color: STATO_COLORS[row.stato] || '#888' }}>{row.stato.replace('_', ' ')}</span>
                </td>
                <td style={{ padding: '8px 10px' }}>
                  {row.stato === 'in_attesa' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => approve(row.id, row)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 8px', borderRadius: 4, border: 'none', background: '#22c55e20', color: '#22c55e', cursor: 'pointer' }}>Approva</button>
                      <button onClick={() => { setDenyingId(row.id); setDenyNote('') }} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 8px', borderRadius: 4, border: 'none', background: 'rgba(208,0,58,0.1)', color: 'var(--red2)', cursor: 'pointer' }}>Nega</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Nessuna richiesta trovata</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Deny form inline */}
      {denyingId && (
        <div style={{ margin: '12px 0', padding: 14, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>Motivazione per il rifiuto (min 10 caratteri):</p>
          <textarea value={denyNote} onChange={e => setDenyNote(e.target.value)} rows={2} placeholder="Motivazione obbligatoria..."
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel-solid)', color: 'var(--text)', resize: 'vertical', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { const row = leaves.find(l => l.id === denyingId); if (row) deny(denyingId, row) }} disabled={denyNote.length < 10}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '5px 12px', borderRadius: 6, border: 'none', background: 'var(--red2)', color: '#fff', cursor: 'pointer', opacity: denyNote.length < 10 ? 0.4 : 1 }}>Conferma negazione</button>
            <button onClick={() => setDenyingId(null)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>Annulla</button>
          </div>
        </div>
      )}

      {/* Annual summary */}
      {showAnnual && (
        <div style={{ marginTop: 20, padding: 14, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text)' }}>Riepilogo annuale {new Date().getFullYear()}</h4>
            <button onClick={() => setShowAnnual(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14 }}>X</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Utente', 'Ferie', 'Permessi', 'Malattia', 'Recupero', 'Totale'].map(h => (
                  <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)', padding: '6px 8px', textAlign: h === 'Utente' ? 'left' : 'center' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => {
                const userRows = annualData.filter(a => a.user_id === p.id)
                const ferie = userRows.find(r => r.tipo === 'ferie')?.giorni ?? 0
                const permessi = userRows.find(r => r.tipo === 'permesso')?.giorni ?? 0
                const malattia = userRows.find(r => r.tipo === 'malattia')?.giorni ?? 0
                const recupero = userRows.find(r => r.tipo === 'recupero')?.giorni ?? 0
                const tot = ferie + permessi + malattia + recupero
                if (tot === 0) return null
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{p.first_name} {p.last_name}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--blue)', textAlign: 'center' }}>{ferie || '-'}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#eab308', textAlign: 'center' }}>{permessi || '-'}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#6b7280', textAlign: 'center' }}>{malattia || '-'}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#22c55e', textAlign: 'center' }}>{recupero || '-'}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', fontWeight: 700, textAlign: 'center' }}>{tot}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
