import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Search, UserPlus, ArrowRightLeft, Loader2, AlertCircle, Users, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/lib/toast'
import {
  fetchTransportManifest,
  assignTransportParticipant,
  moveTransportParticipant,
  type TransportManifest,
  type TransportManifestVehicle,
  type TransportManifestParticipant,
  type TransportMovementStatus,
} from '@/lib/transport-service'
import { fetchEventRegistrations, type EventRegistration } from '@/lib/registration-participants-service'
import ParticipantExcelImport from './ParticipantExcelImport'
import type { ParticipantImportResult } from '@/lib/participant-import-service'

interface Props {
  eventId: string
  movementId: string
  disabled?: boolean
}

const EDITABLE_STATUSES: TransportMovementStatus[] = ['draft', 'open']

const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  assigned: 'Assegnato',
  boarded: 'A bordo',
  no_show: 'No-show',
  cancelled: 'Annullato',
}

const ASSIGNMENT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  assigned: { bg: 'rgba(47, 111, 190, 0.12)', text: 'var(--blue)' },
  boarded: { bg: 'rgba(47, 158, 104, 0.12)', text: 'var(--green)' },
  no_show: { bg: 'rgba(211, 28, 48, 0.10)', text: 'var(--red)' },
  cancelled: { bg: 'var(--panel2)', text: 'var(--muted)' },
}

export default function TransportParticipantAssignment({ eventId, movementId, disabled }: Props) {
  const { showToast } = useToast()
  const [manifest, setManifest] = useState<TransportManifest | null>(null)
  const [registrations, setRegistrations] = useState<EventRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedRegId, setSelectedRegId] = useState<string | null>(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [moveTargetVehicle, setMoveTargetVehicle] = useState<string | null>(null)
  const [moveConfirm, setMoveConfirm] = useState(false)
  const [moving, setMoving] = useState(false)
  const mountedRef = useRef(true)
  const requestRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const loadData = useCallback(async () => {
    const reqId = ++requestRef.current
    setLoading(true)
    setLoadError(null)
    try {
      const [manifestData, regs] = await Promise.all([
        fetchTransportManifest(movementId),
        fetchEventRegistrations(eventId),
      ])
      if (!mountedRef.current || reqId !== requestRef.current) return
      setManifest(manifestData)
      setRegistrations(regs)
    } catch (err) {
      if (!mountedRef.current || reqId !== requestRef.current) return
      setLoadError(err instanceof Error ? err.message : 'Errore durante il caricamento.')
    } finally {
      if (mountedRef.current && reqId === requestRef.current) setLoading(false)
    }
  }, [eventId, movementId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const canEdit = !disabled && manifest && EDITABLE_STATUSES.includes(manifest.movement.movement_status)

  const assignedRegIds = useMemo(() => {
    if (!manifest) return new Set<string>()
    return new Set(manifest.assignments.map(a => a.registration_id))
  }, [manifest])

  const activeRegistrations = useMemo(() => {
    return registrations.filter(r => r.registration_status !== 'cancelled')
  }, [registrations])

  const filteredRegistrations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activeRegistrations
    return activeRegistrations.filter(r =>
      r.first_name.toLowerCase().includes(q) ||
      r.last_name.toLowerCase().includes(q) ||
      (r.company && r.company.toLowerCase().includes(q))
    )
  }, [activeRegistrations, search])

  const VISIBLE_LIMIT = 200
  const visibleRegistrations = useMemo(() => filteredRegistrations.slice(0, VISIBLE_LIMIT), [filteredRegistrations])
  const hasOverflow = filteredRegistrations.length > VISIBLE_LIMIT

  const availableCount = activeRegistrations.filter(r => !assignedRegIds.has(r.id)).length
  const assignedCount = assignedRegIds.size

  const vehicleRemaining = useCallback((v: TransportManifestVehicle): number | null => {
    if (v.capacity == null) return null
    return v.capacity - v.expected_count
  }, [])

  const isVehicleFull = useCallback((v: TransportManifestVehicle): boolean => {
    if (v.capacity == null) return false
    return v.expected_count >= v.capacity
  }, [])

  const handleImported = useCallback(async (_result: ParticipantImportResult) => {
    setSearch('')
    setSelectedRegId(null)
    await loadData()
  }, [loadData])

  const handleAssign = async () => {
    if (!selectedRegId || !selectedVehicleId) return
    setAssigning(true)
    try {
      await assignTransportParticipant({
        movementId,
        vehicleId: selectedVehicleId,
        registrationId: selectedRegId,
      })
      if (!mountedRef.current) return
      showToast('Partecipante assegnato al mezzo.', 'success')
      setSelectedRegId(null)
      setSelectedVehicleId(null)
      setSearch('')
      await loadData()
    } catch (err) {
      if (!mountedRef.current) return
      showToast(err instanceof Error ? err.message : 'Errore durante l\'assegnazione.', 'error')
    } finally {
      if (mountedRef.current) setAssigning(false)
    }
  }

  const handleMove = async () => {
    if (!movingId || !moveTargetVehicle) return
    setMoving(true)
    try {
      await moveTransportParticipant(movingId, moveTargetVehicle)
      if (!mountedRef.current) return
      showToast('Partecipante spostato.', 'success')
      setMovingId(null)
      setMoveTargetVehicle(null)
      setMoveConfirm(false)
      await loadData()
    } catch (err) {
      if (!mountedRef.current) return
      showToast(err instanceof Error ? err.message : 'Errore durante lo spostamento.', 'error')
    } finally {
      if (mountedRef.current) setMoving(false)
    }
  }

  const cancelMove = () => {
    setMovingId(null)
    setMoveTargetVehicle(null)
    setMoveConfirm(false)
  }

  const assignmentsByVehicle = useMemo(() => {
    if (!manifest) return new Map<string, { vehicle: TransportManifestVehicle; participants: TransportManifestParticipant[] }>()
    const map = new Map<string, { vehicle: TransportManifestVehicle; participants: TransportManifestParticipant[] }>()
    for (const v of manifest.vehicles) {
      map.set(v.id, { vehicle: v, participants: [] })
    }
    for (const a of manifest.assignments) {
      const entry = map.get(a.vehicle_id)
      if (entry) entry.participants.push(a)
    }
    return map
  }, [manifest])

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>Caricamento partecipanti...</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32 }}>
        <AlertCircle size={24} style={{ color: 'var(--red)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>{loadError}</span>
        <button onClick={loadData} style={retryBtnStyle}>Riprova</button>
      </div>
    )
  }

  const vehicles = manifest?.vehicles ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── ASSIGNMENT SECTION ─── */}
      {canEdit && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ParticipantExcelImport
            eventId={eventId}
            disabled={!canEdit}
            onImported={handleImported}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              Assegna partecipanti
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--muted)' }}>
              <span>Partecipanti disponibili: {availableCount}</span>
              <span>Assegnati: {assignedCount}</span>
              <button onClick={loadData} style={refreshBtnStyle}>Aggiorna elenco</button>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedRegId(null) }}
              placeholder="Cerca per nome, cognome o azienda..."
              style={{ ...inputStyle, paddingLeft: 36 }}
            />
          </div>

          {/* Participant list - always visible */}
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--panel-solid)' }}>
            {activeRegistrations.length === 0 ? (
              <div style={{ padding: 16, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
                Nessun partecipante disponibile. Importa un file Excel oppure verifica l'evento selezionato.
              </div>
            ) : filteredRegistrations.length === 0 ? (
              <div style={{ padding: 16, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
                Nessun partecipante trovato.
              </div>
            ) : (
              <>
                {visibleRegistrations.map(r => {
                  const isAssigned = assignedRegIds.has(r.id)
                  const isSelected = selectedRegId === r.id
                  return (
                    <button
                      key={r.id}
                      onClick={() => !isAssigned && setSelectedRegId(isSelected ? null : r.id)}
                      disabled={isAssigned}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        minHeight: 44,
                        padding: '8px 12px',
                        border: 'none',
                        borderBottom: '1px solid var(--line)',
                        background: isSelected ? 'var(--panel2)' : 'transparent',
                        cursor: isAssigned ? 'default' : 'pointer',
                        opacity: isAssigned ? 0.5 : 1,
                        textAlign: 'left',
                        fontSize: 14,
                        color: 'var(--text)',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 500 }}>{r.last_name} {r.first_name}</span>
                        {r.company && <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 13 }}>{r.company}</span>}
                      </span>
                      {isAssigned && (
                        <span style={{ fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={12} /> Assegnato
                        </span>
                      )}
                    </button>
                  )
                })}
                {hasOverflow && (
                  <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--muted)', textAlign: 'center', borderTop: '1px solid var(--line)' }}>
                    Mostrati {VISIBLE_LIMIT} di {filteredRegistrations.length} partecipanti. Usa la ricerca per filtrare.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Vehicle selector + assign button */}
          {selectedRegId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--panel2)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Seleziona il mezzo di destinazione:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {vehicles.map(v => {
                  const full = isVehicleFull(v)
                  const remaining = vehicleRemaining(v)
                  const isSelected = selectedVehicleId === v.id
                  return (
                    <button
                      key={v.id}
                      onClick={() => !full && setSelectedVehicleId(isSelected ? null : v.id)}
                      disabled={full}
                      style={{
                        minHeight: 44,
                        padding: '8px 14px',
                        fontSize: 13,
                        border: isSelected ? '2px solid var(--red)' : '1px solid var(--line)',
                        borderRadius: 'var(--radius-sm)',
                        background: full ? 'var(--panel2)' : 'var(--panel-solid)',
                        color: full ? 'var(--muted)' : 'var(--text)',
                        cursor: full ? 'not-allowed' : 'pointer',
                        opacity: full ? 0.6 : 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{v.label}</span>
                      {remaining !== null && (
                        <span style={{ fontSize: 11, color: full ? 'var(--red)' : 'var(--muted)' }}>
                          {full ? 'Completo' : `${remaining} posti`}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {selectedVehicleId && (
                <button
                  onClick={handleAssign}
                  disabled={assigning}
                  style={assignBtnStyle(assigning)}
                >
                  {assigning ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <UserPlus size={14} />}
                  Assegna al mezzo
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── CURRENT ASSIGNMENTS ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Assegnazioni correnti
        </h4>

        {manifest && manifest.assignments.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            <Users size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
            <p style={{ margin: 0 }}>Nessun partecipante assegnato.</p>
          </div>
        )}

        {Array.from(assignmentsByVehicle.entries()).map(([vehicleId, { vehicle, participants }]) => {
          if (participants.length === 0) return null
          return (
            <div key={vehicleId} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{vehicle.label}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{participants.length} partecipanti</span>
              </div>
              <div>
                {participants.map(p => {
                  const statusColor = ASSIGNMENT_STATUS_COLORS[p.assignment_status] ?? ASSIGNMENT_STATUS_COLORS.assigned
                  const canMove = canEdit && p.assignment_status === 'assigned'
                  const isMoving = movingId === p.assignment_id
                  return (
                    <div key={p.assignment_id} style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
                            {p.last_name ?? ''} {p.first_name ?? ''}
                          </span>
                          {p.company && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{p.company}</span>}
                          <span style={{
                            fontSize: 12,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: statusColor.bg,
                            color: statusColor.text,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                          }}>
                            {ASSIGNMENT_STATUS_LABELS[p.assignment_status] ?? p.assignment_status}
                          </span>
                        </div>
                        {canMove && !isMoving && (
                          <button
                            onClick={() => { setMovingId(p.assignment_id); setMoveTargetVehicle(null); setMoveConfirm(false) }}
                            style={moveBtnStyle}
                          >
                            <ArrowRightLeft size={13} />
                            Sposta
                          </button>
                        )}
                      </div>

                      {/* Move panel */}
                      {isMoving && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: 'var(--panel2)', borderRadius: 'var(--radius-sm)' }}>
                          {!moveConfirm ? (
                            <>
                              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Seleziona il nuovo mezzo:</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {vehicles.filter(v => v.id !== vehicleId).map(v => {
                                  const full = isVehicleFull(v)
                                  const selected = moveTargetVehicle === v.id
                                  return (
                                    <button
                                      key={v.id}
                                      onClick={() => !full && setMoveTargetVehicle(selected ? null : v.id)}
                                      disabled={full}
                                      style={{
                                        minHeight: 44,
                                        padding: '6px 12px',
                                        fontSize: 13,
                                        border: selected ? '2px solid var(--red)' : '1px solid var(--line)',
                                        borderRadius: 'var(--radius-sm)',
                                        background: full ? 'var(--panel2)' : 'var(--panel-solid)',
                                        color: full ? 'var(--muted)' : 'var(--text)',
                                        cursor: full ? 'not-allowed' : 'pointer',
                                        opacity: full ? 0.6 : 1,
                                      }}
                                    >
                                      {v.label}
                                      {v.capacity != null && (
                                        <span style={{ fontSize: 11, marginLeft: 4, color: 'var(--muted)' }}>
                                          ({full ? 'completo' : `${v.capacity - v.expected_count} posti`})
                                        </span>
                                      )}
                                    </button>
                                  )
                                })}
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={cancelMove} style={cancelBtnStyle}>Annulla</button>
                                {moveTargetVehicle && (
                                  <button onClick={() => setMoveConfirm(true)} style={confirmBtnStyle}>
                                    Conferma spostamento
                                  </button>
                                )}
                              </div>
                            </>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <span style={{ fontSize: 14, color: 'var(--text)' }}>
                                Sei sicuro di voler spostare questo partecipante?
                              </span>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={cancelMove} disabled={moving} style={cancelBtnStyle}>Annulla</button>
                                <button onClick={handleMove} disabled={moving} style={confirmBtnStyle}>
                                  {moving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                                  Sposta
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '10px 12px',
  fontSize: 14,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel)',
  color: 'var(--text)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const retryBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '10px 20px',
  fontSize: 14,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  color: 'var(--text)',
  cursor: 'pointer',
}

const refreshBtnStyle: React.CSSProperties = {
  height: 44,
  padding: '0 14px',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  color: 'var(--text)',
  cursor: 'pointer',
}

const assignBtnStyle = (saving: boolean): React.CSSProperties => ({
  minHeight: 44,
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 500,
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: saving ? 'var(--muted)' : 'var(--red)',
  color: '#fff',
  cursor: saving ? 'not-allowed' : 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  alignSelf: 'flex-start',
})

const moveBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  color: 'var(--text)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

const cancelBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 14px',
  fontSize: 13,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  color: 'var(--text)',
  cursor: 'pointer',
}

const confirmBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--red)',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}
