import { useState, useEffect, useCallback, useRef } from 'react'
import { Sparkles, CheckCircle2, Plus, Pencil, Trash2, Users, ChevronDown, ChevronUp, PartyPopper } from 'lucide-react'
import {
  fetchPills, fetchMyReads, markPillRead, createPill, updatePill, deletePill,
  fetchAllReadsAdmin, type AiPill, type AiPillRead, type AiPillReadWithProfile,
} from '@/lib/ai-pills-service'
import { loadUser, isAdmin } from '@/lib/auth'
import { fmtLong } from '@/lib/format'

export default function AiTrasparenza() {
  const user = loadUser()
  const admin = isAdmin(user)
  const [pills, setPills] = useState<AiPill[]>([])
  const [reads, setReads] = useState<AiPillRead[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editPill, setEditPill] = useState<AiPill | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [allReads, setAllReads] = useState<AiPillReadWithProfile[]>([])
  const [registerLoading, setRegisterLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showAllDone, setShowAllDone] = useState(false)
  const prevProgressRef = useRef(0)

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([fetchPills(), fetchMyReads()])
      setPills(p)
      setReads(r)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const readIds = new Set(reads.map(r => r.pill_id))
  const progress = pills.length > 0 ? readIds.size : 0
  const allComplete = pills.length > 0 && progress === pills.length

  useEffect(() => {
    if (progress > prevProgressRef.current && progress === pills.length && pills.length > 0) {
      setShowAllDone(true)
    }
    prevProgressRef.current = progress
  }, [progress, pills.length])

  async function handleMark(pillId: string) {
    if (readIds.has(pillId)) return
    try {
      const userId = await markPillRead(pillId)
      setReads(prev => [...prev, { pill_id: pillId, user_id: userId, read_at: new Date().toISOString() }])
      setToast('Fatto! Una in meno.')
      setTimeout(() => setToast(null), 2500)
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminare questa pillola?')) return
    try {
      await deletePill(id)
      setPills(prev => prev.filter(p => p.id !== id))
    } catch { /* ignore */ }
  }

  async function handleLoadRegister() {
    setShowRegister(true)
    setRegisterLoading(true)
    try {
      const data = await fetchAllReadsAdmin()
      setAllReads(data)
    } catch { /* ignore */ }
    setRegisterLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Caricamento...</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Sparkles size={28} style={{ color: 'var(--blue)' }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>AI & Trasparenza</h1>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>
        Piccola cosa: la legge europea chiede a tutte le aziende che usano l'AI di tenere il team informato. Invece di darti un manuale da 100 pagine, abbiamo pensato di rendertela leggera. Due minuti a pillola, quando ti va.
      </p>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.5, fontStyle: 'italic' }}>
        Questa formazione è richiesta dalla legge europea a tutte le aziende che usano l'AI. Grazie per dedicarci due minuti: ci aiuti a lavorare tutti in modo più sicuro e sereno.
      </p>

      {/* Progress */}
      <div style={{ background: 'var(--panel-solid)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            {allComplete
              ? 'Tutte completate! Grazie.'
              : `Hai completato ${progress} di ${pills.length} pillole`}
          </span>
          <span style={{ fontSize: 13, color: allComplete ? 'var(--green)' : 'var(--muted)', fontWeight: allComplete ? 600 : 400 }}>
            {pills.length > 0 ? Math.round((progress / pills.length) * 100) : 0}%
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: allComplete ? 'var(--green)' : 'var(--blue)',
            width: `${pills.length > 0 ? (progress / pills.length) * 100 : 0}%`,
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Admin actions */}
      {admin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button onClick={() => { setEditPill(null); setShowForm(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <Plus size={15} /> Nuova pillola
          </button>
          <button onClick={handleLoadRegister}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--panel-solid)', color: 'var(--text)', border: '1px solid var(--line)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <Users size={15} /> Registro letture
          </button>
        </div>
      )}

      {/* Pills list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pills.map(pill => (
          <PillCard
            key={pill.id}
            pill={pill}
            isRead={readIds.has(pill.id)}
            expanded={expanded === pill.id}
            onToggle={() => setExpanded(expanded === pill.id ? null : pill.id)}
            onMark={() => handleMark(pill.id)}
            admin={admin}
            onEdit={() => { setEditPill(pill); setShowForm(true) }}
            onDelete={() => handleDelete(pill.id)}
          />
        ))}
      </div>

      {pills.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 40 }}>Nessuna pillola disponibile.</p>
      )}

      {/* Toast notification */}
      {toast && <Toast message={toast} />}

      {/* All done celebration */}
      {showAllDone && <AllDoneCelebration onClose={() => setShowAllDone(false)} />}

      {/* Form modal */}
      {showForm && (
        <PillFormModal
          initial={editPill}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}

      {/* Admin register modal */}
      {showRegister && (
        <RegisterModal
          pills={pills}
          reads={allReads}
          loading={registerLoading}
          onClose={() => setShowRegister(false)}
        />
      )}
    </div>
  )
}

// ─── Toast ─────────────────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--green)', color: '#fff', padding: '10px 20px', borderRadius: 10,
      fontSize: 14, fontWeight: 600, zIndex: 2000, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      display: 'flex', alignItems: 'center', gap: 8,
      animation: 'fadeInUp 0.3s ease',
    }}>
      <CheckCircle2 size={16} /> {message}
    </div>
  )
}

// ─── All Done Celebration ──────────────────────────────────────────────────

function AllDoneCelebration({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)', padding: 16, animation: 'fadeIn 0.3s ease',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--panel-solid)', borderRadius: 20, padding: '40px 32px', textAlign: 'center',
        maxWidth: 400, width: '100%', animation: 'scaleIn 0.3s ease', position: 'relative',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <PartyPopper size={28} style={{ color: 'var(--green)' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          Grazie!
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', marginBottom: 8 }}>
          Hai completato tutte le pillole. Sei ufficialmente aggiornato, e ci hai aiutato a tenere Simmetria in regola.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', marginBottom: 20 }}>
          Piccola cosa per te, grande cosa per il team.
        </p>
        <button onClick={onClose} style={{
          padding: '10px 24px', borderRadius: 10, background: 'var(--green)', color: '#fff',
          border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
        }}>
          Perfetto
        </button>
      </div>
    </div>
  )
}

// ─── Pill Card ─────────────────────────────────────────────────────────────

interface PillCardProps {
  pill: AiPill
  isRead: boolean
  expanded: boolean
  onToggle: () => void
  onMark: () => void
  admin: boolean
  onEdit: () => void
  onDelete: () => void
}

function PillCard({ pill, isRead, expanded, onToggle, onMark, admin, onEdit, onDelete }: PillCardProps) {
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null)
  const [justCompleted, setJustCompleted] = useState(false)

  function handleQuizAnswer(idx: number) {
    setQuizAnswer(idx)
    if (idx === pill.quiz_json?.correct && !isRead) {
      setJustCompleted(true)
      onMark()
    }
  }

  function handleManualMark() {
    setJustCompleted(true)
    onMark()
  }

  return (
    <div style={{
      background: 'var(--panel-solid)', borderRadius: 12,
      border: justCompleted ? '1px solid var(--green)' : '1px solid var(--line)',
      overflow: 'hidden', transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      boxShadow: justCompleted ? '0 0 0 3px rgba(34,197,94,0.1)' : 'none',
    }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isRead ? 'var(--green)' : 'var(--line)',
          color: isRead ? '#fff' : 'var(--muted)',
          transition: 'all 0.3s ease',
        }}>
          {isRead ? <CheckCircle2 size={16} /> : <span style={{ fontSize: 12, fontWeight: 700 }}>{pill.sort_order}</span>}
        </div>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{pill.title}</span>
        {expanded ? <ChevronUp size={16} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted)' }} />}
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--line)' }}>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '14px 0', whiteSpace: 'pre-wrap' }}>
            {pill.body}
          </p>

          {pill.quiz_json && (
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>{pill.quiz_json.question}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pill.quiz_json.options.map((opt, idx) => {
                  const chosen = quizAnswer === idx
                  const correct = idx === pill.quiz_json!.correct
                  const showResult = quizAnswer !== null
                  let bg = 'var(--panel-solid)'
                  let border = '1px solid var(--line)'
                  if (showResult && chosen && correct) { bg = 'rgba(34,197,94,0.1)'; border = '1px solid var(--green)' }
                  if (showResult && chosen && !correct) { bg = 'rgba(239,68,68,0.1)'; border = '1px solid var(--red2)' }
                  if (showResult && !chosen && correct) { bg = 'rgba(34,197,94,0.05)'; border = '1px solid var(--green)' }
                  return (
                    <button key={idx} onClick={() => handleQuizAnswer(idx)} disabled={showResult}
                      style={{ padding: '8px 12px', borderRadius: 6, background: bg, border, cursor: showResult ? 'default' : 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text)', transition: 'all 0.2s ease' }}>
                      {opt}
                    </button>
                  )
                })}
              </div>
              {quizAnswer !== null && (
                <p style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: quizAnswer === pill.quiz_json.correct ? 'var(--green)' : 'var(--red2)' }}>
                  {quizAnswer === pill.quiz_json.correct ? 'Esatto! Pillola completata.' : 'Non proprio, ma nessun problema. Guarda la risposta giusta evidenziata qui sopra.'}
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {!isRead && !justCompleted && (
              <button onClick={handleManualMark} style={{
                padding: '8px 16px', borderRadius: 8, background: 'var(--green)', color: '#fff',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <CheckCircle2 size={14} /> Fatto, letta!
              </button>
            )}
            {(isRead || justCompleted) && (
              <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={14} /> Completata
              </span>
            )}
            {admin && (
              <>
                <button onClick={onEdit} style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, background: 'none', border: '1px solid var(--line)', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <Pencil size={13} /> Modifica
                </button>
                <button onClick={onDelete} style={{ padding: '6px 10px', borderRadius: 6, background: 'none', border: '1px solid var(--line)', cursor: 'pointer', color: 'var(--red2)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <Trash2 size={13} /> Elimina
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pill Form Modal ───────────────────────────────────────────────────────

interface PillFormModalProps {
  initial: AiPill | null
  onClose: () => void
  onSaved: () => void
}

function PillFormModal({ initial, onClose, onSaved }: PillFormModalProps) {
  const isEdit = initial !== null
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0)
  const [hasQuiz, setHasQuiz] = useState(!!initial?.quiz_json)
  const [question, setQuestion] = useState(initial?.quiz_json?.question ?? '')
  const [options, setOptions] = useState<string[]>(initial?.quiz_json?.options ?? ['', '', ''])
  const [correct, setCorrect] = useState(initial?.quiz_json?.correct ?? 0)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    const quiz = hasQuiz && question.trim() && options.filter(o => o.trim()).length >= 2
      ? { question: question.trim(), options: options.filter(o => o.trim()), correct }
      : null
    try {
      if (isEdit) {
        await updatePill(initial!.id, { title: title.trim(), body: body.trim(), quiz_json: quiz, sort_order: sortOrder })
      } else {
        await createPill({ title: title.trim(), body: body.trim(), quiz_json: quiz, sort_order: sortOrder })
      }
      onSaved()
    } catch { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--panel-solid)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
          {isEdit ? 'Modifica pillola' : 'Nuova pillola'}
        </h2>

        <label style={labelStyle}>Titolo</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />

        <label style={labelStyle}>Contenuto</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' }} />

        <label style={labelStyle}>Ordine</label>
        <input type="number" value={sortOrder} onChange={e => setSortOrder(+e.target.value)} style={{ ...inputStyle, width: 80 }} />

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={hasQuiz} onChange={e => setHasQuiz(e.target.checked)} />
          Quiz opzionale
        </label>

        {hasQuiz && (
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, marginTop: 8 }}>
            <label style={labelStyle}>Domanda</label>
            <input value={question} onChange={e => setQuestion(e.target.value)} style={inputStyle} />
            <label style={labelStyle}>Opzioni (min 2)</label>
            {options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} />
                <input value={opt} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n) }} style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder={`Opzione ${i + 1}`} />
              </div>
            ))}
            <button type="button" onClick={() => setOptions([...options, ''])} style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>+ Aggiungi opzione</button>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Seleziona il radio della risposta corretta.</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', cursor: 'pointer', fontSize: 13 }}>Annulla</button>
          <button onClick={handleSave} disabled={saving || !title.trim() || !body.trim()} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvataggio...' : isEdit ? 'Salva' : 'Crea'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Register Modal (Admin) ────────────────────────────────────────────────

interface RegisterModalProps {
  pills: AiPill[]
  reads: AiPillReadWithProfile[]
  loading: boolean
  onClose: () => void
}

function RegisterModal({ pills, reads, loading, onClose }: RegisterModalProps) {
  const pillMap = Object.fromEntries(pills.map(p => [p.id, p.title]))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--panel-solid)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 640, maxHeight: '85vh', overflow: 'auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Registro letture (AI Literacy)</h2>
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>Caricamento...</p>
        ) : reads.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Nessuna lettura registrata.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={thStyle}>Utente</th>
                <th style={thStyle}>Pillola</th>
                <th style={thStyle}>Data</th>
              </tr>
            </thead>
            <tbody>
              {reads.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={tdStyle}>{r.nome ?? 'Utente'}</td>
                  <td style={tdStyle}>{pillMap[r.pill_id] ?? r.pill_id}</td>
                  <td style={tdStyle}>{fmtLong(r.read_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ textAlign: 'right', marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', cursor: 'pointer', fontSize: 13 }}>Chiudi</button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, marginTop: 12 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, marginBottom: 4 }
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 6px', color: 'var(--muted)', fontWeight: 600 }
const tdStyle: React.CSSProperties = { padding: '8px 6px', color: 'var(--text)' }
