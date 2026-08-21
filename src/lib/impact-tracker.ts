import { supabase } from './supabase'
import { loadUser } from './auth'

const WEIGHTS: Record<string, { minuti: number; co2_kg?: number }> = {
  fly_query: { minuti: 7 },
  fly_task_created: { minuti: 4 },
  fly_propose_event: { minuti: 45 },
  calendar_cascade: { minuti: 20 },
  chat_message_sent: { minuti: 2, co2_kg: 0.0004 },
  document_uploaded: { minuti: 1, co2_kg: 0.0048 },
  supplier_found: { minuti: 8 },
  budget_calculated: { minuti: 25 },
}

export async function trackAction(
  actionType: string,
  meta?: { eventId?: string }
): Promise<void> {
  try {
    const w = WEIGHTS[actionType]
    if (!w) return

    const user = loadUser()
    if (!user?.id) return

    const { data: cfg } = await supabase
      .from('impact_roi_config')
      .select('costo_orario_eur')
      .eq('role', user.role || 'User')
      .maybeSingle()

    const costoOrario = cfg?.costo_orario_eur ?? 8.5
    const valoreEur = (w.minuti / 60) * costoOrario

    await supabase.from('impact_actions_log').insert({
      user_id: user.id,
      action_type: actionType,
      minuti_risparmiati: w.minuti,
      valore_eur: valoreEur,
      metadata: meta?.eventId ? { event_id: meta.eventId } : {},
    })

    if (w.co2_kg) {
      await supabase.from('impact_co2_log').insert({
        user_id: user.id,
        event_id: meta?.eventId || null,
        fonte: actionType === 'chat_message_sent' ? 'comunicazione_interna' : 'documento_digitale',
        kg_co2_risparmiati: w.co2_kg,
      })
    }
  } catch {
    // Silent fail
  }
}
