import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Bus, MapPin, ArrowRight, Clock, Edit3, X, Loader2, AlertCircle } from 'lucide-react'
import { useToast } from '@/lib/toast'
import {
  fetchTransportMovements,
  saveTransportMovement,
  type TransportMovement,
  type TransportMovementStatus,
} from '@/lib/transport-service'

interface Props {
  eventId: string
  disabled?: boolean
  onMovementSelected?: (movementId: string | null) => void
}

const STATUS_LABELS: Record<TransportMovementStatus, string> = {
  draft: 'Bozza',
  open: 'Aperto',
  closed: 'Chiuso',
  departed: 'Partito',
  cancelled: 'Annullato',
}

const STATUS_COLORS: Record<TransportMovementStatus, { bg: string; text: string }> = {
  draft: { bg: 'var(--panel2)', text: 'var(--muted)' },
  open: { bg: 'rgba(47, 158, 104, 0.12)', text: 'var(--green)' },
  closed: { bg: 'rgba(47, 111, 190, 0.12)', text: 'var(--blue)' },
  departed: { bg: 'rgba(47, 111, 190, 0.12)', text: 'var(--blue)' },
  cancelled: { bg: 'rgba(211, 28, 48, 0.10)', text: 'var(--red)' },
}

interface MovementFormData {
  label: string
  movementType: string
  departureAt: string
  origin: string
  destination: string
}

const EMPTY_FORM: MovementFormData = {
  label: '',
  movementType: 'transfer',
  departureAt: '',
  origin: '',
  destination: '',
}

function formatDeparture(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export default function TransportMovementManager({ eventId, disabled, onMovementSelected }: Props) {
  const { showToast } = useToast()
  const [movements, setMovements] = useState<TransportMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<MovementFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const loadMovements = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await fetchTransportMovements(eventId)
      if (!mountedRef.current) return
      setMovements(data)
    } catch (err) {
      if (!mountedRef.current) return
      setLoadError(err instanceof Error ? err.message : 'Errore durante il caricamento.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    loadMovements()
  }, [loadMovements])

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(prev => {
      const next = prev === id ? null : id
      onMovementSelected?.(next)
      return next
    })
  }, [onMovementSelected])

  const openCreateForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEditForm = (m: TransportMovement) => {
    setEditingId(m.id)
    setForm({
      label: m.label,
      movementType: m.movement_type,
      departureAt: m.departure_at ? m.departure_at.slice(0, 16) : '',
      origin: m.origin,
      destination: m.destination,
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleSave = async () => {
    const trimmedLabel = form.label.trim()
    if (!trimmedLabel) {
      showToast('Il nome del trasferimento è obbligatorio.', 'error')
      return
    }
    setSaving(true)
    try {
      const savedId = await saveTransportMovement({
        movementId: editingId,
        eventId: editingId ? undefined : eventId,
        label: trimmedLabel,
        movementType: form.movementType || 'transfer',
        departureAt: form.departureAt || null,
        origin: form.origin.trim(),
        destination: form.destination.trim(),
      })
      if (!mountedRef.current) return
      showToast(editingId ? 'Trasferimento aggiornato.' : 'Trasferimento creato.', 'success')
      closeForm()
      await loadMovements()
      if (mountedRef.current) {
        setSelectedId(savedId)
        onMovementSelected?.(savedId)
      }
    } catch (err) {
      if (!mountedRef.current) return
      showToast(err instanceof Error ? err.message : 'Errore durante il salvataggio.', 'error')
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  const isEditable = (m: TransportMovement) =>
    !disabled && (m.movement_status === 'draft' || m.movement_status === 'open')

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>Caricamento trasferimenti...</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32 }}>
        <AlertCircle size={24} style={{ color: 'var(--red)' }} />
        <span style={{ fontSize: 14, color: 'var(--text)' }}>{loadError}</span>
        <button
          onClick={loadMovements}
          style={{
            minHeight: 44,
            padding: '10px 20px',
            fontSize: 14,
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--panel-solid)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          Riprova
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Trasferimenti
        </h3>
        {!disabled && !showForm && (
          <button
            onClick={openCreateForm}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 44,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 500,
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--red)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <Plus size={16} />
            Nuovo trasferimento
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div style={{
          padding: 16,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--panel-solid)',
          border: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {editingId ? 'Modifica trasferimento' : 'Nuovo trasferimento'}
            </span>
            <button
              onClick={closeForm}
              disabled={saving}
              style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
            >
              <X size={18} />
            </button>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Nome *</span>
            <input
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              disabled={saving}
              placeholder="Es. Transfer aeroporto - hotel"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Tipo</span>
            <select
              value={form.movementType}
              onChange={e => setForm(f => ({ ...f, movementType: e.target.value }))}
              disabled={saving}
              style={inputStyle}
            >
              <option value="transfer">Transfer</option>
              <option value="shuttle">Navetta</option>
              <option value="bus">Bus</option>
              <option value="taxi">Taxi</option>
              <option value="other">Altro</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Partenza (data e ora)</span>
            <input
              type="datetime-local"
              value={form.departureAt}
              onChange={e => setForm(f => ({ ...f, departureAt: e.target.value }))}
              disabled={saving}
              style={inputStyle}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Origine</span>
              <input
                value={form.origin}
                onChange={e => setForm(f => ({ ...f, origin: e.target.value }))}
                disabled={saving}
                placeholder="Es. Aeroporto Fiumicino"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Destinazione</span>
              <input
                value={form.destination}
                onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                disabled={saving}
                placeholder="Es. Hotel Excelsior"
                style={inputStyle}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={closeForm}
              disabled={saving}
              style={{
                minHeight: 44,
                padding: '10px 16px',
                fontSize: 14,
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--panel-solid)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              Annulla
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
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
              }}
            >
              {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {editingId ? 'Salva modifiche' : 'Crea trasferimento'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {movements.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          <Bus size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p style={{ margin: 0 }}>Nessun trasferimento pianificato per questo evento.</p>
        </div>
      )}

      {/* Movement cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {movements.map(m => {
          const isSelected = selectedId === m.id
          const colors = STATUS_COLORS[m.movement_status]
          return (
            <div
              key={m.id}
              onClick={() => handleSelect(m.id)}
              style={{
                padding: 14,
                borderRadius: 'var(--radius-sm)',
                background: isSelected ? 'var(--panel2)' : 'var(--panel-solid)',
                border: isSelected ? '2px solid var(--red)' : '1px solid var(--line)',
                cursor: 'pointer',
                transition: 'var(--transition-fast)',
                minHeight: 44,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                      {m.label}
                    </span>
                    <span style={{
                      fontSize: 12,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: colors.bg,
                      color: colors.text,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}>
                      {STATUS_LABELS[m.movement_status]}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
                    <Bus size={13} />
                    <span>{m.movement_type}</span>
                    <span style={{ opacity: 0.4 }}>|</span>
                    <Clock size={13} />
                    <span>{formatDeparture(m.departure_at)}</span>
                  </div>
                  {(m.origin || m.destination) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                      <MapPin size={13} />
                      <span>{m.origin || '—'}</span>
                      <ArrowRight size={12} />
                      <span>{m.destination || '—'}</span>
                    </div>
                  )}
                </div>
                {isEditable(m) && (
                  <button
                    onClick={e => { e.stopPropagation(); openEditForm(m) }}
                    style={{
                      minWidth: 44,
                      minHeight: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--muted)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                    title="Modifica"
                  >
                    <Edit3 size={16} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
