const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getBaseUrl(): string {
  const raw =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PUBLIC_APP_URL) || ''
  const base = typeof raw === 'string' && raw.length > 0
    ? raw
    : 'https://simmetriasynergy.netlify.app'
  return base.replace(/\/+$/, '')
}

export function buildBadgeUrl(token: string): string {
  if (!UUID_RE.test(token)) return token
  return `${getBaseUrl()}/badge/${token}`
}

export function extractQrToken(value: string): string | null {
  if (!value) return null
  const trimmed = value.trim()

  if (UUID_RE.test(trimmed)) return trimmed.toLowerCase()

  let pathname: string | null = null

  if (/^https:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed)
      if (url.protocol !== 'https:') return null
      pathname = url.pathname
    } catch {
      return null
    }
  } else if (trimmed.startsWith('/badge/')) {
    pathname = trimmed
  } else {
    return null
  }

  if (!pathname) return null

  const match = pathname.match(/^\/badge\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i)
  if (!match) return null

  return match[1].toLowerCase()
}
