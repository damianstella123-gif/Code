import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { loadUser } from '@/lib/auth'
import { fetchAllProfiles, type Profile } from '@/lib/profiles'
import type { ChatConversation, ChatMessage } from '@/lib/chat-service'

interface UnreadState {
  total: number
  byConversation: Map<string, number>
  pinnedIds: string[]
  conversations: ChatConversation[]
  profiles: Profile[]
}

interface ChatNotificationsContextValue {
  unread: UnreadState
  togglePin: (conversationId: string) => Promise<void>
  refreshUnread: () => void
}

const ChatNotificationsContext = createContext<ChatNotificationsContextValue>({
  unread: { total: 0, byConversation: new Map(), pinnedIds: [], conversations: [], profiles: [] },
  togglePin: async () => {},
  refreshUnread: () => {},
})

export function useChatNotifications() {
  return useContext(ChatNotificationsContext)
}

export function ChatNotificationsProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState<UnreadState>({
    total: 0, byConversation: new Map(), pinnedIds: [], conversations: [], profiles: [],
  })
  const userRef = useRef(loadUser())
  const notifPermAsked = useRef(false)

  const computeUnread = useCallback(async () => {
    const user = loadUser()
    userRef.current = user
    if (!user) return

    const [convsRes, profilesRes, profileData] = await Promise.all([
      supabase.from('chat_conversations').select('*').contains('participant_ids', [user.id]),
      fetchAllProfiles(),
      supabase.from('profiles').select('pinned_conversation_ids').eq('id', user.id).maybeSingle(),
    ])

    const convs = (convsRes.data ?? []) as ChatConversation[]
    const pinned: string[] = (profileData.data?.pinned_conversation_ids as string[]) ?? []

    const convIds = convs.map(c => c.id)
    if (convIds.length === 0) {
      setUnread({ total: 0, byConversation: new Map(), pinnedIds: pinned, conversations: convs, profiles: profilesRes })
      return
    }

    const { data: unreadMsgs } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, sender_id, read_by')
      .in('conversation_id', convIds)
      .not('read_by', 'cs', `{${user.id}}`)
      .neq('sender_id', user.id)

    const byConv = new Map<string, number>()
    let total = 0
    for (const msg of (unreadMsgs ?? [])) {
      const count = (byConv.get(msg.conversation_id) ?? 0) + 1
      byConv.set(msg.conversation_id, count)
      total++
    }

    setUnread({ total, byConversation: byConv, pinnedIds: pinned, conversations: convs, profiles: profilesRes })
  }, [])

  useEffect(() => {
    computeUnread()
  }, [computeUnread])

  useEffect(() => {
    const channel = supabase
      .channel('chat-notif-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload) => {
        const user = userRef.current
        if (!user) return
        const newMsg = payload.new as ChatMessage | undefined
        if (newMsg && newMsg.sender_id !== user.id && !newMsg.read_by.includes(user.id)) {
          computeUnread()
          if (document.hidden && Notification.permission === 'granted') {
            showBrowserNotification(newMsg)
          }
        }
        if (payload.eventType === 'UPDATE') {
          computeUnread()
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [computeUnread])

  function showBrowserNotification(msg: ChatMessage) {
    const profile = unread.profiles.find(p => p.id === msg.sender_id)
    const senderName = profile ? `${profile.first_name} ${profile.last_name}` : 'Nuovo messaggio'
    const n = new Notification(senderName, {
      body: msg.content.slice(0, 80),
      tag: msg.conversation_id,
    })
    n.onclick = () => { window.focus(); n.close() }
  }

  const togglePin = useCallback(async (conversationId: string) => {
    const user = loadUser()
    if (!user) return
    let newPins: string[]
    if (unread.pinnedIds.includes(conversationId)) {
      newPins = unread.pinnedIds.filter(id => id !== conversationId)
    } else {
      newPins = [...unread.pinnedIds, conversationId].slice(-3)
    }
    await supabase.from('profiles').update({ pinned_conversation_ids: newPins }).eq('id', user.id)
    setUnread(prev => ({ ...prev, pinnedIds: newPins }))
  }, [unread.pinnedIds])

  // Browser notification permission request helper (exposed for the Comunicazioni page)
  useEffect(() => {
    if (notifPermAsked.current) return
    notifPermAsked.current = true
  }, [])

  return (
    <ChatNotificationsContext.Provider value={{ unread, togglePin, refreshUnread: computeUnread }}>
      {children}
    </ChatNotificationsContext.Provider>
  )
}
