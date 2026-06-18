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
      <div className="w-full max-w-2xl mx-auto">
        {/* Brand logo - always on dark background, original colors */}
        <div className="text-center mb-16">
          <img
            src="/logo-synergy.png"
            alt="Simmetria Synergy"
            className="w-[620px] mx-auto login-logo"
          />
        </div>

        {/* Login form */}
        <form
          onSubmit={handleSubmit}
          className="p-8 space-y-6 rounded-3xl max-w-lg mx-auto"
          style={{
            background: 'rgba(14, 18, 24, 0.7)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div>
            <label className="block text-sm font-medium mb-1.5 text-white/80">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nome@simmetria.it"
              autoComplete="email"
              autoFocus
              className="w-full px-5 py-4 rounded-xl text-base outline-none transition-all text-white placeholder-white/40"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(208, 0, 58, 0.6)')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5 text-white/80">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Inserisci password"
                autoComplete="current-password"
                className="w-full px-5 py-4 pr-12 rounded-xl text-base outline-none transition-all text-white placeholder-white/40"
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(208, 0, 58, 0.6)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
                tabIndex={-1}
              >
                {showPassword
                  ? <EyeOff className="w-4 h-4 text-white/50" />
                  : <Eye className="w-4 h-4 text-white/50" />
                }
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-center px-2 py-2 rounded-lg" style={{ background: 'rgba(208,0,58,0.15)', color: '#ff6b8a' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all"
            style={{
              background: 'linear-gradient(135deg, #d0003a 0%, #e51b4f 100%)',
              boxShadow: '0 4px 20px rgba(208, 0, 58, 0.3)',
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
