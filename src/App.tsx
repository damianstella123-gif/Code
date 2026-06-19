import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Eventi from './pages/Eventi'
import CRM from './pages/CRM'
import Task from './pages/Task'
import Calendario from './pages/Calendario'
import Fornitori from './pages/Fornitori'
import Amministrazione from './pages/Amministrazione'
import Comunicazioni from './pages/Comunicazioni'
import Workflow from './pages/Workflow'
import Utenti from './pages/Utenti'
import Pratiche from './pages/Pratiche'
import Impostazioni from './pages/Impostazioni'
import CreativeStudio from './pages/CreativeStudio'
import SocialStudio from './pages/SocialStudio'
import Presentazioni from './pages/Presentazioni'
import Archivio from './pages/Archivio'
import FeedbackBeta from './pages/FeedbackBeta'
import Login from './pages/Login'
import { loadUser, saveUser, clearUser } from './lib/auth'
import { supabase } from './lib/supabase'
import { fetchProfile } from './lib/profiles'

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
        if (profile && profile.is_active) {
          saveUser({
            id: profile.id,
            first_name: profile.first_name,
            last_name: profile.last_name,
            email: profile.email,
            role: profile.role,
            avatar_url: profile.avatar_url,
            is_active: profile.is_active,
          })
          if (mounted) setAuthenticated(true)
        } else {
          clearUser()
          await supabase.auth.signOut()
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/dashboard" element={<AuthGuard><Layout><Dashboard /></Layout></AuthGuard>} />
      <Route path="/eventi" element={<AuthGuard><Layout><Eventi /></Layout></AuthGuard>} />
      <Route path="/crm" element={<AuthGuard><Layout><CRM /></Layout></AuthGuard>} />
      <Route path="/task" element={<AuthGuard><Layout><Task /></Layout></AuthGuard>} />
      <Route path="/calendario" element={<AuthGuard><Layout><Calendario /></Layout></AuthGuard>} />
      <Route path="/fornitori" element={<AuthGuard><Layout><Fornitori /></Layout></AuthGuard>} />
      <Route path="/amministrazione" element={<AuthGuard><Layout><Amministrazione /></Layout></AuthGuard>} />
      <Route path="/comunicazioni" element={<AuthGuard><Layout><Comunicazioni /></Layout></AuthGuard>} />
      <Route path="/workflow" element={<AuthGuard><Layout><Workflow /></Layout></AuthGuard>} />
      <Route path="/pratiche" element={<AuthGuard><Layout><Pratiche /></Layout></AuthGuard>} />
      <Route path="/creative-studio" element={<AuthGuard><Layout><CreativeStudio /></Layout></AuthGuard>} />
      <Route path="/social-studio" element={<AuthGuard><Layout><SocialStudio /></Layout></AuthGuard>} />
      <Route path="/presentazioni" element={<AuthGuard><Layout><Presentazioni /></Layout></AuthGuard>} />
      <Route path="/archivio" element={<AuthGuard><Layout><Archivio /></Layout></AuthGuard>} />
      <Route path="/utenti" element={<AuthGuard><Layout><Utenti /></Layout></AuthGuard>} />
      <Route path="/impostazioni" element={<AuthGuard><Layout><Impostazioni /></Layout></AuthGuard>} />
      <Route path="/feedback-beta" element={<AuthGuard><Layout><FeedbackBeta /></Layout></AuthGuard>} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
