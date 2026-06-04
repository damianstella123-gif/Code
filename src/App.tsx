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
import Pratiche from './pages/Pratiche'
import Impostazioni from './pages/Impostazioni'

export default function App() {
  return (
    <Routes>
      <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
      <Route path="/eventi" element={<Layout><Eventi /></Layout>} />
      <Route path="/crm" element={<Layout><CRM /></Layout>} />
      <Route path="/task" element={<Layout><Task /></Layout>} />
      <Route path="/calendario" element={<Layout><Calendario /></Layout>} />
      <Route path="/fornitori" element={<Layout><Fornitori /></Layout>} />
      <Route path="/amministrazione" element={<Layout><Amministrazione /></Layout>} />
      <Route path="/comunicazioni" element={<Layout><Comunicazioni /></Layout>} />
      <Route path="/workflow" element={<Layout><Workflow /></Layout>} />
      <Route path="/pratiche" element={<Layout><Pratiche /></Layout>} />
      <Route path="/utenti" element={<Layout><Utenti /></Layout>} />
      <Route path="/impostazioni" element={<Layout><Impostazioni /></Layout>} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
