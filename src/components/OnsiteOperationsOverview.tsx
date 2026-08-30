import { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, QrCode, Radio, AlertTriangle } from 'lucide-react'
import { fetchOnsiteProgram, type MergedProgramItem } from '@/lib/onsite-operations-service'
import { fetchOnsiteIncidents } from '@/lib/onsite-operations-service'
import { fetchEventRegistrations, getRegistrationStats } from '@/lib/registration-participants-service'

type NavTab = 'checkin' | 'programma' | 'criticita'

interface Props {
  eventId: string
  onNavigate: (tab: NavTab) => void
}

function localToday(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface DashboardData {
  regStats: { total: number; confirmed: number; checkedIn: number; waitlist: number }
  program: { inProgress: MergedProgramItem | null; nextUp: MergedProgramItem | null; delayed: number }
  incidents: { open: number; inProgress: number; criticalActive: number; resolved: number }
}

export default function OnsiteOperationsOverview({ eventId, onNavigate }: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [program, incidents, registrations] = await Promise.all([
        fetchOnsiteProgram(eventId),
        fetchOnsiteIncidents(eventId),
        fetchEventRegistrations(eventId),
      ])

      if (!mountedRef.current) return

      const stats = getRegistrationStats(registrations)
      const regStats = {
        total: stats.total,
        confirmed: stats.confirmed,
        checkedIn: stats.checkedIn,
        waitlist: stats.waitlist,
      }

      const inProgress = program.find((i) => i.onsite_status === 'in_progress') || null
      const nextUp = findNextUpcoming(program)
      const delayed = program.filter((i) => i.onsite_status === 'delayed').length

      const incOpen = incidents.filter((i) => i.incident_status === 'open').length
      const incInProgress = incidents.filter((i) => i.incident_status === 'in_progress').length
      const incCritical = incidents.filter((i) => i.severity === 'critical' && i.incident_status !== 'resolved').length
      const incResolved = incidents.filter((i) => i.incident_status === 'resolved').length

      setData({
        regStats,
        program: { inProgress, nextUp, delayed },
        incidents: { open: incOpen, inProgress: incInProgress, criticalActive: incCritical, resolved: incResolved },
      })
      setError(null)
    } catch {
      if (!mountedRef.current) return
      setError('Impossibile caricare la panoramica. Riprova.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    setLoading(true)
    loadData()
    intervalRef.current = setInterval(loadData, 30000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [loadData])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-600 text-sm">Caricamento panoramica...</span>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 text-sm mb-3">{error}</p>
        <button
          onClick={() => { setLoading(true); loadData() }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm min-h-[44px]"
          aria-label="Riprova caricamento"
        >
          <RefreshCw className="w-4 h-4" /> Riprova
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-5">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Panoramica Operativa</h3>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[44px]"
          aria-label="Aggiorna panoramica"
        >
          <RefreshCw className="w-4 h-4" /> Aggiorna
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Registrations */}
      <Section title="Registrazioni">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Counter label="Totale" value={data.regStats.total} className="border-gray-200 bg-gray-50 text-gray-800" />
          <Counter label="Confermati" value={data.regStats.confirmed} className="border-blue-200 bg-blue-50 text-blue-800" />
          <Counter label="Check-in" value={data.regStats.checkedIn} className="border-green-200 bg-green-50 text-green-800" />
          <Counter label="Lista d'attesa" value={data.regStats.waitlist} className="border-amber-200 bg-amber-50 text-amber-800" />
        </div>
      </Section>

      {/* Live operations */}
      <Section title="Programma Live">
        <div className="space-y-2">
          <InfoRow
            label="In corso"
            value={data.program.inProgress ? `${data.program.inProgress.titolo} (${data.program.inProgress.ora_inizio.slice(0, 5)})` : 'Nessuno'}
            highlight={!!data.program.inProgress}
          />
          <InfoRow
            label="Prossimo"
            value={data.program.nextUp ? `${data.program.nextUp.titolo} (${data.program.nextUp.ora_inizio.slice(0, 5)})` : 'Nessuno'}
          />
          <InfoRow
            label="In ritardo"
            value={String(data.program.delayed)}
            highlight={data.program.delayed > 0}
            warning={data.program.delayed > 0}
          />
        </div>
      </Section>

      {/* Incidents */}
      <Section title="Incidenti">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Counter label="Aperti" value={data.incidents.open} className="border-red-200 bg-red-50 text-red-800" />
          <Counter label="In gestione" value={data.incidents.inProgress} className="border-amber-200 bg-amber-50 text-amber-800" />
          <Counter label="Critici attivi" value={data.incidents.criticalActive} className={data.incidents.criticalActive > 0 ? 'border-red-400 bg-red-100 text-red-900 ring-2 ring-red-300' : 'border-red-200 bg-red-50 text-red-800'} />
          <Counter label="Risolti" value={data.incidents.resolved} className="border-green-200 bg-green-50 text-green-800" />
        </div>
      </Section>

      {/* Quick navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
        <NavButton onClick={() => onNavigate('checkin')} icon={<QrCode className="w-5 h-5" />} label="Vai a Check-in" />
        <NavButton onClick={() => onNavigate('programma')} icon={<Radio className="w-5 h-5" />} label="Vai a Programma" />
        <NavButton onClick={() => onNavigate('criticita')} icon={<AlertTriangle className="w-5 h-5" />} label="Vai a Criticità" />
      </div>
    </div>
  )
}

function findNextUpcoming(items: MergedProgramItem[]): MergedProgramItem | null {
  const now = new Date()
  const today = localToday()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const upcoming = items
    .filter((i) => {
      if (i.onsite_status === 'completed' || i.onsite_status === 'cancelled' || i.onsite_status === 'in_progress') return false
      if (i.data > today) return true
      if (i.data < today) return false
      const [h, m] = i.ora_inizio.split(':').map(Number)
      return h * 60 + m > currentMinutes
    })
    .sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1
      return a.ora_inizio.localeCompare(b.ora_inizio)
    })

  return upcoming[0] || null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
      {children}
    </div>
  )
}

function Counter({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`text-center px-2 py-3 rounded-lg border ${className}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs font-medium truncate">{label}</div>
    </div>
  )
}

function InfoRow({ label, value, highlight, warning }: { label: string; value: string; highlight?: boolean; warning?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${warning ? 'border-amber-300 bg-amber-50' : highlight ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-medium ${warning ? 'text-amber-800' : highlight ? 'text-green-800' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}

function NavButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 min-h-[44px] transition-colors"
      aria-label={label}
    >
      {icon}
      {label}
    </button>
  )
}
