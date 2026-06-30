export type StatoContratto = 'attivo' | 'in_scadenza' | 'scaduto' | 'in_rinnovo' | 'sospeso'

export type SupplierCategory = 'Hotel' | 'Ristorante' | 'Location' | 'Attività' | 'Trasporti' | 'Catering' | 'Audio Video' | 'Allestimenti' | 'Hostess' | 'Entertainment' | 'Fotografia' | 'Video' | 'Sicurezza' | 'Altro'

export const SUPPLIER_CATEGORIES: SupplierCategory[] = [
  'Hotel', 'Ristorante', 'Audio Video', 'Catering', 'Location', 'Trasporti', 'Allestimenti', 'Hostess', 'Entertainment', 'Fotografia', 'Video', 'Sicurezza', 'Altro',
]

export interface Documento {
  id: string
  nome: string
  tipo: 'contratto' | 'preventivo' | 'fattura' | 'certificazione' | 'altro'
  data: string
  dimensione: string
}

export interface Recensione {
  id: string
  eventoId: string
  autoreId: string
  voto: number
  testo: string
  data: string
}

export interface SalaMeeting {
  nome?: string
  mq?: number
  altezza?: number
  teatro?: number
  scuola?: number
  ferro_di_cavallo?: number
  cabaret?: number
  banchetto?: number
  cocktail?: number
  boardroom?: number
  luce_naturale?: boolean
  modulare?: boolean
  divisibile?: boolean
}

export interface SupplierDetails {
  // Hotel MICE
  citta?: string
  catena?: string
  stelle?: number
  numero_camere?: number
  numero_sale_meeting?: number
  capienza_sala_massima?: number
  capienza_totale_meeting?: number
  ristorante_interno?: boolean
  parcheggio?: boolean
  parcheggio_bus?: boolean
  servizi_hotel?: {
    wifi?: boolean
    spa?: boolean
    piscina?: boolean
    palestra?: boolean
    business_center?: boolean
    navetta_aeroporto?: boolean
    colonnine_elettriche?: boolean
    pet_friendly?: boolean
  }
  sale_meeting?: SalaMeeting[]
  contatti?: {
    referente_eventi?: string
    ruolo?: string
    email_eventi?: string
    telefono_eventi?: string
    cellulare_eventi?: string
    sito_eventi?: string
    referente_tecnico?: string
    email_tecnica?: string
    telefono_tecnico?: string
  }
  documenti?: { nome?: string; tipo?: string; url?: string }[]

  // Ristorante
  tipo_cucina?: string
  numero_sale?: number
  capienza_interna?: number
  capienza_esterna?: number
  capienza_totale?: number
  dehors?: boolean
  terrazza?: boolean
  menu_eventi?: boolean
  menu_pdf_url?: string
  adatto_gruppi?: boolean
  adatto_cene_aziendali?: boolean
  adatto_gala?: boolean
  accessibile_disabili?: boolean

  // Audio Video
  audio?: boolean
  video?: boolean
  luci?: boolean
  ledwall?: boolean
  streaming?: boolean
  regia?: boolean
  traduzione_simultanea?: boolean
  palco?: boolean
  microfoni?: boolean
  videoproiettori?: boolean
  tecnici_inclusi?: boolean
  sopralluogo?: boolean
  area_copertura?: string
  magazzino_citta?: string
  disponibilita_nazionale?: boolean
  certificazioni?: string
  note_tecniche?: string

  // Location
  tipo_location?: string
  capienza_massima?: number
  capienza_cena?: number
  capienza_cocktail?: number
  spazi_interni?: boolean
  spazi_esterni?: boolean
  mq_totali?: number
  catering_interno?: boolean
  catering_esclusivo?: boolean
  vincoli_musica?: string
  orario_limite?: string
  planimetrie?: string

  // Catering
  tipologia_servizi?: string
  coffee_break?: boolean
  light_lunch?: boolean
  cena_servita?: boolean
  buffet?: boolean
  cocktail?: boolean
  banqueting?: boolean
  numero_massimo_ospiti?: number
  cucina_interna?: boolean
  attrezzature_incluse?: boolean
  personale_incluso?: boolean
  intolleranze?: boolean
  vegano?: boolean
  vegetariano?: boolean
  kosher?: boolean
  halal?: boolean

  // Generic
  indoor?: boolean
  outdoor?: boolean
  sala_privata?: boolean
  esclusiva?: boolean
  capienza?: number
  coperti_totali?: number
  tipologia_attivita?: string
  durata?: string
  dehor?: boolean
  [key: string]: unknown
}

export interface Supplier {
  id: string
  nome: string
  email: string
  telefono: string
  categoria: string
  referente: string
  referenteTelefono: string
  rating: number
  stato: 'attivo' | 'inattivo'
  statoContratto: StatoContratto
  scadenzaContratto: string
  servizi: string[]
  location: string
  sito: string
  costoMedioPerEvento: number
  costoMinimo: number
  costoMassimo: number
  noteOperative: string
  eventiId: string[]
  documenti: Documento[]
  recensioni: Recensione[]
  piva: string
  logoUrl?: string
  details?: SupplierDetails
  // Geo
  country?: string
  region?: string
  province?: string
  city?: string
  address?: string
  latitude?: number
  longitude?: number
}

export const suppliers: Supplier[] = [
  {
    id: 'sup_001',
    nome: 'AudioVisio Pro',
    email: 'info@audiovisiopro.it',
    telefono: '+39 02 8456 7890',
    categoria: 'Audio/Video',
    referente: 'Andrea Lombardi',
    referenteTelefono: '+39 335 1234567',
    rating: 4.8,
    stato: 'attivo',
    statoContratto: 'attivo',
    scadenzaContratto: '2026-12-31',
    servizi: ['Impianti audio', 'Video proiezione', 'Illuminazione', 'Registrazione'],
    location: 'Milano',
    sito: 'www.audiovisiopro.it',
    costoMedioPerEvento: 14000,
    costoMinimo: 4000,
    costoMassimo: 35000,
    noteOperative: 'Fornitore di fiducia per eventi grandi. Richiede 2 settimane di preavviso per setup completi. Sempre puntuale. Inclusa assistenza tecnica on-site.',
    eventiId: ['evt_001', 'evt_002'],
    documenti: [
      { id: 'doc_001', nome: 'Contratto Quadro 2026', tipo: 'contratto', data: '2026-01-10', dimensione: '245 KB' },
      { id: 'doc_002', nome: 'Preventivo Corporate Summit', tipo: 'preventivo', data: '2026-04-15', dimensione: '180 KB' },
      { id: 'doc_003', nome: 'Certificazione ISO 9001', tipo: 'certificazione', data: '2025-11-01', dimensione: '120 KB' },
    ],
    recensioni: [
      { id: 'rev_001', eventoId: 'evt_001', autoreId: 'usr_003', voto: 5, testo: 'Setup impeccabile, tecnici professionali. Nessun problema durante l\'evento.', data: '2026-06-18' },
      { id: 'rev_002', eventoId: 'evt_002', autoreId: 'usr_002', voto: 4, testo: 'Buon lavoro, piccolo ritardo nel montaggio ma risolto in tempo.', data: '2026-07-11' },
    ],
    piva: '03421890159',
  },
  {
    id: 'sup_002',
    nome: 'Gusto Nobile Catering',
    email: 'eventi@gustonobile.it',
    telefono: '+39 06 5234 5678',
    categoria: 'Catering',
    referente: 'Elena Vitale',
    referenteTelefono: '+39 347 9876543',
    rating: 4.9,
    stato: 'attivo',
    statoContratto: 'attivo',
    scadenzaContratto: '2027-03-31',
    servizi: ['Catering premium', 'Banqueting', 'Aperitivo', 'Menu personalizzati'],
    location: 'Roma',
    sito: 'www.gustonobile.it',
    costoMedioPerEvento: 28000,
    costoMinimo: 5000,
    costoMassimo: 80000,
    noteOperative: 'Eccellenza assoluta per eventi di gala. Flessibili su allergie e diete speciali. Preferiscono briefing 3 settimane prima. HACCP aggiornato.',
    eventiId: ['evt_001', 'evt_002', 'evt_003'],
    documenti: [
      { id: 'doc_010', nome: 'Contratto Partnership 2026-2027', tipo: 'contratto', data: '2026-01-05', dimensione: '312 KB' },
      { id: 'doc_011', nome: 'Certificazione HACCP', tipo: 'certificazione', data: '2026-02-20', dimensione: '95 KB' },
      { id: 'doc_012', nome: 'Preventivo Festival Food & Wine', tipo: 'preventivo', data: '2026-05-18', dimensione: '220 KB' },
      { id: 'doc_013', nome: 'Fattura Team Building', tipo: 'fattura', data: '2026-05-22', dimensione: '140 KB' },
    ],
    recensioni: [
      { id: 'rev_010', eventoId: 'evt_001', autoreId: 'usr_006', voto: 5, testo: 'Qualita eccezionale. Ogni dettaglio curato alla perfezione. I clienti erano entusiasti.', data: '2026-06-18' },
      { id: 'rev_011', eventoId: 'evt_003', autoreId: 'usr_003', voto: 5, testo: 'Perfetti per il festival. Gestione impeccabile di 2000 persone.', data: '2026-08-25' },
    ],
    piva: '09876543214',
  },
  {
    id: 'sup_003',
    nome: 'Fiori & Allestimenti',
    email: 'creazioni@fiorieallestimenti.it',
    telefono: '+39 02 4567 8901',
    categoria: 'Allestimento',
    referente: 'Sofia Carlucci',
    referenteTelefono: '+39 328 4567890',
    rating: 4.7,
    stato: 'attivo',
    statoContratto: 'in_scadenza',
    scadenzaContratto: '2026-06-30',
    servizi: ['Allestimenti floreali', 'Scenografia', 'Arredi', 'Addobbi'],
    location: 'Milano',
    sito: 'www.fiorieallestimenti.it',
    costoMedioPerEvento: 11500,
    costoMinimo: 3000,
    costoMassimo: 25000,
    noteOperative: 'Contratto in scadenza — avviare rinnovo. Ottimi per allestimenti scenografici. Tempi di consegna sempre rispettati. Richiedono sopralluogo anticipato.',
    eventiId: ['evt_001', 'evt_003'],
    documenti: [
      { id: 'doc_020', nome: 'Contratto 2026 (scade 30/06)', tipo: 'contratto', data: '2026-01-15', dimensione: '198 KB' },
      { id: 'doc_021', nome: 'Portfolio allestimenti 2025', tipo: 'altro', data: '2025-12-01', dimensione: '4.2 MB' },
    ],
    recensioni: [
      { id: 'rev_020', eventoId: 'evt_001', autoreId: 'usr_007', voto: 5, testo: 'Scenografia mozzafiato. Ogni ospite ha fatto i complimenti.', data: '2026-06-17' },
    ],
    piva: '04567890123',
  },
  {
    id: 'sup_004',
    nome: 'SecureEvent',
    email: 'operativo@secureevent.it',
    telefono: '+39 06 9876 5432',
    categoria: 'Sicurezza',
    referente: 'Roberto Esposito',
    referenteTelefono: '+39 333 6543210',
    rating: 4.6,
    stato: 'attivo',
    statoContratto: 'attivo',
    scadenzaContratto: '2027-01-31',
    servizi: ['Security', 'Controllo accessi', 'Staff steward', 'Sicurezza VIP'],
    location: 'Roma',
    sito: 'www.secureevent.it',
    costoMedioPerEvento: 9500,
    costoMinimo: 2500,
    costoMassimo: 20000,
    noteOperative: 'Iscritti all\'albo sicurezza. Personale GPDR compliant. Per eventi >500 persone richiede piano sicurezza 30gg prima. Disponibili H24.',
    eventiId: ['evt_003'],
    documenti: [
      { id: 'doc_030', nome: 'Contratto Quadro Sicurezza', tipo: 'contratto', data: '2026-02-01', dimensione: '267 KB' },
      { id: 'doc_031', nome: 'Licenze e autorizzazioni 2026', tipo: 'certificazione', data: '2026-01-20', dimensione: '340 KB' },
    ],
    recensioni: [
      { id: 'rev_030', eventoId: 'evt_003', autoreId: 'usr_007', voto: 4, testo: 'Professionali e discreti. Gestione accessi impeccabile.', data: '2026-08-25' },
    ],
    piva: '11223344556',
  },
  {
    id: 'sup_005',
    nome: 'PhotoElite Studio',
    email: 'bookings@photoelite.it',
    telefono: '+39 055 1234 5678',
    categoria: 'Fotografia',
    referente: 'Massimo Gallerani',
    referenteTelefono: '+39 347 1230987',
    rating: 4.9,
    stato: 'attivo',
    statoContratto: 'attivo',
    scadenzaContratto: '2026-12-31',
    servizi: ['Fotografia evento', 'Video making of', 'Drone', 'Post produzione'],
    location: 'Firenze',
    sito: 'www.photoelite.it',
    costoMedioPerEvento: 3500,
    costoMinimo: 1200,
    costoMassimo: 8000,
    noteOperative: 'I migliori fotografi con cui lavoriamo. Consegna galleria entro 72h. Proprietari del drone autorizzato ENAC. Richiedere disponibilita con 4 settimane anticipo.',
    eventiId: ['evt_001', 'evt_004'],
    documenti: [
      { id: 'doc_040', nome: 'Accordo fotografico 2026', tipo: 'contratto', data: '2026-01-08', dimensione: '155 KB' },
      { id: 'doc_041', nome: 'Autorizzazione drone ENAC', tipo: 'certificazione', data: '2026-03-15', dimensione: '88 KB' },
      { id: 'doc_042', nome: 'Portfolio eventi 2025', tipo: 'altro', data: '2025-11-30', dimensione: '12 MB' },
    ],
    recensioni: [
      { id: 'rev_040', eventoId: 'evt_004', autoreId: 'usr_012', voto: 5, testo: 'Fotografie straordinarie. I partecipanti erano tutti soddisfatti del materiale consegnato.', data: '2026-05-22' },
    ],
    piva: '06543218907',
  },
  {
    id: 'sup_006',
    nome: 'TechConnect',
    email: 'support@techconnect.it',
    telefono: '+39 010 5678 9012',
    categoria: 'Tecnologia',
    referente: 'Davide Piazza',
    referenteTelefono: '+39 338 9012345',
    rating: 4.5,
    stato: 'attivo',
    statoContratto: 'in_rinnovo',
    scadenzaContratto: '2026-07-31',
    servizi: ['WiFi evento', 'Networking', 'Registrazione utenti', 'App evento'],
    location: 'Genova',
    sito: 'www.techconnect.it',
    costoMedioPerEvento: 6500,
    costoMinimo: 1500,
    costoMassimo: 15000,
    noteOperative: 'Contratto in fase di rinnovo. Ottimo per app e registrazioni digitali. Richiede sopralluogo per analisi connettivita. Assistenza tecnica remota inclusa.',
    eventiId: ['evt_005'],
    documenti: [
      { id: 'doc_050', nome: 'Contratto scaduto - rinnovo in corso', tipo: 'contratto', data: '2025-08-01', dimensione: '201 KB' },
      { id: 'doc_051', nome: 'Proposta rinnovo 2026-2027', tipo: 'preventivo', data: '2026-05-10', dimensione: '175 KB' },
    ],
    recensioni: [
      { id: 'rev_050', eventoId: 'evt_005', autoreId: 'usr_005', voto: 4, testo: 'App funzionante e intuitiva. Piccoli bug iniziali risolti rapidamente.', data: '2026-12-06' },
    ],
    piva: '08901234567',
  },
  {
    id: 'sup_007',
    nome: 'TransportEvent',
    email: 'prenotazioni@transportevent.it',
    telefono: '+39 02 8901 2345',
    categoria: 'Trasporti',
    referente: 'Claudia Marinelli',
    referenteTelefono: '+39 339 2345678',
    rating: 4.6,
    stato: 'attivo',
    statoContratto: 'attivo',
    scadenzaContratto: '2026-12-31',
    servizi: ['Transfer VIP', 'Navette', 'Autobus', 'Autovetture prestigio'],
    location: 'Milano',
    sito: 'www.transportevent.it',
    costoMedioPerEvento: 4200,
    costoMinimo: 800,
    costoMassimo: 12000,
    noteOperative: 'Flotta di lusso per transfer VIP. Autisti in divisa. Disponibili nelle province di Milano, Torino, Genova. Assicurazione passeggeri inclusa.',
    eventiId: ['evt_004'],
    documenti: [
      { id: 'doc_060', nome: 'Contratto trasporti 2026', tipo: 'contratto', data: '2026-01-12', dimensione: '189 KB' },
      { id: 'doc_061', nome: 'Polizza assicurativa fleet', tipo: 'certificazione', data: '2026-01-01', dimensione: '420 KB' },
    ],
    recensioni: [
      { id: 'rev_060', eventoId: 'evt_004', autoreId: 'usr_007', voto: 5, testo: 'Puntuali, auto impeccabili. I partecipanti hanno apprezzato molto il servizio.', data: '2026-05-21' },
    ],
    piva: '01234567890',
  },
  {
    id: 'sup_008',
    nome: 'EventSound Masters',
    email: 'sound@eventsoundmasters.it',
    telefono: '+39 06 3456 7890',
    categoria: 'Intrattenimento',
    referente: 'Emanuele Russo',
    referenteTelefono: '+39 346 3456789',
    rating: 4.7,
    stato: 'inattivo',
    statoContratto: 'sospeso',
    scadenzaContratto: '2026-03-31',
    servizi: ['DJ', 'Band live', 'Spettacoli', 'Animazione'],
    location: 'Roma',
    sito: 'www.eventsoundmasters.it',
    costoMedioPerEvento: 7500,
    costoMinimo: 2000,
    costoMassimo: 20000,
    noteOperative: 'ATTENZIONE: contratto sospeso per problemi di disponibilita. Valutiamo riattivazione per Q4 2026. Ultima performance ottima ma comunicazione scarsa.',
    eventiId: ['evt_001'],
    documenti: [
      { id: 'doc_070', nome: 'Contratto sospeso 2026', tipo: 'contratto', data: '2026-01-20', dimensione: '222 KB' },
      { id: 'doc_071', nome: 'Rider tecnico standard', tipo: 'altro', data: '2025-10-15', dimensione: '98 KB' },
    ],
    recensioni: [
      { id: 'rev_070', eventoId: 'evt_001', autoreId: 'usr_003', voto: 4, testo: 'Intrattenimento di livello, ma troppa difficolta nella comunicazione pre-evento.', data: '2026-02-15' },
    ],
    piva: '05678901234',
  },
]
