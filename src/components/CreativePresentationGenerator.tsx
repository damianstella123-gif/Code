import { useState, useEffect, useCallback } from 'react'
import { FileDown, FileText, CheckCircle, AlertCircle, Clock, Sparkles, Loader2 } from 'lucide-react'
import { useToast } from '@/lib/toast'
import { fetchCreativeTemplates, type CreativeTemplate } from '@/lib/creative-template-service'
import {
  generateCreativePptx,
  fetchCreativeGenerations,
  getCreativeGenerationDownloadUrl,
  type CreativeGeneration,
  type CreativeGenerationStatus,
} from '@/lib/creative-generation-service'
import type { CreativeProject } from '@/lib/creative-service'
import { fmtLong } from '@/lib/format'

interface Props {
  projects: CreativeProject[]
  clients: { id: string; nome: string }[]
}

function humanizeKey(key: string): string {
  return key
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function statusBadge(status: CreativeGenerationStatus) {
  switch (status) {
    case 'completed':
      return { label: 'Completato', color: '#38d27d', Icon: CheckCircle }
    case 'generating':
      return { label: 'In generazione', color: '#4db4ff', Icon: Clock }
    case 'queued':
      return { label: 'In coda', color: '#ffc24b', Icon: Clock }
    case 'error':
      return { label: 'Errore', color: '#f97066', Icon: AlertCircle }
  }
}

export default function CreativePresentationGenerator({ projects, clients }: Props) {
  const { showToast } = useToast()

  const presentationProjects = projects.filter(p => p.type === 'presentazione')

  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templates, setTemplates] = useState<CreativeTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [generations, setGenerations] = useState<CreativeGeneration[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const selectedProject = presentationProjects.find(p => p.id === selectedProjectId) ?? null
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) ?? null
  const projectClient = clients.find(c => c.id === selectedProject?.client_id) ?? null

  const compatibleTemplates = templates.filter(t =>
    t.is_active &&
    t.template_type === 'pptx' &&
    (t.client_id === null || t.client_id === selectedProject?.client_id),
  )

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      const data = await fetchCreativeTemplates()
      setTemplates(data)
    } catch {
      showToast('Errore caricamento template')
    } finally {
      setTemplatesLoading(false)
    }
  }, [showToast])

  const loadHistory = useCallback(async (projectId: string) => {
    if (!projectId) return
    setHistoryLoading(true)
    try {
      const data = await fetchCreativeGenerations(projectId)
      setGenerations(data)
    } catch {
      showToast('Errore caricamento storico generazioni')
    } finally {
      setHistoryLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    if (selectedProjectId) {
      loadHistory(selectedProjectId)
    } else {
      setGenerations([])
    }
  }, [selectedProjectId, loadHistory])

  useEffect(() => {
    setSelectedTemplateId('')
    setValues({})
  }, [selectedProjectId])

  useEffect(() => {
    if (selectedTemplate) {
      const keys = selectedTemplate.placeholder_keys ?? []
      const next: Record<string, string> = {}
      for (const key of keys) {
        next[key] = values[key] ?? ''
      }
      setValues(next)
    } else {
      setValues({})
    }
    // Only reset when template changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId])

  const allFilled = selectedTemplate
    ? (selectedTemplate.placeholder_keys ?? []).every(k => (values[k] ?? '').trim().length > 0)
    : false

  const canGenerate = !!selectedProject && !!selectedTemplate && allFilled && !generating

  async function handleGenerate() {
    if (!canGenerate || !selectedProject || !selectedTemplate) return
    setGenerating(true)
    try {
      await generateCreativePptx(selectedProject.id, selectedTemplate.id, values)
      showToast('Presentazione generata con successo!')
      loadHistory(selectedProject.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore nella generazione.'
      showToast(msg)
    } finally {
      setGenerating(false)
    }
  }

  async function handleDownload(gen: CreativeGeneration) {
    if (!gen.output_path) return
    setDownloadingId(gen.id)
    try {
      const url = await getCreativeGenerationDownloadUrl(gen.output_path)
      window.open(url, '_blank')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore download.'
      showToast(msg)
    } finally {
      setDownloadingId(null)
    }
  }

  const templateNameById = (id: string) => templates.find(t => t.id === id)?.name ?? 'Template'

  return (
    <div className="panel p-5 rounded-2xl space-y-5">
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5" style={{ color: '#4db4ff' }} />
        <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>
          Generatore Presentazioni PPTX
        </h2>
      </div>

      {/* Project Selection */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted)' }}>
            Progetto Presentazione
          </label>
          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)', minHeight: 44 }}
          >
            <option value="">Seleziona progetto...</option>
            {presentationProjects.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>

        {/* Project Context */}
        {selectedProject && (
          <div
            className="flex flex-wrap gap-3 text-xs px-3 py-2 rounded-lg"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}
          >
            <span style={{ color: 'var(--text)' }}>
              Progetto: <strong>{selectedProject.title}</strong>
            </span>
            {projectClient && (
              <span style={{ color: 'var(--muted)' }}>
                Cliente: <strong style={{ color: 'var(--text)' }}>{projectClient.nome}</strong>
              </span>
            )}
          </div>
        )}

        {/* Template Selection */}
        {selectedProject && (
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted)' }}>
              Template PPTX
            </label>
            {templatesLoading ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Caricamento template...</p>
            ) : compatibleTemplates.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Nessun template PPTX compatibile disponibile.
              </p>
            ) : (
              <select
                value={selectedTemplateId}
                onChange={e => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)', minHeight: 44 }}
              >
                <option value="">Seleziona template...</option>
                {compatibleTemplates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.placeholder_keys.length} placeholder)
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Template Info */}
        {selectedTemplate && (
          <div
            className="text-xs px-3 py-2 rounded-lg"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--muted)' }}
          >
            Template: <strong style={{ color: 'var(--text)' }}>{selectedTemplate.name}</strong>
            {' \u2014 '}
            {selectedTemplate.placeholder_keys.length} placeholder richiesti
          </div>
        )}
      </div>

      {/* Placeholder Form */}
      {selectedTemplate && (selectedTemplate.placeholder_keys ?? []).length > 0 && (
        <div className="space-y-3">
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ background: '#4db4ff0d', border: '1px solid #4db4ff30', color: '#4db4ff' }}
          >
            <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span style={{ color: 'var(--text)', lineHeight: 1.5 }}>
              Questi contenuti potranno essere preparati automaticamente da Fly. Per ora puoi compilarli e verificarli manualmente.
            </span>
          </div>

          {(selectedTemplate.placeholder_keys ?? []).map(key => (
            <div key={key}>
              <label
                className="text-xs font-medium block mb-1"
                style={{ color: 'var(--muted)' }}
              >
                {humanizeKey(key)}
              </label>
              <textarea
                value={values[key] ?? ''}
                onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl text-sm resize-y"
                style={{
                  background: 'var(--bg)',
                  border: `1px solid ${(values[key] ?? '').trim() ? 'var(--line)' : '#f9706640'}`,
                  color: 'var(--text)',
                  minHeight: 44,
                }}
                placeholder={`Inserisci ${humanizeKey(key).toLowerCase()}...`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Generate Button */}
      {selectedTemplate && (
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{
            background: canGenerate
              ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
              : 'var(--panel2)',
            color: canGenerate ? 'white' : 'var(--muted)',
            minHeight: 44,
          }}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generazione in corso...
            </>
          ) : (
            <>
              <FileDown className="w-4 h-4" />
              Genera Presentazione PPTX
            </>
          )}
        </button>
      )}

      {/* Generation History */}
      {selectedProject && (
        <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          <h3 className="text-xs font-semibold" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase' }}>
            Storico Generazioni
          </h3>

          {historyLoading ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Caricamento...</p>
          ) : generations.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Nessuna generazione per questo progetto.</p>
          ) : (
            <div className="space-y-2">
              {generations.map(gen => {
                const badge = statusBadge(gen.generation_status)
                return (
                  <div
                    key={gen.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}
                  >
                    <badge.Icon className="w-4 h-4 flex-shrink-0" style={{ color: badge.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: 'var(--text)' }}>
                        {templateNameById(gen.template_id)}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span
                          className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{ background: `${badge.color}18`, color: badge.color, fontSize: 12 }}
                        >
                          {badge.label}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--muted)', fontSize: 12 }}>
                          {fmtLong(gen.created_at)}
                        </span>
                      </div>
                      {gen.generation_status === 'error' && gen.error_message && (
                        <p className="text-xs mt-1" style={{ color: '#f97066', fontSize: 12 }}>
                          {gen.error_message}
                        </p>
                      )}
                    </div>
                    {gen.generation_status === 'completed' && gen.output_path && (
                      <button
                        onClick={() => handleDownload(gen)}
                        disabled={downloadingId === gen.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 flex-shrink-0"
                        style={{ background: '#38d27d18', color: '#38d27d', minHeight: 44 }}
                      >
                        {downloadingId === gen.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5" />
                        )}
                        Scarica PPTX
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
