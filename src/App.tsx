import { Routes, Route, Navigate } from 'react-router-dom'
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
import Impostazioni from './pages/Impostazioni'
import Login from './pages/Login'
import { loadUser } from './lib/auth'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = loadUser()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* Login page without layout */}
      <Route path="/login" element={<Login />} />

      {/* Dashboard pages with layout (auth required) */}
      <Route path="/dashboard" element={<RequireAuth><Layout><Dashboard /></Layout></RequireAuth>} />
      <Route path="/eventi" element={<RequireAuth><Layout><Eventi /></Layout></RequireAuth>} />
      <Route path="/crm" element={<RequireAuth><Layout><CRM /></Layout></RequireAuth>} />
      <Route path="/task" element={<RequireAuth><Layout><Task /></Layout></RequireAuth>} />
      <Route path="/calendario" element={<RequireAuth><Layout><Calendario /></Layout></RequireAuth>} />
      <Route path="/fornitori" element={<RequireAuth><Layout><Fornitori /></Layout></RequireAuth>} />
      <Route path="/amministrazione" element={<RequireAuth><Layout><Amministrazione /></Layout></RequireAuth>} />
      <Route path="/comunicazioni" element={<RequireAuth><Layout><Comunicazioni /></Layout></RequireAuth>} />
      <Route path="/workflow" element={<RequireAuth><Layout><Workflow /></Layout></RequireAuth>} />
      <Route path="/utenti" element={<RequireAuth><Layout><Utenti /></Layout></RequireAuth>} />
      <Route path="/impostazioni" element={<RequireAuth><Layout><Impostazioni /></Layout></RequireAuth>} />

      {/* Redirect root to login */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Catch all - redirect to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
