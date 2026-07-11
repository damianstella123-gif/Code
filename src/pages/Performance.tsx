import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { TrendingUp, TrendingDown, Minus, Save } from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

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

export default function Performance() {
  const navigate = useNavigate()
  const user = loadUser()

  useEffect(() => {
    if (!user || !['Admin', 'Super Admin'].includes(user.role)) {
      navigate('/dashboard')
    }
  }, [user, navigate])

  const [impactRows, setImpactRows] = useState<ImpactRow[]>([])
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReport[]>([])
  const [roiConfig, setRoiConfig] = useState<RoiConfig[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

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

  // ─── KPI ────────────────────────────────────────────────────────────────────

  const oreMese = useMemo(() => {
    return impactRows.reduce((sum, r) => sum + (r.minuti_risparmiati || 0), 0) / 60
  }, [impactRows])

  const valoreMese = useMemo(() => {
    return impactRows.reduce((sum, r) => sum + (r.valore_eur || 0), 0)
  }, [impactRows])

  const utentiAttivi = useMemo(() => {
    const ids = new Set(impactRows.map(r => r.user_id))
    return ids.size
  }, [impactRows])

  const mediaPerUtente = useMemo(() => {
    return utentiAttivi > 0 ? oreMese / utentiAttivi : 0
  }, [oreMese, utentiAttivi])

  const azioneTop = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of impactRows) {
      const t = r.action_type || 'unknown'
      counts[t] = (counts[t] || 0) + 1
    }
    let max = 0
    let top = ''
    for (const [k, v] of Object.entries(counts)) {
      if (v > max) { max = v; top = k }
    }
    return top
  }, [impactRows])

  // ─── Chart data (last 6 months) ────────────────────────────────────────────

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

    // Add current month from live data
    const currentMonth = months[months.length - 1]
    if (currentMonth) {
      currentMonth.ore += oreMese
    }

    return months
  }, [monthlyReports, oreMese])

  // ─── Per-user table ─────────────────────────────────────────────────────────

  const userRows = useMemo(() => {
    const now = new Date()
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMese = prevDate.getMonth() + 1
    const prevAnno = prevDate.getFullYear()

    const activeProfiles = profiles.filter(p => p.is_active)

    return activeProfiles.map(p => {
      const userImpact = impactRows.filter(r => r.user_id === p.id)
      const oreThisMonth = userImpact.reduce((s, r) => s + (r.minuti_risparmiati || 0), 0) / 60
      const valoreThisMonth = userImpact.reduce((s, r) => s + (r.valore_eur || 0), 0)

      // Top action this month
      const counts: Record<string, number> = {}
      for (const r of userImpact) {
        const t = r.action_type || 'unknown'
        counts[t] = (counts[t] || 0) + 1
      }
      let topAction = ''
      let topCount = 0
      for (const [k, v] of Object.entries(counts)) {
        if (v > topCount) { topCount = v; topAction = k }
      }

      // Previous month from monthly reports
      const prevReport = monthlyReports.find(r => r.user_id === p.id && r.mese === prevMese && r.anno === prevAnno)
      const orePrev = prevReport?.ore_risparmiate ?? 0

      // Trend
      let trend: 'up' | 'down' | 'flat' = 'flat'
      if (oreThisMonth > orePrev && orePrev > 0) trend = 'up'
      else if (oreThisMonth < orePrev && orePrev > 0) trend = 'down'

      // Mini chart: last 3 months
      const miniData: { label: string; ore: number }[] = []
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const m = d.getMonth() + 1
        const a = d.getFullYear()
        if (i === 0) {
          miniData.push({ label: MONTH_NAMES[d.getMonth()], ore: oreThisMonth })
        } else {
          const rep = monthlyReports.find(r => r.user_id === p.id && r.mese === m && r.anno === a)
          miniData.push({ label: MONTH_NAMES[d.getMonth()], ore: rep?.ore_risparmiate ?? 0 })
        }
      }

      return {
        id: p.id,
        nome: `${p.first_name} ${p.last_name}`.trim(),
        role: p.role,
        avatar_url: p.avatar_url,
        oreThisMonth,
        valoreThisMonth,
        topAction,
        trend,
        miniData,
      }
    }).sort((a, b) => b.oreThisMonth - a.oreThisMonth)
  }, [profiles, impactRows, monthlyReports])

  // ─── Save benchmark config ─────────────────────────────────────────────────

  async function handleConfigSave(row: RoiConfig) {
    setSavingId(row.id)
    await supabase.from('impact_roi_config').update({
      costo_orario_eur: row.costo_orario_eur,
      ore_sett_pre_synergy: row.ore_sett_pre_synergy,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    setSavingId(null)
  }

  if (!user || !['Admin', 'Super Admin'].includes(user.role)) return null
  if (loading) {
    return (
      <div style={{ padding: '0 16px' }}>
        <div className="wire-masthead" style={{ marginBottom: 24 }}>
          <div style={{ height: 20, width: 180, background: 'var(--line)', borderRadius: 6, animation: 'shimmer 1.5s infinite' }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ borderRadius: 14, border: '1px solid var(--line)', padding: 16, background: 'var(--panel)' }}>
              {[80, 60, 40].map((w, j) => (
                <div key={j} style={{ height: 12, width: `${w}%`, background: 'var(--line)', borderRadius: 6, marginBottom: 8, animation: 'shimmer 1.5s infinite' }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Masthead */}
      <div className="wire-masthead">
        <div>
          <span className="wire-masthead-title">PERFORMANCE</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginLeft: '12px' }}>SYNERGY ROI</span>
        </div>
      </div>

      {/* Ticker */}
      <div className="wire-ticker">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          <strong>{oreMese.toFixed(1)}</strong> ore mese
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          <strong>{valoreMese.toFixed(0)}</strong> EUR mese
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          <strong>{utentiAttivi}</strong> utenti attivi
        </span>
      </div>

      <div className="space-y-8" style={{ marginTop: '24px' }}>

        {/* ─── KPI CARDS ─────────────────────────────────────────────────────────── */}
        <div>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
            KPI Aziendali
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="ORE RISPARMIATE" value={oreMese.toFixed(1)} unit="ore" />
            <KpiCard label="VALORE ECONOMICO" value={`${valoreMese.toFixed(0)}`} unit="EUR" />
            <KpiCard label="MEDIA PER UTENTE" value={mediaPerUtente.toFixed(1)} unit="ore/mese" />
            <KpiCard label="AZIONE PIU USATA" value={getActionLabel(azioneTop) || '-'} unit="" />
          </div>
        </div>

        {/* ─── CHART ─────────────────────────────────────────────────────────────── */}
        <div>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
            Trend ultimi 6 mesi
          </p>
          <div style={{ border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 8 }}
                  formatter={(v) => [`${Number(v).toFixed(1)} ore`, 'Ore risparmiate']}
                />
                <Bar dataKey="ore" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="var(--red2)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ─── USER TABLE ────────────────────────────────────────────────────────── */}
        <div>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>
            Dettaglio per utente
          </p>
          <div style={{ border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['Utente', 'Ruolo', 'Ore mese', 'Valore EUR', 'Azione top', 'Trend'].map(h => (
                    <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {userRows.map(row => (
                  <UserRow
                    key={row.id}
                    row={row}
                    expanded={expandedUser === row.id}
                    onToggle={() => setExpandedUser(expandedUser === row.id ? null : row.id)}
                  />
                ))}
                {userRows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)' }}>
                      Nessun dato di performance disponibile
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── BENCHMARK CONFIG ──────────────────────────────────────────────────── */}
        <div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: '24px', marginTop: '8px' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '16px' }}>
              BENCHMARK
            </p>
          </div>
          <div style={{ border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['Ruolo', 'Costo orario EUR', 'Ore/sett pre-Synergy', ''].map(h => (
                    <th key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roiConfig.sort((a, b) => a.role.localeCompare(b.role)).map(row => (
                  <BenchmarkRow
                    key={row.id}
                    row={row}
                    saving={savingId === row.id}
                    onChange={(field, value) => {
                      setRoiConfig(prev => prev.map(r => r.id === row.id ? { ...r, [field]: value } : r))
                    }}
                    onSave={() => handleConfigSave(row)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', marginTop: '10px' }}>
            I benchmark pre-Synergy sono stime. Aggiornali con i dati reali per calcoli piu accurati.
          </p>
        </div>

        {/* ─── FLY INSIGHTS — TEAM ─────────────────────────────────────────────────── */}
        <FlyInsightsSection userRows={userRows} />
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: '14px', padding: '18px 20px' }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '8px' }}>
        {label}
      </p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
        {value}
      </p>
      {unit && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
          {unit}
        </p>
      )}
    </div>
  )
}

function UserRow({ row, expanded, onToggle }: {
  row: { id: string; nome: string; role: string; avatar_url: string | null; oreThisMonth: number; valoreThisMonth: number; topAction: string; trend: 'up' | 'down' | 'flat'; miniData: { label: string; ore: number }[] }
  expanded: boolean
  onToggle: () => void
}) {
  const initials = row.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <tr onClick={onToggle} style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer', transition: 'background 0.12s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <td style={{ padding: '10px 12px' }}>
          <div className="flex items-center gap-2">
            {row.avatar_url ? (
              <img src={row.avatar_url} className="w-6 h-6 rounded-full object-cover" alt="" />
            ) : (
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: 'var(--red2)', fontSize: '9px', fontWeight: 600 }}>{initials}</div>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>{row.nome}</span>
          </div>
        </td>
        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>{row.role}</td>
        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{row.oreThisMonth.toFixed(1)}</td>
        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{row.valoreThisMonth.toFixed(0)}</td>
        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>{getActionLabel(row.topAction) || '-'}</td>
        <td style={{ padding: '10px 12px' }}>
          {row.trend === 'up' && <TrendingUp className="w-4 h-4" style={{ color: 'var(--green)' }} />}
          {row.trend === 'down' && <TrendingDown className="w-4 h-4" style={{ color: 'var(--red2)' }} />}
          {row.trend === 'flat' && <Minus className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: '1px solid var(--line)' }}>
          <td colSpan={6} style={{ padding: '12px 16px', background: 'var(--panel2)' }}>
            <div style={{ height: 80, maxWidth: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={row.miniData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Bar dataKey="ore" radius={[4, 4, 0, 0]}>
                    {row.miniData.map((_, i) => (
                      <Cell key={i} fill="var(--red2)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function BenchmarkRow({ row, saving, onChange, onSave }: {
  row: RoiConfig
  saving: boolean
  onChange: (field: string, value: number) => void
  onSave: () => void
}) {
  return (
    <tr style={{ borderBottom: '1px solid var(--line)' }}>
      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>{row.role}</td>
      <td style={{ padding: '10px 12px' }}>
        <input
          type="number"
          value={row.costo_orario_eur}
          onChange={e => onChange('costo_orario_eur', parseFloat(e.target.value) || 0)}
          className="w-20 px-2 py-1 rounded-lg focus:outline-none"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)' }}
        />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <input
          type="number"
          value={row.ore_sett_pre_synergy}
          onChange={e => onChange('ore_sett_pre_synergy', parseFloat(e.target.value) || 0)}
          className="w-20 px-2 py-1 rounded-lg focus:outline-none"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)' }}
        />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', border: '1px solid var(--line)', background: 'transparent', color: saving ? 'var(--muted)' : 'var(--text)', cursor: saving ? 'wait' : 'pointer' }}>
          <Save className="w-3 h-3" />
          {saving ? '...' : 'Salva'}
        </button>
      </td>
    </tr>
  )
}

// ─── FLY INSIGHTS ────────────────────────────────────────────────────────────

interface InsightCard {
  userId: string
  nome: string
  role: string
  avatar_url: string | null
  insight: string
}

function FlyInsightsSection({ userRows }: {
  userRows: { id: string; nome: string; role: string; avatar_url: string | null; oreThisMonth: number; valoreThisMonth: number; topAction: string; trend: 'up' | 'down' | 'flat' }[]
}) {
  const [insights, setInsights] = useState<InsightCard[]>([])
  const [generating, setGenerating] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  async function handleAnalyze() {
    setGenerating(true)
    setInsights([])

    const teamData = userRows.map(u => ({
      nome: u.nome,
      ruolo: u.role,
      ore_mese: parseFloat(u.oreThisMonth.toFixed(1)),
      valore_eur: parseFloat(u.valoreThisMonth.toFixed(0)),
      top_action: u.topAction || 'nessuna',
      trend_vs_mese_prec: u.trend,
      azioni_count: u.oreThisMonth > 0 ? Math.ceil(u.oreThisMonth * 2) : 0,
    }))

    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token
      if (!token) { setGenerating(false); return }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fly-gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          message: `Analizza le performance del team Simmetria questo mese e dai consigli specifici per ogni utente.\n\nDati team:\n${JSON.stringify(teamData, null, 2)}\n\nRispondi con un insight per ogni utente, una riga ciascuno nel formato:\nNOME: consiglio specifico\n\nMax 2 righe per utente. Tono costruttivo, mai giudicante. Se un utente ha 0 ore/azioni scrivi che i dati sono insufficienti per analizzarlo.`,
          history: [],
        }),
      })

      const json = await res.json()
      const reply: string = json?.reply || json?.message || ''

      const parsed: InsightCard[] = []
      const lines = reply.split('\n').filter((l: string) => l.trim().length > 0)

      for (const line of lines) {
        const colonIdx = line.indexOf(':')
        if (colonIdx < 1) continue
        const nameStr = line.slice(0, colonIdx).replace(/^\*\*|\*\*$/g, '').replace(/^-\s*/, '').trim()
        const insightText = line.slice(colonIdx + 1).trim()
        if (!insightText) continue

        const matchedUser = userRows.find(u =>
          u.nome.toLowerCase().includes(nameStr.toLowerCase()) ||
          nameStr.toLowerCase().includes(u.nome.split(' ')[0].toLowerCase())
        )

        if (matchedUser) {
          parsed.push({
            userId: matchedUser.id,
            nome: matchedUser.nome,
            role: matchedUser.role,
            avatar_url: matchedUser.avatar_url,
            insight: insightText,
          })
        } else {
          parsed.push({
            userId: nameStr,
            nome: nameStr,
            role: '',
            avatar_url: null,
            insight: insightText,
          })
        }
      }

      setInsights(parsed)
      setGeneratedAt(new Date().toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))
    } catch (err) {
      console.error('Fly insights error:', err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: '24px', marginTop: '8px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '6px' }}>
          FLY INSIGHTS — TEAM
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginBottom: '16px' }}>
          Analisi comportamentale del team generata da Fly — aggiornata su richiesta
        </p>
      </div>

      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={handleAnalyze}
          disabled={generating}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            padding: '8px 16px',
            borderRadius: '10px',
            border: '1px solid var(--red2)',
            background: generating ? 'transparent' : 'color-mix(in srgb, var(--red2) 10%, transparent)',
            color: 'var(--red2)',
            cursor: generating ? 'wait' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {generating ? 'Analizzando...' : 'Analizza il team con Fly'}
        </button>
        {generatedAt && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>
            Aggiornato {generatedAt}
          </span>
        )}
      </div>

      {generating && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '16px', overflow: 'hidden', position: 'relative' }}>
              <div className="animate-pulse flex items-center gap-3">
                <div className="w-8 h-8 rounded-full" style={{ background: 'var(--line)' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded" style={{ background: 'var(--line)', width: '30%' }} />
                  <div className="h-3 rounded" style={{ background: 'var(--line)', width: '80%' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!generating && insights.length > 0 && (
        <div className="space-y-3">
          {insights.map((card, idx) => {
            const initials = card.nome.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase()
            return (
              <div key={idx} style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '16px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '10px', right: '12px', fontSize: '14px', opacity: 0.4 }}>
                  FLY
                </span>
                <div className="flex items-start gap-3">
                  {card.avatar_url ? (
                    <img src={card.avatar_url} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt="" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0"
                      style={{ background: 'var(--red2)', fontSize: '9px', fontWeight: 600 }}>{initials}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
                      {card.nome}
                      {card.role && <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: '8px' }}>{card.role}</span>}
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
                      {card.insight}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
