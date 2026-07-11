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

const PRIORITY: Record<string, number> = {
  'leave_request': 1,
  'payment_approval': 1,
  'sentinel_critical': 1,
  'task_scaduto': 2,
  'leave_approved': 2,
  'payment_approved': 2,
  'morning_edition': 3,
  'leave_reminder': 3,
  'chat_message': 4,
}

export function getNotificationPriority(type: string): number {
  return PRIORITY[type] ?? 5
}

export function isCriticalNotification(type: string): boolean {
  return (PRIORITY[type] ?? 5) === 1
}

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('is_read', false)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) {
    logError('notifications-service', 'fetchNotifications', error)
    throw new Error(error.message)
  }
  const notifications = (data ?? []) as Notification[]
  notifications.sort((a, b) => {
    const pa = PRIORITY[a.type] ?? 5
    const pb = PRIORITY[b.type] ?? 5
    if (pa !== pb) return pa - pb
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  return notifications
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

export async function archiveOldNotifications(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  if (error) {
    logError('notifications-service', 'archiveOldNotifications', error)
  }
}
