import { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  Plus,
  ArrowRight,
  X,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { fmtDateShort } from '@/lib/format'
import {
  fetchAdminPaymentRequests,
  fetchRequestLineLinks,
  fetchRequestInvoiceLinks,
  fetchLinkableInvoices,
  createSupplierInvoiceDraft,
  transitionPaymentRequest,
  linkInvoiceToRequest,
  type AdminPaymentRequest,
  type RequestLineLink,
  type RequestInvoiceLink,
  type LinkableInvoice,
} from '@/lib/payment-admin-service'

// ─── Status helpers ──────────────────────────────────────────────────────────

type FilterStatus = 'tutte' | 'inviata' | 'in_verifica' | 'in_attesa_fattura' | 'parzialmente_coperta' | 'approvata' | 'completata' | 'respinta' | 'annullata'

const STATUS_LABELS: Record<string, string> = {
  inviata: 'INVIATA',
  in_verifica: 'IN VERIFICA',
  in_attesa_fattura: 'IN ATTESA FATTURA',
  parzialmente_coperta: 'COPERTURA PARZIALE',
  approvata: 'APPROVATA',
  completata: 'COMPLETATA',
  respinta: 'RESPINTA',
  annullata: 'ANNULLATA',
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  inviata: { bg: 'var(--accent)', color: '#fff' },
  in_verifica: { bg: 'var(--yellow)', color: '#000' },
  in_attesa_fattura: { bg: '#f59e0b', color: '#fff' },
  parzialmente_coperta: { bg: '#3b82f6', color: '#fff' },
  approvata: { bg: 'var(--green)', color: '#fff' },
  completata: { bg: 'var(--green)', color: '#fff' },
  respinta: { bg: 'var(--red2)', color: '#fff' },
  annullata: { bg: 'var(--bg3, var(--bg2))', color: 'var(--muted)' },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] ?? { bg: 'var(--bg3)', color: 'var(--muted)' }
  return (
    <span
      style={{ background: s.bg, color: s.color, padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function formatEur(v: number): string {
  return v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function AdminPaymentRequests() {
  const currentUser = loadUser()
  const ALLOWED_ROLES = ['Admin', 'Super Admin', 'Amministrazione']
  const userRole = currentUser?.ruolo || currentUser?.role || ''

  if (!currentUser || !ALLOWED_ROLES.includes(userRole)) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Accesso non autorizzato.
      </div>
    )
  }

  return <RequestsView userId={currentUser.id} />
}

function RequestsView({ userId }: { userId: string }) {
  const [requests, setRequests] = useState<AdminPaymentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('tutte')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAdminPaymentRequests()
      setRequests(data)
      setError(null)
    } catch {
      setError('Errore nel caricamento delle richieste.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRequests() }, [loadRequests])

  const filtered = filter === 'tutte' ? requests : requests.filter(r => r.request_status === filter)

  const FILTERS: { value: FilterStatus; label: string }[] = [
    { value: 'tutte', label: 'Tutte' },
    { value: 'inviata', label: 'Inviate' },
    { value: 'in_verifica', label: 'In verifica' },
    { value: 'in_attesa_fattura', label: 'Att. fattura' },
    { value: 'parzialmente_coperta', label: 'Parziali' },
    { value: 'approvata', label: 'Approvate' },
    { value: 'completata', label: 'Completate' },
    { value: 'respinta', label: 'Respinte' },
    { value: 'annullata', label: 'Annullate' },
  ]

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: filter === f.value ? 700 : 400,
              background: filter === f.value ? 'var(--accent)' : 'var(--panel-solid)',
              color: filter === f.value ? '#fff' : 'var(--text)',
              border: '1px solid var(--line)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2" style={{ padding: 12, borderRadius: 8, background: 'var(--red2)', color: '#fff', fontSize: 13 }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Caricamento...
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Nessuna richiesta trovata per il filtro selezionato.
        </div>
      )}

      {/* List */}
      {!loading && filtered.map(req => (
        <RequestCard
          key={req.id}
          request={req}
          expanded={expandedId === req.id}
          onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
          onReload={loadRequests}
          userId={userId}
        />
      ))}
    </div>
  )
}

// ─── Single request card ─────────────────────────────────────────────────────

interface RequestCardProps {
  request: AdminPaymentRequest
  expanded: boolean
  onToggle: () => void
  onReload: () => void
  userId: string
}

function RequestCard({ request, expanded, onToggle, onReload, userId }: RequestCardProps) {
  const pmName = request.pm_profile
    ? `${request.pm_profile.first_name} ${request.pm_profile.last_name}`.trim()
    : '—'

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--panel-solid)', overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{ width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
        }
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {request.event?.nome ?? '—'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {request.supplier?.nome ?? '—'}
            </span>
            <StatusBadge status={request.request_status} />
          </div>
          <div className="flex flex-wrap gap-3" style={{ fontSize: 12, color: 'var(--muted)' }}>
            <span>PM: {pmName}</span>
            <span>{formatEur(request.importo)}</span>
            <span>Scad: {request.data_scadenza ? fmtDateShort(request.data_scadenza) : '—'}</span>
            {request.submitted_at && <span>Inviata: {fmtDateShort(request.submitted_at)}</span>}
          </div>
          {request.descrizione && (
            <p style={{ marginTop: 4, fontSize: 12, color: 'var(--text)', opacity: 0.8 }} className="truncate">
              {request.descrizione}
            </p>
          )}
        </div>
      </button>

      {/* Detail panel */}
      {expanded && (
        <RequestDetail request={request} onReload={onReload} userId={userId} />
      )}
    </div>
  )
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function RequestDetail({ request, onReload, userId }: { request: AdminPaymentRequest; onReload: () => void; userId: string }) {
  const [lineLinks, setLineLinks] = useState<RequestLineLink[]>([])
  const [invoiceLinks, setInvoiceLinks] = useState<RequestInvoiceLink[]>([])
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState('')
  const [showLinkInvoice, setShowLinkInvoice] = useState(false)
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)

  const loadDetail = useCallback(async () => {
    const [lines, invoices] = await Promise.all([
      fetchRequestLineLinks(request.id),
      fetchRequestInvoiceLinks(request.id),
    ])
    setLineLinks(lines)
    setInvoiceLinks(invoices)
  }, [request.id])

  useEffect(() => { loadDetail() }, [loadDetail])

  const totalCovered = invoiceLinks.reduce((s, l) => s + l.allocated_amount, 0)
  const residuo = request.importo - totalCovered

  async function handleTransition(targetStatus: string, requireNote: boolean) {
    if (requireNote && noteInput.trim().length < 5) {
      setActionError('La nota deve contenere almeno 5 caratteri.')
      return
    }
    setBusy(true)
    setActionError(null)
    const { error } = await transitionPaymentRequest({
      paymentRequestId: request.id,
      targetStatus,
      adminNote: noteInput.trim() || undefined,
    })
    if (error) {
      setActionError(error)
    } else {
      setNoteInput('')
      await onReload()
      await loadDetail()
    }
    setBusy(false)
  }

  const status = request.request_status

  return (
    <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--line)' }}>
      {/* Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ marginTop: 12, marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Nota PM</p>
          <p style={{ fontSize: 13, color: 'var(--text)' }}>{request.request_note || '—'}</p>
        </div>
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Nota amministrativa</p>
          <p style={{ fontSize: 13, color: 'var(--text)' }}>{request.admin_note || '—'}</p>
        </div>
      </div>

      {/* Line links */}
      {lineLinks.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Voci economiche collegate</p>
          <div className="space-y-1">
            {lineLinks.map(l => (
              <div key={l.id} className="flex flex-wrap gap-3" style={{ fontSize: 12, color: 'var(--text)', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{l.source_table}</span>
                <span style={{ color: 'var(--muted)' }}>ID: {l.source_line_id.slice(0, 8)}</span>
                <span style={{ fontWeight: 600 }}>{formatEur(l.allocated_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice links */}
      {invoiceLinks.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Fatture collegate</p>
          <div className="space-y-1">
            {invoiceLinks.map(l => (
              <div key={l.id} className="flex flex-wrap gap-3 items-center" style={{ fontSize: 12, color: 'var(--text)', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                <FileText className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                <span>{l.invoice?.numero ?? '—'}</span>
                <span style={{ color: 'var(--muted)' }}>{l.invoice?.soggetto}</span>
                <span style={{ fontWeight: 600 }}>{formatEur(l.allocated_amount)}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>{l.invoice?.stato}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: 'var(--bg2, var(--bg3))' }}>
        <div>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>Totale richiesta</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{formatEur(request.importo)}</p>
        </div>
        <div>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>Coperto</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{formatEur(totalCovered)}</p>
        </div>
        <div>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>Residuo</p>
          <p style={{ fontSize: 14, fontWeight: 700, color: residuo > 0 ? 'var(--yellow)' : 'var(--green)' }}>{formatEur(residuo)}</p>
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="flex items-center gap-2" style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--red2)', fontSize: 13 }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {actionError}
        </div>
      )}

      {/* Actions by status */}
      <div className="space-y-3">
        {status === 'inviata' && (
          <ActionButton label="Prendi in carico" icon={<ArrowRight className="w-4 h-4" />} busy={busy} onClick={() => handleTransition('in_verifica', false)} />
        )}

        {(status === 'in_verifica' || status === 'in_attesa_fattura') && (
          <>
            {/* Note input for actions requiring it */}
            <div>
              <textarea
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder="Nota amministrativa (min 5 caratteri per respingere o richiedere fattura)"
                rows={2}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel-solid)', color: 'var(--text)', fontSize: 13, resize: 'vertical' }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {status === 'in_verifica' && (
                <ActionButton label="Richiedi fattura" icon={<Clock className="w-4 h-4" />} busy={busy} onClick={() => handleTransition('in_attesa_fattura', true)} />
              )}
              {status === 'in_attesa_fattura' && (
                <ActionButton label="Riprendi verifica" icon={<ArrowRight className="w-4 h-4" />} busy={busy} onClick={() => handleTransition('in_verifica', false)} />
              )}
              <ActionButton label="Respingi" variant="danger" icon={<X className="w-4 h-4" />} busy={busy} onClick={() => {
                if (!confirm('Confermi di voler respingere questa richiesta?')) return
                handleTransition('respinta', true)
              }} />
              <ActionButton label="Collega fattura" icon={<Link2 className="w-4 h-4" />} busy={busy} onClick={() => setShowLinkInvoice(true)} />
              <ActionButton label="Crea fattura bozza" icon={<Plus className="w-4 h-4" />} busy={busy} onClick={() => setShowCreateInvoice(true)} />
            </div>
          </>
        )}

        {status === 'parzialmente_coperta' && (
          <div className="flex flex-wrap gap-2">
            <ActionButton label="Collega altra fattura" icon={<Link2 className="w-4 h-4" />} busy={busy} onClick={() => setShowLinkInvoice(true)} />
          </div>
        )}
      </div>

      {/* Link invoice panel */}
      {showLinkInvoice && (
        <LinkInvoicePanel
          request={request}
          totalCovered={totalCovered}
          onClose={() => setShowLinkInvoice(false)}
          onDone={async () => { setShowLinkInvoice(false); await loadDetail(); await onReload() }}
        />
      )}

      {/* Create invoice panel */}
      {showCreateInvoice && (
        <CreateInvoicePanel
          request={request}
          userId={userId}
          onClose={() => setShowCreateInvoice(false)}
          onDone={async () => { setShowCreateInvoice(false); await loadDetail() }}
        />
      )}
    </div>
  )
}

// ─── Action button ───────────────────────────────────────────────────────────

function ActionButton({ label, icon, busy, onClick, variant }: { label: string; icon?: React.ReactNode; busy: boolean; onClick: () => void; variant?: 'danger' }) {
  const bg = variant === 'danger' ? 'var(--red2)' : 'var(--accent)'
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className="flex items-center gap-2 transition-opacity"
      style={{ padding: '8px 14px', borderRadius: 8, background: bg, color: '#fff', fontSize: 13, fontWeight: 600, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer', border: 'none' }}
    >
      {icon} {label}
    </button>
  )
}

// ─── Link invoice panel ──────────────────────────────────────────────────────

function LinkInvoicePanel({ request, totalCovered, onClose, onDone }: { request: AdminPaymentRequest; totalCovered: number; onClose: () => void; onDone: () => Promise<void> }) {
  const [invoices, setInvoices] = useState<LinkableInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchLinkableInvoices(request).then(data => {
      setInvoices(data)
      setLoading(false)
    })
  }, [request])

  const allocationNum = parseFloat(amount) || 0
  const newCovered = totalCovered + allocationNum
  const newResiduo = request.importo - newCovered

  async function handleLink() {
    if (!selectedId || allocationNum <= 0) {
      setError("Seleziona una fattura e inserisci un importo valido.")
      return
    }
    setBusy(true)
    setError(null)
    const result = await linkInvoiceToRequest({
      paymentRequestId: request.id,
      invoiceId: selectedId,
      allocatedAmount: allocationNum,
    })
    if (result.error) {
      setError(result.error)
      setBusy(false)
    } else {
      await onDone()
    }
  }

  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg2, var(--panel-solid))' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Collega fattura</p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      {loading && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Caricamento fatture...</p>}

      {!loading && invoices.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Nessuna fattura collegabile trovata.</p>
      )}

      {!loading && invoices.length > 0 && (
        <>
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
            {invoices.map(inv => (
              <label
                key={inv.id}
                className="flex items-center gap-3 cursor-pointer"
                style={{ padding: '8px 6px', borderBottom: '1px solid var(--line)', fontSize: 13, color: selectedId === inv.id ? 'var(--accent)' : 'var(--text)' }}
              >
                <input
                  type="radio"
                  name="linkable-inv"
                  checked={selectedId === inv.id}
                  onChange={() => setSelectedId(inv.id)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span style={{ fontWeight: 600 }}>{inv.numero}</span>
                <span style={{ color: 'var(--muted)' }}>{inv.data_emissione ? fmtDateShort(inv.data_emissione) : ''}</span>
                <span>{formatEur(inv.importo)}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{inv.stato}</span>
              </label>
            ))}
          </div>

          {/* Amount input */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Importo da allocare</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel-solid)', color: 'var(--text)', fontSize: 13 }}
            />
          </div>

          {/* Preview */}
          {allocationNum > 0 && (
            <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
              <div><span style={{ fontSize: 12, color: 'var(--muted)' }}>Totale richiesta:</span><br /><span style={{ fontSize: 13, fontWeight: 600 }}>{formatEur(request.importo)}</span></div>
              <div><span style={{ fontSize: 12, color: 'var(--muted)' }}>Gia coperto:</span><br /><span style={{ fontSize: 13, fontWeight: 600 }}>{formatEur(totalCovered)}</span></div>
              <div><span style={{ fontSize: 12, color: 'var(--muted)' }}>Nuova allocazione:</span><br /><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{formatEur(allocationNum)}</span></div>
              <div><span style={{ fontSize: 12, color: 'var(--muted)' }}>Residuo previsto:</span><br /><span style={{ fontSize: 13, fontWeight: 600, color: newResiduo > 0 ? 'var(--yellow)' : 'var(--green)' }}>{formatEur(newResiduo)}</span></div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2" style={{ marginBottom: 8, fontSize: 13, color: 'var(--red2)' }}>
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>
          )}

          <button
            disabled={busy || !selectedId || allocationNum <= 0}
            onClick={handleLink}
            style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer', border: 'none' }}
          >
            {busy ? 'Collegamento...' : 'Conferma collegamento'}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Create invoice panel ────────────────────────────────────────────────────

function CreateInvoicePanel({ request, userId, onClose, onDone }: { request: AdminPaymentRequest; userId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [numero, setNumero] = useState('')
  const [dataEmissione, setDataEmissione] = useState(new Date().toISOString().slice(0, 10))
  const [scadenza, setScadenza] = useState('')
  const [imponibile, setImponibile] = useState('')
  const [iva, setIva] = useState('')
  const [totale, setTotale] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!numero.trim()) { setError('Il numero documento e obbligatorio.'); return }
    if (!dataEmissione) { setError('La data di emissione e obbligatoria.'); return }
    if (!scadenza) { setError('La scadenza e obbligatoria.'); return }
    const imp = parseFloat(imponibile) || 0
    const ivaNum = parseFloat(iva) || 0
    const tot = parseFloat(totale) || 0
    if (tot <= 0) { setError('Il totale deve essere maggiore di zero.'); return }

    setBusy(true)
    setError(null)
    const result = await createSupplierInvoiceDraft({
      numero: numero.trim(),
      dataEmissione,
      scadenza,
      imponibile: imp,
      iva: ivaNum,
      totale: tot,
      note,
      supplierName: request.supplier?.nome ?? '',
      supplierId: request.supplier_id ?? '',
      eventId: request.event_id,
      userId,
    })
    if (result.error) {
      setError(result.error)
      setBusy(false)
    } else {
      await onDone()
    }
  }

  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg2, var(--panel-solid))' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Nuova fattura in bozza</p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2" style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)' }}>
        <span>Fornitore: <strong style={{ color: 'var(--text)' }}>{request.supplier?.nome ?? '—'}</strong></span>
        <span>Evento: <strong style={{ color: 'var(--text)' }}>{request.event?.nome ?? '—'}</strong></span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ marginBottom: 12 }}>
        <FieldInput label="Numero documento *" value={numero} onChange={setNumero} />
        <FieldInput label="Data emissione *" value={dataEmissione} onChange={setDataEmissione} type="date" />
        <FieldInput label="Scadenza *" value={scadenza} onChange={setScadenza} type="date" />
        <FieldInput label="Imponibile" value={imponibile} onChange={setImponibile} type="number" />
        <FieldInput label="IVA" value={iva} onChange={setIva} type="number" />
        <FieldInput label="Totale *" value={totale} onChange={setTotale} type="number" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Note</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel-solid)', color: 'var(--text)', fontSize: 13, resize: 'vertical' }}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2" style={{ marginBottom: 8, fontSize: 13, color: 'var(--red2)' }}>
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      <button
        disabled={busy}
        onClick={handleCreate}
        style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer', border: 'none' }}
      >
        {busy ? 'Creazione...' : 'Crea fattura bozza'}
      </button>
    </div>
  )
}

// ─── Field input helper ──────────────────────────────────────────────────────

function FieldInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        step={type === 'number' ? '0.01' : undefined}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel-solid)', color: 'var(--text)', fontSize: 13 }}
      />
    </div>
  )
}
