import { tasks } from '@/data/tasks'
import { events } from '@/data/events'
import { entrate, uscite } from '@/data/amministrazione'
import { workflowsDemo } from '@/data/workflow'
import type { Task } from '@/data/tasks'
import type { Event } from '@/data/events'

export const STORAGE_KEYS = {
  tasks: 'cal_tasks',
  events: 'cal_events',
  workflows: 'simmetria_workflows',
  entrate: 'simmetria_entrate',
  uscite: 'simmetria_uscite',
  settings: 'simmetria_settings',
  user: 'simmetria_user',
  flyHistory: 'fly_history',
} as const

function safeRead<T>(key: string, fallback: T): T {
  try {
    const r = localStorage.getItem(key)
    return r ? JSON.parse(r) : fallback
  } catch {
    return fallback
  }
}

export function loadTasksFromStorage(): Task[] {
  return safeRead(STORAGE_KEYS.tasks, tasks)
}

export function loadEventsFromStorage(): Event[] {
  return safeRead(STORAGE_KEYS.events, events)
}

export function loadWorkflowsFromStorage() {
  return safeRead(STORAGE_KEYS.workflows, workflowsDemo)
}

export function loadEntrateFromStorage() {
  return safeRead(STORAGE_KEYS.entrate, entrate)
}

export function loadUsciteFromStorage() {
  return safeRead(STORAGE_KEYS.uscite, uscite)
}
