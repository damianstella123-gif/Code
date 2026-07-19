import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  RefreshCw, Plus, Search, Edit2, ShieldAlert, AlertTriangle, Info,
  CheckCircle2, ArrowRight, RotateCcw
} from 'lucide-react'
import {
  fetchOnsiteIncidents,
  createOnsiteIncident,
  updateOnsiteIncident,
  transitionOnsiteIncident,
  type OnsiteIncidentRow,
  type OnsiteIncidentStatus,
  type OnsiteIncidentCategory,
  type OnsiteIncidentSeverity,
} from '@/lib/onsite-operations-service'
import { fetchAllProfiles, type Profile } from '@/lib/profiles'

interface Props {
  eventId: string
  disabled?: boolean
}

const STATUS_LABELS: Record<OnsiteIncidentStatus, string> = {
  open: 'Aperto',
  in_progress: 'In gestione',
  resolved: 'Risolto',
}

const STATUS_COLORS: Record<OnsiteIncidentStatus, string> = {
  open: 'bg-red-100 text-red-800 border-red-300',
  in_progress: 'bg-amber-100 text-amber-800 border-amber-300',
  resolved: 'bg-green-100 text-green-800 border-green-300',
}

const SEVERITY_LABELS: Record<OnsiteIncidentSeverity, string> = {
  critical: 'Critico',
  warning: 'Attenzione',
  info: 'Info',
}

const SEVERITY_COLORS: Record<OnsiteIncidentSeverity, string> = {
  critical: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-blue-500 text-white',
}

const SEVERITY_ICONS: Record<OnsiteIncidentSeverity, typeof ShieldAlert> = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
}

const CATEGORY_LABELS: Record<OnsiteIncidentCategory, string> = {
  logistica: 'Logistica',
  fornitore: 'Fornitore',
  partecipante: 'Partecipante',
  sicurezza: 'Sicurezza',
  tecnica: 'Tecnica',
  altro: 'Altro',
}

const ALL_CATEGORIES: OnsiteIncidentCategory[] = ['logistica', 'fornitore', 'partecipante', 'sicurezza', 'tecnica', 'altro']
const ALL_SEVERITIES: OnsiteIncidentSeverity[] = ['critical', 'warning', 'info']
const ALL_STATUSES: OnsiteIncidentStatus[] = ['open', 'in_progress', 'resolved']

interface FormState {
  title: string
  description: string
  category: OnsiteIncidentCategory
  severity: OnsiteIncidentSeverity
  location: string
  assigned_to: string
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  category: 'altro',
  severity: 'info',
  location: '',
  assigned_to: '',
}

export default function OnsiteIncidentsManager({ eventId, disabled = false }: Props) {
  const [incidents, setIncidents] = useState<OnsiteIncidentRow[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<OnsiteIncidentStatus | ''>('')
  const [filterSeverity, setFilterSeverity] = useState<OnsiteIncidentSeverity | ''>('')
  const [filterCategory, setFilterCategory] = useState<OnsiteIncidentCategory | ''>('')

  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'resolve' | 'reopen' } | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>()
    for (const p of profiles) m.set(p.id, p)
    return m
  }, [profiles])

  const activeProfiles = useMemo(() => profiles.filter((p) => p.is_active), [profiles])

  const loadIncidents = useCallback(async () => {
    try {
      const data = await fetchOnsiteIncidents(eventId)
      setIncidents(data)
      setError(null)
    } catch {
      setError('Impossibile caricare gli incidenti. Riprova.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  const loadProfiles = useCallback(async () => {
    const data = await fetchAllProfiles()
    setProfiles(data)
  }, [])

  useEffect(() => {
    setLoading(true)
    loadIncidents()
    loadProfiles()
    intervalRef.current = setInterval(loadIncidents, 30000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [loadIncidents, loadProfiles])

  const profileName = (id: string | null): string => {
    if (!id) return '—'
    const p = profileMap.get(id)
    return p ? `${p.first_name} ${p.last_name}` : id.slice(0, 8)
  }

  const filtered = useMemo(() => {
    let result = incidents
    if (filterStatus) result = result.filter((i) => i.incident_status === filterStatus)
    if (filterSeverity) result = result.filter((i) => i.severity === filterSeverity)
    if (filterCategory) result = result.filter((i) => i.category === filterCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.location.toLowerCase().includes(q)
      )
    }
    return result
  }, [incidents, filterStatus, filterSeverity, filterCategory, search])

  // Dashboard counters
  const counters = useMemo(() => {
    const open = incidents.filter((i) => i.incident_status === 'open').length
    const inProgress = incidents.filter((i) => i.incident_status === 'in_progress').length
    const criticalActive = incidents.filter(
      (i) => i.severity === 'critical' && i.incident_status !== 'resolved'
    ).length
    const resolved = incidents.filter((i) => i.incident_status === 'resolved').length
    return { open, inProgress, criticalActive, resolved }
  }, [incidents])

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setSaving('create')
    try {
      await createOnsiteIncident(eventId, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        severity: form.severity,
        location: form.location.trim() || undefined,
        assigned_to: form.assigned_to || null,
      })
      setForm(EMPTY_FORM)
      setShowCreate(false)
      await loadIncidents()
    } catch {
      setError('Errore nella creazione. Riprova.')
    } finally {
      setSaving(null)
    }
  }

  const handleEdit = async () => {
    if (!editingId || !form.title.trim()) return
    setSaving(editingId)
    try {
      await updateOnsiteIncident(editingId, {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        severity: form.severity,
        location: form.location.trim(),
        assigned_to: form.assigned_to || null,
      })
      setEditingId(null)
      setForm(EMPTY_FORM)
      await loadIncidents()
    } catch {
      setError('Errore nel salvataggio. Riprova.')
    } finally {
      setSaving(null)
    }
  }

  const startEdit = (inc: OnsiteIncidentRow) => {
    setEditingId(inc.id)
    setShowCreate(false)
    setForm({
      title: inc.title,
      description: inc.description,
      category: inc.category,
      severity: inc.severity,
      location: inc.location,
      assigned_to: inc.assigned_to || '',
    })
  }

  const handleTransition = async (id: string, target: OnsiteIncidentStatus) => {
    setSaving(id)
    try {
      await transitionOnsiteIncident(id, target)
      setConfirmAction(null)
      await loadIncidents()
    } catch {
      setError('Errore nella transizione. Riprova.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-600 text-sm">Caricamento incidenti...</span>
      </div>
    )
  }

  if (error && incidents.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 text-sm mb-3">{error}</p>
        <button
          onClick={() => { setLoading(true); loadIncidents() }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm min-h-[44px]"
          aria-label="Riprova caricamento"
        >
          <RefreshCw className="w-4 h-4" /> Riprova
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-base font-semibold text-gray-900">Incidenti Onsite</h3>
        <div className="flex items-center gap-2">
          {!disabled && (
            <button
              onClick={() => { setShowCreate(true); setEditingId(null); setForm(EMPTY_FORM) }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 min-h-[44px]"
              aria-label="Crea nuovo incidente"
            >
              <Plus className="w-4 h-4" /> Nuovo
            </button>
          )}
          <button
            onClick={loadIncidents}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[44px]"
            aria-label="Aggiorna lista incidenti"
          >
            <RefreshCw className="w-4 h-4" /> Aggiorna
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Dashboard counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <CounterCard label="Aperte" value={counters.open} className="border-red-200 bg-red-50 text-red-800" />
        <CounterCard label="In gestione" value={counters.inProgress} className="border-amber-200 bg-amber-50 text-amber-800" />
        <CounterCard label="Critiche attive" value={counters.criticalActive} className="border-red-400 bg-red-100 text-red-900" />
        <CounterCard label="Risolte" value={counters.resolved} className="border-green-200 bg-green-50 text-green-800" />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca titolo, descrizione, luogo..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            aria-label="Cerca incidenti"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as OnsiteIncidentStatus | '')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            aria-label="Filtra per stato"
          >
            <option value="">Tutti gli stati</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as OnsiteIncidentSeverity | '')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            aria-label="Filtra per gravità"
          >
            <option value="">Tutte le gravità</option>
            {ALL_SEVERITIES.map((s) => (
              <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as OnsiteIncidentCategory | '')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            aria-label="Filtra per categoria"
          >
            <option value="">Tutte le categorie</option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Create form */}
      {showCreate && !disabled && (
        <IncidentForm
          form={form}
          setForm={setForm}
          onSubmit={handleCreate}
          onCancel={() => { setShowCreate(false); setForm(EMPTY_FORM) }}
          saving={saving === 'create'}
          profiles={activeProfiles}
          submitLabel="Crea incidente"
        />
      )}

      {/* Edit form */}
      {editingId && !disabled && (
        <IncidentForm
          form={form}
          setForm={setForm}
          onSubmit={handleEdit}
          onCancel={() => { setEditingId(null); setForm(EMPTY_FORM) }}
          saving={saving === editingId}
          profiles={activeProfiles}
          submitLabel="Salva modifiche"
        />
      )}

      {/* List */}
      {incidents.length === 0 ? (
        <div className="p-6 text-center text-gray-500 text-sm">
          Nessun incidente registrato.
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-gray-500 text-sm">
          Nessun risultato per i filtri selezionati.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inc) => {
            const isCriticalActive = inc.severity === 'critical' && inc.incident_status !== 'resolved'
            const SevIcon = SEVERITY_ICONS[inc.severity]
            const isSaving = saving === inc.id

            return (
              <div
                key={inc.id}
                className={`border rounded-xl p-4 space-y-2 ${
                  isCriticalActive
                    ? 'border-red-400 bg-red-50 ring-2 ring-red-300'
                    : inc.severity === 'warning' && inc.incident_status !== 'resolved'
                    ? 'border-amber-300 bg-amber-50'
                    : inc.severity === 'info' && inc.incident_status !== 'resolved'
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{inc.title}</p>
                    {inc.description && (
                      <p className="text-sm text-gray-700 mt-0.5">{inc.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[inc.severity]}`}>
                      <SevIcon className="w-3 h-3" />
                      {SEVERITY_LABELS[inc.severity]}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[inc.incident_status]}`}>
                      {STATUS_LABELS[inc.incident_status]}
                    </span>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                  <span>{CATEGORY_LABELS[inc.category]}</span>
                  {inc.location && <span>📍 {inc.location}</span>}
                  {inc.assigned_to && <span>👤 {profileName(inc.assigned_to)}</span>}
                </div>

                {/* Reporter / times */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                  {inc.reported_by && (
                    <span>Segnalato da {profileName(inc.reported_by)} — {new Date(inc.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                  {inc.resolved_at && (
                    <span>Risolto: {new Date(inc.resolved_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                </div>

                {/* Actions */}
                {!disabled && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {/* Edit */}
                    {editingId !== inc.id && (
                      <ActionBtn
                        onClick={() => startEdit(inc)}
                        disabled={isSaving}
                        icon={<Edit2 className="w-4 h-4" />}
                        label="Modifica"
                        className="bg-gray-100 text-gray-700 hover:bg-gray-200"
                      />
                    )}

                    {/* open -> in_progress */}
                    {inc.incident_status === 'open' && (
                      <ActionBtn
                        onClick={() => handleTransition(inc.id, 'in_progress')}
                        disabled={isSaving}
                        icon={<ArrowRight className="w-4 h-4" />}
                        label="Prendi in carico"
                        className="bg-amber-500 text-white hover:bg-amber-600"
                      />
                    )}

                    {/* open/in_progress -> resolved */}
                    {(inc.incident_status === 'open' || inc.incident_status === 'in_progress') && (
                      <>
                        {confirmAction?.id === inc.id && confirmAction.action === 'resolve' ? (
                          <div className="flex items-center gap-2">
                            <ActionBtn
                              onClick={() => handleTransition(inc.id, 'resolved')}
                              disabled={isSaving}
                              icon={<CheckCircle2 className="w-4 h-4" />}
                              label="Conferma risoluzione"
                              className="bg-green-600 text-white hover:bg-green-700"
                            />
                            <ActionBtn
                              onClick={() => setConfirmAction(null)}
                              disabled={isSaving}
                              label="Annulla"
                              className="bg-gray-200 text-gray-700 hover:bg-gray-300"
                            />
                          </div>
                        ) : (
                          <ActionBtn
                            onClick={() => setConfirmAction({ id: inc.id, action: 'resolve' })}
                            disabled={isSaving}
                            icon={<CheckCircle2 className="w-4 h-4" />}
                            label="Risolvi"
                            className="bg-green-100 text-green-800 hover:bg-green-200"
                          />
                        )}
                      </>
                    )}

                    {/* resolved -> open */}
                    {inc.incident_status === 'resolved' && (
                      <>
                        {confirmAction?.id === inc.id && confirmAction.action === 'reopen' ? (
                          <div className="flex items-center gap-2">
                            <ActionBtn
                              onClick={() => handleTransition(inc.id, 'open')}
                              disabled={isSaving}
                              icon={<RotateCcw className="w-4 h-4" />}
                              label="Conferma riapertura"
                              className="bg-red-600 text-white hover:bg-red-700"
                            />
                            <ActionBtn
                              onClick={() => setConfirmAction(null)}
                              disabled={isSaving}
                              label="Annulla"
                              className="bg-gray-200 text-gray-700 hover:bg-gray-300"
                            />
                          </div>
                        ) : (
                          <ActionBtn
                            onClick={() => setConfirmAction({ id: inc.id, action: 'reopen' })}
                            disabled={isSaving}
                            icon={<RotateCcw className="w-4 h-4" />}
                            label="Riapri"
                            className="bg-gray-100 text-gray-700 hover:bg-gray-200"
                          />
                        )}
                      </>
                    )}
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

function CounterCard({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`text-center px-2 py-3 rounded-lg border ${className}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs font-medium truncate">{label}</div>
    </div>
  )
}

function IncidentForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  saving,
  profiles,
  submitLabel,
}: {
  form: FormState
  setForm: (f: FormState) => void
  onSubmit: () => void
  onCancel: () => void
  saving: boolean
  profiles: Profile[]
  submitLabel: string
}) {
  return (
    <div className="border border-gray-300 rounded-xl p-4 bg-gray-50 space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Titolo *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
          placeholder="Descrizione breve dell'incidente"
          aria-label="Titolo incidente"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[66px]"
          placeholder="Dettagli aggiuntivi"
          aria-label="Descrizione incidente"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as OnsiteIncidentCategory })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            aria-label="Categoria incidente"
          >
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gravità</label>
          <select
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value as OnsiteIncidentSeverity })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            aria-label="Gravità incidente"
          >
            {ALL_SEVERITIES.map((s) => (
              <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Luogo</label>
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            placeholder="es. Sala A, ingresso"
            aria-label="Luogo incidente"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assegnato a</label>
          <select
            value={form.assigned_to}
            onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            aria-label="Assegna incidente"
          >
            <option value="">— Nessuno —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <ActionBtn
          onClick={onSubmit}
          disabled={saving || !form.title.trim()}
          label={submitLabel}
          className="bg-gray-800 text-white hover:bg-gray-900"
        />
        <ActionBtn
          onClick={onCancel}
          disabled={saving}
          label="Annulla"
          className="bg-gray-200 text-gray-700 hover:bg-gray-300"
        />
      </div>
    </div>
  )
}

function ActionBtn({
  onClick,
  disabled,
  icon,
  label,
  className = 'bg-blue-600 text-white hover:bg-blue-700',
}: {
  onClick: () => void
  disabled?: boolean
  icon?: React.ReactNode
  label: string
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] transition-colors disabled:opacity-50 disabled:pointer-events-none ${className}`}
      aria-label={label}
      title={label}
    >
      {icon}
      {label}
    </button>
  )
}
