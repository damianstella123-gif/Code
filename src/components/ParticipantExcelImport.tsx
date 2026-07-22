import { useState, useCallback, useRef, useEffect } from 'react'
import { useToast } from '@/lib/toast'
import {
  fetchImportableParticipantDocuments,
  parseParticipantDocument,
  autoMapParticipantHeaders,
  buildParticipantPreview,
  checkParticipantImportDuplicates,
  importParticipantRows,
  type ParticipantImportDocument,
  type ParticipantImportSheet,
  type ParticipantColumnMapping,
  type ParticipantColumnKey,
  type ParticipantPreviewRow,
  type ParticipantPreviewError,
  type ParticipantDuplicateCheck,
  type ParticipantImportResult,
} from '@/lib/participant-import-service'

interface Props {
  eventId: string
  disabled?: boolean
  onImported?: (result: ParticipantImportResult) => void
}

type Step = 'select' | 'map' | 'preview' | 'done'

const COLUMN_LABELS: Record<ParticipantColumnKey, string> = {
  first_name: 'Nome',
  last_name: 'Cognome',
  email: 'Email',
  phone: 'Telefono',
  company: 'Azienda',
  job_title: 'Ruolo',
  dietary_requirements: 'Esigenze alimentari',
  accessibility_requirements: 'Accessibilità',
  ignore: 'Ignora',
}

const TARGET_OPTIONS: ParticipantColumnKey[] = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'company',
  'job_title',
  'dietary_requirements',
  'accessibility_requirements',
  'ignore',
]

export default function ParticipantExcelImport({ eventId, disabled, onImported }: Props) {
  const { showToast } = useToast()
  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<Step>('select')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [docs, setDocs] = useState<ParticipantImportDocument[]>([])
  const [, setSelectedDoc] = useState<ParticipantImportDocument | null>(null)
  const [sheets, setSheets] = useState<ParticipantImportSheet[]>([])
  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0)

  const [mapping, setMapping] = useState<ParticipantColumnMapping[]>([])
  const [preserveUnmapped, setPreserveUnmapped] = useState(false)

  const [previewRows, setPreviewRows] = useState<ParticipantPreviewRow[]>([])
  const [previewErrors, setPreviewErrors] = useState<ParticipantPreviewError[]>([])
  const [dupCheck, setDupCheck] = useState<ParticipantDuplicateCheck | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const [importing, setImporting] = useState(false)

  const reset = useCallback(() => {
    setStep('select')
    setSelectedDoc(null)
    setSheets([])
    setSelectedSheetIdx(0)
    setMapping([])
    setPreserveUnmapped(false)
    setPreviewRows([])
    setPreviewErrors([])
    setDupCheck(null)
    setAuthorized(false)
    setImporting(false)
    setError(null)
  }, [])

  const loadDocs = useCallback(async () => {
    const rid = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await fetchImportableParticipantDocuments(eventId)
      if (!mountedRef.current || rid !== requestIdRef.current) return
      setDocs(result)
    } catch (e: any) {
      if (!mountedRef.current || rid !== requestIdRef.current) return
      setError(e?.message || 'Errore nel caricamento documenti.')
    } finally {
      if (mountedRef.current && rid === requestIdRef.current) setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    if (!disabled && isOpen) loadDocs()
  }, [disabled, isOpen, loadDocs])

  const handleSelectDoc = useCallback(async (doc: ParticipantImportDocument) => {
    const rid = ++requestIdRef.current
    setSelectedDoc(doc)
    setLoading(true)
    setError(null)
    try {
      const wb = await parseParticipantDocument(doc)
      if (!mountedRef.current || rid !== requestIdRef.current) return
      setSheets(wb.sheets)
      setSelectedSheetIdx(0)
      const autoMap = autoMapParticipantHeaders(wb.sheets[0].headers)
      setMapping(autoMap)
      setStep('map')
    } catch (e: any) {
      if (!mountedRef.current || rid !== requestIdRef.current) return
      setError(e?.message || 'Errore nella lettura del file.')
    } finally {
      if (mountedRef.current && rid === requestIdRef.current) setLoading(false)
    }
  }, [])

  const handleSheetChange = useCallback((idx: number) => {
    setSelectedSheetIdx(idx)
    if (sheets[idx]) {
      setMapping(autoMapParticipantHeaders(sheets[idx].headers))
    }
  }, [sheets])

  const updateMapping = useCallback((sourceIndex: number, target: ParticipantColumnKey) => {
    setMapping(prev => prev.map(m => m.sourceIndex === sourceIndex ? { ...m, target } : m))
  }, [])

  const hasDuplicateTargets = useCallback((): boolean => {
    const used = new Set<string>()
    for (const m of mapping) {
      if (m.target === 'ignore') continue
      if (used.has(m.target)) return true
      used.add(m.target)
    }
    return false
  }, [mapping])

  const hasRequiredFields = useCallback((): boolean => {
    return mapping.some(m => m.target === 'first_name') && mapping.some(m => m.target === 'last_name')
  }, [mapping])

  const handleBuildPreview = useCallback(async () => {
    if (!sheets[selectedSheetIdx]) return
    const rid = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const { rows, errors } = buildParticipantPreview(sheets[selectedSheetIdx], mapping, preserveUnmapped)
      if (!mountedRef.current || rid !== requestIdRef.current) return
      setPreviewRows(rows)
      setPreviewErrors(errors)
      const check = await checkParticipantImportDuplicates(eventId, rows)
      if (!mountedRef.current || rid !== requestIdRef.current) return
      setDupCheck(check)
      setStep('preview')
    } catch (e: any) {
      if (!mountedRef.current || rid !== requestIdRef.current) return
      setError(e?.message || 'Errore nella generazione dell\'anteprima.')
    } finally {
      if (mountedRef.current && rid === requestIdRef.current) setLoading(false)
    }
  }, [sheets, selectedSheetIdx, mapping, preserveUnmapped, eventId])

  const handleImport = useCallback(async () => {
    if (!dupCheck || importing) return
    const rid = ++requestIdRef.current
    setImporting(true)
    setError(null)
    try {
      const result = await importParticipantRows(eventId, dupCheck.newRows)
      if (!mountedRef.current || rid !== requestIdRef.current) return
      showToast(
        `Importazione completata: ${result.insertedCount} partecipanti aggiunti` +
        (result.skippedDuplicateCount > 0 ? `, ${result.skippedDuplicateCount} duplicati esclusi` : '') +
        '.',
        'success',
      )
      setStep('done')
      onImported?.(result)
    } catch (e: any) {
      if (!mountedRef.current || rid !== requestIdRef.current) return
      setError(e?.message || 'Errore durante l\'importazione.')
      showToast(e?.message || 'Errore durante l\'importazione.', 'error')
    } finally {
      if (mountedRef.current && rid === requestIdRef.current) setImporting(false)
    }
  }, [dupCheck, importing, eventId, onImported, showToast])

  if (disabled) return null

  const toggleBtnStyle: React.CSSProperties = {
    height: 44,
    minWidth: 44,
    padding: '0 16px',
    borderRadius: 6,
    border: '1px solid var(--border, #e2e8f0)',
    background: 'var(--surface, #fff)',
    color: 'var(--text, #1e293b)',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-expanded={false}
        style={toggleBtnStyle}
      >
        Importa partecipanti da Excel/CSV
      </button>
    )
  }

  const containerStyle: React.CSSProperties = {
    fontSize: 14,
    border: '1px solid var(--border, #e2e8f0)',
    borderRadius: 8,
    padding: 16,
    background: 'var(--surface, #fff)',
  }

  const btnStyle: React.CSSProperties = {
    height: 44,
    minWidth: 44,
    padding: '0 16px',
    borderRadius: 6,
    border: 'none',
    background: 'var(--primary, #2563eb)',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    opacity: 1,
  }

  const btnSecondary: React.CSSProperties = {
    ...btnStyle,
    background: 'var(--muted-bg, #f1f5f9)',
    color: 'var(--text, #1e293b)',
  }

  const badgeStyle: React.CSSProperties = {
    fontSize: 12,
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 500,
  }

  if (step === 'done') {
    return (
      <div style={containerStyle}>
        <p style={{ margin: 0, color: 'var(--success, #16a34a)', fontWeight: 600 }}>
          Importazione completata con successo.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={reset} style={btnSecondary}>
            Nuova importazione
          </button>
          <button onClick={() => setIsOpen(false)} style={btnSecondary}>
            Chiudi
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong style={{ fontSize: 14 }}>Importa partecipanti da Excel/CSV</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          {step !== 'select' && (
            <button onClick={reset} style={{ ...btnSecondary, height: 32, fontSize: 12, padding: '0 10px' }}>
              Ricomincia
            </button>
          )}
          <button onClick={() => setIsOpen(false)} aria-expanded={true} style={{ ...btnSecondary, height: 32, fontSize: 12, padding: '0 10px' }}>
            Chiudi
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, color: '#dc2626', fontSize: 13 }}>
          {error}
          {step === 'select' && (
            <button onClick={loadDocs} style={{ marginLeft: 8, fontSize: 12, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}>
              Riprova
            </button>
          )}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted, #64748b)' }}>
          Caricamento in corso...
        </div>
      )}

      {/* STEP 1: Select document */}
      {step === 'select' && !loading && (
        <div>
          {docs.length === 0 ? (
            <p style={{ color: 'var(--muted, #64748b)', margin: 0 }}>
              Nessun documento Excel/CSV trovato per questo evento. Carica prima un file nella sezione Documenti.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {docs.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => handleSelectDoc(doc)}
                  style={{
                    ...btnSecondary,
                    height: 44,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.file_name}
                  </span>
                  <span style={{ ...badgeStyle, background: '#e0f2fe', color: '#0369a1' }}>
                    {doc.file_type.includes('csv') ? 'CSV' : 'Excel'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Map headers */}
      {step === 'map' && !loading && (
        <div>
          {sheets.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted, #64748b)' }}>Foglio:</label>
              <select
                value={selectedSheetIdx}
                onChange={e => handleSheetChange(Number(e.target.value))}
                style={{ marginLeft: 8, height: 36, borderRadius: 4, border: '1px solid var(--border, #e2e8f0)', fontSize: 14, padding: '0 8px' }}
              >
                {sheets.map((s, i) => (
                  <option key={i} value={i}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted, #64748b)', marginBottom: 8 }}>
            Mappatura colonne
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
            {mapping.map(m => {
              const isDup = m.target !== 'ignore' && mapping.filter(x => x.target === m.target).length > 1
              return (
                <div key={m.sourceIndex} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.sourceHeader || `Colonna ${m.sourceIndex + 1}`}
                  </span>
                  <select
                    value={m.target}
                    onChange={e => updateMapping(m.sourceIndex, e.target.value as ParticipantColumnKey)}
                    style={{
                      height: 36,
                      borderRadius: 4,
                      border: `1px solid ${isDup ? '#dc2626' : 'var(--border, #e2e8f0)'}`,
                      fontSize: 13,
                      padding: '0 6px',
                      minWidth: 140,
                    }}
                  >
                    {TARGET_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{COLUMN_LABELS[opt]}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>

          {hasDuplicateTargets() && (
            <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>
              Errore: ogni campo può essere assegnato a una sola colonna.
            </div>
          )}
          {!hasRequiredFields() && (
            <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>
              I campi Nome e Cognome sono obbligatori.
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={preserveUnmapped} onChange={e => setPreserveUnmapped(e.target.checked)} />
            Conserva colonne non mappate come campi aggiuntivi
          </label>

          <button
            onClick={handleBuildPreview}
            disabled={hasDuplicateTargets() || !hasRequiredFields()}
            style={{
              ...btnStyle,
              marginTop: 16,
              opacity: hasDuplicateTargets() || !hasRequiredFields() ? 0.5 : 1,
              cursor: hasDuplicateTargets() || !hasRequiredFields() ? 'not-allowed' : 'pointer',
            }}
          >
            Genera anteprima
          </button>
        </div>
      )}

      {/* STEP 3: Preview & import */}
      {step === 'preview' && !loading && dupCheck && (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ ...badgeStyle, background: '#dcfce7', color: '#166534' }}>
              Nuovi: {dupCheck.newRows.length}
            </span>
            <span style={{ ...badgeStyle, background: '#fef9c3', color: '#854d0e' }}>
              Duplicati: {dupCheck.duplicates.length}
            </span>
            <span style={{ ...badgeStyle, background: '#fef2f2', color: '#dc2626' }}>
              Non validi: {previewErrors.length}
            </span>
            <span style={{ ...badgeStyle, background: '#f1f5f9', color: '#475569' }}>
              Totale righe: {previewRows.length + previewErrors.length}
            </span>
          </div>

          {dupCheck.newRows.length === 0 && (
            <p style={{ color: 'var(--muted, #64748b)', margin: '8px 0' }}>
              Nessun partecipante nuovo da importare. Tutti risultano già presenti o non validi.
            </p>
          )}

          {dupCheck.newRows.length > 0 && (
            <>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 6, marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--muted-bg, #f8fafc)', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>#</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>Nome</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>Cognome</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>Email</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>Azienda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dupCheck.newRows.slice(0, 50).map((row, i) => (
                      <tr key={row.rowIndex} style={{ borderTop: i > 0 ? '1px solid var(--border, #f1f5f9)' : undefined }}>
                        <td style={{ padding: '4px 8px', color: 'var(--muted, #94a3b8)' }}>{row.rowIndex}</td>
                        <td style={{ padding: '4px 8px' }}>{row.first_name}</td>
                        <td style={{ padding: '4px 8px' }}>{row.last_name}</td>
                        <td style={{ padding: '4px 8px' }}>{row.email || '—'}</td>
                        <td style={{ padding: '4px 8px' }}>{row.company || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dupCheck.newRows.length > 50 && (
                  <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--muted, #64748b)', textAlign: 'center', borderTop: '1px solid var(--border, #e2e8f0)' }}>
                    Mostrati 50 di {dupCheck.newRows.length} partecipanti
                  </div>
                )}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
                <input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} />
                Confermo di voler importare {dupCheck.newRows.length} partecipanti in questo evento
              </label>

              <button
                onClick={handleImport}
                disabled={!authorized || importing}
                style={{
                  ...btnStyle,
                  background: !authorized || importing ? 'var(--muted-bg, #cbd5e1)' : 'var(--success, #16a34a)',
                  cursor: !authorized || importing ? 'not-allowed' : 'pointer',
                  opacity: !authorized || importing ? 0.6 : 1,
                }}
              >
                {importing ? 'Importazione in corso...' : `Importa ${dupCheck.newRows.length} partecipanti`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
