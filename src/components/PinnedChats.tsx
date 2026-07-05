import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Send, Check, CheckCheck } from 'lucide-react'
import { useChatNotifications } from '@/lib/chat-notifications'
import { fetchMessages, sendMessage, markMessagesRead, type ChatMessage } from '@/lib/chat-service'
import { loadUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/profiles'

const DRAG_THRESHOLD = 5
const BUBBLE_SIZE = 52
const STORAGE_KEY = 'pinned_chat_positions'

interface BubblePosition {
  x: number
  y: number
}

function getInitials(profile: Profile | undefined, id?: string): string {
  if (profile) return `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase()
  return (id ?? '??').slice(0, 2).toUpperCase()
}

function getDisplayName(profile: Profile | undefined, id?: string): string {
  if (profile) return `${profile.first_name} ${profile.last_name}`.trim()
  return id ?? 'Utente'
}

function formatMsgTime(d: string): string {
  return new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function loadPositions(): Record<string, BubblePosition> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function savePositions(positions: Record<string, BubblePosition>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
}

function clampPosition(x: number, y: number): BubblePosition {
  const maxX = window.innerWidth - BUBBLE_SIZE - 8
  const maxY = window.innerHeight - BUBBLE_SIZE - 8
  return {
    x: Math.max(8, Math.min(x, maxX)),
    y: Math.max(8, Math.min(y, maxY)),
  }
}

function useIsMobile() {
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return mobile
}

export default function PinnedChats() {
  const { unread } = useChatNotifications()
  const [openConvId, setOpenConvId] = useState<string | null>(null)
  const [positions, setPositions] = useState<Record<string, BubblePosition>>(loadPositions)
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const pinnedConvs = useMemo(() => {
    return unread.pinnedIds
      .map(id => unread.conversations.find(c => c.id === id))
      .filter(Boolean) as typeof unread.conversations
  }, [unread.pinnedIds, unread.conversations])

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>()
    unread.profiles.forEach(p => m.set(p.id, p))
    return m
  }, [unread.profiles])

  const user = loadUser()
  if (!user) return null
  if (pinnedConvs.length === 0) return null

  function handleBubbleClick(convId: string) {
    if (isMobile) {
      navigate('/comunicazioni')
    } else {
      setOpenConvId(prev => prev === convId ? null : convId)
    }
  }

  function updatePosition(convId: string, pos: BubblePosition) {
    setPositions(prev => {
      const next = { ...prev, [convId]: pos }
      savePositions(next)
      return next
    })
  }

  if (isMobile) {
    return (
      <div style={{
        position: 'fixed', bottom: '20px', right: '20px', zIndex: 45,
        display: 'flex', flexDirection: 'column-reverse', gap: '10px',
        pointerEvents: 'auto',
      }}>
        {pinnedConvs.map(conv => {
          const unreadCount = unread.byConversation.get(conv.id) ?? 0
          const initial = conv.is_group
            ? (conv.title?.[0]?.toUpperCase() ?? 'G')
            : getInitials(profileMap.get(conv.participant_ids.find(id => id !== user.id) ?? ''))
          return (
            <button
              key={conv.id}
              onClick={() => navigate('/comunicazioni')}
              style={{
                width: `${BUBBLE_SIZE}px`, height: `${BUBBLE_SIZE}px`, borderRadius: '50%',
                background: 'var(--panel-solid)', border: '2px solid var(--line)',
                color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', position: 'relative',
                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              }}
            >
              {initial}
              {unreadCount > 0 && <UnreadBadge count={unreadCount} />}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <>
      {pinnedConvs.map((conv, idx) => {
        const defaultPos = clampPosition(
          window.innerWidth - BUBBLE_SIZE - 20,
          window.innerHeight - BUBBLE_SIZE - 20 - idx * (BUBBLE_SIZE + 12)
        )
        const pos = positions[conv.id] ?? defaultPos
        const unreadCount = unread.byConversation.get(conv.id) ?? 0
        const initial = conv.is_group
          ? (conv.title?.[0]?.toUpperCase() ?? 'G')
          : getInitials(profileMap.get(conv.participant_ids.find(id => id !== user.id) ?? ''))

        return (
          <DraggableBubble
            key={conv.id}
            convId={conv.id}
            initial={initial}
            unreadCount={unreadCount}
            isOpen={openConvId === conv.id}
            position={pos}
            onPositionChange={(p) => updatePosition(conv.id, p)}
            onClick={() => handleBubbleClick(conv.id)}
          />
        )
      })}

      {openConvId && (
        <MiniChatWindow
          conversationId={openConvId}
          conversations={unread.conversations}
          profileMap={profileMap}
          currentUserId={user.id}
          anchorPos={positions[openConvId] ?? { x: window.innerWidth - 340, y: window.innerHeight - 500 }}
          onClose={() => setOpenConvId(null)}
        />
      )}
    </>
  )
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span style={{
      position: 'absolute', top: '-4px', right: '-4px',
      minWidth: '18px', height: '18px', borderRadius: '9px',
      background: 'var(--red2)', color: '#fff',
      fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 4px', border: '2px solid var(--panel-solid)',
    }}>
      {count > 9 ? '9+' : count}
    </span>
  )
}

interface DraggableBubbleProps {
  convId: string
  initial: string
  unreadCount: number
  isOpen: boolean
  position: BubblePosition
  onPositionChange: (pos: BubblePosition) => void
  onClick: () => void
}

function DraggableBubble({ initial, unreadCount, isOpen, position, onPositionChange, onClick }: DraggableBubbleProps) {
  const isDragging = useRef(false)
  const startPointer = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })
  const didDrag = useRef(false)
  const bubbleRef = useRef<HTMLButtonElement>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true
    didDrag.current = false
    startPointer.current = { x: e.clientX, y: e.clientY }
    startPos.current = { x: position.x, y: position.y }
    bubbleRef.current?.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [position])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - startPointer.current.x
    const dy = e.clientY - startPointer.current.y

    if (!didDrag.current && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
    didDrag.current = true

    const newPos = clampPosition(startPos.current.x + dx, startPos.current.y + dy)
    onPositionChange(newPos)
  }, [onPositionChange])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDragging.current = false
    bubbleRef.current?.releasePointerCapture(e.pointerId)
    if (!didDrag.current) {
      onClick()
    }
  }, [onClick])

  return (
    <button
      ref={bubbleRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${BUBBLE_SIZE}px`,
        height: `${BUBBLE_SIZE}px`,
        borderRadius: '50%',
        background: isOpen ? 'var(--red2)' : 'var(--panel-solid)',
        border: '2px solid var(--line)',
        color: isOpen ? '#fff' : 'var(--text)',
        fontFamily: 'var(--font-mono)',
        fontSize: '14px',
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
        zIndex: 46,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        transition: didDrag.current ? 'none' : 'background 0.15s ease, color 0.15s ease',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {initial}
      {unreadCount > 0 && !isOpen && <UnreadBadge count={unreadCount} />}
    </button>
  )
}

interface MiniChatProps {
  conversationId: string
  conversations: any[]
  profileMap: Map<string, Profile>
  currentUserId: string
  anchorPos: BubblePosition
  onClose: () => void
}

function MiniChatWindow({ conversationId, conversations, profileMap, currentUserId, anchorPos, onClose }: MiniChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const conv = conversations.find((c: any) => c.id === conversationId)
  const convName = conv?.title ?? conv?.participant_ids
    .filter((id: string) => id !== currentUserId)
    .map((id: string) => getDisplayName(profileMap.get(id), id))
    .join(', ') ?? 'Chat'

  useEffect(() => {
    fetchMessages(conversationId).then(setMessages)
    markMessagesRead(conversationId, currentUserId)
  }, [conversationId, currentUserId])

  useEffect(() => {
    const channel = supabase
      .channel(`pinned-mini-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const newMsg = payload.new as ChatMessage
        setMessages(prev => {
          if (prev.find(m => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
        if (newMsg.sender_id !== currentUserId) {
          markMessagesRead(conversationId, currentUserId)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const updated = payload.new as ChatMessage
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, currentUserId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = '36px'
    const msg = await sendMessage(conversationId, currentUserId, text)
    if (msg) setMessages(prev => [...prev, msg])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const windowWidth = 320
  const windowHeight = 420
  let left = anchorPos.x - windowWidth - 12
  let top = anchorPos.y - windowHeight + BUBBLE_SIZE

  if (left < 8) left = anchorPos.x + BUBBLE_SIZE + 12
  if (top < 8) top = 8
  if (top + windowHeight > window.innerHeight - 8) top = window.innerHeight - windowHeight - 8

  return (
    <div style={{
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${windowWidth}px`,
      maxHeight: `${windowHeight}px`,
      borderRadius: '14px',
      background: 'var(--panel-solid)',
      border: '1px solid var(--line)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      zIndex: 47,
      animation: 'fadeIn 0.15s ease',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
          {convName}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '200px', maxHeight: '300px' }}>
        {messages.slice(-40).map(msg => {
          const isMine = msg.sender_id === currentUserId
          const allParts = conv?.participant_ids ?? []
          const others = allParts.filter((id: string) => id !== msg.sender_id)
          const allRead = others.length > 0 && others.every((id: string) => msg.read_by.includes(id))
          return (
            <div key={msg.id} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              {!isMine && conv?.is_group && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', marginBottom: '1px', paddingLeft: '4px' }}>
                  {getDisplayName(profileMap.get(msg.sender_id), msg.sender_id).split(' ')[0]}
                </div>
              )}
              <div style={{
                padding: '7px 11px', borderRadius: '12px', fontSize: '12px', lineHeight: 1.4,
                background: isMine ? 'var(--red2)' : 'var(--panel)',
                color: isMine ? '#fff' : 'var(--text)',
                border: isMine ? 'none' : '1px solid var(--line)',
              }}>
                {msg.content}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', justifyContent: isMine ? 'flex-end' : 'flex-start', marginTop: '2px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)' }}>{formatMsgTime(msg.created_at)}</span>
                {isMine && (allRead
                  ? <CheckCheck className="w-2.5 h-2.5" style={{ color: 'var(--blue)' }} />
                  : <Check className="w-2.5 h-2.5" style={{ color: 'var(--muted)' }} />
                )}
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--line)', display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => { setInput(e.target.value); e.target.style.height = '36px'; e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px' }}
          onKeyDown={handleKeyDown}
          placeholder="Messaggio..."
          style={{
            flex: 1, resize: 'none', border: '1px solid var(--line)', borderRadius: '10px',
            padding: '8px 10px', fontSize: '12px', background: 'var(--panel)', color: 'var(--text)',
            height: '36px', outline: 'none', fontFamily: 'inherit',
          }}
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
            background: input.trim() ? 'var(--red2)' : 'var(--line)',
            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <Send className="w-3.5 h-3.5" style={{ color: '#fff' }} />
        </button>
      </div>
    </div>
  )
}
