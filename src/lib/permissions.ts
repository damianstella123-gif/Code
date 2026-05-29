import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'

export function getVisibleEvents(ruolo: string, userId: string, allEvents: Event[]): Event[] {
  if (ruolo === 'Admin' || ruolo === 'Finance') return allEvents
  if (ruolo === 'Manager' || ruolo === 'Commerciale')
    return allEvents.filter(e => e.responsabile === userId || e.team.includes(userId))
  if (ruolo === 'Operativo') return allEvents.filter(e => e.team.includes(userId))
  return []
}

export function getVisibleTasks(ruolo: string, userId: string, allTasks: Task[]): Task[] {
  if (ruolo === 'Admin' || ruolo === 'Manager') return allTasks
  if (ruolo === 'Finance') return allTasks.filter(t => !t.evento)
  return allTasks.filter(t => t.assegnatario === userId)
}
