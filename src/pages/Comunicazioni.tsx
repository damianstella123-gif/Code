import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ArrowLeft, Send, Check, CheckCheck, MessageSquare, Archive, Users, X, Pin } from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { fetchAllProfiles, type Profile } from '@/lib/profiles'
import { useChatNotifications } from '@/lib/chat-notifications'
import {
  fetchConversations,
  fetchMessages,
  sendMessage,
  markMessagesRead,
  createConversation,
  findDirectConversation,
  updateConversationParticipants,
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
  const { unread: globalUnread, togglePin, refreshUnread } = useChatNotifications()
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [searchConv, setSearchConv] = useState('')
  const [msgInput, setMsgInput] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [showMembersPanel, setShowMembersPanel] = useState(false)
  const [showNotifBanner, setShowNotifBanner] = useState(false)
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
    // Check if we should show notification permission banner
    const dismissed = localStorage.getItem('chat_notif_dismissed')
    if (!dismissed && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      setShowNotifBanner(true)
    }
  }, [loadConversations])

  useEffect(() => {
    if (!activeConvId) return
    loadMessages(activeConvId)
    markMessagesRead(activeConvId, currentUserId).then(() => refreshUnread())
  }, [activeConvId, currentUserId, loadMessages, refreshUnread])

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
  }

  async function startGroupChat(participantIds: string[], title: string, eventId?: string) {
    const conv = await createConversation(participantIds, title, eventId)
    if (conv) {
      setConversations(prev => [conv, ...prev])
      setActiveConvId(conv.id)
    }
    setShowNewChat(false)
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

  async function handleAddMember(userId: string) {
    if (!activeConv) return
    const newIds = [...activeConv.participant_ids, userId]
    const ok = await updateConversationParticipants(activeConv.id, newIds)
    if (ok) loadConversations()
  }

  async function handleRemoveMember(userId: string) {
    if (!activeConv || userId === currentUserId) return
    const newIds = activeConv.participant_ids.filter(id => id !== userId)
    const ok = await updateConversationParticipants(activeConv.id, newIds)
    if (ok) loadConversations()
  }

  const activeConv = conversations.find(c => c.id === activeConvId)
  const activeEvent = activeConv?.event_id ? eventMap.get(activeConv.event_id) : undefined
  const allParticipants = activeConv?.participant_ids ?? []

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

  return (
    <div>
      {/* Notification permission banner */}
      {showNotifBanner && (
        <div style={{
          marginBottom: '12px', padding: '10px 16px', borderRadius: '10px',
          background: 'var(--panel-solid)', border: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text)' }}>Vuoi ricevere notifiche per i nuovi messaggi?</span>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => {
                Notification.requestPermission()
                setShowNotifBanner(false)
              }}
              style={{
                padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: 'var(--red2)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '10px',
              }}
            >
              ATTIVA
            </button>
            <button
              onClick={() => {
                localStorage.setItem('chat_notif_dismissed', '1')
                setShowNotifBanner(false)
              }}
              style={{
                padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--line)', cursor: 'pointer',
                background: 'none', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '10px',
              }}
            >
              NON ORA
            </button>
          </div>
        </div>
      )}

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

          {showNewChat && (
            <NewChatPanel
              currentUserId={currentUserId}
              profiles={profiles}
              events={events}
              onClose={() => setShowNewChat(false)}
              onStartDirect={startDirectChat}
              onStartGroup={startGroupChat}
            />
          )}

          <div className="chat-sidebar-list">
            {filteredConvs.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nessuna conversazione
              </div>
            ) : (
              filteredConvs.map(conv => {
                const isPinned = globalUnread.pinnedIds.includes(conv.id)
                return (
                  <div key={conv.id} style={{ position: 'relative' }}>
                    <button
                      className={`chat-conv-item ${activeConvId === conv.id ? 'chat-conv-item--active' : ''}`}
                      onClick={() => setActiveConvId(conv.id)}
                    >
                      <div className="chat-conv-avatar" style={{ position: 'relative' }}>
                        {getConvInitials(conv)}
                        {conv.is_group && (
                          <span style={{
                            position: 'absolute', bottom: '-2px', right: '-2px',
                            fontFamily: 'var(--font-mono)', fontSize: '8px', fontWeight: 700,
                            background: 'var(--line)', borderRadius: '6px', padding: '1px 3px',
                            color: 'var(--muted)',
                          }}>
                            {conv.participant_ids.length}
                          </span>
                        )}
                      </div>
                      <div className="chat-conv-body">
                        <div className="chat-conv-name">{getConvName(conv)}</div>
                        <div className="chat-conv-preview">{conv.last_message_preview ?? 'Nessun messaggio'}</div>
                      </div>
                      <div className="chat-conv-meta">
                        {conv.last_message_at && <span className="chat-conv-time">{formatChatTime(conv.last_message_at)}</span>}
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(conv.id) }}
                      title={isPinned ? 'Rimuovi appuntamento' : 'Appunta'}
                      style={{
                        position: 'absolute', top: '8px', right: '8px',
                        background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                        color: isPinned ? 'var(--red2)' : 'var(--muted)',
                        opacity: isPinned ? 1 : 0.4,
                        transition: 'all 0.12s ease',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                      onMouseLeave={e => { if (!isPinned) (e.currentTarget as HTMLButtonElement).style.opacity = '0.4' }}
                    >
                      <Pin className="w-3 h-3" style={{ transform: isPinned ? 'rotate(45deg)' : 'none' }} />
                    </button>
                  </div>
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
                <div style={{ flex: 1, cursor: activeConv.is_group ? 'pointer' : 'default' }} onClick={() => { if (activeConv.is_group) setShowMembersPanel(true) }}>
                  <div className="chat-main-header-name">{getConvName(activeConv)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {activeConv.is_group && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>
                        {activeConv.participant_ids.length} partecipanti
                      </span>
                    )}
                    {activeEvent && (
                      <span
                        className="chat-main-header-event"
                        onClick={(e) => { e.stopPropagation(); navigate(`/eventi?id=${activeEvent.id}`) }}
                      >
                        {activeEvent.nome}
                      </span>
                    )}
                  </div>
                </div>
                {activeConv.is_group && (
                  <button
                    onClick={() => setShowMembersPanel(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px' }}
                  >
                    <Users className="w-4 h-4" />
                  </button>
                )}
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
                        const othersInConv = allParticipants.filter(pid => pid !== msg.sender_id)
                        const allRead = othersInConv.length > 0 && othersInConv.every(pid => msg.read_by.includes(pid))
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

      {/* Members panel overlay */}
      {showMembersPanel && activeConv?.is_group && (
        <MembersPanel
          conversation={activeConv}
          currentUserId={currentUserId}
          profiles={profiles}
          profileMap={profileMap}
          onClose={() => setShowMembersPanel(false)}
          onAddMember={handleAddMember}
          onRemoveMember={handleRemoveMember}
        />
      )}
    </div>
  )
}

// ─── NEW CHAT PANEL ─────────────────────────────────────────────────────────

interface NewChatPanelProps {
  currentUserId: string
  profiles: Profile[]
  events: Event[]
  onClose: () => void
  onStartDirect: (userId: string) => void
  onStartGroup: (participantIds: string[], title: string, eventId?: string) => void
}

function NewChatPanel({ currentUserId, profiles, events, onClose, onStartDirect, onStartGroup }: NewChatPanelProps) {
  const [mode, setMode] = useState<'direct' | 'group'>('direct')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [groupTitle, setGroupTitle] = useState('')
  const [linkedEventId, setLinkedEventId] = useState('')

  const activeUsers = useMemo(() =>
    profiles.filter(p => p.id !== currentUserId && p.is_active),
    [profiles, currentUserId]
  )

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase()
    return activeUsers.filter(p =>
      !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    )
  }, [activeUsers, search])

  function toggleUser(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleEventLink(eventId: string) {
    setLinkedEventId(eventId)
    if (eventId) {
      const ev = events.find(e => e.id === eventId)
      if (ev) {
        if (!groupTitle) setGroupTitle(ev.nome)
        const teamIds = (ev.team ?? []).filter(id => id !== currentUserId)
        if (teamIds.length > 0 && selectedIds.length === 0) {
          setSelectedIds(teamIds)
        }
      }
    }
  }

  function handleCreate() {
    if (mode === 'direct' && selectedIds.length === 1) {
      onStartDirect(selectedIds[0])
    } else if (selectedIds.length >= 1) {
      const allIds = [currentUserId, ...selectedIds]
      const title = groupTitle.trim() || selectedIds.map(id => {
        const p = profiles.find(pr => pr.id === id)
        return p ? p.first_name : id.slice(0, 6)
      }).join(', ')
      onStartGroup(allIds, title, linkedEventId || undefined)
    }
  }

  const canCreate = mode === 'direct'
    ? selectedIds.length === 1
    : selectedIds.length >= 2 && groupTitle.trim().length > 0

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', background: 'var(--panel)', maxHeight: '400px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.04em' }}>NUOVA CHAT</span>
        <button onClick={onClose} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>CHIUDI</button>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        <button
          onClick={() => { setMode('direct'); setSelectedIds([]); setGroupTitle(''); setLinkedEventId('') }}
          style={{
            flex: 1, padding: '6px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase',
            background: mode === 'direct' ? 'var(--red2)' : 'var(--line)',
            color: mode === 'direct' ? '#fff' : 'var(--muted)',
          }}
        >
          Diretta
        </button>
        <button
          onClick={() => { setMode('group'); setSelectedIds([]) }}
          style={{
            flex: 1, padding: '6px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase',
            background: mode === 'group' ? 'var(--red2)' : 'var(--line)',
            color: mode === 'group' ? '#fff' : 'var(--muted)',
          }}
        >
          Gruppo
        </button>
      </div>

      {/* Group-specific fields */}
      {mode === 'group' && (
        <div style={{ marginBottom: '10px' }}>
          <input
            type="text"
            placeholder="Nome del gruppo *"
            value={groupTitle}
            onChange={e => setGroupTitle(e.target.value)}
            className="chat-sidebar-search"
            style={{ width: '100%', marginBottom: '6px' }}
          />
          <select
            value={linkedEventId}
            onChange={e => handleEventLink(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: '8px',
              background: 'var(--panel)', border: '1px solid var(--line)',
              color: linkedEventId ? 'var(--text)' : 'var(--muted)',
              fontFamily: 'var(--font-mono)', fontSize: '11px',
            }}
          >
            <option value="">Collega a un evento (opzionale)</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
          </select>
        </div>
      )}

      {/* Selected users chips */}
      {selectedIds.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
          {selectedIds.map(id => {
            const p = profiles.find(pr => pr.id === id)
            return (
              <span key={id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px', borderRadius: '12px', fontSize: '10px',
                background: 'color-mix(in srgb, var(--red2) 12%, transparent)',
                color: 'var(--red2)', fontFamily: 'var(--font-mono)',
              }}>
                {p ? `${p.first_name} ${p.last_name?.[0]}.` : id.slice(0, 8)}
                <button onClick={() => toggleUser(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red2)', fontSize: '12px', lineHeight: 1, padding: 0 }}>x</button>
              </span>
            )
          })}
        </div>
      )}

      {/* User search */}
      <input
        type="text"
        placeholder="Cerca utente..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="chat-sidebar-search"
        style={{ marginBottom: '8px', width: '100%' }}
        autoFocus
      />

      {/* User list */}
      <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
        {filteredUsers.slice(0, 20).map(p => {
          const isSelected = selectedIds.includes(p.id)
          return (
            <button
              key={p.id}
              onClick={() => {
                if (mode === 'direct') {
                  setSelectedIds([p.id])
                  onStartDirect(p.id)
                } else {
                  toggleUser(p.id)
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                padding: '7px 4px', background: isSelected ? 'color-mix(in srgb, var(--red2) 8%, transparent)' : 'none',
                border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: '6px',
              }}
            >
              {mode === 'group' && (
                <div style={{
                  width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                  border: isSelected ? 'none' : '1.5px solid var(--line)',
                  background: isSelected ? 'var(--red2)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && <Check className="w-2.5 h-2.5" style={{ color: '#fff' }} />}
                </div>
              )}
              <div className="chat-conv-avatar" style={{ width: '28px', height: '28px', fontSize: '10px' }}>
                {getInitials(p)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{p.first_name} {p.last_name}</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email}</div>
              </div>
            </button>
          )
        })}
        {filteredUsers.length === 0 && (
          <p style={{ fontSize: '11px', color: 'var(--muted)', padding: '8px 0' }}>Nessun utente trovato</p>
        )}
      </div>

      {/* Create group button */}
      {mode === 'group' && (
        <button
          onClick={handleCreate}
          disabled={!canCreate}
          style={{
            width: '100%', marginTop: '10px', padding: '8px', borderRadius: '8px',
            background: canCreate ? 'var(--red2)' : 'var(--line)',
            color: canCreate ? '#fff' : 'var(--muted)',
            border: 'none', cursor: canCreate ? 'pointer' : 'default',
            fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
          }}
        >
          CREA GRUPPO ({selectedIds.length} selezionati)
        </button>
      )}
    </div>
  )
}

// ─── MEMBERS PANEL ──────────────────────────────────────────────────────────

interface MembersPanelProps {
  conversation: ChatConversation
  currentUserId: string
  profiles: Profile[]
  profileMap: Map<string, Profile>
  onClose: () => void
  onAddMember: (userId: string) => void
  onRemoveMember: (userId: string) => void
}

function MembersPanel({ conversation, currentUserId, profiles, profileMap, onClose, onAddMember, onRemoveMember }: MembersPanelProps) {
  const [addSearch, setAddSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const members = conversation.participant_ids

  const addableUsers = useMemo(() => {
    const q = addSearch.toLowerCase()
    return profiles
      .filter(p => p.is_active && !members.includes(p.id))
      .filter(p => !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
  }, [profiles, members, addSearch])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '380px', maxHeight: '80vh', overflow: 'hidden',
          background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px',
          display: 'flex', flexDirection: 'column',
        }}
        className="chat-members-panel"
      >
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              {conversation.title ?? 'Gruppo'}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>
              {members.length} PARTECIPANTI
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Member list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
          {members.map(id => {
            const p = profileMap.get(id)
            const isMe = id === currentUserId
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="chat-conv-avatar" style={{ width: '32px', height: '32px', fontSize: '11px' }}>
                  {getInitials(p, id)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                    {getDisplayName(p, id)}
                    {isMe && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', marginLeft: '6px' }}>(tu)</span>}
                  </div>
                  {p && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{p.email}</div>}
                </div>
                {!isMe && (
                  <button
                    onClick={() => onRemoveMember(id)}
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--red2)',
                      background: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    RIMUOVI
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Add member section */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              style={{
                width: '100%', padding: '8px', borderRadius: '8px',
                background: 'var(--panel)', border: '1px solid var(--line)',
                color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              <Plus className="w-3.5 h-3.5" /> AGGIUNGI MEMBRO
            </button>
          ) : (
            <div>
              <input
                type="text"
                placeholder="Cerca utente da aggiungere..."
                value={addSearch}
                onChange={e => setAddSearch(e.target.value)}
                className="chat-sidebar-search"
                style={{ width: '100%', marginBottom: '8px' }}
                autoFocus
              />
              <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                {addableUsers.slice(0, 8).map(p => (
                  <button
                    key={p.id}
                    onClick={() => { onAddMember(p.id); setAddSearch('') }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                      padding: '6px 4px', background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', borderRadius: '6px',
                    }}
                  >
                    <div className="chat-conv-avatar" style={{ width: '26px', height: '26px', fontSize: '9px' }}>
                      {getInitials(p)}
                    </div>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: '12px', color: 'var(--text)' }}>{p.first_name} {p.last_name}</span>
                  </button>
                ))}
                {addableUsers.length === 0 && (
                  <p style={{ fontSize: '10px', color: 'var(--muted)', padding: '4px 0' }}>Nessun utente disponibile</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── LEGACY ARCHIVE ─────────────────────────────────────────────────────────

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
