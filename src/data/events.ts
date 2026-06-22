export interface Event {
  id: string
  nome: string
  descrizione: string
  cliente: string
  dataInizio: string
  dataFine: string
  location: string
  budget: number
  ricavo_cliente: number | null
  stato: 'bozza' | 'pianificazione' | 'in_corso' | 'completato'
  partecipanti: number
  responsabile: string
  team: string[]
}

export const events: Event[] = [
  {
    id: 'evt_001',
    nome: 'Corporate Summit 2026',
    descrizione: 'Conferenza aziendale annuale con oltre 500 partecipanti',
    cliente: 'cli_001',
    dataInizio: '2026-06-15',
    dataFine: '2026-06-17',
    location: 'MiCo Milano Convention Center',
    budget: 150000,
    ricavo_cliente: null,
    stato: 'in_corso',
    partecipanti: 520,
    responsabile: 'usr_003',
    team: ['usr_003', 'usr_006', 'usr_007'],
  },
  {
    id: 'evt_002',
    nome: 'Lancio Prodotto TechVision',
    descrizione: 'Evento di presentazione nuovo prodotto innovativo',
    cliente: 'cli_002',
    dataInizio: '2026-07-10',
    dataFine: '2026-07-10',
    location: 'Spazio A3, Roma',
    budget: 45000,
    ricavo_cliente: null,
    stato: 'pianificazione',
    partecipanti: 150,
    responsabile: 'usr_002',
    team: ['usr_002', 'usr_006', 'usr_010'],
  },
  {
    id: 'evt_003',
    nome: 'Festival Food & Wine',
    descrizione: 'Festival gastronomico all\'aperto con degustazioni e show cooking',
    cliente: 'cli_003',
    dataInizio: '2026-08-22',
    dataFine: '2026-08-24',
    location: 'Villa Reale, Monza',
    budget: 85000,
    ricavo_cliente: null,
    stato: 'pianificazione',
    partecipanti: 2000,
    responsabile: 'usr_003',
    team: ['usr_003', 'usr_006', 'usr_007', 'usr_009'],
  },
  {
    id: 'evt_004',
    nome: 'Team Building Ecosistema',
    descrizione: 'Giornata di team building aziendale in natura',
    cliente: 'cli_004',
    dataInizio: '2026-05-20',
    dataFine: '2026-05-20',
    location: 'Parco Naturale Laghi, Varese',
    budget: 22000,
    ricavo_cliente: null,
    stato: 'completato',
    partecipanti: 85,
    responsabile: 'usr_012',
    team: ['usr_012', 'usr_006'],
  },
  {
    id: 'evt_005',
    nome: 'Gala di Beneficenza Hope',
    descrizione: 'Serata benefica con asta e intrattenimento',
    cliente: 'cli_005',
    dataInizio: '2026-12-05',
    dataFine: '2026-12-05',
    location: 'Palazzo delle Stelline, Milano',
    budget: 120000,
    ricavo_cliente: null,
    stato: 'bozza',
    partecipanti: 300,
    responsabile: 'usr_002',
    team: ['usr_002', 'usr_003', 'usr_005', 'usr_009'],
  },
]
