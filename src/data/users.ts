export interface User {
  id: string
  nome: string
  email: string
  ruolo: 'Admin' | 'Manager' | 'Operativo' | 'Amministrazione' | 'Commerciale' | 'Fornitore' | 'Regista'
  reparto: string
  avatar: string
  stato: 'attivo' | 'ferie' | 'malattia'
}

export const users: User[] = [
  {
    id: 'usr_001',
    nome: 'Marco Rossini',
    email: 'm.rossini@simmetria.it',
    ruolo: 'Admin',
    reparto: 'Direzione',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
    stato: 'attivo',
  },
  {
    id: 'usr_002',
    nome: 'Laura Bianchi',
    email: 'l.bianchi@simmetria.it',
    ruolo: 'Manager',
    reparto: 'Marketing',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face',
    stato: 'attivo',
  },
  {
    id: 'usr_003',
    nome: 'Giuseppe Verdi',
    email: 'g.verdi@simmetria.it',
    ruolo: 'Manager',
    reparto: 'Eventi',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
    stato: 'attivo',
  },
  {
    id: 'usr_004',
    nome: 'Anna Martini',
    email: 'a.martini@simmetria.it',
    ruolo: 'Amministrazione',
    reparto: 'Amministrazione',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
    stato: 'attivo',
  },
  {
    id: 'usr_005',
    nome: 'Luca Ferrari',
    email: 'l.ferrari@simmetria.it',
    ruolo: 'Commerciale',
    reparto: 'Vendite',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a0f1?w=150&h=150&fit=crop&crop=face',
    stato: 'attivo',
  },
  {
    id: 'usr_006',
    nome: 'Francesca Romano',
    email: 'f.romano@simmetria.it',
    ruolo: 'Operativo',
    reparto: 'Eventi',
    avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c617?w=150&h=150&fit=crop&crop=face',
    stato: 'attivo',
  },
  {
    id: 'usr_007',
    nome: 'Alessandro Conti',
    email: 'a.conti@simmetria.it',
    ruolo: 'Operativo',
    reparto: 'Logistica',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cb84f57c1a44?w=150&h=150&fit=crop&crop=face',
    stato: 'ferie',
  },
  {
    id: 'usr_008',
    nome: 'Chiara Galli',
    email: 'c.galli@simmetria.it',
    ruolo: 'Amministrazione',
    reparto: 'Amministrazione',
    avatar: 'https://images.unsplash.com/photo-1534528741773-5394a9f0a8ef?w=150&h=150&fit=crop&crop=face',
    stato: 'attivo',
  },
  {
    id: 'usr_009',
    nome: 'Matteo Serra',
    email: 'm.serra@simmetria.it',
    ruolo: 'Commerciale',
    reparto: 'Vendite',
    avatar: 'https://images.unsplash.com/photo-1507591064353-77d42c8f96e6?w=150&h=150&fit=crop&crop=face',
    stato: 'attivo',
  },
  {
    id: 'usr_010',
    nome: 'Giulia Neri',
    email: 'g.neri@simmetria.it',
    ruolo: 'Operativo',
    reparto: 'Marketing',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=face',
    stato: 'malattia',
  },
  {
    id: 'usr_011',
    nome: 'Paolo Marchetti',
    email: 'p.marchetti@simmetria.it',
    ruolo: 'Fornitore',
    reparto: 'Esterno',
    avatar: 'https://images.unsplash.com/photo-1463453071188-5251c8185f8c?w=150&h=150&fit=crop&crop=face',
    stato: 'attivo',
  },
  {
    id: 'usr_012',
    nome: 'Sara Moretti',
    email: 's.moretti@simmetria.it',
    ruolo: 'Manager',
    reparto: 'HR',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face',
    stato: 'attivo',
  },
]
