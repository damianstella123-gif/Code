import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FileText,
  Search,
  X,
  ArrowLeft,
  AlertTriangle,
  Euro,
  Edit3,
  Trash2,
  Briefcase,
  Shield,
  Receipt,
  ScrollText,
  Upload,
  Download,
  Paperclip,
  Eye,
  ExternalLink,
} from 'lucide-react'
import { type Pratica, type CategoriaPratica, type StatoPratica, type PrioritaPratica } from '@/data/pratiche'
import type { Event } from '@/data/events'
import { loadUser } from '@/lib/auth'
import { daysLeft, fmtShort, fmtLong, toISO } from '@/lib/format'
import { cachePraticheSnapshot } from '@/lib/storage'
import { fetchDossiers, upsertDossier, deleteDossier as deleteDossierRemote } from '@/lib/dossier-service'
import { fetchEvents } from '@/lib/events-service'
import { fetchAllProfiles, type Profile } from '@/lib/profiles'
import { useRealtimeTable } from '@/lib/use-realtime'
import { supabase } from '@/lib/supabase'

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

const ALLOWED_EXTENSIONS = ['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.pptx', '.ppt', '.jpg', '.jpeg', '.png']

interface DossierDocument {
  id: string
  nome: string
  categoria: string
  file_path: string
  file_name: string
  file_size: number
  file_type: string
  note: string
  created_at: string
  dossier_id: string | null
}

function fileColor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf': return '#ef4444'
    case 'xlsx': case 'xls': return '#22c55e'
    case 'docx': case 'doc': return '#3b82f6'
    case 'pptx': case 'ppt': return '#f97316'
    case 'png': case 'jpg': case 'jpeg': return '#a855f7'
    default: return 'var(--muted)'
  }
}
function fileExt(name: string) { return name.split('.').pop()?.toUpperCase() ?? '' }
function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

type View = 'list' | 'detail' | 'form'

export default function Dossier() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [allDossiers, setAllDossiers] = useState<Pratica[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [allEvents, setAllEvents] = useState<Event[]>([])
  const [allUsers, setAllUsers] = useState<Profile[]>([])

  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategoria, setFilterCategoria] = useState<CategoriaPratica | 'tutti'>('tutti')
  const [filterStato, setFilterStato] = useState<StatoPratica | 'tutti'>('tutti')
  const [filterEvento, setFilterEvento] = useState<string | 'tutti'>('tutti')
  const [filterPriorita, setFilterPriorita] = useState<PrioritaPratica | 'tutti'>('tutti')

  useEffect(() => {
    let cancelled = false
    fetchDossiers().then(remote => {
      if (cancelled) return
      setAllDossiers(remote)
      cachePraticheSnapshot(remote)
    })
    return () => { cancelled = true }
  }, [])

  useRealtimeTable('dossiers', () => {
    fetchDossiers().then(remote => { setAllDossiers(remote); cachePraticheSnapshot(remote) })
  })

  useEffect(() => {
    let cancelled = false
    fetchEvents().then(events => { if (!cancelled) setAllEvents(events) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAllProfiles().then(profiles => { if (!cancelled) setAllUsers(profiles) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const targetId = searchParams.get('id')
    if (!targetId || allDossiers.length === 0) return
    const found = allDossiers.find(p => p.id === targetId)
    if (found) {
      setSelectedId(found.id)
      setView('detail')
      setSearchParams({}, { replace: true })
    }
  }, [allDossiers, searchParams, setSearchParams])

  const refreshDossiers = useCallback(async () => {
    const remote = await fetchDossiers()
    setAllDossiers(remote)
    cachePraticheSnapshot(remote)
    return remote
  }, [])

  const filtered = useMemo(() => {
    let list = allDossiers
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
  }, [allDossiers, searchTerm, filterCategoria, filterStato, filterEvento, filterPriorita])

  const kpi = useMemo(() => {
    const aperti = allDossiers.filter(p => p.stato === 'da_aprire' || p.stato === 'in_attesa').length
    const inCorso = allDossiers.filter(p => p.stato === 'in_lavorazione').length
    const chiusi = allDossiers.filter(p => p.stato === 'completata').length
    return { aperti, inCorso, chiusi }
  }, [allDossiers])

  const selected = selectedId ? allDossiers.find(p => p.id === selectedId) : null

  function openDetail(id: string) { setSelectedId(id); setView('detail') }
  function openNew() { setEditingId(null); setView('form') }
  function openEdit(id: string) { setEditingId(id); setView('form') }

  function deleteDossier(id: string) {
    deleteDossierRemote(id).then(ok => {
      if (!ok) return
      refreshDossiers()
      setView('list')
      setSelectedId(null)
    })
  }

  function saveDossier(pratica: Pratica) {
    upsertDossier(pratica).then(saved => {
      const final = saved ?? pratica
      refreshDossiers()
      setSelectedId(final.id)
      setView('detail')
    })
  }

  if (view === 'detail' && selected) {
    return <DetailView dossier={selected} onBack={() => setView('list')} onEdit={() => openEdit(selected.id)} onDelete={() => deleteDossier(selected.id)} allEvents={allEvents} allUsers={allUsers} />
  }

  if (view === 'form') {
    const editing = editingId ? allDossiers.find(p => p.id === editingId) : undefined
    return <FormView pratica={editing} onSave={saveDossier} onCancel={() => { setView(selectedId ? 'detail' : 'list') }} allEvents={allEvents} allUsers={allUsers} />
  }

  return (
    <div>
      <div className="wire-masthead">
        <div>
          <span className="wire-masthead-title" style={{ fontFamily: 'var(--font-mono)' }}>DOSSIER</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginLeft: '12px' }}>
            {filtered.length}
          </span>
        </div>
        <div className="wire-masthead-right">
          <span onClick={openNew}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--red2)', cursor: 'pointer' }}>
            + NUOVO
          </span>
        </div>
      </div>

      <div className="wire-ticker">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          <strong>{kpi.aperti}</strong> aperti
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--blue)' }}>
          <strong>{kpi.inCorso}</strong> in corso
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--green)' }}>
          <strong>{kpi.chiusi}</strong> chiusi
        </span>
      </div>

      <div className="space-y-4 animate-fade-in" style={{ marginTop: '20px' }}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Cerca dossier..."
            className="w-full pl-10 pr-9 py-2.5 text-sm rounded-lg focus:outline-none"
            style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </button>
          )}
          {!searchTerm && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Usa Fly ↑ per domande complesse</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Categoria</label>
            <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value as CategoriaPratica | 'tutti')}
              className="w-full py-2 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              <option value="tutti">Tutte</option>
              {CATEGORIE.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stato</label>
            <select value={filterStato} onChange={e => setFilterStato(e.target.value as StatoPratica | 'tutti')}
              className="w-full py-2 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              <option value="tutti">Tutti</option>
              {STATI.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Evento</label>
            <select value={filterEvento} onChange={e => setFilterEvento(e.target.value)}
              className="w-full py-2 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              <option value="tutti">Tutti</option>
              {allEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
              <option value="none">Senza evento</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priorita</label>
            <select value={filterPriorita} onChange={e => setFilterPriorita(e.target.value as PrioritaPratica | 'tutti')}
              className="w-full py-2 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              <option value="tutti">Tutte</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="bassa">Bassa</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-2" style={{ marginTop: '20px' }}>
        {filtered.length === 0 ? (
          <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 48, textAlign: 'center' }}>
            <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--muted)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>Nessun dossier trovato</p>
          </div>
        ) : (
          <div className="wire-list-container">
          {filtered.map((p, i) => {
            const dl = daysLeft(p.scadenza)
            const overdue = p.stato !== 'completata' && dl < 0
            const CatIcon = catIcon(p.categoria)
            const evento = p.eventoId ? allEvents.find(e => e.id === p.eventoId) : null
            return (
              <button key={p.id}
                onClick={() => openDetail(p.id)}
                className="wire-card-flat w-full flex items-center gap-3 text-left transition-all hover:bg-white/5 group animate-fade-in"
                style={{
                  animationDelay: `${Math.min(i * 30, 300)}ms`,
                }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${catColor(p.categoria)}12` }}>
                  <CatIcon className="w-4 h-4" style={{ color: catColor(p.categoria) }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{p.titolo}</p>
                    {overdue && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--red2)' }} />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: catColor(p.categoria) }}>{catLabel(p.categoria)}</span>
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
                  {p.responsabileId && <span className="text-xs px-2 py-0.5 rounded font-medium hidden sm:block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', background: 'rgba(77,180,255,0.15)', color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{(() => { const u = allUsers.find(x => x.id === p.responsabileId); return u ? `${u.first_name} ${u.last_name}`.trim() : p.responsabileId })()}</span>}
                  <span className="text-xs px-2 py-0.5 rounded" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', background: `${statoColor(p.stato)}15`, color: statoColor(p.stato), border: `1px solid ${statoColor(p.stato)}25` }}>
                    {statoLabel(p.stato)}
                  </span>
                  <div className="text-right hidden md:block">
                    <p className="text-xs font-medium" style={{ fontFamily: 'var(--font-mono)', color: overdue ? 'var(--red2)' : dl <= 7 ? 'var(--yellow)' : 'var(--muted)' }}>
                      {overdue ? `${Math.abs(dl)}G SCAD.` : dl === 0 ? 'OGGI' : `${dl}G`}
                    </p>
                    <p className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{fmtShort(p.scadenza)}</p>
                  </div>
                  {p.importo && (
                    <p className="text-xs font-semibold hidden lg:block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                      €{p.importo.toLocaleString('it-IT')}
                    </p>
                  )}
                </div>
              </button>
            )
          })
          }
          </div>
        )}
      </div>

      <UnassignedDocumentsSection />
    </div>
  )
}

// ─── Unassigned Documents (Archivio Generale) ────────────────────────────────

function UnassignedDocumentsSection() {
  const [docs, setDocs] = useState<DossierDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    supabase
      .from('documents')
      .select('id, nome, categoria, file_path, file_name, file_size, file_type, note, created_at, dossier_id')
      .eq('scope', 'knowledge_base')
      .is('dossier_id', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setDocs((data ?? []) as DossierDocument[])
        setLoading(false)
      })
  }, [])

  if (loading || docs.length === 0) return null

  return (
    <div style={{ marginTop: 32 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        <FileText className="w-3.5 h-3.5" />
        ARCHIVIO GENERALE — {docs.length} file non assegnati
        <span style={{ marginLeft: 'auto' }}>{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-1 animate-fade-in">
          {docs.map(doc => (
            <DocRow key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Document Row ──────────────────────────────────────────────────────────────

function DocRow({ doc, onRemove }: { doc: DossierDocument; onRemove?: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewType, setPreviewType] = useState<'image' | 'pdf' | null>(null)

  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
  const OFFICE_EXTS = ['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt']

  async function handleDownload() {
    const { data, error } = await supabase.storage.from('documents').download(doc.file_path)
    if (error || !data) return
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.file_name
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handlePreview() {
    const ext = doc.file_name.split('.').pop()?.toLowerCase() ?? ''

    if (IMAGE_EXTS.includes(ext)) {
      const { data } = supabase.storage.from('documents').getPublicUrl(doc.file_path)
      if (!data?.publicUrl) return
      setPreviewUrl(data.publicUrl)
      setPreviewType('image')
    } else if (ext === 'pdf') {
      const { data } = supabase.storage.from('documents').getPublicUrl(doc.file_path)
      if (!data?.publicUrl) return
      setPreviewUrl(data.publicUrl)
      setPreviewType('pdf')
    } else if (OFFICE_EXTS.includes(ext)) {
      const { data } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.file_path, 300)
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      } else {
        handleDownload()
      }
    } else {
      handleDownload()
    }
  }

  const ext = doc.file_name.split('.').pop()?.toLowerCase() ?? ''
  const isOffice = OFFICE_EXTS.includes(ext)

  return (
    <>
      <div className="flex items-center gap-3 p-2.5 rounded-lg transition-all hover:bg-white/[0.02]"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${fileColor(doc.file_name)}15` }}>
          <FileText className="w-3.5 h-3.5" style={{ color: fileColor(doc.file_name) }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{doc.nome}</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)' }} className="truncate">
            {fileExt(doc.file_name)} — {formatSize(doc.file_size)} — {fmtLong(doc.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={handlePreview} className="p-1.5 rounded-lg transition-all hover:bg-white/10"
            title={isOffice ? 'Apri' : 'Anteprima'}>
            {isOffice ? (
              <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
            ) : (
              <Eye className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
            )}
          </button>
          <button onClick={handleDownload} className="p-1.5 rounded-lg transition-all hover:bg-white/10" title="Scarica">
            <Download className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
          </button>
          {onRemove && (
            <button onClick={onRemove} className="p-1.5 rounded-lg transition-all hover:bg-white/10" title="Rimuovi dal dossier">
              <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>
      </div>
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{doc.nome || doc.file_name}</p>
            <button onClick={() => { setPreviewUrl(null); setPreviewType(null) }}
              className="p-2 rounded-lg hover:bg-[var(--line)]">
              <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            {previewType === 'image' && (
              <img src={previewUrl} alt={doc.nome} className="max-w-full max-h-[85vh] rounded-lg object-contain" />
            )}
            {previewType === 'pdf' && (
              <iframe src={previewUrl} style={{ width: '100%', height: '85vh', border: 'none', borderRadius: 12, maxWidth: 900 }} title={doc.nome} />
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ─── Detail View ─────────────────────────────────────────────────────────────

function DetailView({ dossier, onBack, onEdit, onDelete, allEvents, allUsers }: {
  dossier: Pratica; onBack: () => void; onEdit: () => void; onDelete: () => void; allEvents: Event[]; allUsers: Profile[]
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [docs, setDocs] = useState<DossierDocument[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const evento = dossier.eventoId ? allEvents.find(e => e.id === dossier.eventoId) : null
  const responsabile = dossier.responsabileId ? allUsers.find(u => u.id === dossier.responsabileId) : null
  const responsabileLabel = responsabile ? `${responsabile.first_name} ${responsabile.last_name}`.trim() : (dossier.responsabileId ?? '—')
  const dl = daysLeft(dossier.scadenza)
  const overdue = dossier.stato !== 'completata' && dl < 0
  const CatIcon = catIcon(dossier.categoria)

  const loadDocs = useCallback(() => {
    supabase
      .from('documents')
      .select('id, nome, categoria, file_path, file_name, file_size, file_type, note, created_at, dossier_id')
      .eq('dossier_id', dossier.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setDocs((data ?? []) as DossierDocument[]) })
  }, [dossier.id])

  useEffect(() => { loadDocs() }, [loadDocs])

  async function handleUploadFile(file: File) {
    setUploading(true)
    const filePath = `dossier/${dossier.id}/${crypto.randomUUID()}/${file.name}`
    const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file)
    if (uploadError) {
      alert('Errore upload: ' + uploadError.message)
      setUploading(false)
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('documents').insert({
      nome: file.name.replace(/\.[^/.]+$/, ''),
      categoria: 'Varie',
      scope: 'knowledge_base',
      note: '',
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      uploaded_by: user?.id ?? '',
      dossier_id: dossier.id,
    })
    setUploading(false)
    loadDocs()
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert(`Formato non supportato. Formati ammessi: ${ALLOWED_EXTENSIONS.join(', ')}`)
      return
    }
    handleUploadFile(file)
    e.target.value = ''
  }

  async function handleRemoveDoc(docId: string) {
    await supabase.from('documents').update({ dossier_id: null }).eq('id', docId)
    loadDocs()
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
          style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
          <ArrowLeft className="w-4 h-4" /> TORNA ALLA LISTA
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all hover:bg-white/5"
            style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Edit3 className="w-3.5 h-3.5" /> MODIFICA
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all hover:bg-red-500/10"
              style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', color: 'var(--red2)', fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Trash2 className="w-3.5 h-3.5" /> ELIMINA
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={onDelete}
                className="px-3 py-2 rounded-lg text-xs font-medium"
                style={{ background: 'rgba(255,49,95,0.15)', color: 'var(--red2)', border: '1px solid rgba(255,49,95,0.3)', fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                CONFERMA
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ANNULLA
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 24 }}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${catColor(dossier.categoria)}12` }}>
            <CatIcon className="w-6 h-6" style={{ color: catColor(dossier.categoria) }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{dossier.titolo}</h1>
              {overdue && (
                <span className="text-xs px-2 py-0.5 rounded animate-pulse"
                  style={{ background: 'rgba(255,49,95,0.1)', color: 'var(--red2)', border: '1px solid rgba(255,49,95,0.2)', fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  SCADUTA
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{dossier.descrizione}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <InfoCard label="Categoria" value={catLabel(dossier.categoria)} color={catColor(dossier.categoria)} />
        <InfoCard label="Stato" value={statoLabel(dossier.stato)} color={statoColor(dossier.stato)} />
        <InfoCard label="Priorita" value={(dossier.priorita || '').charAt(0).toUpperCase() + (dossier.priorita || '').slice(1)} color={priColor(dossier.priorita)} />
        <InfoCard label="Creazione" value={fmtShort(dossier.creatoIl)} color="var(--muted)" />
        <InfoCard label="Scadenza" value={`${fmtShort(dossier.scadenza)} (${overdue ? `${Math.abs(dl)}g fa` : dl === 0 ? 'Oggi' : `tra ${dl}g`})`} color={overdue ? 'var(--red2)' : dl <= 7 ? 'var(--yellow)' : 'var(--muted)'} />
        {dossier.importo && <InfoCard label="Importo" value={`€${dossier.importo.toLocaleString('it-IT')}`} color="var(--green)" />}
        <InfoCard label="Responsabile" value={responsabileLabel} color="var(--blue)" />
        <InfoCard label="Controparte" value={dossier.controparte} color="var(--text)" />
        {evento && <InfoCard label="Evento" value={evento.nome} color="var(--red2)" />}
      </div>

      {dossier.note && (
        <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>NOTE</h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{dossier.note}</p>
        </div>
      )}

      {/* Documents Section */}
      <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            <Paperclip className="w-3.5 h-3.5" /> DOCUMENTI ALLEGATI ({docs.length})
          </h3>
          <label
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all hover:bg-white/5 cursor-pointer"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--blue)', fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'CARICAMENTO...' : 'ALLEGA FILE'}
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept={ALLOWED_EXTENSIONS.join(',')} disabled={uploading} />
          </label>
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
            Nessun documento allegato
          </p>
        ) : (
          <div className="space-y-1.5">
            {docs.map(doc => (
              <DocRow key={doc.id} doc={doc} onRemove={() => handleRemoveDoc(doc.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
      <p className="text-xs" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</p>
      <p className="text-sm font-medium" style={{ color }}>{value}</p>
    </div>
  )
}

// ─── Form View ────────────────────────────────────────────────────────────────

function FormView({ pratica, onSave, onCancel, allEvents, allUsers }: {
  pratica?: Pratica; onSave: (p: Pratica) => void; onCancel: () => void; allEvents: Event[]; allUsers: Profile[]
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
      creatoIl: pratica?.creatoIl ?? toISO(new Date()),
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
          style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
          <ArrowLeft className="w-4 h-4" /> ANNULLA
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
          {pratica ? 'Modifica dossier' : 'Nuovo dossier'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 24 }} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Titolo *</label>
            <input type="text" value={titolo} onChange={e => setTitolo(e.target.value)}
              className="w-full py-2.5 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              placeholder="Titolo dossier" required />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Controparte *</label>
            <input type="text" value={controparte} onChange={e => setControparte(e.target.value)}
              className="w-full py-2.5 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              placeholder="Nome azienda/ente" required />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Descrizione</label>
          <textarea value={descrizione} onChange={e => setDescrizione(e.target.value)}
            className="w-full py-2.5 text-sm rounded-lg resize-none focus:outline-none"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            rows={3} placeholder="Descrizione dettagliata..." />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Categoria</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value as CategoriaPratica)}
              className="w-full py-2.5 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              {CATEGORIE.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stato</label>
            <select value={stato} onChange={e => setStato(e.target.value as StatoPratica)}
              className="w-full py-2.5 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              {STATI.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priorita</label>
            <select value={priorita} onChange={e => setPriorita(e.target.value as PrioritaPratica)}
              className="w-full py-2.5 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="bassa">Bassa</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Importo</label>
            <input type="number" value={importo} onChange={e => setImporto(e.target.value)}
              className="w-full py-2.5 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              placeholder="0" min="0" step="0.01" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Evento collegato</label>
            <select value={eventoId} onChange={e => setEventoId(e.target.value)}
              className="w-full py-2.5 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="">Nessuno</option>
              {allEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Responsabile</label>
            <select value={responsabileId} onChange={e => setResponsabileId(e.target.value)}
              className="w-full py-2.5 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="">Seleziona responsabile</option>
              {allUsers.filter(u => u.is_active).map(u => (
                <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scadenza *</label>
            <input type="date" value={scadenza} onChange={e => setScadenza(e.target.value)}
              className="w-full py-2.5 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              required />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Note</label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            className="w-full py-2.5 text-sm rounded-lg resize-none focus:outline-none"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            rows={3} placeholder="Note aggiuntive..." />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          <button type="button" onClick={onCancel}
            className="px-4 py-2.5 rounded-lg text-sm transition-all hover:bg-white/5"
            style={{ color: 'var(--muted)', border: '1px solid var(--line)', fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ANNULLA
          </button>
          <button type="submit"
            className="btn-primary px-5 py-2.5 rounded-lg text-sm font-medium"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {pratica ? 'SALVA MODIFICHE' : 'CREA DOSSIER'}
          </button>
        </div>
      </form>
    </div>
  )
}
