export function daysLeft(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(iso).getTime() - today.getTime()) / 86400000)
}

export function fmtDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDateShort(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

export function fmtDateTime(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

export function fmtLong(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtFull(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' })
}

export function fmtFullLong(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${g}`
}

export function todayISO(): string {
  return toISO(new Date())
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export function diffDaysISO(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function eventColorByStato(stato: string): string {
  switch (stato) {
    case 'in_corso': return 'var(--red2)'
    case 'pianificazione': return 'var(--blue)'
    case 'completato': return 'var(--green)'
    default: return 'var(--muted)'
  }
}

export function eventLabelByStato(stato: string): string {
  const map: Record<string, string> = {
    in_corso: 'In Corso',
    pianificazione: 'Pianificazione',
    completato: 'Completato',
    bozza: 'Bozza',
  }
  return map[stato] ?? stato
}

export function taskPriColor(priorita: string, stato: string): string {
  if (stato === 'completato') return 'var(--green)'
  if (priorita === 'alta') return 'var(--red2)'
  if (priorita === 'media') return 'var(--yellow)'
  return 'var(--muted)'
}

export function ensureHttps(url: string): string {
  if (!url) return ''
  return url.startsWith('http') ? url : `https://${url}`
}

export function displayUrl(url: string): string {
  if (!url) return ''
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url.length > 30 ? url.slice(0, 28) + '\u2026' : url
  }
}
