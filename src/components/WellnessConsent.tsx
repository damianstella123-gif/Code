import { useState, useEffect, useCallback } from 'react'
import { Heart } from 'lucide-react'
import { getWellnessConsent, setWellnessConsent } from '@/lib/wellness-service'

const DECLINED_KEY = 'wellness_consent_declined'
const CONSENT_EVENT = 'wellness-consent-changed'

export type ConsentStatus = 'loading' | 'granted' | 'undecided' | 'declined'

const CONSENT_SENTENCE =
  'Simmetria Synergy pu\u00f2 suggerirti pause e chiederti come ti senti durante la giornata, solo per te \u2014 nessun collega o responsabile vede i tuoi dati individuali. Vuoi attivarlo?'

export function useWellnessConsent() {
  const [status, setStatus] = useState<ConsentStatus>('loading')

  const refresh = useCallback(async () => {
    const ts = await getWellnessConsent()
    if (ts) {
      setStatus('granted')
      return
    }
    setStatus(localStorage.getItem(DECLINED_KEY) === '1' ? 'declined' : 'undecided')
  }, [])

  useEffect(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener(CONSENT_EVENT, handler)
    return () => window.removeEventListener(CONSENT_EVENT, handler)
  }, [refresh])

  const accept = useCallback(async () => {
    await setWellnessConsent(true)
    localStorage.removeItem(DECLINED_KEY)
    setStatus('granted')
    window.dispatchEvent(new Event(CONSENT_EVENT))
  }, [])

  const decline = useCallback(() => {
    localStorage.setItem(DECLINED_KEY, '1')
    setStatus('declined')
    window.dispatchEvent(new Event(CONSENT_EVENT))
  }, [])

  const disable = useCallback(async () => {
    await setWellnessConsent(false)
    localStorage.setItem(DECLINED_KEY, '1')
    setStatus('declined')
    window.dispatchEvent(new Event(CONSENT_EVENT))
  }, [])

  return { status, accept, decline, disable, refresh }
}

export function WellnessConsentPrompt({
  onAccept,
  onDecline,
}: {
  onAccept: () => Promise<void> | void
  onDecline: () => void
}) {
  const [busy, setBusy] = useState(false)

  const handleAccept = async () => {
    setBusy(true)
    try {
      await onAccept()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(16,185,129,0.12)' }}
        >
          <Heart className="w-5 h-5" style={{ color: '#10b981' }} />
        </div>
        <h3 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
          Il tuo benessere
        </h3>
      </div>

      <p className="text-sm mb-5" style={{ color: 'var(--foreground)', lineHeight: 1.5 }}>
        {CONSENT_SENTENCE}
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleAccept}
          disabled={busy}
          className="px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: '#10b981', color: '#fff' }}
        >
          S\u00ec, attiva
        </button>
        <button
          onClick={onDecline}
          disabled={busy}
          className="px-4 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-60"
          style={{ background: 'var(--secondary)', color: 'var(--foreground)' }}
        >
          No, non ora
        </button>
      </div>
    </div>
  )
}
