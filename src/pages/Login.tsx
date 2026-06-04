import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchProfile } from '@/lib/profiles'
import { saveUser } from '@/lib/auth'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di connessione')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'linear-gradient(135deg, var(--bg) 0%, rgba(208, 0, 58, 0.05) 50%, var(--bg) 100%)',
      }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
              boxShadow: '0 8px 32px rgba(208,0,58,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M17 4H9C6.24 4 4 6.24 4 9v0c0 2.76 2.24 5 5 5h6c2.76 0 5 2.24 5 5v0c0 2.76-2.24 5-5 5H7" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>
            SIMMETRIA
          </h1>
          <p className="text-sm font-semibold tracking-widest mt-1" style={{ color: 'var(--red2)' }}>
            HUB
          </p>
        </div>

        {/* Login form */}
        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-5 rounded-2xl"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
          }}
        >
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
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                color: 'var(--text)',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--red2)')}
              onBlur={e => (e.target.style.borderColor = 'var(--line)')}
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
                className="w-full px-4 py-2.5 pr-10 rounded-lg text-sm outline-none transition-all"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--red2)')}
                onBlur={e => (e.target.style.borderColor = 'var(--line)')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
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
            <p className="text-xs text-center px-2 py-2 rounded-lg" style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all"
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
    </div>
  )
}
