import { supabase } from './supabase'
import { logError } from './error-log'

export interface GrowthObjective {
  id: string
  area_id: string
  titolo: string
  stato: 'da_iniziare' | 'in_corso' | 'raggiunto'
  fonte: 'manuale' | 'auto_performance'
  creato_da: 'persona' | 'capo'
  created_at: string
  updated_at: string
}

export interface GrowthArea {
  id: string
  person_id: string
  titolo: string
  creato_da: 'persona' | 'capo'
  stato: 'bozza' | 'condiviso'
  created_at: string
  updated_at: string
  growth_objectives: GrowthObjective[]
}

export async function fetchMyGrowthAreas(): Promise<GrowthArea[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('growth_areas')
    .select('*, growth_objectives(*)')
    .eq('person_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    logError('growth-service', 'fetchMyGrowthAreas', error)
    return []
  }
  return (data ?? []) as GrowthArea[]
}

export async function createGrowthArea(titolo: string): Promise<GrowthArea | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('growth_areas')
    .insert({ person_id: user.id, titolo, creato_da: 'persona', stato: 'condiviso' })
    .select('*, growth_objectives(*)')
    .single()

  if (error) {
    logError('growth-service', 'createGrowthArea', error)
    return null
  }
  return data as GrowthArea
}

export async function createGrowthObjective(areaId: string, titolo: string): Promise<GrowthObjective | null> {
  const { data, error } = await supabase
    .from('growth_objectives')
    .insert({ area_id: areaId, titolo, creato_da: 'persona', stato: 'da_iniziare', fonte: 'manuale' })
    .select()
    .single()

  if (error) {
    logError('growth-service', 'createGrowthObjective', error)
    return null
  }
  return data as GrowthObjective
}

export async function updateObjectiveStato(
  objectiveId: string,
  stato: 'da_iniziare' | 'in_corso' | 'raggiunto'
): Promise<boolean> {
  const { error } = await supabase
    .from('growth_objectives')
    .update({ stato })
    .eq('id', objectiveId)

  if (error) {
    logError('growth-service', 'updateObjectiveStato', error)
    return false
  }
  return true
}

export async function deleteGrowthArea(areaId: string): Promise<boolean> {
  const { error } = await supabase
    .from('growth_areas')
    .delete()
    .eq('id', areaId)

  if (error) {
    logError('growth-service', 'deleteGrowthArea', error)
    return false
  }
  return true
}
