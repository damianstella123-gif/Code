import { useState, useMemo } from 'react'
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
} from 'lucide-react'
import { suppliers } from '@/data/suppliers'
import { events } from '@/data/events'
import { users } from '@/data/users'
import { tasks } from '@/data/tasks'
import { uscite } from '@/data/amministrazione'
import { loadUser } from '@/lib/auth'
import type { Supplier, StatoContratto } from '@/data/suppliers'

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

// ─── Supplier Detail ──────────────────────────────────────────────────────────

interface DetailProps {
  supplier: Supplier
  onBack: () => void
  showFinance: boolean
}

function SupplierDetail({ supplier, onBack, showFinance }: DetailProps) {
  const [tab, setTab] = useState<'overview' | 'eventi' | 'documenti' | 'recensioni'>('overview')

  const linkedEvents = events.filter(e => supplier.eventiId.includes(e.id))
  const totalSpeso = showFinance
    ? uscite.filter(u => u.fornitoreId === supplier.id).reduce((s, u) => s + u.importo, 0)
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
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
        style={{ color: 'var(--muted)' }}
      >
        <ArrowLeft className="w-4 h-4" /> Torna ai fornitori
      </button>

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
            <div className="grid grid-cols-3 gap-3 flex-shrink-0">
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
            <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Note operative</p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{supplier.noteOperative}</p>
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
            const evTasks = tasks.filter(t => t.evento === ev.id && (
              supplier.eventiId.includes(ev.id)
            ))
            const spesaEvento = showFinance
              ? uscite.filter(u => u.fornitoreId === supplier.id && u.eventoId === ev.id).reduce((s, u) => s + u.importo, 0)
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
            const autore = users.find(u => u.id === rec.autoreId)
            const evRec = events.find(e => e.id === rec.eventoId)
            return (
              <div key={rec.id} className="panel p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    {autore ? (
                      <img src={autore.avatar} alt={autore.nome} className="w-9 h-9 rounded-lg object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg" style={{ background: 'var(--panel2)' }} />
                    )}
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{autore?.nome ?? 'Team'}</p>
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
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('Tutte')
  const [filterContratto, setFilterContratto] = useState('tutti')
  const [filterRating, setFilterRating] = useState('tutti')

  if (!currentUser) return null

  const ruolo = currentUser.ruolo
  const showFinance = ruolo === 'Admin' || ruolo === 'Finance'

  // Determine which supplier IDs this user can see
  const allowedIds = useMemo((): string[] | 'all' => {
    if (ruolo === 'Admin' || ruolo === 'Manager') return 'all'
    if (ruolo === 'Finance') return 'all'
    if (ruolo === 'Fornitore') {
      // Fornitore sees only their own supplier entry matched by user id
      // Convention: user usr_011 maps to sup_001 (only one fornitore in demo)
      // We match by showing all — in a real app would match by userId
      return suppliers.filter(s => s.referente === currentUser.nome || s.stato === 'attivo').map(s => s.id).slice(0, 1)
    }
    if (ruolo === 'Operativo') {
      // Sees suppliers linked to events where they are team member
      const myEventIds = events
        .filter(e => e.team.includes(currentUser.id) || e.responsabile === currentUser.id)
        .map(e => e.id)
      return suppliers.filter(s => s.eventiId.some(eid => myEventIds.includes(eid))).map(s => s.id)
    }
    if (ruolo === 'Commerciale') {
      return suppliers.filter(s => s.stato === 'attivo').map(s => s.id)
    }
    return 'all'
  }, [ruolo, currentUser])

  const baseList = useMemo(() =>
    allowedIds === 'all' ? suppliers : suppliers.filter(s => allowedIds.includes(s.id)),
    [allowedIds])

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
    return (
      <SupplierDetail
        supplier={selected}
        onBack={() => setSelected(null)}
        showFinance={showFinance}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Alerts */}
      {(inScadenza > 0 || scaduti > 0) && (ruolo === 'Admin' || ruolo === 'Manager' || ruolo === 'Finance') && (
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
      {(ruolo === 'Admin' || ruolo === 'Manager' || ruolo === 'Finance') && (
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
