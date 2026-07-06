import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, X, Pencil, Trash2, MessageCircle, Bug, Lightbulb, Sparkles, AlertTriangle } from 'lucide-react'
import { fetchFeedbacks, upsertFeedback, deleteFeedback, type Feedback } from '@/lib/feedback-service'
import { loadUser } from '@/lib/auth'
import { useRealtimeTable } from '@/lib/use-realtime'

type FilterStato = 'Tutti' | Feedback['stato']
type FilterCategoria = 'Tutte' | Feedback['categoria']

const STATI: Feedback['stato'][] = ['Nuovo', 'In valutazione', 'Pianificato', 'Risolto']
const CATEGORIE: Feedback['categoria'][] = ['Bug', 'Miglioramento', 'Funzione mancante', 'Idea']
const PRIORITA: Feedback['priorita'][] = ['Bassa', 'Media', 'Alta']

const MODULI = [
  'Dashboard', 'Eventi', 'CRM', 'Task', 'Calendario', 'Fornitori',
  'Amministrazione', 'Creative Studio', 'Social Studio', 'Presentazioni',
  'Archivio', 'Comunicazioni', 'Workflow', 'Pratiche', 'Utenti', 'Impostazioni', 'Altro',
]

function categoriaIcon(cat: Feedback['categoria']) {
  switch (cat) {
    case 'Bug': return Bug
    case 'Miglioramento': return Sparkles
    case 'Funzione mancante': return AlertTriangle
    case 'Idea': return Lightbulb
  }
}

function categoriaColor(cat: Feedback['categoria']) {
  switch (cat) {
    case 'Bug': return 'var(--red2)'
    case 'Miglioramento': return 'var(--blue)'
    case 'Funzione mancante': return 'var(--yellow)'
    case 'Idea': return 'var(--green)'
  }
}

function prioritaColor(p: Feedback['priorita']) {
  switch (p) {
    case 'Bassa': return 'var(--muted)'
    case 'Media': return 'var(--yellow)'
    case 'Alta': return 'var(--red2)'
  }
}

function statoColor(s: Feedback['stato']) {
  switch (s) {
    case 'Nuovo': return 'var(--blue)'
    case 'In valutazione': return 'var(--yellow)'
    case 'Pianificato': return '#f97316'
    case 'Risolto': return 'var(--green)'
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface FeedbackFormProps {
  initial: Feedback | null
  onClose: () => void
  onSaved: () => void
}

function FeedbackForm({ initial, onClose, onSaved }: FeedbackFormProps) {
  const isEdit = initial !== null
  const user = loadUser()
  const [titolo, setTitolo] = useState(initial?.titolo ?? '')
  const [descrizione, setDescrizione] = useState(initial?.descrizione ?? '')
  const [categoria, setCategoria] = useState<Feedback['categoria']>(initial?.categoria ?? 'Bug')
  const [priorita, setPriorita] = useState<Feedback['priorita']>(initial?.priorita ?? 'Media')
  const [modulo, setModulo] = useState(initial?.modulo ?? '')
  const [stato, setStato] = useState<Feedback['stato']>(initial?.stato ?? 'Nuovo')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!titolo.trim()) { setError('Il titolo e obbligatorio'); return }
    setError(null)
    setSaving(true)
    const payload = {
      id: initial?.id ?? crypto.randomUUID(),
      titolo: titolo.trim(),
      descrizione: descrizione.trim(),
      categoria,
      priorita,
      modulo,
      stato,
      autore_id: initial?.autore_id ?? user?.id ?? null,
      autore_nome: initial?.autore_nome ?? (user ? `${user.first_name} ${user.last_name}` : ''),
    }
    const saved = await upsertFeedback(payload)
    setSaving(false)
    if (!saved) { setError('Salvataggio non riuscito'); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg p-6 animate-fade-in max-h-[90vh] overflow-y-auto rounded-lg"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
              {isEdit ? 'Modifica feedback' : 'Nuovo feedback'}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              {isEdit ? 'Aggiorna il feedback' : 'Segnala un problema o suggerisci un miglioramento'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Titolo *</label>
            <input type="text" value={titolo} onChange={e => setTitolo(e.target.value)}
              placeholder="Descrivi brevemente..."
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Descrizione</label>
            <textarea value={descrizione} onChange={e => setDescrizione(e.target.value)} rows={4}
              placeholder="Dettagli, passi per riprodurre, contesto..."
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none resize-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value as Feedback['categoria'])}
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Priorita</label>
              <select value={priorita} onChange={e => setPriorita(e.target.value as Feedback['priorita'])}
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                {PRIORITA.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Modulo</label>
              <select value={modulo} onChange={e => setModulo(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">— Seleziona —</option>
                {MODULI.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {isEdit && (
              <div>
                <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Stato</label>
                <select value={stato} onChange={e => setStato(e.target.value as Feedback['stato'])}
                  className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                  {STATI.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          {error && <p className="text-xs" style={{ color: 'var(--red2)' }}>{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-white/5"
            style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
            Annulla
          </button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: 'var(--red2)', color: 'white' }}>
            {saving ? 'Salvataggio...' : isEdit ? 'Salva modifiche' : 'Invia feedback'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FeedbackBeta() {
  const [list, setList] = useState<Feedback[]>([])
  const [search, setSearch] = useState('')
  const [filterStato, setFilterStato] = useState<FilterStato>('Tutti')
  const [filterCategoria, setFilterCategoria] = useState<FilterCategoria>('Tutte')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Feedback | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Feedback | null>(null)

  const refresh = useCallback(() => {
    fetchFeedbacks().then(setList)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useRealtimeTable('feedback', refresh)

  const filtered = useMemo(() => {
    return list.filter(f => {
      if (filterStato !== 'Tutti' && f.stato !== filterStato) return false
      if (filterCategoria !== 'Tutte' && f.categoria !== filterCategoria) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!f.titolo.toLowerCase().includes(q) &&
            !f.descrizione.toLowerCase().includes(q) &&
            !f.autore_nome.toLowerCase().includes(q) &&
            !f.modulo.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [list, search, filterStato, filterCategoria])

  const counts = useMemo(() => ({
    totale: list.length,
    nuovo: list.filter(f => f.stato === 'Nuovo').length,
    valutazione: list.filter(f => f.stato === 'In valutazione').length,
    risolto: list.filter(f => f.stato === 'Risolto').length,
  }), [list])

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteFeedback(deleteTarget.id)
    setDeleteTarget(null)
    refresh()
  }

  return (
    <div className="wire-page">
      {/* Masthead */}
      <div className="wire-masthead">
        <div>
          <span className="wire-masthead-title">FEEDBACK</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginLeft: '12px' }}>
            {filtered.length} report
          </span>
        </div>
        <div className="wire-masthead-right">
          <span onClick={() => { setEditTarget(null); setShowForm(true) }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--red2)', cursor: 'pointer' }}>
            + NUOVO
          </span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="wire-ticker">
        <span>Totale <strong>{counts.totale}</strong></span>
        <span style={{ color: 'var(--blue)' }}>Nuovi <strong>{counts.nuovo}</strong></span>
        <span style={{ color: 'var(--yellow)' }}>In valutazione <strong>{counts.valutazione}</strong></span>
        <span style={{ color: 'var(--green)' }}>Risolti <strong>{counts.risolto}</strong></span>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg flex-1 min-w-[200px]"
          style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input type="text" placeholder="Cerca feedback..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }} />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>

        <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value as FilterCategoria)}
          className="px-3 py-2.5 rounded-lg text-sm"
          style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
          <option value="Tutte">Tutte le categorie</option>
          {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={filterStato} onChange={e => setFilterStato(e.target.value as FilterStato)}
          className="px-3 py-2.5 rounded-lg text-sm"
          style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
          <option value="Tutti">Tutti gli stati</option>
          {STATI.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--muted)' }}>
          <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nessun feedback trovato</p>
        </div>
      ) : (
        <div>
          {filtered.map((fb, i) => {
            const CatIcon = categoriaIcon(fb.categoria)
            const catColor = categoriaColor(fb.categoria)
            return (
              <div key={fb.id}
                className="border-b py-4 animate-fade-in"
                style={{ borderColor: 'var(--line)', animationDelay: `${i * 40}ms` }}>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${catColor}15` }}>
                    <CatIcon className="w-4 h-4" style={{ color: catColor }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded text-xs font-mono"
                        style={{ background: `${statoColor(fb.stato)}20`, color: statoColor(fb.stato) }}>
                        {fb.stato}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-mono"
                        style={{ background: `${prioritaColor(fb.priorita)}20`, color: prioritaColor(fb.priorita) }}>
                        {fb.priorita}
                      </span>
                      {fb.modulo && (
                        <span className="px-2 py-0.5 rounded text-xs font-mono"
                          style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                          {fb.modulo}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{fb.titolo}</h3>
                    {fb.descrizione && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--muted)' }}>{fb.descrizione}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs font-mono" style={{ color: 'var(--muted)' }}>
                      <span>{fb.autore_nome || 'Anonimo'}</span>
                      <span>{formatDate(fb.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setEditTarget(fb); setShowForm(true) }}
                      className="p-1.5 rounded-lg hover:bg-white/10 transition-all" title="Modifica">
                      <Pencil className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                    </button>
                    <button onClick={() => setDeleteTarget(fb)}
                      className="p-1.5 rounded-lg hover:bg-white/10 transition-all" title="Elimina">
                      <Trash2 className="w-4 h-4" style={{ color: 'var(--red2)' }} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <FeedbackForm
          initial={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(null) }}
          onSaved={refresh}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-sm p-6 rounded-lg animate-fade-in"
            style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Eliminare il feedback?</h3>
            <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
              Vuoi eliminare "{deleteTarget.titolo}"?
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium hover:bg-white/5"
                style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
                Annulla
              </button>
              <button onClick={handleDelete}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--red2)', color: 'white' }}>
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
