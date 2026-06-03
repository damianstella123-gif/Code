import { supabase } from './supabase'
import type { AppRole } from './database.types'
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'

export interface SignUpInput {
  email: string
  password: string
  nome: string
  ruolo?: AppRole
  reparto?: string
}

export interface SignInInput {
  email: string
  password: string
}

export interface AuthResult {
  user: SupabaseUser | null
  session: Session | null
  error: string | null
}

export async function signUp({ email, password, nome, ruolo, reparto }: SignUpInput): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nome,
        ruolo: ruolo ?? 'Junior Event Assistant',
        reparto: reparto ?? '',
      },
    },
  })
  return {
    user: data.user,
    session: data.session,
    error: error?.message ?? null,
  }
}

export async function signIn({ email, password }: SignInInput): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return {
    user: data.user,
    session: data.session,
    error: error?.message ?? null,
  }
}

export async function signOut(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut()
  return { error: error?.message ?? null }
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getCurrentAuthUser(): Promise<SupabaseUser | null> {
  const { data } = await supabase.auth.getUser()
  return data.user
}

export function onAuthChange(callback: (session: Session | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
}
