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
import type { Client } from '@/data/clients'

interface Props {
  event: Event
  suppliers: Supplier[]
  clients?: Client[]
}

function fmtEuro(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function TabPagamenti({ event, suppliers, clients = [] }: Props) {
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
          eventName={event.nome}
          suppliers={suppliers}
          clients={clients}
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

function PaymentForm({ eventId, eventName, suppliers, clients, onDone, onCancel }: {
  eventId: string
  eventName: string
  suppliers: Supplier[]
  clients: Client[]
  onDone: () => void
  onCancel: () => void
}) {
  const [tipo, setTipo] = useState<'incasso_cliente' | 'pagamento_fornitore'>('pagamento_fornitore')
  const [descrizione, setDescrizione] = useState('')
  const [importo, setImporto] = useState('')
  const [dataScadenza, setDataScadenza] = useState(todayISO())
  const [supplierId, setSupplierId] = useState('')
  const [clientId, setClientId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [soglia, setSoglia] = useState(2000)
  const { showToast } = useToast()

  const [supplierSearch, setSupplierSearch] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [supplierLabel, setSupplierLabel] = useState('')

  const [clientSearch, setClientSearch] = useState('')
  const [clientOpen, setClientOpen] = useState(false)
  const [clientLabel, setClientLabel] = useState('')

  useEffect(() => {
    supabase.from('cashflow_config').select('soglia_autonomia_pm_eur').limit(1).maybeSingle()
      .then(({ data }) => { if (data?.soglia_autonomia_pm_eur) setSoglia(Number(data.soglia_autonomia_pm_eur)) })
  }, [])

  const needsApproval = tipo === 'pagamento_fornitore' && Number(importo) > soglia

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
    if (tipo !== 'pagamento_fornitore') {
      setSupplierId('')
      setSupplierLabel('')
      setSupplierSearch('')
      setSupplierOpen(false)
    }
    if (tipo !== 'incasso_cliente') {
      setClientId('')
      setClientLabel('')
      setClientSearch('')
      setClientOpen(false)
    }
  }, [tipo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!descrizione.trim() || !importo) return

    if (tipo === 'pagamento_fornitore' && !supplierId) {
      showToast('Seleziona un fornitore per l\'uscita', 'error')
      return
    }

    setSaving(true)
    const user = await loadUser()
    const statoApprovazione = needsApproval ? 'in_attesa' : 'autonomo'

    const soggetto = tipo === 'pagamento_fornitore'
      ? suppliers.find(s => s.id === supplierId)?.nome || ''
      : clients.find(c => c.id === clientId)?.nome || ''

    console.log('%c PAGAMENTO', 'background: #222; color: #0f0; font-size: 14px; padding: 4px 8px;', {
      tipo,
      direzione: tipo === 'pagamento_fornitore' ? 'USCITA (soldi escono)' : 'ENTRATA (soldi entrano)',
      fornitore: tipo === 'pagamento_fornitore' ? soggetto : null,
      cliente: tipo === 'incasso_cliente' ? soggetto : null,
      importo: Number(importo),
      evento: eventName,
    })

    const result = await insertPayment({
      event_id: eventId,
      tipo,
      descrizione: descrizione.trim(),
      importo: Number(importo),
      data_scadenza: dataScadenza,
      supplier_id: tipo === 'pagamento_fornitore' && supplierId ? supplierId : null,
      note: note.trim() || null,
      created_by: user?.id ?? null,
      stato_approvazione: statoApprovazione as any,
    })
    if (result && needsApproval) {
      const { data: admins } = await supabase.from('profiles').select('id').in('role', ['Admin', 'Super Admin', 'Amministrazione'])
      const fornitoreNome = suppliers.find(s => s.id === supplierId)?.nome || 'Fornitore'
      for (const a of admins ?? []) {
        await supabase.from('notifications').insert({
          user_id: a.id,
          title: 'Approvazione pagamento richiesta',
          message: `Richiesta di \u20AC${Number(importo).toLocaleString('it-IT')} a ${fornitoreNome} per evento "${eventName}" attende la tua approvazione.`,
          type: 'payment_approval',
          related_entity_type: 'event_payment',
          related_entity_id: result.id,
          is_read: false,
        })
      }
    }
    setSaving(false)
    if (result) {
      showToast(needsApproval ? 'Pagamento inviato in approvazione' : 'Pagamento registrato', 'success')
      onDone()
    } else {
      showToast('Errore salvataggio', 'error')
    }
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

      {/* Tipo radio buttons */}
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.03em' }}>ENTRATA</span>
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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.03em' }}>USCITA</span>
          </button>
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>
          {tipo === 'incasso_cliente' ? 'Incasso da cliente (soldi entrano)' : 'Pagamento a fornitore (soldi escono)'}
        </p>
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

        {/* Supplier selector for USCITA */}
        {tipo === 'pagamento_fornitore' && (
          <div className="md:col-span-2">
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Fornitore *</label>
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

        {/* Client selector for ENTRATA */}
        {tipo === 'incasso_cliente' && clients.length > 0 && (
          <div className="md:col-span-2">
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Cliente</label>
            <div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
              <input
                type="text"
                value={clientLabel}
                onChange={e => {
                  setClientLabel(e.target.value)
                  setClientSearch(e.target.value)
                  setClientId('')
                  setClientOpen(true)
                }}
                onFocus={() => setClientOpen(true)}
                placeholder="Cerca cliente..."
                style={inputStyle}
                autoComplete="off"
              />
              {clientOpen && filteredClients.length > 0 && (
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
                  {filteredClients.map(c => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setClientId(c.id)
                        setClientLabel(c.nome)
                        setClientSearch('')
                        setClientOpen(false)
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
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>{c.nome}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                        {c.settore || ''}{c.citta ? ` \u00B7 ${c.citta}` : ''}
                      </div>
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

      {needsApproval && (
        <div style={{
          background: 'color-mix(in srgb, var(--yellow) 12%, transparent)',
          border: '1px solid var(--yellow)',
          borderRadius: 10,
          padding: '10px 14px',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--yellow)',
        }}>
          Questo pagamento ({fmtEuro(Number(importo))}) supera la soglia di autonomia ({fmtEuro(soglia)}). Sara inviato in approvazione all'Amministrazione.
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--muted)' }}>Annulla</button>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
          {saving ? (needsApproval ? 'Invio approvazione...' : 'Salvando...') : (needsApproval ? 'Invia per approvazione' : 'Salva')}
        </button>
      </div>
    </form>
  )
}
