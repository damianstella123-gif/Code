import { useState, useEffect, useCallback } from 'react'
import { X, Edit3, XCircle, Clock, AlertTriangle, FileText } from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import {
  getUserLeaveRequests,
  updatePendingLeaveRequest,
  withdrawPendingLeaveRequest,
  requestApprovedLeaveChange,
  fetchMyLeaveChanges,
  type LeaveRequest,
  type LeaveRequestChange,
} from '@/lib/leave-requests-service'

const TIPO_LABELS: Record<string, string> = {
  ferie: 'Ferie',
  permesso: 'Permesso',
  malattia: 'Malattia',
  recupero: 'Recupero',
}

const STATO_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  in_attesa: { bg: 'rgba(234,179,8,0.12)', color: '#eab308', label: 'In attesa' },
  approvata: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Approvata' },
  negata: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Negata' },
  annullata: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', label: 'Annullata' },
}

function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

interface Props {
  onClose: () => void
}

export default function LeaveRequestsManager({ onClose }: Props) {
  const { showToast } = useToast()
  const user = loadUser()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [changes, setChanges] = useState<LeaveRequestChange[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Edit modal state
  const [editingRequest, setEditingRequest] = useState<LeaveRequest | null>(null)
  const [editDataInizio, setEditDataInizio] = useState('')
  const [editDataFine, setEditDataFine] = useState('')
  const [editOraInizio, setEditOraInizio] = useState('')
  const [editOraFine, setEditOraFine] = useState('')
  const [editMotivo, setEditMotivo] = useState('')

  // Withdraw confirm
  const [withdrawId, setWithdrawId] = useState<string | null>(null)

  // Change request modal
  const [changeTarget, setChangeTarget] = useState<LeaveRequest | null>(null)
  const [changeType, setChangeType] = useState<'modifica' | 'annullamento'>('modifica')
  const [changeDataInizio, setChangeDataInizio] = useState('')
  const [changeDataFine, setChangeDataFine] = useState('')
  const [changeOraInizio, setChangeOraInizio] = useState('')
  const [changeOraFine, setChangeOraFine] = useState('')
  const [changeMotivo, setChangeMotivo] = useState('')
  const [changeReason, setChangeReason] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    const [reqs, chgs] = await Promise.all([
      getUserLeaveRequests(user?.id),
      fetchMyLeaveChanges(),
    ])
    setRequests(reqs)
    setChanges(chgs)
    setLoading(false)
  }, [user?.id])

  useEffect(() => { reload() }, [reload])

  function getPendingChange(requestId: string): LeaveRequestChange | undefined {
    return changes.find(c => c.leave_request_id === requestId && c.change_status === 'in_attesa')
  }

  // ─── Edit pending ───────────────────────────────────

  function openEdit(req: LeaveRequest) {
    setEditingRequest(req)
    setEditDataInizio(req.data_inizio)
    setEditDataFine(req.data_fine)
    setEditOraInizio(req.ora_inizio?.slice(0, 5) || '')
    setEditOraFine(req.ora_fine?.slice(0, 5) || '')
    setEditMotivo(req.motivo || '')
  }

  async function handleEditSubmit() {
    if (!editingRequest || submitting) return
    setSubmitting(true)
    const result = await updatePendingLeaveRequest({
      requestId: editingRequest.id,
      dataInizio: editDataInizio,
      dataFine: editDataFine,
      oraInizio: editOraInizio || null,
      oraFine: editOraFine || null,
      motivo: editMotivo || null,
    })
    setSubmitting(false)
    if (result.error) { showToast(result.error); return }
    showToast('Richiesta aggiornata')
    setEditingRequest(null)
    await reload()
  }

  // ─── Withdraw ──────────────────────────────────────

  async function handleWithdraw() {
    if (!withdrawId || submitting) return
    setSubmitting(true)
    const result = await withdrawPendingLeaveRequest(withdrawId)
    setSubmitting(false)
    if (result.error) { showToast(result.error); return }
    showToast('Richiesta ritirata')
    setWithdrawId(null)
    await reload()
  }

  // ─── Change request (approved) ─────────────────────

  function openChangeRequest(req: LeaveRequest, type: 'modifica' | 'annullamento') {
    setChangeTarget(req)
    setChangeType(type)
    setChangeDataInizio(req.data_inizio)
    setChangeDataFine(req.data_fine)
    setChangeOraInizio(req.ora_inizio?.slice(0, 5) || '')
    setChangeOraFine(req.ora_fine?.slice(0, 5) || '')
    setChangeMotivo(req.motivo || '')
    setChangeReason('')
  }

  async function handleChangeSubmit() {
    if (!changeTarget || submitting) return
    setSubmitting(true)
    const result = await requestApprovedLeaveChange({
      requestId: changeTarget.id,
      changeType,
      dataInizio: changeType === 'modifica' ? changeDataInizio : null,
      dataFine: changeType === 'modifica' ? changeDataFine : null,
      oraInizio: changeType === 'modifica' ? (changeOraInizio || null) : null,
      oraFine: changeType === 'modifica' ? (changeOraFine || null) : null,
      motivo: changeType === 'modifica' ? (changeMotivo || null) : null,
      employeeReason: changeReason,
    })
    setSubmitting(false)
    if (result.error) { showToast(result.error); return }
    showToast(changeType === 'modifica' ? 'Richiesta di modifica inviata' : 'Richiesta di annullamento inviata')
    setChangeTarget(null)
    await reload()
  }

  // ─── Render ────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--line)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 14,
    minHeight: 44,
    fontFamily: 'var(--font-mono)',
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: 4,
    display: 'block',
    letterSpacing: '0.03em',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 16, width: 480, maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text)' }}>
            Le mie richieste
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8 }}>
            <X style={{ width: 16, height: 16, color: 'var(--muted)' }} />
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 24 }}>Caricamento...</p>}
          {!loading && requests.length === 0 && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 24 }}>Nessuna richiesta presente.</p>
          )}
          {!loading && requests.map(req => {
            const stato = STATO_STYLES[req.stato] || STATO_STYLES.in_attesa
            const pendingChange = getPendingChange(req.id)
            const isPermesso = req.tipo === 'permesso'

            return (
              <div key={req.id} style={{ marginBottom: 12, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--panel2)', overflow: 'hidden' }}>
                {/* Card header */}
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                    {TIPO_LABELS[req.tipo] || req.tipo}
                  </span>
                  <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: stato.bg, color: stato.color, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    {stato.label}
                  </span>
                  {pendingChange && (
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: 'rgba(147,51,234,0.12)', color: '#9333ea', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                      {pendingChange.change_type === 'modifica' ? 'Modifica richiesta' : 'Annullamento richiesto'}
                    </span>
                  )}
                </div>

                {/* Card body */}
                <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock style={{ width: 14, height: 14, color: 'var(--muted)', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)' }}>
                      {fmtDate(req.data_inizio)}{req.data_fine !== req.data_inizio ? ` \u2192 ${fmtDate(req.data_fine)}` : ''}
                    </span>
                  </div>
                  {isPermesso && req.ora_inizio && req.ora_fine && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Clock style={{ width: 14, height: 14, color: 'var(--muted)', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)' }}>
                        {req.ora_inizio.slice(0, 5)} \u2013 {req.ora_fine.slice(0, 5)}
                      </span>
                    </div>
                  )}
                  {req.motivo && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <FileText style={{ width: 14, height: 14, color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{req.motivo}</span>
                    </div>
                  )}
                  {req.stato === 'negata' && req.note_admin && (
                    <div style={{ marginTop: 4, padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ef4444', fontWeight: 500 }}>Motivo rifiuto:</span>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', marginTop: 2 }}>{req.note_admin}</p>
                    </div>
                  )}
                </div>

                {/* Card actions */}
                {req.stato === 'in_attesa' && (
                  <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => openEdit(req)} disabled={submitting}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', minHeight: 44, borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>
                      <Edit3 style={{ width: 14, height: 14 }} /> Modifica
                    </button>
                    <button onClick={() => setWithdrawId(req.id)} disabled={submitting}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', minHeight: 44, borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>
                      <XCircle style={{ width: 14, height: 14 }} /> Ritira
                    </button>
                  </div>
                )}
                {req.stato === 'approvata' && !pendingChange && (
                  <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => openChangeRequest(req, 'modifica')} disabled={submitting}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', minHeight: 44, borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>
                      <Edit3 style={{ width: 14, height: 14 }} /> Richiedi modifica
                    </button>
                    <button onClick={() => openChangeRequest(req, 'annullamento')} disabled={submitting}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', minHeight: 44, borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>
                      <XCircle style={{ width: 14, height: 14 }} /> Richiedi annullamento
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Edit pending modal ─────────────────────── */}
      {editingRequest && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
          onClick={() => setEditingRequest(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 24, width: 400, maxWidth: '100%' }}>
            <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text)', marginBottom: 16 }}>
              Modifica richiesta
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Dal</label>
                  <input type="date" value={editDataInizio} onChange={e => { setEditDataInizio(e.target.value); if (e.target.value > editDataFine) setEditDataFine(e.target.value) }} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Al</label>
                  <input type="date" value={editDataFine} min={editDataInizio} onChange={e => setEditDataFine(e.target.value)} style={inputStyle} />
                </div>
              </div>
              {editingRequest.tipo === 'permesso' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Dalle</label>
                    <input type="time" value={editOraInizio} onChange={e => setEditOraInizio(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Alle</label>
                    <input type="time" value={editOraFine} onChange={e => setEditOraFine(e.target.value)} style={inputStyle} />
                  </div>
                </div>
              )}
              <div>
                <label style={labelStyle}>Motivo (opzionale)</label>
                <textarea value={editMotivo} onChange={e => setEditMotivo(e.target.value)} rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingRequest(null)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 14px', minHeight: 44, borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
                Annulla
              </button>
              <button onClick={handleEditSubmit} disabled={submitting}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 14px', minHeight: 44, borderRadius: 8, border: 'none', background: 'var(--red2)', color: '#fff', cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Withdraw confirm ──────────────────────── */}
      {withdrawId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
          onClick={() => setWithdrawId(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 24, width: 360, maxWidth: '100%', textAlign: 'center' }}>
            <AlertTriangle style={{ width: 32, height: 32, color: '#eab308', margin: '0 auto 12px' }} />
            <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Conferma ritiro</h4>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
              Vuoi ritirare questa richiesta? L'operazione non e' reversibile.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setWithdrawId(null)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 14px', minHeight: 44, borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
                Annulla
              </button>
              <button onClick={handleWithdraw} disabled={submitting}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 14px', minHeight: 44, borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'Ritiro...' : 'Ritira richiesta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Change request modal (approved) ──────── */}
      {changeTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}
          onClick={() => setChangeTarget(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 24, width: 420, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text)', marginBottom: 4 }}>
              {changeType === 'modifica' ? 'Richiedi modifica' : 'Richiedi annullamento'}
            </h4>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
              La richiesta originale rimane valida fino all'approvazione.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {changeType === 'modifica' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Nuova data inizio</label>
                      <input type="date" value={changeDataInizio} onChange={e => { setChangeDataInizio(e.target.value); if (e.target.value > changeDataFine) setChangeDataFine(e.target.value) }} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Nuova data fine</label>
                      <input type="date" value={changeDataFine} min={changeDataInizio} onChange={e => setChangeDataFine(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                  {changeTarget.tipo === 'permesso' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={labelStyle}>Nuova ora inizio</label>
                        <input type="time" value={changeOraInizio} onChange={e => setChangeOraInizio(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Nuova ora fine</label>
                        <input type="time" value={changeOraFine} onChange={e => setChangeOraFine(e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>Motivo (opzionale)</label>
                    <textarea value={changeMotivo} onChange={e => setChangeMotivo(e.target.value)} rows={2}
                      style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                </>
              )}
              <div>
                <label style={labelStyle}>Motivazione richiesta *</label>
                <textarea value={changeReason} onChange={e => setChangeReason(e.target.value)} rows={2}
                  placeholder="Almeno 5 caratteri..."
                  style={{ ...inputStyle, resize: 'vertical' }} />
                {changeReason.trim().length > 0 && changeReason.trim().length < 5 && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ef4444', marginTop: 4, display: 'block' }}>Almeno 5 caratteri richiesti</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setChangeTarget(null)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 14px', minHeight: 44, borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
                Annulla
              </button>
              <button onClick={handleChangeSubmit} disabled={submitting || changeReason.trim().length < 5}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '10px 14px', minHeight: 44, borderRadius: 8, border: 'none', background: changeType === 'annullamento' ? '#ef4444' : 'var(--red2)', color: '#fff', cursor: 'pointer', opacity: (submitting || changeReason.trim().length < 5) ? 0.5 : 1 }}>
                {submitting ? 'Invio...' : changeType === 'modifica' ? 'Invia richiesta modifica' : 'Invia richiesta annullamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
