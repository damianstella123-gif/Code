import type { Agent, AgentId, AgentResponse, FlyContext } from './types'
import { getFlyContext } from './context'
import { crmAgent } from './agents/crm-agent'
import { eventAgent } from './agents/event-agent'
import { budgetAgent } from './agents/budget-agent'
import { supplierAgent } from './agents/supplier-agent'
import { workflowAgent } from './agents/workflow-agent'

const agents: Agent[] = [
  crmAgent,
  eventAgent,
  budgetAgent,
  supplierAgent,
  workflowAgent,
]

function detectAgent(query: string, context: FlyContext): Agent {
  const q = query.toLowerCase()

  // Score each agent by keyword match
  let bestAgent: Agent = eventAgent
  let bestScore = 0

  for (const agent of agents) {
    const matches = q.match(agent.keywords)
    const score = matches ? matches.length : 0
    if (score > bestScore) {
      bestScore = score
      bestAgent = agent
    }
  }

  // If no strong keyword match, use context to decide
  if (bestScore === 0) {
    if (context.clientId && !context.eventId) return crmAgent
    if (context.eventId) return eventAgent
    return eventAgent
  }

  return bestAgent
}

function isGreeting(query: string): boolean {
  return /^(ciao|hey|salve|hello|hi|buon|come stai|chi sei|aiuto|help|cosa sai|cosa puoi)/i.test(query.trim())
}

function greetingResponse(context: FlyContext): AgentResponse {
  const contextHint = context.eventId
    ? '\n\nSto guardando il tuo evento aperto. Posso analizzare budget, fornitori, task e programma.'
    : context.clientId
    ? '\n\nSto guardando il cliente selezionato. Posso analizzare referenti, storico e informazioni mancanti.'
    : '\n\nDimmi su cosa concentrarmi: eventi, clienti, budget, fornitori o task.'

  return {
    agent: 'event',
    text: `Sono Fly, il tuo Chief of Staff digitale (e anche Chief Wellness Officer non ufficiale).\n\nHo 5 agenti a disposizione:\n- CRM Agent (clienti e referenti)\n- Event Agent (stato e programma)\n- Budget Agent (margini, fee, costi)\n- Supplier Agent (fornitori e servizi)\n- Workflow Agent (task e scadenze)\n\nE tengo d'occhio anche il tuo benessere — pause, mood, celebrazioni.${contextHint}`,
    chips: context.eventId
      ? ['Info mancanti', 'Budget evento', 'Task aperti', 'Fornitori']
      : context.clientId
      ? ['Info cliente', 'Referenti', 'Fatturato']
      : ['Situazione eventi', 'Task urgenti', 'Budget', 'Come sto?'],
  }
}

export async function flyOrchestrate(query: string): Promise<AgentResponse> {
  const context = getFlyContext()

  if (isGreeting(query)) {
    return greetingResponse(context)
  }

  const agent = detectAgent(query, context)

  try {
    return await agent.handle(query, context)
  } catch (err) {
    console.error(`[Fly] Agent ${agent.id} error:`, err)
    return {
      agent: agent.id,
      text: `Si e verificato un errore durante l'analisi. Riprova tra poco.\n\n(Agent: ${agent.name})`,
      chips: ['Riprova', 'Situazione generale'],
    }
  }
}

export function getAgentLabel(agentId: AgentId): string {
  const labels: Record<AgentId, string> = {
    crm: 'CRM',
    event: 'Evento',
    budget: 'Budget',
    supplier: 'Fornitori',
    workflow: 'Workflow',
  }
  return labels[agentId]
}
