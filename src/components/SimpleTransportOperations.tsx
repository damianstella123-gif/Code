import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, Users, CheckCircle2, Clock, XCircle, Loader2, Phone } from 'lucide-react'
import { useToast } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import {
  fetchTransportMovements,
  fetchTransportBoardingPool,
  boardTransportParticipantDirect,
  transitionTransportVehicle,
  subscribeTransportMovement,
  type TransportMovement,
  type TransportBoardingParticipant,
} from '@/lib/transport-service'

interface Props {
  eventId: string
  disabled?: boolean
}

type View = 'list' | 'vehicles' | 'participants'

interface VehicleRow {
  id: string
  label: string
  vehicle_type: string
  capacity: number | null
  operational_status: 'boarding' | 'departed' | 'cancelled'
  departed_at: string | null
  boarded_count: number
}

export default function SimpleTransportOperations({ eventId, disabled }: Props) {
  const { showToast } = useToast()

  const [view, setView] = useState<View>('list')
  const [movements, setMovements] = useState<TransportMovement[]>([])
  const [loadingMovements, setLoadingMovements] = useState(true)

  const [selectedMovement, setSelectedMovement] = useState<TransportMovement | null>(null)
  const [vehicles, setVehicles] = useState<VehicleRow[]>([])
  const [loadingVehicles, setLoadingVehicles] = useState(false)

  const [selectedVehicle, setSelectedVehicle] = useState<VehicleRow | null>(null)
  const [pool, setPool] = useState<TransportBoardingParticipant[]>([])
  const [loadingPool, setLoadingPool] = useState(false)

  const [boardingId, setBoardingId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ type: 'depart' | 'reopen' | 'cancel'; vehicleId: string } | null>(null)
  const [cancelReason, setCancelReason] = useState('')


  const unsubRef = useRef<(() => void) | null>(null)

  // ─── Load movements ──────────────────────────────────────────────────────────

  const loadMovements = useCallback(async () => {
    setLoadingMovements(true)
    try {
      const data = await fetchTransportMovements(eventId)
      setMovements(data)
    } catch {
      showToast('Errore nel caricamento dei trasferimenti.', 'error')
    } finally {
      setLoadingMovements(false)
    }
  }, [eventId, showToast])

  useEffect(() => { loadMovements() }, [loadMovements])

  // ─── Load vehicles for selected movement ─────────────────────────────────────

  const loadVehicles = useCallback(async (movementId: string) => {
    setLoadingVehicles(true)
    try {
      const { data, error } = await supabase
        .from('transport_vehicles')
        .select('id, label, vehicle_type, capacity, operational_status, departed_at')
        .eq('movement_id', movementId)
        .order('sort_order', { ascending: true })

      if (error) throw error

      const poolData = await fetchTransportBoardingPool(movementId)
      const countByVehicle: Record<string, number> = {}
      for (const p of poolData) {
        if (p.vehicle_id && p.assignment_status === 'boarded') {
          countByVehicle[p.vehicle_id] = (countByVehicle[p.vehicle_id] ?? 0) + 1
        }
      }

      const rows: VehicleRow[] = (data ?? []).map((v: any) => ({
        id: v.id,
        label: v.label,
        vehicle_type: v.vehicle_type,
        capacity: v.capacity,
        operational_status: v.operational_status ?? 'boarding',
        departed_at: v.departed_at,
        boarded_count: countByVehicle[v.id] ?? 0,
      }))
      setVehicles(rows)
    } catch {
      showToast('Errore nel caricamento dei mezzi.', 'error')
    } finally {
      setLoadingVehicles(false)
    }
  }, [showToast])

  // ─── Load boarding pool ──────────────────────────────────────────────────────

  const loadPool = useCallback(async (movementId: string) => {
    setLoadingPool(true)
    try {
      const data = await fetchTransportBoardingPool(movementId)
      data.sort((a, b) => {
        const nameA = `${a.last_name ?? ''} ${a.first_name ?? ''}`.toLowerCase()
        const nameB = `${b.last_name ?? ''} ${b.first_name ?? ''}`.toLowerCase()
        return nameA.localeCompare(nameB)
      })
      setPool(data)
    } catch {
      showToast('Errore nel caricamento partecipanti.', 'error')
    } finally {
      setLoadingPool(false)
    }
  }, [showToast])

  // ─── Realtime subscription ───────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedMovement) return
    const movementId = selectedMovement.id

    const unsub = subscribeTransportMovement(movementId, () => {
      loadVehicles(movementId)
      if (view === 'participants') {
        loadPool(movementId)
      }
    })
    unsubRef.current = unsub

    return () => {
      unsub()
      unsubRef.current = null
    }
  }, [selectedMovement, view, loadVehicles, loadPool])

  // ─── Navigation ──────────────────────────────────────────────────────────────

  const selectMovement = (m: TransportMovement) => {
    setSelectedMovement(m)
    setSelectedVehicle(null)
    setView('vehicles')
    loadVehicles(m.id)
  }

  const selectVehicle = (v: VehicleRow) => {
    if (!selectedMovement) return
    setSelectedVehicle(v)
    setView('participants')
    loadPool(selectedMovement.id)
  }

  const goBack = () => {
    if (view === 'participants') {
      setSelectedVehicle(null)
      setView('vehicles')
      if (selectedMovement) loadVehicles(selectedMovement.id)
    } else if (view === 'vehicles') {
      setSelectedMovement(null)
      setVehicles([])
      setView('list')
    }
  }

  // ─── Board participant ───────────────────────────────────────────────────────

  const handleBoard = async (registrationId: string) => {
    if (!selectedMovement || !selectedVehicle || disabled) return
    if (boardingId) return

    setBoardingId(registrationId)
    try {
      const result = await boardTransportParticipantDirect(
        selectedMovement.id,
        selectedVehicle.id,
        registrationId
      )
      if (result.success) {
        showToast(`${result.first_name} ${result.last_name} imbarcato su ${result.vehicle_label}.`, 'success')
      } else {
        showToast(result.error, 'error')
      }
      await loadPool(selectedMovement.id)
      await loadVehicles(selectedMovement.id)
    } catch {
      showToast('Errore durante l\'imbarco.', 'error')
    } finally {
      setBoardingId(null)
    }
  }

  // ─── Vehicle actions ─────────────────────────────────────────────────────────

  const executeVehicleAction = async () => {
    if (!confirmAction || actionLoading) return

    if (confirmAction.type === 'cancel' && cancelReason.trim().length < 5) {
      showToast('Inserire un motivo di almeno 5 caratteri.', 'error')
      return
    }

    setActionLoading(true)
    try {
      const result = await transitionTransportVehicle(
        confirmAction.vehicleId,
        confirmAction.type === 'depart' ? 'depart' : confirmAction.type === 'reopen' ? 'reopen' : 'cancel',
        confirmAction.type === 'cancel' ? cancelReason.trim() : undefined
      )
      const actionLabels = { depart: 'Partenza confermata', reopen: 'Imbarco riaperto', cancel: 'Mezzo annullato' }
      showToast(`${actionLabels[confirmAction.type]} — ${result.vehicle_label}`, 'success')
      setConfirmAction(null)
      setCancelReason('')
      if (selectedMovement) await loadVehicles(selectedMovement.id)
    } catch (err: any) {
      showToast(err?.message ?? 'Errore nell\'operazione.', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // ─── Render: transfer list ───────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div style={containerStyle}>
        <h3 style={titleStyle}>Trasporti</h3>
        {loadingMovements ? (
          <div style={centerStyle}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : movements.length === 0 ? (
          <p style={emptyStyle}>Nessun trasferimento configurato.</p>
        ) : (
          <div style={cardListStyle}>
            {movements.map(m => (
              <button
                key={m.id}
                style={transferCardStyle}
                onClick={() => selectMovement(m)}
                disabled={disabled}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={cardTitleStyle}>{m.label}</span>
                  <span style={statusBadgeStyle(m.movement_status)}>{statusLabel(m.movement_status)}</span>
                </div>
                <div style={cardMetaStyle}>
                  {m.origin && m.destination && (
                    <span>{m.origin} → {m.destination}</span>
                  )}
                  {m.departure_at && (
                    <span><Clock size={12} style={{ marginRight: 4 }} />{formatTime(m.departure_at)}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Render: vehicles ────────────────────────────────────────────────────────

  if (view === 'vehicles' && selectedMovement) {
    return (
      <div style={containerStyle}>
        <button onClick={goBack} style={backBtnStyle} disabled={disabled}>
          <ArrowLeft size={16} /> Indietro ai transfer
        </button>
        <h3 style={titleStyle}>{selectedMovement.label}</h3>
        {selectedMovement.origin && selectedMovement.destination && (
          <p style={subtitleStyle}>{selectedMovement.origin} → {selectedMovement.destination}</p>
        )}

        {loadingVehicles ? (
          <div style={centerStyle}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : vehicles.length === 0 ? (
          <p style={emptyStyle}>Nessun mezzo configurato.</p>
        ) : (
          <div style={cardListStyle}>
            {vehicles.map(v => {
              const available = v.capacity != null ? v.capacity - v.boarded_count : null
              return (
                <div key={v.id} style={vehicleCardStyle}>
                  <button
                    style={vehicleCardClickableStyle}
                    onClick={() => selectVehicle(v)}
                    disabled={disabled}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={cardTitleStyle}>{v.label}</span>
                      <span style={vehicleStatusBadge(v.operational_status)}>
                        {vehicleStatusLabel(v.operational_status)}
                      </span>
                    </div>
                    <div style={cardMetaStyle}>
                      <span style={{ fontSize: 13 }}>{v.vehicle_type}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Users size={13} />
                        {v.boarded_count}/{v.capacity ?? '∞'}
                        {available != null && <span style={{ fontSize: 12, color: 'var(--muted)' }}> ({available} liberi)</span>}
                      </span>
                    </div>
                    {v.operational_status === 'departed' && v.departed_at && (
                      <span style={{ fontSize: 12, color: 'var(--green)' }}>
                        Partito alle {formatTime(v.departed_at)}
                      </span>
                    )}
                  </button>

                  {/* Vehicle actions */}
                  <div style={vehicleActionsStyle}>
                    {v.operational_status === 'boarding' && (
                      <button
                        style={primaryActionBtnStyle}
                        onClick={() => setConfirmAction({ type: 'depart', vehicleId: v.id })}
                        disabled={disabled || actionLoading}
                      >
                        <CheckCircle2 size={16} /> Conferma partenza
                      </button>
                    )}
                    {v.operational_status === 'departed' && (
                      <button
                        style={secondaryActionBtnStyle}
                        onClick={() => setConfirmAction({ type: 'reopen', vehicleId: v.id })}
                        disabled={disabled || actionLoading}
                      >
                        Riapri imbarco
                      </button>
                    )}
                    {v.operational_status !== 'cancelled' && (
                      <button
                        style={dangerActionBtnStyle}
                        onClick={() => setConfirmAction({ type: 'cancel', vehicleId: v.id })}
                        disabled={disabled || actionLoading}
                      >
                        <XCircle size={14} /> Annulla mezzo
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Confirmation dialog */}
        {confirmAction && (
          <div style={overlayStyle}>
            <div style={dialogStyle}>
              <h4 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
                {confirmAction.type === 'depart' && 'Conferma partenza'}
                {confirmAction.type === 'reopen' && 'Riapri imbarco'}
                {confirmAction.type === 'cancel' && 'Annulla mezzo'}
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--muted)' }}>
                {confirmAction.type === 'depart' && 'Il mezzo risulterà partito. Continuare?'}
                {confirmAction.type === 'reopen' && 'L\'imbarco verrà riaperto. Continuare?'}
                {confirmAction.type === 'cancel' && 'Inserire il motivo dell\'annullamento (min 5 caratteri).'}
              </p>
              {confirmAction.type === 'cancel' && (
                <input
                  style={inputStyle}
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Motivo annullamento..."
                  maxLength={200}
                />
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  style={secondaryActionBtnStyle}
                  onClick={() => { setConfirmAction(null); setCancelReason('') }}
                  disabled={actionLoading}
                >
                  Annulla
                </button>
                <button
                  style={confirmAction.type === 'cancel' ? dangerActionBtnStyle : primaryActionBtnStyle}
                  onClick={executeVehicleAction}
                  disabled={actionLoading || (confirmAction.type === 'cancel' && cancelReason.trim().length < 5)}
                >
                  {actionLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Conferma'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Render: participants ────────────────────────────────────────────────────

  if (view === 'participants' && selectedMovement && selectedVehicle) {
    return (
      <div style={containerStyle}>
        <button onClick={goBack} style={backBtnStyle} disabled={disabled}>
          <ArrowLeft size={16} /> Indietro ai mezzi
        </button>
        <h3 style={titleStyle}>{selectedVehicle.label}</h3>
        <p style={subtitleStyle}>
          {selectedVehicle.vehicle_type} — {selectedVehicle.boarded_count}/{selectedVehicle.capacity ?? '∞'} occupati
        </p>

        {loadingPool ? (
          <div style={centerStyle}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : pool.length === 0 ? (
          <p style={emptyStyle}>Nessun partecipante disponibile.</p>
        ) : (
          <div style={cardListStyle}>
            {pool.map(p => {
              const isBoarded = p.assignment_status === 'boarded'
              const isBoardedOnThis = isBoarded && p.vehicle_id === selectedVehicle.id
              const isBoardedElsewhere = isBoarded && p.vehicle_id !== selectedVehicle.id
              const isLoading = boardingId === p.registration_id

              return (
                <div key={p.registration_id} style={{
                  ...participantRowStyle,
                  opacity: isBoardedElsewhere ? 0.6 : 1,
                  background: isBoardedOnThis ? 'rgba(47, 158, 104, 0.06)' : 'var(--panel)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
                      {p.last_name} {p.first_name}
                    </div>
                    {p.company && (
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{p.company}</div>
                    )}
                    {p.phone && (
                      <a href={`tel:${p.phone}`} style={phoneLinkStyle}>
                        <Phone size={12} /> {p.phone}
                      </a>
                    )}
                    {isBoardedElsewhere && p.vehicle_label && (
                      <div style={{ fontSize: 12, color: 'var(--orange, #e67e22)', marginTop: 4 }}>
                        Già su: {p.vehicle_label}
                      </div>
                    )}
                    {isBoardedOnThis && (
                      <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={12} /> Imbarcato
                      </div>
                    )}
                  </div>

                  {!isBoarded && (
                    <button
                      style={boardBtnStyle}
                      onClick={() => handleBoard(p.registration_id)}
                      disabled={disabled || isLoading || !!boardingId}
                    >
                      {isLoading
                        ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                        : <><CheckCircle2 size={18} /> Salito</>
                      }
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    draft: 'Bozza',
    open: 'Aperto',
    closed: 'Chiuso',
    departed: 'Partito',
    cancelled: 'Annullato',
  }
  return map[s] ?? s
}

function vehicleStatusLabel(s: string): string {
  const map: Record<string, string> = {
    boarding: 'Imbarco',
    departed: 'Partito',
    cancelled: 'Annullato',
  }
  return map[s] ?? s
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 0,
}

const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--text)',
  margin: 0,
}

const subtitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--muted)',
  margin: 0,
}

const centerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 40,
  color: 'var(--muted)',
}

const emptyStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--muted)',
  textAlign: 'center',
  padding: 32,
}

const cardListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const transferCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 16,
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  minHeight: 44,
  transition: 'border-color 0.15s',
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--text)',
}

const cardMetaStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  fontSize: 13,
  color: 'var(--muted)',
  alignItems: 'center',
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const colors: Record<string, { bg: string; fg: string }> = {
    draft: { bg: 'rgba(128,128,128,0.1)', fg: 'var(--muted)' },
    open: { bg: 'rgba(47,158,104,0.1)', fg: 'var(--green)' },
    closed: { bg: 'rgba(59,130,246,0.1)', fg: 'var(--blue, #3b82f6)' },
    departed: { bg: 'rgba(47,158,104,0.15)', fg: 'var(--green)' },
    cancelled: { bg: 'rgba(220,38,38,0.1)', fg: 'var(--red)' },
  }
  const c = colors[status] ?? colors.draft
  return {
    fontSize: 12,
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: 999,
    background: c.bg,
    color: c.fg,
    whiteSpace: 'nowrap',
  }
}

function vehicleStatusBadge(status: string): React.CSSProperties {
  const colors: Record<string, { bg: string; fg: string }> = {
    boarding: { bg: 'rgba(59,130,246,0.1)', fg: 'var(--blue, #3b82f6)' },
    departed: { bg: 'rgba(47,158,104,0.15)', fg: 'var(--green)' },
    cancelled: { bg: 'rgba(220,38,38,0.1)', fg: 'var(--red)' },
  }
  const c = colors[status] ?? colors.boarding
  return {
    fontSize: 12,
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: 999,
    background: c.bg,
    color: c.fg,
    whiteSpace: 'nowrap',
  }
}

const vehicleCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  overflow: 'hidden',
}

const vehicleCardClickableStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 16,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  background: 'none',
  border: 'none',
  minHeight: 44,
}

const vehicleActionsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  padding: '0 16px 16px',
}

const primaryActionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 500,
  color: '#fff',
  background: 'var(--green, #2f9e68)',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
}

const secondaryActionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text)',
  background: 'var(--panel2, var(--panel))',
  border: '1px solid var(--line)',
  borderRadius: 8,
  cursor: 'pointer',
}

const dangerActionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--red)',
  background: 'rgba(220,38,38,0.06)',
  border: '1px solid rgba(220,38,38,0.2)',
  borderRadius: 8,
  cursor: 'pointer',
}

const backBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  padding: '8px 12px',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  alignSelf: 'flex-start',
}

const participantRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 14,
  border: '1px solid var(--line)',
  borderRadius: 10,
}

const boardBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  color: '#fff',
  background: 'var(--green, #2f9e68)',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  flexShrink: 0,
}

const phoneLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 13,
  color: 'var(--blue, #3b82f6)',
  textDecoration: 'none',
  marginTop: 4,
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 16,
}

const dialogStyle: React.CSSProperties = {
  background: 'var(--panel)',
  borderRadius: 12,
  padding: 24,
  maxWidth: 400,
  width: '100%',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '10px 12px',
  fontSize: 14,
  border: '1px solid var(--line)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--text)',
  outline: 'none',
}
