import type { CategoryType } from '@/components/TabOperativo'

export const SVC_CATEGORIES = [
  { value: 'transfer', label: 'Transfer' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'ristorante', label: 'Ristorante' },
  { value: 'location', label: 'Location' },
  { value: 'allestimento', label: 'Allestimento' },
  { value: 'audiovideo', label: 'Audio Video' },
  { value: 'hostess', label: 'Hostess' },
  { value: 'staff', label: 'Staff' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'altro', label: 'Altro' },
]

export interface SupplierService {
  id: string
  event_id: string
  supplier_id: string
  titolo: string
  categoria: string
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  luogo: string
  partenza: string
  destinazione: string
  note: string
  costo_unitario: number | null
  quantita: number | null
  costo_totale: number | null
  venduto_unitario: number | null
  venduto_totale: number | null
}

export const HOTEL_TIPOS = [
  { value: 'pernottamento', label: 'Pernottamento' },
  { value: 'meeting_room', label: 'Sala Meeting' },
  { value: 'breakout_room', label: 'Breakout Room' },
  { value: 'sala_regia', label: 'Sala Regia' },
  { value: 'welcome_coffee', label: 'Welcome Coffee' },
  { value: 'coffee_break', label: 'Coffee Break' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'cocktail', label: 'Cocktail' },
  { value: 'aperitivo', label: 'Aperitivo' },
  { value: 'aperitivo_rinforzato', label: 'Aperitivo Rinforzato' },
  { value: 'open_bar', label: 'Open Bar' },
  { value: 'hospitality_desk', label: 'Hospitality Desk' },
  { value: 'parking', label: 'Parcheggio' },
  { value: 'deposito_bagagli', label: 'Deposito Bagagli' },
  { value: 'city_tax', label: 'City Tax' },
  { value: 'altro', label: 'Altro' },
]

export interface HotelDetail {
  id: string
  event_id: string
  supplier_id: string
  tipo: string
  sotto_categoria: string
  titolo: string
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  check_in_date: string | null
  check_in_time: string | null
  check_out_date: string | null
  check_out_time: string | null
  luogo: string
  quantita: number | null
  note: string
  room_type: string
  meeting_pax: number | null
  meeting_setup: string
  meeting_equipment: string
  natural_light: boolean
  costo_unitario: number | null
  costo_totale: number | null
  venduto_unitario: number | null
  venduto_totale: number | null
}

export interface RestaurantDetail {
  id: string
  event_id: string
  supplier_id: string
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  pax_previsti: number | null
  pax_confermati: number | null
  tipologia_servizio: string
  menu_portate: string
  menu_descrizione: string
  budget_per_persona: number | null
  budget_totale: number | null
  costo_per_persona: number | null
  costo_totale_reale: number | null
  area_riservata: boolean
  sala_privata: boolean
  esclusiva_parziale: boolean
  esclusiva_totale: boolean
  nome_sala: string
  note_location: string
  num_vegetariani: number | null
  num_vegani: number | null
  allergie: string
  intolleranze: string
  note_alimentari: string
  setup_tavoli: string
  branding_cliente: string
  richieste_speciali: string
  note_operative: string
}

export interface ExperienceDetail {
  id: string
  event_id: string
  supplier_id: string | null
  nome_attivita: string
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  pax: number | null
  durata_minuti: number | null
  location: string
  note_operative: string
  venduto_unitario: number | null
  venduto_totale: number | null
  costo_unitario: number | null
  costo_totale: number | null
}

export interface CateringDetail {
  id: string
  event_id: string
  supplier_id: string | null
  tipologia: string
  data: string | null
  ora: string | null
  ora_inizio: string | null
  ora_fine: string | null
  pax: number | null
  note: string
  venduto_per_persona: number | null
  venduto_totale: number | null
  costo_per_persona: number | null
  costo_totale: number | null
}

export interface StaffInternoDetail {
  id: string
  event_id: string
  profile_id: string | null
  supplier_id: string | null
  risorsa: string
  ruolo: string
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  note: string
  note_operative: string
  venduto_totale: number | null
  costo_giornaliero: number | null
  costo_totale: number | null
}

export interface StaffEsternoDetail {
  id: string
  event_id: string
  supplier_id: string | null
  ruolo: string
  quantita: number
  data: string | null
  ora_inizio: string | null
  ora_fine: string | null
  lingue: string
  abbigliamento: string
  note: string
  note_operative: string
  venduto_unitario: number | null
  venduto_totale: number | null
  costo_unitario: number | null
  costo_totale: number | null
}

export interface VarieDetail {
  id: string
  event_id: string
  supplier_id: string | null
  descrizione: string
  quantita: number
  note: string
  data: string | null
  ora_inizio: string | null
  note_operative: string
  venduto_unitario: number | null
  venduto_totale: number | null
  costo_unitario: number | null
  costo_totale: number | null
}

export const LINK_CATEGORIES: { value: CategoryType; label: string }[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'ristorante', label: 'Ristorante' },
  { value: 'experience', label: 'Location / Attivita' },
  { value: 'catering', label: 'Catering' },
  { value: 'audio_video', label: 'Audio Video' },
  { value: 'allestimenti', label: 'Allestimenti' },
  { value: 'staff_interno', label: 'Staff Simmetria' },
  { value: 'staff_esterno', label: 'Staff Esterno' },
  { value: 'grafica_stampa', label: 'Grafica / Stampa' },
  { value: 'varie', label: 'Varie' },
]

export const STATO_CONFERMA_CONFIG = {
  richiesto: { label: 'Richiesto', color: 'var(--yellow)', bg: 'color-mix(in srgb, var(--yellow) 12%, transparent)', border: 'var(--yellow)' },
  confermato: { label: 'Confermato', color: 'var(--blue)', bg: 'color-mix(in srgb, var(--blue) 12%, transparent)', border: 'var(--blue)' },
  contrattualizzato: { label: 'Contrattualizzato', color: 'var(--green)', bg: 'color-mix(in srgb, var(--green) 12%, transparent)', border: 'var(--green)' },
} as const
