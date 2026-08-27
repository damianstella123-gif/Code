import { useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { TrendingUp, Sprout, HeartPulse, FolderOpen, Lock } from 'lucide-react'
import { loadUser } from '@/lib/auth'

const CAN_SEE_WELLNESS = ['Super Admin', 'Admin', 'Senior PM', 'Project Manager']

export function canSeeWellness(role: string): boolean {
  return CAN_SEE_WELLNESS.includes(role)
}

interface Tab {
  id: string
  label: string
  path: string
  icon: React.ElementType
  visible: (role: string) => boolean
  privacy?: boolean
}

const TABS: Tab[] = [
  { id: 'impatto', label: 'IL MIO IMPATTO', path: '/area-personale/impatto', icon: TrendingUp, visible: () => true },
  { id: 'growth', label: 'CRESCITA', path: '/area-personale/growth', icon: Sprout, visible: () => true },
  { id: 'wellness', label: 'WELLNESS', path: '/area-personale/wellness', icon: HeartPulse, visible: canSeeWellness, privacy: true },
  { id: 'documenti', label: 'I MIEI DOCUMENTI', path: '/area-personale/documenti', icon: FolderOpen, visible: () => true },
]

export default function AreaPersonale() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = loadUser()
  const role = user?.role || ''

  const visibleTabs = TABS.filter(t => t.visible(role))

  const isRoot = location.pathname === '/area-personale' || location.pathname === '/area-personale/'

  useEffect(() => {
    if (isRoot && visibleTabs.length > 0) {
      navigate(visibleTabs[0].path, { replace: true })
    }
  }, [isRoot, visibleTabs, navigate])

  const activeTab = visibleTabs.find(t => location.pathname.startsWith(t.path))?.id ?? visibleTabs[0]?.id

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line)', background: 'var(--bg)', flexShrink: 0, overflowX: 'auto' }}>
        {visibleTabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 18px',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.03em',
                color: isActive ? 'var(--text)' : 'var(--muted)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: isActive ? '2px solid var(--red2)' : '2px solid transparent',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={13} />
              {tab.label}
              {tab.privacy && <Lock size={10} style={{ opacity: 0.6 }} />}
            </button>
          )
        })}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
