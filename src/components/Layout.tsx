import { ReactNode, useState, useEffect, useCallback } from 'react'
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
  Menu,
  X,
  Bell,
  LogOut,
  ChevronDown,
  SlidersHorizontal,
  FileText,
  Palette,
  MessageCircle,
  MessageSquare,
  GitBranch,
  UserCog,
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChatNotificationsProvider, useChatNotifications } from '@/lib/chat-notifications'
import PinnedChats from '@/components/PinnedChats'
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
  '/comunicazioni': MessageSquare,
  '/workflow': GitBranch,
  '/pratiche': FileText,
  '/utenti': UserCog,
  '/impostazioni': SlidersHorizontal,
  '/feedback-beta': MessageCircle,
  '/archivio': BookOpen,
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
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          'shell-sidebar fixed inset-y-0 left-0 z-50 w-[232px] transform transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="shell-sidebar-logo">
          <Link to="/dashboard" className="flex items-center justify-center w-full group">
            <img
              src="/logo-synergy.png"
              alt="Simmetria Synergy"
              className="w-32 object-contain transition-opacity duration-300 group-hover:opacity-80"
            />
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-2 rounded-lg transition-all hover:bg-white/5 absolute right-3 top-4"
          >
            <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {/* Navigation — instruments, not buttons */}
        <nav className="shell-nav flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = iconMap[item.href] ?? LayoutDashboard
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setOpen(false)}
                className={cn('shell-nav-item', isActive && 'shell-nav-item--active')}
              >
                <div className="shell-nav-indicator" />
                <Icon className="shell-nav-icon" />
                <span className="shell-nav-label">{item.name}</span>
                {item.href === '/comunicazioni' && <ChatBadge />}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="shell-sidebar-user">
          {user ? (
            <div className="shell-user-card">
              <div className="shell-user-avatar">
                {(user.first_name || '').charAt(0)}{(user.last_name || '').charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="shell-user-name">{user.first_name} {user.last_name}</p>
                <p className="shell-user-role">{user.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="shell-user-logout"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="shell-user-card">
              <div className="shell-user-avatar">?</div>
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

  // Realtime: reload notifications when a new one arrives for this user
  useEffect(() => {
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const row = payload.new as Notification
        if (!user) return
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session && row.user_id === session.user.id) {
            setNotifications(prev => [row, ...prev].slice(0, 50))
            setUnreadCount(prev => prev + 1)
            setNotifToast(row.title)
            setTimeout(() => setNotifToast(null), 4000)
          }
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

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
      case 'client':
        navigate(`/crm?id=${entityId}`)
        break
      case 'referente':
        navigate(`/crm`)
        break
      case 'archive_item':
        navigate(`/archivio`)
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
    <header className="shell-header sticky top-0 z-30">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Left side */}
        <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden p-2 rounded-lg transition-all hover:bg-white/5 flex-shrink-0"
          >
            <Menu className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
          <div className="hidden md:flex flex-1 min-w-0" style={{ maxWidth: 380 }}>
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
                className="absolute right-0 top-full mt-2 w-[calc(100vw-32px)] sm:w-80 rounded-3xl overflow-hidden animate-fade-in"
                style={{ background: 'var(--glass-bg-strong)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', boxShadow: '0 20px 60px rgba(211,28,48,0.08)' }}
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
                className="shell-user-chip"
              >
                <div className="shell-chip-avatar">
                  {(user.first_name || '').charAt(0)}{(user.last_name || '').charAt(0)}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-medium leading-none" style={{ color: 'var(--text)' }}>
                    {user.first_name}
                  </p>
                </div>
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--muted)', opacity: 0.5 }}
                />
              </button>

              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-64 rounded-3xl overflow-hidden animate-fade-in"
                  style={{
                    background: 'var(--glass-bg-strong)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: '0 20px 60px rgba(211,28,48,0.08)',
                  }}
                >
                  <div className="p-4 border-b" style={{ borderColor: 'var(--glass-border)' }}>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}
                      >
                        {(user.first_name || '').charAt(0)}{(user.last_name || '').charAt(0)}
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
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-2 rounded-2xl text-sm animate-fade-in z-50"
          style={{ background: 'var(--glass-bg-strong)', backdropFilter: 'blur(16px)', border: '1px solid var(--glass-border)', color: 'var(--muted)', boxShadow: '0 8px 24px rgba(211,28,48,0.08)' }}
        >
          {notifToast}
        </div>
      )}
    </header>
  )
}

function ChatBadge() {
  const { unread } = useChatNotifications()
  if (unread.total === 0) return null
  return (
    <span style={{
      marginLeft: 'auto', minWidth: '18px', height: '18px', borderRadius: '9px',
      background: 'var(--red2)', color: '#fff', fontFamily: 'var(--font-mono)',
      fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '0 5px',
    }}>
      {unread.total > 99 ? '99+' : unread.total}
    </span>
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
    <ChatNotificationsProvider>
      <div className="shell-environment">
        {/* Ambient environment — directional light from top-left */}
        <div className="shell-ambient" aria-hidden="true">
          <div className="shell-light-primary" />
          <div className="shell-light-secondary" />
        </div>
        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
        <div className="shell-main lg:pl-[232px]">
          <Topbar setOpen={setSidebarOpen} />
          <main className="shell-content">
            {children}
          </main>
        </div>
        <PinnedChats />
      </div>
    </ChatNotificationsProvider>
  )
}
