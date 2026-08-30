import type { Event } from '@/data/events'

export type StatoEvento = Event['stato']

export type TabId = 'overview' | 'fornitori' | 'economia' | 'documenti' | 'registrazioni' | 'onsite' | 'comunicazioni' | 'green' | 'safety'

export interface InternalUser {
  id: string
  nome: string
  avatar: string
}
