export interface ProgramEntry {
  id: string
  supplier_id: string
  titolo: string
  categoria: string
  data: string
  data_fine?: string | null
  ora_inizio: string
  ora_fine: string | null
  luogo: string
  note: string
  pax?: number | null
  servizio?: string
  manual?: boolean
}

export interface ManualProgramRow {
  id: string
  event_id: string
  supplier_id: string | null
  titolo: string
  categoria: string
  data: string
  data_fine: string | null
  ora_inizio: string
  ora_fine: string | null
  luogo: string
  note: string
  pax: number | null
  servizio: string
}

export const PROGRAM_CATEGORIES = [
  'Hotel', 'Meeting', 'F&B', 'Ristorante', 'Catering', 'Transfer',
  'Experience', 'Audio Video', 'Allestimenti', 'Staff', 'Grafica/Stampa', 'Varie', 'Altro',
]
