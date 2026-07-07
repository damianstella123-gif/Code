import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Search, Plus, FileText, Trash2, X, Upload,
  Download, Eye,
} from 'lucide-react'
import { fmtLong } from '@/lib/format'
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
  return fmtLong(d)
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
      <div>
        <div className="wire-masthead">
          <span className="wire-masthead-title">ARCHIVIO</span>
        </div>
        <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: '48px' }} className="text-center">
          <div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Wire masthead */}
      <div className="wire-masthead">
        <div>
          <span className="wire-masthead-title">ARCHIVIO</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginLeft: '12px' }}>
            {docs.length} DOCUMENTI
          </span>
        </div>
        <button onClick={() => { resetForm(); setFormOpen(true) }}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--red2)', cursor: 'pointer' }}
          className="flex items-center gap-2 transition-colors hover:opacity-70">
          <Plus className="w-3.5 h-3.5" /> Carica
        </button>
      </div>

      {/* Category stats */}
      <div className="wire-ticker" style={{ marginTop: '28px', marginBottom: '28px' }}>
        {KB_CATEGORIE.map(cat => {
          const count = docs.filter(d => d.categoria === cat).length
          return count > 0 ? (
            <button key={cat}
              onClick={() => setFilterCategoria(filterCategoria === cat ? '' : cat)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: filterCategoria === cat ? 'var(--red2)' : 'var(--muted)',
                cursor: 'pointer',
                fontWeight: filterCategoria === cat ? 600 : 400,
              }}
              className="transition-colors hover:opacity-70">
              <strong>{count}</strong> {cat.toUpperCase()}
            </button>
          ) : null
        })}
      </div>

      {/* Search + Category filter */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3 mb-6">
        <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14 }} className="flex items-center gap-2 px-4 py-2.5">
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca..."
            className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--text)' }} />
          {search && <button onClick={() => setSearch('')} className="p-0.5">
            <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
          </button>}
        </div>
        <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}
          className="px-4 py-2.5 rounded-3xl text-sm"
          style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <option value="">Tutte</option>
          {KB_CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Documents grouped by category */}
      {filtered.length === 0 ? (
        <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: '48px' }} className="text-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {docs.length === 0 ? 'Nessun documento' : 'Nessun risultato'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.label} style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--panel2)', borderBottom: '1px solid var(--line)' }}>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                  {group.label}
                </p>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  background: 'var(--red2)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: 4,
                }}>
                  {group.items.length}
                </span>
              </div>
              <div>
                {group.items.map((doc, idx) => (
                  <div key={doc.id} className="px-4 py-3 flex items-center gap-3 transition-all hover:bg-white/[0.02]"
                    style={{ borderBottom: idx < group.items.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${fileColor(doc.file_name)}15` }}>
                      <FileText className="w-4 h-4" style={{ color: fileColor(doc.file_name) }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{doc.nome}</p>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)' }} className="truncate">
                        {fileExt(doc.file_name)} — {formatSize(doc.file_size)} — {formatDate(doc.created_at)}
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
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>Carica Documento</h2>
              <button onClick={() => setFormOpen(false)} className="p-2 rounded-lg hover:bg-white/5">
                <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--muted)' }} className="mb-2 block">File *</label>
                <label className="flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer transition-all hover:bg-white/5"
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
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--muted)' }} className="mb-2 block">Nome *</label>
                <input value={formNome} onChange={e => setFormNome(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl text-sm"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--muted)' }} className="mb-2 block">Categoria *</label>
                <select value={formCategoria} onChange={e => setFormCategoria(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl text-sm"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                  {KB_CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--muted)' }} className="mb-2 block">Note</label>
                <input value={formNote} onChange={e => setFormNote(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl text-sm"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
              <button onClick={handleUpload} disabled={uploading}
                className="w-full py-3 rounded-2xl text-sm font-medium text-white disabled:opacity-50 transition-opacity"
                style={{ background: 'var(--red2)' }}>
                {uploading ? 'Caricamento...' : 'Carica'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
            <p className="text-sm font-medium mb-4" style={{ color: 'var(--text)' }}>Eliminare questo documento?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="flex-1 py-2.5 rounded-2xl text-sm"
                style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>Annulla</button>
              <button onClick={() => handleDelete(deletingId)} className="flex-1 py-2.5 rounded-2xl text-sm text-white"
                style={{ background: 'var(--red2)' }}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--panel-solid)', borderBottom: '1px solid var(--line)' }}>
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
