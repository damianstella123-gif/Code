import { useState, useMemo } from 'react'
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
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import {
  entrate as initEntrate,
  uscite as initUscite,
  fatture as initFatture,
} from '@/data/amministrazione'
import type {
  Entrata,
  Uscita,
  Fattura,
  StatoPagamento,
  TipoMovimento,
} from '@/data/amministrazione'
import { clients } from '@/data/clients'
import { suppliers } from '@/data/suppliers'
import { events } from '@/data/events'

// ─── localStorage ────────────────────────────────────────────────────────────

const SK_ENTRATE = 'simmetria_entrate'
const SK_USCITE = 'simmetria_uscite'
const SK_FATTURE = 'simmetria_fatture'

function load<T>(key: string, fallback: T[]): T[] {
  try {
    const r = localStorage.getItem(key)
    return r ? JSON.parse(r) : fallback
  } catch { return fallback }
}
function save(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify(data))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function clientName(id: string) {
  return clients.find(c => c.id === id)?.nome ?? id
}
function supplierName(id: string) {
  return suppliers.find(s => s.id === id)?.nome ?? id
}
function eventName(id: string | null) {
  if (!id) return '—'
  return events.find(e => e.id === id)?.nome ?? id
}

// ─── Modale nuovo movimento ───────────────────────────────────────────────────

interface NuovoMovimentoModalProps {
  onClose: () => void
  onSave: (tipo: TipoMovimento, importo: number, note: string, eventoId: string | null, soggettoId: string) => void
}

function NuovoMovimentoModal({ onClose, onSave }: NuovoMovimentoModalProps) {
  const [tipo, setTipo] = useState<TipoMovimento>('entrata')
  const [importo, setImporto] = useState('')
  const [note, setNote] = useState('')
  const [eventoId, setEventoId] = useState<string>('none')
  const [soggettoId, setSoggettoId] = useState<string>('')

  function handleSave() {
    const amt = parseFloat(importo.replace(',', '.'))
    if (!amt || amt <= 0) return
    const defaultSoggetto = tipo === 'entrata' ? (clients[0]?.id ?? '') : (suppliers[0]?.id ?? '')
    onSave(tipo, amt, note, eventoId === 'none' ? null : eventoId, soggettoId || defaultSoggetto)
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

          {/* Importo */}
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

type TabId = 'dashboard' | 'entrate' | 'uscite' | 'fatture'

export default function Amministrazione() {
  const currentUser = loadUser()

  // Permission gate
  if (!currentUser || ['Operativo', 'Commerciale', 'Fornitore'].includes(currentUser.ruolo)) {
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

  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [entrate, setEntrate] = useState<Entrata[]>(() => load(SK_ENTRATE, initEntrate))
  const [uscite, setUscite] = useState<Uscita[]>(() => load(SK_USCITE, initUscite))
  const [fatture, setFatture] = useState<Fattura[]>(() => load(SK_FATTURE, initFatture))
  const [showNuovoMovimento, setShowNuovoMovimento] = useState(false)

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
      save(SK_ENTRATE, updated)
      return updated
    })
  }

  function segnaUscitaPagata(id: string) {
    setUscite(prev => {
      const updated = prev.map(u =>
        u.id === id ? { ...u, stato: 'pagato' as StatoPagamento, dataPagamento: new Date().toISOString().slice(0, 10) } : u
      )
      save(SK_USCITE, updated)
      return updated
    })
  }

  function eliminaEntrata(id: string) {
    setEntrate(prev => {
      const updated = prev.filter(e => e.id !== id)
      save(SK_ENTRATE, updated)
      return updated
    })
  }

  function eliminaUscita(id: string) {
    setUscite(prev => {
      const updated = prev.filter(u => u.id !== id)
      save(SK_USCITE, updated)
      return updated
    })
  }

  function editEntrata(id: string, importo: number, note: string) {
    setEntrate(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, importo, note } : e)
      save(SK_ENTRATE, updated)
      return updated
    })
  }

  function editUscita(id: string, importo: number, note: string) {
    setUscite(prev => {
      const updated = prev.map(u => u.id === id ? { ...u, importo, note } : u)
      save(SK_USCITE, updated)
      return updated
    })
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
      save(SK_FATTURE, updated)
      return updated
    })
    alert(`Fattura ${num} creata in bozza.`)
  }

  function esportaRiepilogo() {
    const lines = [
      'SIMMETRIA HUB — Riepilogo Amministrativo',
      `Data: ${new Date().toLocaleDateString('it-IT')}`,
      '',
      `Budget eventi: ${formatEur(budgetEvents)}`,
      `Totale entrate: ${formatEur(totEntrate)}`,
      `Totale uscite: ${formatEur(totUscite)}`,
      `Margine stimato: ${formatEur(margine)} (${marginePerc}%)`,
      `Pagamenti in sospeso: ${formatEur(totInAttesa)}`,
      `Incassi scaduti: ${formatEur(totScaduto)}`,
      '',
      'ENTRATE',
      ...visibleEntrate.map(e => `  ${clientName(e.clienteId)} | ${eventName(e.eventoId)} | ${formatEur(e.importo)} | ${statoPagLabel(e.stato)}`),
      '',
      'USCITE',
      ...visibleUscite.map(u => `  ${supplierName(u.fornitoreId)} | ${eventName(u.eventoId)} | ${formatEur(u.importo)} | ${statoPagLabel(u.stato)}`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `simmetria_riepilogo_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
  }

  function handleNuovoMovimento(tipo: TipoMovimento, importo: number, note: string, eventoId: string | null, soggettoId: string) {
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
      setEntrate(prev => { const u = [...prev, newE]; save(SK_ENTRATE, u); return u })
    } else {
      const newU: Uscita = {
        id: `usc_new_${Date.now()}`,
        fornitoreId: soggettoId,
        eventoId,
        categoria: 'Altro',
        importo,
        stato: 'in_attesa',
        scadenza: today,
        dataPagamento: null,
        note,
        fatturaId: null,
      }
      setUscite(prev => { const u = [...prev, newU]; save(SK_USCITE, u); return u })
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
            onClick={esportaRiepilogo}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}
          >
            <Download className="w-4 h-4" /> Esporta
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
                  {['Fornitore', 'Evento', 'Categoria', 'Importo', 'Stato', 'Scadenza', 'Note', ''].map(h => (
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
                      <td className="px-4 py-3 font-bold" style={{ color: 'var(--red2)', whiteSpace: 'nowrap' }}>{formatEur(u.importo)}</td>
                      <td className="px-4 py-3"><StatoBadge stato={u.stato} /></td>
                      <td className="px-4 py-3 text-xs" style={{ color: isScad ? 'var(--red2)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {formatDateShort(u.scadenza)} {isScad && '⚠'}
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
        />
      )}
    </div>
  )
}
