import { useState, useEffect, useRef, useCallback } from 'react'
import {
  RefreshCw, Clock, MapPin, Users, ChevronDown, ChevronUp,
  Play, CheckCircle2, PauseCircle, XCircle, AlertTriangle, ArrowRight
} from 'lucide-react'
import {
  fetchOnsiteProgram,
  saveOnsiteProgramStatus,
  type MergedProgramItem,
  type OnsiteProgramStatus,
} from '@/lib/onsite-operations-service'

interface Props {
  eventId: string
  disabled?: boolean
}

const STATUS_LABELS: Record<OnsiteProgramStatus, string> = {
  planned: 'Pianificato',
  ready: 'Pronto',
  in_progress: 'In corso',
  completed: 'Completato',
  delayed: 'In ritardo',
  cancelled: 'Annullato',
}

const STATUS_COLORS: Record<OnsiteProgramStatus, string> = {
  planned: 'bg-gray-100 text-gray-700 border-gray-300',
  ready: 'bg-blue-100 text-blue-800 border-blue-300',
  in_progress: 'bg-green-100 text-green-800 border-green-300',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  delayed: 'bg-amber-100 text-amber-800 border-amber-300',
  cancelled: 'bg-red-100 text-red-700 border-red-300',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatTime(time: string): string {
  return time.slice(0, 5)
}

function isCurrentlyLive(item: MergedProgramItem): boolean {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  if (item.data !== today) return false
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = item.ora_inizio.split(':').map(Number)
  const startMin = sh * 60 + sm
  if (!item.ora_fine) return currentMinutes >= startMin
  const [eh, em] = item.ora_fine.split(':').map(Number)
  const endMin = eh * 60 + em
  return currentMinutes >= startMin && currentMinutes < endMin
}

function isNextUpcoming(item: MergedProgramItem, allItems: MergedProgramItem[]): boolean {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const upcoming = allItems
    .filter((i) => {
      if (i.onsite_status === 'completed' || i.onsite_status === 'cancelled') return false
      if (i.data > today) return true
      if (i.data < today) return false
      const [h, m] = i.ora_inizio.split(':').map(Number)
      return h * 60 + m > currentMinutes
    })
    .sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1
      return a.ora_inizio.localeCompare(b.ora_inizio)
    })

  return upcoming.length > 0 && upcoming[0].id === item.id
}

export default function OnsiteLiveProgram({ eventId, disabled = false }: Props) {
  const [items, setItems] = useState<MergedProgramItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [delayForm, setDelayForm] = useState<{ itemId: string; minutes: string; note: string } | null>(null)
  const [noteEdit, setNoteEdit] = useState<{ itemId: string; note: string } | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchOnsiteProgram(eventId)
      setItems(data)
      setError(null)
    } catch {
      setError('Impossibile caricare il programma. Riprova.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    setLoading(true)
    load()
    intervalRef.current = setInterval(load, 30000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [load])

  const save = async (itemId: string, patch: Parameters<typeof saveOnsiteProgramStatus>[2]) => {
    setSaving(itemId)
    try {
      await saveOnsiteProgramStatus(eventId, itemId, patch)
      await load()
    } catch {
      setError('Errore durante il salvataggio. Riprova.')
    } finally {
      setSaving(null)
    }
  }

  const handleTransition = async (item: MergedProgramItem, target: OnsiteProgramStatus) => {
    const patch: Parameters<typeof saveOnsiteProgramStatus>[2] = { onsite_status: target }
    if (target === 'in_progress' && !item.actual_start) {
      patch.actual_start = new Date().toISOString()
    }
    if (target === 'completed') {
      patch.actual_end = new Date().toISOString()
    }
    await save(item.id, patch)
  }

  const handleDelaySubmit = async () => {
    if (!delayForm) return
    const minutes = parseInt(delayForm.minutes, 10)
    if (!minutes || minutes <= 0) return
    await save(delayForm.itemId, {
      onsite_status: 'delayed',
      delay_minutes: minutes,
      onsite_note: delayForm.note || undefined,
    })
    setDelayForm(null)
  }

  const handleNoteSave = async () => {
    if (!noteEdit) return
    await save(noteEdit.itemId, { onsite_note: noteEdit.note })
    setNoteEdit(null)
  }

  const handleCancel = async (itemId: string) => {
    await save(itemId, { onsite_status: 'cancelled' })
    setCancelConfirm(null)
  }

  // Group by date
  const grouped = items.reduce<Record<string, MergedProgramItem[]>>((acc, item) => {
    const key = item.data
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
  const sortedDates = Object.keys(grouped).sort()

  // Auto-expand today
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    if (sortedDates.includes(today)) setExpandedDate(today)
    else if (sortedDates.length > 0 && !expandedDate) setExpandedDate(sortedDates[0])
  }, [sortedDates.join(',')])

  // Summary counters
  const counters = items.reduce<Record<OnsiteProgramStatus, number>>(
    (acc, i) => { acc[i.onsite_status]++; return acc },
    { planned: 0, ready: 0, in_progress: 0, completed: 0, delayed: 0, cancelled: 0 }
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-600 text-sm">Caricamento programma...</span>
      </div>
    )
  }

  if (error && items.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 text-sm mb-3">{error}</p>
        <button
          onClick={() => { setLoading(true); load() }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm min-h-[44px]"
          aria-label="Riprova caricamento"
        >
          <RefreshCw className="w-4 h-4" /> Riprova
        </button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">
        Nessun elemento nel programma.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Programma Live</h3>
        <button
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[44px]"
          aria-label="Aggiorna programma"
        >
          <RefreshCw className="w-4 h-4" /> Aggiorna
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Summary counters */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {(Object.entries(counters) as [OnsiteProgramStatus, number][]).map(([status, count]) => (
          <div
            key={status}
            className={`text-center px-2 py-2 rounded-lg border text-xs font-medium ${STATUS_COLORS[status]}`}
          >
            <div className="text-lg font-bold">{count}</div>
            <div className="truncate">{STATUS_LABELS[status]}</div>
          </div>
        ))}
      </div>

      {/* Grouped timeline */}
      <div className="space-y-3">
        {sortedDates.map((date) => (
          <div key={date} className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedDate(expandedDate === date ? null : date)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 min-h-[44px]"
              aria-expanded={expandedDate === date}
              aria-label={`Giorno ${formatDate(date)}`}
            >
              <span className="font-medium text-sm text-gray-900 capitalize">
                {formatDate(date)}
              </span>
              <span className="flex items-center gap-2 text-xs text-gray-500">
                {grouped[date].length} elementi
                {expandedDate === date ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>

            {expandedDate === date && (
              <div className="divide-y divide-gray-100">
                {grouped[date].map((item) => {
                  const live = isCurrentlyLive(item)
                  const next = isNextUpcoming(item, items)
                  const isSaving = saving === item.id

                  return (
                    <div
                      key={item.id}
                      className={`p-4 space-y-2 ${live ? 'bg-green-50 border-l-4 border-l-green-500' : next ? 'bg-blue-50 border-l-4 border-l-blue-400' : ''}`}
                    >
                      {/* Time + Title */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                              {formatTime(item.ora_inizio)}
                              {item.ora_fine && ` – ${formatTime(item.ora_fine)}`}
                            </span>
                            {live && <span className="text-xs font-bold text-green-700 uppercase">LIVE</span>}
                            {next && <span className="text-xs font-bold text-blue-700 uppercase">PROSSIMO</span>}
                          </div>
                          <p className="text-sm font-medium text-gray-900 mt-0.5">{item.titolo}</p>
                        </div>
                        <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[item.onsite_status]}`}>
                          {STATUS_LABELS[item.onsite_status]}
                        </span>
                      </div>

                      {/* Meta */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                        {item.categoria && item.categoria !== 'altro' && (
                          <span className="capitalize">{item.categoria}</span>
                        )}
                        {item.luogo && (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="w-3 h-3" /> {item.luogo}
                          </span>
                        )}
                        {item.pax != null && item.pax > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Users className="w-3 h-3" /> {item.pax} pax
                          </span>
                        )}
                        {item.servizio && <span>{item.servizio}</span>}
                      </div>

                      {/* Notes */}
                      {item.note && (
                        <p className="text-xs text-gray-500 italic">{item.note}</p>
                      )}

                      {/* Onsite details */}
                      {(item.actual_start || item.actual_end || item.delay_minutes > 0 || item.onsite_note) && (
                        <div className="text-xs bg-white border border-gray-200 rounded-lg p-2 space-y-0.5">
                          {item.actual_start && (
                            <p className="text-gray-600">
                              <Clock className="w-3 h-3 inline mr-1" />
                              Inizio effettivo: {new Date(item.actual_start).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                          {item.actual_end && (
                            <p className="text-gray-600">
                              Fine effettiva: {new Date(item.actual_end).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                          {item.delay_minutes > 0 && (
                            <p className="text-amber-700 font-medium">
                              <AlertTriangle className="w-3 h-3 inline mr-1" />
                              Ritardo: {item.delay_minutes} min
                            </p>
                          )}
                          {item.onsite_note && (
                            <p className="text-gray-700">{item.onsite_note}</p>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      {!disabled && item.onsite_status !== 'completed' && item.onsite_status !== 'cancelled' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {item.onsite_status === 'planned' && (
                            <ActionBtn
                              onClick={() => handleTransition(item, 'ready')}
                              disabled={isSaving}
                              icon={<ArrowRight className="w-4 h-4" />}
                              label="Segna pronto"
                            />
                          )}
                          {(item.onsite_status === 'ready' || item.onsite_status === 'delayed') && (
                            <ActionBtn
                              onClick={() => handleTransition(item, 'in_progress')}
                              disabled={isSaving}
                              icon={<Play className="w-4 h-4" />}
                              label="Avvia"
                              className="bg-green-600 text-white hover:bg-green-700"
                            />
                          )}
                          {item.onsite_status === 'in_progress' && (
                            <ActionBtn
                              onClick={() => handleTransition(item, 'completed')}
                              disabled={isSaving}
                              icon={<CheckCircle2 className="w-4 h-4" />}
                              label="Completato"
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                            />
                          )}
                          {(item.onsite_status === 'planned' || item.onsite_status === 'ready' || item.onsite_status === 'in_progress') && (
                            <ActionBtn
                              onClick={() => setDelayForm({ itemId: item.id, minutes: '', note: item.onsite_note || '' })}
                              disabled={isSaving}
                              icon={<PauseCircle className="w-4 h-4" />}
                              label="Ritardo"
                              className="bg-amber-500 text-white hover:bg-amber-600"
                            />
                          )}
                          {cancelConfirm === item.id ? (
                            <div className="flex items-center gap-2">
                              <ActionBtn
                                onClick={() => handleCancel(item.id)}
                                disabled={isSaving}
                                icon={<XCircle className="w-4 h-4" />}
                                label="Conferma annulla"
                                className="bg-red-600 text-white hover:bg-red-700"
                              />
                              <ActionBtn
                                onClick={() => setCancelConfirm(null)}
                                disabled={isSaving}
                                label="No"
                                className="bg-gray-200 text-gray-700 hover:bg-gray-300"
                              />
                            </div>
                          ) : (
                            <ActionBtn
                              onClick={() => setCancelConfirm(item.id)}
                              disabled={isSaving}
                              icon={<XCircle className="w-4 h-4" />}
                              label="Annulla"
                              className="bg-red-100 text-red-700 hover:bg-red-200"
                            />
                          )}
                          {/* Note edit */}
                          {noteEdit?.itemId !== item.id && (
                            <ActionBtn
                              onClick={() => setNoteEdit({ itemId: item.id, note: item.onsite_note || '' })}
                              disabled={isSaving}
                              label="Nota"
                              className="bg-gray-100 text-gray-700 hover:bg-gray-200"
                            />
                          )}
                        </div>
                      )}

                      {/* Delay form */}
                      {delayForm?.itemId === item.id && !disabled && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                          <label className="block text-xs font-medium text-gray-700">
                            Minuti di ritardo *
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={delayForm.minutes}
                            onChange={(e) => setDelayForm({ ...delayForm, minutes: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
                            placeholder="es. 15"
                            aria-label="Minuti di ritardo"
                          />
                          <label className="block text-xs font-medium text-gray-700">
                            Nota (opzionale)
                          </label>
                          <input
                            type="text"
                            value={delayForm.note}
                            onChange={(e) => setDelayForm({ ...delayForm, note: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
                            placeholder="Motivo del ritardo"
                            aria-label="Nota ritardo"
                          />
                          <div className="flex gap-2">
                            <ActionBtn
                              onClick={handleDelaySubmit}
                              disabled={!delayForm.minutes || parseInt(delayForm.minutes) <= 0 || isSaving}
                              label="Salva ritardo"
                              className="bg-amber-600 text-white hover:bg-amber-700"
                            />
                            <ActionBtn
                              onClick={() => setDelayForm(null)}
                              disabled={isSaving}
                              label="Annulla"
                              className="bg-gray-200 text-gray-700 hover:bg-gray-300"
                            />
                          </div>
                        </div>
                      )}

                      {/* Note edit form */}
                      {noteEdit?.itemId === item.id && !disabled && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                          <label className="block text-xs font-medium text-gray-700">
                            Nota operativa
                          </label>
                          <input
                            type="text"
                            value={noteEdit.note}
                            onChange={(e) => setNoteEdit({ ...noteEdit, note: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
                            placeholder="Nota..."
                            aria-label="Nota operativa"
                          />
                          <div className="flex gap-2">
                            <ActionBtn
                              onClick={handleNoteSave}
                              disabled={isSaving}
                              label="Salva nota"
                              className="bg-gray-800 text-white hover:bg-gray-900"
                            />
                            <ActionBtn
                              onClick={() => setNoteEdit(null)}
                              disabled={isSaving}
                              label="Annulla"
                              className="bg-gray-200 text-gray-700 hover:bg-gray-300"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
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
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium min-h-[44px] transition-colors disabled:opacity-50 disabled:pointer-events-none ${className}`}
      aria-label={label}
    >
      {icon}
      {label}
    </button>
  )
}
