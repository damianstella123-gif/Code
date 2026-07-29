import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  fetchBadgeProgram,
  type BadgeProgramData,
  type BadgeProgramItem,
} from '../lib/badge-program-service'

// ─── Status mapping ─────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  planned: 'Programmato',
  ready: 'Pronto',
  in_progress: 'In corso',
  completed: 'Concluso',
  delayed: 'In ritardo',
  cancelled: 'Annullato',
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  planned:     { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  ready:       { bg: '#ecfdf5', text: '#047857', border: '#6ee7b7' },
  in_progress: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  completed:   { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
  delayed:     { bg: '#fef9c3', text: '#a16207', border: '#fde047' },
  cancelled:   { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
}

const DEFAULT_STATUS_COLOR = { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  } catch {
    return dateStr
  }
}

function formatTime(t: string): string {
  return t.slice(0, 5)
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return ''
  const s = formatDate(start)
  if (!end || end === start) return s
  const e = formatDate(end)
  return `${s} — ${e}`
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return dateStr === today
}

function findNextItem(items: BadgeProgramItem[]): string | null {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  for (const item of items) {
    if (
      item.live_status !== 'completed' &&
      item.live_status !== 'cancelled' &&
      item.live_status !== 'in_progress'
    ) {
      if (item.date > todayStr || (item.date === todayStr && item.start_time.slice(0, 5) > hhmm)) {
        return item.id
      }
    }
  }
  return null
}

// ─── Theme helpers ──────────────────────────────────────────────────────────

function resolveThemeColor(theme: Record<string, unknown>, key: string, fallback: string): string {
  const v = theme[key]
  if (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)) return v
  return fallback
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function BadgeProgram() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<BadgeProgramData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (showLoading: boolean) => {
    if (!token) {
      setError('Programma non disponibile.')
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    try {
      const result = await fetchBadgeProgram(token)
      if (!mountedRef.current) return
      if (!result) {
        setData(null)
        setError('Programma non disponibile.')
      } else {
        setData(result)
        setError(null)
      }
    } catch {
      if (!mountedRef.current) return
      setError('Impossibile caricare il programma. Riprovare più tardi.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    mountedRef.current = true
    load(true)
    intervalRef.current = setInterval(() => load(false), 30_000)
    return () => {
      mountedRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [load])

  // ── Theme ─────────────────────────────────────────────────────────────────

  const theme = data?.branding?.theme ?? {}
  const primaryColor = resolveThemeColor(theme, 'primary', '#0f172a')
  const bgColor = resolveThemeColor(theme, 'background', '#f8fafc')
  const textColor = resolveThemeColor(theme, 'text', '#1e293b')

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div
        style={{ background: bgColor, color: textColor, minHeight: '100dvh' }}
        className="flex items-center justify-center p-4"
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
          />
          <p style={{ fontSize: 14, color: textColor, opacity: 0.6 }}>Caricamento programma...</p>
        </div>
      </div>
    )
  }

  // ── Error / Not found ─────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <div
        style={{ background: '#f8fafc', color: '#1e293b', minHeight: '100dvh' }}
        className="flex items-center justify-center p-6"
      >
        <div className="text-center" style={{ maxWidth: 400 }}>
          <div
            style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}
            aria-hidden="true"
          >
            &#9776;
          </div>
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {error ?? 'Programma non disponibile.'}
          </p>
          {error && error.includes('Riprovare') && (
            <button
              onClick={() => load(true)}
              style={{
                marginTop: 16,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 500,
                background: '#0f172a',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              Riprova
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Data ready ────────────────────────────────────────────────────────────

  const { event, branding, program } = data
  const nextId = findNextItem(program)

  const datesByGroup: Record<string, BadgeProgramItem[]> = {}
  for (const item of program) {
    const key = item.date
    if (!datesByGroup[key]) datesByGroup[key] = []
    datesByGroup[key].push(item)
  }
  const sortedDates = Object.keys(datesByGroup).sort()

  return (
    <div
      style={{
        background: bgColor,
        color: textColor,
        minHeight: '100dvh',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      }}
    >
      {/* Hero */}
      {branding.hero_image_url && (
        <div
          style={{
            width: '100%',
            height: 180,
            backgroundImage: `url(${branding.hero_image_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}

      {/* Header */}
      <header
        style={{
          padding: '24px 16px 16px',
          paddingTop: branding.hero_image_url ? 24 : 'max(24px, env(safe-area-inset-top))',
          maxWidth: 600,
          margin: '0 auto',
        }}
      >
        {branding.logo_url && (
          <img
            src={branding.logo_url}
            alt=""
            style={{ height: 48, maxWidth: 200, objectFit: 'contain', marginBottom: 16 }}
          />
        )}
        <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>
          {event.title}
        </h1>
        {(event.start_date || event.location) && (
          <div style={{ marginTop: 8, fontSize: 14, opacity: 0.7, lineHeight: 1.5 }}>
            {event.start_date && (
              <div>{formatDateRange(event.start_date, event.end_date)}</div>
            )}
            {event.location && <div>{event.location}</div>}
          </div>
        )}
      </header>

      {/* Program section */}
      <main style={{ padding: '0 16px 24px', maxWidth: 600, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            gap: 12,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            Programma dell'evento
          </h2>
          <button
            onClick={() => load(false)}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              background: primaryColor,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              minHeight: 44,
              whiteSpace: 'nowrap',
            }}
          >
            Aggiorna programma
          </button>
        </div>

        {program.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              fontSize: 15,
              opacity: 0.6,
              border: '1px dashed #cbd5e1',
              borderRadius: 12,
            }}
          >
            Il programma non è ancora disponibile.
          </div>
        ) : (
          sortedDates.map((dateKey) => {
            const items = datesByGroup[dateKey]
            const today = isToday(dateKey)
            return (
              <section key={dateKey} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    marginBottom: 10,
                    padding: '6px 12px',
                    borderRadius: 6,
                    background: today ? primaryColor : '#e2e8f0',
                    color: today ? '#fff' : textColor,
                    display: 'inline-block',
                  }}
                >
                  {formatDate(dateKey)}
                  {today && ' — Oggi'}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {items.map((item) => (
                    <ProgramCard
                      key={item.id}
                      item={item}
                      isNext={item.id === nextId}
                      primaryColor={primaryColor}
                    />
                  ))}
                </div>
              </section>
            )
          })
        )}
      </main>
    </div>
  )
}

// ─── Program Card ───────────────────────────────────────────────────────────

function ProgramCard({
  item,
  isNext,
  primaryColor,
}: {
  item: BadgeProgramItem
  isNext: boolean
  primaryColor: string
}) {
  const isLive = item.live_status === 'in_progress'
  const isDelayed = item.live_status === 'delayed' || item.delay_minutes > 0
  const statusColor = STATUS_COLORS[item.live_status] ?? DEFAULT_STATUS_COLOR

  let borderLeft = '4px solid transparent'
  if (isLive) borderLeft = `4px solid ${primaryColor}`
  else if (isNext) borderLeft = `4px solid #3b82f6`
  else if (isDelayed) borderLeft = `4px solid #f59e0b`

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 10,
        padding: '14px 14px 14px 12px',
        borderLeft,
        boxShadow: isLive
          ? `0 0 0 1px ${primaryColor}33, 0 2px 8px ${primaryColor}18`
          : isNext
            ? '0 0 0 1px #3b82f633, 0 2px 8px #3b82f618'
            : '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* Time + Status row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.55 }}>
          {formatTime(item.start_time)}
          {item.end_time && ` – ${formatTime(item.end_time)}`}
        </span>

        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: 20,
            background: statusColor.bg,
            color: statusColor.text,
            border: `1px solid ${statusColor.border}`,
            textTransform: 'uppercase',
            letterSpacing: 0.3,
            whiteSpace: 'nowrap',
          }}
        >
          {STATUS_LABELS[item.live_status] ?? item.live_status}
        </span>
      </div>

      {/* Title */}
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, marginBottom: 4 }}>
        {item.title}
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 13, opacity: 0.6 }}>
        {item.category && item.category !== 'altro' && (
          <span>{item.category}</span>
        )}
        {item.location && (
          <span>{item.location}</span>
        )}
      </div>

      {/* Delay */}
      {item.delay_minutes > 0 && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            fontWeight: 600,
            color: '#a16207',
            background: '#fef9c3',
            padding: '4px 10px',
            borderRadius: 6,
            display: 'inline-block',
          }}
        >
          Ritardo: {item.delay_minutes} min
        </div>
      )}

      {/* Next badge */}
      {isNext && !isLive && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            fontWeight: 600,
            color: '#1d4ed8',
            background: '#eff6ff',
            padding: '3px 8px',
            borderRadius: 6,
            display: 'inline-block',
            textTransform: 'uppercase',
            letterSpacing: 0.3,
          }}
        >
          Prossimo
        </div>
      )}

      {/* Live pulse */}
      {isLive && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            color: primaryColor,
            textTransform: 'uppercase',
            letterSpacing: 0.3,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: primaryColor,
              display: 'inline-block',
              animation: 'badge-pulse 1.5s ease-in-out infinite',
            }}
          />
          In corso ora
          <style>{`@keyframes badge-pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
        </div>
      )}
    </div>
  )
}
