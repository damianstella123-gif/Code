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

export async function logMood(mood: MoodEmoji, context?: string): Promise<void> {
  await supabase.from('wellness_logs').insert({
    tipo: 'mood',
    mood,
    mood_context: context || null,
  })
}

export async function getRecentMoods(days = 7): Promise<{ mood: MoodEmoji; created_at: string }[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data } = await supabase
    .from('wellness_logs')
    .select('mood, created_at')
    .eq('tipo', 'mood')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(50)

  return (data || []).filter((d): d is { mood: MoodEmoji; created_at: string } => !!d.mood)
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

export async function getBreakRecommendation(): Promise<{ type: BreakType; text: string } | null> {
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

  const types: BreakType[] = ['walk', 'zen', 'hydrate', 'vibe', 'stretch']
  const type = types[Math.floor(Math.random() * types.length)]

  const texts: Record<BreakType, string[]> = {
    walk: ['Muovi le gambe! Il genio cammina.', 'Steve Jobs faceva meeting camminando. Tu?'],
    zen: ['3 respiri profondi. Non costa nulla.', 'Chiudi gli occhi 60 secondi. Il mondo resiste.'],
    hydrate: ['Bevi acqua. Il cervello e al 75% H2O.', 'Un bicchiere d\'acqua = +14% produttivita.'],
    vibe: ['Metti la tua canzone preferita. 3 minuti.', 'Quick dance break. Nessuno ti giudica.'],
    stretch: ['Collo, spalle, polsi. 2 minuti.', 'Alzati e stirati. La sedia non e il tuo destino.'],
  }

  const options = texts[type]
  const text = options[Math.floor(Math.random() * options.length)]

  return { type, text }
}

export async function saveBreakRecommendation(type: BreakType, text: string): Promise<void> {
  await supabase.from('break_recommendations').insert({
    recommendation_type: type,
    recommendation_text: text,
    trigger_reason: 'desktime_52min',
    work_duration_minutes: 52,
  })
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

  await supabase.from('wellness_logs').insert({
    tipo: 'break',
    break_type: breakType,
    break_taken_at: new Date().toISOString(),
    break_duration_minutes: 17,
  })
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
      .eq('tipo', 'mood')
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('wellness_logs')
      .select('id')
      .eq('tipo', 'break')
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
    ? moods.reduce((sum, m) => sum + (MOOD_SCORES[m.mood as MoodEmoji] || 3), 0) / moods.length
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
