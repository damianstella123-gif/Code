import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getAllowedNavForRole } from '@/lib/auth'

interface Props {
  onComplete: () => void
  userName?: string
  userRole: string
}

interface TourStep {
  title: string
  body: string
  requiredHref?: string
}

const ALL_STEPS: TourStep[] = [
  {
    title: 'Benvenuto in Synergy',
    body: 'Synergy è lo spazio di lavoro di Simmetria: eventi, task, clienti e molto altro, tutto in un posto solo. Ti facciamo fare un giro veloce delle cose principali. Bastano due minuti, e puoi saltare quando vuoi.',
  },
  {
    title: 'La tua Dashboard',
    body: 'È la tua pagina di partenza. Ogni volta che entri, qui trovi un colpo d\u2019occhio su cosa conta oggi: le tue attività, le scadenze vicine, gli aggiornamenti importanti. Se ti perdi, torna sempre qui.',
    requiredHref: '/dashboard',
  },
  {
    title: 'Gli Eventi',
    body: 'Il cuore di Synergy. Nel menu trovi Eventi: qui vivono tutti gli eventi di Simmetria, con date, clienti, budget, fornitori, programma e documenti. Ogni evento ha la sua scheda completa: tutto quello che serve, in un posto solo.',
    requiredHref: '/eventi',
  },
  {
    title: 'I Task',
    body: 'Le cose da fare. Qui vedi i tuoi compiti, chi ci sta lavorando, cosa scade. Quando qualcuno ti assegna un\u2019attività, la trovi qui e ricevi una notifica. Niente più cose che si perdono.',
    requiredHref: '/task',
  },
  {
    title: 'Il Calendario',
    body: 'Tutto ciò che ha una data, in un\u2019unica vista: eventi, scadenze, impegni. Per sapere cosa succede questa settimana senza dover chiedere a nessuno.',
    requiredHref: '/calendario',
  },
  {
    title: 'Il Network',
    body: 'Qui trovi i Clienti e i Fornitori, in due sezioni separate. Anagrafiche, contatti, storico: la rubrica intelligente di Simmetria. Ognuno vede la sezione di sua competenza.',
    requiredHref: '/network',
  },
  {
    title: 'La tua voce conta',
    body: 'Synergy cresce con voi. Se trovi un problema, hai un\u2019idea o vorresti migliorare qualcosa, segnalalo nella sezione Feedback, e puoi votare le proposte dei colleghi. Le idee più sostenute salgono in cima. Questo spazio è di tutti: usalo!',
    requiredHref: '/feedback-beta',
  },
  {
    title: 'Sei pronto',
    body: 'Questo era l\u2019essenziale. Quando vuoi approfondire una qualsiasi funzione, trovi la sezione Help sempre nel menu. Buon lavoro, e grazie per far parte di questo progetto.',
  },
]

function getStepsForRole(role: string): TourStep[] {
  const allowedHrefs = getAllowedNavForRole(role).map(n => n.href)
  return ALL_STEPS.filter(s => !s.requiredHref || allowedHrefs.includes(s.requiredHref))
}

export default function Onboarding({ onComplete, userRole }: Props) {
  const steps = getStepsForRole(userRole)
  const [step, setStep] = useState(0)

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

  function back() {
    if (step > 0) setStep(s => s - 1)
  }

  function skip() { finish() }

  const current = steps[step]
  const isFirst = step === 0
  const isLast = step === steps.length - 1
  const progress = ((step + 1) / steps.length) * 100

  return (
    <>
      <style>{`
        @keyframes onb-fade-in {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        .onb-card {
          animation: onb-fade-in 0.2s ease-out;
          position: fixed;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          z-index: 10001;
          background: var(--panel-solid, #1a1a1a);
          border: 1px solid var(--red2);
          border-radius: 16px;
          padding: 28px 32px;
          max-width: 460px;
          width: 90vw;
          box-shadow: 0 16px 48px rgba(0,0,0,0.5);
        }
        .onb-btn-primary {
          font-family: var(--font-mono); font-size: 12px; font-weight: 600;
          color: #fff; background: var(--red2); border: none; border-radius: 8px;
          padding: 10px 20px; cursor: pointer; transition: opacity 0.15s;
        }
        .onb-btn-primary:hover { opacity: 0.85; }
        .onb-btn-secondary {
          font-family: var(--font-mono); font-size: 12px; font-weight: 500;
          color: var(--muted); background: var(--line, #333); border: none; border-radius: 8px;
          padding: 10px 16px; cursor: pointer; transition: opacity 0.15s;
        }
        .onb-btn-secondary:hover { opacity: 0.85; }
        .onb-btn-skip {
          font-family: var(--font-mono); font-size: 11px; color: var(--muted);
          background: none; border: none; cursor: pointer; padding: 6px 12px;
        }
        .onb-btn-skip:hover { color: var(--text); }
      `}</style>

      <div
        style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.7)' }}
        onClick={e => { if (e.target === e.currentTarget && !isFirst) next() }}
      />

      <div className="onb-card" key={step}>
        <div style={{ position: 'absolute', top: 0, left: 16, right: 16, height: 3, borderRadius: 2, background: 'var(--line, #333)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--red2)', transition: 'width 0.3s ease' }} />
        </div>

        <div style={{ marginTop: 8 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {step + 1} / {steps.length}
          </p>
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
            {current.title}
          </h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 24 }}>
            {current.body}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="onb-btn-skip" onClick={skip}>
            {isLast ? '' : 'Salta tutto'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button className="onb-btn-secondary" onClick={back}>
                &larr; Indietro
              </button>
            )}
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
