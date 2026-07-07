import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchProfile } from '@/lib/profiles'
import { saveUser } from '@/lib/auth'
import { syncThemeFromProfile } from '@/lib/theme'
import BrandEvolutionTransition from '@/components/BrandEvolutionTransition'
import BrandE from '@/components/BrandE'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTransition, setShowTransition] = useState(false)

  // 2FA state — temporaneamente disattivato, riattivare rimuovendo commenti sopra
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [mfaStep, _setMfaStep] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [mfaFactorId, _setMfaFactorId] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Inserisci email e password')
      return
    }
    setError(null)
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        if (signInError.message === 'Invalid login credentials') {
          setError('Email o password non corretti')
        } else if (signInError.message.includes('banned')) {
          setError('Account disattivato. Contatta un amministratore.')
        } else {
          setError(signInError.message)
        }
        setLoading(false)
        return
      }

      const authUser = data.user
      if (!authUser) {
        setError('Errore durante il login')
        setLoading(false)
        return
      }

      /* 2FA step — temporaneamente disattivato */
      /*
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel === 'aal1') {
        const { data: factorsData } = await supabase.auth.mfa.listFactors()
        const verifiedFactors = factorsData?.totp.filter(f => f.status === 'verified') ?? []
        if (verifiedFactors.length > 0) {
          setMfaFactorId(verifiedFactors[0].id)
          setMfaStep(true)
          setLoading(false)
          return
        }
      }
      */

      await completeLogin(authUser)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di connessione')
    } finally {
      setLoading(false)
    }
  }

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mfaCode.length !== 6) {
      setError('Inserisci un codice di 6 cifre')
      return
    }
    setMfaLoading(true)
    setError(null)

    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId,
      })
      if (challengeError) {
        setError(challengeError.message)
        setMfaLoading(false)
        return
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challengeData.id,
        code: mfaCode,
      })
      if (verifyError) {
        setError('Codice non valido. Riprova.')
        setMfaLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await completeLogin(user)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di verifica')
    } finally {
      setMfaLoading(false)
    }
  }

  async function completeLogin(authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
    const profile = await fetchProfile(authUser.id)

    if (profile && !profile.is_active) {
      setError('Account disattivato. Contatta un amministratore.')
      await supabase.auth.signOut()
      return
    }

    const meta = (authUser.user_metadata || {}) as Record<string, string>
    saveUser({
      id: profile?.id ?? authUser.id,
      first_name: profile?.first_name ?? meta.first_name ?? '',
      last_name: profile?.last_name ?? meta.last_name ?? '',
      email: profile?.email ?? authUser.email ?? '',
      role: (profile?.role ?? meta.role ?? 'User') as any,
      avatar_url: profile?.avatar_url ?? null,
      is_active: profile?.is_active ?? true,
    })

    await syncThemeFromProfile()
    setShowTransition(true)
  }

  const inputStyle = {
    background: 'var(--panel2)',
    border: '1px solid var(--line)',
    color: 'var(--text)',
  }

  return (
    <div className="login-background flex items-center justify-center px-4">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-12">
          <img
            src="/logo-synergy.png"
            alt="Simmetria Synergy"
            className="w-44 sm:w-52 mx-auto object-contain"
          />
          <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '14px', letterSpacing: '0.08em', color: 'var(--text)', marginTop: '8px' }}>
            SYN<BrandE size={14} />RGY
          </p>
        </div>

        {!mfaStep ? (
          <form
            onSubmit={handleSubmit}
            className="p-8 space-y-6 rounded-3xl"
            style={{
              background: 'rgba(255, 255, 255, 0.40)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(211, 28, 48, 0.15)',
              boxShadow: '0 12px 40px rgba(38, 41, 46, 0.10)',
            }}
          >
            <div className="text-center mb-2">
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
                Accedi
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                Inserisci le tue credenziali
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nome@simmetria.it"
                autoComplete="email"
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = 'var(--red)'; e.target.style.boxShadow = '0 0 0 3px rgba(208,0,58,0.08)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--line)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Inserisci password"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 rounded-xl text-sm outline-none transition-all"
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = 'var(--red)'; e.target.style.boxShadow = '0 0 0 3px rgba(208,0,58,0.08)' }}
                  onBlur={e => { e.target.style.borderColor = 'var(--line)'; e.target.style.boxShadow = 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                    : <Eye className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                  }
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-center px-3 py-2 rounded-lg" style={{ background: 'rgba(208,0,58,0.08)', color: 'var(--red2)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
              style={{
                background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
                boxShadow: 'var(--shadow-red)',
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleMfaVerify}
            className="p-8 space-y-6 rounded-3xl"
            style={{
              background: 'rgba(255, 255, 255, 0.40)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(211, 28, 48, 0.15)',
              boxShadow: '0 12px 40px rgba(38, 41, 46, 0.10)',
            }}
          >
            <div className="text-center mb-2">
              <div className="flex items-center justify-center gap-2 mb-1">
                <ShieldCheck className="w-5 h-5" style={{ color: 'var(--red2)' }} />
                <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>
                  Verifica 2FA
                </h1>
              </div>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                Inserisci il codice dall'app authenticator
              </p>
            </div>

            <div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all text-center tracking-[0.3em] font-mono"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = 'var(--red)'; e.target.style.boxShadow = '0 0 0 3px rgba(208,0,58,0.08)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--line)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {error && (
              <p className="text-xs text-center px-3 py-2 rounded-lg" style={{ background: 'rgba(208,0,58,0.08)', color: 'var(--red2)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={mfaLoading}
              className="w-full py-3 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
              style={{
                background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
                boxShadow: 'var(--shadow-red)',
                opacity: mfaLoading ? 0.6 : 1,
                cursor: mfaLoading ? 'wait' : 'pointer',
              }}
            >
              <ShieldCheck className="w-4 h-4" />
              {mfaLoading ? 'Verifica...' : 'Verifica'}
            </button>
          </form>
        )}
      </div>

      {showTransition && (
        <BrandEvolutionTransition onComplete={() => navigate('/dashboard')} />
      )}
    </div>
  )
}
