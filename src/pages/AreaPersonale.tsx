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
  description: string
  path: string
  icon: React.ElementType
  visible: (role: string) => boolean
  privacy?: boolean
}

const TABS: Tab[] = [
  { id: 'impatto', label: 'Il Mio Impatto', description: 'Il tuo contributo personale: ore risparmiate, attività e valore generato.', path: '/area-personale/impatto', icon: TrendingUp, visible: () => true },
  { id: 'growth', label: 'Crescita', description: 'I tuoi obiettivi di sviluppo professionale e formazione.', path: '/area-personale/growth', icon: Sprout, visible: () => true },
  { id: 'wellness', label: 'Wellness', description: 'Privato, solo tuo — il tuo benessere personale.', path: '/area-personale/wellness', icon: HeartPulse, visible: canSeeWellness, privacy: true },
  { id: 'documenti', label: 'I Miei Documenti', description: 'Contratti, certificazioni e documenti personali.', path: '/area-personale/documenti', icon: FolderOpen, visible: () => true },
]

function LandingView({ tabs, onSelect }: { tabs: Tab[]; onSelect: (path: string) => void }) {
  return (
    <div style={{ padding: '40px 24px', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
        Area Personale
      </h1>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 32 }}>
        Il tuo spazio privato per monitorare crescita, impatto e benessere.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.path)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
                padding: '20px 22px',
                background: 'var(--panel2)',
                border: tab.privacy ? '1px solid var(--line)' : '1px solid var(--line)',
                borderRadius: 12,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--red2)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: tab.privacy ? 'rgba(139,92,246,0.08)' : 'rgba(239,68,68,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={18} style={{ color: tab.privacy ? 'var(--muted)' : 'var(--red2)' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  {tab.label}
                </span>
                {tab.privacy && <Lock size={12} style={{ color: 'var(--muted)', marginLeft: 'auto' }} />}
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                {tab.description}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function AreaPersonale() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = loadUser()
  const role = user?.role || ''

  const visibleTabs = TABS.filter(t => t.visible(role))

  const isRoot = location.pathname === '/area-personale' || location.pathname === '/area-personale/'

  if (isRoot) {
    return <LandingView tabs={visibleTabs} onSelect={path => navigate(path)} />
  }

  const activeTab = visibleTabs.find(t => location.pathname.startsWith(t.path))?.id ?? visibleTabs[0]?.id

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line)', background: 'var(--bg)', flexShrink: 0, overflowX: 'auto' }}>
        <button
          onClick={() => navigate('/area-personale')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '10px 14px',
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
            color: 'var(--muted)',
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderBottom: '2px solid transparent',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          &larr;
        </button>
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
              {tab.label.toUpperCase()}
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
