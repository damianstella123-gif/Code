import { supabase } from './supabase'
import { logError } from './error-log'

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: string
  related_entity_type: string | null
  related_entity_id: string | null
  is_read: boolean
  created_at: string
}

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    logError('notifications-service', 'fetchNotifications', error)
    throw new Error(error.message)
  }
  return (data ?? []) as Notification[]
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) {
    logError('notifications-service', 'fetchUnreadCount', error)
    throw new Error(error.message)
  }
  return count ?? 0
}

export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
  if (error) {
    logError('notifications-service', 'markAsRead', error)
    throw new Error(error.message)
  }
}

export async function markAllAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) {
    logError('notifications-service', 'markAllAsRead', error)
    throw new Error(error.message)
  }
}
