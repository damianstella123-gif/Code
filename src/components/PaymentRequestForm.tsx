import { useState, useEffect, useMemo } from 'react'
import { X, ChevronDown, Loader2, Send, AlertCircle, CheckCircle2, Circle } from 'lucide-react'
import { useToast } from '@/lib/toast'
import { loadUser } from '@/lib/auth'
import { todayISO } from '@/lib/format'
import {
  insertPayment,
  fetchValidBudgetVersions,
  fetchBudgetLinesForSupplier,
  addPaymentRequestLine,
  submitPaymentRequest,
  type BudgetVersion,
  type BudgetLine,
  type PaymentInsert,
} from '@/lib/event-payments-service'
import type { Supplier } from '@/data/suppliers'

interface Props {
  eventId: string
  suppliers: Supplier[]
  onDone: () => void
  onCancel: () => void
}

interface LineAllocation {
  line: BudgetLine
  amount: number
}

function getValidationError(
  supplierId: string,
  importoNum: number,
  dataScadenza: string,
  descrizione: string,
  selectedVersionId: string,
  allocations: LineAllocation[],
  totalAllocated: number,
): string | null {
  if (!supplierId) return 'Seleziona un fornitore.'
  if (importoNum <= 0) return 'Inserisci un importo maggiore di zero.'
  if (!dataScadenza) return 'Inserisci la data di scadenza.'
  if (!descrizione.trim()) return 'Inserisci una descrizione.'
  if (!selectedVersionId) return 'Seleziona una versione budget.'
  if (allocations.length === 0) return 'Seleziona almeno una voce economica.'
  if (allocations.some(a => a.amount <= 0)) return 'Inserisci un importo maggiore di zero per ogni voce selezionata.'
  if (Math.abs(importoNum - totalAllocated) > 0.01) return 'Il totale allocato deve coincidere con l\'importo della richiesta.'
  return null
}

export default function PaymentRequestForm({ eventId, suppliers, onDone, onCancel }: Props) {
  const { showToast } = useToast()

  // Step 1: base fields
  const [supplierId, setSupplierId] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [supplierLabel, setSupplierLabel] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [importo, setImporto] = useState('')
  const [dataScadenza, setDataScadenza] = useState(todayISO())
  const [requestNote, setRequestNote] = useState('')

  // Step 2: version + lines
  const [versions, setVersions] = useState<BudgetVersion[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [lines, setLines] = useState<BudgetLine[]>([])
  const [allocations, setAllocations] = useState<LineAllocation[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [loadingLines, setLoadingLines] = useState(false)

  // Submission
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const importoNum = Number(importo) || 0
  const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0)
  const remaining = importoNum - totalAllocated
  const allocationValid = Math.abs(remaining) <= 0.01 && allocations.length > 0

  // Checklist states
  const checkDati = !!supplierId && importoNum > 0 && !!dataScadenza && !!descrizione.trim()
  const checkVersion = !!selectedVersionId
  const checkLines = allocations.length > 0 && allocations.every(a => a.amount > 0)
  const checkAllocation = allocationValid

  // Filtered suppliers for search
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch) return []
    const q = supplierSearch.toLowerCase()
    return suppliers
      .filter(s => s.nome.toLowerCase().includes(q) || (s.categorie || [s.categoria]).some((c: string | null) => c?.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [supplierSearch, suppliers])

  // Load budget versions when supplier selected
  useEffect(() => {
    if (!supplierId) { setVersions([]); setSelectedVersionId(''); return }
    setLoadingVersions(true)
    fetchValidBudgetVersions(eventId).then(v => {
      setVersions(v)
      setLoadingVersions(false)
    })
  }, [supplierId, eventId])

  // Load lines when version selected
  useEffect(() => {
    if (!selectedVersionId || !supplierId) { setLines([]); return }
    setLoadingLines(true)
    fetchBudgetLinesForSupplier(eventId, selectedVersionId, supplierId).then(l => {
      setLines(l)
      setLoadingLines(false)
    })
  }, [selectedVersionId, supplierId, eventId])

  // Reset allocations when lines change
  useEffect(() => { setAllocations([]) }, [lines])

  // Close supplier dropdown on outside click
  useEffect(() => {
    if (!supplierOpen) return
    const close = () => setSupplierOpen(false)
    const timer = setTimeout(() => document.addEventListener('mousedown', close), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', close) }
  }, [supplierOpen])

  function toggleLine(line: BudgetLine) {
    const exists = allocations.find(a => a.line.id === line.id && a.line.source_table === line.source_table)
    if (exists) {
      setAllocations(allocations.filter(a => !(a.line.id === line.id && a.line.source_table === line.source_table)))
    } else {
      const currentAllocated = allocations.reduce((s, a) => s + a.amount, 0)
      const rem = importoNum - currentAllocated
      const defaultAmount = rem > 0 ? Math.round(rem * 100) / 100 : 0
      setAllocations([...allocations, { line, amount: defaultAmount }])
    }
  }

  function updateAllocation(lineId: string, sourceTable: string, amount: number) {
    setAllocations(allocations.map(a =>
      (a.line.id === lineId && a.line.source_table === sourceTable) ? { ...a, amount } : a
    ))
  }

  async function handleSubmit() {
    if (saving) return

    const validationErr = getValidationError(
      supplierId, importoNum, dataScadenza, descrizione, selectedVersionId, allocations, totalAllocated
    )
    if (validationErr) {
      setErrorMsg(validationErr)
      return
    }

    setErrorMsg('')
    setSaving(true)

    try {
      const user = loadUser()

      // 1. Create draft request
      const insertData: PaymentInsert = {
        event_id: eventId,
        tipo: 'pagamento_fornitore',
        descrizione: descrizione.trim(),
        importo: importoNum,
        data_scadenza: dataScadenza,
        supplier_id: supplierId,
        request_note: requestNote.trim() || null,
        request_status: 'bozza',
        created_by: user?.id ?? null,
        stato: 'atteso',
        stato_approvazione: 'in_attesa',
      }

      const payment = await insertPayment(insertData)
      if (!payment) {
        setErrorMsg('Errore nella creazione della bozza.')
        setSaving(false)
        return
      }

      // 2. Link each line via RPC
      for (const alloc of allocations) {
        const { error } = await addPaymentRequestLine({
          paymentRequestId: payment.id,
          budgetVersionId: selectedVersionId,
          sourceTable: alloc.line.source_table,
          sourceLineId: alloc.line.id,
          allocatedAmount: alloc.amount,
        })
        if (error) {
          setErrorMsg('Collegamento fallito. La richiesta resta in bozza.')
          setSaving(false)
          return
        }
      }

      // 3. Submit via RPC
      const { error: submitErr } = await submitPaymentRequest(payment.id)
      if (submitErr) {
        setErrorMsg('Invio fallito. La richiesta resta in bozza.')
        setSaving(false)
        return
      }

      showToast('Richiesta inviata all\'Amministrazione', 'success')
      onDone()
    } catch {
      setErrorMsg('Errore imprevisto. Riprova.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg3, var(--bg2))',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--text)',
    width: '100%',
    fontSize: 14,
  }

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Nuova richiesta di pagamento fornitore</h4>
        <button type="button" onClick={onCancel} disabled={saving} className="p-1 rounded hover:opacity-70">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Base fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Supplier */}
        <div className="md:col-span-2">
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Fornitore *</label>
          <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
            <input
              type="text"
              value={supplierLabel}
              onChange={e => {
                setSupplierLabel(e.target.value)
                setSupplierSearch(e.target.value)
                setSupplierId('')
                setSupplierOpen(true)
              }}
              onFocus={() => setSupplierOpen(true)}
              placeholder="Cerca fornitore..."
              style={inputStyle}
              autoComplete="off"
              disabled={saving}
            />
            {supplierOpen && filteredSuppliers.length > 0 && (
              <div
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--panel-solid, var(--bg2))', border: '1px solid var(--line)',
                  borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  maxHeight: 220, overflowY: 'auto',
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                {filteredSuppliers.map(s => (
                  <div
                    key={s.id}
                    onClick={() => {
                      setSupplierId(s.id)
                      setSupplierLabel(s.nome)
                      setSupplierSearch('')
                      setSupplierOpen(false)
                    }}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)', fontSize: 14 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel2, var(--bg3))')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ fontWeight: 500, color: 'var(--text)' }}>{s.nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {(s.categorie?.[0] || s.categoria || '')}{s.city ? ` \u00B7 ${s.city}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Importo richiesta *</label>
          <input type="number" min="0.01" step="0.01" value={importo} onChange={e => setImporto(e.target.value)} placeholder="0.00" style={inputStyle} disabled={saving} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Data scadenza *</label>
          <input type="date" value={dataScadenza} onChange={e => setDataScadenza(e.target.value)} style={inputStyle} disabled={saving} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Descrizione *</label>
          <input type="text" value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder="Es. Acconto hotel conferma camere" style={inputStyle} disabled={saving} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Nota per l'Amministrazione</label>
          <input type="text" value={requestNote} onChange={e => setRequestNote(e.target.value)} placeholder="Opzionale" style={inputStyle} disabled={saving} />
        </div>
      </div>

      {/* Version selector */}
      {supplierId && importoNum > 0 && (
        <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          <h5 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            Collegamento voci economiche
          </h5>

          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Versione budget *</label>
            {loadingVersions ? (
              <div className="flex items-center gap-2 text-xs py-2" style={{ color: 'var(--muted)' }}>
                <Loader2 className="w-3 h-3 animate-spin" /> Caricamento versioni...
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <select
                  value={selectedVersionId}
                  onChange={e => setSelectedVersionId(e.target.value)}
                  style={{ ...inputStyle, appearance: 'none', paddingRight: 32 }}
                  disabled={saving || versions.length === 0}
                >
                  <option value="">Seleziona versione...</option>
                  {versions.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.nome} ({v.tipo} - {v.stato})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
              </div>
            )}
            {!loadingVersions && versions.length === 0 && supplierId && (
              <p style={{ fontSize: 14, color: 'var(--yellow)', marginTop: 4 }}>
                Non esiste un preventivo approvato o un consuntivo in bozza per questo evento.
              </p>
            )}
          </div>

          {/* Budget lines */}
          {selectedVersionId && (
            <div>
              {loadingLines ? (
                <div className="flex items-center gap-2 text-xs py-2" style={{ color: 'var(--muted)' }}>
                  <Loader2 className="w-3 h-3 animate-spin" /> Caricamento voci...
                </div>
              ) : lines.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--muted)', padding: '8px 0' }}>
                  Nessuna voce di questo fornitore è disponibile nella versione selezionata.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    Seleziona le voci da collegare e distribuisci l'importo:
                  </p>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {lines.map(line => {
                      const isSelected = allocations.some(a => a.line.id === line.id && a.line.source_table === line.source_table)
                      const alloc = allocations.find(a => a.line.id === line.id && a.line.source_table === line.source_table)
                      return (
                        <div
                          key={`${line.source_table}-${line.id}`}
                          className="rounded-lg p-3 transition-all"
                          style={{
                            background: isSelected ? 'color-mix(in srgb, var(--accent) 8%, var(--bg3, var(--bg2)))' : 'var(--bg3, var(--bg2))',
                            border: isSelected ? '1px solid var(--accent)' : '1px solid var(--line)',
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleLine(line)}
                              disabled={saving}
                              style={{ accentColor: 'var(--accent)', width: 20, height: 20, minWidth: 20, minHeight: 20 }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--muted)', fontSize: 12 }}>
                                  {line.categoria}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 500 }} className="truncate">{line.description}</span>
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                Costo: {fmtEuro(line.costo_totale)}
                              </span>
                            </div>
                            {isSelected && (
                              <div style={{ width: 120, flexShrink: 0 }}>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={alloc?.amount || ''}
                                  onChange={e => updateAllocation(line.id, line.source_table, Number(e.target.value) || 0)}
                                  placeholder="Importo"
                                  disabled={saving}
                                  style={{ ...inputStyle, fontSize: 14, padding: '6px 8px', textAlign: 'right' }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Allocation summary */}
                  <div className="flex flex-wrap items-center gap-4 pt-2" style={{ borderTop: '1px solid var(--line)', fontSize: 14 }}>
                    <span style={{ color: 'var(--muted)' }}>
                      Totale richiesta: <strong style={{ color: 'var(--text)' }}>{fmtEuro(importoNum)}</strong>
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      Allocato: <strong style={{ color: totalAllocated > 0 ? 'var(--accent)' : 'var(--text)' }}>{fmtEuro(totalAllocated)}</strong>
                    </span>
                    <span style={{ color: remaining > 0.01 ? 'var(--yellow)' : remaining < -0.01 ? 'var(--red2)' : 'var(--green)' }}>
                      {remaining > 0.01 ? `Da allocare: ${fmtEuro(remaining)}` : remaining < -0.01 ? `Eccede di: ${fmtEuro(Math.abs(remaining))}` : 'Allocazione completa'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Inline progress checklist */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
        <ChecklistItem label="Dati richiesta" done={checkDati} />
        <ChecklistItem label="Versione budget" done={checkVersion} />
        <ChecklistItem label="Voci selezionate" done={checkLines} />
        <ChecklistItem label="Importo completamente allocato" done={checkAllocation} />
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: 'color-mix(in srgb, var(--red2) 10%, transparent)', border: '1px solid var(--red2)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--red2)' }} />
          <p style={{ fontSize: 14, color: 'var(--red2)' }}>{errorMsg}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm"
          style={{ color: 'var(--muted)', minHeight: 44 }}
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            opacity: saving ? 0.6 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
            minHeight: 44,
          }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {saving ? 'Invio in corso...' : 'Invia all\'Amministrazione'}
        </button>
      </div>
    </div>
  )
}

function ChecklistItem({ label, done }: { label: string; done: boolean }) {
  return (
    <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: done ? 'var(--green)' : 'var(--muted)' }}>
      {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
      {label}
    </span>
  )
}

function fmtEuro(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
