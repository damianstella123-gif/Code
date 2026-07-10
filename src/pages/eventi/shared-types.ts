import type { Event } from '@/data/events'

export type StatoEvento = Event['stato']

export type TabId = 'overview' | 'fornitori' | 'budget' | 'pagamenti' | 'comunicazioni' | 'documenti' | 'programma' | 'green' | 'timeline'

export interface InternalUser {
  id: string
  nome: string
  avatar: string
}
