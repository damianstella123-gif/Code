import { useState, useEffect } from 'react'
import { Users, Info } from 'lucide-react'
import { getTeamMoodAggregate } from '@/lib/wellness-service'
import type { TeamMoodAggregate } from '@/lib/wellness-service'

const PERIOD_DAYS = 14

function vibeColor(scorePct: number): string {
  if (scorePct >= 70) return '#10b981'
  if (scorePct >= 40) return '#f59e0b'
  return '#ef4444'
}

function formatDay(date: string): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
}

export default function AdminWellnessDashboard() {
  const [data, setData] = useState<TeamMoodAggregate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const result = await getTeamMoodAggregate(PERIOD_DAYS)
      if (!active) return
      if (!result) {
        setError(true)
      } else {
        setData(result)
      }
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [])

  const trend = data?.trend ?? []
  const overallAvg =
    trend.length > 0 ? trend.reduce((s, t) => s + t.avgMood, 0) / trend.length : 0
  const overallPct = Math.round((overallAvg / 5) * 100)

  return (
    <div
      className="rounded-2xl p-4 sm:p-5"
      style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5" style={{ color: 'var(--red2, #d0003a)' }} />
          <h3 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
            Umore del team
          </h3>
        </div>
        {data?.sufficient && (
          <div
            className="text-lg font-bold px-3 py-1 rounded-xl"
            style={{ color: vibeColor(overallPct), background: `${vibeColor(overallPct)}15` }}
          >
            {overallPct}%
          </div>
        )}
      </div>

      <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
        Media dell&apos;intero team negli ultimi {PERIOD_DAYS} giorni. Nessun dato individuale:
        i valori qui sono sempre e solo aggregati.
      </p>

      {loading ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          Caricamento in corso...
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
          Non e stato possibile caricare i dati del team in questo momento.
        </div>
      ) : !data?.sufficient ? (
        <div
          className="flex items-start gap-3 p-4 rounded-xl"
          style={{ background: 'var(--secondary)' }}
        >
          <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--muted)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              Dati insufficienti
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Servono almeno 5 persone che abbiano registrato il proprio umore nel periodo per
              mostrare una media di team. Cosi restano protette le singole persone.
            </p>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-end justify-between gap-1 h-32 mb-2">
            {trend.map(point => {
              const pct = (point.avgMood / 5) * 100
              return (
                <div key={point.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex items-end justify-center" style={{ height: 96 }}>
                    <div
                      className="w-full max-w-[18px] rounded-t-md transition-all"
                      style={{ height: `${Math.max(pct, 4)}%`, background: vibeColor(pct) }}
                    />
                  </div>
                  <span
                    className="text-[9px] leading-tight text-center truncate w-full"
                    style={{ color: 'var(--muted)' }}
                  >
                    {formatDay(point.date)}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
            Basato su {data.contributors} persone che hanno registrato il proprio umore nel periodo.
          </p>
        </div>
      )}
    </div>
  )
}
