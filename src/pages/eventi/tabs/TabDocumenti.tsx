import { useState, useEffect } from 'react'
import { FileText, Upload, Download, Eye, Trash2, X, ExternalLink, Sparkles, RefreshCw, ChevronDown, ChevronUp, AlertCircle, Clock, CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackAction } from '@/lib/impact-tracker'
import { fmtLong } from '@/lib/format'
import { checkEventPermission } from '@/lib/event-members-service'
import { analyzeDocument } from '@/lib/document-analysis-service'
import { useToast } from '@/lib/toast'
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
  analysis_status: string
  analysis_error: string | null
  analyzed_at: string | null
  summary: string | null
  analysis_metadata: Record<string, unknown> | null
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

type AnalysisStatus = 'non_elaborato' | 'in_elaborazione' | 'elaborato' | 'errore' | 'non_supportato'

const STATUS_CONFIG: Record<AnalysisStatus, { label: string; color: string; bg: string }> = {
  non_elaborato: { label: 'Non analizzato', color: 'var(--muted)', bg: 'color-mix(in srgb, var(--muted) 12%, transparent)' },
  in_elaborazione: { label: 'Analisi in corso', color: 'var(--orange, #e67e22)', bg: 'color-mix(in srgb, var(--orange, #e67e22) 12%, transparent)' },
  elaborato: { label: 'Analizzato', color: 'var(--green)', bg: 'color-mix(in srgb, var(--green) 12%, transparent)' },
  errore: { label: 'Errore', color: 'var(--red2)', bg: 'color-mix(in srgb, var(--red2) 12%, transparent)' },
  non_supportato: { label: 'Non supportato', color: 'var(--muted)', bg: 'color-mix(in srgb, var(--muted) 8%, transparent)' },
}

export function TabDocumenti({ event, isArchived }: { event: Event; isArchived?: boolean }) {
  const [docs, setDocs] = useState<EventDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docCategoria, setDocCategoria] = useState('Materiali Evento')
  const [isParticipantData, setIsParticipantData] = useState(false)
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null)
  const [canManageDocs, setCanManageDocs] = useState(false)
  const [processingDocId, setProcessingDocId] = useState<string | null>(null)
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null)
  const { showToast } = useToast()

  async function loadDocs() {
    const { data } = await supabase
      .from('documents')
      .select('id, nome, categoria, event_id, file_path, file_name, file_type, file_size, uploaded_by, created_at, analysis_status, analysis_error, analyzed_at, summary, analysis_metadata')
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
        is_participant_data: isParticipantData,
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
      const { data } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 300)
      if (!data?.signedUrl) return
      setPreviewUrl(data.signedUrl)
      setPreviewType('image')
      setPreviewName(doc.nome || doc.file_name)
    } else if (ext === 'pdf') {
      const { data } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 300)
      if (!data?.signedUrl) return
      setPreviewUrl(data.signedUrl)
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

  async function handleAnalyze(docId: string, force: boolean) {
    if (processingDocId) return
    setProcessingDocId(docId)

    const result = await analyzeDocument(docId, force)
    await loadDocs()

    if (result.success) {
      showToast(`Analisi completata: ${result.chunks_created ?? 0} contenuti indicizzati.`, 'success')
    } else {
      showToast(result.error || 'Errore durante l\'analisi', 'error')
    }

    setProcessingDocId(null)
  }

  function formatAnalyzedAt(dateStr: string | null): string {
    if (!dateStr) return ''
    try {
      return new Intl.DateTimeFormat('it-IT', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(new Date(dateStr))
    } catch {
      return dateStr
    }
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
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>
              <input
                type="checkbox"
                checked={isParticipantData}
                onChange={e => setIsParticipantData(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              Contiene dati personali dei partecipanti (nome, contatti, allergie)
            </label>
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
            const status = (doc.analysis_status || 'non_elaborato') as AnalysisStatus
            const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.non_elaborato
            const isProcessing = processingDocId === doc.id
            const isSummaryExpanded = expandedSummary === doc.id

            return (
              <div key={doc.id} className="panel overflow-hidden">
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{ background: `${labelColor}15`, color: labelColor }}>
                    {label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{doc.nome || doc.file_name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        {doc.categoria} · {formatFileSize(doc.file_size)} · {fmtLong(doc.created_at)}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium"
                        style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        {status === 'in_elaborazione' && <Loader2 className="w-3 h-3 animate-spin" />}
                        {status === 'elaborato' && <CheckCircle2 className="w-3 h-3" />}
                        {status === 'errore' && <AlertCircle className="w-3 h-3" />}
                        {statusCfg.label}
                      </span>
                      {doc.analyzed_at && status === 'elaborato' && (
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
                          <Clock className="w-3 h-3" />
                          {formatAnalyzedAt(doc.analyzed_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Analysis action */}
                    {canManageDocs && !isArchived && (
                      <>
                        {status === 'non_elaborato' && (
                          <button
                            onClick={() => handleAnalyze(doc.id, false)}
                            disabled={isProcessing || !!processingDocId}
                            aria-label="Analizza documento con intelligenza artificiale"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-[var(--line)] disabled:opacity-40"
                            style={{ color: 'var(--green)' }}>
                            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">Analizza con Fly</span>
                          </button>
                        )}
                        {status === 'errore' && (
                          <button
                            onClick={() => handleAnalyze(doc.id, true)}
                            disabled={isProcessing || !!processingDocId}
                            aria-label="Riprova analisi documento"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-[var(--line)] disabled:opacity-40"
                            style={{ color: 'var(--orange, #e67e22)' }}>
                            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">Riprova analisi</span>
                          </button>
                        )}
                        {status === 'elaborato' && (
                          <button
                            onClick={() => handleAnalyze(doc.id, true)}
                            disabled={isProcessing || !!processingDocId}
                            aria-label="Rianalizza documento"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-[var(--line)] disabled:opacity-40"
                            style={{ color: 'var(--muted)' }}>
                            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">Rianalizza</span>
                          </button>
                        )}
                        {status === 'in_elaborazione' && (
                          <span className="flex items-center gap-1 px-2 py-1.5 text-xs" style={{ color: 'var(--orange, #e67e22)' }}>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span className="hidden sm:inline">In corso...</span>
                          </span>
                        )}
                      </>
                    )}

                    {/* Summary toggle */}
                    {doc.summary && (
                      <button
                        onClick={() => setExpandedSummary(isSummaryExpanded ? null : doc.id)}
                        aria-label={isSummaryExpanded ? 'Chiudi riassunto' : 'Mostra riassunto'}
                        className="p-2 rounded-lg transition-all hover:bg-[var(--line)]"
                        style={{ color: 'var(--green)' }}>
                        {isSummaryExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}

                    <button onClick={() => handlePreview(doc)} title={getActionLabel(doc)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-[var(--line)]"
                      style={{ color: 'var(--green)' }}>
                      {OFFICE_EXTS.includes(doc.file_name.split('.').pop()?.toLowerCase() ?? '') ? (
                        <ExternalLink className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">{getActionLabel(doc)}</span>
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

                {/* Error message */}
                {status === 'errore' && doc.analysis_error && (
                  <div className="px-4 pb-3">
                    <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'color-mix(in srgb, var(--red2) 8%, transparent)', color: 'var(--red2)' }}>
                      {doc.analysis_error}
                    </p>
                  </div>
                )}

                {/* Non supportato reason */}
                {status === 'non_supportato' && doc.analysis_error && (
                  <div className="px-4 pb-3">
                    <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'color-mix(in srgb, var(--muted) 8%, transparent)', color: 'var(--muted)' }}>
                      {doc.analysis_error}
                    </p>
                  </div>
                )}

                {/* Expandable summary */}
                {isSummaryExpanded && doc.summary && (
                  <div className="px-4 pb-4">
                    <div className="p-3 rounded-lg" style={{ background: 'color-mix(in srgb, var(--green) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 20%, transparent)' }}>
                      <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--green)' }}>Riassunto AI</p>
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
                        {doc.summary}
                      </p>
                    </div>
                  </div>
                )}
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
