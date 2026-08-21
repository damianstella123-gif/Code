import { useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Users, Truck } from 'lucide-react'
import { loadUser } from '@/lib/auth'

const CAN_SEE_CLIENTI = ['Super Admin', 'Admin', 'Senior PM', 'Project Manager', 'Commerciale']
const CAN_SEE_FORNITORI = ['Super Admin', 'Admin', 'Senior PM', 'Project Manager', 'Regista']

export function canSeeClienti(role: string): boolean {
  if (CAN_SEE_CLIENTI.includes(role)) return true
  if (['Regista', 'Amministrazione', 'Finance'].includes(role)) return false
  return true
}

export function canSeeFornitori(role: string): boolean {
  if (CAN_SEE_FORNITORI.includes(role)) return true
  if (['Commerciale', 'Amministrazione', 'Finance'].includes(role)) return false
  return true
}

export function canSeeNetwork(role: string): boolean {
  return canSeeClienti(role) || canSeeFornitori(role)
}

export default function Network() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = loadUser()
  const role = user?.role || ''

  const showClienti = canSeeClienti(role)
  const showFornitori = canSeeFornitori(role)

  const isRoot = location.pathname === '/network' || location.pathname === '/network/'

  useEffect(() => {
    if (isRoot) {
      if (showClienti) navigate('/network/clienti', { replace: true })
      else if (showFornitori) navigate('/network/fornitori', { replace: true })
    }
  }, [isRoot, showClienti, showFornitori, navigate])

  const activeTab = location.pathname.includes('/network/fornitori') ? 'fornitori' : 'clienti'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {showClienti && showFornitori && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line)', background: 'var(--bg)', flexShrink: 0 }}>
          <button
            onClick={() => navigate('/network/clienti')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
              color: activeTab === 'clienti' ? 'var(--text)' : 'var(--muted)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === 'clienti' ? '2px solid var(--red2)' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <Users size={14} />
            CLIENTI
          </button>
          <button
            onClick={() => navigate('/network/fornitori')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
              color: activeTab === 'fornitori' ? 'var(--text)' : 'var(--muted)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === 'fornitori' ? '2px solid var(--red2)' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <Truck size={14} />
            FORNITORI
          </button>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
