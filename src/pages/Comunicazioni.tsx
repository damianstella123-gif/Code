import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ArrowLeft, Send, Check, CheckCheck, MessageSquare, Archive } from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { fetchAllProfiles, type Profile } from '@/lib/profiles'
import {
  fetchConversations,
  fetchMessages,
  sendMessage,
  markMessagesRead,
  createConversation,
  findDirectConversation,
  type ChatConversation,
  type ChatMessage,
} from '@/lib/chat-service'
import { fetchEvents } from '@/lib/events-service'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/data/events'

function formatChatTime(d: string): string {
  const dt = new Date(d)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - dt.getTime()) / 86400000)
  if (diffDays === 0) return dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Ieri'
  if (diffDays < 7) return dt.toLocaleDateString('it-IT', { weekday: 'short' })
  return dt.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

function formatMsgTime(d: string): string {
  return new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function getInitials(profile: Profile | undefined, id?: string): string {
  if (profile) return `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase()
  return (id ?? '??').slice(0, 2).toUpperCase()
}

function getDisplayName(profile: Profile | undefined, id?: string): string {
  if (profile) return `${profile.first_name} ${profile.last_name}`.trim()
  return id ?? 'Utente'
}

export default function Comunicazioni() {
  const currentUser = loadUser()
  const [tab, setTab] = useState<'chat' | 'archive'>('chat')

  if (!currentUser) return null

  if (tab === 'archive') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <button
            onClick={() => setTab('chat')}
            className="wire-tab wire-tab--active"
            style={{ fontSize: '12px' }}
          >
            <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />
            Torna alla Chat
          </button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
            ARCHIVIO MESSAGGI (vecchio sistema)
          </span>
        </div>
        <LegacyArchive />
      </div>
    )
  }

  return <ChatView currentUserId={currentUser.id} onSwitchToArchive={() => setTab('archive')} />
}

// ─── CHAT VIEW ──────────────────────────────────────────────────────────────

interface ChatViewProps {
  currentUserId: string
  onSwitchToArchive: () => void
}

function ChatView({ currentUserId, onSwitchToArchive }: ChatViewProps) {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [searchConv, setSearchConv] = useState('')
  const [msgInput, setMsgInput] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatSearch, setNewChatSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadConversations = useCallback(async () => {
    const convs = await fetchConversations()
    setConversations(convs)
  }, [])

  const loadMessages = useCallback(async (convId: string) => {
    const msgs = await fetchMessages(convId)
    setMessages(msgs)
  }, [])

  useEffect(() => {
    loadConversations()
    fetchAllProfiles().then(setProfiles)
    fetchEvents().then(setEvents)
  }, [loadConversations])

  useEffect(() => {
    if (!activeConvId) return
    loadMessages(activeConvId)
    markMessagesRead(activeConvId, currentUserId)
  }, [activeConvId, currentUserId, loadMessages])

  // Realtime subscriptions
  useEffect(() => {
    let msgChannelId = 0
    const convChannel = supabase
      .channel('chat-convs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => {
        loadConversations()
      })
      .subscribe()

    const msgChannel = supabase
      .channel(`chat-msgs-realtime-${++msgChannelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload) => {
        const newMsg = payload.new as ChatMessage | undefined
        if (newMsg && newMsg.conversation_id === activeConvId) {
          setMessages(prev => {
            if (prev.find(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          if (newMsg.sender_id !== currentUserId) {
            markMessagesRead(activeConvId!, currentUserId)
          }
        }
        loadConversations()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(convChannel)
      supabase.removeChannel(msgChannel)
    }
  }, [activeConvId, currentUserId, loadConversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>()
    profiles.forEach(p => m.set(p.id, p))
    return m
  }, [profiles])

  const eventMap = useMemo(() => {
    const m = new Map<string, Event>()
    events.forEach(e => m.set(e.id, e))
    return m
  }, [events])

  function getConvName(conv: ChatConversation): string {
    if (conv.title) return conv.title
    const others = conv.participant_ids.filter(id => id !== currentUserId)
    return others.map(id => getDisplayName(profileMap.get(id), id)).join(', ') || 'Chat'
  }

  function getConvInitials(conv: ChatConversation): string {
    if (conv.is_group) return conv.title?.[0]?.toUpperCase() ?? 'G'
    const other = conv.participant_ids.find(id => id !== currentUserId)
    return getInitials(other ? profileMap.get(other) : undefined, other)
  }

  function unreadCount(_conv: ChatConversation): number {
    // We track this client-side from messages if active, else from a simple heuristic
    // For now return 0; real unread tracking would need a separate query per conv
    return 0
  }

  const filteredConvs = useMemo(() => {
    if (!searchConv.trim()) return conversations
    const q = searchConv.toLowerCase()
    return conversations.filter(c => {
      const name = getConvName(c).toLowerCase()
      return name.includes(q) || (c.last_message_preview ?? '').toLowerCase().includes(q)
    })
  }, [conversations, searchConv, profileMap, currentUserId])

  async function handleSend() {
    const text = msgInput.trim()
    if (!text || !activeConvId) return
    setMsgInput('')
    if (textareaRef.current) textareaRef.current.style.height = '40px'
    await sendMessage(activeConvId, currentUserId, text)
  }

  async function startDirectChat(targetUserId: string) {
    const existing = await findDirectConversation(currentUserId, targetUserId)
    if (existing) {
      setActiveConvId(existing.id)
    } else {
      const conv = await createConversation([currentUserId, targetUserId])
      if (conv) {
        setConversations(prev => [conv, ...prev])
        setActiveConvId(conv.id)
      }
    }
    setShowNewChat(false)
    setNewChatSearch('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setMsgInput(e.target.value)
    const el = e.target
    el.style.height = '40px'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const activeConv = conversations.find(c => c.id === activeConvId)
  const activeEvent = activeConv?.event_id ? eventMap.get(activeConv.event_id) : undefined

  // Group consecutive messages by sender
  const groupedMessages = useMemo(() => {
    const groups: { senderId: string; messages: ChatMessage[] }[] = []
    messages.forEach(msg => {
      const last = groups[groups.length - 1]
      if (last && last.senderId === msg.sender_id) {
        last.messages.push(msg)
      } else {
        groups.push({ senderId: msg.sender_id, messages: [msg] })
      }
    })
    return groups
  }, [messages])

  const filteredNewChatUsers = useMemo(() => {
    const q = newChatSearch.toLowerCase()
    return profiles
      .filter(p => p.id !== currentUserId && p.is_active)
      .filter(p => !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
  }, [profiles, newChatSearch, currentUserId])

  const allParticipants = activeConv?.participant_ids ?? []

  return (
    <div>
      {/* Top bar with archive link */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span className="wire-masthead-title">COMUNICAZIONI</span>
        <button
          onClick={onSwitchToArchive}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Archive className="w-3.5 h-3.5" /> ARCHIVIO MESSAGGI
        </button>
      </div>

      <div className={`chat-layout ${activeConvId ? 'chat-layout--conv-open' : ''}`}>
        {/* Sidebar */}
        <div className="chat-sidebar">
          <div className="chat-sidebar-header">
            <input
              type="text"
              placeholder="Cerca conversazione..."
              value={searchConv}
              onChange={e => setSearchConv(e.target.value)}
              className="chat-sidebar-search"
            />
            <button
              onClick={() => setShowNewChat(true)}
              style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--red2)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            >
              <Plus className="w-4 h-4" style={{ color: '#fff' }} />
            </button>
          </div>

          {/* New chat user picker */}
          {showNewChat && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.04em' }}>NUOVA CHAT</span>
                <button onClick={() => setShowNewChat(false)} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>CHIUDI</button>
              </div>
              <input
                type="text"
                placeholder="Cerca utente..."
                value={newChatSearch}
                onChange={e => setNewChatSearch(e.target.value)}
                className="chat-sidebar-search"
                style={{ marginBottom: '8px', width: '100%' }}
                autoFocus
              />
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {filteredNewChatUsers.slice(0, 10).map(p => (
                  <button
                    key={p.id}
                    onClick={() => startDirectChat(p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: '6px' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--line)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    <div className="chat-conv-avatar" style={{ width: '32px', height: '32px', fontSize: '11px' }}>
                      {getInitials(p)}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{p.first_name} {p.last_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.email}</div>
                    </div>
                  </button>
                ))}
                {filteredNewChatUsers.length === 0 && (
                  <p style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 0' }}>Nessun utente trovato</p>
                )}
              </div>
            </div>
          )}

          <div className="chat-sidebar-list">
            {filteredConvs.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nessuna conversazione
              </div>
            ) : (
              filteredConvs.map(conv => {
                const unread = unreadCount(conv)
                return (
                  <button
                    key={conv.id}
                    className={`chat-conv-item ${activeConvId === conv.id ? 'chat-conv-item--active' : ''}`}
                    onClick={() => setActiveConvId(conv.id)}
                  >
                    <div className="chat-conv-avatar">{getConvInitials(conv)}</div>
                    <div className="chat-conv-body">
                      <div className="chat-conv-name">{getConvName(conv)}</div>
                      <div className="chat-conv-preview">{conv.last_message_preview ?? 'Nessun messaggio'}</div>
                    </div>
                    <div className="chat-conv-meta">
                      {conv.last_message_at && <span className="chat-conv-time">{formatChatTime(conv.last_message_at)}</span>}
                      {unread > 0 && <span className="chat-conv-badge">{unread}</span>}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Main chat area */}
        <div className="chat-main">
          {!activeConv ? (
            <div className="chat-empty-state">
              <MessageSquare className="w-10 h-10 opacity-20" />
              <span>Seleziona una conversazione o creane una nuova</span>
            </div>
          ) : (
            <>
              <div className="chat-main-header">
                <button className="chat-back-btn" onClick={() => setActiveConvId(null)}>
                  <ArrowLeft className="w-4 h-4" /> Indietro
                </button>
                <div className="chat-conv-avatar" style={{ width: '34px', height: '34px', fontSize: '12px' }}>
                  {getConvInitials(activeConv)}
                </div>
                <div>
                  <div className="chat-main-header-name">{getConvName(activeConv)}</div>
                  {activeEvent && (
                    <span
                      className="chat-main-header-event"
                      onClick={() => navigate(`/eventi?id=${activeEvent.id}`)}
                    >
                      {activeEvent.nome}
                    </span>
                  )}
                </div>
              </div>

              <div className="chat-messages">
                {messages.length === 0 && (
                  <div className="chat-empty-state">
                    <span>Nessun messaggio. Inizia la conversazione!</span>
                  </div>
                )}
                {groupedMessages.map((group, gi) => {
                  const isMine = group.senderId === currentUserId
                  const senderProfile = profileMap.get(group.senderId)
                  return (
                    <div key={gi} className={`chat-bubble-group ${isMine ? 'chat-bubble-group--mine' : 'chat-bubble-group--other'}`}>
                      {!isMine && activeConv.is_group && (
                        <span className="chat-bubble-sender">{getDisplayName(senderProfile, group.senderId)}</span>
                      )}
                      {group.messages.map(msg => {
                        const allRead = allParticipants.every(pid => msg.read_by.includes(pid))
                        return (
                          <div key={msg.id}>
                            <div className={`chat-bubble ${isMine ? 'chat-bubble--mine' : 'chat-bubble--other'}`}>
                              {msg.content}
                            </div>
                            <div className="chat-bubble-time" style={{ justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                              {formatMsgTime(msg.created_at)}
                              {isMine && (
                                allRead
                                  ? <CheckCheck className="w-3 h-3" style={{ color: 'var(--blue)' }} />
                                  : <Check className="w-3 h-3" />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-area">
                <textarea
                  ref={textareaRef}
                  value={msgInput}
                  onChange={handleTextareaInput}
                  onKeyDown={handleKeyDown}
                  placeholder="Scrivi un messaggio..."
                  className="chat-input-textarea"
                  rows={1}
                />
                <button
                  className="chat-send-btn"
                  onClick={handleSend}
                  disabled={!msgInput.trim()}
                >
                  <Send className="w-4 h-4" style={{ color: '#fff' }} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── LEGACY ARCHIVE (old communications system) ─────────────────────────────

function LegacyArchive() {
  const currentUser = loadUser()
  const [msgs, setMsgs] = useState<import('@/data/comunicazioni').Messaggio[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    import('@/lib/communications-service').then(mod => {
      mod.fetchCommunications().then(setMsgs)
    })
  }, [])

  if (!currentUser) return null
  const uid = currentUser.id

  const filtered = msgs.filter(m => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return m.oggetto.toLowerCase().includes(q) || m.corpo.toLowerCase().includes(q) || m.mittente.toLowerCase().includes(q)
  }).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  return (
    <div style={{ maxWidth: '800px' }}>
      <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Search className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
        <input
          type="text"
          placeholder="Cerca nei messaggi archiviati..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent focus:outline-none"
          style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px', border: 'none' }}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="wire-empty">Nessun messaggio archiviato.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map(m => {
            const unread = !m.letto.includes(uid)
            return (
              <div
                key={m.id}
                style={{
                  padding: '12px 16px',
                  background: 'var(--panel-solid)',
                  border: '1px solid var(--line)',
                  borderRadius: '10px',
                  borderLeft: unread ? '3px solid var(--red2)' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{m.oggetto}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>
                    {new Date(m.data).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Da: {m.mittente} — {m.corpo.slice(0, 80)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
