import { useState, useEffect, useRef } from 'react'
import {
  FileText, Upload, Download, Eye, Trash2, X, ExternalLink, Sparkles,
  RefreshCw, ChevronDown, ChevronUp, AlertCircle, Clock, CheckCircle2,
  Loader2, FolderPlus, Folder, FolderOpen, ChevronRight, Home, MoveRight,
  MoreVertical, Pencil
} from 'lucide-react'
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
  folder_id: string | null
}

interface DocumentFolder {
  id: string
  event_id: string
  nome: string
  parent_folder_id: string | null
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
    'application/vnd.ms-outlook': 'Email',
    'message/rfc822': 'Email',
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
  const [folders, setFolders] = useState<DocumentFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docCategoria, setDocCategoria] = useState('Materiali Evento')
  const [isParticipantData, setIsParticipantData] = useState(false)
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null)
  const [canManageDocs, setCanManageDocs] = useState(false)
  const [processingDocId, setProcessingDocId] = useState<string | null>(null)
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null)
  const { showToast } = useToast()

  // Folder navigation
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<DocumentFolder[]>([])
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [renameFolderName, setRenameFolderName] = useState('')
  const [movingDoc, setMovingDoc] = useState<string | null>(null)
  const [docMenuOpen, setDocMenuOpen] = useState<string | null>(null)
  const docMenuRef = useRef<HTMLDivElement>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [dragOverBreadcrumb, setDragOverBreadcrumb] = useState<string | null>(null)
  const [externalDragOver, setExternalDragOver] = useState(false)
  const externalDragCounter = useRef(0)

  async function loadFolders() {
    const { data } = await supabase
      .from('document_folders')
      .select('id, event_id, nome, parent_folder_id, created_at')
      .eq('event_id', event.id)
      .order('nome', { ascending: true })
    setFolders((data ?? []) as DocumentFolder[])
  }

  async function loadDocs() {
    const { data } = await supabase
      .from('documents')
      .select('id, nome, categoria, event_id, file_path, file_name, file_type, file_size, uploaded_by, created_at, analysis_status, analysis_error, analyzed_at, summary, analysis_metadata, folder_id')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
    setDocs((data ?? []) as EventDocument[])
    setLoading(false)
  }

  useEffect(() => {
    Promise.all([loadDocs(), loadFolders()])
  }, [event.id])

  useEffect(() => {
    if (isArchived) { setCanManageDocs(false); return }
    checkEventPermission(event.id, 'can_manage_documents').then(setCanManageDocs)
  }, [event.id, isArchived])

  // Build breadcrumb path when currentFolderId changes
  useEffect(() => {
    if (!currentFolderId) {
      setFolderPath([])
      return
    }
    const path: DocumentFolder[] = []
    let id: string | null = currentFolderId
    while (id) {
      const folder = folders.find(f => f.id === id)
      if (!folder) break
      path.unshift(folder)
      id = folder.parent_folder_id
    }
    setFolderPath(path)
  }, [currentFolderId, folders])

  // Close doc menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (docMenuRef.current && !docMenuRef.current.contains(e.target as Node)) {
        setDocMenuOpen(null)
      }
    }
    if (docMenuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [docMenuOpen])

  const currentFolders = folders.filter(f => f.parent_folder_id === currentFolderId)
  const currentDocs = docs.filter(d => d.folder_id === currentFolderId)

  async function handleCreateFolder() {
    const name = newFolderName.trim()
    if (!name) return
    const { error } = await supabase.from('document_folders').insert({
      event_id: event.id,
      nome: name,
      parent_folder_id: currentFolderId,
    })
    if (error) {
      if (error.message?.includes('unique') || error.code === '23505') {
        showToast('Esiste gia una cartella con questo nome qui', 'error')
      } else {
        showToast('Errore creazione cartella', 'error')
      }
      return
    }
    setNewFolderName('')
    setCreatingFolder(false)
    await loadFolders()
    showToast('Cartella creata', 'success')
  }

  async function handleRenameFolder() {
    const name = renameFolderName.trim()
    if (!name || !renamingFolder) return
    const { error } = await supabase
      .from('document_folders')
      .update({ nome: name })
      .eq('id', renamingFolder)
    if (error) {
      if (error.message?.includes('unique') || error.code === '23505') {
        showToast('Esiste gia una cartella con questo nome qui', 'error')
      } else {
        showToast('Errore rinomina cartella', 'error')
      }
      return
    }
    setRenamingFolder(null)
    setRenameFolderName('')
    await loadFolders()
    showToast('Cartella rinominata', 'success')
  }

  async function handleDeleteFolder(folderId: string) {
    const childDocs = docs.filter(d => d.folder_id === folderId)
    if (childDocs.length > 0) {
      await supabase
        .from('documents')
        .update({ folder_id: null })
        .in('id', childDocs.map(d => d.id))
    }
    const { error } = await supabase
      .from('document_folders')
      .delete()
      .eq('id', folderId)
    if (error) {
      showToast('Errore eliminazione cartella', 'error')
      return
    }
    setDeletingFolder(null)
    if (currentFolderId === folderId) {
      const deleted = folders.find(f => f.id === folderId)
      setCurrentFolderId(deleted?.parent_folder_id ?? null)
    }
    await Promise.all([loadFolders(), loadDocs()])
    showToast('Cartella eliminata', 'success')
  }

  async function handleMoveDoc(docId: string, targetFolderId: string | null) {
    const { error } = await supabase
      .from('documents')
      .update({ folder_id: targetFolderId })
      .eq('id', docId)
    if (error) {
      showToast('Errore spostamento documento', 'error')
      return
    }
    setMovingDoc(null)
    setDocMenuOpen(null)
    await loadDocs()
    showToast('Documento spostato', 'success')
  }

  async function handleUploadFiles(files: File[], targetFolderId: string | null) {
    if (files.length === 0) return
    setUploading(true)

    const uploadedDocIds: string[] = []

    for (const file of files) {
      const storagePath = `${event.id}/${Date.now()}_${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file)

      if (uploadError) {
        console.error('Upload error:', uploadError.message)
        showToast(`Impossibile caricare "${file.name}": ${uploadError.message}`, 'error')
        continue
      }

      const { data: { user } } = await supabase.auth.getUser()
      const { data: inserted } = await supabase.from('documents').insert({
        nome: file.name.replace(/\.[^/.]+$/, ''),
        categoria: docCategoria,
        event_id: event.id,
        file_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || 'application/octet-stream',
        uploaded_by: user?.id ?? '',
        is_participant_data: isParticipantData,
        folder_id: targetFolderId,
      }).select('id').maybeSingle()

      if (inserted?.id) uploadedDocIds.push(inserted.id)
      trackAction('document_uploaded', { eventId: event.id })
    }

    await loadDocs()
    setUploading(false)

    for (const docId of uploadedDocIds) {
      triggerAnalysis(docId)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    await handleUploadFiles(Array.from(files), currentFolderId)
    e.target.value = ''
  }

  function hasExternalFiles(e: React.DragEvent): boolean {
    return e.dataTransfer.types.includes('Files')
  }

  async function triggerAnalysis(docId: string) {
    setProcessingDocId(docId)
    const result = await analyzeDocument(docId, false)
    await loadDocs()
    if (result.success) {
      showToast(`Analisi completata: ${result.chunks_created ?? 0} contenuti indicizzati.`, 'success')
    } else if (result.status !== 'non_supportato') {
      showToast(result.error || 'Errore durante l\'analisi', 'error')
    }
    setProcessingDocId(null)
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
      {/* Header */}
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
            <button
              onClick={() => { setCreatingFolder(true); setNewFolderName('') }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'color-mix(in srgb, var(--blue) 12%, transparent)', color: 'var(--blue)', border: '1px solid var(--blue)' }}>
              <FolderPlus className="w-3.5 h-3.5" />
              Cartella
            </button>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
              style={{ background: 'color-mix(in srgb, var(--red2) 12%, transparent)', color: 'var(--red2)', border: '1px solid var(--red2)' }}>
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Caricamento...' : 'Carica'}
              <input type="file" className="hidden" onChange={handleUpload} multiple disabled={uploading}
                accept=".pdf,.xlsx,.xls,.pptx,.ppt,.docx,.jpg,.jpeg,.png,.msg,.eml" />
            </label>
          </div>
        )}
      </div>

      {/* Breadcrumbs */}
      {currentFolderId && (
        <nav className="flex items-center gap-1 text-xs flex-wrap" style={{ color: 'var(--muted)' }}>
          <button
            onClick={() => setCurrentFolderId(null)}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = hasExternalFiles(e) ? 'copy' : 'move' }}
            onDragEnter={() => setDragOverBreadcrumb('root')}
            onDragLeave={() => setDragOverBreadcrumb(null)}
            onDrop={async e => { e.preventDefault(); setDragOverBreadcrumb(null); const docId = e.dataTransfer.getData('text/document-id'); if (docId) { handleMoveDoc(docId, null); return }; const files = Array.from(e.dataTransfer.files || []); if (files.length > 0) await handleUploadFiles(files, null) }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[var(--line)] transition-colors"
            style={{ color: 'var(--text)', ...(dragOverBreadcrumb === 'root' ? { background: 'color-mix(in srgb, var(--blue) 18%, transparent)', outline: '1.5px dashed var(--blue)', outlineOffset: '-1px' } : {}) }}>
            <Home className="w-3.5 h-3.5" />
            Documenti
          </button>
          {folderPath.map((f, i) => (
            <span key={f.id} className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3" style={{ color: 'var(--muted)' }} />
              {i === folderPath.length - 1 ? (
                <span
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = hasExternalFiles(e) ? 'copy' : 'move' }}
                  onDragEnter={() => setDragOverBreadcrumb(f.id)}
                  onDragLeave={() => setDragOverBreadcrumb(null)}
                  onDrop={async e => { e.preventDefault(); setDragOverBreadcrumb(null); const docId = e.dataTransfer.getData('text/document-id'); if (docId) { handleMoveDoc(docId, f.id); return }; const files = Array.from(e.dataTransfer.files || []); if (files.length > 0) await handleUploadFiles(files, f.id) }}
                  className="px-1.5 py-0.5 font-medium rounded transition-colors"
                  style={{ color: 'var(--text)', ...(dragOverBreadcrumb === f.id ? { background: 'color-mix(in srgb, var(--blue) 18%, transparent)', outline: '1.5px dashed var(--blue)', outlineOffset: '-1px' } : {}) }}>{f.nome}</span>
              ) : (
                <button
                  onClick={() => setCurrentFolderId(f.id)}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = hasExternalFiles(e) ? 'copy' : 'move' }}
                  onDragEnter={() => setDragOverBreadcrumb(f.id)}
                  onDragLeave={() => setDragOverBreadcrumb(null)}
                  onDrop={async e => { e.preventDefault(); setDragOverBreadcrumb(null); const docId = e.dataTransfer.getData('text/document-id'); if (docId) { handleMoveDoc(docId, f.id); return }; const files = Array.from(e.dataTransfer.files || []); if (files.length > 0) await handleUploadFiles(files, f.id) }}
                  className="px-1.5 py-0.5 rounded hover:bg-[var(--line)] transition-colors"
                  style={{ color: 'var(--text)', ...(dragOverBreadcrumb === f.id ? { background: 'color-mix(in srgb, var(--blue) 18%, transparent)', outline: '1.5px dashed var(--blue)', outlineOffset: '-1px' } : {}) }}>
                  {f.nome}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Create folder inline */}
      {creatingFolder && (
        <div className="panel p-3 flex items-center gap-2">
          <FolderPlus className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--blue)' }} />
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setCreatingFolder(false) }}
            placeholder="Nome cartella..."
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: 'var(--text)' }}
          />
          <button onClick={handleCreateFolder}
            className="px-3 py-1 rounded-lg text-xs font-medium"
            style={{ background: 'var(--blue)', color: '#fff' }}>
            Crea
          </button>
          <button onClick={() => setCreatingFolder(false)}
            className="px-3 py-1 rounded-lg text-xs"
            style={{ background: 'var(--panel2)', color: 'var(--text)' }}>
            Annulla
          </button>
        </div>
      )}

      {/* Subfolders */}
      {currentFolders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {currentFolders.map(folder => {
            const folderDocCount = docs.filter(d => d.folder_id === folder.id).length
            const subFolderCount = folders.filter(f => f.parent_folder_id === folder.id).length
            const isRenaming = renamingFolder === folder.id

            return (
              <div
                key={folder.id}
                className="panel p-3 cursor-pointer group transition-all hover:ring-1"
                style={{ '--tw-ring-color': 'var(--blue)', ...(dragOverFolderId === folder.id ? { background: 'color-mix(in srgb, var(--blue) 14%, transparent)', borderColor: 'var(--blue)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--blue) 30%, transparent)' } : {}) } as React.CSSProperties}
                onClick={() => { if (!isRenaming) setCurrentFolderId(folder.id) }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = hasExternalFiles(e) ? 'copy' : 'move' }}
                onDragEnter={e => { e.preventDefault(); setDragOverFolderId(folder.id) }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolderId(null) }}
                onDrop={async e => { e.preventDefault(); setDragOverFolderId(null); const docId = e.dataTransfer.getData('text/document-id'); if (docId) { handleMoveDoc(docId, folder.id); return }; const files = Array.from(e.dataTransfer.files || []); if (files.length > 0) await handleUploadFiles(files, folder.id) }}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FolderOpen className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--blue)' }} />
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameFolderName}
                        onChange={e => setRenameFolderName(e.target.value)}
                        onKeyDown={e => {
                          e.stopPropagation()
                          if (e.key === 'Enter') handleRenameFolder()
                          if (e.key === 'Escape') setRenamingFolder(null)
                        }}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 text-sm bg-transparent outline-none font-medium min-w-0"
                        style={{ color: 'var(--text)', borderBottom: '1px solid var(--blue)' }}
                      />
                    ) : (
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                        {folder.nome}
                      </span>
                    )}
                  </div>
                  {canManageDocs && !isRenaming && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        title="Rinomina"
                        onClick={e => { e.stopPropagation(); setRenamingFolder(folder.id); setRenameFolderName(folder.nome) }}
                        className="p-1 rounded hover:bg-[var(--line)] transition-colors">
                        <Pencil className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                      </button>
                      <button
                        title="Elimina cartella"
                        onClick={e => { e.stopPropagation(); setDeletingFolder(folder.id) }}
                        className="p-1 rounded hover:bg-[var(--line)] transition-colors">
                        <Trash2 className="w-3 h-3" style={{ color: 'var(--red2)' }} />
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--muted)' }}>
                  {folderDocCount} {folderDocCount === 1 ? 'documento' : 'documenti'}
                  {subFolderCount > 0 && ` · ${subFolderCount} ${subFolderCount === 1 ? 'cartella' : 'cartelle'}`}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Documents in current folder */}
      <div
        className="relative"
        onDragOver={e => { if (hasExternalFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
        onDragEnter={e => { if (hasExternalFiles(e)) { externalDragCounter.current++; setExternalDragOver(true) } }}
        onDragLeave={e => { if (hasExternalFiles(e)) { externalDragCounter.current--; if (externalDragCounter.current <= 0) { externalDragCounter.current = 0; setExternalDragOver(false) } } }}
        onDrop={async e => { if (!hasExternalFiles(e)) return; e.preventDefault(); externalDragCounter.current = 0; setExternalDragOver(false); const files = Array.from(e.dataTransfer.files || []); if (files.length > 0) await handleUploadFiles(files, currentFolderId) }}
      >
        {externalDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl pointer-events-none" style={{ border: '2px dashed var(--blue)', background: 'color-mix(in srgb, var(--blue) 8%, transparent)' }}>
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8" style={{ color: 'var(--blue)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--blue)' }}>Rilascia qui per caricare</span>
            </div>
          </div>
        )}
      {currentDocs.length === 0 && currentFolders.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          {currentFolderId ? (
            <>
              <p>Questa cartella e vuota</p>
              <p className="text-xs mt-1">Carica documenti o trascina file qui</p>
            </>
          ) : (
            <>
              <p>Nessun documento caricato per questo evento</p>
              <p className="text-xs mt-1">Carica PDF, Excel, PowerPoint, Word o trascina file qui</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {currentDocs.map(doc => (
            <div
              key={doc.id}
              draggable
              onDragStart={e => { e.dataTransfer.setData('text/document-id', doc.id); e.dataTransfer.effectAllowed = 'move' }}
              style={{ cursor: 'grab' }}
            >
            <DocumentRow
              doc={doc}
              canManageDocs={canManageDocs}
              isArchived={isArchived}
              processingDocId={processingDocId}
              expandedSummary={expandedSummary}
              setExpandedSummary={setExpandedSummary}
              docMenuOpen={docMenuOpen}
              setDocMenuOpen={setDocMenuOpen}
              docMenuRef={docMenuRef}
              onPreview={handlePreview}
              onDownload={handleDownload}
              onDelete={setDeletingDoc}
              onAnalyze={handleAnalyze}
              onMove={setMovingDoc}
              getActionLabel={getActionLabel}
              formatAnalyzedAt={formatAnalyzedAt}
              OFFICE_EXTS={OFFICE_EXTS}
            />
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Delete folder modal */}
      {deletingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingFolder(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Eliminare cartella?</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              La cartella verra eliminata. I documenti al suo interno torneranno nella vista principale.
            </p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setDeletingFolder(null)}>Annulla</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={() => handleDeleteFolder(deletingFolder)}>Elimina</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete doc modal */}
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

      {/* Move doc modal */}
      {movingDoc && (
        <MoveDocModal
          doc={docs.find(d => d.id === movingDoc)!}
          folders={folders}
          onMove={targetId => handleMoveDoc(movingDoc, targetId)}
          onClose={() => setMovingDoc(null)}
        />
      )}

      {/* Preview overlay */}
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

function DocumentRow({
  doc, canManageDocs, isArchived, processingDocId, expandedSummary,
  setExpandedSummary, docMenuOpen, setDocMenuOpen, docMenuRef,
  onPreview, onDownload, onDelete, onAnalyze, onMove,
  getActionLabel, formatAnalyzedAt, OFFICE_EXTS,
}: {
  doc: EventDocument
  canManageDocs: boolean
  isArchived?: boolean
  processingDocId: string | null
  expandedSummary: string | null
  setExpandedSummary: (id: string | null) => void
  docMenuOpen: string | null
  setDocMenuOpen: (id: string | null) => void
  docMenuRef: React.RefObject<HTMLDivElement | null>
  onPreview: (doc: EventDocument) => void
  onDownload: (doc: EventDocument) => void
  onDelete: (id: string) => void
  onAnalyze: (id: string, force: boolean) => void
  onMove: (id: string) => void
  getActionLabel: (doc: EventDocument) => string
  formatAnalyzedAt: (d: string | null) => string
  OFFICE_EXTS: string[]
}) {
  const label = getFileLabel(doc.file_type)
  const labelColor = label === 'PDF' ? 'var(--red2)' : label === 'XLSX' || label === 'XLS' ? 'var(--green)' : label === 'PPTX' || label === 'PPT' ? '#e67e22' : label === 'DOCX' ? 'var(--blue)' : 'var(--muted)'
  const status = (doc.analysis_status || 'non_elaborato') as AnalysisStatus
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.non_elaborato
  const isProcessing = processingDocId === doc.id
  const isSummaryExpanded = expandedSummary === doc.id

  return (
    <div className="panel overflow-hidden">
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
                  onClick={() => onAnalyze(doc.id, false)}
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
                  onClick={() => onAnalyze(doc.id, true)}
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
                  onClick={() => onAnalyze(doc.id, true)}
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

          <button onClick={() => onPreview(doc)} title={getActionLabel(doc)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-[var(--line)]"
            style={{ color: 'var(--green)' }}>
            {OFFICE_EXTS.includes(doc.file_name.split('.').pop()?.toLowerCase() ?? '') ? (
              <ExternalLink className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{getActionLabel(doc)}</span>
          </button>
          <button onClick={() => onDownload(doc)} title="Scarica"
            className="p-2 rounded-lg transition-all hover:bg-[var(--line)]">
            <Download className="w-4 h-4" style={{ color: 'var(--blue)' }} />
          </button>
          {canManageDocs && (
            <div className="relative" ref={docMenuOpen === doc.id ? (docMenuRef as React.RefObject<HTMLDivElement>) : undefined}>
              <button
                onClick={() => setDocMenuOpen(docMenuOpen === doc.id ? null : doc.id)}
                className="p-2 rounded-lg transition-all hover:bg-[var(--line)]">
                <MoreVertical className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
              {docMenuOpen === doc.id && (
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[140px] rounded-lg py-1 shadow-lg"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
                  <button
                    onClick={() => { setDocMenuOpen(null); onMove(doc.id) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--line)] transition-colors"
                    style={{ color: 'var(--text)' }}>
                    <MoveRight className="w-3.5 h-3.5" style={{ color: 'var(--blue)' }} />
                    Sposta in cartella
                  </button>
                  <button
                    onClick={() => { setDocMenuOpen(null); onDelete(doc.id) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--line)] transition-colors"
                    style={{ color: 'var(--red2)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                    Elimina
                  </button>
                </div>
              )}
            </div>
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
}

function MoveDocModal({
  doc, folders, onMove, onClose,
}: {
  doc: EventDocument
  folders: DocumentFolder[]
  onMove: (targetFolderId: string | null) => void
  onClose: () => void
}) {
  function buildTree(parentId: string | null, depth: number): { folder: DocumentFolder; depth: number }[] {
    const children = folders
      .filter(f => f.parent_folder_id === parentId)
      .sort((a, b) => a.nome.localeCompare(b.nome))
    const result: { folder: DocumentFolder; depth: number }[] = []
    for (const child of children) {
      result.push({ folder: child, depth })
      result.push(...buildTree(child.id, depth + 1))
    }
    return result
  }

  const tree = buildTree(null, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="panel p-5 max-w-sm w-full mx-4 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Sposta documento</p>
        <p className="text-xs mb-3 truncate" style={{ color: 'var(--muted)' }}>{doc.nome || doc.file_name}</p>
        <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
          {/* Root option */}
          <button
            onClick={() => onMove(null)}
            disabled={doc.folder_id === null}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--line)] disabled:opacity-40"
            style={{ color: 'var(--text)' }}>
            <Home className="w-4 h-4" style={{ color: 'var(--muted)' }} />
            Vista principale (senza cartella)
          </button>
          {tree.map(({ folder, depth }) => (
            <button
              key={folder.id}
              onClick={() => onMove(folder.id)}
              disabled={doc.folder_id === folder.id}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--line)] disabled:opacity-40"
              style={{ color: 'var(--text)', paddingLeft: `${12 + depth * 16}px` }}>
              <Folder className="w-4 h-4" style={{ color: 'var(--blue)' }} />
              {folder.nome}
            </button>
          ))}
          {tree.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}>
              Nessuna cartella disponibile. Crea prima una cartella.
            </p>
          )}
        </div>
        <div className="flex justify-end mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}
