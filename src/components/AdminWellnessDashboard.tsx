import { useState, useEffect } from 'react'
import { AlertTriangle, Users, TrendingDown, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface MemberMood {
  id: string
  name: string
  avgMood: number
  lastMood: string | null
  breaksTaken: number
}

export default function AdminWellnessDashboard() {
  const [members, setMembers] = useState<MemberMood[]>([])
  const [teamVibe, setTeamVibe] = useState(0)
  const [atRisk, setAtRisk] = useState<MemberMood[]>([])

  useEffect(() => {
    loadTeamData()
  }, [])

  async function loadTeamData() {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('attivo', true)

    if (!profiles) return

    const { data: logs } = await supabase
      .from('wellness_logs')
      .select('user_id, tipo, mood, created_at')
      .gte('created_at', weekAgo.toISOString())

    const moodScores: Record<string, number> = { fire: 5, happy: 4, neutral: 3, tired: 2, dead: 1 }

    const memberData: MemberMood[] = profiles.map(p => {
      const userLogs = (logs || []).filter(l => l.user_id === p.id)
      const moodLogs = userLogs.filter(l => l.tipo === 'mood' && l.mood)
      const breakLogs = userLogs.filter(l => l.tipo === 'break')

      const avgMood = moodLogs.length > 0
        ? moodLogs.reduce((sum, l) => sum + (moodScores[l.mood!] || 3), 0) / moodLogs.length
        : 3

      const lastMood = moodLogs.length > 0 ? moodLogs[0].mood : null

      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`.trim(),
        avgMood,
        lastMood,
        breaksTaken: breakLogs.length,
      }
    })

    memberData.sort((a, b) => a.avgMood - b.avgMood)
    setMembers(memberData)

    const overall = memberData.length > 0
      ? Math.round((memberData.reduce((s, m) => s + m.avgMood, 0) / memberData.length / 5) * 100)
      : 0
    setTeamVibe(overall)

    setAtRisk(memberData.filter(m => m.avgMood < 2.5))
  }

  const getMoodEmoji = (mood: string | null): string => {
    const map: Record<string, string> = { fire: '\u{1F525}', happy: '\u{1F60A}', neutral: '\u{1F610}', tired: '\u{1F634}', dead: '\u{1F480}' }
    return mood ? (map[mood] || '\u{2796}') : '\u{2796}'
  }

  const getVibeColor = (score: number): string => {
    if (score >= 70) return '#10b981'
    if (score >= 40) return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div className="space-y-4">
      {/* Team vibe header */}
      <div
        className="rounded-2xl p-4 sm:p-5"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" style={{ color: 'var(--red2, #d0003a)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
              Team Morale
            </h3>
          </div>
          <div
            className="text-lg font-bold px-3 py-1 rounded-xl"
            style={{ color: getVibeColor(teamVibe), background: `${getVibeColor(teamVibe)}15` }}
          >
            {teamVibe}%
          </div>
        </div>

        {/* At risk alerts */}
        {atRisk.length > 0 && (
          <div className="mb-4 space-y-2">
            {atRisk.map(m => (
              <div
                key={m.id}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#ef4444' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--foreground)' }}>
                    {m.name}
                  </p>
                  <p className="text-[10px]" style={{ color: '#ef4444' }}>
                    Mood basso questa settimana
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="w-3 h-3" style={{ color: '#ef4444' }} />
                  <span className="text-xs font-mono" style={{ color: '#ef4444' }}>
                    {m.avgMood.toFixed(1)}/5
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Suggested actions for at-risk */}
        {atRisk.length > 0 && (
          <div className="mb-4 p-3 rounded-xl" style={{ background: 'var(--secondary)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <MessageSquare className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
              <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Azioni suggerite</p>
            </div>
            <ul className="space-y-1">
              <li className="text-xs" style={{ color: 'var(--foreground)' }}>
                {'\u{2022}'} Check-in 1:1 con chi e in difficolta
              </li>
              <li className="text-xs" style={{ color: 'var(--foreground)' }}>
                {'\u{2022}'} Riduci il carico o redistribuisci task
              </li>
              <li className="text-xs" style={{ color: 'var(--foreground)' }}>
                {'\u{2022}'} Organizza un momento team informale
              </li>
            </ul>
          </div>
        )}

        {/* Team overview */}
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>Panoramica team</p>
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
            {members.map(m => (
              <div
                key={m.id}
                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ background: 'var(--secondary)' }}
              >
                <span className="text-base shrink-0">{getMoodEmoji(m.lastMood)}</span>
                <span className="text-xs flex-1 truncate" style={{ color: 'var(--foreground)' }}>
                  {m.name}
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>
                  {m.avgMood.toFixed(1)}
                </span>
                <div
                  className="w-12 h-1.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--line)' }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(m.avgMood / 5) * 100}%`, background: getVibeColor((m.avgMood / 5) * 100) }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
