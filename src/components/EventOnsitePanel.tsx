import { useState, useEffect, useRef } from 'react'
import { checkEventPermission } from '@/lib/event-members-service'
import OnsiteQrScanner from '@/components/OnsiteQrScanner'
import OnsiteLiveProgram from '@/components/OnsiteLiveProgram'
import OnsiteIncidentsManager from '@/components/OnsiteIncidentsManager'
import OnsiteOperationsOverview from '@/components/OnsiteOperationsOverview'
import TransportOperationsModule from '@/components/TransportOperationsModule'
import { TabProgramma } from '@/pages/eventi/tabs/TabProgramma'
import type { Event } from '@/data/events'
import type { Supplier } from '@/data/suppliers'

interface Props {
  eventId: string
  eventName: string
  event: Event
  suppliers: Supplier[]
  isArchived?: boolean
}

type PermState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'granted'; canOnsite: boolean; canRegistration: boolean }

type Tab = 'panoramica' | 'checkin' | 'trasporti' | 'programma' | 'criticita'

const TAB_LABELS: Record<Tab, string> = {
  panoramica: 'Panoramica',
  checkin: 'Check-in',
  trasporti: 'Trasporti',
  programma: 'Programma',
  criticita: 'Criticità',
}

type ProgrammaView = 'pianifica' | 'live'

export default function EventOnsitePanel({ eventId, eventName, event, suppliers, isArchived }: Props) {
  const [perm, setPerm] = useState<PermState>({ kind: 'loading' })
  const [activeTab, setActiveTab] = useState<Tab>('panoramica')
  const [programmaView, setProgrammaView] = useState<ProgrammaView>('pianifica')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function check() {
      setPerm({ kind: 'loading' })
      const [canOnsite, canRegistration] = await Promise.all([
        checkEventPermission(eventId, 'can_access_onsite'),
        checkEventPermission(eventId, 'can_manage_registration'),
      ])
      if (cancelled || !mountedRef.current) return
      if (canOnsite || canRegistration) {
        setPerm({ kind: 'granted', canOnsite, canRegistration })
      } else {
        setPerm({ kind: 'denied' })
      }
    }

    check()
    return () => { cancelled = true }
  }, [eventId])

  if (perm.kind === 'loading') {
    return (
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto px-4 py-6 gap-5" style={{ fontSize: '14px' }}>
        <p className="text-gray-500 py-8" role="status">Caricamento...</p>
      </div>
    )
  }

  if (perm.kind === 'denied') {
    return (
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto px-4 py-6 gap-5" style={{ fontSize: '14px' }}>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-orange-800 text-sm text-center">
          Non hai i permessi per accedere alle operazioni On Site.
        </div>
      </div>
    )
  }

  const { canOnsite, canRegistration } = perm
  const archived = !!isArchived
  const checkinEnabled = !archived && (canOnsite || canRegistration)
  const editEnabled = !archived && canOnsite

  const tabs: Tab[] = ['panoramica', 'checkin', 'trasporti', 'programma', 'criticita']

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto px-4 py-6 gap-5" style={{ fontSize: '14px' }}>
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-gray-900">On Site</h2>
        <p className="text-sm text-gray-500 truncate max-w-xs mx-auto">{eventName}</p>
        {archived && (
          <p className="text-sm text-amber-700 font-medium">Evento archiviato — sola lettura</p>
        )}
      </div>

      {/* Tabs */}
      <nav className="flex border-b border-gray-200 overflow-x-auto" aria-label="Sezioni On Site">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-center px-3 py-3 text-sm font-medium min-h-[44px] whitespace-nowrap transition-colors border-b-2 ${
              activeTab === tab
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            aria-selected={activeTab === tab}
            aria-label={TAB_LABELS[tab]}
            role="tab"
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === 'panoramica' && (
          <OnsiteOperationsOverview
            eventId={eventId}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'checkin' && (
          checkinEnabled ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center leading-relaxed">
                Scansiona il pass del partecipante per verificare la registrazione ed effettuare il check-in.
              </p>
              <OnsiteQrScanner eventId={eventId} disabled={archived} />
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-gray-600 text-sm text-center">
              Check-in non disponibile per eventi archiviati.
            </div>
          )
        )}

        {activeTab === 'trasporti' && (
          <TransportOperationsModule eventId={eventId} disabled={archived} />
        )}

        {activeTab === 'programma' && (
          <div className="flex flex-col gap-4">
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--line)' }}>
              <button
                onClick={() => setProgrammaView('pianifica')}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-colors"
                style={{
                  background: programmaView === 'pianifica' ? 'var(--text)' : 'var(--panel-solid)',
                  color: programmaView === 'pianifica' ? 'var(--panel-solid)' : 'var(--muted)',
                }}
              >
                Pianifica
              </button>
              <button
                onClick={() => setProgrammaView('live')}
                className="flex-1 px-4 py-2.5 text-sm font-medium transition-colors"
                style={{
                  background: programmaView === 'live' ? 'var(--text)' : 'var(--panel-solid)',
                  color: programmaView === 'live' ? 'var(--panel-solid)' : 'var(--muted)',
                  borderLeft: '1px solid var(--line)',
                }}
              >
                Regia Live
              </button>
            </div>

            {programmaView === 'pianifica' ? (
              <TabProgramma event={event} suppliers={suppliers} />
            ) : (
              <OnsiteLiveProgram eventId={eventId} disabled={!editEnabled} />
            )}
          </div>
        )}

        {activeTab === 'criticita' && (
          <OnsiteIncidentsManager eventId={eventId} disabled={!editEnabled} />
        )}
      </div>
    </div>
  )
}
