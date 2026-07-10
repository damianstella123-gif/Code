import { useState, useEffect, useMemo, useCallback } from 'react'
import { Star, Download, Leaf } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadUser } from '@/lib/auth'
import { fmtShort } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Supplier } from '@/data/suppliers'

// DEFRA 2024 emission factors (kg CO2 per km per person)
const FACTORS: Record<string, number> = {
  auto: 0.170,
  treno: 0.041,
  aereo: 0.255,
  misto: (0.170 + 0.041) / 2,
}

// Supplier category CO2 factors by score (kg CO2 per pax)
function supplierCO2(categoria: string, score: number, pax: number): number {
  const cat = categoria.toLowerCase()
  if (cat.includes('hotel')) {
    const base = score >= 4 ? 11 : score >= 3 ? 21 : 31
    return base * pax
  }
  if (cat.includes('catering') || cat.includes('ristor')) {
    const base = score >= 4 ? 1.8 : score >= 3 ? 3 : 4.5
    return base * pax
  }
  if (cat.includes('location')) {
    const base = score >= 4 ? 0.8 : score >= 3 ? 1.5 : 2.1
    return base * pax
  }
  return 1 * pax
}

interface GreenData {
  id?: string
  event_id: string
  pax: number
  citta_provenienza: string
  mezzo_prevalente: string
  distanza_km: number
  supplier_scores: Record<string, number>
  note: string
}

interface SynergyData {
  totalKg: number
  byFonte: Record<string, number>
  count: number
  riunioniEvitate: number
}

export function TabGreenReport({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const user = loadUser()
  const [data, setData] = useState<GreenData>({
    event_id: event.id,
    pax: (event as any).pax || 0,
    citta_provenienza: '',
    mezzo_prevalente: 'misto',
    distanza_km: 0,
    supplier_scores: {},
    note: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [synergy, setSynergy] = useState<SynergyData>({ totalKg: 0, byFonte: {}, count: 0, riunioniEvitate: 0 })

  const eventSuppliers = useMemo(() => {
    return suppliers.filter(s => s.eventiId?.includes(event.id))
  }, [suppliers, event.id])

  useEffect(() => {
    loadGreenData()
    loadSynergyData()
  }, [event.id])

  async function loadGreenData() {
    const { data: row } = await supabase
      .from('event_green_data')
      .select('*')
      .eq('event_id', event.id)
      .maybeSingle()

    if (row) {
      setData({
        id: row.id,
        event_id: row.event_id,
        pax: row.pax || (event as any).pax || 0,
        citta_provenienza: row.citta_provenienza || '',
        mezzo_prevalente: row.mezzo_prevalente || 'misto',
        distanza_km: row.distanza_km || 0,
        supplier_scores: (row.supplier_scores as Record<string, number>) || {},
        note: row.note || '',
      })
    }
    setLoading(false)
  }

  async function loadSynergyData() {
    const { data: rows } = await supabase
      .from('impact_co2_log')
      .select('kg_co2_risparmiati, fonte, descrizione')
      .eq('event_id', event.id)

    if (rows && rows.length > 0) {
      const totalKg = rows.reduce((sum, r) => sum + Number(r.kg_co2_risparmiati), 0)
      const byFonte = rows.reduce((acc, r) => {
        acc[r.fonte] = (acc[r.fonte] || 0) + Number(r.kg_co2_risparmiati)
        return acc
      }, {} as Record<string, number>)
      const riunioniEvitate = rows.filter(r => r.fonte === 'riunione_evitata').length
      setSynergy({ totalKg, byFonte, count: rows.length, riunioniEvitate })
    } else {
      setSynergy({ totalKg: 0, byFonte: {}, count: 0, riunioniEvitate: 0 })
    }
  }

  const saveData = useCallback(async (updated: GreenData) => {
    setSaving(true)
    const payload = {
      event_id: event.id,
      pax: updated.pax,
      citta_provenienza: updated.citta_provenienza,
      mezzo_prevalente: updated.mezzo_prevalente,
      distanza_km: updated.distanza_km,
      supplier_scores: updated.supplier_scores,
      note: updated.note,
      updated_at: new Date().toISOString(),
      updated_by: user?.id || null,
    }

    if (updated.id) {
      await supabase.from('event_green_data').update(payload).eq('id', updated.id)
    } else {
      const { data: inserted } = await supabase.from('event_green_data').insert(payload).select('id').maybeSingle()
      if (inserted) {
        setData(prev => ({ ...prev, id: inserted.id }))
      }
    }
    setSaving(false)
  }, [event.id, user?.id])

  function updateField(field: keyof GreenData, value: any) {
    const updated = { ...data, [field]: value }
    setData(updated)
    saveData(updated)
  }

  // ─── Transport CO2 calculation ─────────────────────────────────────────────
  const co2Trasporti = useMemo(() => {
    const factor = FACTORS[data.mezzo_prevalente] || FACTORS.misto
    return data.pax * data.distanza_km * 2 * factor
  }, [data.pax, data.distanza_km, data.mezzo_prevalente])

  // ─── Supplier CO2 calculation ──────────────────────────────────────────────
  const co2Fornitori = useMemo(() => {
    let total = 0
    for (const s of eventSuppliers) {
      const score = data.supplier_scores[s.id] ?? 3
      total += supplierCO2(s.categoria, score, data.pax || 0)
    }
    return total
  }, [eventSuppliers, data.supplier_scores, data.pax])

  const co2Totale = co2Trasporti + co2Fornitori
  const impattoNetto = Math.max(0, co2Totale - synergy.totalKg)

  const avgScore = useMemo(() => {
    if (eventSuppliers.length === 0) return 0
    let sum = 0
    for (const s of eventSuppliers) {
      sum += data.supplier_scores[s.id] ?? 3
    }
    return sum / eventSuppliers.length
  }, [eventSuppliers, data.supplier_scores])

  // ─── PDF Export ────────────────────────────────────────────────────────────
  async function handleDownloadPdf() {
    const jsPDFModule = await import('jspdf')
    const doc = new jsPDFModule.default()

    doc.setFontSize(18)
    doc.text('GREEN REPORT', 20, 25)
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text('Simmetria Synergy', 20, 32)

    doc.setTextColor(0)
    doc.setFontSize(12)
    doc.text(`Evento: ${event.nome}`, 20, 45)
    doc.setFontSize(10)
    doc.text(`Data: ${fmtShort(event.dataInizio)} - ${fmtShort(event.dataFine)}`, 20, 52)
    doc.text(`Partecipanti: ${data.pax}`, 20, 58)

    doc.setFontSize(11)
    doc.text('RIEPILOGO IMPATTO AMBIENTALE', 20, 72)
    doc.setDrawColor(200)
    doc.line(20, 74, 190, 74)

    doc.setFontSize(10)
    doc.text(`CO2 Trasporti: ${co2Trasporti.toFixed(0)} kg`, 20, 82)
    doc.text(`CO2 Fornitori: ${co2Fornitori.toFixed(0)} kg`, 20, 89)
    doc.setFontSize(12)
    doc.text(`TOTALE EVENTO: ${co2Totale.toFixed(0)} kg CO2`, 20, 100)

    // Synergy contribution section
    let yPos = 112
    doc.setFontSize(11)
    doc.setTextColor(34, 139, 34)
    doc.text('CONTRIBUTO DIGITALE SYNERGY', 20, yPos)
    doc.setDrawColor(34, 139, 34)
    doc.line(20, yPos + 2, 190, yPos + 2)
    yPos += 12

    doc.setFontSize(10)
    doc.setTextColor(34, 139, 34)
    doc.text(`CO2 risparmiata: -${synergy.totalKg.toFixed(0)} kg`, 20, yPos)
    yPos += 7
    doc.setTextColor(80)
    doc.text(`Documenti digitali: ${(synergy.byFonte.documento_digitale || 0).toFixed(0)} kg`, 24, yPos)
    yPos += 6
    doc.text(`Comunicazioni interne: ${(synergy.byFonte.comunicazione_interna || 0).toFixed(0)} kg`, 24, yPos)
    yPos += 6
    doc.text(`Riunioni evitate: ${(synergy.byFonte.riunione_evitata || 0).toFixed(0)} kg`, 24, yPos)
    yPos += 6
    doc.text(`Fogli carta risparmiati: ~${Math.round(synergy.totalKg * 120)}`, 24, yPos)
    yPos += 12

    // Net impact
    doc.setFontSize(12)
    doc.setTextColor(0)
    doc.text(`IMPATTO NETTO: ${impattoNetto.toFixed(0)} kg CO2`, 20, yPos)
    yPos += 12

    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`= ${Math.ceil(impattoNetto / 21)} alberi salvati`, 20, yPos)
    yPos += 6
    doc.text(`= ${Math.round(impattoNetto * 6)} km in auto non percorsi`, 20, yPos)
    yPos += 6
    doc.text(`= ${(impattoNetto / 45).toFixed(1)} voli Roma-Milano equivalenti`, 20, yPos)
    yPos += 12

    if (avgScore > 3 && eventSuppliers.length > 0) {
      doc.setTextColor(34, 139, 34)
      doc.text('EVENTO SOSTENIBILE +', 20, yPos)
      yPos += 10
    }

    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text('Questo report e stato generato con Fly AI di Simmetria Synergy', 20, 270)
    doc.text('Metodologia DEFRA 2024 | I dati Synergy sono calcolati tramite tracciamento automatico delle attivita digitali', 20, 275)

    doc.save(`green-report-${event.nome.replace(/\s+/g, '-').toLowerCase()}.pdf`)
  }

  if (loading) {
    return (
      <div className="panel p-10 text-center">
        <div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento Green Report...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--green) 12%, transparent)' }}>
            <Leaf className="w-4 h-4" style={{ color: 'var(--green)' }} />
          </div>
          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--green)', fontWeight: 600 }}>
              GREEN REPORT
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>
              Impatto ambientale stimato dell'evento
            </p>
          </div>
        </div>
        {saving && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>Salvataggio...</span>}
      </div>

      {/* TRASPORTI */}
      <div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '12px' }}>
          TRASPORTI PARTECIPANTI
        </p>
        <div style={{ border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>N. Partecipanti</label>
              <input
                type="number"
                value={data.pax || ''}
                onChange={e => updateField('pax', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg focus:outline-none"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)' }}
              />
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Citta provenienza</label>
              <input
                type="text"
                value={data.citta_provenienza}
                onChange={e => updateField('citta_provenienza', e.target.value)}
                placeholder="es. Milano"
                className="w-full px-3 py-2 rounded-lg focus:outline-none"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)' }}
              />
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Mezzo prevalente</label>
              <select
                value={data.mezzo_prevalente}
                onChange={e => updateField('mezzo_prevalente', e.target.value)}
                className="w-full px-3 py-2 rounded-lg focus:outline-none"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)' }}
              >
                <option value="auto">Auto</option>
                <option value="treno">Treno</option>
                <option value="aereo">Aereo</option>
                <option value="misto">Misto</option>
              </select>
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Distanza media (km)</label>
              <input
                type="number"
                value={data.distanza_km || ''}
                onChange={e => updateField('distanza_km', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg focus:outline-none"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)' }}
              />
            </div>
          </div>

          {/* Result */}
          <div style={{ marginTop: '20px', textAlign: 'center', padding: '16px', borderTop: '1px solid var(--line)' }}>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 700, color: 'var(--text)' }}>
              {co2Trasporti.toFixed(0)} <span style={{ fontSize: '14px', fontWeight: 400 }}>kg CO2</span>
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              = {Math.round(co2Trasporti * 6)} km in auto
            </p>
          </div>
        </div>
      </div>

      {/* FORNITORI */}
      <div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '12px' }}>
          FORNITORI & SCELTE GREEN
        </p>
        <div style={{ border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden' }}>
          {eventSuppliers.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)' }}>
              Nessun fornitore collegato all'evento
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['Fornitore', 'Categoria', 'Carbon Score', 'CO2 stimata'].map(h => (
                    <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventSuppliers.map(s => {
                  const score = data.supplier_scores[s.id] ?? 3
                  const co2 = supplierCO2(s.categoria, score, data.pax || 0)
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>{s.nome}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>{s.categoria}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <StarRating
                          value={score}
                          onChange={v => {
                            const scores = { ...data.supplier_scores, [s.id]: v }
                            updateField('supplier_scores', scores)
                          }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                        {co2.toFixed(0)} kg
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--line)' }}>
                  <td colSpan={3} style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>
                    TOTALE FORNITORI
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    {co2Fornitori.toFixed(0)} kg
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* CONTRIBUTO SYNERGY */}
      <div style={{
        background: 'color-mix(in srgb, var(--green) 8%, transparent)',
        border: '1px solid var(--green)',
        borderRadius: 14,
        padding: '16px 20px',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '.12em',
          color: 'var(--green)',
          marginBottom: 8,
          textTransform: 'uppercase',
        }}>
          CONTRIBUTO SYNERGY
        </div>
        <div style={{
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--green)',
          fontFamily: 'var(--font-serif)',
        }}>
          -{synergy.totalKg.toFixed(0)} kg CO2
        </div>
        <p style={{
          fontSize: 13,
          color: 'var(--text)',
          marginTop: 8,
          lineHeight: 1.6,
        }}>
          {synergy.totalKg > 0
            ? `Gestendo questo evento con Synergy, il team ha evitato ${Math.round((synergy.byFonte.documento_digitale || 0) * 120)} stampe e ${synergy.riunioniEvitate} riunioni fisiche, risparmiando ${synergy.totalKg.toFixed(0)} kg CO2.`
            : 'Nessun contributo Synergy registrato per questo evento. I risparmi CO2 verranno tracciati automaticamente.'
          }
        </p>
        <div style={{
          display: 'flex',
          gap: 16,
          marginTop: 12,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--muted)',
          flexWrap: 'wrap',
        }}>
          <span>{Math.round(synergy.totalKg * 120)} fogli risparmiati</span>
          <span>{(synergy.byFonte.comunicazione_interna || 0).toFixed(0)} kg da comunicazioni digitali</span>
          <span>{(synergy.byFonte.riunione_evitata || 0).toFixed(0)} kg da riunioni evitate</span>
        </div>
      </div>

      {/* RIEPILOGO FINALE */}
      <div style={{ border: '1px solid var(--line)', borderRadius: '14px', padding: '24px', background: 'color-mix(in srgb, var(--green) 4%, transparent)' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '16px' }}>
          RIEPILOGO FINALE
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ marginBottom: '16px' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>CO2 TRASPORTI</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>{co2Trasporti.toFixed(0)} <span style={{ fontSize: '11px', fontWeight: 400 }}>kg</span></p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>CO2 FORNITORI</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>{co2Fornitori.toFixed(0)} <span style={{ fontSize: '11px', fontWeight: 400 }}>kg</span></p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>TOTALE EVENTO</p>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>{co2Totale.toFixed(0)} <span style={{ fontSize: '12px', fontWeight: 400 }}>kg CO2</span></p>
          </div>
        </div>

        {/* Impatto netto */}
        <div style={{
          marginTop: 12,
          padding: '10px 16px',
          borderRadius: 10,
          background: 'var(--panel2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted)',
          }}>
            IMPATTO NETTO (incluso Synergy)
          </span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 15,
            fontWeight: 700,
            color: impattoNetto < co2Totale ? 'var(--green)' : 'var(--text)',
          }}>
            {impattoNetto.toFixed(0)} kg CO2
          </span>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px', marginTop: '16px', marginBottom: '16px' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.8 }}>
            = {Math.ceil(impattoNetto / 21)} alberi salvati<br />
            = {Math.round(impattoNetto * 6)} km in auto non percorsi<br />
            = {(impattoNetto / 45).toFixed(1)} voli Roma-Milano equivalenti
          </p>
        </div>

        {avgScore > 3 && eventSuppliers.length > 0 && (
          <div style={{ display: 'inline-block', padding: '6px 12px', borderRadius: '8px', background: 'color-mix(in srgb, var(--green) 15%, transparent)', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: 'var(--green)' }}>
            EVENTO SOSTENIBILE +
          </div>
        )}
        {avgScore > 0 && avgScore < 2 && eventSuppliers.length > 0 && (
          <div style={{ display: 'inline-block', padding: '6px 12px', borderRadius: '8px', background: 'color-mix(in srgb, var(--yellow) 15%, transparent)', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: 'var(--yellow)' }}>
            Considera fornitori piu sostenibili
          </div>
        )}
      </div>

      {/* PDF Download */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={handleDownloadPdf}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all hover:scale-105"
          style={{ border: '1px solid var(--line)', color: 'var(--text)', background: 'transparent', fontFamily: 'var(--font-mono)' }}
        >
          <Download className="w-4 h-4" />
          Scarica PDF
        </button>
      </div>
    </div>
  )
}

// ─── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className="p-0.5 transition-transform hover:scale-110"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <Star
            className="w-4 h-4"
            style={{ color: n <= value ? 'var(--green)' : 'var(--line)', fill: n <= value ? 'var(--green)' : 'transparent' }}
          />
        </button>
      ))}
    </div>
  )
}
