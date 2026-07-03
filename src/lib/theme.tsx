import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { supabase } from './supabase'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'simmetria_theme'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? getSystemTheme() : mode
}

function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode)
  document.documentElement.setAttribute('data-theme', resolved)
}

export function loadThemePreference(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'dark'
}

function saveLocal(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode)
}

async function saveRemote(mode: ThemeMode) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  await supabase
    .from('profiles')
    .update({ theme_preference: mode })
    .eq('id', session.user.id)
}

export function initTheme() {
  applyTheme(loadThemePreference())
}

export function getResolvedTheme(): 'light' | 'dark' {
  return resolveTheme(loadThemePreference())
}

export async function syncThemeFromProfile() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  const { data } = await supabase
    .from('profiles')
    .select('theme_preference')
    .eq('id', session.user.id)
    .maybeSingle()
  if (data?.theme_preference) {
    const mode = data.theme_preference as ThemeMode
    saveLocal(mode)
    applyTheme(mode)
  }
}

interface ThemeContextValue {
  theme: ThemeMode
  resolved: 'light' | 'dark'
  setTheme: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(loadThemePreference)
  const resolved = resolveTheme(theme)

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
    saveLocal(mode)
    applyTheme(mode)
    saveRemote(mode)
  }, [])

  const toggleTheme = useCallback(() => {
    const current = resolveTheme(loadThemePreference())
    const next: ThemeMode = current === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }, [setTheme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (loadThemePreference() === 'system') {
        applyTheme('system')
        setThemeState('system')
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
