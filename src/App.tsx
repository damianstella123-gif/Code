import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import Layout from './components/Layout'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import Setup2FA from './pages/Setup2FA'
import { loadUser, saveUser, clearUser } from './lib/auth'
import { supabase } from './lib/supabase'
import { fetchProfile } from './lib/profiles'
import { evaluateMfaStatus, roleRequiresMfa } from './lib/mfa'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Eventi = lazy(() => import('./pages/Eventi'))
const CRM = lazy(() => import('./pages/CRM'))
const Task = lazy(() => import('./pages/Task'))
const Calendario = lazy(() => import('./pages/Calendario'))
const Fornitori = lazy(() => import('./pages/Fornitori'))
const Network = lazy(() => import('./pages/Network'))
const Amministrazione = lazy(() => import('./pages/Amministrazione'))
const Comunicazioni = lazy(() => import('./pages/Comunicazioni'))
const Workflow = lazy(() => import('./pages/Workflow'))
const Dossier = lazy(() => import('./pages/Dossier'))
const Archivio = lazy(() => import('./pages/Archivio'))
const CreativeStudio = lazy(() => import('./pages/CreativeStudio'))
const Utenti = lazy(() => import('./pages/Utenti'))
const Impostazioni = lazy(() => import('./pages/Impostazioni'))
const FeedbackBeta = lazy(() => import('./pages/FeedbackBeta'))
const EventTimeline = lazy(() => import('./pages/EventTimeline'))
const Performance = lazy(() => import('./pages/Performance'))
const Wellness = lazy(() => import('./pages/Wellness'))
const PublicRegistration = lazy(() => import('./pages/PublicRegistration'))
const ManageRegistration = lazy(() => import('./pages/ManageRegistration'))
const BadgeProgram = lazy(() => import('./pages/BadgeProgram'))
const CentroSicurezza = lazy(() => import('./pages/CentroSicurezza'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]" style={{ background: 'var(--bg)' }}>
      <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: 'var(--red2)' }} />
    </div>
  )
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [redirectTo, setRedirectTo] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = useCallback(() => {
    clearUser()
    setAuthenticated(false)
    navigate('/login', { replace: true })
  }, [navigate])

  useEffect(() => {
    let mounted = true

    const timeout = setTimeout(() => {
      if (mounted && checking) {
        const stored = loadUser()
        if (stored) {
          setAuthenticated(true)
        }
        setChecking(false)
      }
    }, 5000)

    const check = async () => {
      try {
        const stored = loadUser()
        if (!stored) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const profile = await fetchProfile(session.user.id)
            if (profile && !profile.is_active) {
              clearUser()
              await supabase.auth.signOut()
              if (mounted) setChecking(false)
              return
            }
            const meta = session.user.user_metadata || {}
            saveUser({
              id: profile?.id ?? session.user.id,
              first_name: profile?.first_name ?? (meta as any).first_name ?? '',
              last_name: profile?.last_name ?? (meta as any).last_name ?? '',
              email: profile?.email ?? session.user.email ?? '',
              role: (profile?.role ?? (meta as any).role ?? 'User') as any,
              avatar_url: profile?.avatar_url ?? null,
              is_active: profile?.is_active ?? true,
            })
          } else {
            if (mounted) setChecking(false)
            return
          }
        }

        // Check force_password_change
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          if (profile && (profile as any).force_password_change) {
            if (mounted) { setRedirectTo('/change-password'); setAuthenticated(true); setChecking(false) }
            return
          }
        }

        // Enforce 2FA for admin roles: block access once the grace window ends.
        const current = loadUser()
        if (current && roleRequiresMfa(current.role)) {
          const mfa = await evaluateMfaStatus(current.id, current.role)
          if (mfa.status === 'blocked') {
            if (mounted) { setRedirectTo('/setup-2fa'); setAuthenticated(true); setChecking(false) }
            return
          }
        }

        if (mounted) { setAuthenticated(true); setChecking(false) }
      } catch {
        // If any auth check fails, still allow access if we have a stored user
        if (mounted) {
          const stored = loadUser()
          if (stored) {
            setAuthenticated(true)
          }
          setChecking(false)
        }
      }
    }
    check()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        handleSignOut()
      }
    })

    return () => {
      mounted = false
      clearTimeout(timeout)
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

  if (redirectTo && location.pathname !== redirectTo) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}

function ChangePasswordGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        navigate('/login', { replace: true })
        return
      }
      const profile = await fetchProfile(session.user.id)
      if (profile && (profile as any).force_password_change) {
        setAllowed(true)
      } else {
        navigate('/dashboard', { replace: true })
      }
      setChecking(false)
    }
    check()
  }, [navigate])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</div>
      </div>
    )
  }

  return allowed ? <>{children}</> : null
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
      <Route path="/change-password" element={<ChangePasswordGuard><ChangePassword /></ChangePasswordGuard>} />
      <Route path="/setup-2fa" element={<Setup2FA />} />
      <Route path="/r/:slug" element={<LazyPage><PublicRegistration /></LazyPage>} />
      <Route path="/badge/:token" element={<LazyPage><BadgeProgram /></LazyPage>} />
      <Route path="/manage-registration/:token" element={<LazyPage><ManageRegistration /></LazyPage>} />

      <Route path="/dashboard" element={<AuthGuard><Layout><LazyPage><Dashboard /></LazyPage></Layout></AuthGuard>} />
      <Route path="/oggi" element={<Navigate to="/dashboard" replace />} />
      <Route path="/eventi" element={<AuthGuard><Layout><LazyPage><Eventi /></LazyPage></Layout></AuthGuard>} />
      <Route path="/network" element={<AuthGuard><Layout><LazyPage><Network /></LazyPage></Layout></AuthGuard>}>
        <Route path="clienti" element={<CRM />} />
        <Route path="fornitori" element={<Fornitori />} />
      </Route>
      <Route path="/crm" element={<Navigate to="/network/clienti" replace />} />
      <Route path="/fornitori" element={<Navigate to="/network/fornitori" replace />} />
      <Route path="/task" element={<AuthGuard><Layout><LazyPage><Task /></LazyPage></Layout></AuthGuard>} />
      <Route path="/calendario" element={<AuthGuard><Layout><LazyPage><Calendario /></LazyPage></Layout></AuthGuard>} />
      <Route path="/amministrazione" element={<AuthGuard><Layout><LazyPage><Amministrazione /></LazyPage></Layout></AuthGuard>} />
      <Route path="/comunicazioni" element={<AuthGuard><Layout><LazyPage><Comunicazioni /></LazyPage></Layout></AuthGuard>} />
      <Route path="/workflow" element={<AuthGuard><Layout><LazyPage><Workflow /></LazyPage></Layout></AuthGuard>} />
      <Route path="/dossier" element={<AuthGuard><Layout><LazyPage><Dossier /></LazyPage></Layout></AuthGuard>} />
      <Route path="/archivio" element={<AuthGuard><Layout><LazyPage><Archivio /></LazyPage></Layout></AuthGuard>} />
      <Route path="/creative-studio" element={<AuthGuard><Layout><LazyPage><CreativeStudio /></LazyPage></Layout></AuthGuard>} />
      <Route path="/utenti" element={<AuthGuard><Layout><LazyPage><Utenti /></LazyPage></Layout></AuthGuard>} />
      <Route path="/impostazioni" element={<AuthGuard><Layout><LazyPage><Impostazioni /></LazyPage></Layout></AuthGuard>} />
      <Route path="/feedback-beta" element={<AuthGuard><Layout><LazyPage><FeedbackBeta /></LazyPage></Layout></AuthGuard>} />
      <Route path="/performance" element={<AuthGuard><Layout><LazyPage><Performance /></LazyPage></Layout></AuthGuard>} />
      <Route path="/wellness" element={<AuthGuard><Layout><LazyPage><Wellness /></LazyPage></Layout></AuthGuard>} />
      <Route path="/centro-sicurezza" element={<AuthGuard><Layout><LazyPage><CentroSicurezza /></LazyPage></Layout></AuthGuard>} />
      <Route path="/timeline/:eventId" element={<AuthGuard><Layout><LazyPage><EventTimeline /></LazyPage></Layout></AuthGuard>} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
