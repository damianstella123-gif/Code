import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import Layout from './components/Layout'
import Login from './pages/Login'
import { loadUser, saveUser, clearUser } from './lib/auth'
import { supabase } from './lib/supabase'
import { fetchProfile } from './lib/profiles'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Eventi = lazy(() => import('./pages/Eventi'))
const CRM = lazy(() => import('./pages/CRM'))
const Task = lazy(() => import('./pages/Task'))
const Calendario = lazy(() => import('./pages/Calendario'))
const Fornitori = lazy(() => import('./pages/Fornitori'))
const Amministrazione = lazy(() => import('./pages/Amministrazione'))
const Comunicazioni = lazy(() => import('./pages/Comunicazioni'))
const Workflow = lazy(() => import('./pages/Workflow'))
const Pratiche = lazy(() => import('./pages/Pratiche'))
const CreativeStudio = lazy(() => import('./pages/CreativeStudio'))
const Archivio = lazy(() => import('./pages/Archivio'))
const Utenti = lazy(() => import('./pages/Utenti'))
const Impostazioni = lazy(() => import('./pages/Impostazioni'))
const FeedbackBeta = lazy(() => import('./pages/FeedbackBeta'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</div>
    </div>
  )
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const navigate = useNavigate()

  const handleSignOut = useCallback(() => {
    clearUser()
    setAuthenticated(false)
    navigate('/login', { replace: true })
  }, [navigate])

  useEffect(() => {
    let mounted = true

    const check = async () => {
      const stored = loadUser()
      if (stored) {
        if (mounted) {
          setAuthenticated(true)
          setChecking(false)
        }
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const profile = await fetchProfile(session.user.id)
        if (profile && !profile.is_active) {
          clearUser()
          await supabase.auth.signOut()
        } else {
          const meta = session.user.user_metadata || {}
          saveUser({
            id: profile?.id ?? session.user.id,
            first_name: profile?.first_name ?? meta.first_name ?? '',
            last_name: profile?.last_name ?? meta.last_name ?? '',
            email: profile?.email ?? session.user.email ?? '',
            role: (profile?.role ?? meta.role ?? 'User') as any,
            avatar_url: profile?.avatar_url ?? null,
            is_active: profile?.is_active ?? true,
          })
          if (mounted) setAuthenticated(true)
        }
      }
      if (mounted) setChecking(false)
    }
    check()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_OUT') {
          handleSignOut()
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [handleSignOut])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</div>
      </div>
    )
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/dashboard" element={<AuthGuard><Layout><LazyPage><Dashboard /></LazyPage></Layout></AuthGuard>} />
      <Route path="/eventi" element={<AuthGuard><Layout><LazyPage><Eventi /></LazyPage></Layout></AuthGuard>} />
      <Route path="/crm" element={<AuthGuard><Layout><LazyPage><CRM /></LazyPage></Layout></AuthGuard>} />
      <Route path="/task" element={<AuthGuard><Layout><LazyPage><Task /></LazyPage></Layout></AuthGuard>} />
      <Route path="/calendario" element={<AuthGuard><Layout><LazyPage><Calendario /></LazyPage></Layout></AuthGuard>} />
      <Route path="/fornitori" element={<AuthGuard><Layout><LazyPage><Fornitori /></LazyPage></Layout></AuthGuard>} />
      <Route path="/amministrazione" element={<AuthGuard><Layout><LazyPage><Amministrazione /></LazyPage></Layout></AuthGuard>} />
      <Route path="/comunicazioni" element={<AuthGuard><Layout><LazyPage><Comunicazioni /></LazyPage></Layout></AuthGuard>} />
      <Route path="/workflow" element={<AuthGuard><Layout><LazyPage><Workflow /></LazyPage></Layout></AuthGuard>} />
      <Route path="/pratiche" element={<AuthGuard><Layout><LazyPage><Pratiche /></LazyPage></Layout></AuthGuard>} />
      <Route path="/creative-studio" element={<AuthGuard><Layout><LazyPage><CreativeStudio /></LazyPage></Layout></AuthGuard>} />
      <Route path="/archivio" element={<AuthGuard><Layout><LazyPage><Archivio /></LazyPage></Layout></AuthGuard>} />
      <Route path="/utenti" element={<AuthGuard><Layout><LazyPage><Utenti /></LazyPage></Layout></AuthGuard>} />
      <Route path="/impostazioni" element={<AuthGuard><Layout><LazyPage><Impostazioni /></LazyPage></Layout></AuthGuard>} />
      <Route path="/feedback-beta" element={<AuthGuard><Layout><LazyPage><FeedbackBeta /></LazyPage></Layout></AuthGuard>} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
