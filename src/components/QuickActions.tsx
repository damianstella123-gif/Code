import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus, CheckSquare, MessageCircle, Paperclip, Calendar, Building2, Palmtree } from 'lucide-react'

interface QuickAction {
  icon: React.ReactNode
  label: string
  onClick: () => void
  color?: string
}

const FLY_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 4.6 9c-1 .6-1.7 1.8-1.7 3s.7 2.4 1.7 3A3.6 3.6 0 0 0 9 19.3c.6 1.1 1.8 1.7 3 1.7s2.4-.6 3-1.7A3.6 3.6 0 0 0 19.4 15c1-.6 1.7-1.8 1.7-3s-.7-2.4-1.7-3A3.6 3.6 0 0 0 15 4.7C14.4 3.6 13.2 3 12 3z"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
)

function triggerFlyOpen() {
  const input = document.querySelector<HTMLInputElement>('.cmd-bar-input')
  if (input) { input.focus(); return }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
}

const HIDDEN_PATHS = ['/login', '/change-password', '/setup-2fa']

export default function QuickActions() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const eventId = params.get('id')
  const isEventDetail = location.pathname === '/eventi' && !!eventId

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if ((e.target as Element).closest('[data-qa]')) return
      setOpen(false)
    }
    const t = setTimeout(() => document.addEventListener('mousedown', close), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', close) }
  }, [open])

  if (HIDDEN_PATHS.includes(location.pathname)) return null

  function getActions(): QuickAction[] {
    const fly: QuickAction = {
      icon: FLY_ICON,
      label: 'Chiedi a Fly',
      onClick: () => { triggerFlyOpen(); setOpen(false) },
      color: 'var(--red2)',
    }

    if (isEventDetail) return [
      { icon: <CheckSquare size={16} />, label: 'Nuovo task', onClick: () => { navigate(`/task?event=${eventId}&new=true`); setOpen(false) } },
      { icon: <MessageCircle size={16} />, label: 'Messaggio team', onClick: () => { window.dispatchEvent(new CustomEvent('set-event-tab', { detail: 'comunicazioni' })); setOpen(false) } },
      { icon: <Paperclip size={16} />, label: 'Documento', onClick: () => { window.dispatchEvent(new CustomEvent('set-event-tab', { detail: 'documenti' })); setOpen(false) } },
      fly,
    ]

    if (location.pathname === '/dashboard') return [
      { icon: <Building2 size={16} />, label: 'Nuovo evento', onClick: () => { navigate('/eventi?new=true'); setOpen(false) } },
      { icon: <CheckSquare size={16} />, label: 'Nuovo task', onClick: () => { navigate('/task?new=true'); setOpen(false) } },
      { icon: <Palmtree size={16} />, label: 'Richiesta ferie', onClick: () => { navigate('/calendario?leave=true'); setOpen(false) } },
      fly,
    ]

    if (location.pathname === '/fornitori') return [
      { icon: <Building2 size={16} />, label: 'Nuovo fornitore', onClick: () => { window.dispatchEvent(new CustomEvent('new-supplier')); setOpen(false) } },
      fly,
    ]

    return [
      { icon: <Building2 size={16} />, label: 'Nuovo evento', onClick: () => { navigate('/eventi?new=true'); setOpen(false) } },
      { icon: <CheckSquare size={16} />, label: 'Nuovo task', onClick: () => { navigate('/task?new=true'); setOpen(false) } },
      { icon: <Calendar size={16} />, label: 'Calendario', onClick: () => { navigate('/calendario'); setOpen(false) } },
      fly,
    ]
  }

  const actions = getActions()

  return (
    <div data-qa style={{ position: 'fixed', bottom: 72, right: 16, zIndex: 49, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {open && actions.map((a, i) => (
        <button
          key={i}
          onClick={a.onClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 16px 9px 14px',
            borderRadius: 99,
            background: 'var(--panel-solid)',
            border: '1px solid var(--line)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: a.color || 'var(--text)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            whiteSpace: 'nowrap',
            animation: `fadeSlideUp 0.2s ease ${i * 0.04}s both`,
          }}
        >
          {a.icon}
          {a.label}
        </button>
      ))}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: open ? 'var(--text)' : 'var(--red2)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          boxShadow: open ? '0 4px 12px rgba(0,0,0,0.2)' : '0 4px 20px rgba(200,25,46,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >
        <Plus size={22} />
      </button>
    </div>
  )
}
