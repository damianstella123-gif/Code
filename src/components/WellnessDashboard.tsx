import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, Activity, Coffee, Heart, Shield } from 'lucide-react'
import MoodTracker from './MoodTracker'
import {
  getRecentMoods,
  computeMoodTrend,
  getUserWellnessStats,
  getMoodEmoji,
  getBurnoutRiskLevel,
} from '@/lib/wellness-service'
import type { MoodEmoji } from '@/lib/wellness-service'

export default function WellnessDashboard() {
  const [stats, setStats] = useState<{
    moodScore: number
    breaksToday: number
    recognitionsGiven: number
    recognitionsReceived: number
    burnoutRisk: 'low' | 'medium' | 'high'
    wellnessScore: number
  } | null>(null)
  const [moods, setMoods] = useState<{ mood: MoodEmoji; created_at: string }[]>([])
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    loadData()
  }, [refreshKey])

  async function loadData() {
    const [s, m] = await Promise.all([
      getUserWellnessStats(),
      getRecentMoods(7),
    ])
    setStats(s)
    setMoods(m)
    setTrend(computeMoodTrend(m))
  }

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#f59e0b'

  const burnout = stats ? getBurnoutRiskLevel(stats.burnoutRisk) : null

  const tips = [
    'La regola 52/17: 52 min lavoro, 17 pausa. Funziona davvero.',
    'Un bicchiere d\'acqua ogni ora = cervello felice.',
    'Celebra i piccoli win. Il morale vola.',
    'Scrivi 3 cose positive a fine giornata.',
    'Stacca lo sguardo dallo schermo ogni 20 minuti.',
  ]
  const dailyTip = tips[new Date().getDay() % tips.length]

  return (
    <div className="space-y-4">
      {/* Wellness Score */}
      <div
        className="rounded-2xl p-4 sm:p-5"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5" style={{ color: 'var(--red2, #d0003a)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
              Il tuo Wellness
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendIcon className="w-4 h-4" style={{ color: trendColor }} />
            <span className="text-xs font-medium" style={{ color: trendColor }}>
              {trend === 'up' ? 'In salita' : trend === 'down' ? 'In calo' : 'Stabile'}
            </span>
          </div>
        </div>

        {/* Score ring */}
        <div className="flex items-center gap-4 sm:gap-6 mb-4">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--secondary)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke={stats && stats.wellnessScore >= 70 ? '#10b981' : stats && stats.wellnessScore >= 40 ? '#f59e0b' : '#ef4444'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(stats?.wellnessScore || 0) * 2.64} 264`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                {stats?.wellnessScore || 0}
              </span>
              <span className="text-[9px] leading-tight" style={{ color: 'var(--muted)' }}>
                Punteggio generale
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 flex-1">
            <StatPill icon={Coffee} label="Pause oggi" value={String(stats?.breaksToday || 0)} color="#10b981" />
            <StatPill icon={Heart} label="Applausi" value={String((stats?.recognitionsGiven || 0) + (stats?.recognitionsReceived || 0))} color="#f59e0b" />
            <StatPill
              icon={Shield}
              label="Burnout"
              value={burnout?.label || '...'}
              color={burnout?.color || '#10b981'}
            />
            <StatPill icon={Activity} label="Mood" value={`${stats?.moodScore || 0}%`} color={trendColor} />
          </div>
        </div>

        {/* Mood Timeline */}
        {moods.length > 0 && (
          <div className="mb-4">
            <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>Ultimi mood</p>
            <div className="flex gap-1 flex-wrap">
              {moods.slice(0, 10).map((m, i) => (
                <span key={i} className="text-base" title={new Date(m.created_at).toLocaleString('it-IT')}>
                  {getMoodEmoji(m.mood)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Quick mood */}
        <div className="pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          <MoodTracker compact onMoodLogged={() => setRefreshKey(k => k + 1)} />
        </div>
      </div>

      {/* Daily tip */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}
      >
        <p className="text-xs font-medium mb-1" style={{ color: '#10b981' }}>Tip del giorno</p>
        <p className="text-sm" style={{ color: 'var(--foreground)' }}>{dailyTip}</p>
      </div>
    </div>
  )
}

function StatPill({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: 'var(--secondary)' }}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
      <div className="min-w-0">
        <p className="text-[10px] leading-tight" style={{ color: 'var(--muted)' }}>{label}</p>
        <p className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{value}</p>
      </div>
    </div>
  )
}
