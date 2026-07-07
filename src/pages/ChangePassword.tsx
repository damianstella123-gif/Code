import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function ChangePassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('La password deve avere almeno 8 caratteri')
      return
    }
    if (password !== confirm) {
      setError('Le password non coincidono')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('profiles')
          .update({ force_password_change: false })
          .eq('id', user.id)
      }

      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante il cambio password')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    background: 'var(--panel2)',
    border: '1px solid var(--line)',
    color: 'var(--text)',
  }

  return (
    <div className="login-background flex items-center justify-center px-4">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-10">
          <img
            src="/logo-synergy.png"
            alt="Simmetria Synergy"
            className="w-44 sm:w-52 mx-auto object-contain mb-6"
          />
          <h1 className="font-serif text-2xl" style={{ color: 'var(--text)' }}>
            Benvenuto in Simmetria Synergy
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
            Prima di continuare, crea la tua password personale
          </p>
        </div>

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
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Nuova password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimo 8 caratteri"
                autoComplete="new-password"
                autoFocus
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

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Conferma password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Ripeti la password"
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
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
            disabled={loading}
            className="w-full py-3 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
            style={{
              background: 'var(--red2)',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Salvataggio...' : 'Conferma'}
          </button>
        </form>
      </div>
    </div>
  )
}
