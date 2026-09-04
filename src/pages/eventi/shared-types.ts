import type { Event } from '@/data/events'

export type StatoEvento = Event['stato']

export type TabId = 'overview' | 'fornitori' | 'task' | 'economia' | 'scambi' | 'registrazioni' | 'onsite' | 'green' | 'safety'

export interface InternalUser {
  id: string
  nome: string
  avatar: string
}
