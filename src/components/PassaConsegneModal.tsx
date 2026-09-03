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

const sLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)',
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
}

const sInput: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8,
  background: 'var(--panel-solid)', color: 'var(--text)', fontFamily: 'var(--font-mono)',
  fontSize: 12, outline: 'none',
}

const sToggle = (active: boolean, accent: string): React.CSSProperties => ({
  flex: 1, padding: '8px 12px', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12,
  fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s', border: '1px solid',
  borderColor: active ? `color-mix(in srgb, var(${accent}) 50%, transparent)` : 'var(--line)',
  background: active ? `color-mix(in srgb, var(${accent}) 8%, var(--panel-solid))` : 'var(--panel-solid)',
  color: active ? `var(${accent})` : 'var(--muted)',
})

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
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, background: 'var(--panel-solid)', borderBottom: '1px solid var(--line)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '12px 12px 0 0', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'color-mix(in srgb, var(--blue) 10%, var(--panel-solid))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowRightLeft className="w-5 h-5" style={{ color: 'var(--blue)' }} />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Passa consegne</h2>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', margin: 0 }}>{event.nome || `Evento #${event.eventNumber}`}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, color: 'var(--muted)', transition: 'color 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {success ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 12 }}>
              <CheckCircle2 className="w-12 h-12" style={{ color: 'var(--green)' }} />
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Consegna completata!</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', margin: 0 }}>Il collega è stato notificato.</p>
            </div>
          ) : (
            <>
              {/* Step 1: Select colleague */}
              <section>
                <h3 style={sLabel}><Users className="w-4 h-4" /> Seleziona collega</h3>
                <input
                  type="text"
                  placeholder="Cerca per nome..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ ...sInput, marginBottom: 8 }}
                />
                {!toUserId ? (
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
                    {eligibleUsers.length === 0 ? (
                      <p style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', margin: 0 }}>Nessun utente trovato</p>
                    ) : (
                      eligibleUsers.slice(0, 20).map(u => (
                        <button
                          key={u.id}
                          onClick={() => setToUserId(u.id)}
                          style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.12s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--blue) 6%, transparent)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                        >
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>{u.first_name} {u.last_name}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{u.role}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'color-mix(in srgb, var(--blue) 8%, var(--panel-solid))', border: '1px solid color-mix(in srgb, var(--blue) 30%, transparent)', padding: '8px 12px', borderRadius: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>
                      {selectedUser?.first_name} {selectedUser?.last_name}
                    </span>
                    <button onClick={() => setToUserId('')} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Cambia</button>
                  </div>
                )}
              </section>

              {/* Step 2: Recap */}
              <section>
                <h3 style={sLabel}><FileText className="w-4 h-4" /> Riepilogo stato evento</h3>
                {loading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
                    <Loader2 className="w-4 h-4 animate-spin" /> Calcolo in corso...
                  </div>
                ) : recap ? (
                  <div style={{ background: 'color-mix(in srgb, var(--text) 3%, var(--panel-solid))', border: '1px solid var(--line)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Tasks */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--muted)', marginTop: 2 }} />
                      <div>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', margin: 0 }}>
                          <strong>Task:</strong> {recap.tasks.total} totali — {recap.tasks.completed} completati, {recap.tasks.open} aperti
                          {recap.tasks.overdue > 0 && <span style={{ color: 'var(--red2)', fontWeight: 600 }}>, {recap.tasks.overdue} in ritardo</span>}
                        </p>
                        {recap.tasks.overdueList.length > 0 && (
                          <ul style={{ margin: '4px 0 0 8px', padding: 0, listStyle: 'none' }}>
                            {recap.tasks.overdueList.map((t, i) => (
                              <li key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red2)' }}>- {t.title} (scad. {t.dueDate})</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    {/* Upcoming deadlines */}
                    {recap.upcomingDeadlines.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <Calendar className="w-4 h-4 shrink-0" style={{ color: 'var(--muted)', marginTop: 2 }} />
                        <div>
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', margin: 0 }}><strong>Prossime scadenze:</strong></p>
                          <ul style={{ margin: '4px 0 0 8px', padding: 0, listStyle: 'none' }}>
                            {recap.upcomingDeadlines.map((d, i) => (
                              <li key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>- {d.title} ({d.dueDate})</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* Budget */}
                    {recap.budget && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Wallet className="w-4 h-4 shrink-0" style={{ color: 'var(--muted)' }} />
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', margin: 0 }}>
                          <strong>Budget:</strong> {recap.budget.pctUsed}% utilizzato ({recap.budget.used.toLocaleString('it-IT')}€ / {recap.budget.total.toLocaleString('it-IT')}€)
                        </p>
                      </div>
                    )}

                    {/* Suppliers */}
                    {recap.suppliers && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--muted)' }} />
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', margin: 0 }}>
                          <strong>Fornitori:</strong> {recap.suppliers.total} totali — {recap.suppliers.confirmed} confermati, {recap.suppliers.pending} in attesa
                        </p>
                      </div>
                    )}

                    {/* Documents */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--muted)' }} />
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', margin: 0 }}>
                        <strong>Documenti:</strong> {recap.documentsCount}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', margin: 0 }}>Impossibile calcolare il riepilogo.</p>
                )}
              </section>

              {/* Step 3: Note */}
              <section>
                <h3 style={sLabel}>Nota (opzionale)</h3>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Aggiungi indicazioni per il collega..."
                  rows={3}
                  style={{ ...sInput, resize: 'none' }}
                />
              </section>

              {/* Step 4: Access options */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h3 style={sLabel}>Opzioni accesso</h3>

                {/* Your access */}
                <div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', margin: '0 0 6px' }}>Il tuo accesso all'evento:</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setStayInTeam(true)} style={sToggle(stayInTeam, '--blue')}>
                      Resto nel team
                    </button>
                    <button onClick={() => setStayInTeam(false)} style={sToggle(!stayInTeam, '--yellow')}>
                      Esco dall'evento
                    </button>
                  </div>
                </div>

                {/* Colleague's role */}
                <div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', margin: '0 0 6px' }}>Ruolo del collega:</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setMakeResponsible(true)} style={sToggle(makeResponsible, '--blue')}>
                      Diventa responsabile
                    </button>
                    <button onClick={() => setMakeResponsible(false)} style={sToggle(!makeResponsible, '--blue')}>
                      Aggiungi al team
                    </button>
                  </div>
                </div>

                {!stayInTeam && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'color-mix(in srgb, var(--red2) 8%, var(--panel-solid))', border: '1px solid color-mix(in srgb, var(--red2) 40%, transparent)', borderRadius: 8, padding: '12px 14px' }}>
                      <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: 'var(--red2)', marginTop: 1 }} />
                      <div>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--red2)', margin: '0 0 4px', lineHeight: 1.4 }}>
                          Attenzione: perderai l'accesso a questo evento
                        </p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red2)', margin: 0, lineHeight: 1.5, opacity: 0.85 }}>
                          Uscendo dall'evento non potrai più visualizzarlo né modificarlo. Per rientrare, un membro del team o un amministratore dovrà riaggiunterti manualmente.
                        </p>
                      </div>
                    </div>
                    {!makeResponsible && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'color-mix(in srgb, var(--yellow) 8%, var(--panel-solid))', border: '1px solid color-mix(in srgb, var(--yellow) 40%, transparent)', borderRadius: 8, padding: '8px 12px' }}>
                        <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--yellow)', marginTop: 2 }} />
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--yellow)', margin: 0, lineHeight: 1.5 }}>
                          Stai uscendo senza assegnare un nuovo responsabile. Il collega verrà aggiunto al team ma l'attuale responsabile rimarrà te.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Error */}
              {error && (
                <div style={{ background: 'color-mix(in srgb, var(--red2) 8%, var(--panel-solid))', border: '1px solid color-mix(in srgb, var(--red2) 30%, transparent)', borderRadius: 8, padding: '8px 12px' }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--red2)', margin: 0 }}>{error}</p>
                </div>
              )}

              {/* Submit */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                <button
                  onClick={onClose}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 16px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel-solid)', color: 'var(--muted)', cursor: 'pointer', minHeight: 40 }}
                >
                  Annulla
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!toUserId || submitting || loading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--blue)', color: 'white', cursor: !toUserId || submitting || loading ? 'not-allowed' : 'pointer', minHeight: 40, opacity: !toUserId || submitting || loading ? 0.5 : 1, transition: 'opacity 0.12s' }}
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
