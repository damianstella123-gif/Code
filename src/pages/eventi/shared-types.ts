import type { Event } from '@/data/events'

export type StatoEvento = Event['stato']

export type TabId = 'overview' | 'fornitori' | 'budget' | 'pagamenti' | 'documenti' | 'registrazioni' | 'onsite' | 'programma' | 'comunicazioni' | 'green'

export interface InternalUser {
  id: string
  nome: string
  avatar: string
}
