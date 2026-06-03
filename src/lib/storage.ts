import { tasks } from '@/data/tasks'
import { events } from '@/data/events'
import { pratiche as praticheDemo } from '@/data/pratiche'
import { entrate, uscite } from '@/data/amministrazione'
import { workflowsDemo } from '@/data/workflow'
import type { Task } from '@/data/tasks'
import type { Event } from '@/data/events'
import type { Pratica } from '@/data/pratiche'

export const STORAGE_KEYS = {
  tasks: 'cal_tasks',
  events: 'cal_events',
  pratiche: 'simmetria_pratiche',
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

export function cacheTasksSnapshot(list: Task[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(list))
  } catch {
    // ignore quota errors in demo
  }
}

// Snapshot sincrono degli eventi per i moduli che ancora leggono mock.
// Step 2: la pagina Eventi e' la fonte di verita' Supabase e aggiorna
// questa cache via `cacheEventsSnapshot()` ad ogni fetch / mutazione.
export function loadEventsFromStorage(): Event[] {
  return safeRead(STORAGE_KEYS.events, events)
}

export function cacheEventsSnapshot(list: Event[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(list))
  } catch {
    // ignore quota errors in demo
  }
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

export function loadPraticheFromStorage(): Pratica[] {
  return safeRead(STORAGE_KEYS.pratiche, praticheDemo)
}

export function cachePraticheSnapshot(list: Pratica[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.pratiche, JSON.stringify(list))
  } catch {
    // ignore quota errors in demo
  }
}
