import type { Task } from '@/data/tasks'
import type { Event } from '@/data/events'
import type { Pratica } from '@/data/pratiche'
import type { Client } from '@/data/clients'
import type { EventoWorkflow } from '@/data/workflow'
import type { Entrata, Uscita } from '@/data/amministrazione'

export const STORAGE_KEYS = {
  tasks: 'cal_tasks',
  events: 'cal_events',
  pratiche: 'simmetria_pratiche',
  workflows: 'simmetria_workflows',
  entrate: 'simmetria_entrate',
  uscite: 'simmetria_uscite',
  clients: 'simmetria_clients',
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
  return safeRead(STORAGE_KEYS.tasks, [])
}

export function cacheTasksSnapshot(list: Task[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(list))
  } catch { /* ignore */ }
}

export function loadEventsFromStorage(): Event[] {
  return safeRead(STORAGE_KEYS.events, [])
}

export function cacheEventsSnapshot(list: Event[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(list))
  } catch { /* ignore */ }
}

export function loadWorkflowsFromStorage(): EventoWorkflow[] {
  return safeRead(STORAGE_KEYS.workflows, [])
}

export function loadEntrateFromStorage(): Entrata[] {
  return safeRead(STORAGE_KEYS.entrate, [])
}

export function loadUsciteFromStorage(): Uscita[] {
  return safeRead(STORAGE_KEYS.uscite, [])
}

export function loadPraticheFromStorage(): Pratica[] {
  return safeRead(STORAGE_KEYS.pratiche, [])
}

export function cachePraticheSnapshot(list: Pratica[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.pratiche, JSON.stringify(list))
  } catch { /* ignore */ }
}

export function loadClientsFromStorage(): Client[] {
  return safeRead(STORAGE_KEYS.clients, [])
}

export function cacheClientsSnapshot(list: Client[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.clients, JSON.stringify(list))
  } catch { /* ignore */ }
}
