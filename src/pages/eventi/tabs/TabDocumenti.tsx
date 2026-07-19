import { useState, useEffect } from 'react'
import { FileText, Upload, Download, Eye, Trash2, X, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackAction } from '@/lib/impact-tracker'
import { fmtLong } from '@/lib/format'
import { checkEventPermission } from '@/lib/event-members-service'
import type { Event } from '@/data/events'

interface EventDocument {
  id: string
  nome: string
  categoria: string
  event_id: string | null
  file_path: string
  file_name: string
  file_type: string
  file_size: number
  uploaded_by: string
  created_at: string
}

const DOC_CATEGORIE = [
  'Budget', 'Contratti', 'Preventivi', 'Hotel', 'Transfer', 'Ristoranti',
  'Fornitori', 'Rooming List', 'Presentazioni', 'Materiali Evento',
  'Foto / Video', 'Fatture', 'Varie',
]

function getFileLabel(mimeType: string): string {
  const FILE_ICONS: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.ms-excel': 'XLS',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'application/vnd.ms-powerpoint': 'PPT',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  }
  if (FILE_ICONS[mimeType]) return FILE_ICONS[mimeType]
  if (mimeType.startsWith('image/')) return 'IMG'
  return 'FILE'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export function TabDocumenti({ event, isArchived }: { event: Event; isArchived?: boolean }) {
  const [docs, setDocs] = useState<EventDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docCategoria, setDocCategoria] = useState('Materiali Evento')
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null)
  const [canManageDocs, setCanManageDocs] = useState(false)

  async function loadDocs() {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
    setDocs((data ?? []) as EventDocument[])
    setLoading(false)
  }

  useEffect(() => { loadDocs() }, [event.id])

  useEffect(() => {
    if (isArchived) { setCanManageDocs(false); return }
    checkEventPermission(event.id, 'can_manage_documents').then(setCanManageDocs)
  }, [event.id, isArchived])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)

    for (const file of Array.from(files)) {
      const storagePath = `${event.id}/${Date.now()}_${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file)

      if (uploadError) {
        console.error('Upload error:', uploadError.message)
        continue
      }

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('documents').insert({
        nome: file.name.replace(/\.[^/.]+$/, ''),
        categoria: docCategoria,
        event_id: event.id,
        file_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || 'application/octet-stream',
        uploaded_by: user?.id ?? '',
      })
      trackAction('document_uploaded', { eventId: event.id })
    }

    await loadDocs()
    setUploading(false)
    e.target.value = ''
  }

  async function handleDownload(doc: EventDocument) {
    const { data, error } = await supabase.storage
      .from('documents')
      .download(doc.file_path)
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

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewName, setPreviewName] = useState('')
  const [previewType, setPreviewType] = useState<'image' | 'pdf' | null>(null)

  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']
  const OFFICE_EXTS = ['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt']

  async function handlePreview(doc: EventDocument) {
    const ext = doc.file_name.split('.').pop()?.toLowerCase() ?? ''

    if (IMAGE_EXTS.includes(ext)) {
      const { data } = supabase.storage.from('documents').getPublicUrl(doc.file_path)
      if (!data?.publicUrl) return
      setPreviewUrl(data.publicUrl)
      setPreviewType('image')
      setPreviewName(doc.nome || doc.file_name)
    } else if (ext === 'pdf') {
      const { data } = supabase.storage.from('documents').getPublicUrl(doc.file_path)
      if (!data?.publicUrl) return
      setPreviewUrl(data.publicUrl)
      setPreviewType('pdf')
      setPreviewName(doc.nome || doc.file_name)
    } else if (OFFICE_EXTS.includes(ext)) {
      const { data } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.file_path, 300)
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      } else {
        handleDownload(doc)
      }
    } else {
      handleDownload(doc)
    }
  }

  function getActionLabel(doc: EventDocument): string {
    const ext = doc.file_name.split('.').pop()?.toLowerCase() ?? ''
    if (IMAGE_EXTS.includes(ext) || ext === 'pdf') return 'Anteprima'
    if (OFFICE_EXTS.includes(ext)) return 'Apri'
    return 'Scarica'
  }

  async function handleDelete(id: string) {
    const doc = docs.find(d => d.id === id)
    if (!doc) return
    await supabase.storage.from('documents').remove([doc.file_path])
    await supabase.from('documents').delete().eq('id', id)
    setDeletingDoc(null)
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento documenti...</div></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--muted)' }}>
          Documenti Evento ({docs.length})
        </p>
        {canManageDocs && (
          <div className="flex items-center gap-2">
            <select value={docCategoria} onChange={e => setDocCategoria(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs" style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              {DOC_CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
              style={{ background: 'color-mix(in srgb, var(--red2) 12%, transparent)', color: 'var(--red2)', border: '1px solid var(--red2)' }}>
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Caricamento...' : 'Carica'}
              <input type="file" className="hidden" onChange={handleUpload} multiple disabled={uploading}
                accept=".pdf,.xlsx,.xls,.pptx,.ppt,.docx,.jpg,.jpeg,.png" />
            </label>
          </div>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun documento caricato per questo evento</p>
          <p className="text-xs mt-1">Carica PDF, Excel, PowerPoint, Word o immagini</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const label = getFileLabel(doc.file_type)
            const labelColor = label === 'PDF' ? 'var(--red2)' : label === 'XLSX' || label === 'XLS' ? 'var(--green)' : label === 'PPTX' || label === 'PPT' ? '#e67e22' : label === 'DOCX' ? 'var(--blue)' : 'var(--muted)'
            return (
              <div key={doc.id} className="panel p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{ background: `${labelColor}15`, color: labelColor }}>
                  {label}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{doc.nome || doc.file_name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {doc.categoria} · {formatFileSize(doc.file_size)} · {fmtLong(doc.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => handlePreview(doc)} title={getActionLabel(doc)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-[var(--line)]"
                    style={{ color: 'var(--green)' }}>
                    {OFFICE_EXTS.includes(doc.file_name.split('.').pop()?.toLowerCase() ?? '') ? (
                      <ExternalLink className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    <span>{getActionLabel(doc)}</span>
                  </button>
                  <button onClick={() => handleDownload(doc)} title="Scarica"
                    className="p-2 rounded-lg transition-all hover:bg-[var(--line)]">
                    <Download className="w-4 h-4" style={{ color: 'var(--blue)' }} />
                  </button>
                  {canManageDocs && (
                    <button onClick={() => setDeletingDoc(doc.id)} title="Elimina"
                      className="p-2 rounded-lg transition-all hover:bg-[var(--line)]">
                      <Trash2 className="w-4 h-4" style={{ color: 'var(--red2)' }} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deletingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingDoc(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Eliminare documento?</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Il file verra eliminato definitivamente.</p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setDeletingDoc(null)}>Annulla</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={() => handleDelete(deletingDoc)}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{previewName}</p>
            <button onClick={() => { setPreviewUrl(null); setPreviewName(''); setPreviewType(null) }}
              className="p-2 rounded-lg hover:bg-[var(--line)]">
              <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            {previewType === 'image' && (
              <img src={previewUrl} alt={previewName} className="max-w-full max-h-[85vh] rounded-lg object-contain" />
            )}
            {previewType === 'pdf' && (
              <iframe src={previewUrl} style={{ width: '100%', height: '85vh', border: 'none', borderRadius: 12, maxWidth: 900 }} title={previewName} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
