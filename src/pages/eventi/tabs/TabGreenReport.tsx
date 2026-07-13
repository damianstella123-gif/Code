import { useState, useEffect, useMemo, useCallback } from 'react'
import { Star, Download, Leaf, Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadUser } from '@/lib/auth'
import { fmtShort } from '@/lib/format'
import { regenerateGreenReport, type GreenReport } from '@/lib/events-service'
import type { Event } from '@/data/events'
import type { Supplier } from '@/data/suppliers'

// DEFRA 2024 emission factors (kg CO2 per km per person)
const FACTORS: Record<string, number> = {
  auto: 0.170,
  treno: 0.041,
  aereo: 0.255,
  misto: (0.170 + 0.041) / 2,
}

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

interface FlyRoute {
  citta_origine: string
  n_partecipanti: number
  distanza_km: number
  mezzo: string
  co2_kg: number
  fonte_distanza: string
}

interface FlySupplier {
  nome: string
  categoria: string
  carbon_score: number
  certificazioni_trovate: string[]
  fonte_certificazione: string | null
  co2_kg: number
  alternativa_green: string | null
}

interface FlyGreenReport {
  trasporti: {
    fonte_dati: string
    documento_usato: string | null
    rotte: FlyRoute[]
    totale_co2_kg: number
    nota: string
  }
  fornitori: FlySupplier[]
  synergy_impact: {
    co2_risparmiata_kg: number
    breakdown: { documenti_digitali_kg: number; comunicazioni_interne_kg: number; riunioni_evitate_kg: number }
    equivalente_fogli_carta: number
    descrizione_it: string
    descrizione_en: string
  }
  totale_co2_kg: number
  impatto_netto_kg: number
  equivalenti: { alberi_salvati: number; km_auto: number; voli_roma_milano: number }
  narrativa_it: string
  narrativa_en: string
  fonti: string[]
}

export function TabGreenReport({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const user = loadUser()
  const [autoReport, setAutoReport] = useState<GreenReport | null>(null)
  const [recalculating, setRecalculating] = useState(false)
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
  const [flyReport, setFlyReport] = useState<FlyGreenReport | null>(null)
  const [generating, setGenerating] = useState(false)

  const eventSuppliers = useMemo(() => {
    return suppliers.filter(s => s.eventiId?.includes(event.id))
  }, [suppliers, event.id])

  useEffect(() => {
    loadGreenData()
    loadSynergyData()
    regenerateGreenReport(event.id).then(r => { if (r) setAutoReport(r) })
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

  // ─── Generate with Fly AI ──────────────────────────────────────────────────
  async function handleGenerateWithFly() {
    setGenerating(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) throw new Error('Non autenticato')

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fly-gateway`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: `Genera il green report per l'evento ${event.id}` }),
      })

      if (!res.ok) throw new Error(`Errore ${res.status}`)
      const result = await res.json()

      // The fly-gateway returns { reply } - try to extract JSON from it
      const replyText = result.reply || ''
      let parsed: FlyGreenReport | null = null

      // Try to find JSON in the reply
      const jsonMatch = replyText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch (_e) { /* ignore */ }
      }

      if (parsed && parsed.trasporti) {
        setFlyReport(parsed)
      }
    } catch (err) {
      console.error('Green report generation failed:', err)
    } finally {
      setGenerating(false)
    }
  }

  async function handleRecalculate() {
    setRecalculating(true)
    const r = await regenerateGreenReport(event.id)
    if (r) setAutoReport(r)
    setRecalculating(false)
  }

  // ─── Transport CO2 calculation ─────────────────────────────────────────────
  const co2Trasporti = useMemo(() => {
    const factor = FACTORS[data.mezzo_prevalente] || FACTORS.misto
    return data.pax * data.distanza_km * 2 * factor
  }, [data.pax, data.distanza_km, data.mezzo_prevalente])

  const co2Fornitori = useMemo(() => {
    let total = 0
    for (const s of eventSuppliers) {
      const score = data.supplier_scores[s.id] ?? 3
      total += supplierCO2(s.categoria, score, data.pax || 0)
    }
    return total
  }, [eventSuppliers, data.supplier_scores, data.pax])

  const co2Totale = flyReport?.totale_co2_kg ?? (co2Trasporti + co2Fornitori)
  const impattoNetto = flyReport?.impatto_netto_kg ?? Math.max(0, co2Totale - synergy.totalKg)

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

    // Auto-report summary
    if (autoReport) {
      doc.setFontSize(10)
      doc.text(`Score sostenibilita: ${autoReport.score_100.toFixed(0)}/100  |  Rifiuti: ${autoReport.waste_kg.toFixed(1)} kg  |  Acqua: ${autoReport.water_liters.toFixed(0)} L  |  Energia: ${autoReport.energy_kwh.toFixed(1)} kWh`, 20, 64)
    }

    doc.setFontSize(11)
    doc.text('RIEPILOGO IMPATTO AMBIENTALE', 20, autoReport ? 74 : 72)
    doc.setDrawColor(200)
    doc.line(20, autoReport ? 76 : 74, 190, autoReport ? 76 : 74)

    let yPos = autoReport ? 84 : 82
    doc.setFontSize(10)

    // If we have fly report with routes
    if (flyReport?.trasporti?.rotte?.length) {
      doc.text('TRASPORTI (per rotta):', 20, yPos)
      yPos += 7
      const sortedRoutes = [...flyReport.trasporti.rotte].sort((a, b) => b.co2_kg - a.co2_kg)
      for (const r of sortedRoutes.slice(0, 8)) {
        doc.text(`  ${r.citta_origine}: ${r.n_partecipanti} pax, ${r.distanza_km} km (${r.mezzo}) = ${r.co2_kg} kg CO2`, 20, yPos)
        yPos += 6
      }
      doc.text(`  TOTALE TRASPORTI: ${flyReport.trasporti.totale_co2_kg} kg`, 20, yPos)
      yPos += 8
    } else {
      doc.text(`CO2 Trasporti: ${co2Trasporti.toFixed(0)} kg`, 20, yPos)
      yPos += 7
      doc.text(`CO2 Fornitori: ${co2Fornitori.toFixed(0)} kg`, 20, yPos)
      yPos += 10
    }

    doc.setFontSize(12)
    doc.text(`TOTALE EVENTO: ${co2Totale.toFixed(0)} kg CO2`, 20, yPos)
    yPos += 12

    // Synergy contribution
    doc.setFontSize(11)
    doc.setTextColor(34, 139, 34)
    doc.text('CONTRIBUTO DIGITALE SYNERGY', 20, yPos)
    doc.setDrawColor(34, 139, 34)
    doc.line(20, yPos + 2, 190, yPos + 2)
    yPos += 12

    doc.setFontSize(10)
    doc.text(`CO2 risparmiata: -${synergy.totalKg.toFixed(0)} kg`, 20, yPos)
    yPos += 7
    doc.setTextColor(80)
    doc.text(`Documenti digitali: ${(synergy.byFonte.documento_digitale || 0).toFixed(0)} kg`, 24, yPos)
    yPos += 6
    doc.text(`Comunicazioni interne: ${(synergy.byFonte.comunicazione_interna || 0).toFixed(0)} kg`, 24, yPos)
    yPos += 6
    doc.text(`Riunioni evitate: ${(synergy.byFonte.riunione_evitata || 0).toFixed(0)} kg`, 24, yPos)
    yPos += 10

    // Net impact
    doc.setFontSize(12)
    doc.setTextColor(0)
    doc.text(`IMPATTO NETTO: ${impattoNetto.toFixed(0)} kg CO2`, 20, yPos)
    yPos += 10

    doc.setFontSize(9)
    doc.setTextColor(100)
    const equiv = flyReport?.equivalenti || { alberi_salvati: Math.ceil(impattoNetto / 21), km_auto: Math.round(impattoNetto * 6), voli_roma_milano: Number((impattoNetto / 45).toFixed(1)) }
    doc.text(`= ${equiv.alberi_salvati} alberi salvati`, 20, yPos)
    yPos += 6
    doc.text(`= ${equiv.km_auto} km in auto non percorsi`, 20, yPos)
    yPos += 6
    doc.text(`= ${equiv.voli_roma_milano} voli Roma-Milano equivalenti`, 20, yPos)
    yPos += 14

    // Fonti section
    if (flyReport?.fonti?.length) {
      doc.setFontSize(10)
      doc.setTextColor(0)
      doc.text('METODOLOGIA E FONTI', 20, yPos)
      doc.setDrawColor(200)
      doc.line(20, yPos + 2, 190, yPos + 2)
      yPos += 10
      doc.setFontSize(8)
      doc.setTextColor(80)
      for (const fonte of flyReport.fonti.slice(0, 10)) {
        const truncated = fonte.length > 90 ? fonte.slice(0, 87) + '...' : fonte
        doc.text(`- ${truncated}`, 22, yPos)
        yPos += 5
        if (yPos > 260) break
      }
      yPos += 6
    }

    // Auto-report recommendations
    if (autoReport?.recommendations?.length && yPos < 240) {
      doc.setFontSize(10)
      doc.setTextColor(0)
      doc.text('RACCOMANDAZIONI AUTOMATICHE', 20, yPos)
      doc.setDrawColor(200)
      doc.line(20, yPos + 2, 190, yPos + 2)
      yPos += 10
      doc.setFontSize(9)
      doc.setTextColor(60)
      for (const rec of autoReport.recommendations) {
        doc.text(`-> ${rec}`, 22, yPos)
        yPos += 6
        if (yPos > 258) break
      }
      yPos += 4
    }

    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text('Dati verificati tramite ricerca web | Fly AI | Simmetria Synergy', 20, 270)
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
        <div className="flex items-center gap-3">
          {saving && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>Salvataggio...</span>}
          <button
            onClick={handleGenerateWithFly}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105"
            style={{
              fontFamily: 'var(--font-mono)',
              background: generating ? 'var(--panel2)' : 'color-mix(in srgb, var(--green) 12%, transparent)',
              color: 'var(--green)',
              border: '1px solid var(--green)',
              cursor: generating ? 'wait' : 'pointer',
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? 'Generazione...' : 'Genera con Fly'}
          </button>
        </div>
      </div>

      {/* AUTO-GENERATED SUMMARY DASHBOARD */}
      {autoReport && (
        <div style={{ border: '1px solid var(--green)', borderRadius: 14, padding: 20, background: 'color-mix(in srgb, var(--green) 4%, transparent)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--green)', fontWeight: 600 }}>
              REPORT AUTOGENERATO
            </p>
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all hover:scale-105"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', background: 'transparent', border: '1px solid var(--green)', cursor: recalculating ? 'wait' : 'pointer' }}
            >
              <RefreshCw className={`w-3 h-3 ${recalculating ? 'animate-spin' : ''}`} />
              Ricalcola
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div style={{ textAlign: 'center', padding: 12, borderRadius: 10, background: 'var(--panel2)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>CO2 TOTALE</p>
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{autoReport.co2_total_kg.toFixed(1)} <span style={{ fontSize: 10, fontWeight: 400 }}>kg</span></p>
            </div>
            <div style={{ textAlign: 'center', padding: 12, borderRadius: 10, background: 'var(--panel2)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>SCORE</p>
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 700, color: autoReport.score_100 >= 50 ? 'var(--green)' : 'var(--yellow)' }}>{autoReport.score_100.toFixed(0)}<span style={{ fontSize: 10, fontWeight: 400 }}>/100</span></p>
            </div>
            <div style={{ textAlign: 'center', padding: 12, borderRadius: 10, background: 'var(--panel2)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>RIFIUTI</p>
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{autoReport.waste_kg.toFixed(1)} <span style={{ fontSize: 10, fontWeight: 400 }}>kg</span></p>
            </div>
            <div style={{ textAlign: 'center', padding: 12, borderRadius: 10, background: 'var(--panel2)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>ACQUA</p>
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{autoReport.water_liters.toFixed(0)} <span style={{ fontSize: 10, fontWeight: 400 }}>L</span></p>
            </div>
          </div>
          {autoReport.recommendations.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>RACCOMANDAZIONI</p>
              <div className="space-y-1.5">
                {autoReport.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2" style={{ fontSize: 12, color: 'var(--text)' }}>
                    <span style={{ color: 'var(--green)', flexShrink: 0, marginTop: 1 }}>&#8594;</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 12, textAlign: 'right' }}>
            Aggiornato: {new Date(autoReport.updated_at).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}

      {/* TRASPORTI */}
      <div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '12px' }}>
          TRASPORTI PARTECIPANTI
        </p>

        {/* Guest doc banner */}
        {flyReport?.trasporti?.documento_usato && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Dati da: {flyReport.trasporti.documento_usato}</span>
            <span style={{ color: 'var(--muted)' }}>
              {flyReport.trasporti.rotte.reduce((s, r) => s + r.n_partecipanti, 0)} ospiti analizzati
            </span>
          </div>
        )}

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

          {/* Fly routes table */}
          {flyReport?.trasporti?.rotte?.length ? (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: 10 }}>
                ROTTE PER CITTA (ordinate per impatto)
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    {['Citta', 'Ospiti', 'Distanza', 'Mezzo', 'CO2 kg', 'Fonte'].map(h => (
                      <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', padding: '6px 8px', textAlign: 'left', fontWeight: 500 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...flyReport.trasporti.rotte].sort((a, b) => b.co2_kg - a.co2_kg).map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)' }}>{r.citta_origine}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)' }}>{r.n_partecipanti}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)' }}>{r.distanza_km} km</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>{r.mezzo}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: 'var(--text)' }}>{r.co2_kg}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <SourceBadge fonte={r.fonte_distanza} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                TOTALE: {flyReport.trasporti.totale_co2_kg} kg CO2
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '20px', textAlign: 'center', padding: '16px', borderTop: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 700, color: 'var(--text)' }}>
                {co2Trasporti.toFixed(0)} <span style={{ fontSize: '14px', fontWeight: 400 }}>kg CO2</span>
              </p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                = {Math.round(co2Trasporti * 6)} km in auto
              </p>
              <SourceBadge fonte="DEFRA 2024 standard" />
            </div>
          )}
        </div>
      </div>

      {/* FORNITORI */}
      <div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '12px' }}>
          FORNITORI & SCELTE GREEN
        </p>
        <div style={{ border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden' }}>
          {/* Fly-generated supplier data */}
          {flyReport?.fornitori?.length ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['Fornitore', 'Categoria', 'Score', 'Certificazioni', 'CO2 kg'].map(h => (
                    <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', padding: '10px 10px', textAlign: 'left', fontWeight: 500 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flyReport.fornitori.map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)' }}>{s.nome}</td>
                    <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>{s.categoria}</td>
                    <td style={{ padding: '10px' }}>
                      <StarRating value={s.carbon_score} onChange={() => {}} />
                    </td>
                    <td style={{ padding: '10px' }}>
                      {s.certificazioni_trovate.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {s.certificazioni_trovate.map((c, ci) => (
                            <span key={ci} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', background: 'color-mix(in srgb, var(--green) 10%, transparent)', padding: '1px 6px', borderRadius: 4 }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>Nessuna cert. trovata</span>
                      )}
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: 'var(--text)' }}>
                      {s.co2_kg}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : eventSuppliers.length === 0 ? (
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
          -{(flyReport?.synergy_impact?.co2_risparmiata_kg ?? synergy.totalKg).toFixed(0)} kg CO2
        </div>
        <p style={{
          fontSize: 13,
          color: 'var(--text)',
          marginTop: 8,
          lineHeight: 1.6,
        }}>
          {flyReport?.synergy_impact?.descrizione_it
            || (synergy.totalKg > 0
              ? `Gestendo questo evento con Synergy, il team ha evitato ${Math.round((synergy.byFonte.documento_digitale || 0) * 120)} stampe e ${synergy.riunioniEvitate} riunioni fisiche, risparmiando ${synergy.totalKg.toFixed(0)} kg CO2.`
              : 'Nessun contributo Synergy registrato per questo evento. I risparmi CO2 verranno tracciati automaticamente.'
            )
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
          <span>{flyReport?.synergy_impact?.equivalente_fogli_carta ?? Math.round(synergy.totalKg * 120)} fogli risparmiati</span>
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
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>
              {(flyReport?.trasporti?.totale_co2_kg ?? co2Trasporti).toFixed(0)} <span style={{ fontSize: '11px', fontWeight: 400 }}>kg</span>
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>CO2 FORNITORI</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>
              {(flyReport?.fornitori?.reduce((s, f) => s + f.co2_kg, 0) ?? co2Fornitori).toFixed(0)} <span style={{ fontSize: '11px', fontWeight: 400 }}>kg</span>
            </p>
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
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
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
            = {flyReport?.equivalenti?.alberi_salvati ?? Math.ceil(impattoNetto / 21)} alberi salvati<br />
            = {flyReport?.equivalenti?.km_auto ?? Math.round(impattoNetto * 6)} km in auto non percorsi<br />
            = {flyReport?.equivalenti?.voli_roma_milano ?? (impattoNetto / 45).toFixed(1)} voli Roma-Milano equivalenti
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

      {/* NARRATIVA (from Fly) */}
      {flyReport?.narrativa_it && (
        <div style={{ border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '12px' }}>
            NARRATIVA PER IL CLIENTE
          </p>
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {flyReport.narrativa_it}
          </p>
        </div>
      )}

      {/* FONTI */}
      {flyReport?.fonti?.length ? (
        <div style={{ border: '1px solid var(--line)', borderRadius: '14px', padding: '16px 20px' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '10px' }}>
            METODOLOGIA E FONTI
          </p>
          <div className="space-y-1">
            {flyReport.fonti.map((f, i) => (
              <p key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.5 }}>
                {f}
              </p>
            ))}
          </div>
        </div>
      ) : null}

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

// ─── Source Badge ─────────────────────────────────────────────────────────────

function SourceBadge({ fonte }: { fonte: string }) {
  const isVerified = fonte && !fonte.toLowerCase().includes('defra') && !fonte.toLowerCase().includes('standard')

  if (isVerified) {
    return (
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--green)',
        background: 'color-mix(in srgb, var(--green) 10%, transparent)',
        padding: '1px 6px',
        borderRadius: 4,
      }}>
        Dato verificato online
      </span>
    )
  }

  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 9,
      color: 'var(--muted)',
    }}>
      ~ Stima DEFRA 2024
    </span>
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
