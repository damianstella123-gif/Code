import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'

export function getVisibleEvents(_ruolo: string, _userId: string, allEvents: Event[]): Event[] {
  return allEvents
}

export function getVisibleTasks(_ruolo: string, _userId: string, allTasks: Task[]): Task[] {
  return allTasks
}
