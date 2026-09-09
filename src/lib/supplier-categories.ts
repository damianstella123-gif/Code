import { supabase } from './supabase'

export interface SupplierCategory {
  key: string
  label: string
  budget_key: string
  budget_label: string
  color: string
  icon: string
  sort_order: number
}

let cached: SupplierCategory[] | null = null
let fetchPromise: Promise<SupplierCategory[]> | null = null

const FALLBACK: SupplierCategory[] = [
  { key: 'hotel', label: 'Hotel', budget_key: 'HOTEL', budget_label: 'HOTEL', color: '#e02040', icon: 'bed', sort_order: 1 },
  { key: 'transfer', label: 'Transfer', budget_key: 'TRANSFER', budget_label: 'TRANSFER', color: '#2f6fbe', icon: 'bus', sort_order: 2 },
  { key: 'ristorante', label: 'Ristorante', budget_key: 'RISTORANTE', budget_label: 'RISTORANTE', color: '#2f9e68', icon: 'utensils', sort_order: 3 },
  { key: 'experience', label: 'Location / Experience', budget_key: 'LOCATION / EXPERIENCE', budget_label: 'LOCATION / EXPERIENCE', color: '#7B3FE4', icon: 'building', sort_order: 4 },
  { key: 'catering', label: 'Catering', budget_key: 'CATERING', budget_label: 'CATERING', color: '#12a594', icon: 'chef', sort_order: 5 },
  { key: 'audio_video', label: 'Audio Video', budget_key: 'AUDIO VIDEO', budget_label: 'AUDIO VIDEO', color: '#c98920', icon: 'speaker', sort_order: 6 },
  { key: 'allestimenti', label: 'Allestimenti', budget_key: 'ALLESTIMENTI', budget_label: 'ALLESTIMENTI', color: '#e8590c', icon: 'sparkles', sort_order: 7 },
  { key: 'staff_interno', label: 'Staff Simmetria', budget_key: 'STAFF', budget_label: 'STAFF', color: '#0d9488', icon: 'users', sort_order: 8 },
  { key: 'staff_esterno', label: 'Staff Esterno', budget_key: 'STAFF', budget_label: 'STAFF', color: '#0d9488', icon: 'users', sort_order: 9 },
  { key: 'grafica_stampa', label: 'Grafica / Stampa', budget_key: 'GRAFICA', budget_label: 'GRAFICA', color: '#c026d3', icon: 'gift', sort_order: 10 },
  { key: 'assicurazioni', label: 'Assicurazioni', budget_key: 'VARIE', budget_label: 'VARIE', color: '#64748b', icon: 'shield', sort_order: 11 },
  { key: 'agenzia_viaggi', label: 'Agenzia di Viaggi', budget_key: 'VARIE', budget_label: 'VARIE', color: '#0891b2', icon: 'plane', sort_order: 12 },
  { key: 'gadget', label: 'Gadget', budget_key: 'VARIE', budget_label: 'VARIE', color: '#c026d3', icon: 'gift', sort_order: 13 },
  { key: 'dmc', label: 'DMC', budget_key: 'LOCATION / EXPERIENCE', budget_label: 'LOCATION / EXPERIENCE', color: '#475569', icon: 'globe', sort_order: 14 },
  { key: 'varie', label: 'Varie', budget_key: 'VARIE', budget_label: 'VARIE', color: '#5f666d', icon: 'dot', sort_order: 15 },
]

const DEFAULT_CAT = { label: '', color: '#5f666d', icon: 'dot', sort_order: 999 }

export async function fetchSupplierCategories(): Promise<SupplierCategory[]> {
  if (cached) return cached
  if (!fetchPromise) {
    fetchPromise = (async () => {
      const { data, error } = await supabase
        .from('supplier_categories')
        .select('key, label, budget_key, budget_label, color, icon, sort_order')
        .eq('attivo', true)
        .order('sort_order')
      if (error || !data?.length) {
        cached = FALLBACK
      } else {
        cached = data as SupplierCategory[]
      }
      return cached
    })()
  }
  return fetchPromise
}

export function getCachedCategories(): SupplierCategory[] {
  return cached ?? FALLBACK
}

export function categoryByKey(key: string): SupplierCategory & { color: string; icon: string } {
  const cats = cached ?? FALLBACK
  return cats.find(c => c.key === key) ?? { ...DEFAULT_CAT, key, label: key, budget_key: 'VARIE', budget_label: 'VARIE' }
}

export function categoryByLabel(label: string): { label: string; color: string; icon: string } {
  const cats = cached ?? FALLBACK
  return cats.find(c => c.label === label) ?? { label, color: '#5f666d', icon: 'dot' }
}
