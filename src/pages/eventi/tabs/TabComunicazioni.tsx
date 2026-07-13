import { useState, useEffect, useRef, useMemo } from 'react'
import { MessageSquare, Plus, ArrowLeft, Send, X, Search, Lock, Unlock, Users } from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { fetchAllProfiles, type Profile } from '@/lib/profiles'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import {
  createThread,
  addMessageToThread,
  getThreads,
  getThreadMessages,
  getThreadParticipants,
  addParticipant,
  markThreadMessagesRead,
  closeThread,
  reopenThread,
  deleteMessage,
  type ThreadRow,
  type ThreadMessageRow,
  type ThreadParticipant,
} from '@/lib/communications-service'
import type { Event } from '@/data/events'

export function TabComunicazioni({ event }: { event: Event }) {
  const user = loadUser()
  const { showToast } = useToast()
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [showNewThread, setShowNewThread] = useState(false)
  const [filterStato, setFilterStato] = useState<'tutti' | 'aperto' | 'chiuso'>('tutti')
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([getThreads(event.id), fetchAllProfiles()])
      .then(([t, p]) => { setThreads(t); setProfiles(p) })
      .finally(() => setLoading(false))
  }, [event.id])

  // Real-time subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel(`comunicazioni:event:${event.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comunicazioni_messages' },
        (payload) => {
          const newMsg = payload.new as ThreadMessageRow
          if (newMsg.author_id !== user?.id) {
            showToast('Nuovo messaggio in un thread', 'info')
          }
          // Refresh thread list to update last_message_at
          getThreads(event.id).then(setThreads)
        }
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comunicazioni_thread', filter: `event_id=eq.${event.id}` },
        () => { getThreads(event.id).then(setThreads) }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [event.id, user?.id])

  function getProfileName(id: string): string {
    const p = profiles.find(pr => pr.id === id)
    return p ? `${p.first_name} ${p.last_name}` : ''
  }

  function getProfileInitials(id: string): string {
    const p = profiles.find(pr => pr.id === id)
    if (!p) return '?'
    return `${(p.first_name || '')[0] || ''}${(p.last_name || '')[0] || ''}`.toUpperCase()
  }

  const filtered = useMemo(() => {
    let list = threads
    if (filterStato !== 'tutti') list = list.filter(t => t.stato === filterStato)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t => t.titolo.toLowerCase().includes(q))
    }
    return list
  }, [threads, filterStato, search])

  if (activeThreadId) {
    return (
      <ThreadDetail
        threadId={activeThreadId}
        profiles={profiles}
        getProfileName={getProfileName}
        getProfileInitials={getProfileInitials}
        onBack={() => { setActiveThreadId(null); getThreads(event.id).then(setThreads) }}
      />
    )
  }

  if (showNewThread) {
    return (
      <NewThreadForm
        eventId={event.id}
        profiles={profiles}
        onCreated={(t) => { setThreads(prev => [t, ...prev]); setShowNewThread(false) }}
        onCancel={() => setShowNewThread(false)}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-4 h-4" style={{ color: 'var(--blue)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
            {threads.length} thread
          </span>
        </div>
        <button
          onClick={() => setShowNewThread(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all hover:scale-105"
          style={{ fontFamily: 'var(--font-mono)', background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Plus className="w-3.5 h-3.5" /> Nuovo thread
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div style={{ position: 'relative', flex: 1 }}>
          <Search className="w-3.5 h-3.5" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca thread..."
            style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', outline: 'none' }}
          />
        </div>
        <div className="flex gap-1">
          {(['tutti', 'aperto', 'chiuso'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStato(s)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, padding: '5px 10px', borderRadius: 6,
                border: '1px solid var(--line)', cursor: 'pointer',
                background: filterStato === s ? 'var(--blue)' : 'transparent',
                color: filterStato === s ? '#fff' : 'var(--muted)',
              }}
            >
              {s === 'tutti' ? 'Tutti' : s === 'aperto' ? 'Aperti' : 'Chiusi'}
            </button>
          ))}
        </div>
      </div>

      {/* Thread List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="w-2.5 h-2.5 rounded-full animate-pulse mx-auto" style={{ background: 'var(--blue)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p style={{ fontSize: 13 }}>{search ? 'Nessun risultato' : 'Nessun thread per questo evento'}</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>Crea un nuovo thread per avviare una conversazione</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(thread => (
            <ThreadCard
              key={thread.id}
              thread={thread}
              userId={user?.id || ''}
              getProfileName={getProfileName}
              onClick={() => setActiveThreadId(thread.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Thread Card ─────────────────────────────────────────────────────────────

function ThreadCard({ thread, userId, getProfileName, onClick }: {
  thread: ThreadRow
  userId: string
  getProfileName: (id: string) => string
  onClick: () => void
}) {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    supabase.from('comunicazioni_messages')
      .select('id, letto_da, author_id')
      .eq('thread_id', thread.id)
      .then(({ data }) => {
        if (!data) return
        const count = data.filter(m =>
          m.author_id !== userId &&
          !(m.letto_da as string[] || []).includes(userId)
        ).length
        setUnread(count)
      })
  }, [thread.id, userId])

  const priColors: Record<string, string> = { critica: 'var(--red2)', alta: 'var(--yellow)', normale: 'var(--muted)', bassa: 'var(--muted)' }
  const statoLabel = thread.stato === 'chiuso' ? 'Chiuso' : thread.stato === 'archiviato' ? 'Archiviato' : null

  return (
    <button
      onClick={onClick}
      className="w-full text-left transition-all hover:scale-[1.005]"
      style={{ padding: '14px 16px', borderRadius: 10, border: unread > 0 ? '1.5px solid var(--blue)' : '1px solid var(--line)', background: 'var(--panel-solid)', cursor: 'pointer', display: 'block' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {thread.titolo}
            </span>
            {thread.priorita !== 'normale' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '1px 5px', borderRadius: 4, background: `color-mix(in srgb, ${priColors[thread.priorita]} 15%, transparent)`, color: priColors[thread.priorita] }}>
                {thread.priorita}
              </span>
            )}
            {statoLabel && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--panel2)', color: 'var(--muted)' }}>
                {statoLabel}
              </span>
            )}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
            {getProfileName(thread.creato_da)}
            {thread.last_message_at && (
              <> &middot; {new Date(thread.last_message_at).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</>
            )}
          </div>
        </div>
        {unread > 0 && (
          <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'var(--blue)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {unread}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Thread Detail ───────────────────────────────────────────────────────────

function ThreadDetail({ threadId, profiles, getProfileName, getProfileInitials, onBack }: {
  threadId: string
  profiles: Profile[]
  getProfileName: (id: string) => string
  getProfileInitials: (id: string) => string
  onBack: () => void
}) {
  const user = loadUser()
  const [messages, setMessages] = useState<ThreadMessageRow[]>([])
  const [participants, setParticipants] = useState<ThreadParticipant[]>([])
  const [thread, setThread] = useState<ThreadRow | null>(null)
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadThread()
  }, [threadId])

  async function loadThread() {
    const [msgs, parts] = await Promise.all([
      getThreadMessages(threadId),
      getThreadParticipants(threadId),
    ])
    setMessages(msgs)
    setParticipants(parts)
    await markThreadMessagesRead(threadId)

    const { data: t } = await supabase.from('comunicazioni_thread').select('*').eq('id', threadId).maybeSingle()
    if (t) setThread(t as ThreadRow)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Real-time for this thread's messages
  useEffect(() => {
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comunicazioni_messages', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const msg = payload.new as ThreadMessageRow
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          markThreadMessagesRead(threadId)
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comunicazioni_messages', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== (payload.old as any).id))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [threadId])

  async function handleSend() {
    if (!newMsg.trim() || sending) return
    setSending(true)
    const msg = await addMessageToThread(threadId, newMsg.trim())
    if (msg) {
      setMessages(prev => [...prev, msg])
      setNewMsg('')
    }
    setSending(false)
  }

  async function handleClose() {
    if (!thread) return
    if (thread.stato === 'chiuso') {
      await reopenThread(threadId)
      setThread({ ...thread, stato: 'aperto' })
    } else {
      await closeThread(threadId)
      setThread({ ...thread, stato: 'chiuso' })
    }
  }

  async function handleDeleteMsg(msgId: string) {
    await deleteMessage(msgId)
    setMessages(prev => prev.filter(m => m.id !== msgId))
  }

  const isClosed = thread?.stato === 'chiuso'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {thread?.titolo || '...'}
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
            {participants.length} partecipanti &middot; {thread?.stato || 'aperto'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
            title="Partecipanti"
          >
            <Users className="w-4 h-4" />
          </button>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: isClosed ? 'var(--green)' : 'var(--muted)' }}
            title={isClosed ? 'Riapri thread' : 'Chiudi thread'}
          >
            {isClosed ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Participants panel */}
      {showParticipants && (
        <ParticipantsPanel
          threadId={threadId}
          participants={participants}
          profiles={profiles}
          getProfileName={getProfileName}
          onAdded={(p) => setParticipants(prev => [...prev, p])}
          onClose={() => setShowParticipants(false)}
        />
      )}

      {/* Messages */}
      <div style={{ maxHeight: 420, overflowY: 'auto', padding: '4px 0' }} className="space-y-3">
        {messages.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: 30 }}>
            Nessun messaggio ancora. Inizia la conversazione!
          </p>
        ) : messages.map(msg => {
          const isOwn = msg.author_id === user?.id
          return (
            <div key={msg.id} style={{ display: 'flex', gap: 10, flexDirection: isOwn ? 'row-reverse' : 'row' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: isOwn ? 'var(--blue)' : 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: isOwn ? '#fff' : 'var(--text)', fontWeight: 600 }}>
                  {getProfileInitials(msg.author_id)}
                </span>
              </div>
              <div style={{ maxWidth: '75%' }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)', marginBottom: 2, textAlign: isOwn ? 'right' : 'left' }}>
                  {getProfileName(msg.author_id)} &middot; {new Date(msg.created_at).toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                  {msg.edited_at && ' (modificato)'}
                </div>
                <div style={{
                  padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                  background: isOwn ? 'var(--blue)' : 'var(--panel2)',
                  color: isOwn ? '#fff' : 'var(--text)',
                  borderTopRightRadius: isOwn ? 4 : 12,
                  borderTopLeftRadius: isOwn ? 12 : 4,
                }}>
                  {msg.testo}
                </div>
                {isOwn && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
                    <button
                      onClick={() => handleDeleteMsg(msg.id)}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Elimina
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {isClosed ? (
        <div style={{ textAlign: 'center', padding: '12px', borderRadius: 10, background: 'var(--panel2)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
          <Lock className="w-3.5 h-3.5 inline mr-2" style={{ verticalAlign: 'middle' }} />
          Thread chiuso. Riapri per rispondere.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={newMsg}
            onChange={e => setNewMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Scrivi un messaggio..."
            rows={1}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--line)',
              background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)',
              resize: 'none', outline: 'none', minHeight: 40, maxHeight: 120,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!newMsg.trim() || sending}
            style={{
              width: 38, height: 38, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: newMsg.trim() ? 'var(--blue)' : 'var(--panel2)',
              color: newMsg.trim() ? '#fff' : 'var(--muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Participants Panel ──────────────────────────────────────────────────────

function ParticipantsPanel({ threadId, participants, profiles, getProfileName, onAdded, onClose }: {
  threadId: string
  participants: ThreadParticipant[]
  profiles: Profile[]
  getProfileName: (id: string) => string
  onAdded: (p: ThreadParticipant) => void
  onClose: () => void
}) {
  const [addingId, setAddingId] = useState('')
  const participantIds = participants.map(p => p.user_id)
  const available = profiles.filter(p => !participantIds.includes(p.id) && p.is_active)

  async function handleAdd() {
    if (!addingId) return
    await addParticipant(threadId, addingId)
    onAdded({ id: '', thread_id: threadId, user_id: addingId, ruolo: 'partecipante', notifiche_enabled: true })
    setAddingId('')
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Partecipanti</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-1" style={{ marginBottom: 10 }}>
        {participants.map(p => (
          <div key={p.user_id} className="flex items-center gap-2" style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--text)' }}>{getProfileName(p.user_id)}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>({p.ruolo})</span>
          </div>
        ))}
      </div>
      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={addingId}
            onChange={e => setAddingId(e.target.value)}
            style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}
          >
            <option value="">Aggiungi...</option>
            {available.map(p => (
              <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!addingId}
            style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: addingId ? 'var(--blue)' : 'var(--panel2)', color: addingId ? '#fff' : 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer' }}
          >
            Aggiungi
          </button>
        </div>
      )}
    </div>
  )
}

// ─── New Thread Form ─────────────────────────────────────────────────────────

function NewThreadForm({ eventId, profiles, onCreated, onCancel }: {
  eventId: string
  profiles: Profile[]
  onCreated: (t: ThreadRow) => void
  onCancel: () => void
}) {
  const [titolo, setTitolo] = useState('')
  const [priorita, setPriorita] = useState<string>('normale')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const activeProfiles = profiles.filter(p => p.is_active)

  async function handleCreate() {
    if (!titolo.trim()) return
    setCreating(true)
    const thread = await createThread(eventId, titolo.trim(), priorita, selectedIds)
    if (thread) onCreated(thread)
    setCreating(false)
  }

  function toggleParticipant(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Nuovo Thread</p>
      </div>

      <div>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Titolo</label>
        <input
          value={titolo}
          onChange={e => setTitolo(e.target.value)}
          placeholder="Argomento della discussione..."
          autoFocus
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', outline: 'none' }}
        />
      </div>

      <div>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Priorita</label>
        <div className="flex gap-2">
          {(['bassa', 'normale', 'alta', 'critica'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPriorita(p)}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, padding: '5px 10px', borderRadius: 6,
                border: '1px solid var(--line)', cursor: 'pointer',
                background: priorita === p ? (p === 'critica' ? 'var(--red2)' : p === 'alta' ? 'var(--yellow)' : 'var(--blue)') : 'transparent',
                color: priorita === p ? '#fff' : 'var(--muted)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Partecipanti</label>
        <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }} className="space-y-1">
          {activeProfiles.map(p => (
            <label key={p.id} className="flex items-center gap-2 cursor-pointer" style={{ padding: '4px 6px', borderRadius: 4 }}>
              <input
                type="checkbox"
                checked={selectedIds.includes(p.id)}
                onChange={() => toggleParticipant(p.id)}
                style={{ accentColor: 'var(--blue)' }}
              />
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{p.first_name} {p.last_name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{p.role}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={onCancel} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
          Annulla
        </button>
        <button
          onClick={handleCreate}
          disabled={!titolo.trim() || creating}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 16px', borderRadius: 8, border: 'none', background: titolo.trim() ? 'var(--blue)' : 'var(--panel2)', color: titolo.trim() ? '#fff' : 'var(--muted)', cursor: 'pointer' }}
        >
          {creating ? 'Creazione...' : 'Crea Thread'}
        </button>
      </div>
    </div>
  )
}
