import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getAllowedNavForRole } from '@/lib/auth'

interface Props {
  onComplete: () => void
  userName: string
  userRole: string
}

interface TourStep {
  title: string
  body: string
  targetSelector: string | null
  requiredHref?: string
}

const ALL_STEPS: TourStep[] = [
  {
    title: 'Benvenuto in Synergy, {name}!',
    body: 'Sono Fly, il tuo assistente digitale.\nTi mostro le sezioni principali in pochi passi.',
    targetSelector: null,
  },
  {
    title: 'Dashboard',
    body: 'La tua panoramica: eventi in arrivo, task aperti, statistiche rapide.',
    targetSelector: '[data-onboarding="dashboard"]',
    requiredHref: '/dashboard',
  },
  {
    title: 'Eventi',
    body: 'Gestisci tutti gli eventi: crea, modifica, assegna il team.',
    targetSelector: '[data-onboarding="eventi"]',
    requiredHref: '/eventi',
  },
  {
    title: 'Task',
    body: 'Le attivita assegnate a te e al tuo team, con scadenze e priorita.',
    targetSelector: '[data-onboarding="task"]',
    requiredHref: '/task',
  },
  {
    title: 'Calendario',
    body: 'Tutto in una vista: eventi, task, scadenze, ferie.',
    targetSelector: '[data-onboarding="calendario"]',
    requiredHref: '/calendario',
  },
  {
    title: 'Network',
    body: 'Clienti e fornitori in un unico punto. Il tuo CRM integrato.',
    targetSelector: '[data-onboarding="network"]',
    requiredHref: '/network',
  },
  {
    title: 'Feedback',
    body: 'Suggerisci miglioramenti, vota le proposte del team.',
    targetSelector: '[data-onboarding="feedback-beta"]',
    requiredHref: '/feedback-beta',
  },
  {
    title: 'Sei pronto!',
    body: 'Puoi rivedere questo tour in qualsiasi momento dalla sezione Aiuto nel menu.',
    targetSelector: null,
  },
]

function getStepsForRole(role: string): TourStep[] {
  const allowedHrefs = getAllowedNavForRole(role).map(n => n.href)
  return ALL_STEPS.filter(s => !s.requiredHref || allowedHrefs.includes(s.requiredHref))
}

const POLL_INTERVAL = 80
const POLL_MAX = 800
const SPOTLIGHT_PADDING = 6
const SPOTLIGHT_RADIUS = 10

export default function Onboarding({ onComplete, userName, userRole }: Props) {
  const steps = getStepsForRole(userRole)
  const [step, setStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  const findAndTrack = useCallback((sel: string) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    setTargetRect(rect)
    return el
  }, [])

  useEffect(() => {
    setTargetRect(null)
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }

    const sel = steps[step]?.targetSelector
    if (!sel) return

    const el = findAndTrack(sel)
    if (el) {
      const onResize = () => { setTargetRect(el.getBoundingClientRect()) }
      window.addEventListener('resize', onResize)
      // Recompute position on each frame for ~300ms to catch layout shifts
      let frames = 0
      const trackFrames = () => {
        setTargetRect(el.getBoundingClientRect())
        frames++
        if (frames < 18) rafRef.current = requestAnimationFrame(trackFrames)
      }
      rafRef.current = requestAnimationFrame(trackFrames)
      return () => {
        window.removeEventListener('resize', onResize)
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      }
    }

    // Poll for element existence
    let elapsed = 0
    pollTimerRef.current = window.setInterval(() => {
      elapsed += POLL_INTERVAL
      const found = findAndTrack(sel)
      if (found) {
        if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
      } else if (elapsed >= POLL_MAX) {
        if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
        // Element not in DOM — skip step
        if (step < steps.length - 1) setStep(s => s + 1)
      }
    }, POLL_INTERVAL)

    return () => {
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }
  }, [step])

  async function finish() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await supabase.from('profiles').update({ onboarding_completed: true, onboarding_step: steps.length - 1 }).eq('id', session.user.id)
    }
    onComplete()
  }

  function next() {
    if (step >= steps.length - 1) { finish(); return }
    setStep(s => s + 1)
  }

  function skip() { finish() }

  const current = steps[step]
  const title = current.title.replace('{name}', userName)
  const isFirst = step === 0
  const isLast = step === steps.length - 1
  const progress = ((step + 1) / steps.length) * 100

  // Compute tooltip position relative to the spotlight rect
  let cardPosition: React.CSSProperties
  if (targetRect) {
    const cardWidth = 380
    const rightOfTarget = targetRect.right + 16
    const fitsRight = rightOfTarget + cardWidth < window.innerWidth
    const below = targetRect.bottom + 16
    const fitsBelow = below + 200 < window.innerHeight

    if (fitsRight) {
      cardPosition = {
        top: Math.max(16, targetRect.top),
        left: rightOfTarget,
      }
    } else if (fitsBelow) {
      cardPosition = {
        top: below,
        left: Math.max(16, Math.min(targetRect.left, window.innerWidth - cardWidth - 16)),
      }
    } else {
      cardPosition = {
        bottom: window.innerHeight - targetRect.top + 16,
        left: Math.max(16, Math.min(targetRect.left, window.innerWidth - cardWidth - 16)),
      }
    }
  } else {
    cardPosition = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  // Spotlight cutout rect with padding
  const spotStyle: React.CSSProperties | null = targetRect ? {
    position: 'fixed',
    top: targetRect.top - SPOTLIGHT_PADDING,
    left: targetRect.left - SPOTLIGHT_PADDING,
    width: targetRect.width + SPOTLIGHT_PADDING * 2,
    height: targetRect.height + SPOTLIGHT_PADDING * 2,
    borderRadius: SPOTLIGHT_RADIUS,
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.7)',
    zIndex: 10000,
    pointerEvents: 'none',
    transition: 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
  } : null

  return (
    <>
      <style>{`
        @keyframes onb-slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .onb-card { animation: onb-slide-up 0.25s ease-out; }
        .onb-btn-primary {
          font-family: var(--font-mono); font-size: 12px; font-weight: 600;
          color: #fff; background: var(--red2); border: none; border-radius: 8px;
          padding: 10px 20px; cursor: pointer; transition: opacity 0.15s;
        }
        .onb-btn-primary:hover { opacity: 0.85; }
        .onb-btn-skip {
          font-family: var(--font-mono); font-size: 11px; color: var(--muted);
          background: none; border: none; cursor: pointer; padding: 6px 12px;
        }
        .onb-btn-skip:hover { color: var(--text); }
      `}</style>

      {/* Full-screen click catcher (behind spotlight) */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: targetRect ? 'transparent' : 'rgba(0,0,0,0.7)',
        }}
        onClick={e => { if (e.target === e.currentTarget && !isFirst) next() }}
      />

      {/* Box-shadow spotlight cutout — dims everything except the target */}
      {spotStyle && <div style={spotStyle} />}

      {/* Tooltip card */}
      <div
        className="onb-card"
        key={step}
        style={{
          position: 'fixed',
          zIndex: 10001,
          background: 'var(--panel-solid, #1a1a1a)',
          border: '1px solid var(--red2)',
          borderRadius: 16,
          padding: '24px 28px',
          maxWidth: 380,
          width: '90vw',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          ...cardPosition,
        }}
      >
        {/* Progress bar */}
        <div style={{ position: 'absolute', top: 0, left: 16, right: 16, height: 3, borderRadius: 2, background: 'var(--line, #333)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--red2)', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ marginTop: 8 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {step + 1} / {steps.length}
          </p>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            {title}
          </h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, whiteSpace: 'pre-line', marginBottom: 20 }}>
            {current.body}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="onb-btn-skip" onClick={skip}>
            {isLast ? '' : 'Salta tutto'}
          </button>
          <button className="onb-btn-primary" onClick={next}>
            {isFirst ? 'Inizia' : isLast ? 'Chiudi' : 'Avanti'} &rarr;
          </button>
        </div>
      </div>
    </>
  )
}

export function restartTour() {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      supabase.from('profiles').update({ onboarding_completed: false, onboarding_step: 0 }).eq('id', session.user.id)
        .then(() => { window.location.reload() })
    }
  })
}
