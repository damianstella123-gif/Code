import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  fetchEventRegistrations,
  updateRegistrationStatus,
  checkInRegistration,
  undoRegistrationCheckIn,
  getRegistrationStats,
  EventRegistration,
  RegistrationStatus,
} from '@/lib/registration-participants-service'
import { useToast } from '@/lib/toast'

interface Props {
  eventId: string
  siteId?: string
  readOnly: boolean
}

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  confirmed: 'Confermato',
  waitlist: 'Lista d\'attesa',
  cancelled: 'Cancellato',
}

const STATUS_COLORS: Record<RegistrationStatus, string> = {
  confirmed: 'bg-green-100 text-green-800',
  waitlist: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-red-100 text-red-800',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function escapeCsv(val: string): string {
  if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r')) {
    return '"' + val.replace(/"/g, '""') + '"'
  }
  return val
}

export default function RegistrationParticipantsManager({ eventId, siteId, readOnly }: Props) {
  const { showToast } = useToast()
  const [registrations, setRegistrations] = useState<EventRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | RegistrationStatus>('all')
  const [checkInFilter, setCheckInFilter] = useState<'all' | 'checked' | 'not_checked'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ id: string; type: 'cancel' | 'undo_checkin' } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchEventRegistrations(eventId, siteId)
      setRegistrations(data)
    } catch {
      setError('Impossibile caricare i partecipanti. Riprovare.')
    } finally {
      setLoading(false)
    }
  }, [eventId, siteId])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = registrations
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.registration_status === statusFilter)
    }
    if (checkInFilter === 'checked') {
      list = list.filter((r) => r.checked_in_at !== null)
    } else if (checkInFilter === 'not_checked') {
      list = list.filter((r) => r.checked_in_at === null)
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(
        (r) =>
          r.first_name.toLowerCase().includes(q) ||
          r.last_name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.company.toLowerCase().includes(q),
      )
    }
    return list
  }, [registrations, statusFilter, checkInFilter, search])

  const stats = useMemo(() => getRegistrationStats(registrations), [registrations])

  async function handleStatusChange(id: string, status: RegistrationStatus) {
    setActionLoading(id)
    try {
      const updated = await updateRegistrationStatus(id, status)
      setRegistrations((prev) => prev.map((r) => (r.id === id ? updated : r)))
      showToast('Stato aggiornato con successo.', 'success')
    } catch {
      showToast('Errore durante l\'aggiornamento dello stato.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleCheckIn(id: string) {
    setActionLoading(id)
    try {
      const updated = await checkInRegistration(id)
      setRegistrations((prev) => prev.map((r) => (r.id === id ? updated : r)))
      showToast('Check-in effettuato.', 'success')
    } catch {
      showToast('Errore durante il check-in.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleUndoCheckIn(id: string) {
    setActionLoading(id)
    try {
      const updated = await undoRegistrationCheckIn(id)
      setRegistrations((prev) => prev.map((r) => (r.id === id ? updated : r)))
      showToast('Check-in annullato.', 'success')
    } catch {
      showToast('Errore durante l\'annullamento del check-in.', 'error')
    } finally {
      setActionLoading(null)
      setConfirmAction(null)
    }
  }

  async function handleCancel(id: string) {
    await handleStatusChange(id, 'cancelled')
    setConfirmAction(null)
  }

  function exportCsv() {
    const BOM = '\uFEFF'
    const headers = [
      'Nome', 'Cognome', 'Email', 'Telefono', 'Azienda', 'Ruolo',
      'Stato', 'Data registrazione', 'Data check-in',
      'Esigenze alimentari', 'Requisiti accessibilità',
    ]
    const rows = filtered.map((r) => [
      escapeCsv(r.first_name),
      escapeCsv(r.last_name),
      escapeCsv(r.email),
      escapeCsv(r.phone),
      escapeCsv(r.company),
      escapeCsv(r.job_title),
      escapeCsv(STATUS_LABELS[r.registration_status]),
      escapeCsv(formatDate(r.created_at)),
      escapeCsv(formatDate(r.checked_in_at)),
      escapeCsv(r.dietary_requirements),
      escapeCsv(r.accessibility_requirements),
    ])
    const csv = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `partecipanti_${eventId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Caricamento partecipanti...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={load}
          className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          aria-label="Riprova caricamento"
        >
          Riprova
        </button>
      </div>
    )
  }

  if (registrations.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-gray-500">Nessun partecipante registrato.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([
          { label: 'Totale', value: stats.total, color: 'bg-gray-50 border-gray-200' },
          { label: 'Confermati', value: stats.confirmed, color: 'bg-green-50 border-green-200' },
          { label: 'Lista d\'attesa', value: stats.waitlist, color: 'bg-amber-50 border-amber-200' },
          { label: 'Cancellati', value: stats.cancelled, color: 'bg-red-50 border-red-200' },
          { label: 'Check-in', value: stats.checkedIn, color: 'bg-blue-50 border-blue-200' },
        ] as const).map((s) => (
          <div key={s.label} className={`rounded-xl border p-3 text-center ${s.color}`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-gray-600 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <input
          type="text"
          placeholder="Cerca nome, email, azienda..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Cerca partecipanti"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | RegistrationStatus)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Filtra per stato"
        >
          <option value="all">Tutti gli stati</option>
          <option value="confirmed">Confermati</option>
          <option value="waitlist">Lista d'attesa</option>
          <option value="cancelled">Cancellati</option>
        </select>
        <select
          value={checkInFilter}
          onChange={(e) => setCheckInFilter(e.target.value as 'all' | 'checked' | 'not_checked')}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Filtra per check-in"
        >
          <option value="all">Tutti</option>
          <option value="checked">Con check-in</option>
          <option value="not_checked">Senza check-in</option>
        </select>
        <button
          onClick={exportCsv}
          className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors whitespace-nowrap"
          aria-label="Esporta CSV"
        >
          Esporta CSV
        </button>
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-500">{filtered.length} risultati</p>

      {/* List */}
      <div className="space-y-2">
        {filtered.map((reg) => {
          const isExpanded = expandedId === reg.id
          const isLoading = actionLoading === reg.id
          return (
            <div key={reg.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
              <button
                onClick={() => setExpandedId(isExpanded ? null : reg.id)}
                className="w-full text-left px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 hover:bg-gray-50 transition-colors"
                aria-expanded={isExpanded}
                aria-label={`Dettagli ${reg.first_name} ${reg.last_name}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {reg.first_name} {reg.last_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{reg.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {reg.phone && <span className="text-xs text-gray-500">{reg.phone}</span>}
                  {reg.company && <span className="text-xs text-gray-500">{reg.company}</span>}
                  {reg.job_title && <span className="text-xs text-gray-400">· {reg.job_title}</span>}
                  <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[reg.registration_status]}`} style={{ fontSize: '12px' }}>
                    {STATUS_LABELS[reg.registration_status]}
                  </span>
                  {reg.checked_in_at && (
                    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800" style={{ fontSize: '12px' }}>
                      Check-in
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{formatDate(reg.created_at)}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {reg.checked_in_at && (
                      <p><span className="font-medium">Check-in:</span> {formatDate(reg.checked_in_at)}</p>
                    )}
                    {reg.dietary_requirements && (
                      <p><span className="font-medium">Esigenze alimentari:</span> {reg.dietary_requirements}</p>
                    )}
                    {reg.accessibility_requirements && (
                      <p><span className="font-medium">Accessibilità:</span> {reg.accessibility_requirements}</p>
                    )}
                    {reg.custom_answers && Object.keys(reg.custom_answers).length > 0 && (
                      <div className="col-span-full">
                        <p className="font-medium mb-1">Risposte personalizzate:</p>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {Object.entries(reg.custom_answers).map(([key, val]) => (
                            <div key={key}>
                              <dt className="font-medium inline">{key}:</dt>{' '}
                              <dd className="inline text-gray-600">{String(val)}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}
                  </div>

                  {!readOnly && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                      {reg.registration_status !== 'confirmed' && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleStatusChange(reg.id, 'confirmed')}
                          className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                          title="Conferma registrazione"
                        >
                          Conferma
                        </button>
                      )}
                      {reg.registration_status !== 'waitlist' && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleStatusChange(reg.id, 'waitlist')}
                          className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                          title="Sposta in lista d'attesa"
                        >
                          Lista d'attesa
                        </button>
                      )}
                      {reg.registration_status !== 'cancelled' && (
                        <>
                          {confirmAction?.id === reg.id && confirmAction.type === 'cancel' ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-red-600">Confermare?</span>
                              <button
                                disabled={isLoading}
                                onClick={() => handleCancel(reg.id)}
                                className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                              >
                                Sì
                              </button>
                              <button
                                onClick={() => setConfirmAction(null)}
                                className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              disabled={isLoading}
                              onClick={() => setConfirmAction({ id: reg.id, type: 'cancel' })}
                              className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                              title="Cancella registrazione"
                            >
                              Cancella
                            </button>
                          )}
                        </>
                      )}
                      {!reg.checked_in_at ? (
                        <button
                          disabled={isLoading}
                          onClick={() => handleCheckIn(reg.id)}
                          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          title="Effettua check-in"
                        >
                          Check-in
                        </button>
                      ) : (
                        <>
                          {confirmAction?.id === reg.id && confirmAction.type === 'undo_checkin' ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-600">Annullare check-in?</span>
                              <button
                                disabled={isLoading}
                                onClick={() => handleUndoCheckIn(reg.id)}
                                className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                              >
                                Sì
                              </button>
                              <button
                                onClick={() => setConfirmAction(null)}
                                className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              disabled={isLoading}
                              onClick={() => setConfirmAction({ id: reg.id, type: 'undo_checkin' })}
                              className="text-xs px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                              title="Annulla check-in"
                            >
                              Annulla check-in
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">Nessun partecipante trovato con i filtri selezionati.</p>
        )}
      </div>
    </div>
  )
}
