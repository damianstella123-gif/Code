import { ReactNode, useState } from 'react'
import FlyAssistant from '@/components/FlyAssistant'
import GlobalSearch from '@/components/GlobalSearch'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Calendar,
  Users,
  CheckSquare,
  CalendarDays,
  Truck,
  Settings,
  MessageSquare,
  GitBranch,
  UserCog,
  Menu,
  X,
  Bell,
  LogOut,
  ChevronDown,
  SlidersHorizontal,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadUser, clearUser, getAllowedNav } from '@/lib/auth'

const iconMap: Record<string, React.ElementType> = {
  '/dashboard': LayoutDashboard,
  '/eventi': Calendar,
  '/crm': Users,
  '/task': CheckSquare,
  '/calendario': CalendarDays,
  '/fornitori': Truck,
  '/amministrazione': Settings,
  '/comunicazioni': MessageSquare,
  '/workflow': GitBranch,
  '/pratiche': FileText,
  '/utenti': UserCog,
  '/impostazioni': SlidersHorizontal,
}

interface SidebarProps {
  open: boolean
  setOpen: (open: boolean) => void
}

function Sidebar({ open, setOpen }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const user = loadUser()
  const navItems = user ? getAllowedNav(user.ruolo) : getAllowedNav('Operativo')

  const handleLogout = () => {
    clearUser()
    navigate('/login')
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 sidebar transform transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: 'linear-gradient(180deg, var(--panel) 0%, var(--bg) 100%)' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6 border-b" style={{ borderColor: 'var(--line)' }}>
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
                boxShadow: 'var(--shadow-red)',
              }}
            >
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="text-xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
              SIMMETRIA<span style={{ color: 'var(--red2)' }}> HUB</span>
            </span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-2 rounded-lg transition-all hover:bg-white/5"
          >
            <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = iconMap[item.href] ?? LayoutDashboard
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 relative"
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                    : 'transparent',
                  color: isActive ? 'white' : 'var(--muted)',
                  boxShadow: isActive ? 'var(--shadow-red)' : 'none',
                }}
              >
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 bg-white rounded-r"
                    style={{ height: '60%' }}
                  />
                )}
                <Icon className="w-5 h-5" style={{ color: isActive ? 'white' : 'var(--muted)' }} />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--line)' }}>
          {user ? (
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--panel2)' }}>
              <img
                src={user.avatar}
                alt={user.nome}
                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                  {user.nome}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                  {user.ruolo} · {user.reparto}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg transition-all hover:bg-white/10 flex-shrink-0"
                title="Logout"
              >
                <LogOut className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--panel2)' }}>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(208, 0, 58, 0.15)' }}
              >
                <span style={{ color: 'var(--red2)', fontWeight: 600 }}>?</span>
              </div>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun utente</p>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

function Topbar({ setOpen }: { setOpen: (open: boolean) => void }) {
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const user = loadUser()

  const handleLogout = () => {
    clearUser()
    navigate('/login')
  }

  return (
    <header
      className="sticky top-0 z-30 h-16 topbar"
      style={{
        background: 'rgba(14, 18, 24, 0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Left side */}
        <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden p-2 rounded-lg transition-all hover:bg-white/5 flex-shrink-0"
          >
            <Menu className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
          <div className="hidden md:flex flex-1 min-w-0" style={{ maxWidth: 420 }}>
            <GlobalSearch />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button className="relative p-2 rounded-lg transition-all hover:bg-white/5">
            <Bell className="w-5 h-5" style={{ color: 'var(--muted)' }} />
            <span
              className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full"
              style={{ background: 'var(--red)' }}
            />
          </button>

          {/* User chip */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:bg-white/5"
                style={{ border: '1px solid var(--line)' }}
              >
                <img
                  src={user.avatar}
                  alt={user.nome}
                  className="w-7 h-7 rounded-lg object-cover"
                />
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-medium leading-none" style={{ color: 'var(--text)' }}>
                    {user.nome.split(' ')[0]}
                  </p>
                  <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--muted)' }}>
                    {user.ruolo}
                  </p>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--muted)' }}
                />
              </button>

              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-64 rounded-xl overflow-hidden animate-fade-in"
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                  }}
                >
                  <div className="p-4 border-b" style={{ borderColor: 'var(--line)' }}>
                    <div className="flex items-center gap-3">
                      <img
                        src={user.avatar}
                        alt={user.nome}
                        className="w-12 h-12 rounded-xl object-cover"
                      />
                      <div>
                        <p className="font-semibold" style={{ color: 'var(--text)' }}>
                          {user.nome}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                          {user.email}
                        </p>
                        <span
                          className="inline-block text-xs px-2 py-0.5 rounded mt-1"
                          style={{
                            background: 'rgba(208, 0, 58, 0.15)',
                            color: 'var(--red2)',
                          }}
                        >
                          {user.ruolo} · {user.reparto}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false)
                        navigate('/login')
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:bg-white/5"
                      style={{ color: 'var(--muted)' }}
                    >
                      <Users className="w-4 h-4" />
                      Cambia utente
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:bg-red-500/10"
                      style={{ color: 'var(--red2)' }}
                    >
                      <LogOut className="w-4 h-4" />
                      Esci
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!user && (
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg transition-all hover:bg-white/5"
            >
              <LogOut className="w-5 h-5" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const user = loadUser()

  if (!user) {
    navigate('/login')
    return null
  }

  return (
    <div
      className="min-h-screen app-background"
      style={{
        background: 'linear-gradient(135deg, var(--bg) 0%, rgba(208, 0, 58, 0.03) 50%, var(--bg) 100%)',
        backgroundAttachment: 'fixed',
      }}
    >
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Topbar setOpen={setSidebarOpen} />
        <main className="flex-1">
          <div className="p-4 lg:p-6">{children}</div>
        </main>
      </div>
      <FlyAssistant />
    </div>
  )
}
