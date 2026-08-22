import { useState, useEffect, useCallback } from 'react'
import { Sparkles, CheckCircle2, Plus, Pencil, Trash2, Users, ChevronDown, ChevronUp } from 'lucide-react'
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

  async function handleMark(pillId: string) {
    if (readIds.has(pillId)) return
    try {
      await markPillRead(pillId)
      setReads(prev => [...prev, { pill_id: pillId, user_id: user?.id ?? '', read_at: new Date().toISOString() }])
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
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
        Pillole formative su intelligenza artificiale e sicurezza informatica. Completale tutte per dimostrare la tua alfabetizzazione AI (Art. 4 AI Act).
      </p>

      {/* Progress */}
      <div style={{ background: 'var(--panel-solid)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            Hai completato {progress} di {pills.length} pillole
          </span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {pills.length > 0 ? Math.round((progress / pills.length) * 100) : 0}%
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: progress === pills.length ? 'var(--green)' : 'var(--blue)',
            width: `${pills.length > 0 ? (progress / pills.length) * 100 : 0}%`,
            transition: 'width 0.3s ease',
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

  return (
    <div style={{
      background: 'var(--panel-solid)', borderRadius: 12, border: '1px solid var(--line)',
      overflow: 'hidden', transition: 'box-shadow 0.2s',
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
          transition: 'all 0.2s',
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
                    <button key={idx} onClick={() => setQuizAnswer(idx)} disabled={showResult}
                      style={{ padding: '8px 12px', borderRadius: 6, background: bg, border, cursor: showResult ? 'default' : 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text)' }}>
                      {opt}
                    </button>
                  )
                })}
              </div>
              {quizAnswer !== null && (
                <p style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: quizAnswer === pill.quiz_json.correct ? 'var(--green)' : 'var(--red2)' }}>
                  {quizAnswer === pill.quiz_json.correct ? 'Esatto!' : 'Ricontrolla la risposta.'}
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {!isRead && (
              <button onClick={onMark} style={{
                padding: '8px 16px', borderRadius: 8, background: 'var(--green)', color: '#fff',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <CheckCircle2 size={14} /> Fatto
              </button>
            )}
            {isRead && <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Completata</span>}
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
                  <td style={tdStyle}>{r.nome ?? ''} {r.cognome ?? ''}</td>
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
