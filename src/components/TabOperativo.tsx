import { useState, useCallback, useEffect } from 'react'
import { Plus, Edit3, Trash2, X, Save, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Supplier {
  id: string
  nome: string
  categoria: string
}

type CategoryType = 'experience' | 'catering' | 'staff_interno' | 'staff_esterno' | 'varie'

const CATEGORY_META: Record<CategoryType, { label: string; table: string }> = {
  experience: { label: 'Experience / Attivita', table: 'event_experience_details' },
  catering: { label: 'Catering', table: 'event_catering_details' },
  staff_interno: { label: 'Staff Simmetria', table: 'event_staff_interno_details' },
  staff_esterno: { label: 'Staff Esterno', table: 'event_staff_esterno_details' },
  varie: { label: 'Varie', table: 'event_varie_details' },
}

const CATERING_TIPOLOGIE = ['Welcome Coffee', 'Coffee Break', 'Lunch', 'Dinner', 'Cocktail']
const STAFF_INT_RUOLI = ['Project Manager', 'Account', 'Responsabile evento', 'Regia', 'Supporto operativo']
const STAFF_EXT_RUOLI = ['Hostess', 'Steward', 'Tour Leader', 'Promoter', 'Guardaroba']

export function TabOperativo({ event, suppliers }: { event: { id: string }; suppliers: Supplier[] }) {
  const [activeCategory, setActiveCategory] = useState<CategoryType>('experience')
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string | number | boolean>>({})
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from(CATEGORY_META[activeCategory].table).select('*').eq('event_id', event.id).order('data', { ascending: true, nullsFirst: false })
    setItems(data ?? [])
    setLoading(false)
  }, [event.id, activeCategory])

  useEffect(() => { loadItems() }, [loadItems])

  function resetForm() {
    if (activeCategory === 'experience') {
      setForm({ nome_attivita: '', data: '', ora_inizio: '', ora_fine: '', location: '', pax: '', durata_minuti: '', note_operative: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '', supplier_id: '' })
    } else if (activeCategory === 'catering') {
      setForm({ tipologia: '', data: '', ora_inizio: '', ora_fine: '', pax: '', venduto_per_persona: '', venduto_totale: '', costo_per_persona: '', costo_totale: '', note: '', supplier_id: '' })
    } else if (activeCategory === 'staff_interno') {
      setForm({ risorsa: '', ruolo: '', data: '', ora_inizio: '', ora_fine: '', venduto_totale: '', costo_giornaliero: '', costo_totale: '', note: '', note_operative: '' })
    } else if (activeCategory === 'staff_esterno') {
      setForm({ ruolo: '', quantita: '1', data: '', ora_inizio: '', ora_fine: '', lingue: '', abbigliamento: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '', note: '', note_operative: '', supplier_id: '' })
    } else {
      setForm({ descrizione: '', quantita: '1', data: '', ora_inizio: '', venduto_unitario: '', venduto_totale: '', costo_unitario: '', costo_totale: '', note: '', supplier_id: '' })
    }
  }

  function startAdd() {
    resetForm()
    setEditingId(null)
    setShowForm(true)
  }

  function startEdit(item: Record<string, unknown>) {
    setEditingId(item.id as string)
    const f: Record<string, string | number | boolean> = {}
    for (const [k, v] of Object.entries(item)) {
      if (k === 'id' || k === 'event_id' || k === 'created_at' || k === 'updated_at') continue
      f[k] = v == null ? '' : v as string | number | boolean
    }
    setForm(f)
    setShowForm(true)
  }

  async function handleSave() {
    setSaving(true)
    const table = CATEGORY_META[activeCategory].table
    const record: Record<string, unknown> = { event_id: event.id }

    if (activeCategory === 'experience') {
      const pax = form.pax !== '' ? Number(form.pax) : null
      const vu = form.venduto_unitario !== '' ? Number(form.venduto_unitario) : null
      const cu = form.costo_unitario !== '' ? Number(form.costo_unitario) : null
      Object.assign(record, {
        nome_attivita: form.nome_attivita || '',
        data: form.data || null,
        ora_inizio: form.ora_inizio || null,
        ora_fine: form.ora_fine || null,
        location: form.location || '',
        pax,
        durata_minuti: form.durata_minuti !== '' ? Number(form.durata_minuti) : null,
        note_operative: form.note_operative || '',
        venduto_unitario: vu,
        venduto_totale: form.venduto_totale !== '' ? Number(form.venduto_totale) : (vu && pax ? vu * pax : null),
        costo_unitario: cu,
        costo_totale: form.costo_totale !== '' ? Number(form.costo_totale) : (cu && pax ? cu * pax : null),
        supplier_id: form.supplier_id || null,
      })
    } else if (activeCategory === 'catering') {
      const pax = form.pax !== '' ? Number(form.pax) : null
      const vpp = form.venduto_per_persona !== '' ? Number(form.venduto_per_persona) : null
      const cpp = form.costo_per_persona !== '' ? Number(form.costo_per_persona) : null
      Object.assign(record, {
        tipologia: form.tipologia || '',
        data: form.data || null,
        ora: form.ora_inizio || null,
        ora_inizio: form.ora_inizio || null,
        ora_fine: form.ora_fine || null,
        pax,
        venduto_per_persona: vpp,
        venduto_totale: form.venduto_totale !== '' ? Number(form.venduto_totale) : (vpp && pax ? vpp * pax : null),
        costo_per_persona: cpp,
        costo_totale: form.costo_totale !== '' ? Number(form.costo_totale) : (cpp && pax ? cpp * pax : null),
        note: form.note || '',
        supplier_id: form.supplier_id || null,
      })
    } else if (activeCategory === 'staff_interno') {
      Object.assign(record, {
        risorsa: form.risorsa || '',
        ruolo: form.ruolo || '',
        data: form.data || null,
        ora_inizio: form.ora_inizio || null,
        ora_fine: form.ora_fine || null,
        venduto_totale: form.venduto_totale !== '' ? Number(form.venduto_totale) : null,
        costo_giornaliero: form.costo_giornaliero !== '' ? Number(form.costo_giornaliero) : null,
        costo_totale: form.costo_totale !== '' ? Number(form.costo_totale) : null,
        note: form.note || '',
        note_operative: form.note_operative || '',
      })
    } else if (activeCategory === 'staff_esterno') {
      const qty = form.quantita !== '' ? Number(form.quantita) : 1
      const vu = form.venduto_unitario !== '' ? Number(form.venduto_unitario) : null
      const cu = form.costo_unitario !== '' ? Number(form.costo_unitario) : null
      Object.assign(record, {
        ruolo: form.ruolo || '',
        quantita: qty,
        data: form.data || null,
        ora_inizio: form.ora_inizio || null,
        ora_fine: form.ora_fine || null,
        lingue: form.lingue || '',
        abbigliamento: form.abbigliamento || '',
        venduto_unitario: vu,
        venduto_totale: form.venduto_totale !== '' ? Number(form.venduto_totale) : (vu ? vu * qty : null),
        costo_unitario: cu,
        costo_totale: form.costo_totale !== '' ? Number(form.costo_totale) : (cu ? cu * qty : null),
        note: form.note || '',
        note_operative: form.note_operative || '',
        supplier_id: form.supplier_id || null,
      })
    } else {
      const qty = form.quantita !== '' ? Number(form.quantita) : 1
      const vu = form.venduto_unitario !== '' ? Number(form.venduto_unitario) : null
      const cu = form.costo_unitario !== '' ? Number(form.costo_unitario) : null
      Object.assign(record, {
        descrizione: form.descrizione || '',
        quantita: qty,
        data: form.data || null,
        ora_inizio: form.ora_inizio || null,
        venduto_unitario: vu,
        venduto_totale: form.venduto_totale !== '' ? Number(form.venduto_totale) : (vu ? vu * qty : null),
        costo_unitario: cu,
        costo_totale: form.costo_totale !== '' ? Number(form.costo_totale) : (cu ? cu * qty : null),
        note: form.note || '',
        supplier_id: form.supplier_id || null,
      })
    }

    if (editingId) {
      await supabase.from(table).update(record).eq('id', editingId)
    } else {
      record.id = crypto.randomUUID()
      await supabase.from(table).insert(record)
    }

    setSaving(false)
    setShowForm(false)
    setEditingId(null)
    await loadItems()
  }

  async function handleDelete() {
    if (!deletingId) return
    await supabase.from(CATEGORY_META[activeCategory].table).delete().eq('id', deletingId)
    setDeletingId(null)
    setExpandedId(null)
    await loadItems()
  }

  function getItemTitle(item: Record<string, unknown>): string {
    if (activeCategory === 'experience') return (item.nome_attivita as string) || 'Experience'
    if (activeCategory === 'catering') return (item.tipologia as string) || 'Catering'
    if (activeCategory === 'staff_interno') return (item.risorsa as string) || (item.ruolo as string) || 'Staff'
    if (activeCategory === 'staff_esterno') return (item.ruolo as string) || 'Staff esterno'
    return (item.descrizione as string) || 'Voce'
  }

  function getItemSubtitle(item: Record<string, unknown>): string {
    const parts: string[] = []
    if (item.data) parts.push(item.data as string)
    if (item.ora_inizio) parts.push(item.ora_inizio as string)
    if (item.pax) parts.push(`${item.pax} pax`)
    if (item.quantita && activeCategory !== 'experience') parts.push(`x${item.quantita}`)
    return parts.join(' | ')
  }

  function getItemEcon(item: Record<string, unknown>): { venduto: number; costo: number } {
    if (activeCategory === 'experience') {
      const pax = (item.pax as number) ?? 1
      const venduto = (item.venduto_totale as number) ?? ((item.venduto_unitario as number) ? (item.venduto_unitario as number) * pax : 0)
      const costo = (item.costo_totale as number) ?? ((item.costo_unitario as number) ? (item.costo_unitario as number) * pax : 0)
      return { venduto, costo }
    } else if (activeCategory === 'catering') {
      const pax = (item.pax as number) ?? 1
      const venduto = (item.venduto_totale as number) ?? ((item.venduto_per_persona as number) ? (item.venduto_per_persona as number) * pax : 0)
      const costo = (item.costo_totale as number) ?? ((item.costo_per_persona as number) ? (item.costo_per_persona as number) * pax : 0)
      return { venduto, costo }
    } else if (activeCategory === 'staff_interno') {
      const venduto = (item.venduto_totale as number) ?? 0
      const costo = (item.costo_totale as number) ?? ((item.costo_giornaliero as number) ?? 0)
      return { venduto, costo }
    } else {
      const qty = (item.quantita as number) ?? 1
      const venduto = (item.venduto_totale as number) ?? ((item.venduto_unitario as number) ? (item.venduto_unitario as number) * qty : 0)
      const costo = (item.costo_totale as number) ?? ((item.costo_unitario as number) ? (item.costo_unitario as number) * qty : 0)
      return { venduto, costo }
    }
  }

  const upd = (key: string, val: string | number | boolean) => setForm({ ...form, [key]: val })
  const inp = (key: string, label: string, type: string = 'text') => (
    <div>
      <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>{label}</label>
      <input type={type} value={String(form[key] ?? '')} onChange={e => upd(key, e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }} />
    </div>
  )
  const sel = (key: string, label: string, options: string[]) => (
    <div>
      <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>{label}</label>
      <select value={String(form[key] ?? '')} onChange={e => upd(key, e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
        <option value="">-- Seleziona --</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
  const supplierSel = (key: string) => (
    <div>
      <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Fornitore</label>
      <select value={String(form[key] ?? '')} onChange={e => upd(key, e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
        <option value="">-- Nessuno --</option>
        {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
      </select>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(CATEGORY_META) as [CategoryType, typeof CATEGORY_META[CategoryType]][]).map(([key, meta]) => (
          <button key={key} onClick={() => { setActiveCategory(key); setShowForm(false); setExpandedId(null) }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: activeCategory === key ? 'var(--red2)' : 'var(--panel2)', color: activeCategory === key ? '#fff' : 'var(--muted)' }}>
            {meta.label}
          </button>
        ))}
      </div>

      {/* Add button */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{CATEGORY_META[activeCategory].label}</p>
        <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--red2)', color: '#fff' }}>
          <Plus className="w-3 h-3" /> Aggiungi
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="panel p-5 space-y-4" style={{ border: '1px solid var(--blue)' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{editingId ? 'Modifica' : 'Nuova voce'}</p>
            <button onClick={() => { setShowForm(false); setEditingId(null) }}><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
          </div>

          {activeCategory === 'experience' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {inp('nome_attivita', 'Nome attivita')}
              {inp('data', 'Data', 'date')}
              {inp('ora_inizio', 'Ora inizio', 'time')}
              {inp('ora_fine', 'Ora fine', 'time')}
              {inp('location', 'Location')}
              {inp('pax', 'Pax', 'number')}
              {inp('durata_minuti', 'Durata (min)', 'number')}
              {inp('venduto_unitario', 'Venduto/pax', 'number')}
              {inp('venduto_totale', 'Venduto totale', 'number')}
              {inp('costo_unitario', 'Costo/pax', 'number')}
              {inp('costo_totale', 'Costo totale', 'number')}
              {supplierSel('supplier_id')}
              <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
            </div>
          )}

          {activeCategory === 'catering' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sel('tipologia', 'Tipologia', CATERING_TIPOLOGIE)}
              {inp('data', 'Data', 'date')}
              {inp('ora_inizio', 'Ora inizio', 'time')}
              {inp('ora_fine', 'Ora fine', 'time')}
              {inp('pax', 'Pax', 'number')}
              {inp('venduto_per_persona', 'Venduto/pax', 'number')}
              {inp('venduto_totale', 'Venduto totale', 'number')}
              {inp('costo_per_persona', 'Costo/pax', 'number')}
              {inp('costo_totale', 'Costo totale', 'number')}
              {supplierSel('supplier_id')}
              <div className="sm:col-span-3">{inp('note', 'Note operative')}</div>
            </div>
          )}

          {activeCategory === 'staff_interno' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {inp('risorsa', 'Risorsa (nome)')}
              {sel('ruolo', 'Ruolo', STAFF_INT_RUOLI)}
              {inp('data', 'Data', 'date')}
              {inp('ora_inizio', 'Ora inizio', 'time')}
              {inp('ora_fine', 'Ora fine', 'time')}
              {inp('venduto_totale', 'Venduto cliente', 'number')}
              {inp('costo_giornaliero', 'Costo giornaliero', 'number')}
              {inp('costo_totale', 'Costo totale', 'number')}
              <div className="sm:col-span-3">{inp('note', 'Note')}</div>
              <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
            </div>
          )}

          {activeCategory === 'staff_esterno' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sel('ruolo', 'Ruolo', STAFF_EXT_RUOLI)}
              {inp('quantita', 'Quantita', 'number')}
              {inp('data', 'Data', 'date')}
              {inp('ora_inizio', 'Ora inizio', 'time')}
              {inp('ora_fine', 'Ora fine', 'time')}
              {inp('lingue', 'Lingue')}
              {inp('abbigliamento', 'Abbigliamento')}
              {inp('venduto_unitario', 'Venduto/unit.', 'number')}
              {inp('venduto_totale', 'Venduto totale', 'number')}
              {inp('costo_unitario', 'Costo/unit.', 'number')}
              {inp('costo_totale', 'Costo totale', 'number')}
              {supplierSel('supplier_id')}
              <div className="sm:col-span-3">{inp('note_operative', 'Note operative')}</div>
            </div>
          )}

          {activeCategory === 'varie' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {inp('descrizione', 'Descrizione')}
              {inp('quantita', 'Quantita', 'number')}
              {inp('data', 'Data', 'date')}
              {inp('ora_inizio', 'Ora', 'time')}
              {inp('venduto_unitario', 'Venduto/unit.', 'number')}
              {inp('venduto_totale', 'Venduto totale', 'number')}
              {inp('costo_unitario', 'Costo/unit.', 'number')}
              {inp('costo_totale', 'Costo totale', 'number')}
              {supplierSel('supplier_id')}
              <div className="sm:col-span-3">{inp('note', 'Note')}</div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
            <button disabled={saving} onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--blue)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
              <Save className="w-3 h-3" /> {saving ? 'Salvataggio...' : 'Salva'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>Annulla</button>
          </div>
        </div>
      )}

      {/* Items list */}
      {loading ? (
        <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</div></div>
      ) : items.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <p className="text-sm">Nessuna voce inserita</p>
          <p className="text-xs mt-1">Clicca "Aggiungi" per inserire la prima voce</p>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          {items.map(item => {
            const id = item.id as string
            const isExpanded = expandedId === id
            const econ = getItemEcon(item)
            const margine = econ.venduto - econ.costo
            const sup = item.supplier_id ? suppliers.find(s => s.id === item.supplier_id) : null

            return (
              <div key={id} style={{ borderBottom: '1px solid var(--line)' }}>
                <button className="w-full text-left px-4 py-3 flex items-center gap-3 hover:opacity-80 transition-opacity" onClick={() => setExpandedId(isExpanded ? null : id)}>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${isExpanded ? '' : '-rotate-90'}`} style={{ color: 'var(--muted)' }} />
                  <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{getItemTitle(item)}</span>
                  <span className="text-[10px] hidden sm:block" style={{ color: 'var(--muted)' }}>{getItemSubtitle(item)}</span>
                  {sup && <span className="text-[10px] hidden md:block" style={{ color: 'var(--muted)' }}>{sup.nome}</span>}
                  {(econ.venduto > 0 || econ.costo > 0) && (
                    <>
                      <span className="text-xs w-20 text-right" style={{ color: 'var(--text)' }}>{'\u20AC'}{econ.venduto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs w-20 text-right" style={{ color: 'var(--yellow)' }}>{'\u20AC'}{econ.costo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs w-16 text-right font-medium" style={{ color: margine >= 0 ? 'var(--green)' : 'var(--red2)' }}>{'\u20AC'}{margine.toLocaleString('it-IT', { minimumFractionDigits: 0 })}</span>
                    </>
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1" style={{ background: 'var(--bg)' }}>
                    <ItemDetail item={item} category={activeCategory} suppliers={suppliers} />
                    <div className="flex items-center gap-2 pt-3 mt-3" style={{ borderTop: '1px solid var(--line)' }}>
                      <button onClick={() => startEdit(item)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80" style={{ background: 'var(--panel2)', color: 'var(--blue)' }}>
                        <Edit3 className="w-3 h-3" /> Modifica
                      </button>
                      <button onClick={() => setDeletingId(id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80" style={{ background: 'var(--panel2)', color: 'var(--red2)' }}>
                        <Trash2 className="w-3 h-3" /> Elimina
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingId(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Elimina voce</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Vuoi eliminare questa voce? Il fornitore collegato NON viene eliminato.</p>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setDeletingId(null)}>Annulla</button>
              <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--red2)', color: '#fff' }} onClick={handleDelete}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemDetail({ item, category, suppliers }: { item: Record<string, unknown>; category: CategoryType; suppliers: Supplier[] }) {
  const fields: { label: string; value: string }[] = []
  const sup = item.supplier_id ? suppliers.find(s => s.id === item.supplier_id) : null

  if (category === 'experience') {
    if (item.nome_attivita) fields.push({ label: 'Attivita', value: item.nome_attivita as string })
    if (item.data) fields.push({ label: 'Data', value: item.data as string })
    if (item.ora_inizio) fields.push({ label: 'Orario', value: `${item.ora_inizio}${item.ora_fine ? ' - ' + item.ora_fine : ''}` })
    if (item.pax) fields.push({ label: 'Pax', value: String(item.pax) })
    if (item.durata_minuti) fields.push({ label: 'Durata', value: `${item.durata_minuti} min` })
    if (item.location) fields.push({ label: 'Location', value: item.location as string })
    if (item.venduto_unitario) fields.push({ label: 'Venduto/pax', value: `\u20AC${Number(item.venduto_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.venduto_totale) fields.push({ label: 'Venduto totale', value: `\u20AC${Number(item.venduto_totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.costo_unitario) fields.push({ label: 'Costo/pax', value: `\u20AC${Number(item.costo_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.costo_totale) fields.push({ label: 'Costo totale', value: `\u20AC${Number(item.costo_totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.note_operative) fields.push({ label: 'Note operative', value: item.note_operative as string })
  } else if (category === 'catering') {
    if (item.tipologia) fields.push({ label: 'Tipologia', value: item.tipologia as string })
    if (item.data) fields.push({ label: 'Data', value: item.data as string })
    if (item.ora_inizio) fields.push({ label: 'Orario', value: `${item.ora_inizio}${item.ora_fine ? ' - ' + item.ora_fine : ''}` })
    if (item.pax) fields.push({ label: 'Pax', value: String(item.pax) })
    if (item.venduto_per_persona) fields.push({ label: 'Venduto/pax', value: `\u20AC${Number(item.venduto_per_persona).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.venduto_totale) fields.push({ label: 'Venduto totale', value: `\u20AC${Number(item.venduto_totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.costo_per_persona) fields.push({ label: 'Costo/pax', value: `\u20AC${Number(item.costo_per_persona).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.costo_totale) fields.push({ label: 'Costo totale', value: `\u20AC${Number(item.costo_totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.note) fields.push({ label: 'Note', value: item.note as string })
  } else if (category === 'staff_interno') {
    if (item.risorsa) fields.push({ label: 'Risorsa', value: item.risorsa as string })
    if (item.ruolo) fields.push({ label: 'Ruolo', value: item.ruolo as string })
    if (item.data) fields.push({ label: 'Data', value: item.data as string })
    if (item.ora_inizio) fields.push({ label: 'Orario', value: `${item.ora_inizio}${item.ora_fine ? ' - ' + item.ora_fine : ''}` })
    if (item.venduto_totale) fields.push({ label: 'Venduto', value: `\u20AC${Number(item.venduto_totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.costo_giornaliero) fields.push({ label: 'Costo giornaliero', value: `\u20AC${Number(item.costo_giornaliero).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.costo_totale) fields.push({ label: 'Costo totale', value: `\u20AC${Number(item.costo_totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.note) fields.push({ label: 'Note', value: item.note as string })
    if (item.note_operative) fields.push({ label: 'Note operative', value: item.note_operative as string })
  } else if (category === 'staff_esterno') {
    if (item.ruolo) fields.push({ label: 'Ruolo', value: item.ruolo as string })
    fields.push({ label: 'Quantita', value: String(item.quantita ?? 1) })
    if (item.data) fields.push({ label: 'Data', value: item.data as string })
    if (item.ora_inizio) fields.push({ label: 'Orario', value: `${item.ora_inizio}${item.ora_fine ? ' - ' + item.ora_fine : ''}` })
    if (item.lingue) fields.push({ label: 'Lingue', value: item.lingue as string })
    if (item.abbigliamento) fields.push({ label: 'Abbigliamento', value: item.abbigliamento as string })
    if (item.venduto_unitario) fields.push({ label: 'Venduto/unit.', value: `\u20AC${Number(item.venduto_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.venduto_totale) fields.push({ label: 'Venduto totale', value: `\u20AC${Number(item.venduto_totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.costo_unitario) fields.push({ label: 'Costo/unit.', value: `\u20AC${Number(item.costo_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.costo_totale) fields.push({ label: 'Costo totale', value: `\u20AC${Number(item.costo_totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.note_operative) fields.push({ label: 'Note operative', value: item.note_operative as string })
  } else {
    if (item.descrizione) fields.push({ label: 'Descrizione', value: item.descrizione as string })
    fields.push({ label: 'Quantita', value: String(item.quantita ?? 1) })
    if (item.venduto_unitario) fields.push({ label: 'Venduto/unit.', value: `\u20AC${Number(item.venduto_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.venduto_totale) fields.push({ label: 'Venduto totale', value: `\u20AC${Number(item.venduto_totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.costo_unitario) fields.push({ label: 'Costo/unit.', value: `\u20AC${Number(item.costo_unitario).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.costo_totale) fields.push({ label: 'Costo totale', value: `\u20AC${Number(item.costo_totale).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` })
    if (item.note) fields.push({ label: 'Note', value: item.note as string })
  }

  if (sup) fields.push({ label: 'Fornitore', value: sup.nome })

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
      {fields.map(f => (
        <div key={f.label}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{f.label}</p>
          <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text)' }}>{f.value}</p>
        </div>
      ))}
    </div>
  )
}
