import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { loadUser } from '@/lib/auth'

let presenceChannel: RealtimeChannel | null = null

export async function initializePresence() {
  const user = loadUser()
  if (!user) return

  presenceChannel = supabase.channel('online-users', {
    config: {
      presence: { key: user.id }
    }
  })

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      console.log('Presence sync')
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      console.log('User joined:', newPresences)
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      console.log('User left:', leftPresences)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel?.track({
          user_id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          online_at: new Date().toISOString(),
        })
      }
    })
}

export interface OnlineUser {
  user_id: string
  first_name: string
  last_name: string
  online_at: string
}

export function getOnlineUsers(): OnlineUser[] {
  if (!presenceChannel) return []

  const state = presenceChannel.presenceState()
  const users: OnlineUser[] = []
  const seen = new Set<string>()

  for (const key of Object.keys(state)) {
    const presences = state[key] as unknown as OnlineUser[]
    for (const u of presences) {
      if (!seen.has(u.user_id)) {
        seen.add(u.user_id)
        users.push(u)
      }
    }
  }

  return users
}

export function subscribePresence(callback: (users: OnlineUser[]) => void): () => void {
  if (!presenceChannel) return () => {}

  const handler = () => {
    callback(getOnlineUsers())
  }

  presenceChannel.on('presence', { event: 'sync' }, handler)
  return () => {
    presenceChannel?.unsubscribe()
  }
}

export function stopPresence() {
  if (presenceChannel) {
    presenceChannel.unsubscribe()
    presenceChannel = null
  }
}
