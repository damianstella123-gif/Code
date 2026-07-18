import { useState, useEffect, useMemo } from 'react'
import { X, ChevronDown, Loader2, Send, AlertCircle } from 'lucide-react'
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
      setAllocations([...allocations, { line, amount: 0 }])
    }
  }

  function updateAllocation(lineId: string, sourceTable: string, amount: number) {
    setAllocations(allocations.map(a =>
      (a.line.id === lineId && a.line.source_table === sourceTable) ? { ...a, amount } : a
    ))
  }

  function canSubmit(): boolean {
    if (!supplierId || !descrizione.trim() || importoNum <= 0 || !dataScadenza) return false
    if (!allocationValid) return false
    if (allocations.some(a => a.amount <= 0)) return false
    return true
  }

  async function handleSubmit() {
    if (!canSubmit() || saving) return
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
          setErrorMsg(`Collegamento fallito: ${error}. La richiesta resta in bozza.`)
          setSaving(false)
          return
        }
      }

      // 3. Submit via RPC
      const { error: submitErr } = await submitPaymentRequest(payment.id)
      if (submitErr) {
        setErrorMsg(`Invio fallito: ${submitErr}. La richiesta resta in bozza.`)
        setSaving(false)
        return
      }

      showToast('Richiesta inviata all\'Amministrazione', 'success')
      onDone()
    } catch (e: any) {
      setErrorMsg(e?.message || 'Errore imprevisto')
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
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)', fontSize: 13 }}
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
              <p className="text-xs mt-1" style={{ color: 'var(--yellow)' }}>
                Nessuna versione budget valida per questo evento.
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
                <p className="text-xs py-2" style={{ color: 'var(--muted)' }}>
                  Nessuna voce economica trovata per questo fornitore nella versione selezionata.
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
                              style={{ accentColor: 'var(--accent)' }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--muted)', fontSize: 10 }}>
                                  {line.categoria}
                                </span>
                                <span className="text-sm font-medium truncate">{line.description}</span>
                              </div>
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                Costo: {fmtEuro(line.costo_totale)}
                              </span>
                            </div>
                            {isSelected && (
                              <div style={{ width: 120 }}>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={alloc?.amount || ''}
                                  onChange={e => updateAllocation(line.id, line.source_table, Number(e.target.value) || 0)}
                                  placeholder="Importo"
                                  disabled={saving}
                                  style={{ ...inputStyle, fontSize: 13, padding: '6px 8px', textAlign: 'right' }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Allocation summary */}
                  <div className="flex flex-wrap items-center gap-4 pt-2 text-xs" style={{ borderTop: '1px solid var(--line)' }}>
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

      {/* Error */}
      {errorMsg && (
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: 'color-mix(in srgb, var(--red2) 10%, transparent)', border: '1px solid var(--red2)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--red2)' }} />
          <p className="text-xs" style={{ color: 'var(--red2)' }}>{errorMsg}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm"
          style={{ color: 'var(--muted)' }}
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !canSubmit()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: canSubmit() ? 'var(--accent)' : 'var(--bg3, var(--bg2))',
            color: canSubmit() ? '#fff' : 'var(--muted)',
            opacity: saving ? 0.6 : 1,
            cursor: saving || !canSubmit() ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {saving ? 'Invio in corso...' : 'Invia all\'Amministrazione'}
        </button>
      </div>
    </div>
  )
}

function fmtEuro(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
