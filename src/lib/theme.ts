import { useEffect, useState, useCallback } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'simmetria_theme'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode) {
  const resolved = mode === 'system' ? getSystemTheme() : mode
  document.documentElement.setAttribute('data-theme', resolved)
}

export function loadThemePreference(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'light'
}

export function saveThemePreference(mode: ThemeMode) {
  localStorage.setItem(STORAGE_KEY, mode)
  applyTheme(mode)
}

export function initTheme() {
  applyTheme(loadThemePreference())
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(loadThemePreference)

  const setAndPersist = useCallback((mode: ThemeMode) => {
    setTheme(mode)
    saveThemePreference(mode)
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

  return { theme, setTheme: setAndPersist }
}
