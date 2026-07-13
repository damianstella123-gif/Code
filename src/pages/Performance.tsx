import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line } from 'recharts'
import { TrendingUp, TrendingDown, Minus, Save, X, ChevronUp, ChevronDown } from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getAllEventsROI, getEventROI, type EventROI } from '@/lib/events-service'
import { fmtShort } from '@/lib/format'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImpactRow {
  id: string
  user_id: string
  minuti_risparmiati: number
  valore_eur: number
  action_type: string
  created_at: string
}

interface MonthlyReport {
  user_id: string
  mese: number
  anno: number
  ore_risparmiate: number
  valore_eur: number
}

interface RoiConfig {
  id: string
  role: string
  costo_orario_eur: number
  ore_sett_pre_synergy: number
}

interface ProfileRow {
  id: string
  first_name: string
  last_name: string
  role: string
  avatar_url: string | null
  is_active: boolean
}

const MONTH_NAMES = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
const ACTION_LABELS: Record<string, string> = {
  fly_response: 'Risposta Fly',
  budget_calc: 'Calcolo Budget',
  document_gen: 'Generazione Documenti',
  task_auto: 'Automazione Task',
  email_draft: 'Bozza Email',
  supplier_search: 'Ricerca Fornitori',
  report_gen: 'Generazione Report',
}
function getActionLabel(type: string): string {
  return ACTION_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

type SortField = 'title' | 'revenue' | 'costi_totali' | 'margine_eur' | 'margine_pct' | 'roi_pct' | 'on_time_pct'

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Performance() {
  const navigate = useNavigate()
  const user = loadUser()
  const [tab, setTab] = useState<'eventi' | 'synergy'>('eventi')

  useEffect(() => {
    if (!user || !['Admin', 'Super Admin'].includes(user.role)) {
      navigate('/dashboard')
    }
  }, [user, navigate])

  if (!user || !['Admin', 'Super Admin'].includes(user.role)) return null

  return (
    <div>
      <div className="wire-card-flat" style={{ padding: '16px', marginBottom: '20px', borderRadius: 12, border: '1px solid var(--line)' }}>
        <div className="wire-masthead" style={{ marginBottom: 0 }}>
          <div>
            <span className="wire-masthead-title">PERFORMANCE</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginLeft: '12px' }}>ROI & KPI</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1" style={{ marginTop: 12 }}>
          {([['eventi', 'Eventi ROI'], ['synergy', 'Synergy Impact']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, padding: '7px 16px', borderRadius: 8,
                border: '1px solid var(--line)', cursor: 'pointer',
                background: tab === id ? 'var(--text)' : 'transparent',
                color: tab === id ? 'var(--panel-solid)' : 'var(--muted)',
                fontWeight: tab === id ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'eventi' && <EventROISection />}
      {tab === 'synergy' && <SynergySection />}
    </div>
  )
}

// ─── EVENT ROI SECTION ──────────────────────────────────────────────────────

function EventROISection() {
  const [events, setEvents] = useState<EventROI[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [filterStatus, setFilterStatus] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [sortField, setSortField] = useState<SortField>('margine_eur')
  const [sortAsc, setSortAsc] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<EventROI | null>(null)

  useEffect(() => {
    setLoading(true)
    getAllEventsROI({
      from: dateRange.from || undefined,
      to: dateRange.to || undefined,
      status: filterStatus || undefined,
      client: filterClient || undefined,
    }).then(evts => { setEvents(evts); setLoading(false) })
  }, [dateRange.from, dateRange.to, filterStatus, filterClient])

  const sorted = useMemo(() => {
    const list = [...events]
    list.sort((a, b) => {
      const av = a[sortField] as number
      const bv = b[sortField] as number
      if (typeof av === 'string') return sortAsc ? (av as string).localeCompare(bv as unknown as string) : (bv as unknown as string).localeCompare(av as string)
      return sortAsc ? av - bv : bv - av
    })
    return list
  }, [events, sortField, sortAsc])

  const totalRevenue = events.reduce((s, e) => s + e.revenue, 0)
  const totalMargin = events.reduce((s, e) => s + e.margine_eur, 0)
  const avgROI = events.length > 0 ? events.reduce((s, e) => s + e.roi_pct, 0) / events.length : 0
  const avgMargin = events.length > 0 ? events.reduce((s, e) => s + e.margine_pct, 0) / events.length : 0
  const budgetCompliance = events.length > 0 ? (events.filter(e => e.within_budget).length / events.length) * 100 : 0

  function handleSort(field: SortField) {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(false) }
  }

  // Chart data
  const costBreakdown = useMemo(() => {
    const hotel = events.reduce((s, e) => s + e.costi_hotel, 0)
    const catering = events.reduce((s, e) => s + e.costi_catering, 0)
    const fornitori = events.reduce((s, e) => s + e.costi_fornitori, 0)
    const staff = events.reduce((s, e) => s + e.costi_staff, 0)
    const varie = events.reduce((s, e) => s + e.costi_varie, 0)
    return [
      { name: 'Hotel', value: hotel, color: '#3b82f6' },
      { name: 'Catering', value: catering, color: '#10b981' },
      { name: 'Fornitori', value: fornitori, color: '#f59e0b' },
      { name: 'Staff', value: staff, color: '#8b5cf6' },
      { name: 'Varie', value: varie, color: '#6b7280' },
    ].filter(d => d.value > 0)
  }, [events])

  const topByROI = useMemo(() => {
    return [...events].sort((a, b) => b.roi_pct - a.roi_pct).slice(0, 5).map(e => ({
      name: e.title.length > 20 ? e.title.slice(0, 18) + '..' : e.title,
      roi: Math.round(e.roi_pct),
    }))
  }, [events])

  const marginTrend = useMemo(() => {
    const byMonth: Record<string, { revenue: number; costi: number; count: number }> = {}
    for (const e of events) {
      if (!e.data_fine) continue
      const d = new Date(e.data_fine)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[key]) byMonth[key] = { revenue: 0, costi: 0, count: 0 }
      byMonth[key].revenue += e.revenue
      byMonth[key].costi += e.costi_totali
      byMonth[key].count++
    }
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([key, v]) => {
      const [y, m] = key.split('-')
      return { label: `${MONTH_NAMES[parseInt(m) - 1]} ${y.slice(2)}`, margin: v.count > 0 ? ((v.revenue - v.costi) / Math.max(v.revenue, 1)) * 100 : 0 }
    })
  }, [events])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ borderRadius: 14, border: '1px solid var(--line)', padding: 16, height: 90, background: 'var(--panel)' }}>
            <div style={{ height: 10, width: '60%', background: 'var(--line)', borderRadius: 4, marginBottom: 10 }} />
            <div style={{ height: 20, width: '40%', background: 'var(--line)', borderRadius: 4 }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards + Filters */}
      <div className="wire-card-flat" style={{ padding: '16px', borderRadius: 12, border: '1px solid var(--line)' }}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="REVENUE TOTALE" value={fmtEur(totalRevenue)} color="var(--text)" />
          <KpiCard label="MARGINE TOTALE" value={fmtEur(totalMargin)} color={totalMargin >= 0 ? 'var(--green)' : 'var(--red2)'} />
          <KpiCard label="ROI MEDIO" value={`${avgROI.toFixed(0)}%`} color={avgROI >= 0 ? 'var(--green)' : 'var(--red2)'} />
          <KpiCard label="MARGINE MEDIO" value={`${avgMargin.toFixed(0)}%`} color={avgMargin >= 20 ? 'var(--green)' : 'var(--yellow)'} />
          <KpiCard label="BUDGET OK" value={`${budgetCompliance.toFixed(0)}%`} color={budgetCompliance >= 70 ? 'var(--green)' : 'var(--yellow)'} />
        </div>

        <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 12 }}>
          <input type="date" value={dateRange.from} onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)' }} />
          <input type="date" value={dateRange.to} onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)' }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)' }}>
            <option value="">Tutti gli stati</option>
            <option value="confermato">Confermato</option>
            <option value="in_corso">In corso</option>
            <option value="completato">Completato</option>
            <option value="bozza">Bozza</option>
          </select>
          <input type="text" placeholder="Filtra cliente..." value={filterClient} onChange={e => setFilterClient(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', width: 140 }} />
        </div>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line)' }}>
                <TH label="Evento" field="title" onSort={handleSort} sortField={sortField} sortAsc={sortAsc} />
                <TH label="Cliente" />
                <TH label="Ricavi" field="revenue" onSort={handleSort} sortField={sortField} sortAsc={sortAsc} />
                <TH label="Costi" field="costi_totali" onSort={handleSort} sortField={sortField} sortAsc={sortAsc} />
                <TH label="Margine" field="margine_eur" onSort={handleSort} sortField={sortField} sortAsc={sortAsc} />
                <TH label="Marg %" field="margine_pct" onSort={handleSort} sortField={sortField} sortAsc={sortAsc} />
                <TH label="ROI %" field="roi_pct" onSort={handleSort} sortField={sortField} sortAsc={sortAsc} />
                <TH label="Tasks %" field="on_time_pct" onSort={handleSort} sortField={sortField} sortAsc={sortAsc} />
                <TH label="Budget" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>Nessun evento trovato</td></tr>
              ) : sorted.map(e => (
                <tr key={e.event_id} onClick={() => setSelectedEvent(e)}
                  style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--panel2)')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{e.title}</span>
                    <br /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{fmtShort(e.data_fine)}</span>
                  </td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{e.client || '-'}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{fmtEur(e.revenue)}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{fmtEur(e.costi_totali)}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: e.margine_eur >= 0 ? 'var(--green)' : 'var(--red2)' }}>{fmtEur(e.margine_eur)}</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: e.margine_pct >= 20 ? 'var(--green)' : e.margine_pct >= 0 ? 'var(--yellow)' : 'var(--red2)' }}>{e.margine_pct.toFixed(0)}%</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: e.roi_pct >= 0 ? 'var(--green)' : 'var(--red2)' }}>{e.roi_pct.toFixed(0)}%</td>
                  <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{e.on_time_pct.toFixed(0)}%</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 6px', borderRadius: 4, background: e.within_budget ? 'color-mix(in srgb, var(--green) 15%, transparent)' : 'color-mix(in srgb, var(--red2) 15%, transparent)', color: e.within_budget ? 'var(--green)' : 'var(--red2)' }}>
                      {e.within_budget ? 'OK' : 'OVER'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      {events.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Cost breakdown pie */}
          {costBreakdown.length > 0 && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Distribuzione Costi</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={costBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} strokeWidth={0}>
                    {costBreakdown.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 8 }} formatter={(v) => fmtEur(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center" style={{ marginTop: 8 }}>
                {costBreakdown.map(d => (
                  <span key={d.name} className="flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, display: 'inline-block' }} />
                    {d.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top 5 by ROI */}
          {topByROI.length > 0 && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Top 5 ROI</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={topByROI} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--muted)' }} width={80} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 8 }} formatter={(v) => `${v}%`} />
                  <Bar dataKey="roi" radius={[0, 4, 4, 0]}>
                    {topByROI.map((_, i) => <Cell key={i} fill={i === 0 ? 'var(--green)' : 'var(--blue)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Margin trend */}
          {marginTrend.length > 1 && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16 }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Trend Margine %</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={marginTrend} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={35} />
                  <Tooltip contentStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 8 }} formatter={(v) => `${Number(v).toFixed(0)}%`} />
                  <Line type="monotone" dataKey="margin" stroke="var(--green)" strokeWidth={2} dot={{ r: 4, fill: 'var(--green)' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedEvent && <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  )
}

// ─── Event Detail Modal ──────────────────────────────────────────────────────

function EventDetailModal({ event: e, onClose }: { event: EventROI; onClose: () => void }) {
  const costRows = [
    { label: 'Hotel', value: e.costi_hotel },
    { label: 'Catering/Ristorante', value: e.costi_catering },
    { label: 'Fornitori (AV, Allestim., Grafica...)', value: e.costi_fornitori },
    { label: 'Staff (interno + esterno)', value: e.costi_staff },
    { label: 'Varie', value: e.costi_varie },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--panel-solid)', borderRadius: 16, padding: 28, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--line)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
          <X className="w-5 h-5" />
        </button>

        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>DETTAGLIO EVENTO</p>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{e.title}</p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 20 }}>
          {e.client} &middot; {fmtShort(e.data_fine)} &middot; {e.attendees} pax
        </p>

        {/* Revenue vs Cost */}
        <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 20 }}>
          <div style={{ padding: 14, borderRadius: 10, background: 'color-mix(in srgb, var(--green) 8%, transparent)', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginBottom: 4 }}>RICAVI</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{fmtEur(e.revenue)}</p>
          </div>
          <div style={{ padding: 14, borderRadius: 10, background: 'color-mix(in srgb, var(--red2) 8%, transparent)', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginBottom: 4 }}>COSTI</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--red2)' }}>{fmtEur(e.costi_totali)}</p>
          </div>
        </div>

        {/* Cost breakdown */}
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>Breakdown Costi</p>
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          {costRows.map(r => (
            <div key={r.label} className="flex items-center justify-between" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{r.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: r.value > 0 ? 'var(--text)' : 'var(--muted)' }}>{fmtEur(r.value)}</span>
            </div>
          ))}
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-2">
          <MiniKpi label="Margine" value={`${e.margine_pct.toFixed(0)}%`} color={e.margine_pct >= 20 ? 'var(--green)' : 'var(--yellow)'} />
          <MiniKpi label="ROI" value={`${e.roi_pct.toFixed(0)}%`} color={e.roi_pct >= 0 ? 'var(--green)' : 'var(--red2)'} />
          <MiniKpi label="Tasks OK" value={`${e.on_time_pct.toFixed(0)}%`} color="var(--muted)" />
          <MiniKpi label="Budget" value={e.within_budget ? 'OK' : 'OVER'} color={e.within_budget ? 'var(--green)' : 'var(--red2)'} />
        </div>

        {e.attendees > 0 && e.revenue > 0 && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'var(--panel2)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
              Ricavo per persona: <strong style={{ color: 'var(--text)' }}>{fmtEur(e.revenue / e.attendees)}</strong>
              &nbsp;&middot;&nbsp;
              Costo per persona: <strong style={{ color: 'var(--text)' }}>{fmtEur(e.costi_totali / e.attendees)}</strong>
            </span>
          </div>
        )}

        <button
          onClick={async () => {
            await getEventROI(e.event_id, true)
            alert('Debug ROI stampato in Console (F12)')
          }}
          style={{
            marginTop: 16, width: '100%', padding: '10px 14px', borderRadius: 8,
            background: 'var(--panel2)', border: '1px solid var(--line)',
            cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--muted)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 6, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
        >
          Debug Calcoli (Console F12)
        </button>
      </div>
    </div>
  )
}

function MiniKpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 8, borderRadius: 8, background: 'var(--panel2)' }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color }}>{value}</p>
    </div>
  )
}

// ─── SYNERGY SECTION (existing functionality) ────────────────────────────────

function SynergySection() {
  const [impactRows, setImpactRows] = useState<ImpactRow[]>([])
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReport[]>([])
  const [roiConfig, setRoiConfig] = useState<RoiConfig[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const [impactRes, monthlyRes, configRes, profilesRes] = await Promise.all([
      supabase.from('impact_actions_log').select('*').gte('created_at', startOfMonth),
      supabase.from('impact_monthly_reports').select('*'),
      supabase.from('impact_roi_config').select('*'),
      supabase.from('profiles').select('id, first_name, last_name, role, avatar_url, is_active').eq('is_active', true),
    ])
    setImpactRows((impactRes.data ?? []) as ImpactRow[])
    setMonthlyReports((monthlyRes.data ?? []) as MonthlyReport[])
    setRoiConfig((configRes.data ?? []) as RoiConfig[])
    setProfiles((profilesRes.data ?? []) as ProfileRow[])
    setLoading(false)
  }

  const oreMese = useMemo(() => impactRows.reduce((sum, r) => sum + (r.minuti_risparmiati || 0), 0) / 60, [impactRows])
  const valoreMese = useMemo(() => impactRows.reduce((sum, r) => sum + (r.valore_eur || 0), 0), [impactRows])
  const utentiAttivi = useMemo(() => new Set(impactRows.map(r => r.user_id)).size, [impactRows])
  const mediaPerUtente = useMemo(() => utentiAttivi > 0 ? oreMese / utentiAttivi : 0, [oreMese, utentiAttivi])
  const azioneTop = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of impactRows) { const t = r.action_type || 'unknown'; counts[t] = (counts[t] || 0) + 1 }
    let max = 0; let top = ''
    for (const [k, v] of Object.entries(counts)) { if (v > max) { max = v; top = k } }
    return top
  }, [impactRows])

  const chartData = useMemo(() => {
    const now = new Date()
    const months: { label: string; mese: number; anno: number; ore: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ label: MONTH_NAMES[d.getMonth()], mese: d.getMonth() + 1, anno: d.getFullYear(), ore: 0 })
    }
    for (const r of monthlyReports) {
      const match = months.find(m => m.mese === r.mese && m.anno === r.anno)
      if (match) match.ore += r.ore_risparmiate
    }
    const currentMonth = months[months.length - 1]
    if (currentMonth) currentMonth.ore += oreMese
    return months
  }, [monthlyReports, oreMese])

  const userRows = useMemo(() => {
    const now = new Date()
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMese = prevDate.getMonth() + 1
    const prevAnno = prevDate.getFullYear()
    return profiles.filter(p => p.is_active).map(p => {
      const userImpact = impactRows.filter(r => r.user_id === p.id)
      const oreThisMonth = userImpact.reduce((s, r) => s + (r.minuti_risparmiati || 0), 0) / 60
      const valoreThisMonth = userImpact.reduce((s, r) => s + (r.valore_eur || 0), 0)
      const counts: Record<string, number> = {}
      for (const r of userImpact) { const t = r.action_type || 'unknown'; counts[t] = (counts[t] || 0) + 1 }
      let topAction = ''; let topCount = 0
      for (const [k, v] of Object.entries(counts)) { if (v > topCount) { topCount = v; topAction = k } }
      const prevReport = monthlyReports.find(r => r.user_id === p.id && r.mese === prevMese && r.anno === prevAnno)
      const orePrev = prevReport?.ore_risparmiate ?? 0
      let trend: 'up' | 'down' | 'flat' = 'flat'
      if (oreThisMonth > orePrev && orePrev > 0) trend = 'up'
      else if (oreThisMonth < orePrev && orePrev > 0) trend = 'down'
      const miniData: { label: string; ore: number }[] = []
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        if (i === 0) miniData.push({ label: MONTH_NAMES[d.getMonth()], ore: oreThisMonth })
        else { const rep = monthlyReports.find(r => r.user_id === p.id && r.mese === d.getMonth() + 1 && r.anno === d.getFullYear()); miniData.push({ label: MONTH_NAMES[d.getMonth()], ore: rep?.ore_risparmiate ?? 0 }) }
      }
      return { id: p.id, nome: `${p.first_name} ${p.last_name}`.trim(), role: p.role, avatar_url: p.avatar_url, oreThisMonth, valoreThisMonth, topAction, trend, miniData }
    }).sort((a, b) => b.oreThisMonth - a.oreThisMonth)
  }, [profiles, impactRows, monthlyReports])

  async function handleConfigSave(row: RoiConfig) {
    setSavingId(row.id)
    await supabase.from('impact_roi_config').update({ costo_orario_eur: row.costo_orario_eur, ore_sett_pre_synergy: row.ore_sett_pre_synergy, updated_at: new Date().toISOString() }).eq('id', row.id)
    setSavingId(null)
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>Caricamento...</div>
  }

  return (
    <div className="space-y-8">
      {/* Ticker */}
      <div className="wire-ticker">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}><strong>{oreMese.toFixed(1)}</strong> ore mese</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}><strong>{valoreMese.toFixed(0)}</strong> EUR mese</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}><strong>{utentiAttivi}</strong> utenti attivi</span>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="ORE RISPARMIATE" value={oreMese.toFixed(1)} color="var(--text)" />
        <KpiCard label="VALORE ECONOMICO" value={`${valoreMese.toFixed(0)} EUR`} color="var(--text)" />
        <KpiCard label="MEDIA PER UTENTE" value={`${mediaPerUtente.toFixed(1)} ore`} color="var(--text)" />
        <KpiCard label="AZIONE TOP" value={getActionLabel(azioneTop) || '-'} color="var(--text)" />
      </div>

      {/* Chart */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 20 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Trend ultimi 6 mesi</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={35} />
            <Tooltip contentStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 8 }} formatter={(v) => [`${Number(v).toFixed(1)} ore`, 'Ore']} />
            <Bar dataKey="ore" radius={[6, 6, 0, 0]}><Cell fill="var(--blue)" /></Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* User Table */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {['Utente', 'Ruolo', 'Ore mese', 'Valore EUR', 'Azione top', 'Trend'].map(h => (
                <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {userRows.map(row => (
              <SynergyUserRow key={row.id} row={row} expanded={expandedUser === row.id} onToggle={() => setExpandedUser(expandedUser === row.id ? null : row.id)} />
            ))}
            {userRows.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>Nessun dato disponibile</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Benchmark */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)' }}>Benchmark</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {['Ruolo', 'Costo orario EUR', 'Ore/sett pre-Synergy', ''].map(h => (
                <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)', padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roiConfig.sort((a, b) => a.role.localeCompare(b.role)).map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{row.role}</td>
                <td style={{ padding: '10px 12px' }}>
                  <input type="number" value={row.costo_orario_eur} onChange={e => setRoiConfig(prev => prev.map(r => r.id === row.id ? { ...r, costo_orario_eur: parseFloat(e.target.value) || 0 } : r))}
                    className="w-20 px-2 py-1 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', outline: 'none' }} />
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <input type="number" value={row.ore_sett_pre_synergy} onChange={e => setRoiConfig(prev => prev.map(r => r.id === row.id ? { ...r, ore_sett_pre_synergy: parseFloat(e.target.value) || 0 } : r))}
                    className="w-20 px-2 py-1 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', outline: 'none' }} />
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <button onClick={() => handleConfigSave(row)} disabled={savingId === row.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, border: '1px solid var(--line)', background: 'transparent', color: savingId === row.id ? 'var(--muted)' : 'var(--text)', cursor: 'pointer' }}>
                    <Save className="w-3 h-3" />{savingId === row.id ? '...' : 'Salva'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SynergyUserRow({ row, expanded, onToggle }: {
  row: { id: string; nome: string; role: string; avatar_url: string | null; oreThisMonth: number; valoreThisMonth: number; topAction: string; trend: 'up' | 'down' | 'flat'; miniData: { label: string; ore: number }[] }
  expanded: boolean
  onToggle: () => void
}) {
  const initials = row.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <>
      <tr onClick={onToggle} style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <td style={{ padding: '10px 12px' }}>
          <div className="flex items-center gap-2">
            {row.avatar_url ? <img src={row.avatar_url} className="w-6 h-6 rounded-full object-cover" alt="" />
              : <div className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: 'var(--blue)', fontSize: 9, fontWeight: 600 }}>{initials}</div>}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{row.nome}</span>
          </div>
        </td>
        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{row.role}</td>
        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{row.oreThisMonth.toFixed(1)}</td>
        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{row.valoreThisMonth.toFixed(0)}</td>
        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{getActionLabel(row.topAction) || '-'}</td>
        <td style={{ padding: '10px 12px' }}>
          {row.trend === 'up' && <TrendingUp className="w-4 h-4" style={{ color: 'var(--green)' }} />}
          {row.trend === 'down' && <TrendingDown className="w-4 h-4" style={{ color: 'var(--red2)' }} />}
          {row.trend === 'flat' && <Minus className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--line)' }}>
          <td colSpan={6} style={{ padding: '12px 16px', background: 'var(--panel2)' }}>
            <div style={{ height: 70, maxWidth: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={row.miniData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Bar dataKey="ore" radius={[4, 4, 0, 0]}><Cell fill="var(--blue)" /></Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px' }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: 6 }}>{label}</p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
    </div>
  )
}

function TH({ label, field, onSort, sortField, sortAsc }: { label: string; field?: SortField; onSort?: (f: SortField) => void; sortField?: SortField; sortAsc?: boolean }) {
  const active = field && sortField === field
  return (
    <th
      onClick={() => field && onSort?.(field)}
      style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: active ? 'var(--text)' : 'var(--muted)', padding: '12px 14px', textAlign: 'left', fontWeight: 700, cursor: field ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
    >
      {label} {active && (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />)}
    </th>
  )
}

function fmtEur(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return n.toFixed(0)
}
