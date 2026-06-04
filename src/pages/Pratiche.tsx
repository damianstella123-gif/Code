import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FileText,
  Plus,
  Search,
  Filter,
  ChevronRight,
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Euro,
  User,
  Tag,
  Edit3,
  Trash2,
  FileCheck,
  FileClock,
  FileWarning,
  Briefcase,
  Shield,
  Receipt,
  ScrollText,
} from 'lucide-react'
import { type Pratica, type CategoriaPratica, type StatoPratica, type PrioritaPratica } from '@/data/pratiche'
import { events } from '@/data/events'
import { users } from '@/data/users'
import { loadUser } from '@/lib/auth'
import { daysLeft, fmtShort } from '@/lib/format'
import { cachePraticheSnapshot } from '@/lib/storage'
import { fetchPractices, upsertPractice, deletePractice as deletePracticeRemote } from '@/lib/practices-service'

const CATEGORIE: { id: CategoriaPratica; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'contratto', label: 'Contratto', icon: Briefcase, color: 'var(--red2)' },
  { id: 'preventivo', label: 'Preventivo', icon: Receipt, color: 'var(--blue)' },
  { id: 'permesso', label: 'Permesso', icon: Shield, color: 'var(--green)' },
  { id: 'assicurazione', label: 'Assicurazione', icon: Shield, color: 'var(--yellow)' },
  { id: 'fattura', label: 'Fattura', icon: Euro, color: 'var(--green)' },
  { id: 'documento', label: 'Documento', icon: ScrollText, color: 'var(--muted)' },
]

const STATI: { id: StatoPratica; label: string; color: string }[] = [
  { id: 'da_aprire', label: 'Da aprire', color: 'var(--muted)' },
  { id: 'in_lavorazione', label: 'In lavorazione', color: 'var(--blue)' },
  { id: 'in_attesa', label: 'In attesa', color: 'var(--yellow)' },
  { id: 'completata', label: 'Completata', color: 'var(--green)' },
]

function statoColor(stato: StatoPratica) {
  return STATI.find(s => s.id === stato)?.color ?? 'var(--muted)'
}
function statoLabel(stato: StatoPratica) {
  return STATI.find(s => s.id === stato)?.label ?? stato
}
function catLabel(cat: CategoriaPratica) {
  return CATEGORIE.find(c => c.id === cat)?.label ?? cat
}
function catColor(cat: CategoriaPratica) {
  return CATEGORIE.find(c => c.id === cat)?.color ?? 'var(--muted)'
}
function catIcon(cat: CategoriaPratica) {
  return CATEGORIE.find(c => c.id === cat)?.icon ?? FileText
}
function priColor(pri: PrioritaPratica) {
  if (pri === 'alta') return 'var(--red2)'
  if (pri === 'media') return 'var(--yellow)'
  return 'var(--muted)'
}

type View = 'list' | 'detail' | 'form'

export default function Pratiche() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [allPratiche, setAllPratiche] = useState<Pratica[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('list')
  const [editingId, setEditingId] = useState<string | null>(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategoria, setFilterCategoria] = useState<CategoriaPratica | 'tutti'>('tutti')
  const [filterStato, setFilterStato] = useState<StatoPratica | 'tutti'>('tutti')
  const [filterEvento, setFilterEvento] = useState<string | 'tutti'>('tutti')
  const [filterPriorita, setFilterPriorita] = useState<PrioritaPratica | 'tutti'>('tutti')
  const [showFilters, setShowFilters] = useState(false)

  // Pratiche: fonte di verita' Supabase. Nessun fallback mock.
  // La snapshot in localStorage resta solo per Calendario che la legge.
  useEffect(() => {
    let cancelled = false
    fetchPractices().then(remote => {
      if (cancelled) return
      setAllPratiche(remote)
      cachePraticheSnapshot(remote)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const targetId = searchParams.get('id')
    if (!targetId || allPratiche.length === 0) return
    const found = allPratiche.find(p => p.id === targetId)
    if (found) {
      setSelectedId(found.id)
      setView('detail')
      setSearchParams({}, { replace: true })
    }
  }, [allPratiche, searchParams, setSearchParams])

  const refreshPractices = useCallback(async () => {
    const remote = await fetchPractices()
    setAllPratiche(remote)
    cachePraticheSnapshot(remote)
    return remote
  }, [])

  const filtered = useMemo(() => {
    let list = allPratiche
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      list = list.filter(p =>
        p.titolo.toLowerCase().includes(q) ||
        p.controparte.toLowerCase().includes(q) ||
        p.descrizione.toLowerCase().includes(q)
      )
    }
    if (filterCategoria !== 'tutti') list = list.filter(p => p.categoria === filterCategoria)
    if (filterStato !== 'tutti') list = list.filter(p => p.stato === filterStato)
    if (filterEvento !== 'tutti') list = list.filter(p => p.eventoId === filterEvento)
    if (filterPriorita !== 'tutti') list = list.filter(p => p.priorita === filterPriorita)
    return list.sort((a, b) => new Date(b.creatoIl).getTime() - new Date(a.creatoIl).getTime())
  }, [allPratiche, searchTerm, filterCategoria, filterStato, filterEvento, filterPriorita])

  // Dashboard KPIs
  const kpi = useMemo(() => {
    const totali = allPratiche.length
    const inCorso = allPratiche.filter(p => p.stato === 'in_lavorazione' || p.stato === 'in_attesa').length
    const scadute = allPratiche.filter(p => p.stato !== 'completata' && daysLeft(p.scadenza) < 0).length
    const inRitardo = allPratiche.filter(p => p.stato !== 'completata' && daysLeft(p.scadenza) >= 0 && daysLeft(p.scadenza) <= 7).length
    const approvate = allPratiche.filter(p => p.stato === 'completata').length
    const importoTotale = allPratiche.filter(p => p.importo).reduce((s, p) => s + (p.importo ?? 0), 0)
    return { totali, inCorso, scadute, inRitardo, approvate, importoTotale }
  }, [allPratiche])

  const selected = selectedId ? allPratiche.find(p => p.id === selectedId) : null

  function openDetail(id: string) {
    setSelectedId(id)
    setView('detail')
  }

  function openNew() {
    setEditingId(null)
    setView('form')
  }

  function openEdit(id: string) {
    setEditingId(id)
    setView('form')
  }

  function deletePratica(id: string) {
    deletePracticeRemote(id).then(ok => {
      if (!ok) return
      refreshPractices()
      setView('list')
      setSelectedId(null)
    })
  }

  function savePratica(pratica: Pratica) {
    upsertPractice(pratica).then(saved => {
      const finalPratica = saved ?? pratica
      refreshPractices()
      setSelectedId(finalPratica.id)
      setView('detail')
    })
  }

  if (view === 'detail' && selected) {
    return <DetailView pratica={selected} onBack={() => setView('list')} onEdit={() => openEdit(selected.id)} onDelete={() => deletePratica(selected.id)} />
  }

  if (view === 'form') {
    const editing = editingId ? allPratiche.find(p => p.id === editingId) : undefined
    return <FormView pratica={editing} onSave={savePratica} onCancel={() => { setView(selectedId ? 'detail' : 'list') }} />
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Pratiche</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Gestione contratti, preventivi, permessi e documenti
          </p>
        </div>
        <button onClick={openNew}
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl">
          <Plus className="w-4 h-4" /> Nuova pratica
        </button>
      </div>

      {/* KPI dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiMini label="Totali" value={kpi.totali} icon={FileText} color="var(--blue)" />
        <KpiMini label="In corso" value={kpi.inCorso} icon={FileClock} color="var(--yellow)" />
        <KpiMini label="Scadute" value={kpi.scadute} icon={FileWarning} color="var(--red2)" pulse={kpi.scadute > 0} />
        <KpiMini label="In scadenza" value={kpi.inRitardo} icon={Clock} color="var(--yellow)" />
        <KpiMini label="Approvate" value={kpi.approvate} icon={FileCheck} color="var(--green)" />
        <KpiMini label="Valore" value={`€${(kpi.importoTotale / 1000).toFixed(0)}K`} icon={Euro} color="var(--green)" />
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Cerca pratiche..."
            className="input w-full pl-10 pr-4 py-2.5 text-sm rounded-xl"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all"
          style={{
            background: showFilters ? 'rgba(208,0,58,0.1)' : 'var(--panel)',
            border: `1px solid ${showFilters ? 'rgba(208,0,58,0.3)' : 'var(--line)'}`,
            color: showFilters ? 'var(--red2)' : 'var(--muted)',
          }}>
          <Filter className="w-4 h-4" /> Filtri
          {(filterCategoria !== 'tutti' || filterStato !== 'tutti' || filterEvento !== 'tutti' || filterPriorita !== 'tutti') && (
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--red2)' }} />
          )}
        </button>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="panel p-4 animate-fade-in grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Categoria</label>
            <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value as CategoriaPratica | 'tutti')}
              className="input w-full py-2 text-sm rounded-lg">
              <option value="tutti">Tutte</option>
              {CATEGORIE.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Stato</label>
            <select value={filterStato} onChange={e => setFilterStato(e.target.value as StatoPratica | 'tutti')}
              className="input w-full py-2 text-sm rounded-lg">
              <option value="tutti">Tutti</option>
              {STATI.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Evento</label>
            <select value={filterEvento} onChange={e => setFilterEvento(e.target.value)}
              className="input w-full py-2 text-sm rounded-lg">
              <option value="tutti">Tutti</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
              <option value="none">Senza evento</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Priorita</label>
            <select value={filterPriorita} onChange={e => setFilterPriorita(e.target.value as PrioritaPratica | 'tutti')}
              className="input w-full py-2 text-sm rounded-lg">
              <option value="tutti">Tutte</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="bassa">Bassa</option>
            </select>
          </div>
        </div>
      )}

      {/* Results count */}
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {filtered.length} pratich{filtered.length !== 1 ? 'e' : 'a'} trovate
      </p>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="panel p-12 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--muted)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessuna pratica trovata</p>
          </div>
        ) : (
          filtered.map((p, i) => {
            const dl = daysLeft(p.scadenza)
            const overdue = p.stato !== 'completata' && dl < 0
            const CatIcon = catIcon(p.categoria)
            const evento = p.eventoId ? events.find(e => e.id === p.eventoId) : null
            const resp = users.find(u => u.id === p.responsabileId)
            return (
              <button key={p.id}
                onClick={() => openDetail(p.id)}
                className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all hover:bg-white/5 group animate-fade-in"
                style={{
                  background: 'var(--panel)',
                  border: `1px solid ${overdue ? 'rgba(255,49,95,0.2)' : 'var(--line)'}`,
                  animationDelay: `${Math.min(i * 30, 300)}ms`,
                }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${catColor(p.categoria)}12` }}>
                  <CatIcon className="w-4 h-4" style={{ color: catColor(p.categoria) }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{p.titolo}</p>
                    {overdue && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--red2)' }} />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs" style={{ color: catColor(p.categoria) }}>{catLabel(p.categoria)}</span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>·</span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>{p.controparte}</span>
                    {evento && (
                      <>
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>·</span>
                        <span className="text-xs truncate" style={{ color: 'var(--muted)' }}>{evento.nome}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {resp && <img src={resp.avatar} alt="" className="w-6 h-6 rounded-lg object-cover hidden sm:block" />}
                  <span className="text-xs px-2 py-0.5 rounded"
                    style={{ background: `${statoColor(p.stato)}15`, color: statoColor(p.stato), border: `1px solid ${statoColor(p.stato)}25` }}>
                    {statoLabel(p.stato)}
                  </span>
                  <div className="text-right hidden md:block">
                    <p className="text-xs font-medium" style={{ color: overdue ? 'var(--red2)' : dl <= 7 ? 'var(--yellow)' : 'var(--muted)' }}>
                      {overdue ? `${Math.abs(dl)}g scad.` : dl === 0 ? 'Oggi' : `${dl}g`}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{fmtShort(p.scadenza)}</p>
                  </div>
                  {p.importo && (
                    <p className="text-xs font-semibold hidden lg:block" style={{ color: 'var(--text)' }}>
                      €{p.importo.toLocaleString('it-IT')}
                    </p>
                  )}
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--muted)' }} />
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── KPI Mini ─────────────────────────────────────────────────────────────────

function KpiMini({ label, value, icon: Icon, color, pulse }: {
  label: string; value: string | number; icon: React.ElementType; color: string; pulse?: boolean
}) {
  return (
    <div className="panel p-4 animate-fade-in relative">
      {pulse && <div className="absolute top-2 right-2 w-2 h-2 rounded-full animate-pulse" style={{ background: color }} />}
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
      </div>
      <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{value}</p>
    </div>
  )
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function DetailView({ pratica, onBack, onEdit, onDelete }: {
  pratica: Pratica; onBack: () => void; onEdit: () => void; onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const evento = pratica.eventoId ? events.find(e => e.id === pratica.eventoId) : null
  const resp = users.find(u => u.id === pratica.responsabileId)
  const dl = daysLeft(pratica.scadenza)
  const overdue = pratica.stato !== 'completata' && dl < 0
  const CatIcon = catIcon(pratica.categoria)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Back + actions */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
          style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="w-4 h-4" /> Torna alla lista
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all hover:bg-white/5"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            <Edit3 className="w-3.5 h-3.5" /> Modifica
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all hover:bg-red-500/10"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--red2)' }}>
              <Trash2 className="w-3.5 h-3.5" /> Elimina
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={onDelete}
                className="px-3 py-2 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(255,49,95,0.15)', color: 'var(--red2)', border: '1px solid rgba(255,49,95,0.3)' }}>
                Conferma
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
                Annulla
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="panel p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${catColor(pratica.categoria)}12` }}>
            <CatIcon className="w-6 h-6" style={{ color: catColor(pratica.categoria) }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{pratica.titolo}</h1>
              {overdue && (
                <span className="text-xs px-2 py-0.5 rounded animate-pulse"
                  style={{ background: 'rgba(255,49,95,0.1)', color: 'var(--red2)', border: '1px solid rgba(255,49,95,0.2)' }}>
                  SCADUTA
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{pratica.descrizione}</p>
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <InfoCard icon={Tag} label="Categoria" value={catLabel(pratica.categoria)} color={catColor(pratica.categoria)} />
        <InfoCard icon={CheckCircle} label="Stato" value={statoLabel(pratica.stato)} color={statoColor(pratica.stato)} />
        <InfoCard icon={AlertTriangle} label="Priorita" value={pratica.priorita.charAt(0).toUpperCase() + pratica.priorita.slice(1)} color={priColor(pratica.priorita)} />
        <InfoCard icon={Calendar} label="Creazione" value={fmtShort(pratica.creatoIl)} color="var(--muted)" />
        <InfoCard icon={Clock} label="Scadenza" value={`${fmtShort(pratica.scadenza)} (${overdue ? `${Math.abs(dl)}g fa` : dl === 0 ? 'Oggi' : `tra ${dl}g`})`} color={overdue ? 'var(--red2)' : dl <= 7 ? 'var(--yellow)' : 'var(--muted)'} />
        {pratica.importo && (
          <InfoCard icon={Euro} label="Importo" value={`€${pratica.importo.toLocaleString('it-IT')}`} color="var(--green)" />
        )}
        <InfoCard icon={User} label="Responsabile" value={resp?.nome ?? '—'} color="var(--blue)" avatar={resp?.avatar} />
        <InfoCard icon={Briefcase} label="Controparte" value={pratica.controparte} color="var(--text)" />
        {evento && (
          <InfoCard icon={Calendar} label="Evento" value={evento.nome} color="var(--red2)" />
        )}
      </div>

      {/* Note */}
      {pratica.note && (
        <div className="panel p-5">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Note</h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{pratica.note}</p>
        </div>
      )}
    </div>
  )
}

function InfoCard({ icon: Icon, label, value, color, avatar }: {
  icon: React.ElementType; label: string; value: string; color: string; avatar?: string
}) {
  return (
    <div className="panel p-4 flex items-center gap-3">
      {avatar ? (
        <img src={avatar} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}12` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{value}</p>
      </div>
    </div>
  )
}

// ─── Form View ────────────────────────────────────────────────────────────────

function FormView({ pratica, onSave, onCancel }: {
  pratica?: Pratica; onSave: (p: Pratica) => void; onCancel: () => void
}) {
  const [titolo, setTitolo] = useState(pratica?.titolo ?? '')
  const [descrizione, setDescrizione] = useState(pratica?.descrizione ?? '')
  const [categoria, setCategoria] = useState<CategoriaPratica>(pratica?.categoria ?? 'contratto')
  const [stato, setStato] = useState<StatoPratica>(pratica?.stato ?? 'da_aprire')
  const [priorita, setPriorita] = useState<PrioritaPratica>(pratica?.priorita ?? 'media')
  const [eventoId, setEventoId] = useState<string>(pratica?.eventoId ?? '')
  const [responsabileId, setResponsabileId] = useState<string>(pratica?.responsabileId ?? (loadUser()?.id ?? ''))
  const [scadenza, setScadenza] = useState(pratica?.scadenza ?? '')
  const [note, setNote] = useState(pratica?.note ?? '')
  const [importo, setImporto] = useState(pratica?.importo?.toString() ?? '')
  const [controparte, setControparte] = useState(pratica?.controparte ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!titolo.trim() || !scadenza || !controparte.trim()) return

    const result: Pratica = {
      id: pratica?.id ?? `prt_${Date.now()}`,
      titolo: titolo.trim(),
      descrizione: descrizione.trim(),
      eventoId: eventoId || null,
      responsabileId,
      categoria,
      stato,
      priorita,
      creatoIl: pratica?.creatoIl ?? new Date().toISOString().slice(0, 10),
      scadenza,
      note: note.trim(),
      importo: importo ? parseFloat(importo) : null,
      controparte: controparte.trim(),
    }
    onSave(result)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onCancel}
          className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
          style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="w-4 h-4" /> Annulla
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          {pratica ? 'Modifica pratica' : 'Nuova pratica'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="panel p-6 space-y-5">
        {/* Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Titolo *</label>
            <input type="text" value={titolo} onChange={e => setTitolo(e.target.value)}
              className="input w-full py-2.5 text-sm rounded-lg" placeholder="Titolo pratica" required />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Controparte *</label>
            <input type="text" value={controparte} onChange={e => setControparte(e.target.value)}
              className="input w-full py-2.5 text-sm rounded-lg" placeholder="Nome azienda/ente" required />
          </div>
        </div>

        {/* Row 2 */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Descrizione</label>
          <textarea value={descrizione} onChange={e => setDescrizione(e.target.value)}
            className="input w-full py-2.5 text-sm rounded-lg resize-none" rows={3} placeholder="Descrizione dettagliata..." />
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Categoria</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value as CategoriaPratica)}
              className="input w-full py-2.5 text-sm rounded-lg">
              {CATEGORIE.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Stato</label>
            <select value={stato} onChange={e => setStato(e.target.value as StatoPratica)}
              className="input w-full py-2.5 text-sm rounded-lg">
              {STATI.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Priorita</label>
            <select value={priorita} onChange={e => setPriorita(e.target.value as PrioritaPratica)}
              className="input w-full py-2.5 text-sm rounded-lg">
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="bassa">Bassa</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Importo (€)</label>
            <input type="number" value={importo} onChange={e => setImporto(e.target.value)}
              className="input w-full py-2.5 text-sm rounded-lg" placeholder="0" min="0" step="0.01" />
          </div>
        </div>

        {/* Row 4 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Evento collegato</label>
            <select value={eventoId} onChange={e => setEventoId(e.target.value)}
              className="input w-full py-2.5 text-sm rounded-lg">
              <option value="">Nessuno</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Responsabile</label>
            <select value={responsabileId} onChange={e => setResponsabileId(e.target.value)}
              className="input w-full py-2.5 text-sm rounded-lg">
              {users.filter(u => u.ruolo !== 'Fornitore').map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Scadenza *</label>
            <input type="date" value={scadenza} onChange={e => setScadenza(e.target.value)}
              className="input w-full py-2.5 text-sm rounded-lg" required />
          </div>
        </div>

        {/* Row 5 */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Note</label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            className="input w-full py-2.5 text-sm rounded-lg resize-none" rows={3} placeholder="Note aggiuntive..." />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          <button type="button" onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm transition-all hover:bg-white/5"
            style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
            Annulla
          </button>
          <button type="submit"
            className="btn-primary px-5 py-2.5 rounded-xl text-sm flex items-center gap-2">
            {pratica ? 'Salva modifiche' : 'Crea pratica'}
          </button>
        </div>
      </form>
    </div>
  )
}
