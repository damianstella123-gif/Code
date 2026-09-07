import { useState, useEffect, useMemo } from 'react'
import { X, Loader2, CheckCircle2, XCircle, FileSpreadsheet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'

interface BudgetLine {
  categoria: string
  fornitore_nome: string
  descrizione: string
  quantita: number
  venduto_unitario: number
  venduto_totale: number
  costo_unitario: number
  costo_totale: number
  aliquota_iva: number
}

interface Proposal {
  id: string
  event_id: string
  document_id: string
  status: string
  extracted_data: BudgetLine[]
  created_at: string
}

interface Props {
  proposalId: string
  eventId: string
  onClose: () => void
  onApplied: () => void
}

const CATEGORY_COLORS: Record<string, string> = {
  hotel: 'var(--blue)',
  transfer: 'var(--accent)',
  ristorante: 'var(--orange, #e67e22)',
  catering: 'var(--orange, #e67e22)',
  location: 'var(--green)',
  experience: 'var(--green)',
  staff: 'var(--yellow)',
  audio: 'var(--accent)',
  video: 'var(--accent)',
  allestimenti: 'var(--muted)',
  grafica: 'var(--muted)',
  varie: 'var(--muted)',
}

function categoryColor(cat: string): string {
  const lower = cat.toLowerCase()
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (lower.includes(key)) return color
  }
  return 'var(--muted)'
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
}

export default function BudgetImportReview({ proposalId, eventId: _eventId, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(true)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<boolean[]>([])
  const [applying, setApplying] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from('budget_import_proposals')
        .select('*')
        .eq('id', proposalId)
        .single()
      if (err || !data) {
        setError(err?.message ?? 'Proposta non trovata')
        setLoading(false)
        return
      }
      const p = data as Proposal
      setProposal(p)
      setChecked(new Array((p.extracted_data ?? []).length).fill(true))
      setLoading(false)
    })()
  }, [proposalId])

  const lines = proposal?.extracted_data ?? []
  const isReadOnly = proposal?.status === 'applied' || proposal?.status === 'rejected'

  const summary = useMemo(() => {
    let count = 0, venduto = 0, costo = 0
    lines.forEach((line, i) => {
      if (checked[i]) {
        count++
        venduto += line.venduto_totale ?? 0
        costo += line.costo_totale ?? 0
      }
    })
    return { count, venduto, costo, margine: venduto - costo }
  }, [lines, checked])

  function toggleAll() {
    const allChecked = checked.every(Boolean)
    setChecked(checked.map(() => !allChecked))
  }

  function toggle(i: number) {
    setChecked(prev => { const next = [...prev]; next[i] = !next[i]; return next })
  }

  async function handleApply() {
    setApplying(true)
    const indices = checked
      .map((v, i) => v ? i + 1 : null)
      .filter((v): v is number => v !== null)
    const { data, error: err } = await supabase.rpc('apply_budget_import_proposal', {
      p_proposal_id: proposalId,
      p_line_indices: indices,
    })
    setApplying(false)
    if (err) {
      showToast(err.message || 'Errore durante l\'importazione', 'error')
      return
    }
    const result = data as { suppliers_created: number; lines_created: number }
    showToast(`Importazione completata: ${result.lines_created} voci create, ${result.suppliers_created} fornitori creati`, 'success')
    onApplied()
    onClose()
  }

  async function handleReject() {
    setRejecting(true)
    await supabase
      .from('budget_import_proposals')
      .update({ status: 'rejected' })
      .eq('id', proposalId)
    setRejecting(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: 'color-mix(in srgb, var(--green) 12%, transparent)' }}>
              <FileSpreadsheet className="w-5 h-5" style={{ color: 'var(--green)' }} />
            </div>
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                {isReadOnly ? 'Proposta budget' : 'Revisione proposta budget AI'}
              </h3>
              {isReadOnly && (
                <span className="text-[11px] px-2 py-0.5 rounded font-medium"
                  style={{
                    background: proposal?.status === 'applied'
                      ? 'color-mix(in srgb, var(--green) 12%, transparent)'
                      : 'color-mix(in srgb, var(--red2) 12%, transparent)',
                    color: proposal?.status === 'applied' ? 'var(--green)' : 'var(--red2)',
                  }}>
                  {proposal?.status === 'applied' ? 'Applicata' : 'Rifiutata'}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--muted)' }} />
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-8">
            <p className="text-sm" style={{ color: 'var(--red2)' }}>{error}</p>
          </div>
        )}

        {!loading && proposal && (
          <>
            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-4 mb-4 p-3 rounded-xl"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                Selezionate: <span className="font-semibold" style={{ color: 'var(--text)' }}>{summary.count}/{lines.length}</span>
              </div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                Venduto: <span className="font-semibold" style={{ color: 'var(--text)' }}>{fmtCurrency(summary.venduto)}</span>
              </div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                Costo: <span className="font-semibold" style={{ color: 'var(--yellow)' }}>{fmtCurrency(summary.costo)}</span>
              </div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                Margine: <span className="font-semibold" style={{ color: summary.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>
                  {fmtCurrency(summary.margine)}
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--line)' }}>
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>
                    {!isReadOnly && (
                      <th className="px-3 py-2.5 text-left w-8">
                        <input type="checkbox" checked={checked.every(Boolean)} onChange={toggleAll}
                          className="rounded" style={{ accentColor: 'var(--green)' }} />
                      </th>
                    )}
                    <th className="px-3 py-2.5 text-left font-medium" style={{ color: 'var(--muted)' }}>Categoria</th>
                    <th className="px-3 py-2.5 text-left font-medium" style={{ color: 'var(--muted)' }}>Fornitore</th>
                    <th className="px-3 py-2.5 text-left font-medium" style={{ color: 'var(--muted)' }}>Descrizione</th>
                    <th className="px-3 py-2.5 text-right font-medium" style={{ color: 'var(--muted)' }}>Qtà</th>
                    <th className="px-3 py-2.5 text-right font-medium" style={{ color: 'var(--muted)' }}>Venduto</th>
                    <th className="px-3 py-2.5 text-right font-medium" style={{ color: 'var(--muted)' }}>Costo</th>
                    <th className="px-3 py-2.5 text-right font-medium" style={{ color: 'var(--muted)' }}>IVA %</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const dimmed = !isReadOnly && !checked[i]
                    return (
                      <tr key={i}
                        style={{
                          borderBottom: '1px solid var(--line)',
                          opacity: dimmed ? 0.4 : 1,
                          transition: 'opacity 0.15s',
                        }}
                        className="hover:bg-white/[0.02]"
                      >
                        {!isReadOnly && (
                          <td className="px-3 py-2.5">
                            <input type="checkbox" checked={checked[i]} onChange={() => toggle(i)}
                              className="rounded" style={{ accentColor: 'var(--green)' }} />
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                            style={{
                              background: `color-mix(in srgb, ${categoryColor(line.categoria)} 12%, transparent)`,
                              color: categoryColor(line.categoria),
                            }}>
                            {line.categoria}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--muted)' }}>{line.fornitore_nome || '—'}</td>
                        <td className="px-3 py-2.5 max-w-[200px] truncate" style={{ color: 'var(--text)' }}>{line.descrizione}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--text)' }}>{line.quantita}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{fmtCurrency(line.venduto_totale)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--yellow)' }}>{fmtCurrency(line.costo_totale)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: 'var(--muted)' }}>{line.aliquota_iva}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            {!isReadOnly && (
              <div className="flex items-center justify-end gap-3 mt-5">
                <button
                  onClick={handleReject}
                  disabled={rejecting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-white/5"
                  style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}
                >
                  {rejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  Chiudi senza importare
                </button>
                <button
                  onClick={handleApply}
                  disabled={applying || summary.count === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                  style={{ background: 'var(--green)', color: '#fff' }}
                >
                  {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Conferma e importa ({summary.count} voci)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
