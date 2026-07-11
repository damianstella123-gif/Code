import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  onComplete: () => void
  userName: string
}

const STEPS = [
  {
    title: 'Benvenuto in Synergy, {name}!',
    body: 'Sono Fly, il tuo Chief of Staff digitale.\nTi guido in 4 passi rapidi.',
    targetSelector: null,
    cta: 'Inizia',
    skip: false,
  },
  {
    title: 'La CommandBar',
    body: 'Qui puoi chiedermi qualsiasi cosa.\nProva a dire "che eventi abbiamo?"',
    targetSelector: '[data-onboarding="commandbar"]',
    cta: 'Avanti',
    skip: true,
  },
  {
    title: 'Il tuo primo evento',
    body: 'Crea il tuo primo evento.\nCi vuole meno di 1 minuto.',
    targetSelector: '[data-onboarding="new-event"]',
    cta: 'Avanti',
    skip: true,
  },
  {
    title: 'Il calendario',
    body: 'Tutto il tuo lavoro in una vista.\nFerie, eventi, scadenze \u2014 tutto qui.',
    targetSelector: '[data-onboarding="calendario"]',
    cta: 'Avanti',
    skip: true,
  },
  {
    title: 'Sei pronto!',
    body: 'Fly e sempre disponibile in alto.\nIl team di Simmetria e qui se hai bisogno.',
    targetSelector: null,
    cta: 'Inizia a lavorare',
    skip: false,
  },
]

export default function Onboarding({ onComplete, userName }: Props) {
  const [step, setStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sel = STEPS[step]?.targetSelector
    if (!sel) { setTargetRect(null); return }
    const el = document.querySelector(sel)
    if (el) {
      const rect = el.getBoundingClientRect()
      setTargetRect(rect)
      el.setAttribute('style', `${el.getAttribute('style') || ''};position:relative;z-index:1001;box-shadow:0 0 0 4px rgba(200,25,46,0.4);border-radius:inherit;`)
    } else {
      setTargetRect(null)
    }
    return () => {
      if (el) {
        const s = el.getAttribute('style') || ''
        el.setAttribute('style', s.replace(/;?position:relative;z-index:1001;box-shadow:0 0 0 4px rgba\(200,25,46,0\.4\);border-radius:inherit;/g, ''))
      }
    }
  }, [step])

  async function finish() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await supabase.from('profiles').update({ onboarding_completed: true, onboarding_step: 4 }).eq('id', session.user.id)
    }
    onComplete()
  }

  function next() {
    if (step >= STEPS.length - 1) { finish(); return }
    setStep(s => s + 1)
  }

  const current = STEPS[step]
  const title = current.title.replace('{name}', userName)

  const cardStyle: React.CSSProperties = {
    position: 'absolute',
    background: 'var(--panel-solid)',
    border: '1px solid var(--red2)',
    borderRadius: 16,
    padding: '28px 32px',
    maxWidth: 440,
    width: '90vw',
    animation: 'onb-fade-in 0.3s ease-out',
    boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
  }

  let cardPosition: React.CSSProperties
  if (targetRect) {
    const below = targetRect.bottom + 16
    const above = targetRect.top - 16
    const fitsBelow = below + 200 < window.innerHeight
    cardPosition = {
      top: fitsBelow ? below : undefined,
      bottom: fitsBelow ? undefined : window.innerHeight - above,
      left: Math.max(16, Math.min(targetRect.left, window.innerWidth - 460)),
    }
  } else {
    cardPosition = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }

  return (
    <>
      <style>{`
        @keyframes onb-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        ref={overlayRef}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div style={{ ...cardStyle, ...cardPosition }}>
          {step === 0 && (
            <p style={{ fontSize: 28, marginBottom: 8 }}>&#x1F44B;</p>
          )}
          {step === STEPS.length - 1 && (
            <p style={{ fontSize: 28, marginBottom: 8 }}>&#x2713;</p>
          )}
          <h2 style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text)',
            marginBottom: 8,
          }}>
            {title}
          </h2>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--muted)',
            lineHeight: 1.6,
            whiteSpace: 'pre-line',
            marginBottom: 20,
          }}>
            {current.body}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            {current.skip && (
              <button
                onClick={next}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px 12px',
                }}
              >
                Salta
              </button>
            )}
            <button
              onClick={next}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                background: 'var(--red2)',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              {current.cta} &rarr;
            </button>
          </div>
          {STEPS.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
              {STEPS.map((_, i) => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: i === step ? 'var(--red2)' : 'var(--line)',
                  transition: 'background 0.2s',
                }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
