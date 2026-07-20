import { useState, useEffect, useRef } from 'react'
import { Bus, Truck, Users, Radio, ScanLine, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react'
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
  { id: 'movements', label: '1. Tratta', icon: Bus },
  { id: 'vehicles', label: '2. Mezzi', icon: Truck },
  { id: 'participants', label: '3. Partecipanti', icon: Users },
  { id: 'manifest', label: '4. Imbarco', icon: Radio },
  { id: 'scanner', label: 'Scanner QR', icon: ScanLine },
] as const

type TabId = (typeof TABS)[number]['id']

const WORKFLOW_STEPS = [
  { id: 'movements' as TabId, label: 'Tratta' },
  { id: 'vehicles' as TabId, label: 'Mezzi' },
  { id: 'participants' as TabId, label: 'Partecipanti' },
  { id: 'manifest' as TabId, label: 'Imbarco' },
  { id: 'scanner' as TabId, label: 'Partenza' },
]

const TAB_GUIDANCE: Record<TabId, string> = {
  movements: 'Crea la tratta e selezionala per continuare.',
  vehicles: 'Aggiungi i pullman o gli altri mezzi del trasferimento.',
  participants: 'Assegna ogni partecipante al mezzo corretto.',
  manifest: "Apri l'imbarco e spunta i nominativi mentre salgono.",
  scanner: "Scansiona il QR del partecipante per registrare l'imbarco.",
}

const NAV_BUTTONS: Record<TabId, { label: string; target: TabId; direction: 'next' | 'back' }> = {
  movements: { label: 'Continua: configura i mezzi', target: 'vehicles', direction: 'next' },
  vehicles: { label: 'Continua: assegna partecipanti', target: 'participants', direction: 'next' },
  participants: { label: "Continua: apri imbarco", target: 'manifest', direction: 'next' },
  manifest: { label: 'Vai allo scanner QR', target: 'scanner', direction: 'next' },
  scanner: { label: 'Torna al manifest live', target: 'manifest', direction: 'back' },
}

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

  const activeStepIdx = WORKFLOW_STEPS.findIndex(s => s.id === activeTab)

  const navBtn = NAV_BUTTONS[activeTab]
  const showNavBtn = activeTab === 'movements' ? !!selectedMovementId : !!selectedMovementId

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Trasporti</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
          Pianifica mezzi e partecipanti, poi gestisci l&apos;imbarco in tempo reale.
        </p>
      </div>

      {/* Workflow indicator */}
      <div style={workflowContainerStyle}>
        {WORKFLOW_STEPS.map((step, idx) => {
          const isCurrent = idx === activeStepIdx
          const isCompleted = idx < activeStepIdx
          return (
            <div key={step.id} style={workflowStepStyle}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: '50%',
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
                background: isCurrent ? 'var(--red)' : isCompleted ? 'rgba(47, 158, 104, 0.15)' : 'var(--panel2)',
                color: isCurrent ? '#fff' : isCompleted ? 'var(--green)' : 'var(--muted)',
              }}>
                {isCompleted ? <CheckCircle2 size={14} /> : idx + 1}
              </div>
              <span style={{
                fontSize: 14,
                fontWeight: isCurrent ? 600 : 400,
                color: isCurrent ? 'var(--text)' : isCompleted ? 'var(--green)' : 'var(--muted)',
                whiteSpace: 'nowrap',
              }}>
                {step.label}
              </span>
            </div>
          )
        })}
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

      {/* Contextual guidance */}
      <p style={guidanceStyle}>{TAB_GUIDANCE[activeTab]}</p>

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

      {/* Navigation button */}
      {showNavBtn && navBtn && (
        <button
          style={navBtnStyle}
          onClick={() => setActiveTab(navBtn.target)}
        >
          {navBtn.direction === 'back' && <ArrowLeft size={16} />}
          <span>{navBtn.label}</span>
          {navBtn.direction === 'next' && <ArrowRight size={16} />}
        </button>
      )}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const workflowContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'none',
  padding: '8px 0',
}

const workflowStepStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
}

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

const guidanceStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--muted)',
  margin: 0,
  lineHeight: 1.5,
}

const navBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  alignSelf: 'flex-start',
  gap: 8,
  minHeight: 44,
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text)',
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'background 0.15s',
}
