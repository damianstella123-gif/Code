import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchProfile } from '@/lib/profiles'
import { saveUser } from '@/lib/auth'
import { syncThemeFromProfile } from '@/lib/theme'
import BrandEvolutionTransition from '@/components/BrandEvolutionTransition'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTransition, setShowTransition] = useState(false)

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

      const profile = await fetchProfile(authUser.id)
      if (!profile) {
        setError('Profilo non trovato. Contatta un amministratore.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      if (!profile.is_active) {
        setError('Account disattivato. Contatta un amministratore.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      saveUser({
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        role: profile.role,
        avatar_url: profile.avatar_url,
        is_active: profile.is_active,
      })

      await syncThemeFromProfile()
      setShowTransition(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di connessione')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-background flex items-center justify-center px-4">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-12">
          <img
            src="/Logo_1.png"
            alt="Simmetria Synergy"
            className="w-44 sm:w-52 mx-auto login-logo"
          />
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-8 space-y-6 rounded-2xl"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-lg)',
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
              style={{
                background: 'var(--panel2)',
                border: '1px solid var(--line)',
                color: 'var(--text)',
              }}
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
                style={{
                  background: 'var(--panel2)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                }}
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
      </div>

      {showTransition && (
        <BrandEvolutionTransition onComplete={() => navigate('/dashboard')} />
      )}
    </div>
  )
}
