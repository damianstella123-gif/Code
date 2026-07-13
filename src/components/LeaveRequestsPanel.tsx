import { useState, useEffect, useCallback } from 'react'
import { Check, X, AlertCircle, Clock } from 'lucide-react'
import { getPendingLeaveRequests, approveLeaveRequest, rejectLeaveRequest, type LeaveRequest } from '@/lib/leave-requests-service'
import { useToast } from '@/lib/toast'

const TIPO_COLORS: Record<string, string> = { ferie: 'var(--blue)', permesso: '#eab308', malattia: '#6b7280', recupero: '#22c55e' }

function calcDays(d1: string, d2: string) {
  return Math.max(1, Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000) + 1)
}

export function LeaveRequestsPanel() {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const { showToast } = useToast()

  const loadRequests = useCallback(async () => {
    const data = await getPendingLeaveRequests()
    setRequests(data)
    setLoading(false)
  }, [])

  useEffect(() => { loadRequests() }, [loadRequests])

  const handleApprove = async (id: string) => {
    const ok = await approveLeaveRequest(id)
    if (ok) showToast('Richiesta approvata', 'success')
    loadRequests()
  }

  const handleReject = async (id: string) => {
    if (rejectNote.trim().length < 10) {
      showToast('Inserisci almeno 10 caratteri per il motivo', 'error')
      return
    }
    const ok = await rejectLeaveRequest(id, rejectNote)
    if (ok) showToast('Richiesta rifiutata', 'success')
    setRejectingId(null)
    setRejectNote('')
    loadRequests()
  }

  if (loading) return null
  if (requests.length === 0) return null

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock className="w-3 h-3" />
        FERIE/PERMESSI IN ATTESA ({requests.length})
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {requests.map(req => {
          const days = req.giorni_richiesti || calcDays(req.data_inizio, req.data_fine)
          const userName = req.profiles ? `${req.profiles.first_name} ${req.profiles.last_name}` : '—'
          return (
            <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel-solid)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#eab308' }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                  {userName}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: TIPO_COLORS[req.tipo] || 'var(--muted)' }}>{req.tipo}</span>
                  <span>{req.data_inizio} — {req.data_fine}</span>
                  <span>{days} {days === 1 ? 'giorno' : 'giorni'}</span>
                </div>
                {req.motivo && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 3, fontStyle: 'italic' }}>
                    {req.motivo}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => handleApprove(req.id)}
                  title="Approva"
                  style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'var(--green)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600 }}
                >
                  <Check className="w-3.5 h-3.5" /> Approva
                </button>

                <button
                  onClick={() => setRejectingId(req.id)}
                  title="Rifiuta"
                  style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'var(--red2)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600 }}
                >
                  <X className="w-3.5 h-3.5" /> Rifiuta
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {rejectingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setRejectingId(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 12, padding: 24, width: 380, maxWidth: '90vw' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
              MOTIVO RIFIUTO
            </p>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="Es. Conflitto con altri eventi programmati... (min. 10 caratteri)"
              rows={3}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font-mono)', resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setRejectingId(null); setRejectNote('') }}
                style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}
              >
                Annulla
              </button>
              <button
                onClick={() => handleReject(rejectingId)}
                style={{ flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', background: 'var(--red2)', border: 'none', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}
              >
                Conferma Rifiuto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
