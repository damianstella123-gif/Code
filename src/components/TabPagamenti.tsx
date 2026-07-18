import { useState, useEffect, useMemo, useCallback } from 'react'
import { ArrowUpRight, ArrowDownLeft, Plus, X, Check, Trash2, Send } from 'lucide-react'
import { useToast } from '@/lib/toast'
import { loadUser, type AuthUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { todayISO, fmtDate } from '@/lib/format'
import {
  fetchEventPayments,
  insertPayment,
  markAsPaid,
  deletePayment,
  type EventPayment,
  type RequestStatus,
} from '@/lib/event-payments-service'
import PaymentRequestForm from '@/components/PaymentRequestForm'
import type { Event } from '@/data/events'
import type { Supplier } from '@/data/suppliers'
import type { Client } from '@/data/clients'

interface Props {
  event: Event
  suppliers: Supplier[]
  clients?: Client[]
}

function fmtEuro(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const PAYMENT_REQUEST_ROLES = ['Project Manager', 'Senior PM', 'Admin', 'Super Admin', 'Amministrazione']
const DIRECT_MOVEMENT_ROLES = ['Admin', 'Super Admin', 'Amministrazione']
const MARK_PAID_ROLES = ['Admin', 'Super Admin', 'Amministrazione']

function canRequestPayment(user: AuthUser | null): boolean {
  return PAYMENT_REQUEST_ROLES.includes(user?.role || '')
}

function canDirectMovement(user: AuthUser | null): boolean {
  return DIRECT_MOVEMENT_ROLES.includes(user?.role || '')
}

function canMarkPaidRole(user: AuthUser | null): boolean {
  return MARK_PAID_ROLES.includes(user?.role || '')
}

function isAdminOrSuper(user: AuthUser | null): boolean {
  return user?.role === 'Admin' || user?.role === 'Super Admin'
}

function isPMRole(user: AuthUser | null): boolean {
  return user?.role === 'Project Manager' || user?.role === 'Senior PM'
}

export default function TabPagamenti({ event, suppliers, clients = [] }: Props) {
  const [payments, setPayments] = useState<EventPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [showLegacyForm, setShowLegacyForm] = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const { showToast } = useToast()
  const user = loadUser()

  const load = useCallback(async () => {
    const data = await fetchEventPayments(event.id)
    setPayments(data)
    setLoading(false)
  }, [event.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`event_payments_${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_payments', filter: `event_id=eq.${event.id}` }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event.id, load])

  const kpi = useMemo(() => {
    let incassato = 0, daIncassare = 0, pagato = 0, daPagare = 0
    for (const p of payments) {
      if (p.tipo === 'incasso_cliente') {
        if (p.data_pagamento) incassato += p.importo
        else daIncassare += p.importo
      } else {
        if (p.data_pagamento) pagato += p.importo
        else daPagare += p.importo
      }
    }
    const liquidita = incassato - pagato
    return { incassato, daIncassare, pagato, daPagare, liquidita }
  }, [payments])

  const fornitorePayments = useMemo(() =>
    payments.filter(p => p.tipo === 'pagamento_fornitore'), [payments])

  const clientePayments = useMemo(() =>
    payments.filter(p => p.tipo === 'incasso_cliente'), [payments])

  async function handleMarkPaid(id: string) {
    const ok = await markAsPaid(id)
    if (ok) { showToast('Pagamento registrato', 'success'); load() }
    else showToast('Errore aggiornamento', 'error')
  }

  async function handleDelete(id: string) {
    const ok = await deletePayment(id)
    if (ok) { showToast('Pagamento eliminato', 'success'); load() }
    else showToast('Errore eliminazione', 'error')
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--muted)' }}>Caricamento...</div>

  return (
    <div className="space-y-6">
      {/* KPI Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Incassato" value={kpi.incassato} color="var(--green)" />
        <KpiCard label="Da incassare" value={kpi.daIncassare} color="var(--yellow)" />
        <KpiCard label="Pagato" value={kpi.pagato} color="var(--red2)" />
        <KpiCard label="Da pagare" value={kpi.daPagare} color="var(--orange, #f59e0b)" />
      </div>

      {/* Saldo Liquidita */}
      <div className="rounded-xl p-6 text-center" style={{ background: 'var(--bg2)' }}>
        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
          Liquidita disponibile adesso
        </p>
        <p className="text-3xl font-bold" style={{ color: kpi.liquidita >= 0 ? 'var(--green)' : 'var(--red2)' }}>
          {fmtEuro(kpi.liquidita)}
        </p>
      </div>

      {/* Add Buttons */}
      <div className="flex flex-wrap justify-end gap-2">
        {canRequestPayment(user) && (
          <button
            onClick={() => setShowRequestForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Send className="w-4 h-4" /> Richiesta pagamento fornitore
          </button>
        )}
        {canDirectMovement(user) && (
          <button
            onClick={() => setShowLegacyForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'var(--bg3, var(--bg2))', color: 'var(--text)', border: '1px solid var(--line)' }}
          >
            <Plus className="w-4 h-4" /> Movimento diretto
          </button>
        )}
      </div>

      {/* Payment Request Form */}
      {showRequestForm && (
        <PaymentRequestForm
          eventId={event.id}
          suppliers={suppliers}
          onDone={() => { setShowRequestForm(false); load() }}
          onCancel={() => setShowRequestForm(false)}
        />
      )}

      {/* Legacy Form */}
      {showLegacyForm && (
        <LegacyPaymentForm
          eventId={event.id}
          suppliers={suppliers}
          clients={clients}
          onDone={() => { setShowLegacyForm(false); load() }}
          onCancel={() => setShowLegacyForm(false)}
        />
      )}

      {/* Richieste di pagamento fornitore */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Richieste di pagamento
        </h3>
        {fornitorePayments.length === 0 && (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--muted)' }}>Nessuna richiesta di pagamento</p>
        )}
        {fornitorePayments.map(p => (
          <PaymentRow
            key={p.id}
            payment={p}
            suppliers={suppliers}
            clients={clients}
            user={user}
            onMarkPaid={handleMarkPaid}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Incassi cliente */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Incassi cliente
        </h3>
        {clientePayments.length === 0 && (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--muted)' }}>Nessun incasso cliente</p>
        )}
        {clientePayments.map(p => (
          <PaymentRow
            key={p.id}
            payment={p}
            suppliers={suppliers}
            clients={clients}
            user={user}
            onMarkPaid={handleMarkPaid}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}

function PaymentRow({ payment: p, suppliers, clients, user, onMarkPaid, onDelete }: {
  payment: EventPayment
  suppliers: Supplier[]
  clients: Client[]
  user: AuthUser | null
  onMarkPaid: (id: string) => void
  onDelete: (id: string) => void
}) {
  const today = todayISO()
  const computedStato = !p.data_pagamento && p.data_scadenza < today && p.stato !== 'pagato' ? 'in_ritardo' : p.stato
  const isLegacy = p.request_status === null

  const canMarkPaid = (() => {
    if (computedStato === 'pagato') return false
    if (!isLegacy) return false
    if (!canMarkPaidRole(user)) return false
    return true
  })()

  const canDelete = (() => {
    if (isAdminOrSuper(user)) return true
    if (isPMRole(user) && !isLegacy && p.request_status === 'bozza' && p.created_by === user?.id) return true
    return false
  })()

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg2)' }}>
      <div className="flex-shrink-0">
        {p.tipo === 'incasso_cliente'
          ? <ArrowDownLeft className="w-5 h-5" style={{ color: 'var(--green)' }} />
          : <ArrowUpRight className="w-5 h-5" style={{ color: 'var(--red2)' }} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{p.descrizione}</span>
          <RequestStatusBadge requestStatus={p.request_status} stato={computedStato} />
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {fmtDate(p.data_scadenza)}
          {p.supplier_id && suppliers.find(s => s.id === p.supplier_id) && (
            <> &middot; {suppliers.find(s => s.id === p.supplier_id)!.nome}</>
          )}
          {p.client_id && clients.find(c => c.id === p.client_id) && (
            <> &middot; {clients.find(c => c.id === p.client_id)!.nome}</>
          )}
        </p>
      </div>
      <div className="text-right flex items-center gap-2">
        <span className="text-sm font-semibold" style={{ color: p.tipo === 'incasso_cliente' ? 'var(--green)' : 'var(--red2)' }}>
          {p.tipo === 'incasso_cliente' ? '+' : '-'}{fmtEuro(p.importo)}
        </span>
        {canMarkPaid && (
          <button
            onClick={() => onMarkPaid(p.id)}
            title="Segna come pagato"
            className="p-1.5 rounded-lg hover:opacity-80 transition-all"
            style={{ background: 'var(--green)', color: '#fff' }}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={() => onDelete(p.id)}
            title="Elimina"
            className="p-1.5 rounded-lg hover:opacity-80 transition-all"
            style={{ background: 'var(--bg3, var(--bg2))' }}
          >
            <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
          </button>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg2)' }}>
      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-lg font-bold" style={{ color }}>{fmtEuro(value)}</p>
    </div>
  )
}

function RequestStatusBadge({ requestStatus, stato }: { requestStatus: RequestStatus | null; stato: string }) {
  if (requestStatus === null) {
    const legacyMap: Record<string, { label: string; bg: string; color: string }> = {
      pagato: { label: 'PAGATO', bg: 'var(--green)', color: '#fff' },
      atteso: { label: 'LEGACY', bg: 'var(--bg3, var(--bg2))', color: 'var(--muted)' },
      in_ritardo: { label: 'IN RITARDO', bg: 'var(--red2)', color: '#fff' },
    }
    const s = legacyMap[stato] ?? legacyMap.atteso
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold uppercase" style={{ background: s.bg, color: s.color }}>
        {s.label}
      </span>
    )
  }

  const map: Record<string, { label: string; bg: string; color: string }> = {
    bozza: { label: 'BOZZA', bg: 'var(--bg3, var(--bg2))', color: 'var(--muted)' },
    inviata: { label: 'INVIATA ALL\'AMM.', bg: 'var(--accent)', color: '#fff' },
    in_verifica: { label: 'IN VERIFICA', bg: 'var(--yellow)', color: '#000' },
    in_attesa_fattura: { label: 'IN ATTESA FATTURA', bg: 'var(--orange, #f59e0b)', color: '#fff' },
    approvata: { label: 'APPROVATA', bg: 'var(--green)', color: '#fff' },
    respinta: { label: 'RESPINTA', bg: 'var(--red2)', color: '#fff' },
    parzialmente_coperta: { label: 'COPERTURA PARZIALE', bg: 'var(--blue, #3b82f6)', color: '#fff' },
    completata: { label: 'COMPLETATA', bg: 'var(--green)', color: '#fff' },
    annullata: { label: 'ANNULLATA', bg: 'var(--bg3, var(--bg2))', color: 'var(--muted)' },
  }
  const s = map[requestStatus] ?? map.bozza
  return (
    <span className="px-2 py-0.5 rounded text-xs font-bold uppercase" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function LegacyPaymentForm({ eventId, suppliers, clients, onDone, onCancel }: {
  eventId: string
  suppliers: Supplier[]
  clients: Client[]
  onDone: () => void
  onCancel: () => void
}) {
  const [tipo, setTipo] = useState<'incasso_cliente' | 'pagamento_fornitore'>('incasso_cliente')
  const [descrizione, setDescrizione] = useState('')
  const [importo, setImporto] = useState('')
  const [dataScadenza, setDataScadenza] = useState(todayISO())
  const [supplierId, setSupplierId] = useState('')
  const [clientId, setClientId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [supplierLabel, setSupplierLabel] = useState('')

  const [clientSearch, setClientSearch] = useState('')
  const [clientOpen, setClientOpen] = useState(false)
  const [clientLabel, setClientLabel] = useState('')

  const filteredSuppliers = supplierSearch.length > 0
    ? suppliers.filter(s =>
        s.nome.toLowerCase().includes(supplierSearch.toLowerCase()) ||
        (s.categorie || [s.categoria]).some((c: string | null) => c?.toLowerCase().includes(supplierSearch.toLowerCase()))
      ).slice(0, 8)
    : []

  const filteredClients = clientSearch.length > 0
    ? clients.filter(c => c.nome.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 8)
    : []

  useEffect(() => {
    if (!supplierOpen) return
    const close = () => setSupplierOpen(false)
    const timer = setTimeout(() => document.addEventListener('mousedown', close), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', close) }
  }, [supplierOpen])

  useEffect(() => {
    if (!clientOpen) return
    const close = () => setClientOpen(false)
    const timer = setTimeout(() => document.addEventListener('mousedown', close), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', close) }
  }, [clientOpen])

  useEffect(() => {
    if (tipo !== 'pagamento_fornitore') { setSupplierId(''); setSupplierLabel(''); setSupplierSearch('') }
    if (tipo !== 'incasso_cliente') { setClientId(''); setClientLabel(''); setClientSearch('') }
  }, [tipo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!descrizione.trim() || !importo) return
    if (tipo === 'pagamento_fornitore' && !supplierId) {
      showToast('Seleziona un fornitore', 'error')
      return
    }
    setSaving(true)
    const u = loadUser()
    const result = await insertPayment({
      event_id: eventId,
      tipo,
      descrizione: descrizione.trim(),
      importo: Number(importo),
      data_scadenza: dataScadenza,
      supplier_id: tipo === 'pagamento_fornitore' && supplierId ? supplierId : null,
      client_id: tipo === 'incasso_cliente' && clientId ? clientId : null,
      note: note.trim() || null,
      created_by: u?.id ?? null,
      stato: 'atteso',
    })
    setSaving(false)
    if (result) { showToast('Movimento registrato', 'success'); onDone() }
    else showToast('Errore salvataggio', 'error')
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg3, var(--bg2))',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'var(--text)',
    width: '100%',
    fontSize: 14,
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold">Movimento diretto</h4>
        <button type="button" onClick={onCancel} className="p-1 rounded hover:opacity-70"><X className="w-4 h-4" /></button>
      </div>

      <div>
        <label className="text-xs mb-2 block" style={{ color: 'var(--muted)' }}>Tipo movimento</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTipo('incasso_cliente')}
            className="flex items-center justify-center gap-2 p-3 rounded-lg transition-all"
            style={{
              border: tipo === 'incasso_cliente' ? '2px solid var(--green)' : '1px solid var(--line)',
              background: tipo === 'incasso_cliente' ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'transparent',
              color: tipo === 'incasso_cliente' ? 'var(--green)' : 'var(--muted)',
              fontWeight: tipo === 'incasso_cliente' ? 600 : 400,
            }}
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider">Entrata</span>
          </button>
          <button
            type="button"
            onClick={() => setTipo('pagamento_fornitore')}
            className="flex items-center justify-center gap-2 p-3 rounded-lg transition-all"
            style={{
              border: tipo === 'pagamento_fornitore' ? '2px solid var(--red2)' : '1px solid var(--line)',
              background: tipo === 'pagamento_fornitore' ? 'color-mix(in srgb, var(--red2) 10%, transparent)' : 'transparent',
              color: tipo === 'pagamento_fornitore' ? 'var(--red2)' : 'var(--muted)',
              fontWeight: tipo === 'pagamento_fornitore' ? 600 : 400,
            }}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider">Uscita</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Importo</label>
          <input type="number" min="0" step="0.01" value={importo} onChange={e => setImporto(e.target.value)} placeholder="0.00" style={inputStyle} required />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Data scadenza</label>
          <input type="date" value={dataScadenza} onChange={e => setDataScadenza(e.target.value)} style={inputStyle} required />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Descrizione</label>
          <input type="text" value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder="Es. Acconto hotel..." style={inputStyle} required />
        </div>

        {tipo === 'pagamento_fornitore' && (
          <div className="md:col-span-2">
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Fornitore *</label>
            <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
              <input
                type="text"
                value={supplierLabel}
                onChange={e => { setSupplierLabel(e.target.value); setSupplierSearch(e.target.value); setSupplierId(''); setSupplierOpen(true) }}
                onFocus={() => setSupplierOpen(true)}
                placeholder="Cerca fornitore..."
                style={inputStyle}
                autoComplete="off"
              />
              {supplierOpen && filteredSuppliers.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--panel-solid, var(--bg2))', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }} onMouseDown={e => e.stopPropagation()}>
                  {filteredSuppliers.map(s => (
                    <div key={s.id} onClick={() => { setSupplierId(s.id); setSupplierLabel(s.nome); setSupplierSearch(''); setSupplierOpen(false) }} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)', fontSize: 13 }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel2, var(--bg3))')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>{s.nome}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tipo === 'incasso_cliente' && clients.length > 0 && (
          <div className="md:col-span-2">
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Cliente</label>
            <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
              <input
                type="text"
                value={clientLabel}
                onChange={e => { setClientLabel(e.target.value); setClientSearch(e.target.value); setClientId(''); setClientOpen(true) }}
                onFocus={() => setClientOpen(true)}
                placeholder="Cerca cliente..."
                style={inputStyle}
                autoComplete="off"
              />
              {clientOpen && filteredClients.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--panel-solid, var(--bg2))', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }} onMouseDown={e => e.stopPropagation()}>
                  {filteredClients.map(c => (
                    <div key={c.id} onClick={() => { setClientId(c.id); setClientLabel(c.nome); setClientSearch(''); setClientOpen(false) }} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--line)', fontSize: 13 }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel2, var(--bg3))')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>{c.nome}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="md:col-span-2">
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Note</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Opzionale" style={inputStyle} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--muted)' }}>Annulla</button>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Salvando...' : 'Salva'}
        </button>
      </div>
    </form>
  )
}
