export function daysLeft(iso: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const parts = iso.slice(0, 10).split('-')
  const due = new Date(+parts[0], +parts[1] - 1, +parts[2])
  return Math.round((due.getTime() - today.getTime()) / 86400000)
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

export const CITY_TO_REGION: Record<string, string> = {
  'Milano': 'Lombardia', 'Bergamo': 'Lombardia',
  'Brescia': 'Lombardia', 'Como': 'Lombardia',
  'Monza': 'Lombardia', 'Pavia': 'Lombardia',
  'Varese': 'Lombardia', 'Lecco': 'Lombardia',
  'Mantova': 'Lombardia', 'Cremona': 'Lombardia',
  'Lodi': 'Lombardia', 'Sondrio': 'Lombardia',
  'Roma': 'Lazio', 'Frosinone': 'Lazio',
  'Latina': 'Lazio', 'Rieti': 'Lazio',
  'Viterbo': 'Lazio',
  'Napoli': 'Campania', 'Salerno': 'Campania',
  'Caserta': 'Campania', 'Benevento': 'Campania',
  'Avellino': 'Campania',
  'Palermo': 'Sicilia', 'Catania': 'Sicilia',
  'Messina': 'Sicilia', 'Siracusa': 'Sicilia',
  'Agrigento': 'Sicilia', 'Trapani': 'Sicilia',
  'Ragusa': 'Sicilia', 'Caltanissetta': 'Sicilia',
  'Enna': 'Sicilia',
  'Venezia': 'Veneto', 'Verona': 'Veneto',
  'Padova': 'Veneto', 'Vicenza': 'Veneto',
  'Treviso': 'Veneto', 'Belluno': 'Veneto',
  'Rovigo': 'Veneto',
  'Torino': 'Piemonte', 'Cuneo': 'Piemonte',
  'Asti': 'Piemonte', 'Alessandria': 'Piemonte',
  'Novara': 'Piemonte', 'Vercelli': 'Piemonte',
  'Biella': 'Piemonte', 'Verbania': 'Piemonte',
  'Firenze': 'Toscana', 'Siena': 'Toscana',
  'Pisa': 'Toscana', 'Lucca': 'Toscana',
  'Arezzo': 'Toscana', 'Grosseto': 'Toscana',
  'Livorno': 'Toscana', 'Pistoia': 'Toscana',
  'Prato': 'Toscana', 'Massa': 'Toscana',
  'Bologna': 'Emilia-Romagna',
  'Modena': 'Emilia-Romagna',
  'Parma': 'Emilia-Romagna',
  'Reggio Emilia': 'Emilia-Romagna',
  'Ferrara': 'Emilia-Romagna',
  'Rimini': 'Emilia-Romagna',
  'Ravenna': 'Emilia-Romagna',
  'Forlì': 'Emilia-Romagna',
  'Piacenza': 'Emilia-Romagna',
  'Bari': 'Puglia', 'Lecce': 'Puglia',
  'Taranto': 'Puglia', 'Foggia': 'Puglia',
  'Brindisi': 'Puglia', 'Barletta': 'Puglia',
  'Reggio Calabria': 'Calabria',
  'Catanzaro': 'Calabria', 'Cosenza': 'Calabria',
  'Crotone': 'Calabria', 'Vibo Valentia': 'Calabria',
  'Cagliari': 'Sardegna', 'Sassari': 'Sardegna',
  'Nuoro': 'Sardegna', 'Oristano': 'Sardegna',
  'Olbia': 'Sardegna', 'Porto Cervo': 'Sardegna',
  'Arzachena': 'Sardegna',
  'Genova': 'Liguria', 'La Spezia': 'Liguria',
  'Savona': 'Liguria', 'Imperia': 'Liguria',
  'Portofino': 'Liguria', 'Santa Margherita': 'Liguria',
  'Ancona': 'Marche', 'Pesaro': 'Marche',
  'Macerata': 'Marche', 'Ascoli Piceno': 'Marche',
  'Fermo': 'Marche',
  'Perugia': 'Umbria', 'Terni': 'Umbria',
  'Assisi': 'Umbria',
  "L'Aquila": 'Abruzzo', 'Pescara': 'Abruzzo',
  'Chieti': 'Abruzzo', 'Teramo': 'Abruzzo',
  'Trieste': 'Friuli-Venezia Giulia',
  'Udine': 'Friuli-Venezia Giulia',
  'Pordenone': 'Friuli-Venezia Giulia',
  'Gorizia': 'Friuli-Venezia Giulia',
  'Trento': 'Trentino-Alto Adige',
  'Bolzano': 'Trentino-Alto Adige',
  'Merano': 'Trentino-Alto Adige',
  'Aosta': "Valle d'Aosta",
  'Courmayeur': "Valle d'Aosta",
  'Campobasso': 'Molise', 'Isernia': 'Molise',
  'Potenza': 'Basilicata', 'Matera': 'Basilicata',
}

export function friendlyError(error: { message?: string; code?: string }): string {
  if (error.code === '42501')
    return 'Non fai (più) parte di questo evento, quindi non puoi modificarlo. Chiedi a un membro del team o a un amministratore di aggiungerti.'
  return error.message || 'Errore sconosciuto'
}

export function inferRegion(city: string, region: string): string {
  if (region) return region
  if (!city) return ''
  if (CITY_TO_REGION[city]) return CITY_TO_REGION[city]
  const found = Object.keys(CITY_TO_REGION).find(k =>
    city.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(city.toLowerCase())
  )
  return found ? CITY_TO_REGION[found] : ''
}
