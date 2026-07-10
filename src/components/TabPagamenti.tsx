import { useState, useEffect, useMemo, useCallback } from 'react'
import { ArrowUpRight, ArrowDownLeft, Plus, X, Check, Trash2 } from 'lucide-react'
import { useToast } from '@/lib/toast'
import { loadUser } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { addDaysISO, todayISO, fmtDate } from '@/lib/format'
import {
  fetchEventPayments,
  insertPayment,
  markAsPaid,
  deletePayment,
  type EventPayment,
  type PaymentInsert,
} from '@/lib/event-payments-service'
import type { Event } from '@/data/events'
import type { Supplier } from '@/data/suppliers'

interface Props {
  event: Event
  suppliers: Supplier[]
}

function fmtEuro(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function TabPagamenti({ event, suppliers }: Props) {
  const [payments, setPayments] = useState<EventPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const { showToast } = useToast()

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

  // Auto-suggest on first load if empty
  useEffect(() => {
    if (!loading && payments.length === 0 && event.budget > 0) {
      autoSuggest()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  async function autoSuggest() {
    const user = await loadUser()
    const half = Math.round(event.budget * 0.5)
    const today = todayISO()
    const saldoDate = addDaysISO(event.dataFine, 30)
    const base: Omit<PaymentInsert, 'descrizione' | 'importo' | 'data_scadenza'> = {
      event_id: event.id,
      tipo: 'incasso_cliente',
      stato: 'atteso',
      created_by: user?.id ?? null,
    }
    await insertPayment({ ...base, descrizione: 'Acconto cliente 50%', importo: half, data_scadenza: today })
    await insertPayment({ ...base, descrizione: 'Saldo cliente 50%', importo: half, data_scadenza: saldoDate })
    load()
  }

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
    const previsione = (incassato + daIncassare) - (pagato + daPagare)
    return { incassato, daIncassare, pagato, daPagare, liquidita, previsione }
  }, [payments])

  const timeline = useMemo(() => {
    const today = todayISO()
    return payments.map(p => {
      let computedStato = p.stato
      if (!p.data_pagamento && p.data_scadenza < today && p.stato !== 'pagato') {
        computedStato = 'in_ritardo'
      }
      return { ...p, computedStato }
    })
  }, [payments])

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

      {/* Previsione */}
      <div className="rounded-xl p-4 text-center" style={{ background: 'var(--bg2)' }}>
        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
          A fine evento
        </p>
        <p className="text-xl font-semibold" style={{ color: kpi.previsione >= 0 ? 'var(--green)' : 'var(--red2)' }}>
          {fmtEuro(kpi.previsione)}
        </p>
      </div>

      {/* Add Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Plus className="w-4 h-4" /> Aggiungi
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <PaymentForm
          eventId={event.id}
          suppliers={suppliers}
          onDone={() => { setShowForm(false); load() }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Timeline */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Timeline pagamenti
        </h3>
        {timeline.length === 0 && (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--muted)' }}>Nessun pagamento registrato</p>
        )}
        {timeline.map(p => (
          <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg2)' }}>
            <div className="flex-shrink-0">
              {p.tipo === 'incasso_cliente'
                ? <ArrowDownLeft className="w-5 h-5" style={{ color: 'var(--green)' }} />
                : <ArrowUpRight className="w-5 h-5" style={{ color: 'var(--red2)' }} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{p.descrizione}</span>
                <StatoBadge stato={p.computedStato} />
              </div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {fmtDate(p.data_scadenza)}
                {p.supplier_id && suppliers.find(s => s.id === p.supplier_id) && (
                  <> &middot; {suppliers.find(s => s.id === p.supplier_id)!.nome}</>
                )}
              </p>
            </div>
            <div className="text-right flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: p.tipo === 'incasso_cliente' ? 'var(--green)' : 'var(--red2)' }}>
                {p.tipo === 'incasso_cliente' ? '+' : '-'}{fmtEuro(p.importo)}
              </span>
              {p.computedStato !== 'pagato' && (
                <button
                  onClick={() => handleMarkPaid(p.id)}
                  title="Segna come pagato"
                  className="p-1.5 rounded-lg hover:opacity-80 transition-all"
                  style={{ background: 'var(--green)', color: '#fff' }}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => handleDelete(p.id)}
                title="Elimina"
                className="p-1.5 rounded-lg hover:opacity-80 transition-all"
                style={{ background: 'var(--bg3, var(--bg2))' }}
              >
                <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
          </div>
        ))}
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

function StatoBadge({ stato }: { stato: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    pagato: { label: 'PAGATO', bg: 'var(--green)', color: '#fff' },
    atteso: { label: 'IN ATTESA', bg: 'var(--bg3, var(--bg2))', color: 'var(--muted)' },
    in_ritardo: { label: 'IN RITARDO', bg: 'var(--red2)', color: '#fff' },
  }
  const s = map[stato] ?? map.atteso
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

function PaymentForm({ eventId, suppliers, onDone, onCancel }: {
  eventId: string
  suppliers: Supplier[]
  onDone: () => void
  onCancel: () => void
}) {
  const [tipo, setTipo] = useState<'incasso_cliente' | 'pagamento_fornitore'>('incasso_cliente')
  const [descrizione, setDescrizione] = useState('')
  const [importo, setImporto] = useState('')
  const [dataScadenza, setDataScadenza] = useState(todayISO())
  const [supplierId, setSupplierId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [supplierLabel, setSupplierLabel] = useState('')

  const filteredSuppliers = supplierSearch.length > 0
    ? suppliers.filter(s =>
        s.nome.toLowerCase().includes(supplierSearch.toLowerCase()) ||
        (s.categorie || [s.categoria]).some((c: string | null) => c?.toLowerCase().includes(supplierSearch.toLowerCase()))
      ).slice(0, 8)
    : []

  useEffect(() => {
    if (!supplierOpen) return
    const close = () => setSupplierOpen(false)
    const timer = setTimeout(() => document.addEventListener('mousedown', close), 0)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', close) }
  }, [supplierOpen])

  useEffect(() => {
    if (tipo !== 'pagamento_fornitore') {
      setSupplierId('')
      setSupplierLabel('')
      setSupplierSearch('')
      setSupplierOpen(false)
    }
  }, [tipo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!descrizione.trim() || !importo) return
    setSaving(true)
    const user = await loadUser()
    const result = await insertPayment({
      event_id: eventId,
      tipo,
      descrizione: descrizione.trim(),
      importo: Number(importo),
      data_scadenza: dataScadenza,
      supplier_id: tipo === 'pagamento_fornitore' && supplierId ? supplierId : null,
      note: note.trim() || null,
      created_by: user?.id ?? null,
    })
    setSaving(false)
    if (result) { showToast('Pagamento aggiunto', 'success'); onDone() }
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
        <h4 className="text-sm font-semibold">Nuovo pagamento</h4>
        <button type="button" onClick={onCancel} className="p-1 rounded hover:opacity-70"><X className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value as any)} style={inputStyle}>
            <option value="incasso_cliente">Incasso cliente</option>
            <option value="pagamento_fornitore">Pagamento fornitore</option>
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Importo</label>
          <input type="number" min="0" step="0.01" value={importo} onChange={e => setImporto(e.target.value)} placeholder="0.00" style={inputStyle} required />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Descrizione</label>
          <input type="text" value={descrizione} onChange={e => setDescrizione(e.target.value)} placeholder="Es. Acconto hotel..." style={inputStyle} required />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Data scadenza</label>
          <input type="date" value={dataScadenza} onChange={e => setDataScadenza(e.target.value)} style={inputStyle} required />
        </div>
        {tipo === 'pagamento_fornitore' && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Fornitore</label>
            <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
              <input
                type="text"
                value={supplierLabel}
                onChange={e => {
                  setSupplierLabel(e.target.value)
                  setSupplierSearch(e.target.value)
                  setSupplierId('')
                  setSupplierOpen(true)
                }}
                onFocus={() => setSupplierOpen(true)}
                placeholder="Cerca fornitore..."
                style={inputStyle}
                autoComplete="off"
              />
              {supplierOpen && filteredSuppliers.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0, right: 0,
                  zIndex: 50,
                  background: 'var(--panel-solid, var(--bg2))',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  maxHeight: 220,
                  overflowY: 'auto',
                }} onMouseDown={e => e.stopPropagation()}>
                  {filteredSuppliers.map(s => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSupplierId(s.id)
                        setSupplierLabel(s.nome)
                        setSupplierSearch('')
                        setSupplierOpen(false)
                      }}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--line)',
                        fontSize: 13,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel2, var(--bg3))')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>{s.nome}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                        {(s.categorie?.[0] || s.categoria || '')}
                        {s.city ? ` \u00B7 ${s.city}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div className={tipo === 'pagamento_fornitore' ? 'md:col-span-2' : ''}>
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
