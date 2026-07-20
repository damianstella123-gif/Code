import { useState, useEffect, useRef } from 'react'
import { Bus, Truck, Users, Radio, ScanLine } from 'lucide-react'
import TransportMovementManager from './TransportMovementManager'
import TransportVehicleManager from './TransportVehicleManager'
import TransportParticipantAssignment from './TransportParticipantAssignment'
import TransportLiveManifest from './TransportLiveManifest'
import TransportBoardingScanner from './TransportBoardingScanner'

interface Props {
  eventId: string
  disabled?: boolean
}

const TABS = [
  { id: 'movements', label: 'Trasferimenti', icon: Bus },
  { id: 'vehicles', label: 'Mezzi', icon: Truck },
  { id: 'participants', label: 'Partecipanti', icon: Users },
  { id: 'manifest', label: 'Manifest live', icon: Radio },
  { id: 'scanner', label: 'Scanner QR', icon: ScanLine },
] as const

type TabId = (typeof TABS)[number]['id']

export default function TransportOperationsModule({ eventId, disabled }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('movements')
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedMovementId && activeTab !== 'movements') {
      setActiveTab('movements')
    }
  }, [selectedMovementId, activeTab])

  const handleMovementSelected = (id: string | null) => {
    setSelectedMovementId(id)
  }

  const requiresMovement = activeTab !== 'movements'
  const showPlaceholder = requiresMovement && !selectedMovementId

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Trasporti</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
          Pianifica mezzi e partecipanti, poi gestisci l'imbarco in tempo reale.
        </p>
      </div>

      {/* Selection indicator */}
      {selectedMovementId && (
        <div style={selectionIndicatorStyle}>
          <Bus size={14} style={{ flexShrink: 0 }} />
          <span>Trasferimento selezionato</span>
        </div>
      )}

      {/* Tabs */}
      <div ref={tabsContainerRef} style={tabsContainerStyle} role="tablist" aria-label="Sezioni trasporti">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`transport-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...tabBtnStyle,
                borderBottom: isActive ? '2px solid var(--red)' : '2px solid transparent',
                color: isActive ? 'var(--text)' : 'var(--muted)',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div id={`transport-panel-${activeTab}`} role="tabpanel" style={{ minHeight: 200 }}>
        {activeTab === 'movements' && (
          <TransportMovementManager
            eventId={eventId}
            disabled={disabled}
            onMovementSelected={handleMovementSelected}
          />
        )}

        {showPlaceholder && (
          <div style={placeholderStyle}>
            <Bus size={28} style={{ opacity: 0.4 }} />
            <span>Seleziona prima un trasferimento.</span>
          </div>
        )}

        {activeTab === 'vehicles' && selectedMovementId && (
          <TransportVehicleManager
            movementId={selectedMovementId}
            disabled={disabled}
          />
        )}

        {activeTab === 'participants' && selectedMovementId && (
          <TransportParticipantAssignment
            eventId={eventId}
            movementId={selectedMovementId}
            disabled={disabled}
          />
        )}

        {activeTab === 'manifest' && selectedMovementId && (
          <TransportLiveManifest
            movementId={selectedMovementId}
            disabled={disabled}
          />
        )}

        {activeTab === 'scanner' && selectedMovementId && (
          <TransportBoardingScanner
            movementId={selectedMovementId}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const tabsContainerStyle: React.CSSProperties = {
  display: 'flex',
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  gap: 0,
  borderBottom: '1px solid var(--line)',
  scrollbarWidth: 'none',
}

const tabBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  padding: '10px 14px',
  fontSize: 14,
  whiteSpace: 'nowrap',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  outline: 'none',
  transition: 'color 0.15s, border-color 0.15s',
  flexShrink: 0,
}

const selectionIndicatorStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 999,
  background: 'rgba(47, 158, 104, 0.1)',
  color: 'var(--green)',
  fontSize: 12,
  fontWeight: 500,
  alignSelf: 'flex-start',
}

const placeholderStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: 40,
  color: 'var(--muted)',
  fontSize: 14,
  textAlign: 'center',
}
