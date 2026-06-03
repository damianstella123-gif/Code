export type AppRole =
  | 'Partner'
  | 'Project Manager'
  | 'Event Coordinator'
  | 'Event Assistant'
  | 'Junior Event Assistant'
  | 'Amministrazione'
  | 'Production Manager'
  | 'Digital Strategist'

export const APP_ROLES: AppRole[] = [
  'Partner',
  'Project Manager',
  'Event Coordinator',
  'Event Assistant',
  'Junior Event Assistant',
  'Amministrazione',
  'Production Manager',
  'Digital Strategist',
]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          nome: string
          email: string
          ruolo: AppRole
          reparto: string
          avatar_url: string | null
          stato: 'attivo' | 'ferie' | 'malattia'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nome: string
          email: string
          ruolo?: AppRole
          reparto?: string
          avatar_url?: string | null
          stato?: 'attivo' | 'ferie' | 'malattia'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string
          email?: string
          ruolo?: AppRole
          reparto?: string
          avatar_url?: string | null
          stato?: 'attivo' | 'ferie' | 'malattia'
          updated_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      app_role: AppRole
      profile_status: 'attivo' | 'ferie' | 'malattia'
    }
  }
}
