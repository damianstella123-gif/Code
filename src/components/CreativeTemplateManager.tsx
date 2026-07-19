import { useState, useEffect, useCallback } from 'react'
import {
  Upload, Download, FileText, Archive, AlertTriangle,
  Check, X, Loader2, Info,
} from 'lucide-react'
import { useToast } from '@/lib/toast'
import {
  fetchCreativeTemplates,
  checkCanManageGlobalCreative,
  inspectPptxTemplate,
  uploadCreativeTemplate,
  setCreativeTemplateActive,
  getCreativeTemplateDownloadUrl,
  type CreativeTemplate,
  type PptxInspectionResult,
} from '@/lib/creative-template-service'

interface Client { id: string; nome: string }

interface Props {
  clients: Client[]
}

export default function CreativeTemplateManager({ clients }: Props) {
  const { showToast } = useToast()
  const [templates, setTemplates] = useState<CreativeTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [tpls, manage] = await Promise.all([
        fetchCreativeTemplates(),
        checkCanManageGlobalCreative(),
      ])
      setTemplates(tpls)
      setCanManage(manage)
    } catch {
      showToast('Errore caricamento template')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { refresh() }, [refresh])

  async function handleToggleActive(tpl: CreativeTemplate) {
    const next = !tpl.is_active
    const { error } = await setCreativeTemplateActive(tpl.id, next)
    if (error) { showToast(error); return }
    setTemplates(prev => prev.map(t => t.id === tpl.id ? { ...t, is_active: next } : t))
    showToast(next ? 'Template riattivato' : 'Template archiviato')
  }

  async function handleDownload(tpl: CreativeTemplate) {
    const { url, error } = await getCreativeTemplateDownloadUrl(tpl.file_path)
    if (error || !url) { showToast(error ?? 'Errore download'); return }
    const a = document.createElement('a')
    a.href = url
    a.download = tpl.original_file_name
    a.click()
  }

  const activeTemplates = templates.filter(t => t.is_active)
  const archivedTemplates = templates.filter(t => !t.is_active)

  if (loading) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--muted)' }}>
        <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
        Caricamento template...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="panel p-4 rounded-xl flex-1">
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            <span className="font-bold">{activeTemplates.length} template attivi</span>
            {archivedTemplates.length > 0 && (
              <span style={{ color: 'var(--muted)' }}> &middot; {archivedTemplates.length} archiviati</span>
            )}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}
          >
            <Upload className="w-4 h-4" /> Carica template PPTX
          </button>
        )}
      </div>

      {/* Template Grid */}
      {templates.length === 0 ? (
        <div className="text-center py-12 panel rounded-2xl">
          <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--muted)' }} />
          <p style={{ color: 'var(--muted)' }}>Nessun template PPTX caricato.</p>
          {canManage && (
            <button onClick={() => setShowUpload(true)}
              className="mt-3 text-sm font-medium" style={{ color: 'var(--red2)' }}>
              Carica il primo template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(tpl => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              clients={clients}
              canManage={canManage}
              onToggleActive={() => handleToggleActive(tpl)}
              onDownload={() => handleDownload(tpl)}
            />
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          clients={clients}
          onClose={() => setShowUpload(false)}
          onUploaded={(tpl) => {
            setTemplates(prev => [tpl, ...prev])
            setShowUpload(false)
            showToast('Template caricato con successo')
          }}
        />
      )}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function TemplateCard({ template, clients, canManage, onToggleActive, onDownload }: {
  template: CreativeTemplate
  clients: Client[]
  canManage: boolean
  onToggleActive: () => void
  onDownload: () => void
}) {
  const client = clients.find(c => c.id === template.client_id)

  return (
    <div className="panel p-4 rounded-2xl space-y-3 hover:shadow-lg transition-all"
      style={{ opacity: template.is_active ? 1 : 0.7 }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase"
              style={{ background: '#4db4ff18', color: '#4db4ff', fontFamily: 'var(--font-mono)' }}>
              PPTX
            </span>
            {!template.is_active && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: '#ffc24b20', color: '#ffc24b' }}>
                Archiviato
              </span>
            )}
          </div>
          <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{template.name}</h3>
        </div>
      </div>

      {template.description && (
        <p className="text-xs line-clamp-2" style={{ color: 'var(--muted)', lineHeight: '1.5' }}>
          {template.description}
        </p>
      )}

      <div className="space-y-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        <div className="flex items-center gap-1.5">
          <FileText className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{template.original_file_name}</span>
          <span className="flex-shrink-0">({formatFileSize(template.file_size)})</span>
        </div>
        {client && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              {client.nome}
            </span>
          </div>
        )}
      </div>

      {/* Placeholder chips */}
      {template.placeholder_keys.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {template.placeholder_keys.slice(0, 6).map(key => (
            <span key={key} className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
              {`{{${key}}}`}
            </span>
          ))}
          {template.placeholder_keys.length > 6 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ color: 'var(--muted)' }}>
              +{template.placeholder_keys.length - 6}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
        <button onClick={onDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
          style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
          aria-label={`Scarica ${template.original_file_name}`}>
          <Download className="w-3.5 h-3.5" /> Scarica
        </button>
        {canManage && (
          <button onClick={onToggleActive}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 ml-auto"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: template.is_active ? '#ffc24b' : '#38d27d' }}
            aria-label={template.is_active ? 'Archivia template' : 'Riattiva template'}>
            {template.is_active ? <Archive className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            {template.is_active ? 'Archivia' : 'Riattiva'}
          </button>
        )}
      </div>
    </div>
  )
}

function UploadModal({ clients, onClose, onUploaded }: {
  clients: Client[]
  onClose: () => void
  onUploaded: (tpl: CreativeTemplate) => void
}) {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [inspection, setInspection] = useState<PptxInspectionResult | null>(null)
  const [confirmedNoPlaceholders, setConfirmedNoPlaceholders] = useState(false)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setInspection(null)
    setConfirmedNoPlaceholders(false)
    setInspecting(true)
    try {
      const result = await inspectPptxTemplate(f)
      setInspection(result)
    } catch {
      setInspection({ valid: false, placeholderKeys: [], warnings: [], error: 'Errore durante l\'analisi del file.' })
    } finally {
      setInspecting(false)
    }
  }

  const canSubmit = name.trim() &&
    file &&
    inspection?.valid &&
    !inspecting &&
    !uploading &&
    (inspection.placeholderKeys.length > 0 || confirmedNoPlaceholders)

  async function handleSubmit() {
    if (!canSubmit || !file) return
    setUploading(true)
    try {
      const { data, error } = await uploadCreativeTemplate({
        name: name.trim(),
        description: description.trim(),
        file,
        clientId: clientId || null,
      })
      if (error) { showToast(error); return }
      if (data) onUploaded(data)
    } catch {
      showToast('Errore imprevisto durante il caricamento.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Carica Template PPTX</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10"
            aria-label="Chiudi">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {/* Placeholder guidance */}
        <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#4db4ff' }} />
            <div className="text-xs space-y-1.5" style={{ color: 'var(--muted)', lineHeight: '1.6' }}>
              <p className="font-medium" style={{ color: 'var(--text)' }}>Guida ai placeholder</p>
              <p>I placeholder usano la sintassi <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg)', padding: '1px 4px', borderRadius: 4 }}>{`{{NOME_CAMPO}}`}</code></p>
              <p>Regole: lettere maiuscole, numeri e underscore. Mantieni il placeholder in un unico blocco di testo.</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {['CLIENT_NAME', 'EVENT_NAME', 'EVENT_DATE', 'LOCATION', 'BUDGET_TOTAL'].map(ex => (
                  <span key={ex} className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                    {`{{${ex}}}`}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Form fields */}
        <div className="space-y-3">
          <div>
            <label className="text-xs mb-1 block font-medium" style={{ color: 'var(--muted)' }}>Nome template *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Es: Proposta evento corporate"
              disabled={uploading}
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
          </div>
          <div>
            <label className="text-xs mb-1 block font-medium" style={{ color: 'var(--muted)' }}>Descrizione</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descrizione opzionale"
              disabled={uploading}
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
          </div>
          <div>
            <label className="text-xs mb-1 block font-medium" style={{ color: 'var(--muted)' }}>Cliente (opzionale)</label>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              disabled={uploading}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            >
              <option value="">Nessuno</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          {/* File picker */}
          <div>
            <label className="text-xs mb-1 block font-medium" style={{ color: 'var(--muted)' }}>File PPTX *</label>
            <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm cursor-pointer transition-all hover:opacity-80"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <Upload className="w-4 h-4" />
              {file ? file.name : 'Seleziona file .pptx'}
              <input
                type="file"
                accept=".pptx"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading || inspecting}
                aria-label="Seleziona file PPTX"
              />
            </label>
            {file && (
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                {formatFileSize(file.size)}
              </p>
            )}
          </div>
        </div>

        {/* Inspection state */}
        {inspecting && (
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#4db4ff' }} />
            <span className="text-sm" style={{ color: 'var(--text)' }}>Analisi del file in corso...</span>
          </div>
        )}

        {inspection && !inspecting && (
          <div className="space-y-3">
            {/* Error */}
            {!inspection.valid && (
              <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: '#f9706620' }}>
                <X className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#f97066' }} />
                <span className="text-sm" style={{ color: '#f97066' }}>{inspection.error}</span>
              </div>
            )}

            {/* Valid result */}
            {inspection.valid && (
              <>
                {/* Detected placeholders */}
                {inspection.placeholderKeys.length > 0 && (
                  <div className="p-3 rounded-xl" style={{ background: '#38d27d15', border: '1px solid #38d27d30' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="w-4 h-4" style={{ color: '#38d27d' }} />
                      <span className="text-sm font-medium" style={{ color: '#38d27d' }}>
                        {inspection.placeholderKeys.length} placeholder rilevati
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {inspection.placeholderKeys.map(key => (
                        <span key={key} className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                          {`{{${key}}}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {inspection.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 rounded-xl" style={{ background: '#ffc24b15', border: '1px solid #ffc24b30' }}>
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ffc24b' }} />
                    <span className="text-xs" style={{ color: 'var(--text)', lineHeight: '1.5' }}>{w}</span>
                  </div>
                ))}

                {/* Confirm no placeholders */}
                {inspection.placeholderKeys.length === 0 && (
                  <label className="flex items-start gap-2 p-3 rounded-xl cursor-pointer"
                    style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                    <input
                      type="checkbox"
                      checked={confirmedNoPlaceholders}
                      onChange={e => setConfirmedNoPlaceholders(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-xs" style={{ color: 'var(--text)', lineHeight: '1.5' }}>
                      Confermo di voler caricare questo template senza placeholder.
                      La generazione automatica non sostituira alcun contenuto.
                    </span>
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Caricamento...
            </span>
          ) : (
            'Carica Template'
          )}
        </button>
      </div>
    </div>
  )
}
