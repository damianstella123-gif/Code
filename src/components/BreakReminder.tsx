import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Coffee, Droplets, Music, Wind, Footprints, Timer } from 'lucide-react'
import { getBreakRecommendation, saveBreakRecommendation, markBreakTaken, getBreakLabel } from '@/lib/wellness-service'
import type { BreakType } from '@/lib/wellness-service'

const BREAK_ICONS: Record<BreakType, React.ElementType> = {
  walk: Footprints,
  zen: Wind,
  hydrate: Droplets,
  vibe: Music,
  stretch: Coffee,
}

const WORK_INTERVAL = 52 * 60 * 1000
const BREAK_DURATION = 17 * 60

export default function BreakReminder() {
  const [visible, setVisible] = useState(false)
  const [breakInfo, setBreakInfo] = useState<{ type: BreakType; text: string } | null>(null)
  const [timerActive, setTimerActive] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(BREAK_DURATION)
  const [completed, setCompleted] = useState(false)
  const sessionStartRef = useRef<number>(Date.now())

  const triggerBreak = useCallback(async () => {
    const activeMinutes = (Date.now() - sessionStartRef.current) / 60000
    const rec = await getBreakRecommendation(activeMinutes)
    if (rec) {
      setBreakInfo(rec)
      setVisible(true)
      await saveBreakRecommendation(rec)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(triggerBreak, WORK_INTERVAL)
    const initial = setTimeout(triggerBreak, WORK_INTERVAL)
    return () => { clearInterval(timer); clearTimeout(initial) }
  }, [triggerBreak])

  useEffect(() => {
    if (!timerActive || secondsLeft <= 0) return
    const interval = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          setTimerActive(false)
          setCompleted(true)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [timerActive, secondsLeft])

  const startBreak = async (type: BreakType) => {
    setTimerActive(true)
    setSecondsLeft(BREAK_DURATION)
    sessionStartRef.current = Date.now()
    await markBreakTaken(type)
  }

  const dismiss = () => {
    setVisible(false)
    setTimerActive(false)
    setCompleted(false)
    setSecondsLeft(BREAK_DURATION)
  }

  if (!visible || !breakInfo) return null

  const Icon = BREAK_ICONS[breakInfo.type]
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  return (
    <div className="fixed bottom-[72px] sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:w-[360px] z-[90] animate-slideUp">
      <div
        className="rounded-2xl p-4 sm:p-5 shadow-xl"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(16,185,129,0.12)' }}
            >
              <Icon className="w-5 h-5" style={{ color: '#10b981' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                Pausa Intelligente
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                52 min di lavoro continuo
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 rounded-lg hover:opacity-70 transition-opacity shrink-0"
            style={{ color: 'var(--muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {completed ? (
          <div className="text-center py-4">
            <p className="text-2xl mb-2">{'\u{1F389}'}</p>
            <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              Pausa completata! Sei un campione.
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              +15 punti wellness
            </p>
            <button
              onClick={dismiss}
              className="mt-3 px-4 py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: '#10b981', color: '#fff' }}
            >
              Torno operativo
            </button>
          </div>
        ) : timerActive ? (
          <div className="text-center py-3">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Timer className="w-4 h-4" style={{ color: '#10b981' }} />
              <span className="text-2xl font-mono font-bold" style={{ color: 'var(--foreground)' }}>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {breakInfo.text}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm mb-3" style={{ color: 'var(--foreground)' }}>
              {breakInfo.text}
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {(['walk', 'zen', 'hydrate', 'vibe', 'stretch'] as BreakType[]).map(type => {
                const BIcon = BREAK_ICONS[type]
                return (
                  <button
                    key={type}
                    onClick={() => startBreak(type)}
                    className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl transition-all active:scale-95 hover:opacity-80"
                    style={{ background: 'var(--secondary)', minHeight: 56 }}
                  >
                    <BIcon className="w-4 h-4" style={{ color: '#10b981' }} />
                    <span className="text-[9px] leading-tight text-center" style={{ color: 'var(--muted)' }}>
                      {getBreakLabel(type).slice(0, 6)}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
