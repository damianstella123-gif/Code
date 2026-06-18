import { useEffect, useState, useCallback } from 'react'
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
  return 'system'
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

export function getResolvedTheme(): 'light' | 'dark' {
  return resolveTheme(loadThemePreference())
}

export function initTheme() {
  applyTheme(loadThemePreference())
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(loadThemePreference)

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
    saveLocal(mode)
    applyTheme(mode)
    saveRemote(mode)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (loadThemePreference() === 'system') {
        applyTheme('system')
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return { theme, setTheme }
}
