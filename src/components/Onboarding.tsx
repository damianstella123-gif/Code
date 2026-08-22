import { useState, useEffect, useCallback } from 'react'
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
    title: 'Network',
    body: 'Clienti e fornitori in un unico punto. Il tuo CRM integrato.',
    targetSelector: '[data-onboarding="network"]',
    requiredHref: '/network',
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
    title: 'Comunicazioni',
    body: 'Chat di team, canali per evento, messaggi diretti.',
    targetSelector: '[data-onboarding="comunicazioni"]',
    requiredHref: '/comunicazioni',
  },
  {
    title: 'Amministrazione',
    body: 'Fatture, preventivi e gestione finanziaria degli eventi.',
    targetSelector: '[data-onboarding="amministrazione"]',
    requiredHref: '/amministrazione',
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

export default function Onboarding({ onComplete, userName, userRole }: Props) {
  const steps = getStepsForRole(userRole)
  const [step, setStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [highlightedEl, setHighlightedEl] = useState<HTMLElement | null>(null)

  const clearHighlight = useCallback(() => {
    if (highlightedEl) {
      highlightedEl.style.removeProperty('position')
      highlightedEl.style.removeProperty('z-index')
      highlightedEl.style.removeProperty('box-shadow')
      setHighlightedEl(null)
    }
  }, [highlightedEl])

  useEffect(() => {
    clearHighlight()
    const sel = steps[step]?.targetSelector
    if (!sel) { setTargetRect(null); return }
    const el = document.querySelector<HTMLElement>(sel)
    if (el) {
      const rect = el.getBoundingClientRect()
      setTargetRect(rect)
      el.style.position = 'relative'
      el.style.zIndex = '1001'
      el.style.boxShadow = '0 0 0 4px rgba(200,25,46,0.45), 0 0 20px rgba(200,25,46,0.2)'
      setHighlightedEl(el)
    } else {
      setTargetRect(null)
    }
    return () => { clearHighlight() }
  }, [step])

  async function finish() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await supabase.from('profiles').update({ onboarding_completed: true, onboarding_step: steps.length - 1 }).eq('id', session.user.id)
    }
    clearHighlight()
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

  let cardPosition: React.CSSProperties
  if (targetRect) {
    const below = targetRect.bottom + 16
    const fitsBelow = below + 200 < window.innerHeight
    cardPosition = {
      top: fitsBelow ? below : undefined,
      bottom: fitsBelow ? undefined : window.innerHeight - targetRect.top + 16,
      left: Math.max(16, Math.min(targetRect.left, window.innerWidth - 420)),
    }
  } else {
    cardPosition = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

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
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
        }}
        onClick={e => { if (e.target === e.currentTarget && !isFirst) next() }}
      >
        <div
          className="onb-card"
          key={step}
          style={{
            position: 'absolute',
            background: 'var(--panel-solid, #1a1a1a)',
            border: '1px solid var(--red2)',
            borderRadius: 16,
            padding: '24px 28px',
            maxWidth: 400,
            width: '90vw',
            boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
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
