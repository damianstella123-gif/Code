import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Search, RefreshCw, Loader2, AlertCircle, MapPin, ArrowRight, Clock,
  UserCheck, UserX, Undo2, Play, Lock, Unlock, Plane,
} from 'lucide-react'
import { useToast } from '@/lib/toast'
import {
  fetchTransportManifest,
  subscribeTransportMovement,
  boardTransportAssignment,
  transitionTransportAssignment,
  transitionTransportMovement,
  type TransportManifest,
  type TransportManifestVehicle,
  type TransportManifestParticipant,
  type TransportMovementStatus,
} from '@/lib/transport-service'

interface Props {
  movementId: string
  disabled?: boolean
}

const MOVEMENT_STATUS_LABELS: Record<TransportMovementStatus, string> = {
  draft: 'Bozza',
  open: 'Imbarco aperto',
  closed: 'Chiuso',
  departed: 'Partito',
  cancelled: 'Annullato',
}

const MOVEMENT_STATUS_COLORS: Record<TransportMovementStatus, { bg: string; text: string }> = {
  draft: { bg: 'var(--panel2)', text: 'var(--muted)' },
  open: { bg: 'rgba(47, 158, 104, 0.12)', text: 'var(--green)' },
  closed: { bg: 'rgba(47, 111, 190, 0.12)', text: 'var(--blue)' },
  departed: { bg: 'rgba(47, 111, 190, 0.12)', text: 'var(--blue)' },
  cancelled: { bg: 'rgba(211, 28, 48, 0.10)', text: 'var(--red)' },
}

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

export default function TransportLiveManifest({ movementId, disabled }: Props) {
  const { showToast } = useToast()
  const [manifest, setManifest] = useState<TransportManifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null)
  const [movementTransitioning, setMovementTransitioning] = useState(false)
  const [movementConfirm, setMovementConfirm] = useState<TransportMovementStatus | null>(null)

  const mountedRef = useRef(true)
  const requestRef = useRef(0)
  const refreshingRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const loadManifest = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    const reqId = ++requestRef.current
    try {
      const data = await fetchTransportManifest(movementId)
      if (!mountedRef.current || reqId !== requestRef.current) return
      setManifest(data)
      setLoadError(null)
    } catch (err) {
      if (!mountedRef.current || reqId !== requestRef.current) return
      setLoadError(err instanceof Error ? err.message : 'Errore durante il caricamento.')
    } finally {
      if (mountedRef.current && reqId === requestRef.current) setLoading(false)
      refreshingRef.current = false
    }
  }, [movementId])

  useEffect(() => {
    setLoading(true)
    setManifest(null)
    setLoadError(null)
    requestRef.current++
    loadManifest()
  }, [loadManifest])

  // Realtime subscription
  useEffect(() => {
    const unsub = subscribeTransportMovement(movementId, () => {
      loadManifest()
    })
    return unsub
  }, [movementId, loadManifest])

  const handleRefresh = () => {
    loadManifest()
  }

  // ─── Participant Actions ─────────────────────────────────────────────────

  const markBusy = (id: string) => setBusyIds(s => { const n = new Set(s); n.add(id); return n })
  const clearBusy = (id: string) => setBusyIds(s => { const n = new Set(s); n.delete(id); return n })

  const handleBoard = async (assignmentId: string) => {
    if (busyIds.has(assignmentId)) return
    markBusy(assignmentId)
    try {
      await boardTransportAssignment(assignmentId)
      if (mountedRef.current) showToast('Imbarco registrato.', 'success')
    } catch (err) {
      if (mountedRef.current) showToast(err instanceof Error ? err.message : 'Errore.', 'error')
    } finally {
      if (mountedRef.current) clearBusy(assignmentId)
    }
  }

  const handleTransitionAssignment = async (assignmentId: string, target: 'assigned' | 'no_show') => {
    markBusy(assignmentId)
    setConfirmAction(null)
    try {
      await transitionTransportAssignment(assignmentId, target)
      if (mountedRef.current) {
        const msg = target === 'no_show' ? 'Segnato come no-show.' : 'Stato ripristinato.'
        showToast(msg, 'success')
      }
    } catch (err) {
      if (mountedRef.current) showToast(err instanceof Error ? err.message : 'Errore.', 'error')
    } finally {
      if (mountedRef.current) clearBusy(assignmentId)
    }
  }

  // ─── Movement Transitions ───────────────────────────────────────────────

  const handleMovementTransition = async (target: TransportMovementStatus) => {
    setMovementConfirm(null)
    setMovementTransitioning(true)
    try {
      await transitionTransportMovement(movementId, target)
      if (mountedRef.current) showToast('Stato aggiornato.', 'success')
    } catch (err) {
      if (mountedRef.current) showToast(err instanceof Error ? err.message : 'Errore.', 'error')
    } finally {
      if (mountedRef.current) setMovementTransitioning(false)
    }
  }

  // ─── Derived data ──────────────────────────────────────────────────────

  const movementStatus = manifest?.movement.movement_status ?? 'draft'
  const canAct = !disabled && movementStatus === 'open'
  const canTransition = !disabled && !['departed', 'cancelled'].includes(movementStatus)

  const participantsByVehicle = useMemo(() => {
    if (!manifest) return new Map<string, { vehicle: TransportManifestVehicle; participants: TransportManifestParticipant[] }>()
    const map = new Map<string, { vehicle: TransportManifestVehicle; participants: TransportManifestParticipant[] }>()
    for (const v of manifest.vehicles) map.set(v.id, { vehicle: v, participants: [] })
    for (const a of manifest.assignments) {
      const entry = map.get(a.vehicle_id)
      if (entry) entry.participants.push(a)
    }
    return map
  }, [manifest])

  const filteredByVehicle = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return participantsByVehicle
    const result = new Map<string, { vehicle: TransportManifestVehicle; participants: TransportManifestParticipant[] }>()
    for (const [vid, entry] of participantsByVehicle) {
      const filtered = entry.participants.filter(p =>
        (p.first_name ?? '').toLowerCase().includes(q) ||
        (p.last_name ?? '').toLowerCase().includes(q) ||
        (p.company ?? '').toLowerCase().includes(q)
      )
      if (filtered.length > 0) result.set(vid, { vehicle: entry.vehicle, participants: filtered })
    }
    return result
  }, [participantsByVehicle, search])

  // ─── Render: Loading / Error ───────────────────────────────────────────

  if (loading && !manifest) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>Caricamento manifest live...</span>
      </div>
    )
  }

  if (loadError && !manifest) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32 }}>
        <AlertCircle size={24} style={{ color: 'var(--red)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>{loadError}</span>
        <button onClick={handleRefresh} style={retryBtnStyle}>Riprova</button>
      </div>
    )
  }

  if (!manifest) return null

  const { totals, movement } = manifest
  const statusColor = MOVEMENT_STATUS_COLORS[movementStatus]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── MOVEMENT HEADER ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--panel-solid)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{movement.label}</span>
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: statusColor.bg, color: statusColor.text, fontWeight: 600 }}>
            {MOVEMENT_STATUS_LABELS[movementStatus]}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
          <MapPin size={13} />
          <span>{movement.origin || '—'}</span>
          <ArrowRight size={12} />
          <span>{movement.destination || '—'}</span>
          <span style={{ opacity: 0.4, margin: '0 4px' }}>|</span>
          <Clock size={13} />
          <span>{formatDt(movement.departure_at)}</span>
        </div>

        {/* Movement actions */}
        {canTransition && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {movementStatus === 'draft' && (
              <TransitionBtn
                label="Apri imbarco"
                icon={<Play size={14} />}
                target="open"
                confirming={movementConfirm}
                transitioning={movementTransitioning}
                onConfirm={setMovementConfirm}
                onExecute={handleMovementTransition}
                onCancel={() => setMovementConfirm(null)}
              />
            )}
            {movementStatus === 'open' && (
              <TransitionBtn
                label="Chiudi manifest"
                icon={<Lock size={14} />}
                target="closed"
                confirming={movementConfirm}
                transitioning={movementTransitioning}
                onConfirm={setMovementConfirm}
                onExecute={handleMovementTransition}
                onCancel={() => setMovementConfirm(null)}
              />
            )}
            {movementStatus === 'closed' && (
              <>
                <TransitionBtn
                  label="Riapri manifest"
                  icon={<Unlock size={14} />}
                  target="open"
                  confirming={movementConfirm}
                  transitioning={movementTransitioning}
                  onConfirm={setMovementConfirm}
                  onExecute={handleMovementTransition}
                  onCancel={() => setMovementConfirm(null)}
                />
                <TransitionBtn
                  label="Segna partito"
                  icon={<Plane size={14} />}
                  target="departed"
                  confirming={movementConfirm}
                  transitioning={movementTransitioning}
                  onConfirm={setMovementConfirm}
                  onExecute={handleMovementTransition}
                  onCancel={() => setMovementConfirm(null)}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── GLOBAL COUNTERS ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
        <CounterCard label="Previsti" value={totals.expected} color="var(--text)" />
        <CounterCard label="A bordo" value={totals.boarded} color="var(--green)" />
        <CounterCard label="Mancanti" value={totals.missing} color="var(--orange, #e67e22)" />
        <CounterCard label="No-show" value={totals.no_show} color="var(--red)" />
      </div>

      {/* ─── SEARCH + REFRESH ─── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca partecipante..."
            style={{ ...inputStyle, paddingLeft: 36 }}
          />
        </div>
        <button onClick={handleRefresh} style={refreshBtnStyle} title="Aggiorna">
          <RefreshCw size={16} />
          Aggiorna
        </button>
      </div>

      {/* ─── VEHICLE PANELS ─── */}
      {Array.from(filteredByVehicle.entries()).map(([vid, { vehicle, participants }]) => {
        const progress = vehicle.expected_count > 0 ? (vehicle.boarded_count / vehicle.expected_count) * 100 : 0
        return (
          <div key={vid} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {/* Vehicle header */}
            <div style={{ padding: '12px 14px', background: 'var(--panel2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{vehicle.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{vehicle.vehicle_type}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
                  {vehicle.capacity != null && <span>Cap: {vehicle.capacity}</span>}
                  <span style={{ color: 'var(--green)' }}>{vehicle.boarded_count}/{vehicle.expected_count}</span>
                  {vehicle.missing_count > 0 && <span style={{ color: 'var(--orange, #e67e22)' }}>Manc: {vehicle.missing_count}</span>}
                  {vehicle.no_show_count > 0 && <span style={{ color: 'var(--red)' }}>NS: {vehicle.no_show_count}</span>}
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: 'var(--green)', width: `${Math.min(progress, 100)}%`, transition: 'width 0.3s ease' }} />
              </div>
            </div>

            {/* Participants */}
            {participants.length === 0 && (
              <div style={{ padding: 16, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
                Nessun risultato.
              </div>
            )}
            {participants.map(p => {
              const isBusy = busyIds.has(p.assignment_id)
              const sColor = ASSIGNMENT_STATUS_COLORS[p.assignment_status] ?? ASSIGNMENT_STATUS_COLORS.assigned
              const isConfirming = confirmAction?.id === p.assignment_id
              return (
                <div key={p.assignment_id} style={{ padding: '10px 14px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
                        {p.last_name ?? ''} {p.first_name ?? ''}
                      </span>
                      {p.company && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{p.company}</span>}
                      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: sColor.bg, color: sColor.text, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {ASSIGNMENT_STATUS_LABELS[p.assignment_status] ?? p.assignment_status}
                      </span>
                    </div>

                    {/* Actions */}
                    {canAct && !isConfirming && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {p.assignment_status === 'assigned' && (
                          <>
                            <button onClick={() => handleBoard(p.assignment_id)} disabled={isBusy} style={boardBtnStyle}>
                              {isBusy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <UserCheck size={14} />}
                              A bordo
                            </button>
                            <button onClick={() => setConfirmAction({ id: p.assignment_id, action: 'no_show' })} disabled={isBusy} style={secondaryBtnStyle}>
                              <UserX size={13} />
                              No-show
                            </button>
                          </>
                        )}
                        {p.assignment_status === 'boarded' && (
                          <button onClick={() => setConfirmAction({ id: p.assignment_id, action: 'undo_board' })} disabled={isBusy} style={secondaryBtnStyle}>
                            <Undo2 size={13} />
                            Annulla spunta
                          </button>
                        )}
                        {p.assignment_status === 'no_show' && (
                          <button onClick={() => handleTransitionAssignment(p.assignment_id, 'assigned')} disabled={isBusy} style={secondaryBtnStyle}>
                            {isBusy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Undo2 size={13} />}
                            Ripristina
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Confirm dialog */}
                  {isConfirming && (
                    <div style={{ padding: 10, background: 'var(--panel2)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: 'var(--text)' }}>
                        {confirmAction.action === 'no_show' ? 'Confermi no-show?' : 'Annullare l\'imbarco?'}
                      </span>
                      <button
                        onClick={() => setConfirmAction(null)}
                        style={cancelSmStyle}
                      >
                        Annulla
                      </button>
                      <button
                        onClick={() => handleTransitionAssignment(p.assignment_id, confirmAction.action === 'no_show' ? 'no_show' : 'assigned')}
                        disabled={isBusy}
                        style={dangerSmStyle}
                      >
                        {isBusy && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                        Conferma
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {manifest.assignments.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          Nessun partecipante assegnato a questo trasferimento.
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CounterCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)', background: 'var(--panel-solid)', textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function TransitionBtn({
  label, icon, target, confirming, transitioning, onConfirm, onExecute, onCancel,
}: {
  label: string
  icon: React.ReactNode
  target: TransportMovementStatus
  confirming: TransportMovementStatus | null
  transitioning: boolean
  onConfirm: (t: TransportMovementStatus) => void
  onExecute: (t: TransportMovementStatus) => void
  onCancel: () => void
}) {
  const isThis = confirming === target
  if (isThis) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--text)' }}>Confermi?</span>
        <button onClick={onCancel} disabled={transitioning} style={cancelSmStyle}>No</button>
        <button onClick={() => onExecute(target)} disabled={transitioning} style={dangerSmStyle}>
          {transitioning && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
          Si
        </button>
      </div>
    )
  }
  return (
    <button onClick={() => onConfirm(target)} disabled={transitioning} style={transitionBtnStyle}>
      {icon}
      {label}
    </button>
  )
}

function formatDt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  minHeight: 48,
  padding: '12px 20px',
  fontSize: 14,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  color: 'var(--text)',
  cursor: 'pointer',
}

const refreshBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  color: 'var(--text)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const boardBtnStyle: React.CSSProperties = {
  minHeight: 48,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--green)',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const secondaryBtnStyle: React.CSSProperties = {
  minHeight: 48,
  padding: '10px 12px',
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

const transitionBtnStyle: React.CSSProperties = {
  minHeight: 48,
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  color: 'var(--text)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const cancelSmStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 12px',
  fontSize: 12,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  color: 'var(--text)',
  cursor: 'pointer',
}

const dangerSmStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 600,
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--red)',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}
