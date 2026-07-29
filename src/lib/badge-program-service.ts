import { supabase } from './supabase'

// ─── Types (match get_badge_program response) ───────────────────────────────

export interface BadgeProgramEvent {
  id: string
  title: string
  start_date: string | null
  end_date: string | null
  location: string | null
}

export interface BadgeProgramBranding {
  logo_url: string
  hero_image_url: string
  theme: Record<string, unknown>
}

export interface BadgeProgramItem {
  id: string
  title: string
  category: string
  date: string
  end_date: string | null
  start_time: string
  end_time: string | null
  location: string
  sort_order: number
  live_status: string
  actual_start: string | null
  actual_end: string | null
  delay_minutes: number
}

export interface BadgeProgramData {
  event: BadgeProgramEvent
  branding: BadgeProgramBranding
  program: BadgeProgramItem[]
}

// ─── Validation ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isValidEvent(v: unknown): v is BadgeProgramEvent {
  if (!isObject(v)) return false
  return typeof v.id === 'string' && typeof v.title === 'string'
}

function isValidBranding(v: unknown): v is BadgeProgramBranding {
  if (!isObject(v)) return false
  return (
    typeof v.logo_url === 'string' &&
    typeof v.hero_image_url === 'string' &&
    isObject(v.theme)
  )
}

function isValidItem(v: unknown): v is BadgeProgramItem {
  if (!isObject(v)) return false
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.date === 'string' &&
    typeof v.start_time === 'string' &&
    typeof v.live_status === 'string'
  )
}

function isValidResponse(v: unknown): v is BadgeProgramData {
  if (!isObject(v)) return false
  if (!isValidEvent(v.event)) return false
  if (!isValidBranding(v.branding)) return false
  if (!Array.isArray(v.program)) return false
  return v.program.every(isValidItem)
}

// ─── API ────────────────────────────────────────────────────────────────────

export async function fetchBadgeProgram(token: string): Promise<BadgeProgramData | null> {
  if (!UUID_RE.test(token)) return null

  try {
    const { data, error } = await supabase.rpc('get_badge_program', { p_qr_token: token })
    if (error) throw error
    if (!data) return null
    if (!isValidResponse(data)) return null
    return data
  } catch {
    throw new Error('Impossibile caricare il programma. Riprovare più tardi.')
  }
}
