import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadUser } from '@/lib/auth'
import {
  evaluateMfaStatus,
  registerMfaSkip,
  roleRequiresMfa,
  hasVerifiedTotp,
  type MfaEnforcement,
} from '@/lib/mfa'

export default function Setup2FA() {
  const navigate = useNavigate()

  const [ready, setReady] = useState(false)
  const [enforcement, setEnforcement] = useState<MfaEnforcement>('grace')
  const [skipsLeft, setSkipsLeft] = useState(0)
  const [daysLeft, setDaysLeft] = useState(0)

  const [step, setStep] = useState<'enroll' | 'verify'>('enroll')
  const [factorId, setFactorId] = useState('')
  const [qrUri, setQrUri] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)

  useEffect(() => {
    let mounted = true
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { navigate('/login', { replace: true }); return }

      const stored = loadUser()
      const role = stored?.role
      // Already protected, or role never required 2FA: nothing to do here.
      if (!roleRequiresMfa(role) || (await hasVerifiedTotp())) {
        navigate('/dashboard', { replace: true })
        return
      }

      const state = await evaluateMfaStatus(session.user.id, role)
      if (!mounted) return
      setEnforcement(state.status === 'ok' ? 'grace' : state.status)
      setSkipsLeft(state.skipsLeft)
      setDaysLeft(state.daysLeft)
      setReady(true)
    }
    init()
    return () => { mounted = false }
  }, [navigate])

  const startEnroll = async () => {
    setEnrolling(true)
    setError(null)
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (enrollError) {
        // A previous unverified enrollment can block a new one; clean it up.
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const stale = factors?.all?.filter(f => f.status !== 'verified') ?? []
        for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id })
        const retry = await supabase.auth.mfa.enroll({ factorType: 'totp' })
        if (retry.error || !retry.data) { setError(retry.error?.message ?? 'Errore'); return }
        setFactorId(retry.data.id)
        setQrUri(retry.data.totp.uri)
        setStep('verify')
        return
      }
      if (data) {
        setFactorId(data.id)
        setQrUri(data.totp.uri)
        setStep('verify')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante la configurazione')
    } finally {
      setEnrolling(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length !== 6) { setError('Inserisci un codice di 6 cifre'); return }
    setLoading(true)
    setError(null)
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) { setError(challengeError.message); setLoading(false); return }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      })
      if (verifyError) { setError('Codice non valido. Riprova.'); setLoading(false); return }

      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di verifica')
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) await registerMfaSkip(session.user.id)
    navigate('/dashboard', { replace: true })
  }

  const inputStyle = {
    background: 'var(--panel2)',
    border: '1px solid var(--line)',
    color: 'var(--text)',
  }

  if (!ready) {
    return (
      <div className="login-background flex items-center justify-center px-4">
        <div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</div>
      </div>
    )
  }

  const canSkip = enforcement === 'grace' && step === 'enroll'

  return (
    <div className="login-background flex items-center justify-center px-4">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-10">
          <img
            src="/logo-synergy.png"
            alt="Simmetria Synergy"
            className="w-44 sm:w-52 mx-auto object-contain mb-6"
          />
          <div className="flex items-center justify-center gap-2 mb-3">
            <ShieldCheck className="w-5 h-5" style={{ color: 'var(--red2)' }} />
            <h1 className="font-serif text-2xl" style={{ color: 'var(--text)' }}>
              Autenticazione a due fattori
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {enforcement === 'blocked'
              ? 'Il periodo di prova è terminato: configura l\u2019autenticazione a due fattori per continuare.'
              : 'Il tuo ruolo richiede l\u2019autenticazione a due fattori per accedere.'}
          </p>
        </div>

        <div
          className="p-8 space-y-6 rounded-3xl"
          style={{
            background: 'rgba(255, 255, 255, 0.40)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(211, 28, 48, 0.15)',
            boxShadow: '0 12px 40px rgba(38, 41, 46, 0.10)',
          }}
        >
          {enforcement === 'grace' && step === 'enroll' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
              style={{ background: 'rgba(255,175,60,0.10)', border: '1px solid rgba(255,175,60,0.25)', color: 'var(--text)' }}>
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color: '#c47f00' }} />
              <span>
                Puoi rimandare ancora {skipsLeft} {skipsLeft === 1 ? 'volta' : 'volte'} o per {daysLeft} {daysLeft === 1 ? 'giorno' : 'giorni'}, poi la configurazione sarà obbligatoria.
              </span>
            </div>
          )}

          {step === 'enroll' && (
            <div className="space-y-4 text-center">
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                Scarica <strong>Google Authenticator</strong> o <strong>Authy</strong> sul tuo telefono, poi clicca il bottone per generare il codice QR.
              </p>
              <button
                onClick={startEnroll}
                disabled={enrolling}
                className="w-full py-3 text-white font-semibold rounded-xl transition-all text-sm"
                style={{
                  background: 'var(--red2)',
                  opacity: enrolling ? 0.6 : 1,
                  cursor: enrolling ? 'wait' : 'pointer',
                }}
              >
                {enrolling ? 'Generazione QR...' : 'Genera codice QR'}
              </button>
              {canSkip && (
                <button
                  onClick={handleSkip}
                  className="w-full py-2.5 rounded-xl text-xs font-medium transition-all"
                  style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)' }}
                >
                  Ricordamelo più tardi
                </button>
              )}
            </div>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-5">
              <p className="text-sm text-center" style={{ color: 'var(--text)' }}>
                Inquadra il codice QR con la tua app authenticator
              </p>

              {qrUri && (
                <div className="flex justify-center p-4 rounded-xl" style={{ background: 'white' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                    alt="QR Code per 2FA"
                    className="w-48 h-48"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                  Codice di verifica
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all text-center tracking-[0.3em] font-mono"
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = 'var(--red)'; e.target.style.boxShadow = '0 0 0 3px rgba(208,0,58,0.08)' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--line)'; e.target.style.boxShadow = 'none' }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 text-white font-semibold rounded-xl transition-all text-sm"
                style={{
                  background: 'var(--red2)',
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Verifica...' : 'Verifica e attiva'}
              </button>
            </form>
          )}

          {error && (
            <p className="text-xs text-center px-3 py-2 rounded-lg" style={{ background: 'rgba(208,0,58,0.08)', color: 'var(--red2)' }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
