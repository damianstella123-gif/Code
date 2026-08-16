import { supabase } from './supabase'

export type MoodEmoji = 'fire' | 'happy' | 'neutral' | 'tired' | 'dead'

const MOOD_SCORES: Record<MoodEmoji, number> = {
  fire: 5,
  happy: 4,
  neutral: 3,
  tired: 2,
  dead: 1,
}

export function getMoodLabel(mood: MoodEmoji): string {
  const labels: Record<MoodEmoji, string> = {
    fire: 'On Fire',
    happy: 'Bene',
    neutral: 'Meh',
    tired: 'Stanco',
    dead: 'KO',
  }
  return labels[mood]
}

export function getMoodEmoji(mood: MoodEmoji): string {
  const emojis: Record<MoodEmoji, string> = {
    fire: '\u{1F525}',
    happy: '\u{1F60A}',
    neutral: '\u{1F610}',
    tired: '\u{1F634}',
    dead: '\u{1F480}',
  }
  return emojis[mood]
}

// The database stores mood as emoji characters; the app uses friendly names.
const MOOD_TO_DB: Record<MoodEmoji, string> = {
  fire: '\u{1F60D}',
  happy: '\u{1F60A}',
  neutral: '\u{1F610}',
  tired: '\u{1F615}',
  dead: '\u{1F620}',
}

const DB_TO_MOOD: Record<string, MoodEmoji> = {
  '\u{1F60D}': 'fire',
  '\u{1F60A}': 'happy',
  '\u{1F610}': 'neutral',
  '\u{1F615}': 'tired',
  '\u{1F620}': 'dead',
}

function dbMoodToApp(dbMood: string): MoodEmoji {
  return DB_TO_MOOD[dbMood] ?? 'neutral'
}

// The database stores break_type as specific activity names.
const BREAK_TO_DB: Record<BreakType, string> = {
  walk: 'walking',
  zen: 'meditation',
  hydrate: 'hydration',
  stretch: 'stretching',
  vibe: 'other',
}

export async function logMood(mood: MoodEmoji, context?: string): Promise<void> {
  const { error } = await supabase.from('wellness_logs').insert({
    tipo: 'mood_emoji',
    mood: MOOD_TO_DB[mood],
    mood_context: context || null,
  })
  if (error) throw new Error(`Failed to log mood: ${error.message}`)
}

export async function getRecentMoods(days = 7): Promise<{ mood: MoodEmoji; created_at: string }[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data } = await supabase
    .from('wellness_logs')
    .select('mood, created_at')
    .eq('tipo', 'mood_emoji')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  return (data || [])
    .filter((d): d is { mood: string; created_at: string } => !!d.mood)
    .map(d => ({ mood: dbMoodToApp(d.mood), created_at: d.created_at }))
}

export function computeMoodTrend(moods: { mood: MoodEmoji }[]): 'up' | 'down' | 'stable' {
  if (moods.length < 3) return 'stable'
  const recent = moods.slice(0, 3).map(m => MOOD_SCORES[m.mood])
  const older = moods.slice(3, 6).map(m => MOOD_SCORES[m.mood])
  if (older.length === 0) return 'stable'
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length
  if (avgRecent - avgOlder > 0.5) return 'up'
  if (avgOlder - avgRecent > 0.5) return 'down'
  return 'stable'
}

export type BreakType = 'walk' | 'zen' | 'hydrate' | 'vibe' | 'stretch'

const BREAK_LABELS: Record<BreakType, string> = {
  walk: 'Passeggiata',
  zen: 'Zen Mode',
  hydrate: 'Idratazione',
  vibe: 'Vibe Check',
  stretch: 'Stretching',
}

export function getBreakLabel(type: BreakType): string {
  return BREAK_LABELS[type]
}

export type BreakTriggerReason = 'time_elapsed' | 'mood_low'

export interface BreakRecommendation {
  type: BreakType
  text: string
  reason: BreakTriggerReason
  workMinutes: number
}

const MOOD_LOW_THRESHOLD = 2
const RECENT_MOOD_WINDOW_HOURS = 4

const BREAK_TEXTS: Record<BreakType, string> = {
  walk: 'Sei al lavoro da un po\'. Alzati e fai due passi: schiarisce le idee.',
  zen: 'Prenditi un momento di calma: tre respiri lenti e occhi chiusi per un minuto.',
  hydrate: 'Bevi un bicchiere d\'acqua e stacca lo sguardo dallo schermo per un attimo.',
  stretch: 'Sciogli collo, spalle e polsi con qualche allungamento, un paio di minuti.',
  vibe: 'Metti la tua canzone preferita e stacca la testa per qualche minuto.',
}

// Deterministic choice based on how long the current active session has run
// and the person's most recent mood. Never random, never fabricated.
function chooseBreak(activeMinutes: number, moodScore: number | null): { type: BreakType; reason: BreakTriggerReason } {
  if (moodScore !== null && moodScore <= MOOD_LOW_THRESHOLD) {
    return activeMinutes >= 75
      ? { type: 'walk', reason: 'mood_low' }
      : { type: 'zen', reason: 'mood_low' }
  }

  if (activeMinutes >= 90) return { type: 'walk', reason: 'time_elapsed' }
  if (activeMinutes >= 60) return { type: 'stretch', reason: 'time_elapsed' }
  return { type: 'hydrate', reason: 'time_elapsed' }
}

// DB constraint on break_recommendations.recommendation_type allows a fixed set.
const DB_RECOMMENDATION_TYPE: Record<BreakType, string> = {
  walk: 'walk_outdoor',
  zen: 'meditation',
  hydrate: 'hydration',
  stretch: 'stretch',
  vibe: 'social',
}

export async function getBreakRecommendation(activeMinutes: number): Promise<BreakRecommendation | null> {
  const { data: recent } = await supabase
    .from('break_recommendations')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)

  if (recent && recent.length > 0) {
    const lastTime = new Date(recent[0].created_at).getTime()
    const now = Date.now()
    if (now - lastTime < 20 * 60 * 1000) return null
  }

  const since = new Date()
  since.setHours(since.getHours() - RECENT_MOOD_WINDOW_HOURS)

  const { data: moodRows } = await supabase
    .from('wellness_logs')
    .select('mood')
    .eq('tipo', 'mood_emoji')
    .not('mood', 'is', null)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  const latestMood = moodRows && moodRows.length > 0 ? dbMoodToApp(moodRows[0].mood) : null
  const moodScore = latestMood ? (MOOD_SCORES[latestMood] ?? null) : null

  const { type, reason } = chooseBreak(activeMinutes, moodScore)

  return { type, text: BREAK_TEXTS[type], reason, workMinutes: Math.max(0, Math.round(activeMinutes)) }
}

export async function saveBreakRecommendation(rec: BreakRecommendation): Promise<void> {
  await supabase.from('break_recommendations').insert({
    recommendation_type: DB_RECOMMENDATION_TYPE[rec.type],
    recommendation_text: rec.text,
    trigger_reason: rec.reason,
    work_duration_minutes: rec.workMinutes,
  })
}

export interface TeamMoodAggregate {
  sufficient: boolean
  contributors: number
  trend: { date: string; avgMood: number; contributors: number }[]
}

export async function getTeamMoodAggregate(daysBack = 14): Promise<TeamMoodAggregate | null> {
  const { data, error } = await supabase.rpc('get_team_mood_aggregate', { days_back: daysBack })
  if (error || !data) return null

  const payload = data as {
    sufficient?: boolean
    contributors?: number
    trend?: { date: string; avg_mood: number; contributors: number }[]
  }

  return {
    sufficient: !!payload.sufficient,
    contributors: Number(payload.contributors) || 0,
    trend: Array.isArray(payload.trend)
      ? payload.trend.map(r => ({
          date: String(r.date),
          avgMood: Number(r.avg_mood) || 0,
          contributors: Number(r.contributors) || 0,
        }))
      : [],
  }
}

export async function markBreakTaken(breakType: BreakType): Promise<void> {
  const { data } = await supabase
    .from('break_recommendations')
    .select('id')
    .eq('break_taken', false)
    .order('created_at', { ascending: false })
    .limit(1)

  if (data && data.length > 0) {
    await supabase
      .from('break_recommendations')
      .update({ break_taken: true, break_taken_at: new Date().toISOString() })
      .eq('id', data[0].id)
  }

  const { error: breakLogError } = await supabase.from('wellness_logs').insert({
    tipo: 'break_taken',
    break_type: BREAK_TO_DB[breakType],
    break_taken_at: new Date().toISOString(),
    break_duration_minutes: 17,
  })
  if (breakLogError) throw new Error(`Failed to log break: ${breakLogError.message}`)
}

export async function giveRecognition(toUserId: string, tipo: string, message: string): Promise<void> {
  await supabase.from('recognition_logs').insert({
    given_to: toUserId,
    tipo,
    message,
    public: true,
  })
}

export async function getTeamRecognitionFeed(limit = 20): Promise<{
  id: string
  given_by: string
  given_to: string
  tipo: string
  message: string
  created_at: string
}[]> {
  const { data } = await supabase
    .from('recognition_logs')
    .select('id, given_by, given_to, tipo, message, created_at')
    .eq('public', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  return data || []
}

export async function getUserWellnessStats(): Promise<{
  moodScore: number
  breaksToday: number
  recognitionsGiven: number
  recognitionsReceived: number
  burnoutRisk: 'low' | 'medium' | 'high'
  wellnessScore: number
}> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [moodsRes, breaksRes, givenRes, receivedRes] = await Promise.all([
    supabase
      .from('wellness_logs')
      .select('mood')
      .eq('tipo', 'mood_emoji')
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('wellness_logs')
      .select('id')
      .eq('tipo', 'break_taken')
      .gte('created_at', today.toISOString()),
    supabase
      .from('recognition_logs')
      .select('id')
      .gte('created_at', weekAgo.toISOString()),
    supabase
      .from('recognition_logs')
      .select('id')
      .gte('created_at', weekAgo.toISOString()),
  ])

  const moods = (moodsRes.data || []).filter(m => m.mood)
  const avgMood = moods.length > 0
    ? moods.reduce((sum, m) => sum + (MOOD_SCORES[dbMoodToApp(m.mood)] || 3), 0) / moods.length
    : 3

  const breaksToday = breaksRes.data?.length || 0
  const recognitionsGiven = givenRes.data?.length || 0
  const recognitionsReceived = receivedRes.data?.length || 0

  const moodScore = (avgMood / 5) * 100
  const breakScore = Math.min(breaksToday / 3, 1) * 100
  const recognitionScore = Math.min((recognitionsGiven + recognitionsReceived) / 5, 1) * 100

  const burnoutIndicator = avgMood < 2.5 && breaksToday < 1
  const burnoutRisk: 'low' | 'medium' | 'high' = burnoutIndicator
    ? 'high'
    : avgMood < 3 ? 'medium' : 'low'

  const burnoutScore = burnoutRisk === 'low' ? 100 : burnoutRisk === 'medium' ? 50 : 20
  const wellnessScore = Math.round(
    moodScore * 0.3 + breakScore * 0.25 + recognitionScore * 0.2 + burnoutScore * 0.25
  )

  return {
    moodScore: Math.round(moodScore),
    breaksToday,
    recognitionsGiven,
    recognitionsReceived,
    burnoutRisk,
    wellnessScore,
  }
}

export function getBurnoutRiskLevel(risk: 'low' | 'medium' | 'high'): { label: string; color: string } {
  const map = {
    low: { label: 'Tranquillo', color: '#10b981' },
    medium: { label: 'Occhio', color: '#f59e0b' },
    high: { label: 'Alert', color: '#ef4444' },
  }
  return map[risk]
}
