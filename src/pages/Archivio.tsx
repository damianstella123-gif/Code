import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Search, Plus, FileText, Trash2, X, Upload,
  Download, Filter, ChevronDown,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Document {
  id: string
  nome: string
  categoria: string
  cliente_id: string | null
  event_id: string | null
  supplier_id: string | null
  file_path: string
  file_name: string
  file_size: number
  file_type: string
  uploaded_by: string
  created_at: string
}

interface SelectOption { id: string; label: string }

const CATEGORIE = ['Budget', 'Preventivi', 'Contratti', 'Presentazioni', 'Rooming List', 'Materiali Evento', 'Fatture', 'Altro']
const ALLOWED_EXTENSIONS = ['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.pptx', '.ppt', '.jpg', '.jpeg', '.png']

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

function fileExt(name: string) {
  return name.split('.').pop()?.toUpperCase() ?? ''
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

export default function Archivio() {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('')
  const [filterCliente, setFilterCliente] = useState('')
  const [filterEvento, setFilterEvento] = useState('')
  const [filterFornitore, setFilterFornitore] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [clients, setClients] = useState<SelectOption[]>([])
  const [events, setEvents] = useState<SelectOption[]>([])
  const [suppliers, setSuppliers] = useState<SelectOption[]>([])

  // Upload form
  const [formOpen, setFormOpen] = useState(false)
  const [formNome, setFormNome] = useState('')
  const [formCategoria, setFormCategoria] = useState('Altro')
  const [formCliente, setFormCliente] = useState('')
  const [formEvento, setFormEvento] = useState('')
  const [formFornitore, setFormFornitore] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [docsRes, clientsRes, eventsRes, suppRes] = await Promise.all([
      supabase.from('documents').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, nome'),
      supabase.from('events').select('id, nome'),
      supabase.from('suppliers').select('id, nome'),
    ])
    setDocs((docsRes.data ?? []) as Document[])
    setClients((clientsRes.data ?? []).map((c: { id: string; nome: string }) => ({ id: c.id, label: c.nome })))
    setEvents((eventsRes.data ?? []).map((e: { id: string; nome: string }) => ({ id: e.id, label: e.nome })))
    setSuppliers((suppRes.data ?? []).map((s: { id: string; nome: string }) => ({ id: s.id, label: s.nome })))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filtered = useMemo(() => {
    return docs.filter(d => {
      const q = search.toLowerCase()
      const matchSearch = !q || d.nome.toLowerCase().includes(q) || d.file_name.toLowerCase().includes(q) || d.categoria.toLowerCase().includes(q)
      const matchCat = !filterCategoria || d.categoria === filterCategoria
      const matchClient = !filterCliente || d.cliente_id === filterCliente
      const matchEvent = !filterEvento || d.event_id === filterEvento
      const matchSupplier = !filterFornitore || d.supplier_id === filterFornitore
      return matchSearch && matchCat && matchClient && matchEvent && matchSupplier
    })
  }, [docs, search, filterCategoria, filterCliente, filterEvento, filterFornitore])

  const activeFilters = [filterCategoria, filterCliente, filterEvento, filterFornitore].filter(Boolean).length

  function getLabel(id: string | null, list: SelectOption[]) {
    if (!id) return '-'
    return list.find(o => o.id === id)?.label ?? '-'
  }

  function resetForm() {
    setFormNome('')
    setFormCategoria('Altro')
    setFormCliente('')
    setFormEvento('')
    setFormFornitore('')
    setUploadFile(null)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert(`Formato non supportato. Formati ammessi: ${ALLOWED_EXTENSIONS.join(', ')}`)
      return
    }
    setUploadFile(file)
    if (!formNome) setFormNome(file.name.replace(/\.[^/.]+$/, ''))
  }

  async function handleUpload() {
    if (!uploadFile) return alert('Seleziona un file')
    if (!formNome.trim()) return alert('Inserisci un nome')

    setUploading(true)
    const filePath = `${crypto.randomUUID()}/${uploadFile.name}`
    const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, uploadFile)

    if (uploadError) {
      alert('Errore upload: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { error: dbError } = await supabase.from('documents').insert({
      nome: formNome.trim(),
      categoria: formCategoria,
      cliente_id: formCliente || null,
      event_id: formEvento || null,
      supplier_id: formFornitore || null,
      file_path: filePath,
      file_name: uploadFile.name,
      file_size: uploadFile.size,
      file_type: uploadFile.type,
      uploaded_by: '',
    })

    if (dbError) {
      alert('Errore salvataggio: ' + dbError.message)
      setUploading(false)
      return
    }

    setUploading(false)
    setFormOpen(false)
    resetForm()
    loadData()
  }

  async function handleDownload(doc: Document) {
    const { data, error } = await supabase.storage.from('documents').download(doc.file_path)
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

  async function handleDelete(id: string) {
    const doc = docs.find(d => d.id === id)
    if (!doc) return
    await supabase.storage.from('documents').remove([doc.file_path])
    await supabase.from('documents').delete().eq('id', id)
    setDeletingId(null)
    loadData()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Archivio Documenti</h1>
        <div className="panel p-12 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</div></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Archivio Documenti</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{docs.length} documenti caricati</p>
        </div>
        <button onClick={() => { resetForm(); setFormOpen(true) }}
          className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 text-white"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
          <Plus className="w-4 h-4" /> Carica Documento
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="panel flex-1 min-w-[200px] flex items-center gap-2 px-3 py-2.5">
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per nome, file, categoria..."
            className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--text)' }} />
          {search && <button onClick={() => setSearch('')} className="p-0.5"><X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} /></button>}
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className="px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-all"
          style={{ background: activeFilters > 0 ? 'rgba(208,0,58,0.1)' : 'var(--panel)', border: '1px solid var(--line)', color: activeFilters > 0 ? 'var(--red2)' : 'var(--text)' }}>
          <Filter className="w-4 h-4" />
          Filtri{activeFilters > 0 && ` (${activeFilters})`}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showFilters && (
        <div className="panel p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Categoria</label>
            <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="">Tutte</option>
              {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Cliente</label>
            <select value={filterCliente} onChange={e => setFilterCliente(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="">Tutti</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Evento</label>
            <select value={filterEvento} onChange={e => setFilterEvento(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="">Tutti</option>
              {events.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Fornitore</label>
            <select value={filterFornitore} onChange={e => setFilterFornitore(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="">Tutti</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          {activeFilters > 0 && (
            <button onClick={() => { setFilterCategoria(''); setFilterCliente(''); setFilterEvento(''); setFilterFornitore('') }}
              className="text-xs underline sm:col-span-2 md:col-span-4" style={{ color: 'var(--red2)' }}>
              Rimuovi filtri
            </button>
          )}
        </div>
      )}

      {/* Documents list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="panel p-12 text-center" style={{ color: 'var(--muted)' }}>
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nessun documento trovato</p>
            <p className="text-sm mt-1">Carica un documento o modifica i filtri.</p>
          </div>
        ) : (
          filtered.map(doc => (
            <div key={doc.id} className="panel p-4 flex items-center gap-4 group hover:border-opacity-60 transition-all">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                style={{ background: `${fileColor(doc.file_name)}15`, color: fileColor(doc.file_name) }}>
                {fileExt(doc.file_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{doc.nome}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>{doc.categoria}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap text-xs" style={{ color: 'var(--muted)' }}>
                  <span>{doc.file_name}</span>
                  <span>{formatSize(doc.file_size)}</span>
                  {doc.cliente_id && <span>Cliente: {getLabel(doc.cliente_id, clients)}</span>}
                  {doc.event_id && <span>Evento: {getLabel(doc.event_id, events)}</span>}
                  {doc.supplier_id && <span>Fornitore: {getLabel(doc.supplier_id, suppliers)}</span>}
                  <span>{new Date(doc.created_at).toLocaleDateString('it-IT')}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => handleDownload(doc)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-all" title="Scarica">
                  <Download className="w-4 h-4" style={{ color: 'var(--blue)' }} />
                </button>
                <button onClick={() => setDeletingId(doc.id)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-all" title="Elimina">
                  <Trash2 className="w-4 h-4" style={{ color: 'var(--red2)' }} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => { setFormOpen(false); resetForm() }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
            onClick={e => e.stopPropagation()}>
            <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--line)' }}>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Carica Documento</h3>
              <button onClick={() => { setFormOpen(false); resetForm() }} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* File */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>File *</label>
                {uploadFile ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--panel2)' }}>
                    <div className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold"
                      style={{ background: `${fileColor(uploadFile.name)}18`, color: fileColor(uploadFile.name) }}>
                      {fileExt(uploadFile.name)}
                    </div>
                    <span className="text-sm flex-1 truncate" style={{ color: 'var(--text)' }}>{uploadFile.name}</span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>{formatSize(uploadFile.size)}</span>
                    <button onClick={() => setUploadFile(null)} className="p-1 rounded hover:bg-white/10">
                      <X className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-5 rounded-lg cursor-pointer transition-all hover:bg-white/5"
                    style={{ border: '1px dashed var(--line)', color: 'var(--muted)' }}>
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">PDF, XLSX, DOCX, PPTX, JPG, PNG</span>
                    <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.jpg,.jpeg,.png"
                      onChange={handleFileSelect} />
                  </label>
                )}
              </div>

              {/* Nome + Categoria */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Nome documento *</label>
                  <input type="text" value={formNome} onChange={e => setFormNome(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Categoria</label>
                  <select value={formCategoria} onChange={e => setFormCategoria(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
                    {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Links */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Cliente</label>
                  <select value={formCliente} onChange={e => setFormCliente(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
                    <option value="">-- Nessuno --</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Evento</label>
                  <select value={formEvento} onChange={e => setFormEvento(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
                    <option value="">-- Nessuno --</option>
                    {events.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Fornitore</label>
                  <select value={formFornitore} onChange={e => setFormFornitore(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
                    <option value="">-- Nessuno --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="p-5 flex justify-end gap-3" style={{ borderTop: '1px solid var(--line)' }}>
              <button onClick={() => { setFormOpen(false); resetForm() }}
                className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
                Annulla
              </button>
              <button onClick={handleUpload} disabled={uploading || !uploadFile}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
                {uploading ? 'Caricamento...' : 'Carica'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingId(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Eliminare documento?</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Il file verra eliminato definitivamente dallo storage.
            </p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setDeletingId(null)}>Annulla</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={() => handleDelete(deletingId)}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
