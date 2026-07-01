import { useState, useEffect, useMemo } from 'react'
import { X, Plus, Trash2, Euro, Download, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

export interface BudgetItem {
  voce: string
  descrizione: string
  area: string
  categoria_sezione: string
  quantita: number
  pax: number
  costo_unitario: number
  venduto_unitario: number
  iva_percentuale: number
  commissione_percentuale: number
  totale_costo: number
  totale_venduto: number
  margine: number
  note: string
}

export const SEZIONI_BUDGET = [
  'Pernottamento',
  'Meeting',
  'F&B',
  'Audio Video',
  'Transfer',
  'Allestimenti',
  'Staff',
  'Grafica',
  'Altro',
] as const

export type SezioneBudget = typeof SEZIONI_BUDGET[number]

interface SupplierCostModalProps {
  eventName: string
  linkId: string
  supplierName: string
  category: string
  onClose: () => void
  onSaved?: () => void
}

const VOCI_PER_CATEGORIA: Record<string, string[]> = {
  hotel: [
    'Camere', 'Sale meeting', 'F&B', 'Coffee break', 'Light lunch',
    'Cocktail', 'Aperitivo', 'Aperitivo rinforzato',
    'Cena servita 2 portate', 'Cena servita 3 portate', 'Cena servita 4 portate',
    'Area riservata indoor', 'Area riservata outdoor', 'Area riservata rooftop',
    'Esclusiva indoor', 'Esclusiva outdoor', 'Esclusiva rooftop',
    'Pernottamento staff', 'Parcheggio', 'Extra tecnici', 'Altro',
  ],
  ristorante: [
    'Menu', 'Beverage', 'Aperitivo', 'Aperitivo rinforzato', 'Cocktail',
    'Cena servita 2 portate', 'Cena servita 3 portate', 'Cena servita 4 portate',
    'Area riservata indoor', 'Area riservata outdoor', 'Area riservata rooftop',
    'Esclusiva indoor', 'Esclusiva outdoor', 'Esclusiva rooftop',
    'Extra servizio', 'Altro',
  ],
  catering: [
    'Coffee break', 'Light lunch', 'Buffet', 'Aperitivo', 'Aperitivo rinforzato',
    'Cocktail', 'Cena servita 2 portate', 'Cena servita 3 portate', 'Cena servita 4 portate',
    'Cena servita', 'Beverage', 'Personale', 'Attrezzature', 'Trasporto', 'Altro',
  ],
  audio_video: [
    'Audio', 'Video', 'Luci', 'Ledwall', 'Regia', 'Tecnici',
    'Palco', 'Trasporto', 'Montaggio/smontaggio', 'Altro',
  ],
  experience: [
    'Affitto location', 'Spazi interni', 'Spazi esterni',
    'Pulizie', 'Security', 'Extra orario', 'Altro',
  ],
}

const AREA_OPTIONS = ['indoor', 'outdoor', 'rooftop']

function parseNum(value: string | number): number {
  if (typeof value === 'number') return value
  return parseFloat(String(value).replace(',', '.')) || 0
}

function fmt(n: number): string {
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function needsAreaField(voce: string, category: string): boolean {
  if (category !== 'hotel' && category !== 'ristorante') return false
  const lower = voce.toLowerCase()
  return lower.includes('area riservata') || lower.includes('esclusiva')
}

function emptyItem(voce = '', sezione = ''): BudgetItem {
  return {
    voce,
    descrizione: '',
    area: '',
    categoria_sezione: sezione,
    quantita: 0,
    pax: 0,
    costo_unitario: 0,
    venduto_unitario: 0,
    iva_percentuale: 22,
    commissione_percentuale: 0,
    totale_costo: 0,
    totale_venduto: 0,
    margine: 0,
    note: '',
  }
}

export default function SupplierCostModal({ eventName, linkId, supplierName, category, onClose, onSaved }: SupplierCostModalProps) {
  const [items, setItems] = useState<BudgetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [customVoce, setCustomVoce] = useState('')

  const vociDisponibili = useMemo(() => {
    return VOCI_PER_CATEGORIA[category] || ['Altro']
  }, [category])

  useEffect(() => {
    loadItems()
  }, [linkId])

  async function loadItems() {
    setLoading(true)
    const { data, error } = await supabase
      .from('event_suppliers')
      .select('budget_items')
      .eq('id', linkId)
      .maybeSingle()
    if (!error && data?.budget_items) {
      setItems(Array.isArray(data.budget_items) ? data.budget_items : [])
    }
    setLoading(false)
  }

  function recalc(item: BudgetItem): BudgetItem {
    const multiplier = item.quantita * (item.pax > 0 ? item.pax : 1)
    const totale_costo = multiplier * item.costo_unitario
    const totale_venduto = multiplier * item.venduto_unitario
    return { ...item, totale_costo, totale_venduto, margine: totale_venduto - totale_costo }
  }

  function updateItem(idx: number, field: keyof BudgetItem, value: string | number) {
    setItems(prev => {
      const updated = [...prev]
      const item = { ...updated[idx] }
      if (field === 'quantita' || field === 'pax' || field === 'costo_unitario' || field === 'venduto_unitario' || field === 'iva_percentuale' || field === 'commissione_percentuale') {
        (item as any)[field] = parseNum(value as string)
      } else {
        (item as any)[field] = value
      }
      updated[idx] = recalc(item)
      return updated
    })
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const defaultSezione = useMemo(() => {
    const map: Record<string, string> = {
      hotel: 'Pernottamento',
      ristorante: 'F&B',
      catering: 'F&B',
      audio_video: 'Audio Video',
      experience: 'Altro',
      transfer: 'Transfer',
      allestimenti: 'Allestimenti',
      staff_interno: 'Staff',
      staff_esterno: 'Staff',
      grafica_stampa: 'Grafica',
    }
    return map[category] || 'Altro'
  }, [category])

  function addVoce(voce: string) {
    if (!voce.trim()) return
    setItems(prev => [...prev, emptyItem(voce.trim(), defaultSezione)])
    setCustomVoce('')
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('event_suppliers')
      .update({ budget_items: items })
      .eq('id', linkId)
    setSaving(false)
    if (!error) {
      setSaved(true)
      onSaved?.()
      setTimeout(() => setSaved(false), 2000)
    }
  }

  const totals = useMemo(() => {
    let costo = 0, venduto = 0
    for (const it of items) {
      costo += it.totale_costo
      venduto += it.totale_venduto
    }
    return { costo, venduto, margine: venduto - costo, marginePct: venduto > 0 ? ((venduto - costo) / venduto) * 100 : 0 }
  }, [items])

  function exportExcel() {
    const rows = items.map(it => ({
      'Fornitore': supplierName,
      'Sezione': it.categoria_sezione,
      'Voce': it.voce,
      'Descrizione': it.descrizione,
      'Qtà/Notti': it.quantita,
      'Pax': it.pax,
      'Costo Unitario': it.costo_unitario,
      'Totale Costo': it.totale_costo,
      'Venduto Unitario': it.venduto_unitario,
      'Totale Venduto': it.totale_venduto,
      'Margine': it.margine,
      'IVA %': it.iva_percentuale,
      'Comm. %': it.commissione_percentuale,
      'Note': it.note,
    }))
    rows.push({
      'Fornitore': '',
      'Sezione': '',
      'Voce': 'TOTALE',
      'Descrizione': '',
      'Qtà/Notti': 0,
      'Pax': 0,
      'Costo Unitario': 0,
      'Totale Costo': totals.costo,
      'Venduto Unitario': 0,
      'Totale Venduto': totals.venduto,
      'Margine': totals.margine,
      'IVA %': 0,
      'Comm. %': 0,
      'Note': '',
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const colWidths = [20, 14, 24, 24, 10, 8, 14, 14, 14, 14, 12, 8, 8, 20]
    ws['!cols'] = colWidths.map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Costi Fornitore')
    XLSX.writeFile(wb, `Costi_${supplierName.replace(/\s+/g, '_')}_${eventName.replace(/\s+/g, '_')}.xlsx`)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 flex-shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Gestisci Costi</h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{supplierName} - {category}</p>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:bg-white/5"
                style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}>
                <Download className="w-3.5 h-3.5" /> Excel
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5">
              <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--red2)', borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <>
              {/* Add voice buttons */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>Aggiungi voce</p>
                <div className="flex flex-wrap gap-1.5">
                  {vociDisponibili.map(v => (
                    <button key={v} onClick={() => addVoce(v)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.02]"
                      style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                      + {v}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="text" value={customVoce} onChange={e => setCustomVoce(e.target.value)}
                    placeholder="Voce personalizzata..."
                    onKeyDown={e => { if (e.key === 'Enter') addVoce(customVoce) }}
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                  <button onClick={() => addVoce(customVoce)} disabled={!customVoce.trim()}
                    className="px-3 py-2 rounded-lg text-xs font-medium"
                    style={{ background: customVoce.trim() ? 'var(--red2)' : 'var(--panel2)', color: customVoce.trim() ? 'white' : 'var(--muted)' }}>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Items table */}
              {items.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                    Voci economiche ({items.length})
                  </p>
                  {items.map((item, idx) => (
                    <div key={idx} className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{item.voce}</span>
                        <button onClick={() => removeItem(idx)} className="p-1.5 rounded-lg hover:bg-white/10">
                          <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Sezione</label>
                          <select value={item.categoria_sezione} onChange={e => updateItem(idx, 'categoria_sezione', e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                            <option value="">--</option>
                            {SEZIONI_BUDGET.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Descrizione</label>
                          <input type="text" value={item.descrizione} onChange={e => updateItem(idx, 'descrizione', e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        {needsAreaField(item.voce, category) && (
                          <div>
                            <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Area</label>
                            <select value={item.area} onChange={e => updateItem(idx, 'area', e.target.value)}
                              className="w-full px-2.5 py-2 rounded-lg text-xs"
                              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                              <option value="">--</option>
                              {AREA_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Qtà / Notti</label>
                          <input type="text" inputMode="decimal" value={item.quantita || ''} onChange={e => updateItem(idx, 'quantita', e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Pax</label>
                          <input type="text" inputMode="decimal" value={item.pax || ''} onChange={e => updateItem(idx, 'pax', e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Costo unitario</label>
                          <input type="text" inputMode="decimal" value={item.costo_unitario || ''} onChange={e => updateItem(idx, 'costo_unitario', e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Venduto unitario</label>
                          <input type="text" inputMode="decimal" value={item.venduto_unitario || ''} onChange={e => updateItem(idx, 'venduto_unitario', e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>IVA %</label>
                          <input type="text" inputMode="decimal" value={item.iva_percentuale || ''} onChange={e => updateItem(idx, 'iva_percentuale', e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Comm. %</label>
                          <input type="text" inputMode="decimal" value={item.commissione_percentuale || ''} onChange={e => updateItem(idx, 'commissione_percentuale', e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Note</label>
                          <input type="text" value={item.note || ''} onChange={e => updateItem(idx, 'note', e.target.value)}
                            className="w-full px-2.5 py-2 rounded-lg text-xs"
                            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Totali</label>
                          <div className="flex items-center gap-3 text-xs py-2">
                            <span style={{ color: 'var(--red2)' }}>C: {fmt(item.totale_costo)}</span>
                            <span style={{ color: 'var(--green)' }}>V: {fmt(item.totale_venduto)}</span>
                            <span style={{ color: item.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>
                              M: {fmt(item.margine)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals summary */}
              {items.length > 0 && (
                <div className="p-4 rounded-xl" style={{ background: 'rgba(208,0,58,0.05)', border: '1px solid rgba(208,0,58,0.15)' }}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Totale Costi</p>
                      <p className="text-base font-bold mt-1" style={{ color: 'var(--red2)' }}>{fmt(totals.costo)} &euro;</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Totale Venduto</p>
                      <p className="text-base font-bold mt-1" style={{ color: 'var(--green)' }}>{fmt(totals.venduto)} &euro;</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Margine</p>
                      <p className="text-base font-bold mt-1" style={{ color: totals.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>
                        {fmt(totals.margine)} &euro;
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Margine %</p>
                      <p className="text-base font-bold mt-1" style={{ color: totals.marginePct >= 0 ? 'var(--green)' : 'var(--red2)' }}>
                        {totals.marginePct.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 flex-shrink-0" style={{ borderTop: '1px solid var(--line)' }}>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
            Chiudi
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: saved ? 'rgba(56,210,125,0.15)' : 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
              color: saved ? 'var(--green)' : 'white',
              opacity: saving ? 0.6 : 1,
            }}>
            {saved ? <><Check className="w-4 h-4" /> Salvato</> : <><Euro className="w-4 h-4" /> Salva costi</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Budget Summary Component ────────────────────────────────────────────────

interface BudgetSummaryProps {
  eventId: string
  eventName: string
  suppliers: { id: string; nome: string; categoria: string }[]
}

export function EventBudgetSummary({ eventId, eventName, suppliers }: BudgetSummaryProps) {
  const [allItems, setAllItems] = useState<{ supplier: string; categoria: string; items: BudgetItem[] }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [eventId])

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase
      .from('event_suppliers')
      .select('supplier_id, service_category, budget_items')
      .eq('event_id', eventId)
    if (data) {
      const mapped = data
        .filter(d => Array.isArray(d.budget_items) && d.budget_items.length > 0)
        .map(d => {
          const sup = suppliers.find(s => s.id === d.supplier_id)
          return {
            supplier: sup?.nome ?? d.supplier_id,
            categoria: d.service_category || sup?.categoria || '',
            items: d.budget_items as BudgetItem[],
          }
        })
      setAllItems(mapped)
    }
    setLoading(false)
  }

  const totals = useMemo(() => {
    let costo = 0, venduto = 0
    for (const group of allItems) {
      for (const it of group.items) {
        costo += it.totale_costo
        venduto += it.totale_venduto
      }
    }
    return { costo, venduto, margine: venduto - costo, marginePct: venduto > 0 ? ((venduto - costo) / venduto) * 100 : 0 }
  }, [allItems])

  function exportFullExcel() {
    const rows: Record<string, any>[] = []
    for (const group of allItems) {
      for (const it of group.items) {
        rows.push({
          'Fornitore': group.supplier,
          'Sezione': it.categoria_sezione || group.categoria,
          'Voce': it.voce,
          'Descrizione': it.descrizione,
          'Qtà/Notti': it.quantita,
          'Pax': it.pax || 0,
          'Costo Unitario': it.costo_unitario,
          'Totale Costo': it.totale_costo,
          'Venduto Unitario': it.venduto_unitario,
          'Totale Venduto': it.totale_venduto,
          'Margine': it.margine,
          'IVA %': it.iva_percentuale,
          'Comm. %': it.commissione_percentuale || 0,
          'Note': it.note || '',
        })
      }
    }
    if (rows.length === 0) return
    rows.push({
      'Fornitore': '', 'Sezione': '', 'Voce': 'TOTALE', 'Descrizione': '',
      'Qtà/Notti': '', 'Pax': '', 'Costo Unitario': '', 'Totale Costo': totals.costo,
      'Venduto Unitario': '', 'Totale Venduto': totals.venduto, 'Margine': totals.margine,
      'IVA %': '', 'Comm. %': '', 'Note': '',
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [20, 14, 24, 24, 10, 8, 14, 14, 14, 14, 12, 8, 8, 20].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Budget Fornitori Evento')
    XLSX.writeFile(wb, `Budget_Fornitori_${eventName.replace(/\s+/g, '_')}.xlsx`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--red2)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (allItems.length === 0) {
    return (
      <div className="text-center py-8">
        <Euro className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--muted)', opacity: 0.4 }} />
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun costo fornitore inserito per questo evento.</p>
        <p className="text-xs mt-1" style={{ color: 'var(--muted)', opacity: 0.6 }}>Usa "Gestisci costi" su ogni fornitore per aggiungere voci.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Totale Costi</p>
          <p className="text-lg font-bold mt-1" style={{ color: 'var(--red2)' }}>{fmt(totals.costo)} &euro;</p>
        </div>
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Totale Venduto</p>
          <p className="text-lg font-bold mt-1" style={{ color: 'var(--green)' }}>{fmt(totals.venduto)} &euro;</p>
        </div>
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Margine</p>
          <p className="text-lg font-bold mt-1" style={{ color: totals.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>
            {fmt(totals.margine)} &euro;
          </p>
        </div>
        <div className="p-4 rounded-xl text-center" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Margine %</p>
          <p className="text-lg font-bold mt-1" style={{ color: totals.marginePct >= 0 ? 'var(--green)' : 'var(--red2)' }}>
            {totals.marginePct.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Export button */}
      <div className="flex justify-end">
        <button onClick={exportFullExcel}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all hover:bg-white/5"
          style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}>
          <Download className="w-3.5 h-3.5" /> Export Excel Budget Fornitori
        </button>
      </div>

      {/* Detail per supplier */}
      {allItems.map((group, gi) => {
        const gCosto = group.items.reduce((s, it) => s + it.totale_costo, 0)
        const gVenduto = group.items.reduce((s, it) => s + it.totale_venduto, 0)
        const gMargine = gVenduto - gCosto
        return (
          <div key={gi} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--panel)' }}>
              <div>
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{group.supplier}</span>
                <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>{group.categoria}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span style={{ color: 'var(--red2)' }}>C: {fmt(gCosto)}</span>
                <span style={{ color: 'var(--green)' }}>V: {fmt(gVenduto)}</span>
                <span style={{ color: gMargine >= 0 ? 'var(--green)' : 'var(--red2)' }}>M: {fmt(gMargine)}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--panel2)' }}>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: 'var(--muted)' }}>Voce</th>
                    <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--muted)' }}>Qtà</th>
                    <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--muted)' }}>Pax</th>
                    <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--muted)' }}>Costo U.</th>
                    <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--muted)' }}>Venduto U.</th>
                    <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--muted)' }}>IVA</th>
                    <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--muted)' }}>Comm.</th>
                    <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--muted)' }}>Tot. Costo</th>
                    <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--muted)' }}>Tot. Venduto</th>
                    <th className="px-3 py-2 text-right font-medium" style={{ color: 'var(--muted)' }}>Margine</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((it, ii) => (
                    <tr key={ii} style={{ borderTop: '1px solid var(--line)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--text)' }}>{it.voce}{it.area ? ` (${it.area})` : ''}</td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--text)' }}>{it.quantita}</td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--text)' }}>{it.pax || '-'}</td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--text)' }}>{fmt(it.costo_unitario)} &euro;</td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--text)' }}>{fmt(it.venduto_unitario)} &euro;</td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--muted)' }}>{it.iva_percentuale}%</td>
                      <td className="px-3 py-2 text-right" style={{ color: 'var(--muted)' }}>{it.commissione_percentuale || 0}%</td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--red2)' }}>{fmt(it.totale_costo)} &euro;</td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--green)' }}>{fmt(it.totale_venduto)} &euro;</td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: it.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmt(it.margine)} &euro;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
