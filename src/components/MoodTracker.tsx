import { useState } from 'react'
import { logMood, getMoodEmoji, getMoodLabel } from '@/lib/wellness-service'
import type { MoodEmoji } from '@/lib/wellness-service'

const MOODS: MoodEmoji[] = ['fire', 'happy', 'neutral', 'tired', 'dead']

const REACTIONS: Record<MoodEmoji, string> = {
  fire: 'Unstoppable! Chi ti ferma oggi?',
  happy: 'Grande energia! Keep vibing.',
  neutral: 'Ok ok, una giornata tranquilla.',
  tired: 'Ci sta. Una pausa?',
  dead: 'Ahi. Forse e ora di staccare.',
}

interface MoodTrackerProps {
  compact?: boolean
  onMoodLogged?: () => void
}

export default function MoodTracker({ compact, onMoodLogged }: MoodTrackerProps) {
  const [selected, setSelected] = useState<MoodEmoji | null>(null)
  const [saving, setSaving] = useState(false)
  const [reaction, setReaction] = useState<string | null>(null)

  const handleSelect = async (mood: MoodEmoji) => {
    if (saving) return
    setSelected(mood)
    setSaving(true)
    setReaction(REACTIONS[mood])

    await logMood(mood)
    setSaving(false)

    setTimeout(() => {
      setReaction(null)
      setSelected(null)
      onMoodLogged?.()
    }, 2500)
  }

  return (
    <div className={compact ? '' : 'p-4'}>
      {!compact && (
        <p className="text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>
          Come ti senti ora?
        </p>
      )}

      <div className="flex items-center justify-center gap-2 sm:gap-3">
        {MOODS.map(mood => (
          <button
            key={mood}
            onClick={() => handleSelect(mood)}
            disabled={saving}
            className="flex flex-col items-center gap-1 transition-all active:scale-90"
            style={{
              opacity: selected && selected !== mood ? 0.4 : 1,
              transform: selected === mood ? 'scale(1.25)' : 'scale(1)',
              minWidth: 48,
              minHeight: 48,
            }}
          >
            <span className="text-2xl sm:text-3xl select-none">
              {getMoodEmoji(mood)}
            </span>
            {!compact && (
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                {getMoodLabel(mood)}
              </span>
            )}
          </button>
        ))}
      </div>

      {reaction && (
        <div
          className="mt-3 text-center text-xs py-2 px-3 rounded-xl animate-fadeIn"
          style={{ background: 'var(--secondary)', color: 'var(--foreground)' }}
        >
          {reaction}
        </div>
      )}
    </div>
  )
}
