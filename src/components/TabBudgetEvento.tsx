import { useState, useEffect, useMemo } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SEZIONI_BUDGET, type BudgetItem, type SezioneBudget } from '@/components/SupplierCostModal'
import * as XLSX from 'xlsx'
import type { Event } from '@/data/events'

interface Supplier {
  id: string
  nome: string
  categoria: string
}

interface BudgetRow extends BudgetItem {
  fornitore: string
  supplier_id: string
}

function fmt(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TabBudgetEvento({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [rows, setRows] = useState<BudgetRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBudgetData()
  }, [event.id])

  async function loadBudgetData() {
    setLoading(true)
    const { data } = await supabase
      .from('event_suppliers')
      .select('supplier_id, service_category, budget_items')
      .eq('event_id', event.id)
    if (data) {
      const allRows: BudgetRow[] = []
      for (const link of data) {
        if (!Array.isArray(link.budget_items) || link.budget_items.length === 0) continue
        const sup = suppliers.find(s => s.id === link.supplier_id)
        const supplierName = sup?.nome ?? ''
        for (const item of link.budget_items as BudgetItem[]) {
          allRows.push({
            ...item,
            pax: item.pax || 0,
            commissione_percentuale: item.commissione_percentuale || 0,
            note: item.note || '',
            categoria_sezione: item.categoria_sezione || '',
            fornitore: supplierName,
            supplier_id: link.supplier_id,
          })
        }
      }
      setRows(allRows)
    }
    setLoading(false)
  }

  const grouped = useMemo(() => {
    const map: Record<string, BudgetRow[]> = {}
    for (const row of rows) {
      const key = row.categoria_sezione || 'Altro'
      if (!map[key]) map[key] = []
      map[key].push(row)
    }
    return (SEZIONI_BUDGET as readonly string[])
      .filter(s => map[s] && map[s].length > 0)
      .map(s => ({ sezione: s as SezioneBudget, items: map[s] }))
  }, [rows])

  const grandTotals = useMemo(() => {
    let costo = 0, venduto = 0
    for (const row of rows) {
      costo += row.totale_costo
      venduto += row.totale_venduto
    }
    const margine = venduto - costo
    const marginePct = venduto > 0 ? (margine / venduto) * 100 : 0
    return { costo, venduto, margine, marginePct }
  }, [rows])

  function sectionTotals(items: BudgetRow[]) {
    let costo = 0, venduto = 0
    for (const it of items) {
      costo += it.totale_costo
      venduto += it.totale_venduto
    }
    return { costo, venduto, margine: venduto - costo, marginePct: venduto > 0 ? ((venduto - costo) / venduto) * 100 : 0 }
  }

  function exportExcelBudget() {
    const wsRows: (string | number | null)[][] = []
    wsRows.push(['BUDGET EVENTO - ' + (event.nome || 'Evento').toUpperCase()])
    if (event.cliente) wsRows.push(['Cliente: ' + event.cliente])
    wsRows.push(['Data: ' + new Date().toLocaleDateString('it-IT')])
    wsRows.push([])
    wsRows.push([
      'SEZIONE', 'FORNITORE', 'VOCE', 'DESCRIZIONE',
      'QTA/NOTTI', 'PAX', 'COSTO UNIT.', 'TOT. COSTO',
      'VENDUTO UNIT.', 'TOT. VENDUTO', 'MARGINE',
      'IVA %', 'COMM. %', 'NOTE',
    ])

    for (const group of grouped) {
      wsRows.push([group.sezione.toUpperCase(), '', '', '', '', '', '', '', '', '', '', '', '', ''])
      for (const row of group.items) {
        wsRows.push([
          '', row.fornitore, row.voce, row.descrizione,
          row.quantita, row.pax || '', row.costo_unitario, row.totale_costo,
          row.venduto_unitario, row.totale_venduto, row.margine,
          row.iva_percentuale, row.commissione_percentuale || '', row.note || '',
        ])
      }
      const st = sectionTotals(group.items)
      wsRows.push([
        '', '', '', `Subtotale ${group.sezione}`,
        '', '', '', st.costo,
        '', st.venduto, st.margine,
        '', '', '',
      ])
      wsRows.push([])
    }

    wsRows.push([])
    wsRows.push([
      '', '', '', 'TOTALE EVENTO',
      '', '', '', grandTotals.costo,
      '', grandTotals.venduto, grandTotals.margine,
      '', '', '',
    ])
    wsRows.push([
      '', '', '', 'MARGINE %',
      '', '', '', '',
      '', '', `${grandTotals.marginePct.toFixed(1)}%`,
      '', '', '',
    ])

    const ws = XLSX.utils.aoa_to_sheet(wsRows)
    ws['!cols'] = [
      { wch: 16 }, { wch: 22 }, { wch: 24 }, { wch: 28 },
      { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 8 }, { wch: 8 }, { wch: 24 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Budget Evento')
    const filename = `Budget_${(event.nome || 'Evento').replace(/\s+/g, '_')}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  if (loading) {
    return (
      <div className="panel p-10 text-center">
        <div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento budget fornitori...</div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
        <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Nessuna voce di budget inserita</p>
        <p className="text-xs mt-1">Vai su Fornitori e usa "Gestisci costi" per inserire voci economiche per ogni fornitore.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Grand totals summary */}
      <div className="panel p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Totale Costi</p>
            <p className="text-xl font-bold mt-1" style={{ color: 'var(--red2)' }}>{fmt(grandTotals.costo)} &euro;</p>
          </div>
          <div className="text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Totale Venduto</p>
            <p className="text-xl font-bold mt-1" style={{ color: 'var(--green)' }}>{fmt(grandTotals.venduto)} &euro;</p>
          </div>
          <div className="text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Margine</p>
            <p className="text-xl font-bold mt-1" style={{ color: grandTotals.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>
              {fmt(grandTotals.margine)} &euro;
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Margine %</p>
            <p className="text-xl font-bold mt-1" style={{ color: grandTotals.marginePct >= 15 ? 'var(--green)' : grandTotals.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)' }}>
              {grandTotals.marginePct.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Margin bar */}
      {grandTotals.venduto > 0 && (
        <div className="panel p-4">
          <div className="flex justify-between text-xs mb-2">
            <span style={{ color: 'var(--muted)' }}>Margine operativo</span>
            <span style={{ color: grandTotals.marginePct >= 15 ? 'var(--green)' : 'var(--yellow)' }}>{grandTotals.marginePct.toFixed(1)}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.min(Math.max(grandTotals.marginePct, 0), 100)}%`,
              background: grandTotals.marginePct >= 15 ? 'var(--green)' : grandTotals.marginePct >= 0 ? 'var(--yellow)' : 'var(--red2)',
            }} />
          </div>
        </div>
      )}

      {/* Export */}
      <div className="flex justify-end">
        <button onClick={exportExcelBudget}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: '#fff' }}>
          <Download className="w-3.5 h-3.5" /> Esporta Excel Budget
        </button>
      </div>

      {/* Spreadsheet-like table per section */}
      {grouped.map(group => {
        const st = sectionTotals(group.items)
        return (
          <div key={group.sezione} className="panel overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--panel2)' }}>
              <p className="text-sm font-bold tracking-wide" style={{ color: 'var(--text)' }}>{group.sezione}</p>
              <div className="flex items-center gap-4 text-xs">
                <span style={{ color: 'var(--muted)' }}>C: <strong style={{ color: 'var(--red2)' }}>{fmt(st.costo)}</strong></span>
                <span style={{ color: 'var(--muted)' }}>V: <strong style={{ color: 'var(--green)' }}>{fmt(st.venduto)}</strong></span>
                <span style={{ color: 'var(--muted)' }}>M: <strong style={{ color: st.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(st.margine)}</strong></span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 1100 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 140 }}>Fornitore</th>
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 160 }}>Voce</th>
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 140 }}>Descrizione</th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 70 }}>Qtà/Notti</th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 55 }}>Pax</th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 90 }}>Costo U.</th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 100 }}>Tot. Costo</th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 90 }}>Venduto U.</th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 100 }}>Tot. Venduto</th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 90 }}>Margine</th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 50 }}>IVA</th>
                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 55 }}>Comm.</th>
                    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--muted)', width: 120 }}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((row, ri) => (
                    <tr key={ri} className="hover:bg-white/[0.02] transition-colors" style={{ borderTop: '1px solid var(--line)' }}>
                      <td className="px-3 py-2 truncate" style={{ color: 'var(--text)' }}>{row.fornitore}</td>
                      <td className="px-3 py-2 truncate" style={{ color: 'var(--text)' }}>{row.voce}</td>
                      <td className="px-3 py-2 truncate" style={{ color: 'var(--muted)' }}>{row.descrizione || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text)' }}>{row.quantita}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text)' }}>{row.pax || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmt(row.costo_unitario)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: 'var(--red2)' }}>{fmt(row.totale_costo)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text)' }}>{fmt(row.venduto_unitario)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: 'var(--green)' }}>{fmt(row.totale_venduto)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: row.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(row.margine)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--muted)' }}>{row.iva_percentuale}%</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--muted)' }}>{row.commissione_percentuale ? `${row.commissione_percentuale}%` : '-'}</td>
                      <td className="px-3 py-2 truncate" style={{ color: 'var(--muted)', maxWidth: 120 }}>{row.note || ''}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--line)', background: 'rgba(255,255,255,0.03)' }}>
                    <td className="px-3 py-2 font-bold" style={{ color: 'var(--text)' }} colSpan={3}>Subtotale {group.sezione}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: 'var(--text)' }}>
                      {group.items.reduce((s, r) => s + r.quantita, 0)}
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: 'var(--red2)' }}>{fmt(st.costo)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: 'var(--green)' }}>{fmt(st.venduto)}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: st.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(st.margine)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      {/* Grand total footer */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 1100 }}>
            <tbody>
              <tr style={{ background: 'rgba(208,0,58,0.06)' }}>
                <td className="px-3 py-3 font-bold text-sm" style={{ color: 'var(--text)', width: 440 }} colSpan={3}>TOTALE EVENTO</td>
                <td className="px-3 py-3" style={{ width: 70 }} />
                <td className="px-3 py-3" style={{ width: 55 }} />
                <td className="px-3 py-3" style={{ width: 90 }} />
                <td className="px-3 py-3 text-right font-bold tabular-nums text-sm" style={{ color: 'var(--red2)', width: 100 }}>{fmt(grandTotals.costo)} &euro;</td>
                <td className="px-3 py-3" style={{ width: 90 }} />
                <td className="px-3 py-3 text-right font-bold tabular-nums text-sm" style={{ color: 'var(--green)', width: 100 }}>{fmt(grandTotals.venduto)} &euro;</td>
                <td className="px-3 py-3 text-right font-bold tabular-nums text-sm" style={{ color: grandTotals.margine >= 0 ? 'var(--green)' : 'var(--red2)', width: 90 }}>{fmt(grandTotals.margine)} &euro;</td>
                <td className="px-3 py-3" style={{ width: 50 }} />
                <td className="px-3 py-3" style={{ width: 55 }} />
                <td className="px-3 py-3 text-right font-bold tabular-nums" style={{ color: grandTotals.marginePct >= 15 ? 'var(--green)' : 'var(--yellow)', width: 120 }}>{grandTotals.marginePct.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
