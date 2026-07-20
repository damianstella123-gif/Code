import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Truck, Edit3, X, Loader2, AlertCircle, Users } from 'lucide-react'
import { useToast } from '@/lib/toast'
import {
  fetchTransportManifest,
  saveTransportVehicle,
  type TransportManifest,
  type TransportManifestVehicle,
  type TransportMovementStatus,
} from '@/lib/transport-service'

interface Props {
  movementId: string
  disabled?: boolean
}

interface VehicleFormData {
  label: string
  vehicleType: string
  capacity: string
  plate: string
  driverName: string
  driverPhone: string
  sortOrder: string
}

const EMPTY_FORM: VehicleFormData = {
  label: '',
  vehicleType: 'bus',
  capacity: '',
  plate: '',
  driverName: '',
  driverPhone: '',
  sortOrder: '0',
}

const EDITABLE_STATUSES: TransportMovementStatus[] = ['draft', 'open']

export default function TransportVehicleManager({ movementId, disabled }: Props) {
  const { showToast } = useToast()
  const [manifest, setManifest] = useState<TransportManifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<VehicleFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await fetchTransportManifest(movementId)
      if (!mountedRef.current) return
      setManifest(data)
    } catch (err) {
      if (!mountedRef.current) return
      setLoadError(err instanceof Error ? err.message : 'Errore durante il caricamento.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [movementId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const canEdit = !disabled && manifest && EDITABLE_STATUSES.includes(manifest.movement.movement_status)

  const openCreateForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEditForm = (v: TransportManifestVehicle) => {
    setEditingId(v.id)
    setForm({
      label: v.label,
      vehicleType: v.vehicle_type,
      capacity: v.capacity != null ? String(v.capacity) : '',
      plate: '',
      driverName: '',
      driverPhone: '',
      sortOrder: '0',
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
      showToast('Il nome del mezzo è obbligatorio.', 'error')
      return
    }
    const capacityNum = form.capacity ? parseInt(form.capacity, 10) : null
    if (capacityNum !== null && (isNaN(capacityNum) || capacityNum <= 0)) {
      showToast('La capienza deve essere un numero positivo.', 'error')
      return
    }

    setSaving(true)
    try {
      await saveTransportVehicle({
        vehicleId: editingId,
        movementId,
        label: trimmedLabel,
        vehicleType: form.vehicleType || 'bus',
        capacity: capacityNum,
        plate: form.plate.trim(),
        driverName: form.driverName.trim(),
        driverPhone: form.driverPhone.trim(),
        sortOrder: parseInt(form.sortOrder, 10) || 0,
      })
      if (!mountedRef.current) return
      showToast(editingId ? 'Mezzo aggiornato.' : 'Mezzo aggiunto.', 'success')
      closeForm()
      await loadData()
    } catch (err) {
      if (!mountedRef.current) return
      showToast(err instanceof Error ? err.message : 'Errore durante il salvataggio.', 'error')
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
        <span style={{ fontSize: 14, color: 'var(--muted)' }}>Caricamento mezzi...</span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Mezzi
        </h4>
        {canEdit && !showForm && (
          <button onClick={openCreateForm} style={addBtnStyle}>
            <Plus size={16} />
            Aggiungi mezzo
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div style={formContainerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {editingId ? 'Modifica mezzo' : 'Nuovo mezzo'}
            </span>
            <button onClick={closeForm} disabled={saving} style={closeIconStyle}>
              <X size={18} />
            </button>
          </div>

          <label style={fieldStyle}>
            <span style={labelStyle}>Nome *</span>
            <input
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              disabled={saving}
              placeholder="Es. Bus 1"
              style={inputStyle}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Tipo</span>
              <select
                value={form.vehicleType}
                onChange={e => setForm(f => ({ ...f, vehicleType: e.target.value }))}
                disabled={saving}
                style={inputStyle}
              >
                <option value="bus">Bus</option>
                <option value="minibus">Minibus</option>
                <option value="van">Van</option>
                <option value="car">Auto</option>
                <option value="taxi">Taxi</option>
                <option value="other">Altro</option>
              </select>
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle}>Capienza</span>
              <input
                type="number"
                min="1"
                value={form.capacity}
                onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                disabled={saving}
                placeholder="Es. 50"
                style={inputStyle}
              />
            </label>
          </div>

          <label style={fieldStyle}>
            <span style={labelStyle}>Targa</span>
            <input
              value={form.plate}
              onChange={e => setForm(f => ({ ...f, plate: e.target.value }))}
              disabled={saving}
              placeholder="Es. AB 123 CD"
              style={inputStyle}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Nome autista</span>
              <input
                value={form.driverName}
                onChange={e => setForm(f => ({ ...f, driverName: e.target.value }))}
                disabled={saving}
                placeholder="Es. Mario Rossi"
                style={inputStyle}
              />
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle}>Telefono autista</span>
              <input
                type="tel"
                value={form.driverPhone}
                onChange={e => setForm(f => ({ ...f, driverPhone: e.target.value }))}
                disabled={saving}
                placeholder="Es. +39 333 1234567"
                style={inputStyle}
              />
            </label>
          </div>

          <label style={fieldStyle}>
            <span style={labelStyle}>Ordine</span>
            <input
              type="number"
              min="0"
              value={form.sortOrder}
              onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
              disabled={saving}
              style={inputStyle}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={closeForm} disabled={saving} style={cancelBtnStyle}>
              Annulla
            </button>
            <button onClick={handleSave} disabled={saving} style={saveBtnStyle(saving)}>
              {saving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {editingId ? 'Salva modifiche' : 'Aggiungi'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {vehicles.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          <Truck size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p style={{ margin: 0 }}>Nessun mezzo assegnato a questo trasferimento.</p>
        </div>
      )}

      {/* Vehicle cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
        {vehicles.map(v => (
          <div key={v.id} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{v.label}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{v.vehicle_type}</span>
              </div>
              {canEdit && (
                <button
                  onClick={() => openEditForm(v)}
                  style={editIconStyle}
                  title="Modifica"
                >
                  <Edit3 size={15} />
                </button>
              )}
            </div>

            {v.capacity != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
                <Users size={13} />
                <span>Capienza: {v.capacity}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <CountBadge label="Previsti" value={v.expected_count} color="var(--blue)" />
              <CountBadge label="A bordo" value={v.boarded_count} color="var(--green)" />
              <CountBadge label="Mancanti" value={v.missing_count} color="var(--orange, var(--muted))" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CountBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 16, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
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

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--muted)' }

const formContainerStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  border: '1px solid var(--line)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const cardStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  border: '1px solid var(--line)',
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

const addBtnStyle: React.CSSProperties = {
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
}

const closeIconStyle: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--muted)',
}

const editIconStyle: React.CSSProperties = {
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
}

const cancelBtnStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '10px 16px',
  fontSize: 14,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  color: 'var(--text)',
  cursor: 'pointer',
}

const saveBtnStyle = (saving: boolean): React.CSSProperties => ({
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
})
