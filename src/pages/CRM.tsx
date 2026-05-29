import { useState, useMemo } from 'react'
import {
  Users,
  Search,
  X,
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  TrendingUp,
  Star,
  MessageSquare,
  Video,
  Send,
  FileText,
  ChevronRight,
} from 'lucide-react'
import { clients, contatti } from '@/data/clients'
import { events } from '@/data/events'
import { users } from '@/data/users'
import type { Client, Contatto } from '@/data/clients'

type FilterStato = 'Tutti' | 'attivo' | 'vip' | 'prospect' | 'perso'

const FILTERS: { id: FilterStato; label: string; color: string }[] = [
  { id: 'Tutti', label: 'Tutti', color: 'var(--text)' },
  { id: 'attivo', label: 'Attivo', color: 'var(--green)' },
  { id: 'vip', label: 'VIP', color: 'var(--yellow)' },
  { id: 'prospect', label: 'Prospect', color: 'var(--blue)' },
  { id: 'perso', label: 'Perso', color: 'var(--muted)' },
]

function statoColor(stato: Client['stato']) {
  switch (stato) {
    case 'attivo': return 'var(--green)'
    case 'vip': return 'var(--yellow)'
    case 'prospect': return 'var(--blue)'
    case 'perso': return 'var(--muted)'
  }
}

function statoLabel(stato: Client['stato']) {
  switch (stato) {
    case 'attivo': return 'Attivo'
    case 'vip': return 'VIP'
    case 'prospect': return 'Prospect'
    case 'perso': return 'Perso'
  }
}

function faseLabel(fase: Client['faseTrattativa']) {
  switch (fase) {
    case 'lead': return 'Lead'
    case 'qualificato': return 'Qualificato'
    case 'proposta': return 'Proposta Inviata'
    case 'negoziazione': return 'In Negoziazione'
    case 'chiuso_vinto': return 'Chiuso Vinto'
    case 'chiuso_perso': return 'Chiuso Perso'
  }
}

function faseColor(fase: Client['faseTrattativa']) {
  switch (fase) {
    case 'lead': return 'var(--muted)'
    case 'qualificato': return 'var(--blue)'
    case 'proposta': return 'var(--yellow)'
    case 'negoziazione': return '#f97316'
    case 'chiuso_vinto': return 'var(--green)'
    case 'chiuso_perso': return 'var(--red2)'
  }
}

function contattoIcon(tipo: Contatto['tipo']) {
  switch (tipo) {
    case 'chiamata': return Phone
    case 'email': return Mail
    case 'meeting': return Video
    case 'proposta': return FileText
    case 'offerta': return Send
    default: return MessageSquare
  }
}

function contattoColor(tipo: Contatto['tipo']) {
  switch (tipo) {
    case 'chiamata': return 'var(--green)'
    case 'email': return 'var(--blue)'
    case 'meeting': return 'var(--yellow)'
    case 'proposta': return '#f97316'
    case 'offerta': return 'var(--red2)'
    default: return 'var(--muted)'
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

const FASE_STEPS: Client['faseTrattativa'][] = [
  'lead', 'qualificato', 'proposta', 'negoziazione', 'chiuso_vinto',
]

function FasePipeline({ fase }: { fase: Client['faseTrattativa'] }) {
  if (fase === 'chiuso_perso') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,49,95,0.15)', color: 'var(--red2)' }}>
          Chiuso Perso
        </span>
      </div>
    )
  }
  const currentIdx = FASE_STEPS.indexOf(fase)
  return (
    <div className="flex items-center gap-1">
      {FASE_STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-1">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{
              width: '28px',
              background: i <= currentIdx ? faseColor(fase) : 'var(--line)',
            }}
          />
        </div>
      ))}
      <span className="text-xs ml-1" style={{ color: faseColor(fase) }}>
        {faseLabel(fase)}
      </span>
    </div>
  )
}

interface ClientDetailProps {
  client: Client
  onBack: () => void
}

function ClientDetail({ client, onBack }: ClientDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'storico' | 'eventi'>('overview')

  const clientContatti = contatti
    .filter(c => c.clienteId === client.id)
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  const clientEvents = events.filter(e => e.cliente === client.id)

  const tabs = [
    { id: 'overview' as const, label: 'Panoramica' },
    { id: 'storico' as const, label: `Storico (${clientContatti.length})` },
    { id: 'eventi' as const, label: `Eventi (${clientEvents.length})` },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
        style={{ color: 'var(--muted)' }}
      >
        <ArrowLeft className="w-4 h-4" /> Torna ai clienti
      </button>

      {/* Hero */}
      <div className="panel p-6 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{ background: `linear-gradient(135deg, ${statoColor(client.stato)} 0%, transparent 60%)` }}
        />
        <div className="relative flex flex-wrap items-start gap-6">
          <img
            src={client.avatar}
            alt={client.nome}
            className="w-20 h-20 rounded-2xl object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{
                  background: `${statoColor(client.stato)}18`,
                  color: statoColor(client.stato),
                  border: `1px solid ${statoColor(client.stato)}35`,
                }}
              >
                {client.stato === 'vip' && <Star className="w-3 h-3 inline mr-1 -mt-0.5" />}
                {statoLabel(client.stato)}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                {client.settore}
              </span>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{client.nome}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              Ref: {client.referente}
            </p>
            <div className="mt-3">
              <FasePipeline fase={client.faseTrattativa} />
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 flex-shrink-0">
            <div className="text-center p-4 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Fatturato</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--green)' }}>
                {client.fatturato > 0 ? `€${(client.fatturato / 1000).toFixed(0)}K` : '—'}
              </p>
            </div>
            <div className="text-center p-4 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Potenziale</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--blue)' }}>
                €{(client.valoreStimato / 1000).toFixed(0)}K
              </p>
            </div>
          </div>
        </div>
      </div>

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

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contatti */}
            <div className="panel p-5">
              <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Recapiti</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--blue)' }} />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{client.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green)' }} />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{client.telefono}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red2)' }} />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{client.citta}, {client.nazione}</span>
                </div>
              </div>
            </div>

            {/* Trattativa */}
            <div className="panel p-5">
              <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Trattativa</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>Fase</span>
                  <span className="text-sm font-medium px-2 py-0.5 rounded"
                    style={{ background: `${faseColor(client.faseTrattativa)}15`, color: faseColor(client.faseTrattativa) }}>
                    {faseLabel(client.faseTrattativa)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>Fonte</span>
                  <span className="text-sm capitalize" style={{ color: 'var(--text)' }}>{client.source}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>Contatti</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{clientContatti.length}</span>
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="panel p-5 md:col-span-2">
              <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Note</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{client.note}</p>
            </div>

            {/* Valore commerciale */}
            <div className="panel p-5 md:col-span-2">
              <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Valore Commerciale</p>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { label: 'Fatturato storico', value: client.fatturato, color: 'var(--green)' },
                  { label: 'Valore stimato', value: client.valoreStimato, color: 'var(--blue)' },
                  { label: 'Margine (est. 30%)', value: Math.round(client.fatturato * 0.3), color: 'var(--yellow)' },
                ].map(item => (
                  <div key={item.label} className="text-center p-4 rounded-xl" style={{ background: 'var(--panel2)' }}>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{item.label}</p>
                    <p className="text-xl font-bold mt-1" style={{ color: item.color }}>
                      {item.value > 0 ? `€${item.value.toLocaleString('it-IT')}` : '—'}
                    </p>
                  </div>
                ))}
              </div>
              {client.fatturato > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--muted)' }}>
                    <span>Fatturato vs Potenziale</span>
                    <span>{Math.round((client.fatturato / client.valoreStimato) * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (client.fatturato / client.valoreStimato) * 100)}%`,
                        background: 'var(--green)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'storico' && (
          <div className="space-y-3">
            {clientContatti.length === 0 ? (
              <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Nessun contatto registrato</p>
              </div>
            ) : (
              <div className="panel p-5">
                <div className="relative">
                  <div
                    className="absolute left-5 top-0 bottom-0 w-0.5"
                    style={{ background: 'var(--line)' }}
                  />
                  <div className="space-y-5">
                    {clientContatti.map((cnt, i) => {
                      const Icon = contattoIcon(cnt.tipo)
                      const color = contattoColor(cnt.tipo)
                      const autore = users.find(u => u.id === cnt.autore)
                      return (
                        <div key={cnt.id} className="flex gap-5 relative animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                          <div
                            className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: `${color}18`, border: `1.5px solid ${color}40` }}
                          >
                            <Icon className="w-4 h-4" style={{ color }} />
                          </div>
                          <div className="flex-1 pb-5" style={{ borderBottom: i < clientContatti.length - 1 ? '0' : 'none' }}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{cnt.titolo}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{cnt.note}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span
                                  className="text-xs px-2 py-0.5 rounded capitalize"
                                  style={{ background: `${color}15`, color }}
                                >
                                  {cnt.tipo}
                                </span>
                                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{formatDate(cnt.data)}</p>
                              </div>
                            </div>
                            {autore && (
                              <div className="flex items-center gap-2 mt-2">
                                <img src={autore.avatar} alt={autore.nome} className="w-5 h-5 rounded object-cover" />
                                <span className="text-xs" style={{ color: 'var(--muted)' }}>{autore.nome}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'eventi' && (
          <div className="space-y-3">
            {clientEvents.length === 0 ? (
              <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Nessun evento collegato</p>
              </div>
            ) : (
              clientEvents.map(evt => {
                const statoEvtColor = {
                  in_corso: 'var(--red2)',
                  pianificazione: 'var(--blue)',
                  completato: 'var(--green)',
                  bozza: 'var(--yellow)',
                }[evt.stato]
                const statoEvtLabel = {
                  in_corso: 'In Corso',
                  pianificazione: 'Pianificazione',
                  completato: 'Completato',
                  bozza: 'Bozza',
                }[evt.stato]
                return (
                  <div key={evt.id} className="panel p-5 flex items-start gap-4">
                    <div
                      className="w-1.5 self-stretch rounded-full flex-shrink-0"
                      style={{ background: statoEvtColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ background: `${statoEvtColor}15`, color: statoEvtColor }}
                        >
                          {statoEvtLabel}
                        </span>
                      </div>
                      <p className="font-semibold" style={{ color: 'var(--text)' }}>{evt.nome}</p>
                      <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{evt.location}</p>
                      <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(evt.dataInizio).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {evt.partecipanti} partecipanti
                        </span>
                        <span className="flex items-center gap-1" style={{ color: 'var(--green)' }}>
                          €{evt.budget.toLocaleString('it-IT')}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CRM() {
  const [selected, setSelected] = useState<Client | null>(null)
  const [filter, setFilter] = useState<FilterStato>('Tutti')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return clients.filter(c => {
      const matchFilter = filter === 'Tutti' || c.stato === filter
      const matchSearch =
        search === '' ||
        c.nome.toLowerCase().includes(search.toLowerCase()) ||
        c.settore.toLowerCase().includes(search.toLowerCase()) ||
        c.referente.toLowerCase().includes(search.toLowerCase()) ||
        c.citta.toLowerCase().includes(search.toLowerCase())
      return matchFilter && matchSearch
    })
  }, [filter, search])

  const totFatturato = clients.reduce((s, c) => s + c.fatturato, 0)
  const totPotenziale = clients.reduce((s, c) => s + c.valoreStimato, 0)
  const vipCount = clients.filter(c => c.stato === 'vip').length
  const prospectCount = clients.filter(c => c.stato === 'prospect').length

  if (selected) {
    return <ClientDetail client={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>CRM</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          {filtered.length} clienti visibili
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Clienti Totali', value: clients.length, display: String(clients.length), color: 'var(--text)' },
          { label: 'Fatturato Totale', value: totFatturato, display: `€${(totFatturato / 1000).toFixed(0)}K`, color: 'var(--green)' },
          { label: 'Potenziale Pipeline', value: totPotenziale, display: `€${(totPotenziale / 1000).toFixed(0)}K`, color: 'var(--blue)' },
          { label: 'VIP / Prospect', value: vipCount + prospectCount, display: `${vipCount} VIP · ${prospectCount} Prospect`, color: 'var(--yellow)' },
        ].map((kpi, i) => (
          <div key={i} className="panel p-4">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{kpi.label}</p>
            <p className="text-2xl font-bold mt-1 truncate" style={{ color: kpi.color }}>{kpi.display}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl flex-1 min-w-[200px]"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Cerca cliente, settore, referente..."
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
          className="flex gap-1 p-1 rounded-xl"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: filter === f.id
                  ? f.id === 'Tutti'
                    ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                    : `${f.color}18`
                  : 'transparent',
                color: filter === f.id
                  ? f.id === 'Tutti' ? 'white' : f.color
                  : 'var(--muted)',
                border: filter === f.id && f.id !== 'Tutti'
                  ? `1px solid ${f.color}35`
                  : '1px solid transparent',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="panel p-12 text-center" style={{ color: 'var(--muted)' }}>
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nessun cliente trovato</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((client, i) => {
            const clientContatti = contatti.filter(c => c.clienteId === client.id)
            const lastContact = clientContatti.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0]
            const clientEvents = events.filter(e => e.cliente === client.id)

            return (
              <div
                key={client.id}
                className="panel hover-card p-5 cursor-pointer animate-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => setSelected(client)}
              >
                <div className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    <img
                      src={client.avatar}
                      alt={client.nome}
                      className="w-14 h-14 rounded-xl object-cover"
                    />
                    {client.stato === 'vip' && (
                      <div
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--yellow)', boxShadow: '0 0 8px rgba(255,194,75,0.6)' }}
                      >
                        <Star className="w-3 h-3 text-black" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span
                            className="text-xs px-2 py-0.5 rounded font-medium"
                            style={{
                              background: `${statoColor(client.stato)}15`,
                              color: statoColor(client.stato),
                            }}
                          >
                            {statoLabel(client.stato)}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--muted)' }}>{client.settore}</span>
                        </div>
                        <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                          {client.nome}
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--muted)' }}>
                          {client.referente} · {client.citta}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <p className="text-lg font-bold" style={{ color: client.fatturato > 0 ? 'var(--green)' : 'var(--muted)' }}>
                          {client.fatturato > 0 ? `€${(client.fatturato / 1000).toFixed(0)}K` : '—'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--blue)' }}>
                          est. €{(client.valoreStimato / 1000).toFixed(0)}K
                        </p>
                        <ChevronRight className="w-4 h-4 mt-1" style={{ color: 'var(--muted)' }} />
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                      <div className="flex flex-wrap items-center gap-4">
                        <FasePipeline fase={client.faseTrattativa} />
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                          <Calendar className="w-3.5 h-3.5" />
                          {clientEvents.length} evento{clientEvents.length !== 1 ? 'i' : ''}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                          <MessageSquare className="w-3.5 h-3.5" />
                          {clientContatti.length} contatti
                        </div>
                      </div>
                      {lastContact && (
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                          <TrendingUp className="w-3.5 h-3.5" />
                          Ultimo: {formatDate(lastContact.data)}
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
