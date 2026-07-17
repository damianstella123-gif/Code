import { useState, useEffect, useMemo } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { normalizzaImporto } from '@/lib/event-economics'
import {
  fetchLineRecord,
  recordToEditableData,
  saveLine,
  hasSupplierField,
  hasCommissionFields,
  getTableMap,
  type EditableLineData,
} from '@/lib/economic-lines-service'

interface Supplier {
  id: string
  nome: string
  categoria: string
}

interface Props {
  lineId: string
  table: string
  categoria: string
  suppliers: Supplier[]
  onClose: () => void
  onSaved: () => void
}

const TABLE_LABELS: Record<string, string> = {
  event_supplier_services: 'Transfer / Servizi',
  event_hotel_details: 'Hotel',
  event_restaurant_details: 'Ristorante',
  event_experience_details: 'Location / Experience',
  event_catering_details: 'Catering',
  event_staff_interno_details: 'Staff Interno',
  event_staff_esterno_details: 'Staff Esterno',
  event_audio_video_details: 'Audio / Video',
  event_allestimenti_details: 'Allestimenti',
  event_grafica_stampa_details: 'Grafica / Stampa',
  event_varie_details: 'Varie',
}

export default function BudgetLineEditModal({ lineId, table, categoria, suppliers, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<EditableLineData | null>(null)
  const [costoTotaleManual, setCostoTotaleManual] = useState(false)
  const [vendutoTotaleManual, setVendutoTotaleManual] = useState(false)

  useEffect(() => {
    (async () => {
      const record = await fetchLineRecord(table, lineId)
      if (!record) {
        setError('Record non trovato')
        setLoading(false)
        return
      }
      const editable = recordToEditableData(table, record)
      if (!editable) {
        setError('Tabella non supportata')
        setLoading(false)
        return
      }
      setData(editable)
      // Detect if totals are manually set (differ from qty * unit)
      const map = getTableMap(table)
      if (map?.costoUnitario && editable.costoUnitario != null && editable.quantita > 0) {
        const calc = editable.costoUnitario * editable.quantita
        if (Math.abs(calc - editable.costoTotale) > 0.01) setCostoTotaleManual(true)
      }
      if (map?.vendutoUnitario && editable.vendutoUnitario != null && editable.quantita > 0) {
        const calc = editable.vendutoUnitario * editable.quantita
        if (Math.abs(calc - editable.vendutoTotale) > 0.01) setVendutoTotaleManual(true)
      }
      setLoading(false)
    })()
  }, [lineId, table])

  const preview = useMemo(() => {
    if (!data) return null
    const vendutoNetto = normalizzaImporto(data.vendutoTotale, data.aliquotaIvaVenduto, data.ivaInclusaVenduto)
    const costoNetto = normalizzaImporto(data.costoTotale, data.aliquotaIvaCosto, data.ivaInclusaCosto)
    let commissione = 0
    if (data.commissioneImporto && data.commissioneImporto > 0) {
      commissione = data.commissioneImporto
    } else if (data.commissionePct && data.commissionePct > 0 && costoNetto > 0) {
      commissione = costoNetto * data.commissionePct / 100
    }
    const margine = vendutoNetto - costoNetto
    const marginePct = vendutoNetto > 0 ? (margine / vendutoNetto) * 100 : 0
    return { vendutoNetto, costoNetto, commissione, margine, marginePct }
  }, [data])

  function updateField<K extends keyof EditableLineData>(field: K, value: EditableLineData[K]) {
    if (!data) return
    const next = { ...data, [field]: value }

    // Recalculate totals from unitario * qty if not manual
    const map = getTableMap(table)
    if (field === 'quantita' || field === 'costoUnitario') {
      if (!costoTotaleManual && map?.costoUnitario && next.costoUnitario != null && next.quantita > 0) {
        next.costoTotale = next.costoUnitario * next.quantita
      }
    }
    if (field === 'quantita' || field === 'vendutoUnitario') {
      if (!vendutoTotaleManual && map?.vendutoUnitario && next.vendutoUnitario != null && next.quantita > 0) {
        next.vendutoTotale = next.vendutoUnitario * next.quantita
      }
    }
    setData(next)
  }

  function handleCostoTotaleChange(val: number) {
    if (!data) return
    setCostoTotaleManual(true)
    setData({ ...data, costoTotale: val })
  }

  function handleVendutoTotaleChange(val: number) {
    if (!data) return
    setVendutoTotaleManual(true)
    setData({ ...data, vendutoTotale: val })
  }

  function resetCostoCalc() {
    if (!data) return
    const map = getTableMap(table)
    if (map?.costoUnitario && data.costoUnitario != null && data.quantita > 0) {
      setCostoTotaleManual(false)
      setData({ ...data, costoTotale: data.costoUnitario * data.quantita })
    }
  }

  function resetVendutoCalc() {
    if (!data) return
    const map = getTableMap(table)
    if (map?.vendutoUnitario && data.vendutoUnitario != null && data.quantita > 0) {
      setVendutoTotaleManual(false)
      setData({ ...data, vendutoTotale: data.vendutoUnitario * data.quantita })
    }
  }

  async function handleSave() {
    if (!data) return
    setError('')
    setSaving(true)
    const result = await saveLine(data)
    setSaving(false)
    if (!result.success) {
      setError(result.error || 'Errore sconosciuto')
      return
    }
    onSaved()
  }

  const map = getTableMap(table)
  const showSupplier = hasSupplierField(table)
  const isHotelRoom = table === 'event_hotel_details' && data?.hotelRoomFields?.tipo === 'pernottamento' && !!data?.hotelRoomFields?.payment_mode

  function fmt(n: number) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n)
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'var(--card)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Modifica voce economica</h3>
            <div className="flex gap-3 mt-1">
              <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>{categoria}</span>
              <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>{TABLE_LABELS[table] || table}</span>
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

        {!loading && error && !data && (
          <div className="text-center py-8">
            <p className="text-sm" style={{ color: 'var(--red2)' }}>{error}</p>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Hotel room info banner */}
            {isHotelRoom && (
              <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: 'var(--blue)' }}>
                Pernottamento con gestione camere. I campi camere/tariffe non vengono modificati da questo pannello.
                <div className="mt-1" style={{ color: 'var(--muted)' }}>
                  Tipo: {String(data.hotelRoomFields?.room_type || '-')} |
                  Camere cliente: {String(data.hotelRoomFields?.rooms_client_count || 0)} |
                  Camere Simmetria: {String(data.hotelRoomFields?.rooms_simmetria_count || 0)}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              {/* Descrizione */}
              <div className="sm:col-span-2">
                <FieldLabel label="Descrizione" />
                <input
                  type="text"
                  value={data.descrizione}
                  onChange={e => updateField('descrizione', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>

              {/* Fornitore */}
              {showSupplier && (
                <div className="sm:col-span-2">
                  <FieldLabel label="Fornitore" />
                  <select
                    value={data.supplierId}
                    onChange={e => updateField('supplierId', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                  >
                    <option value="">— Nessun fornitore —</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quantita */}
              <div>
                <FieldLabel label={table === 'event_restaurant_details' ? 'Pax confermati' : table === 'event_experience_details' || table === 'event_catering_details' ? 'Pax' : 'Quantita'} />
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={data.quantita}
                  onChange={e => updateField('quantita', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>

              <div /> {/* spacer */}

              {/* Costo unitario */}
              {map?.costoUnitario && (
                <div>
                  <FieldLabel label="Costo unitario" />
                  <input
                    type="number"
                    step="any"
                    value={data.costoUnitario ?? ''}
                    onChange={e => updateField('costoUnitario', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                  />
                </div>
              )}

              {/* Costo totale */}
              <div>
                <div className="flex items-center gap-2">
                  <FieldLabel label="Costo totale" />
                  {costoTotaleManual && map?.costoUnitario && (
                    <button onClick={resetCostoCalc} className="text-[10px] underline" style={{ color: 'var(--blue)' }}>Ricalcola</button>
                  )}
                  {costoTotaleManual && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,194,75,0.1)', color: 'var(--yellow)' }}>manuale</span>}
                </div>
                <input
                  type="number"
                  step="any"
                  value={data.costoTotale}
                  onChange={e => handleCostoTotaleChange(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>

              {/* Venduto unitario */}
              {map?.vendutoUnitario && (
                <div>
                  <FieldLabel label="Venduto unitario" />
                  <input
                    type="number"
                    step="any"
                    value={data.vendutoUnitario ?? ''}
                    onChange={e => updateField('vendutoUnitario', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                  />
                </div>
              )}

              {/* Venduto totale */}
              <div>
                <div className="flex items-center gap-2">
                  <FieldLabel label="Venduto totale" />
                  {vendutoTotaleManual && map?.vendutoUnitario && (
                    <button onClick={resetVendutoCalc} className="text-[10px] underline" style={{ color: 'var(--blue)' }}>Ricalcola</button>
                  )}
                  {vendutoTotaleManual && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,194,75,0.1)', color: 'var(--yellow)' }}>manuale</span>}
                </div>
                <input
                  type="number"
                  step="any"
                  value={data.vendutoTotale}
                  onChange={e => handleVendutoTotaleChange(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>

              {/* IVA Costo */}
              <div>
                <FieldLabel label="Aliquota IVA costo (%)" />
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={data.aliquotaIvaCosto}
                  onChange={e => updateField('aliquotaIvaCosto', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>
              <div>
                <FieldLabel label="IVA inclusa nel costo" />
                <select
                  value={data.ivaInclusaCosto ? 'true' : 'false'}
                  onChange={e => updateField('ivaInclusaCosto', e.target.value === 'true')}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                >
                  <option value="false">Esclusa</option>
                  <option value="true">Inclusa</option>
                </select>
              </div>

              {/* IVA Venduto */}
              <div>
                <FieldLabel label="Aliquota IVA venduto (%)" />
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={data.aliquotaIvaVenduto}
                  onChange={e => updateField('aliquotaIvaVenduto', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>
              <div>
                <FieldLabel label="IVA inclusa nel venduto" />
                <select
                  value={data.ivaInclusaVenduto ? 'true' : 'false'}
                  onChange={e => updateField('ivaInclusaVenduto', e.target.value === 'true')}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                >
                  <option value="false">Esclusa</option>
                  <option value="true">Inclusa</option>
                </select>
              </div>

              {/* Commissione */}
              {hasCommissionFields(table) && (
                <>
                  <div>
                    <FieldLabel label="Commissione %" />
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={data.commissionePct ?? ''}
                      onChange={e => updateField('commissionePct', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                    />
                  </div>
                  <div>
                    <FieldLabel label="Commissione importo fisso" />
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={data.commissioneImporto ?? ''}
                      onChange={e => updateField('commissioneImporto', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                    />
                  </div>
                </>
              )}

              {/* Note */}
              <div className="sm:col-span-2">
                <FieldLabel label="Note" />
                <textarea
                  value={data.note}
                  onChange={e => updateField('note', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>
            </div>

            {/* Preview economica */}
            {preview && (
              <div className="mb-5 p-3 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--muted)' }}>ANTEPRIMA ECONOMICA (netto IVA)</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <PreviewKpi label="Venduto netto" value={fmt(preview.vendutoNetto)} />
                  <PreviewKpi label="Costo netto" value={fmt(preview.costoNetto)} />
                  {hasCommissionFields(table) && <PreviewKpi label="Commissione" value={fmt(preview.commissione)} />}
                  <PreviewKpi label="Margine" value={fmt(preview.margine)} color={preview.margine >= 0 ? 'var(--green)' : 'var(--red2)'} />
                  <PreviewKpi label="Margine %" value={`${preview.marginePct.toFixed(1)}%`} color={preview.marginePct >= 0 ? 'var(--green)' : 'var(--red2)'} />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--red2)' }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
                style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FieldLabel({ label }: { label: string }) {
  return <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--muted)' }}>{label}</label>
}

function PreviewKpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px]" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-xs font-medium" style={{ color: color || 'var(--text)' }}>{value}</p>
    </div>
  )
}
