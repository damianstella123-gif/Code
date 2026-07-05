import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Send, Check, CheckCheck } from 'lucide-react'
import { useChatNotifications } from '@/lib/chat-notifications'
import { fetchMessages, sendMessage, markMessagesRead, type ChatMessage } from '@/lib/chat-service'
import { loadUser } from '@/lib/auth'
import type { Profile } from '@/lib/profiles'

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

export default function PinnedChats() {
  const { unread } = useChatNotifications()
  const [openConvId, setOpenConvId] = useState<string | null>(null)
  const navigate = useNavigate()
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

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

  if (pinnedConvs.length === 0) return null

  const user = loadUser()
  if (!user) return null

  function handleBubbleClick(convId: string) {
    if (isMobile) {
      navigate(`/comunicazioni`)
    } else {
      setOpenConvId(prev => prev === convId ? null : convId)
    }
  }

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 45,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px',
      pointerEvents: 'none',
    }}>
      {openConvId && !isMobile && (
        <MiniChatWindow
          conversationId={openConvId}
          conversations={unread.conversations}
          profileMap={profileMap}
          currentUserId={user.id}
          unreadByConv={unread.byConversation}
          onClose={() => setOpenConvId(null)}
        />
      )}
      <div style={{ display: 'flex', gap: '8px', pointerEvents: 'auto' }}>
        {pinnedConvs.map(conv => {
          const unreadCount = unread.byConversation.get(conv.id) ?? 0
          const convName = conv.title ?? conv.participant_ids.filter(id => id !== user.id).map(id => getInitials(profileMap.get(id), id)).join('')
          const initial = conv.is_group ? (conv.title?.[0]?.toUpperCase() ?? 'G') : getInitials(profileMap.get(conv.participant_ids.find(id => id !== user.id) ?? ''))
          return (
            <button
              key={conv.id}
              onClick={() => handleBubbleClick(conv.id)}
              title={conv.title ?? convName}
              style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: openConvId === conv.id ? 'var(--red2)' : 'var(--panel-solid)',
                border: '2px solid var(--line)',
                color: openConvId === conv.id ? '#fff' : 'var(--text)',
                fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', position: 'relative',
                boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                transition: 'all 0.15s ease',
              }}
            >
              {initial}
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  minWidth: '16px', height: '16px', borderRadius: '8px',
                  background: 'var(--red2)', color: '#fff',
                  fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px',
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface MiniChatProps {
  conversationId: string
  conversations: typeof PinnedChats extends never ? never : any[]
  profileMap: Map<string, Profile>
  currentUserId: string
  unreadByConv: Map<string, number>
  onClose: () => void
}

function MiniChatWindow({ conversationId, conversations, profileMap, currentUserId, onClose }: MiniChatProps) {
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

  return (
    <div style={{
      width: '320px', maxHeight: '420px', borderRadius: '14px',
      background: 'var(--panel-solid)', border: '1px solid var(--line)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      pointerEvents: 'auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
          {convName}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '200px', maxHeight: '300px' }}>
        {messages.slice(-30).map(msg => {
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

      {/* Input */}
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
