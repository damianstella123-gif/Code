import { useState } from 'react'
import { Search, X, Plus, Truck, AlertTriangle, MapPin, User, Edit3, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useEventServices } from '@/lib/use-event-services'
import { upsertSupplier } from '@/lib/suppliers-service'
import { detectSupplierCategory, isDmcFromArray, SupplierCategoryPanel, type CategoryType } from '@/components/TabOperativo'
import { SupplierFormModal } from '@/pages/Fornitori'
import type { Event } from '@/data/events'
import type { Supplier } from '@/data/suppliers'
import { LINK_CATEGORIES, STATO_CONFERMA_CONFIG } from '../supplier-details-types'

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function DistanceLogistics({ linkedSuppliers, eventLocation }: { linkedSuppliers: Supplier[]; eventLocation: string }) {
  const geoSuppliers = linkedSuppliers.filter(s => s.latitude && s.longitude)
  if (geoSuppliers.length < 2) return null

  const pairs: { from: Supplier; to: Supplier; km: number }[] = []
  for (let i = 0; i < geoSuppliers.length; i++) {
    for (let j = i + 1; j < geoSuppliers.length; j++) {
      const a = geoSuppliers[i]
      const b = geoSuppliers[j]
      const km = haversineKm(a.latitude!, a.longitude!, b.latitude!, b.longitude!)
      pairs.push({ from: a, to: b, km })
    }
  }
  pairs.sort((a, b) => a.km - b.km)

  return (
    <div className="panel p-5 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--blue) 10%, transparent)' }}>
          <MapPin className="w-4 h-4" style={{ color: 'var(--blue)' }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Distanze e logistica</p>
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Distanze approssimative tra i fornitori con coordinate ({geoSuppliers.length} su {linkedSuppliers.length})
            {eventLocation && <> · Evento: {eventLocation}</>}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--line)' }}>
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ background: 'var(--panel2)' }}>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Da</th>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>A</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Distanza</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Tempo stimato</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => {
              const driveMin = Math.round((p.km / 60) * 60)
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>
                    <span>{p.from.nome}</span>
                    <span className="ml-1 text-[10px]" style={{ color: 'var(--muted)' }}>({p.from.city || p.from.location})</span>
                  </td>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>
                    <span>{p.to.nome}</span>
                    <span className="ml-1 text-[10px]" style={{ color: 'var(--muted)' }}>({p.to.city || p.to.location})</span>
                  </td>
                  <td className="text-right px-3 py-2 font-semibold" style={{ color: p.km < 10 ? 'var(--green)' : p.km < 50 ? 'var(--blue)' : 'var(--red2)' }}>
                    {p.km < 1 ? `${Math.round(p.km * 1000)} m` : `${p.km.toFixed(1)} km`}
                  </td>
                  <td className="text-right px-3 py-2" style={{ color: 'var(--muted)' }}>
                    {driveMin < 60 ? `~${driveMin} min` : `~${Math.floor(driveMin / 60)}h ${driveMin % 60}min`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {geoSuppliers.length < linkedSuppliers.length && (
        <p className="text-[10px] mt-2" style={{ color: 'var(--muted)' }}>
          {linkedSuppliers.length - geoSuppliers.length} fornitori senza coordinate non sono inclusi nel calcolo.
          Aggiungi latitudine/longitudine nella scheda fornitore per includerli.
        </p>
      )}
    </div>
  )
}

export function TabFornitori({ event, suppliers, onSuppliersChanged }: { event: Event; suppliers: Supplier[]; onSuppliersChanged: () => void }) {
  const { links, summaries, loading, reload, updateLinkStatus } = useEventServices(event.id)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null)
  const [hoveredSup, setHoveredSup] = useState<string | null>(null)
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null)
  const [toast, setToast] = useState<{ supplierId: string; nome: string } | null>(null)
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [pendingLink, setPendingLink] = useState<string | null>(null)
  const [linkCategory, setLinkCategory] = useState<CategoryType | ''>('')
  const [editingContact, setEditingContact] = useState<string | null>(null)
  const [contactForm, setContactForm] = useState({ contatto_operativo: '', telefono_operativo: '', email_operativo: '' })
  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [createdToast, setCreatedToast] = useState<string | null>(null)

  const linkedIds = links.map(l => l.supplier_id)

  function beginLink(supplierId: string) {
    setPendingLink(supplierId)
    setLinkCategory('')
  }

  async function confirmLink() {
    if (!pendingLink || !linkCategory) return
    const { error } = await supabase
      .from('event_suppliers')
      .insert({ event_id: event.id, supplier_id: pendingLink, service_category: linkCategory })
    if (!error) {
      setAdding(false)
      setSearch('')
      setPendingLink(null)
      setLinkCategory('')
      await reload()
    }
  }

  async function handleUnlink(supplierId: string) {
    const sup = suppliers.find(s => s.id === supplierId)
    setConfirmUnlink(null)

    const tables = [
      'event_supplier_services', 'event_hotel_details', 'event_restaurant_details',
      'event_experience_details', 'event_catering_details', 'event_audio_video_details',
      'event_allestimenti_details', 'event_staff_interno_details', 'event_staff_esterno_details',
      'event_grafica_stampa_details', 'event_varie_details',
    ]
    await Promise.all(tables.map(t => supabase.from(t).delete().eq('event_id', event.id).eq('supplier_id', supplierId)))
    const { error } = await supabase.from('event_suppliers').delete().eq('event_id', event.id).eq('supplier_id', supplierId)
    if (!error) {
      if (toastTimer) clearTimeout(toastTimer)
      setToast({ supplierId, nome: sup?.nome ?? '' })
      const timer = setTimeout(() => setToast(null), 5000)
      setToastTimer(timer)
      await reload()
    }
  }

  async function handleUndoUnlink(supplierId: string) {
    if (toastTimer) clearTimeout(toastTimer)
    setToast(null)
    await supabase.from('event_suppliers').insert({ event_id: event.id, supplier_id: supplierId })
    await reload()
  }

  async function saveContact(linkId: string) {
    await supabase.from('event_suppliers').update(contactForm).eq('id', linkId)
    setEditingContact(null)
    await reload()
  }

  async function handleNewSupplierSave(s: Supplier) {
    const result = await upsertSupplier(s)
    if (!result) return
    setShowNewSupplier(false)
    onSuppliersChanged()
    setPendingLink(result.id)
    setLinkCategory('')
    setAdding(false)
    setSearch('')
    setCreatedToast(s.nome)
    setTimeout(() => setCreatedToast(null), 4000)
  }

  const linkedSuppliers = suppliers.filter(s => linkedIds.includes(s.id))
  const availableSuppliers = suppliers.filter(s =>
    !linkedIds.includes(s.id) &&
    (search === '' || s.nome.toLowerCase().includes(search.toLowerCase()) || s.categoria.toLowerCase().includes(search.toLowerCase()))
  )

  const totalVenduto = summaries.reduce((s, x) => s + x.totals.venduto, 0)
  const totalCosto = summaries.reduce((s, x) => s + x.totals.costo, 0)
  const totalMargine = totalVenduto - totalCosto
  const confermati = summaries.filter(s => s.link.stato_conferma !== 'richiesto').length
  const withWarnings = summaries.filter(s => !s.hasServices || s.hasMissingCosts).length

  const fmtE = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</div></div>
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      {linkedSuppliers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="panel p-3 text-center">
            <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{linkedSuppliers.length}</p>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Fornitori</p>
          </div>
          <div className="panel p-3 text-center">
            <p className="text-lg font-bold" style={{ color: 'var(--green)' }}>{confermati}/{linkedSuppliers.length}</p>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Confermati</p>
          </div>
          <div className="panel p-3 text-center">
            <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{'\u20AC'}{fmtE(totalCosto)}</p>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Costi totali</p>
          </div>
          <div className="panel p-3 text-center">
            <p className="text-lg font-bold" style={{ color: totalMargine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{fmtE(totalMargine)}</p>
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Margine</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--muted)' }}>
            Fornitori collegati ({linkedSuppliers.length})
          </p>
          {withWarnings > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--yellow) 15%, transparent)', color: 'var(--yellow)' }}>
              <AlertTriangle className="w-3 h-3" /> {withWarnings} da completare
            </span>
          )}
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'color-mix(in srgb, var(--red2) 12%, transparent)', color: 'var(--red2)', border: '1px solid var(--red2)' }}>
            <Plus className="w-3.5 h-3.5" /> Collega fornitore
          </button>
        )}
      </div>

      {/* Search panel for linking */}
      {adding && (
        <div className="panel p-4 space-y-3" style={{ border: '1px solid var(--red2)' }}>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca fornitore per nome o categoria..."
              className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              autoFocus />
            <button onClick={() => { setAdding(false); setSearch('') }}
              className="p-1.5 rounded-lg" style={{ color: 'var(--muted)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {search.trim().length > 0 ? (
              availableSuppliers.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs p-2" style={{ color: 'var(--muted)' }}>
                    Nessun fornitore trovato per "{search}"
                  </p>
                  <button onClick={() => setShowNewSupplier(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all mt-1"
                    style={{ background: 'color-mix(in srgb, var(--red2) 12%, transparent)', color: 'var(--red2)', border: '1px solid var(--red2)' }}>
                    <Plus className="w-3.5 h-3.5" /> Crea nuovo fornitore
                  </button>
                </div>
              ) : availableSuppliers.slice(0, 10).map(s => (
                <button key={s.id} onClick={() => beginLink(s.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-[var(--line)]"
                  style={{ border: '1px solid var(--line)' }}>
                  <Truck className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red2)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{s.nome}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{s.categoria} · {s.location}</p>
                  </div>
                </button>
              ))
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '13px', padding: '8px 12px' }}>
                Digita per cercare un fornitore...
              </p>
            )}
          </div>
          <div className="pt-2 border-t" style={{ borderColor: 'var(--line)' }}>
            <button onClick={() => setShowNewSupplier(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{ color: 'var(--red2)' }}>
              <Plus className="w-3.5 h-3.5" /> Crea nuovo fornitore
            </button>
          </div>
        </div>
      )}

      {/* Category selection modal */}
      {pendingLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPendingLink(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Seleziona categoria</p>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              Come verra utilizzato questo fornitore in questo evento?
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {LINK_CATEGORIES.map(cat => (
                <button key={cat.value} onClick={() => setLinkCategory(cat.value)}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-left transition-all"
                  style={{
                    background: linkCategory === cat.value ? 'color-mix(in srgb, var(--red2) 15%, transparent)' : 'var(--panel2)',
                    border: `1px solid ${linkCategory === cat.value ? 'var(--red2)' : 'var(--line)'}`,
                    color: linkCategory === cat.value ? 'var(--red2)' : 'var(--text)',
                  }}>
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setPendingLink(null)}>Annulla</button>
              <button disabled={!linkCategory} onClick={confirmLink}
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ background: 'var(--red2)', color: '#fff' }}>Conferma</button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {linkedSuppliers.length === 0 && !adding ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun fornitore collegato a questo evento</p>
          <p className="text-xs mt-1">Usa il pulsante "Collega fornitore" per aggiungerne uno</p>
        </div>
      ) : (
        <div className="space-y-3">
          {linkedSuppliers.map(sup => {
            const summary = summaries.find(s => s.supplierId === sup.id)
            const link = summary?.link || links.find(l => l.supplier_id === sup.id)
            const catType = (link?.service_category as CategoryType) || detectSupplierCategory(sup.categorie?.[0] || sup.categoria)
            const isExpanded = expandedSupplier === sup.id
            const stato = (link?.stato_conferma || 'richiesto') as keyof typeof STATO_CONFERMA_CONFIG
            const statoConf = STATO_CONFERMA_CONFIG[stato]
            const totals = summary?.totals || { venduto: 0, costo: 0, margine: 0, marginePct: 0, count: 0 }
            const hasWarning = summary && (!summary.hasServices || summary.hasMissingCosts)
            const isEditingContact = editingContact === sup.id

            return (
              <div key={sup.id} className="panel overflow-hidden"
                onClick={() => setExpandedSupplier(isExpanded ? null : sup.id)}
                onMouseEnter={() => setHoveredSup(sup.id)}
                onMouseLeave={() => setHoveredSup(null)}
                style={{
                  border: `1px solid ${hasWarning ? 'var(--yellow)' : 'var(--line)'}`,
                  cursor: 'pointer',
                  background: hoveredSup === sup.id ? 'var(--panel2)' : 'var(--panel-solid)',
                }}>
                {/* Header row */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{sup.nome}</p>
                        <select
                          value={stato}
                          onClick={e => e.stopPropagation()}
                          onChange={async (e) => {
                            if (link) await updateLinkStatus(link.id, e.target.value as 'richiesto' | 'confermato' | 'contrattualizzato')
                          }}
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium cursor-pointer appearance-none"
                          style={{ background: statoConf.bg, color: statoConf.color, border: `1px solid ${statoConf.border}` }}>
                          <option value="richiesto">Richiesto</option>
                          <option value="confermato">Confermato</option>
                          <option value="contrattualizzato">Contrattualizzato</option>
                        </select>
                        {hasWarning && !summary?.hasServices && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--yellow) 15%, transparent)', color: 'var(--yellow)' }}>
                            Nessun servizio
                          </span>
                        )}
                        {hasWarning && summary?.hasServices && summary?.hasMissingCosts && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--yellow) 15%, transparent)', color: 'var(--yellow)' }}>
                            Costi mancanti
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                        <span>{LINK_CATEGORIES.find(c => c.value === catType)?.label || sup.categoria}</span>
                        {sup.location && <span>· {sup.location}</span>}
                        {totals.count > 0 && (
                          <>
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ background: 'color-mix(in srgb, var(--red2) 10%, transparent)', color: 'var(--red2)' }}>
                              {totals.count} {totals.count === 1 ? 'servizio' : 'servizi'}
                            </span>
                            <span style={{ color: totals.margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>
                              {'\u20AC'}{fmtE(totals.costo)} costo · {'\u20AC'}{fmtE(totals.margine)} margine
                            </span>
                          </>
                        )}
                      </div>

                      {/* Contact info row */}
                      {link?.contatto_operativo && !isEditingContact && (
                        <div className="flex items-center gap-2 mt-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                          <User className="w-3 h-3" />
                          <span>{link.contatto_operativo}</span>
                          {link.telefono_operativo && <span>· {link.telefono_operativo}</span>}
                          {link.email_operativo && <span>· {link.email_operativo}</span>}
                          <button onClick={() => { setEditingContact(sup.id); setContactForm({ contatto_operativo: link.contatto_operativo || '', telefono_operativo: link.telefono_operativo || '', email_operativo: link.email_operativo || '' }) }}
                            className="p-0.5 rounded hover:bg-[var(--line)]">
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setConfirmUnlink(sup.id)}
                        className="p-1.5 rounded-lg transition-all hover:bg-[var(--line)]" title="Rimuovi fornitore dall'evento">
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                      </button>
                    </div>
                  </div>

                  {/* Inline contact edit */}
                  {isEditingContact && link && (
                    <div className="mt-3 pt-3 flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()} style={{ borderTop: '1px solid var(--line)' }}>
                      <input type="text" value={contactForm.contatto_operativo} onChange={e => setContactForm(p => ({ ...p, contatto_operativo: e.target.value }))}
                        placeholder="Nome contatto" className="px-2 py-1.5 rounded-lg text-xs flex-1 min-w-[120px]"
                        style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                      <input type="text" value={contactForm.telefono_operativo} onChange={e => setContactForm(p => ({ ...p, telefono_operativo: e.target.value }))}
                        placeholder="Telefono" className="px-2 py-1.5 rounded-lg text-xs w-[120px]"
                        style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                      <input type="text" value={contactForm.email_operativo} onChange={e => setContactForm(p => ({ ...p, email_operativo: e.target.value }))}
                        placeholder="Email" className="px-2 py-1.5 rounded-lg text-xs flex-1 min-w-[140px]"
                        style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
                      <button onClick={() => saveContact(link.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--red2)' }}>Salva</button>
                      <button onClick={() => setEditingContact(null)} className="px-2 py-1.5 rounded-lg text-xs" style={{ color: 'var(--muted)' }}>Annulla</button>
                    </div>
                  )}

                  {/* Add contact button when empty */}
                  {!link?.contatto_operativo && !isEditingContact && (
                    <button onClick={() => { setEditingContact(sup.id); setContactForm({ contatto_operativo: '', telefono_operativo: '', email_operativo: '' }) }}
                      className="mt-1.5 ml-7 text-[11px] flex items-center gap-1 hover:opacity-80"
                      style={{ color: 'var(--muted)' }}>
                      <User className="w-3 h-3" /> Aggiungi contatto operativo
                    </button>
                  )}
                </div>

                {/* Expanded services panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2" onClick={e => e.stopPropagation()} style={{ borderTop: '1px solid var(--line)', background: 'var(--bg)' }}>
                    <SupplierCategoryPanel event={event} supplierId={sup.id} category={catType} isDmc={isDmcFromArray(sup.categorie ?? [], sup.categoria)} otherSupplierCategories={linkedSuppliers.filter(s => s.id !== sup.id).flatMap(s => s.categorie?.length ? s.categorie : [s.categoria])} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Distance & Logistics Section */}
      <DistanceLogistics linkedSuppliers={linkedSuppliers} eventLocation={event.location} />

      {/* Confirm unlink modal */}
      {confirmUnlink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmUnlink(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Rimuovere fornitore dall'evento?</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Stai per rimuovere questo fornitore dall'evento.<br />
              Il fornitore NON verra eliminato dall'anagrafica fornitori.<br />
              Verra rimosso solamente da questo evento.
            </p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setConfirmUnlink(null)}>Annulla</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={() => handleUnlink(confirmUnlink)}>Elimina fornitore</button>
            </div>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-sm" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>Fornitore rimosso dall'evento</p>
          <button onClick={() => handleUndoUnlink(toast.supplierId)} className="text-sm font-medium px-2 py-1 rounded-lg hover:opacity-80" style={{ color: 'var(--blue)' }}>Annulla</button>
        </div>
      )}

      {/* Created toast */}
      {createdToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-sm" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
          <p className="text-sm" style={{ color: 'var(--text)' }}>Fornitore "{createdToast}" creato e pronto per il collegamento</p>
        </div>
      )}

      {/* New supplier modal */}
      {showNewSupplier && (
        <SupplierFormModal
          initialName={search}
          onSave={handleNewSupplierSave}
          onCancel={() => setShowNewSupplier(false)}
        />
      )}
    </div>
  )
}
