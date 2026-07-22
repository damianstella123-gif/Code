import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, Users, CheckCircle2, Clock, XCircle, Loader2, Phone, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import {
  fetchTransportMovements,
  fetchTransportBoardingPool,
  boardTransportParticipantDirect,
  unboardTransportAssignment,
  transitionTransportVehicle,
  transitionTransportMovement,
  saveTransportVehicle,
  saveTransportMovement,
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
  plate: string
  driver_name: string
  driver_phone: string
  sort_order: number
  operational_status: 'boarding' | 'departed' | 'cancelled'
  departed_at: string | null
  boarded_count: number
}

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  van: 'Minivan', minibus: 'Minibus', bus: 'Pullman', car: 'Auto', other: 'Altro'
}
function vehicleTypeLabel(t: string) { return VEHICLE_TYPE_LABELS[t] || t }

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
  const [unboardConfirmId, setUnboardConfirmId] = useState<string | null>(null)
  const [unboardingId, setUnboardingId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ type: 'depart' | 'reopen' | 'cancel'; vehicleId: string } | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  // Vehicle form state
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null)
  const [vfLabel, setVfLabel] = useState('')
  const [vfType, setVfType] = useState('')
  const [vfCapacity, setVfCapacity] = useState('')
  const [savingVehicle, setSavingVehicle] = useState(false)
  const [vfError, setVfError] = useState('')

  // Delete vehicle state
  const [deleteVehicleId, setDeleteVehicleId] = useState<string | null>(null)
  const [deletingVehicle, setDeletingVehicle] = useState(false)

  // Delete transfer confirmation state
  const [deleteMovementId, setDeleteMovementId] = useState<string | null>(null)
  const [deletingMovement, setDeletingMovement] = useState(false)

  // New transfer form state
  const [showTransferForm, setShowTransferForm] = useState(false)
  const [tfLabel, setTfLabel] = useState('')
  const [tfOrigin, setTfOrigin] = useState('')
  const [tfDestination, setTfDestination] = useState('')
  const [tfDepartureAt, setTfDepartureAt] = useState('')
  const [tfError, setTfError] = useState('')
  const [savingTransfer, setSavingTransfer] = useState(false)


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
        .select('id, label, vehicle_type, capacity, plate, driver_name, driver_phone, sort_order, operational_status, departed_at')
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
        plate: v.plate ?? '',
        driver_name: v.driver_name ?? '',
        driver_phone: v.driver_phone ?? '',
        sort_order: v.sort_order ?? 0,
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

  const handleUnboard = async (assignmentId: string, participantName: string) => {
    if (!selectedMovement || disabled) return
    if (unboardingId) return

    setUnboardingId(assignmentId)
    try {
      const result = await unboardTransportAssignment(assignmentId)
      if (result.success) {
        showToast(`Spunta di ${participantName} rimossa.`, 'success')
      } else {
        showToast(result.error ?? 'Errore nella rimozione.', 'error')
      }
      await loadPool(selectedMovement.id)
      await loadVehicles(selectedMovement.id)
    } catch {
      showToast('Errore nella rimozione della spunta.', 'error')
    } finally {
      setUnboardingId(null)
      setUnboardConfirmId(null)
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
    const activeMovements = movements.filter(m => m.movement_status !== 'cancelled')
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ ...titleStyle, margin: 0 }}>Trasporti</h3>
          <button
            style={primaryActionBtnStyle}
            onClick={() => { setShowTransferForm(true); setTfLabel(''); setTfOrigin(''); setTfDestination(''); setTfDepartureAt(''); setTfError('') }}
            disabled={disabled}
          >
            + Nuovo transfer
          </button>
        </div>

        {showTransferForm && (
          <div style={inlineFormStyle}>
            <h4 style={{ margin: '0 0 12px' }}>Nuovo Transfer</h4>
            <input style={inputStyle} placeholder="Nome transfer *" value={tfLabel} onChange={e => { setTfLabel(e.target.value); setTfError('') }} maxLength={100} />
            <input style={inputStyle} placeholder="Origine" value={tfOrigin} onChange={e => setTfOrigin(e.target.value)} maxLength={100} />
            <input style={inputStyle} placeholder="Destinazione" value={tfDestination} onChange={e => setTfDestination(e.target.value)} maxLength={100} />
            <input style={inputStyle} type="datetime-local" value={tfDepartureAt} onChange={e => setTfDepartureAt(e.target.value)} />
            {tfError && <p style={formErrorStyle}>{tfError}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                style={primaryActionBtnStyle}
                disabled={savingTransfer}
                onClick={async () => {
                  if (!tfLabel.trim()) { setTfError('Il nome del transfer è obbligatorio.'); return }
                  setSavingTransfer(true)
                  try {
                    const newId = await saveTransportMovement({
                      movementId: null,
                      eventId,
                      label: tfLabel.trim(),
                      movementType: 'transfer',
                      departureAt: tfDepartureAt || null,
                      origin: tfOrigin.trim(),
                      destination: tfDestination.trim()
                    })
                    showToast('Transfer creato correttamente', 'success')
                    setShowTransferForm(false)
                    setTfLabel(''); setTfOrigin(''); setTfDestination(''); setTfDepartureAt(''); setTfError('')
                    await loadMovements()
                    const fresh = await fetchTransportMovements(eventId)
                    const created = fresh.find(m => m.id === newId)
                    if (created) selectMovement(created)
                  } catch (err: any) {
                    showToast(err?.message ?? 'Errore nella creazione.', 'error')
                  } finally {
                    setSavingTransfer(false)
                  }
                }}
              >
                {savingTransfer ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Salva'}
              </button>
              <button style={secondaryActionBtnStyle} onClick={() => setShowTransferForm(false)} disabled={savingTransfer}>Annulla</button>
            </div>
          </div>
        )}

        {loadingMovements ? (
          <div style={centerStyle}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : activeMovements.length === 0 ? (
          <p style={emptyStyle}>Nessun transfer presente. Crea il primo transfer per iniziare.</p>
        ) : (
          <div style={cardListStyle}>
            {activeMovements.map(m => (
              <div key={m.id} style={{ position: 'relative' }}>
                <button
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
                <button
                  style={deleteTransferBtnStyle}
                  title="Elimina transfer"
                  onClick={(e) => { e.stopPropagation(); setDeleteMovementId(m.id) }}
                  disabled={disabled}
                >
                  <XCircle size={16} />
                </button>

                {deleteMovementId === m.id && (
                  <div style={confirmOverlayStyle}>
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--text)' }}>
                      Annullare il transfer <strong>{m.label}</strong>?
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        style={dangerActionBtnStyle}
                        disabled={deletingMovement}
                        onClick={async (e) => {
                          e.stopPropagation()
                          setDeletingMovement(true)
                          try {
                            await transitionTransportMovement(m.id, 'cancelled')
                            showToast(`Transfer "${m.label}" annullato.`, 'success')
                            setDeleteMovementId(null)
                            await loadMovements()
                          } catch (err: any) {
                            showToast(err?.message ?? 'Errore nell\'annullamento.', 'error')
                          } finally {
                            setDeletingMovement(false)
                          }
                        }}
                      >
                        {deletingMovement ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Conferma'}
                      </button>
                      <button
                        style={secondaryActionBtnStyle}
                        onClick={(e) => { e.stopPropagation(); setDeleteMovementId(null) }}
                        disabled={deletingMovement}
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                )}
              </div>
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

        {/* Add vehicle button */}
        <button
          style={primaryActionBtnStyle}
          onClick={() => { setShowVehicleForm(true); setEditingVehicleId(null); setVfLabel(''); setVfType(''); setVfCapacity(''); setVfError('') }}
          disabled={disabled || showVehicleForm}
        >
          + Aggiungi mezzo
        </button>

        {/* Vehicle creation form */}
        {showVehicleForm && (
          <div style={inlineFormStyle}>
            <input
              style={inputStyle}
              placeholder="Nome del mezzo"
              value={vfLabel}
              onChange={e => { setVfLabel(e.target.value); setVfError('') }}
              maxLength={100}
            />
            <select
              style={inputStyle}
              value={vfType}
              onChange={e => { setVfType(e.target.value); setVfError('') }}
            >
              <option value="">Seleziona tipologia...</option>
              <option value="van">Minivan</option>
              <option value="minibus">Minibus</option>
              <option value="bus">Pullman</option>
              <option value="car">Auto</option>
              <option value="other">Altro</option>
            </select>
            <input
              style={inputStyle}
              placeholder="Capienza (numero posti)"
              type="number"
              min={1}
              value={vfCapacity}
              onChange={e => { setVfCapacity(e.target.value); setVfError('') }}
            />
            {vfError && <p style={formErrorStyle}>{vfError}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                style={primaryActionBtnStyle}
                disabled={savingVehicle}
                onClick={async () => {
                  if (savingVehicle) return
                  if (!selectedMovement) { setVfError('Nessun transfer selezionato.'); return }
                  if (!vfLabel.trim()) { setVfError('Il nome del mezzo è obbligatorio.'); return }
                  if (!vfType) { setVfError('Selezionare una tipologia.'); return }
                  const parsed = Number.parseInt(vfCapacity, 10)
                  if (!vfCapacity || Number.isNaN(parsed) || parsed <= 0) {
                    setVfError('La capienza deve essere un numero intero maggiore di zero.')
                    return
                  }
                  setSavingVehicle(true)
                  setVfError('')
                  try {
                    await saveTransportVehicle({
                      vehicleId: editingVehicleId ?? null,
                      movementId: selectedMovement.id,
                      label: vfLabel.trim(),
                      vehicleType: vfType,
                      capacity: parsed,
                      plate: '',
                      driverName: '',
                      driverPhone: '',
                      sortOrder: editingVehicleId
                        ? (vehicles.find(v => v.id === editingVehicleId)?.sort_order ?? vehicles.length)
                        : vehicles.length,
                    })
                    showToast(editingVehicleId ? 'Mezzo modificato correttamente' : 'Mezzo aggiunto correttamente', 'success')
                    setShowVehicleForm(false)
                    setEditingVehicleId(null)
                    setVfLabel(''); setVfType(''); setVfCapacity(''); setVfError('')
                    await loadVehicles(selectedMovement.id)
                  } catch (err: any) {
                    showToast(err?.message ?? 'Errore nel salvataggio del mezzo.', 'error')
                  } finally {
                    setSavingVehicle(false)
                  }
                }}
              >
                {savingVehicle ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Salva'}
              </button>
              <button
                style={secondaryActionBtnStyle}
                onClick={() => { setShowVehicleForm(false); setEditingVehicleId(null); setVfError('') }}
                disabled={savingVehicle}
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        {loadingVehicles ? (
          <div style={centerStyle}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : vehicles.length === 0 ? (
          <p style={emptyStyle}>Nessun mezzo configurato.</p>
        ) : (
          <div style={cardListStyle}>
            {vehicles.filter(v => v.operational_status !== 'cancelled').map(v => {
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
                      <span style={{ fontSize: 13 }}>{vehicleTypeLabel(v.vehicle_type)}</span>
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

                  {/* Vehicle actions - always visible regardless of status */}
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
                    <button
                      style={secondaryActionBtnStyle}
                      onClick={() => {
                        setEditingVehicleId(v.id)
                        setVfLabel(v.label)
                        setVfType(v.vehicle_type)
                        setVfCapacity(v.capacity != null ? String(v.capacity) : '')
                        setVfError('')
                        setShowVehicleForm(true)
                      }}
                      disabled={disabled}
                    >
                      <Pencil size={14} /> Modifica
                    </button>
                    <button
                      style={dangerActionBtnStyle}
                      onClick={() => { setDeleteVehicleId(v.id) }}
                      disabled={disabled}
                    >
                      <Trash2 size={14} /> Elimina
                    </button>
                  </div>

                  {/* Delete vehicle confirmation */}
                  {deleteVehicleId === v.id && (
                    <div style={confirmOverlayStyle}>
                      <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text)' }}>
                        Eliminare questo mezzo?
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button
                          style={dangerActionBtnStyle}
                          disabled={deletingVehicle}
                          onClick={async () => {
                            if (deletingVehicle) return
                            setDeletingVehicle(true)
                            try {
                              await transitionTransportVehicle(v.id, 'cancel', 'Annullato manualmente')
                              showToast(`Mezzo "${v.label}" eliminato.`, 'success')
                              setDeleteVehicleId(null)
                              setSelectedVehicle(null)
                              if (selectedMovement) await loadVehicles(selectedMovement.id)
                            } catch (err: any) {
                              showToast(err?.message ?? 'Errore nell\'eliminazione.', 'error')
                            } finally {
                              setDeletingVehicle(false)
                            }
                          }}
                        >
                          {deletingVehicle ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Conferma'}
                        </button>
                        <button
                          style={secondaryActionBtnStyle}
                          onClick={() => setDeleteVehicleId(null)}
                          disabled={deletingVehicle}
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  )}
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
              const isLoading = boardingId === p.registration_id || (unboardingId !== null &&
                p.assignment_id !== null &&
                unboardingId === p.assignment_id)
              const participantName = `${p.last_name} ${p.first_name}`

              const handleCardClick = () => {
                if (disabled || isLoading || !!boardingId || !!unboardingId) return
                if (isBoardedElsewhere) return
                if (!isBoardedOnThis) {
                  handleBoard(p.registration_id)
                } else {
                  setUnboardConfirmId(p.assignment_id)
                }
              }

              return (
                <div key={p.registration_id} style={{ position: 'relative' }}>
                  <button
                    style={{
                      ...participantToggleStyle,
                      opacity: isBoardedElsewhere ? 0.6 : 1,
                      background: isBoardedOnThis ? 'rgba(47, 158, 104, 0.1)' : 'var(--panel)',
                      borderColor: isBoardedOnThis ? 'var(--green, #2f9e68)' : 'var(--line)',
                      cursor: isBoardedElsewhere ? 'not-allowed' : 'pointer',
                    }}
                    onClick={handleCardClick}
                    disabled={disabled || isLoading || !!boardingId || !!unboardingId}
                  >
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
                        {p.last_name} {p.first_name}
                      </div>
                      {p.company && (
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{p.company}</div>
                      )}
                      {p.phone && (
                        <a
                          href={`tel:${p.phone}`}
                          style={phoneLinkStyle}
                          onClick={e => e.stopPropagation()}
                        >
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
                          <CheckCircle2 size={12} /> Salito
                        </div>
                      )}
                    </div>

                    <div style={toggleIndicatorStyle}>
                      {isLoading
                        ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                        : isBoardedOnThis
                          ? <CheckCircle2 size={20} color="var(--green, #2f9e68)" />
                          : !isBoardedElsewhere
                            ? <div style={emptyCircleStyle} />
                            : null
                      }
                    </div>
                  </button>

                  {unboardConfirmId !== null &&
                          p.assignment_id !== null &&
                          unboardConfirmId === p.assignment_id && (
                    <div style={confirmOverlayStyle}>
                      <p style={{ margin: 0, fontSize: 14, color: 'var(--text)' }}>
                        Rimuovere la spunta di <strong>{participantName}</strong>?
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          style={dangerActionBtnStyle}
                          disabled={!!unboardingId}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleUnboard(p.assignment_id!, participantName)
                          }}
                        >
                          {unboardingId === p.assignment_id
                            ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                            : 'Conferma'}
                        </button>
                        <button
                          style={secondaryActionBtnStyle}
                          onClick={(e) => { e.stopPropagation(); setUnboardConfirmId(null) }}
                          disabled={!!unboardingId}
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
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

const inlineFormStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 16,
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 10,
}

const deleteTransferBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  background: 'none',
  border: 'none',
  color: 'var(--muted)',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 6,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  minWidth: 44,
}

const confirmOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 2,
}

const formErrorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: '#dc2626',
  lineHeight: 1.4,
}

const participantToggleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '12px 16px',
  border: '1px solid var(--line)',
  borderRadius: 10,
  cursor: 'pointer',
  background: 'var(--panel)',
  transition: 'background 0.15s, border-color 0.15s',
  minHeight: 44,
}

const toggleIndicatorStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
}

const emptyCircleStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: '50%',
  border: '2px solid var(--muted)',
}
