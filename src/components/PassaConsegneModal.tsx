import { useState, useEffect } from 'react'
import { X, ArrowRightLeft, Loader2, AlertTriangle, CheckCircle2, FileText, Users, Calendar, Wallet } from 'lucide-react'
import { computeHandoverRecap, executeHandover, type HandoverRecap } from '@/lib/handover-service'
import type { Event } from '@/data/events'

interface Profile {
  id: string
  first_name: string
  last_name: string
  role: string
  is_active: boolean
}

export function PassaConsegneModal({ event, profiles, currentUserId, onClose, onComplete }: {
  event: Event
  profiles: Profile[]
  currentUserId: string
  onClose: () => void
  onComplete: () => void
}) {
  const [recap, setRecap] = useState<HandoverRecap | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [toUserId, setToUserId] = useState('')
  const [note, setNote] = useState('')
  const [stayInTeam, setStayInTeam] = useState(true)
  const [makeResponsible, setMakeResponsible] = useState(true)

  const [search, setSearch] = useState('')

  useEffect(() => {
    computeHandoverRecap(event.id)
      .then(setRecap)
      .catch(() => setRecap(null))
      .finally(() => setLoading(false))
  }, [event.id])

  const eligibleUsers = profiles.filter(p =>
    p.is_active && p.id !== currentUserId
    && (search === '' || `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()))
  )

  async function handleSubmit() {
    if (!toUserId || !recap) return
    setSubmitting(true)
    setError('')
    const result = await executeHandover({
      eventId: event.id,
      toUserId,
      recap,
      note,
      stayInTeam,
      makeResponsible,
    })
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      setTimeout(onComplete, 1500)
    }
  }

  const selectedUser = profiles.find(p => p.id === toUserId)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Passa consegne</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{event.nome || `Evento #${event.eventNumber}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {success ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="text-lg font-medium text-gray-900 dark:text-white">Consegna completata!</p>
              <p className="text-sm text-gray-500">Il collega è stato notificato.</p>
            </div>
          ) : (
            <>
              {/* Step 1: Select colleague */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Seleziona collega
                </h3>
                <input
                  type="text"
                  placeholder="Cerca per nome..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm mb-2"
                />
                {!toUserId ? (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                    {eligibleUsers.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-400">Nessun utente trovato</p>
                    ) : (
                      eligibleUsers.slice(0, 20).map(u => (
                        <button
                          key={u.id}
                          onClick={() => setToUserId(u.id)}
                          className="w-full px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-between transition-colors"
                        >
                          <span className="text-sm text-gray-900 dark:text-white">{u.first_name} {u.last_name}</span>
                          <span className="text-xs text-gray-400">{u.role}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg">
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      {selectedUser?.first_name} {selectedUser?.last_name}
                    </span>
                    <button onClick={() => setToUserId('')} className="text-xs text-blue-500 hover:underline">Cambia</button>
                  </div>
                )}
              </section>

              {/* Step 2: Recap */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Riepilogo stato evento
                </h3>
                {loading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Calcolo in corso...
                  </div>
                ) : recap ? (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3 text-sm">
                    {/* Tasks */}
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-gray-700 dark:text-gray-300">
                          <strong>Task:</strong> {recap.tasks.total} totali — {recap.tasks.completed} completati, {recap.tasks.open} aperti
                          {recap.tasks.overdue > 0 && <span className="text-red-600 dark:text-red-400 font-medium">, {recap.tasks.overdue} in ritardo</span>}
                        </p>
                        {recap.tasks.overdueList.length > 0 && (
                          <ul className="mt-1 ml-2 text-xs text-red-600 dark:text-red-400 space-y-0.5">
                            {recap.tasks.overdueList.map((t, i) => (
                              <li key={i}>- {t.title} (scad. {t.dueDate})</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    {/* Upcoming deadlines */}
                    {recap.upcomingDeadlines.length > 0 && (
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-gray-700 dark:text-gray-300"><strong>Prossime scadenze:</strong></p>
                          <ul className="mt-1 ml-2 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                            {recap.upcomingDeadlines.map((d, i) => (
                              <li key={i}>- {d.title} ({d.dueDate})</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* Budget */}
                    {recap.budget && (
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-gray-400 shrink-0" />
                        <p className="text-gray-700 dark:text-gray-300">
                          <strong>Budget:</strong> {recap.budget.pctUsed}% utilizzato ({recap.budget.used.toLocaleString('it-IT')}€ / {recap.budget.total.toLocaleString('it-IT')}€)
                        </p>
                      </div>
                    )}

                    {/* Suppliers */}
                    {recap.suppliers && (
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400 shrink-0" />
                        <p className="text-gray-700 dark:text-gray-300">
                          <strong>Fornitori:</strong> {recap.suppliers.total} totali — {recap.suppliers.confirmed} confermati, {recap.suppliers.pending} in attesa
                        </p>
                      </div>
                    )}

                    {/* Documents */}
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <p className="text-gray-700 dark:text-gray-300">
                        <strong>Documenti:</strong> {recap.documentsCount}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Impossibile calcolare il riepilogo.</p>
                )}
              </section>

              {/* Step 3: Note */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Nota (opzionale)</h3>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Aggiungi indicazioni per il collega..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm resize-none"
                />
              </section>

              {/* Step 4: Access options */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Opzioni accesso</h3>

                {/* Your access */}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Il tuo accesso all'evento:</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStayInTeam(true)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        stayInTeam
                          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      Resto nel team
                    </button>
                    <button
                      onClick={() => setStayInTeam(false)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        !stayInTeam
                          ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      Esco dall'evento
                    </button>
                  </div>
                </div>

                {/* Colleague's role */}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Ruolo del collega:</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMakeResponsible(true)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        makeResponsible
                          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      Diventa responsabile
                    </button>
                    <button
                      onClick={() => setMakeResponsible(false)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        !makeResponsible
                          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      Aggiungi al team
                    </button>
                  </div>
                </div>

                {!stayInTeam && !makeResponsible && (
                  <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Stai uscendo dall'evento senza assegnare un nuovo responsabile. Il collega verrà aggiunto al team ma l'attuale responsabile rimarrà te — considera di trasferire la responsabilità.
                    </p>
                  </div>
                )}
              </section>

              {/* Error */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              {/* Submit */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!toUserId || submitting || loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Conferma consegna
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
