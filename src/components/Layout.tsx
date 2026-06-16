import { ReactNode, useState, useEffect, useCallback } from 'react'
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
  Palette,
  Share2,
  Presentation,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadUser, getAllowedNavForRole, signOutEverywhere } from '@/lib/auth'
import { fetchEvents } from '@/lib/events-service'
import { fetchTasks } from '@/lib/tasks-service'
import { fetchPractices } from '@/lib/practices-service'
import { fetchClients } from '@/lib/clients-service'
import { cacheEventsSnapshot, cacheTasksSnapshot, cachePraticheSnapshot, cacheClientsSnapshot } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead } from '@/lib/notifications-service'
import type { Notification } from '@/lib/notifications-service'

const iconMap: Record<string, React.ElementType> = {
  '/dashboard': LayoutDashboard,
  '/eventi': Calendar,
  '/crm': Users,
  '/task': CheckSquare,
  '/calendario': CalendarDays,
  '/fornitori': Truck,
  '/amministrazione': Settings,
  '/creative-studio': Palette,
  '/social-studio': Share2,
  '/presentazioni': Presentation,
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
  const navItems = user ? getAllowedNavForRole(user.role) : []

  const handleLogout = () => {
    void signOutEverywhere().then(() => {
      navigate('/login')
    })
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
        <div className="flex items-center justify-between px-5 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <Link to="/dashboard" className="flex flex-col items-center w-full group">
<img
  src="/logo-synergy.png"
  alt="Simmetria Synergy"
  className="w-48 transition-all duration-300 hover:opacity-90"
/>

          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-2 rounded-lg transition-all hover:bg-white/5 absolute right-3 top-4"
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
  color: isActive ? 'white' : 'var(--text)',
  boxShadow: isActive ? 'var(--shadow-red)' : 'none',
}}
              >
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 bg-white rounded-r"
                    style={{ height: '60%' }}
                  />
                )}
               <Icon
  className="w-5 h-5"
  style={{ color: isActive ? 'white' : 'var(--text)' }}
/>
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--line)' }}>
          {user ? (
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--panel2)' }}>
              <div
                className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}
              >
                {user.first_name.charAt(0)}{user.last_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                  {user.first_name} {user.last_name}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                  {user.role}
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

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Ora'
  if (mins < 60) return `${mins} min fa`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'ora' : 'ore'} fa`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Ieri'
  return `${days} giorni fa`
}

function Topbar({ setOpen }: { setOpen: (open: boolean) => void }) {
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifToast, setNotifToast] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const user = loadUser()

  const loadNotifications = useCallback(async () => {
    if (!user) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const userId = session.user.id
    const [notifs, count] = await Promise.all([
      fetchNotifications(userId),
      fetchUnreadCount(userId),
    ])
    setNotifications(notifs)
    setUnreadCount(count)
  }, [user])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  useEffect(() => {
    if (!notifOpen) return
    loadNotifications()
  }, [notifOpen, loadNotifications])

  const handleNotificationClick = async (n: Notification) => {
    if (!n.is_read) {
      await markAsRead(n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    setNotifOpen(false)

    if (!n.related_entity_type || !n.related_entity_id) {
      setNotifToast('Elemento collegato non disponibile')
      setTimeout(() => setNotifToast(null), 3000)
      return
    }

    const entityId = n.related_entity_id
    switch (n.related_entity_type) {
      case 'event':
      case 'evento':
        navigate(`/eventi?id=${entityId}`)
        break
      case 'task':
        navigate(`/task?id=${entityId}`)
        break
      case 'practice':
      case 'pratica':
        navigate(`/pratiche?id=${entityId}`)
        break
      case 'budget':
        navigate(`/amministrazione?tab=uscite`)
        break
      case 'communication':
      case 'comunicazione':
        navigate(`/comunicazioni?id=${entityId}`)
        break
      case 'supplier':
      case 'fornitore':
        navigate(`/fornitori?id=${entityId}`)
        break
      default:
        setNotifToast('Elemento collegato non disponibile')
        setTimeout(() => setNotifToast(null), 3000)
        break
    }
  }

  const handleMarkAllRead = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await markAllAsRead(session.user.id)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  const handleLogout = () => {
    void signOutEverywhere().then(() => {
      navigate('/login')
    })
  }

  return (
    <header
      className="sticky top-0 z-30 h-16 topbar"
      style={{
background: 'rgba(255, 255, 255, 0.92)',
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
          <div className="relative">
            <button
              onClick={() => { setNotifOpen(v => !v); setUserMenuOpen(false) }}
              className="relative p-2 rounded-lg transition-all hover:bg-white/5"
            >
              <Bell className="w-5 h-5" style={{ color: 'var(--muted)' }} />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1 right-1 min-w-[10px] h-[10px] rounded-full flex items-center justify-center text-[9px] font-bold text-white px-0.5"
                  style={{ background: 'var(--red)' }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-[calc(100vw-32px)] sm:w-80 rounded-xl overflow-hidden animate-fade-in"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: '0 20px 60px rgba(35,39,42,0.12)' }}
              >
                <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--line)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Notifiche</p>
                  {unreadCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(208,0,58,0.15)', color: 'var(--red2)' }}>
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--muted)', opacity: 0.4 }} />
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessuna notifica</p>
                    </div>
                  ) : (
                    notifications.map(n => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className="w-full text-left px-4 py-3 flex items-start gap-3 transition-all hover:bg-white/5"
                        style={{ borderBottom: '1px solid var(--line)' }}
                      >
                        {!n.is_read && <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--red)' }} />}
                        {n.is_read && <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'transparent' }} />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: n.is_read ? 'var(--muted)' : 'var(--text)' }}>{n.title}</p>
                          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{n.message}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)', opacity: 0.7 }}>{formatTimeAgo(n.created_at)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
                {notifications.length > 0 && (
                  <div className="px-4 py-2.5 border-t" style={{ borderColor: 'var(--line)' }}>
                    <button onClick={handleMarkAllRead} className="text-xs font-medium" style={{ color: 'var(--red2)' }}>
                      Segna tutte come lette
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User chip */}
          {user && (
            <div className="relative">
              <button
                onClick={() => { setUserMenuOpen(!userMenuOpen); setNotifOpen(false) }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:bg-white/5"
                style={{ border: '1px solid var(--line)' }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}
                >
                  {user.first_name.charAt(0)}{user.last_name.charAt(0)}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-medium leading-none" style={{ color: 'var(--text)' }}>
                    {user.first_name}
                  </p>
                  <p className="text-xs leading-none mt-0.5" style={{ color: 'var(--muted)' }}>
                    {user.role}
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
                    boxShadow: '0 20px 60px rgba(35,39,42,0.12)',
                  }}
                >
                  <div className="p-4 border-b" style={{ borderColor: 'var(--line)' }}>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}
                      >
                        {user.first_name.charAt(0)}{user.last_name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold" style={{ color: 'var(--text)' }}>
                          {user.first_name} {user.last_name}
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
                          {user.role}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-2">
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
      {notifToast && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-2 rounded-lg text-sm animate-fade-in z-50"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
        >
          {notifToast}
        </div>
      )}
    </header>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchEvents(), fetchTasks(), fetchPractices(), fetchClients()]).then(([ev, tk, pr, cl]) => {
      if (cancelled) return
      cacheEventsSnapshot(ev)
      cacheTasksSnapshot(tk)
      cachePraticheSnapshot(pr)
      cacheClientsSnapshot(cl)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div
      className="min-h-screen app-background"
      style={{
background: 'linear-gradient(135deg, #f7f7f5 0%, #fff3f6 48%, #f7f7f5 100%)',
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
