import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Search, Plus, FileText, Trash2, X, Upload,
  Download, FolderOpen, Building2, Eye,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Document {
  id: string
  nome: string
  categoria: string
  cliente_id: string | null
  event_id: string | null
  supplier_id: string | null
  scope: string
  file_path: string
  file_name: string
  file_size: number
  file_type: string
  uploaded_by: string
  note: string
  created_at: string
}

const KB_CATEGORIE = [
  'Carta Intestata',
  'Loghi Simmetria',
  'Template PPT',
  'Moduli',
  'Ordini Fornitori',
  'Procedure',
  'Manuali',
  'Materiali Istituzionali',
  'Varie',
]

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

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Archivio() {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [formNome, setFormNome] = useState('')
  const [formCategoria, setFormCategoria] = useState('Varie')
  const [formNote, setFormNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('scope', 'knowledge_base')
      .order('created_at', { ascending: false })
    setDocs((data ?? []) as Document[])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filtered = useMemo(() => {
    return docs.filter(d => {
      const q = search.toLowerCase()
      const matchSearch = !q || d.nome.toLowerCase().includes(q) || d.file_name.toLowerCase().includes(q) || d.categoria.toLowerCase().includes(q)
      const matchCat = !filterCategoria || d.categoria === filterCategoria
      return matchSearch && matchCat
    })
  }, [docs, search, filterCategoria])

  const grouped = useMemo(() => {
    const map: Record<string, Document[]> = {}
    for (const d of filtered) {
      if (!map[d.categoria]) map[d.categoria] = []
      map[d.categoria].push(d)
    }
    return KB_CATEGORIE
      .filter(cat => map[cat] && map[cat].length > 0)
      .map(cat => ({ label: cat, items: map[cat] }))
  }, [filtered])

  function resetForm() {
    setFormNome('')
    setFormCategoria('Varie')
    setFormNote('')
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
    const filePath = `kb/${crypto.randomUUID()}/${uploadFile.name}`
    const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, uploadFile)

    if (uploadError) {
      alert('Errore upload: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { error: dbError } = await supabase.from('documents').insert({
      nome: formNome.trim(),
      categoria: formCategoria,
      scope: 'knowledge_base',
      note: formNote.trim(),
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

  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  async function handlePreview(doc: Document) {
    const ext = doc.file_name.split('.').pop()?.toLowerCase() ?? ''
    const previewable = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp']
    if (!previewable.includes(ext)) {
      handleDownload(doc)
      return
    }
    const { data } = supabase.storage.from('documents').getPublicUrl(doc.file_path)
    if (data?.publicUrl) {
      setPreviewUrl(data.publicUrl)
      setPreviewDoc(doc)
    } else {
      const { data: blob, error } = await supabase.storage.from('documents').download(doc.file_path)
      if (error || !blob) { handleDownload(doc); return }
      setPreviewUrl(URL.createObjectURL(blob))
      setPreviewDoc(doc)
    }
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
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Knowledge Base</h1>
        <div className="panel p-12 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</div></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Knowledge Base</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Materiali aziendali, template, procedure e documenti istituzionali Simmetria
          </p>
        </div>
        <button onClick={() => { resetForm(); setFormOpen(true) }}
          className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 text-white"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
          <Plus className="w-4 h-4" /> Carica Documento
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {KB_CATEGORIE.slice(0, 4).map(cat => {
          const count = docs.filter(d => d.categoria === cat).length
          return (
            <button key={cat} onClick={() => setFilterCategoria(filterCategoria === cat ? '' : cat)}
              className="panel p-4 text-left transition-all hover:bg-white/[0.02]"
              style={{ border: filterCategoria === cat ? '1px solid var(--red2)' : '1px solid var(--line)' }}>
              <FolderOpen className="w-5 h-5 mb-2" style={{ color: 'var(--red2)' }} />
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{cat}</p>
              <p className="text-lg font-bold mt-1" style={{ color: 'var(--text)' }}>{count}</p>
            </button>
          )
        })}
      </div>

      {/* Search + Category filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="panel flex-1 min-w-[200px] flex items-center gap-2 px-3 py-2.5">
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca documenti..."
            className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--text)' }} />
          {search && <button onClick={() => setSearch('')} className="p-0.5"><X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} /></button>}
        </div>
        <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <option value="">Tutte le categorie</option>
          {KB_CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Documents grouped by category */}
      {filtered.length === 0 ? (
        <div className="panel p-12 text-center">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--muted)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {docs.length === 0 ? 'Nessun documento nella Knowledge Base' : 'Nessun risultato per i filtri applicati'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.label} className="panel overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--panel2)' }}>
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" style={{ color: 'var(--red2)' }} />
                  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{group.label}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>
                  {group.items.length}
                </span>
              </div>
              <div>
                {group.items.map(doc => (
                  <div key={doc.id} className="px-4 py-3 flex items-center gap-3 transition-all hover:bg-white/[0.02]"
                    style={{ borderBottom: '1px solid var(--line)' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${fileColor(doc.file_name)}15` }}>
                      <FileText className="w-4 h-4" style={{ color: fileColor(doc.file_name) }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{doc.nome}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                        {fileExt(doc.file_name)} - {formatSize(doc.file_size)} - {formatDate(doc.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handlePreview(doc)}
                        className="p-2 rounded-lg transition-all hover:bg-white/10" title="Apri">
                        <Eye className="w-4 h-4" style={{ color: 'var(--blue)' }} />
                      </button>
                      <button onClick={() => handleDownload(doc)}
                        className="p-2 rounded-lg transition-all hover:bg-white/10" title="Scarica">
                        <Download className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                      </button>
                      <button onClick={() => setDeletingId(doc.id)}
                        className="p-2 rounded-lg transition-all hover:bg-white/10" title="Elimina">
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Carica in Knowledge Base</h2>
              <button onClick={() => setFormOpen(false)} className="p-2 rounded-lg hover:bg-white/5">
                <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>File *</label>
                <label className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all hover:bg-white/5"
                  style={{ border: '2px dashed var(--line)' }}>
                  <Upload className="w-5 h-5" style={{ color: 'var(--muted)' }} />
                  <span className="text-sm truncate" style={{ color: uploadFile ? 'var(--text)' : 'var(--muted)' }}>
                    {uploadFile ? uploadFile.name : 'Seleziona file...'}
                  </span>
                  <input type="file" className="hidden" onChange={handleFileSelect}
                    accept={ALLOWED_EXTENSIONS.join(',')} />
                </label>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Nome documento *</label>
                <input value={formNome} onChange={e => setFormNome(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Categoria *</label>
                <select value={formCategoria} onChange={e => setFormCategoria(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                  {KB_CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Note</label>
                <input value={formNote} onChange={e => setFormNote(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
              <button onClick={handleUpload} disabled={uploading}
                className="w-full py-3 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
                {uploading ? 'Caricamento...' : 'Carica'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            <p className="text-sm font-medium mb-4" style={{ color: 'var(--text)' }}>Eliminare questo documento?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>Annulla</button>
              <button onClick={() => handleDelete(deletingId)} className="flex-1 py-2.5 rounded-xl text-sm text-white"
                style={{ background: 'var(--red2)' }}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{previewDoc.nome}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => handleDownload(previewDoc)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}>
                <Download className="w-3.5 h-3.5" /> Scarica
              </button>
              <button onClick={() => { setPreviewDoc(null); setPreviewUrl(null) }}
                className="p-2 rounded-lg hover:bg-white/10">
                <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            {(() => {
              const ext = previewDoc.file_name.split('.').pop()?.toLowerCase() ?? ''
              if (ext === 'pdf') {
                return <iframe src={previewUrl} className="w-full h-full rounded-lg" style={{ maxWidth: 900, minHeight: '80vh' }} />
              }
              if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                return <img src={previewUrl} alt={previewDoc.nome} className="max-w-full max-h-[85vh] rounded-lg object-contain" />
              }
              return <p className="text-sm" style={{ color: 'var(--muted)' }}>Anteprima non disponibile per questo formato.</p>
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
