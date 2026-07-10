import { ReactNode, useState, useEffect, useCallback } from 'react'
import GlobalSearch from '@/components/GlobalSearch'
import { OfflineBanner } from '@/components/OfflineBanner'
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
  BellOff,
  LogOut,
  ChevronDown,
  SlidersHorizontal,
  FileText,
  Palette,
  MessageCircle,
  MessageSquare,
  GitBranch,
  UserCog,
  Search,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChatNotificationsProvider, useChatNotifications } from '@/lib/chat-notifications'
import PinnedChats from '@/components/PinnedChats'
import { loadUser, getAllowedNavForRole, signOutEverywhere } from '@/lib/auth'
import { fetchEvents } from '@/lib/events-service'
import { fetchTasks } from '@/lib/tasks-service'
import { fetchPractices } from '@/lib/dossier-service'
import { fetchClients } from '@/lib/clients-service'
import { cacheEventsSnapshot, cacheTasksSnapshot, cachePraticheSnapshot, cacheClientsSnapshot } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead, archiveOldNotifications } from '@/lib/notifications-service'
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
  '/dossier': FileText,
  '/utenti': UserCog,
  '/impostazioni': SlidersHorizontal,
  '/feedback-beta': MessageCircle,
}

const NAV_GROUPS: { label: string; paths: string[] }[] = [
  { label: '', paths: ['/dashboard'] },
  { label: 'Operativo', paths: ['/eventi', '/task', '/calendario', '/fornitori'] },
  { label: 'Business', paths: ['/crm', '/amministrazione'] },
  { label: 'Contenuti', paths: ['/comunicazioni', '/creative-studio'] },
  { label: 'Sistema', paths: ['/workflow', '/dossier', '/utenti', '/performance', '/impostazioni', '/feedback-beta'] },
]

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
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          'shell-sidebar fixed inset-y-0 left-0 z-50 w-[232px] transform transition-transform duration-300 ease-in-out flex flex-col',
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
          {NAV_GROUPS.map((group) => {
            const groupItems = navItems.filter(item => group.paths.includes(item.href))
            if (groupItems.length === 0) return null
            return (
              <div key={group.label || '_root'} className="shell-nav-group">
                {group.label && <p className="shell-nav-group-label">{group.label}</p>}
                {groupItems.map((item) => {
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
                      {item.href === '/impostazioni' && <SentinelBadge />}
                    </Link>
                  )
                })}
              </div>
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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
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
    // Archive old unread notifications once per session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) archiveOldNotifications(session.user.id)
    })
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
            setNotifications(prev => [row, ...prev].slice(0, 20))
            setUnreadCount(prev => prev + 1)
            setNotifToast(row.title)
            setTimeout(() => setNotifToast(null), 4000)
          }
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  useEffect(() => {
    if (!notifOpen && !userMenuOpen) return
    function handleClick(e: MouseEvent) {
      const notifEl = document.getElementById('notif-panel')
      const accountEl = document.getElementById('account-panel')
      const notifBtn = document.getElementById('notif-btn')
      const accountBtn = document.getElementById('account-btn')
      if (notifOpen && notifEl && !notifEl.contains(e.target as Node) && !notifBtn?.contains(e.target as Node)) {
        setNotifOpen(false)
      }
      if (userMenuOpen && accountEl && !accountEl.contains(e.target as Node) && !accountBtn?.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [notifOpen, userMenuOpen])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setNotifOpen(false)
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [])

  const handleNotificationClick = async (n: Notification) => {
    await markAsRead(n.id)
    setNotifications(prev => prev.filter(x => x.id !== n.id))
    setUnreadCount(prev => Math.max(0, prev - 1))
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
        navigate(`/dossier?id=${entityId}`)
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
        navigate(`/dossier`)
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
    setNotifications([])
    setUnreadCount(0)
  }

  const handleLogout = () => {
    void signOutEverywhere().then(() => {
      navigate('/login')
    })
  }

  return (
    <header className="shell-header sticky top-0 z-30">
      <div className="shell-header-inner" style={{ width: '100%', maxWidth: '1280px', marginLeft: 'auto', marginRight: 'auto', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%' }}>
        {/* Left side */}
        <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-lg transition-all hover:bg-white/5 flex-shrink-0"
          >
            <Menu className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
          <div className="hidden md:flex flex-1 min-w-0" style={{ maxWidth: 380 }}>
            <GlobalSearch />
          </div>
          <button
            onClick={() => setMobileSearchOpen(true)}
            className="md:hidden p-2 rounded-lg transition-all hover:bg-white/5 flex-shrink-0"
          >
            <Search className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              id="notif-btn"
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
                id="notif-panel"
                className="absolute right-0 top-full mt-2 w-[calc(100vw-32px)] sm:w-80 rounded-2xl overflow-hidden animate-fade-in"
                style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', boxShadow: '0 8px 32px rgba(0,0,0,0.14)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    NOTIFICHE
                    {unreadCount > 0 && (
                      <span style={{ background: 'var(--red2)', color: 'white', borderRadius: 99, fontSize: '9px', padding: '1px 6px' }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </span>
                  {unreadCount > 0 && (
                    <button onClick={handleMarkAllRead} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Segna tutte lette
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: 10 }}>
                      <BellOff size={20} style={{ color: 'var(--muted)' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)' }}>
                        Nessuna notifica
                      </span>
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--line)', transition: 'background .15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--panel2)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red2)', marginTop: 5, flexShrink: 0, boxShadow: '0 0 5px rgba(200,25,46,.5)' }} />
                        <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)', lineHeight: 1.4 }}>{n.message}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', flexShrink: 0, marginTop: 2 }}>
                          {formatTimeAgo(n.created_at)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>
                  Le notifiche lette spariscono dopo 24 ore
                </div>
              </div>
            )}
          </div>

          {/* User chip */}
          {user && (
            <div className="relative">
              <button
                id="account-btn"
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
                  id="account-panel"
                  className="absolute right-0 top-full mt-2 w-64 rounded-3xl overflow-hidden animate-fade-in"
                  style={{
                    background: 'var(--panel-solid)',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                    border: '1px solid var(--line)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
                  }}
                >
                  <div className="p-4 border-b" style={{ borderColor: 'var(--line)' }}>
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
      {/* Mobile Search Overlay */}
      {mobileSearchOpen && (
        <div className="fixed inset-0 z-50 md:hidden" style={{ background: 'var(--panel-solid)' }}>
          <div className="flex items-center gap-3 px-4 h-14 border-b" style={{ borderColor: 'var(--line)' }}>
            <div className="flex-1">
              <GlobalSearch />
            </div>
            <button
              onClick={() => setMobileSearchOpen(false)}
              className="p-2 rounded-lg"
              style={{ color: 'var(--muted)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {notifToast && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-4 py-2 rounded-2xl text-sm animate-fade-in z-50"
          style={{ background: 'var(--panel-solid)', backdropFilter: 'none', WebkitBackdropFilter: 'none', border: '1px solid var(--line)', color: 'var(--muted)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
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

function SentinelBadge() {
  const [count, setCount] = useState(0)
  const user = loadUser()

  useEffect(() => {
    if (!user || (user.role !== 'Admin' && user.role !== 'Super Admin')) return
    supabase.from('sentinel_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new')
      .eq('severity', 'critical')
      .then(({ count: c }) => { if (c) setCount(c) })
  }, [])

  if (count === 0) return null
  return (
    <span style={{
      marginLeft: 'auto', minWidth: '18px', height: '18px', borderRadius: '9px',
      background: '#dc2626', color: '#fff', fontFamily: 'var(--font-mono)',
      fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '0 5px',
    }}>
      {count > 9 ? '9+' : count}
    </span>
  )
}

const PRIMARY_MOBILE_PATHS = ['/dashboard', '/eventi', '/crm', '/task', '/calendario', '/fornitori', '/amministrazione']
const SECONDARY_MOBILE_PATHS = ['/comunicazioni', '/workflow', '/dossier', '/utenti', '/impostazioni', '/feedback-beta', '/creative-studio']

const mobileLabels: Record<string, string> = {
  '/dashboard': 'Home',
  '/eventi': 'Eventi',
  '/crm': 'CRM',
  '/task': 'Task',
  '/calendario': 'Agenda',
  '/fornitori': 'Fornitori',
  '/amministrazione': 'Admin',
}

function BottomNav() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const user = loadUser()
  const navItems = user ? getAllowedNavForRole(user.role) : []

  const primaryItems = navItems.filter(item => PRIMARY_MOBILE_PATHS.includes(item.href))
  const secondaryItems = navItems.filter(item => SECONDARY_MOBILE_PATHS.includes(item.href))

  const isSecondaryActive = secondaryItems.some(item => item.href === location.pathname)

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-[99]" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-[60px] left-2 right-2 rounded-2xl overflow-hidden animate-fade-in safe-bottom"
            style={{ background: 'var(--panel-solid)', backdropFilter: 'none', WebkitBackdropFilter: 'none', border: '1px solid var(--line)', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="grid grid-cols-4 gap-1 p-3">
              {secondaryItems.map(item => {
                const Icon = iconMap[item.href] ?? LayoutDashboard
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1 py-3 px-1 rounded-xl transition-colors"
                    style={{ background: isActive ? 'rgba(208,0,58,0.08)' : 'transparent' }}
                  >
                    <Icon className="w-5 h-5" style={{ color: isActive ? 'var(--red2)' : 'var(--muted)' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: isActive ? 'var(--red2)' : 'var(--muted)', textAlign: 'center', lineHeight: 1.2 }}>
                      {item.name}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[98] safe-bottom"
        style={{ background: 'var(--panel-solid)', borderTop: '1px solid var(--line)' }}
      >
        <div className="flex items-center justify-around h-[56px] px-1">
          {primaryItems.slice(0, 5).map(item => {
            const Icon = iconMap[item.href] ?? LayoutDashboard
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1"
                style={{ minHeight: 44, minWidth: 44 }}
              >
                <Icon className="w-[20px] h-[20px]" style={{ color: isActive ? 'var(--red2)' : 'var(--muted)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.02em', color: isActive ? 'var(--red2)' : 'var(--muted)' }}>
                  {mobileLabels[item.href] || item.name}
                </span>
              </Link>
            )
          })}
          {secondaryItems.length > 0 && (
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1"
              style={{ minHeight: 44, minWidth: 44 }}
            >
              <MoreHorizontal className="w-[20px] h-[20px]" style={{ color: isSecondaryActive ? 'var(--red2)' : 'var(--muted)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.02em', color: isSecondaryActive ? 'var(--red2)' : 'var(--muted)' }}>
                Altro
              </span>
            </button>
          )}
        </div>
      </nav>
    </>
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
        <div className="shell-main">
          <Topbar setOpen={setSidebarOpen} />
          <OfflineBanner />
          <main className="shell-content pb-mobile-nav" style={{ alignSelf: 'center', width: '100%', maxWidth: '1280px', marginLeft: 'auto', marginRight: 'auto' }}>
            {children}
          </main>
        </div>
        <BottomNav />
        <PinnedChats />
      </div>
    </ChatNotificationsProvider>
  )
}
