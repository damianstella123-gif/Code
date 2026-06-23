export type AgentId = 'crm' | 'event' | 'budget' | 'supplier' | 'workflow'

export interface FlyContext {
  page: string
  eventId?: string
  clientId?: string
  supplierId?: string
}

export interface AgentResponse {
  agent: AgentId
  text: string
  chips?: string[]
  data?: Record<string, unknown>
}

export interface Agent {
  id: AgentId
  name: string
  description: string
  keywords: RegExp
  handle(query: string, context: FlyContext): Promise<AgentResponse>
}
