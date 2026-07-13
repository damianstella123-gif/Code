export const EVENT_ROLES = [
  'Responsabile evento',
  'Coordinamento',
  'Regia tecnica',
  'Logistica & Fornitori',
  'Comunicazione & PR',
  'Amministrativo & Budget',
  'On Site',
  'Supervisione',
  'Event Manager',
] as const

export type EventRole = typeof EVENT_ROLES[number]
