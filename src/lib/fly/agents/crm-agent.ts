import { supabase } from '@/lib/supabase'
import type { Agent, AgentResponse, FlyContext } from '../types'

export const crmAgent: Agent = {
  id: 'crm',
  name: 'CRM Agent',
  description: 'Analizza clienti, referenti e storico',
  keywords: /client[ei]|crm|referent|prospect|vip|contratt[oi]|fatturato|portfolio|aziend/i,

  async handle(query: string, context: FlyContext): Promise<AgentResponse> {
    const q = query.toLowerCase()

    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .limit(100)

    const { data: referenti } = await supabase
      .from('referenti')
      .select('*')
      .limit(200)

    const allClients = clients ?? []
    const allReferenti = referenti ?? []

    if (context.clientId) {
      const client = allClients.find((c: Record<string, unknown>) => c.id === context.clientId)
      const clientRefs = allReferenti.filter((r: Record<string, unknown>) => r.client_id === context.clientId)

      if (client) {
        const nome = (client.nome as string) || 'Cliente'
        const stato = (client.stato as string) || 'n/d'
        const fatturato = (client.fatturato as number) || 0

        if (/referent|contatt/i.test(q)) {
          if (clientRefs.length === 0) {
            return { agent: 'crm', text: `${nome} non ha referenti registrati. Suggerisco di aggiungerne almeno uno per gestire le comunicazioni.`, chips: ['Panoramica cliente', 'Info mancanti'] }
          }
          const list = clientRefs.map((r: Record<string, unknown>) => `- ${r.nome} ${r.cognome} (${r.ruolo || 'ruolo n/d'})`).join('\n')
          return { agent: 'crm', text: `Referenti di ${nome}:\n\n${list}`, chips: ['Fatturato cliente', 'Eventi del cliente'] }
        }

        if (/manc|incomplet|info.*mancant/i.test(q)) {
          const missing: string[] = []
          if (!client.email) missing.push('Email aziendale')
          if (!client.telefono) missing.push('Telefono')
          if (!client.piva) missing.push('P.IVA')
          if (!client.indirizzo) missing.push('Indirizzo sede')
          if (clientRefs.length === 0) missing.push('Referenti')
          if (missing.length === 0) {
            return { agent: 'crm', text: `${nome} ha tutte le informazioni principali compilate.`, chips: ['Fatturato', 'Referenti'] }
          }
          return { agent: 'crm', text: `Informazioni mancanti per ${nome}:\n\n${missing.map(m => `- ${m}`).join('\n')}\n\nCompletare questi dati migliora la gestione operativa.`, chips: ['Referenti', 'Panoramica cliente'] }
        }

        return {
          agent: 'crm',
          text: `Cliente: ${nome}\nStato: ${stato}\nFatturato: \u20AC${fatturato.toLocaleString('it-IT')}\nReferenti: ${clientRefs.length}`,
          chips: ['Referenti', 'Info mancanti', 'Eventi del cliente'],
        }
      }
    }

    // General CRM analysis
    const vip = allClients.filter((c: Record<string, unknown>) => c.stato === 'vip')
    const prospect = allClients.filter((c: Record<string, unknown>) => c.stato === 'prospect')
    const attivi = allClients.filter((c: Record<string, unknown>) => c.stato === 'attivo')

    if (/prospect|potenzial|nuov/i.test(q)) {
      if (prospect.length === 0) {
        return { agent: 'crm', text: 'Nessun prospect in pipeline al momento.', chips: ['Tutti i clienti', 'Clienti VIP'] }
      }
      const list = prospect.slice(0, 5).map((c: Record<string, unknown>) => `- ${c.nome}`).join('\n')
      return { agent: 'crm', text: `${prospect.length} prospect in pipeline:\n\n${list}`, chips: ['Clienti VIP', 'Panoramica CRM'] }
    }

    return {
      agent: 'crm',
      text: `Panoramica CRM:\n\n- VIP: ${vip.length}\n- Attivi: ${attivi.length}\n- Prospect: ${prospect.length}\n- Totale clienti: ${allClients.length}\n- Referenti registrati: ${allReferenti.length}`,
      chips: ['Prospect', 'Clienti VIP', 'Info mancanti'],
    }
  },
}
