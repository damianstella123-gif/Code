import { useState, useEffect, useMemo } from 'react'
import { Clock, Plus, X, Edit3, Trash2, Users, Truck, MapPin, Link2, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtFullLong } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Supplier } from '@/data/suppliers'
import {
  SVC_CATEGORIES, HOTEL_TIPOS,
  type SupplierService, type HotelDetail, type RestaurantDetail,
  type ExperienceDetail, type CateringDetail, type StaffInternoDetail,
  type StaffEsternoDetail, type VarieDetail,
} from '../supplier-details-types'

interface ProgramEntry {
  id: string
  supplier_id: string
  titolo: string
  categoria: string
  data: string
  data_fine?: string | null
  ora_inizio: string
  ora_fine: string | null
  luogo: string
  note: string
  pax?: number | null
  servizio?: string
  manual?: boolean
}

interface ManualProgramRow {
  id: string
  event_id: string
  supplier_id: string | null
  titolo: string
  categoria: string
  data: string
  data_fine: string | null
  ora_inizio: string
  ora_fine: string | null
  luogo: string
  note: string
  pax: number | null
  servizio: string
}

const PROGRAM_CATEGORIES = [
  'Hotel', 'Meeting', 'F&B', 'Ristorante', 'Catering', 'Transfer',
  'Experience', 'Audio Video', 'Allestimenti', 'Staff', 'Grafica/Stampa', 'Varie', 'Altro',
]

export function TabProgramma({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const [autoEntries, setAutoEntries] = useState<ProgramEntry[]>([])
  const [manualEntries, setManualEntries] = useState<ManualProgramRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    supplier_id: '',
    titolo: '',
    categoria: 'Altro',
    data: event.dataInizio || '',
    data_fine: '',
    ora_inizio: '09:00',
    ora_fine: '',
    luogo: '',
    note: '',
    pax: '',
    servizio: '',
  })

  function resetForm() {
    setFormData({
      supplier_id: '',
      titolo: '',
      categoria: 'Altro',
      data: event.dataInizio || '',
      data_fine: '',
      ora_inizio: '09:00',
      ora_fine: '',
      luogo: '',
      note: '',
      pax: '',
      servizio: '',
    })
    setEditingId(null)
    setShowForm(false)
  }

  async function loadAll() {
    const [autoRes, manualRes] = await Promise.all([
      loadAutoEntries(),
      supabase.from('event_program').select('*').eq('event_id', event.id),
    ])

    setAutoEntries(autoRes)
    setManualEntries((manualRes.data ?? []) as ManualProgramRow[])
    setLoading(false)
  }

  async function loadAutoEntries(): Promise<ProgramEntry[]> {
    const [svcRes, hotelRes, restRes, expRes, catRes, staffIntRes, staffExtRes, varieRes, avRes, allestRes, graficaRes] = await Promise.all([
      supabase.from('event_supplier_services').select('*').eq('event_id', event.id),
      supabase.from('event_hotel_details').select('*').eq('event_id', event.id),
      supabase.from('event_restaurant_details').select('*').eq('event_id', event.id),
      supabase.from('event_experience_details').select('*').eq('event_id', event.id),
      supabase.from('event_catering_details').select('*').eq('event_id', event.id),
      supabase.from('event_staff_interno_details').select('*').eq('event_id', event.id),
      supabase.from('event_staff_esterno_details').select('*').eq('event_id', event.id),
      supabase.from('event_varie_details').select('*').eq('event_id', event.id),
      supabase.from('event_audio_video_details').select('*').eq('event_id', event.id),
      supabase.from('event_allestimenti_details').select('*').eq('event_id', event.id),
      supabase.from('event_grafica_stampa_details').select('*').eq('event_id', event.id),
    ])

    const program: ProgramEntry[] = []

    for (const svc of (svcRes.data ?? []) as SupplierService[]) {
      if (svc.data && svc.ora_inizio) {
        program.push({
          id: svc.id, supplier_id: svc.supplier_id,
          titolo: svc.titolo,
          categoria: SVC_CATEGORIES.find(c => c.value === svc.categoria)?.label ?? svc.categoria,
          data: svc.data, ora_inizio: svc.ora_inizio, ora_fine: svc.ora_fine,
          luogo: svc.partenza && svc.destinazione ? `${svc.partenza} → ${svc.destinazione}` : svc.luogo,
          note: svc.note,
        })
      }
    }

    for (const h of (hotelRes.data ?? []) as HotelDetail[]) {
      const sotto = h.sotto_categoria || h.tipo || 'pernottamento'
      const tipoLabel = HOTEL_TIPOS.find(t => t.value === sotto)?.label ?? sotto
      if (sotto === 'pernottamento') {
        if (h.check_in_date) {
          const roomInfo = [h.quantita ? `${h.quantita} camere` : '', h.room_type].filter(Boolean).join(' ')
          program.push({ id: h.id + '-cin', supplier_id: h.supplier_id, titolo: 'Check-in Hotel', categoria: 'Hotel', data: h.check_in_date, ora_inizio: h.check_in_time || '14:00', ora_fine: null, luogo: h.luogo, note: roomInfo })
        }
        if (h.check_out_date) {
          const roomInfo = [h.quantita ? `${h.quantita} camere` : '', h.room_type].filter(Boolean).join(' ')
          program.push({ id: h.id + '-cout', supplier_id: h.supplier_id, titolo: 'Check-out Hotel', categoria: 'Hotel', data: h.check_out_date, ora_inizio: h.check_out_time || '10:00', ora_fine: null, luogo: h.luogo, note: roomInfo })
        }
      } else if (sotto === 'meeting_room' || sotto === 'breakout_room' || sotto === 'sala_regia') {
        if (h.data && h.ora_inizio) {
          program.push({ id: h.id + '-meet', supplier_id: h.supplier_id, titolo: `${tipoLabel}${h.luogo ? ' - ' + h.luogo : ''}${h.meeting_pax ? ' ' + h.meeting_pax + ' pax' : ''}`, categoria: 'Meeting', data: h.data, ora_inizio: h.ora_inizio, ora_fine: h.ora_fine, luogo: h.luogo, note: [h.meeting_setup, h.meeting_equipment, h.note].filter(Boolean).join(' | ') })
        }
      } else {
        if (h.data && h.ora_inizio) {
          program.push({ id: h.id, supplier_id: h.supplier_id, titolo: tipoLabel, categoria: 'F&B', data: h.data, ora_inizio: h.ora_inizio, ora_fine: null, luogo: h.luogo, note: h.note })
        }
      }
    }

    for (const r of (restRes.data ?? []) as RestaurantDetail[]) {
      if (r.data && r.ora_inizio) {
        program.push({ id: r.id + '-start', supplier_id: r.supplier_id, titolo: r.tipologia_servizio || 'Servizio ristorante', categoria: 'Ristorante', data: r.data, ora_inizio: r.ora_inizio, ora_fine: r.ora_fine, luogo: r.nome_sala, note: r.pax_confermati ? `${r.pax_confermati} pax` : '' })
      }
    }

    for (const e of (expRes.data ?? []) as ExperienceDetail[]) {
      if (e.data && e.ora_inizio) {
        program.push({ id: e.id, supplier_id: e.supplier_id ?? '', titolo: e.nome_attivita || 'Experience', categoria: 'Experience', data: e.data, ora_inizio: e.ora_inizio, ora_fine: e.ora_fine, luogo: e.location, note: [e.pax ? `${e.pax} pax` : '', e.durata_minuti ? `${e.durata_minuti} min` : '', e.note_operative].filter(Boolean).join(' | ') })
      }
    }

    for (const c of (catRes.data ?? []) as CateringDetail[]) {
      const ora = c.ora_inizio || c.ora
      if (c.data && ora) {
        program.push({ id: c.id, supplier_id: c.supplier_id ?? '', titolo: c.tipologia || 'Catering', categoria: 'Catering', data: c.data, ora_inizio: ora, ora_fine: c.ora_fine, luogo: '', note: c.pax ? `${c.pax} pax` : '' })
      }
    }

    for (const si of (staffIntRes.data ?? []) as StaffInternoDetail[]) {
      if (si.data && si.ora_inizio) {
        const nome = [(si as any).nome, (si as any).cognome].filter(Boolean).join(' ') || si.risorsa || ''
        const label = si.ruolo ? (nome ? `${si.ruolo} - ${nome}` : si.ruolo) : (nome || 'Staff Simmetria')
        program.push({ id: si.id, supplier_id: si.supplier_id ?? '', titolo: label, categoria: 'Staff Simmetria', data: si.data, ora_inizio: si.ora_inizio, ora_fine: si.ora_fine, luogo: '', note: si.note || '' })
      }
    }

    for (const se of (staffExtRes.data ?? []) as StaffEsternoDetail[]) {
      if (se.data && se.ora_inizio) {
        const nome = [(se as any).nome, (se as any).cognome].filter(Boolean).join(' ')
        const label = se.ruolo ? (nome ? `${se.ruolo} - ${nome}` : `${se.ruolo}${se.quantita > 1 ? ' x' + se.quantita : ''}`) : (nome || 'Staff Esterno')
        program.push({ id: se.id, supplier_id: se.supplier_id ?? '', titolo: label, categoria: 'Staff Esterno', data: se.data, ora_inizio: se.ora_inizio, ora_fine: se.ora_fine, luogo: '', note: [se.lingue, se.note].filter(Boolean).join(' | ') })
      }
    }

    for (const v of (varieRes.data ?? []) as VarieDetail[]) {
      if (v.data && v.ora_inizio) {
        program.push({ id: v.id, supplier_id: v.supplier_id ?? '', titolo: v.descrizione || 'Varie', categoria: 'Varie', data: v.data, ora_inizio: v.ora_inizio, ora_fine: null, luogo: '', note: v.note || '' })
      }
    }

    for (const av of (avRes.data ?? []) as Record<string, unknown>[]) {
      if (av.data_montaggio && av.ora_montaggio) program.push({ id: av.id + '-mont', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Montaggio AV', categoria: 'Audio Video', data: av.data_montaggio as string, ora_inizio: av.ora_montaggio as string, ora_fine: null, luogo: '', note: (av.tipologia_servizio as string) || '' })
      if (av.data_prove && av.ora_prove) program.push({ id: av.id + '-prove', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Prove AV', categoria: 'Audio Video', data: av.data_prove as string, ora_inizio: av.ora_prove as string, ora_fine: null, luogo: '', note: '' })
      if (av.data_evento && av.ora_evento) program.push({ id: av.id + '-evt', supplier_id: (av.supplier_id as string) ?? '', titolo: (av.tipologia_servizio as string) || 'Servizio AV', categoria: 'Audio Video', data: av.data_evento as string, ora_inizio: av.ora_evento as string, ora_fine: null, luogo: '', note: '' })
      if (av.data_smontaggio && av.ora_smontaggio) program.push({ id: av.id + '-smont', supplier_id: (av.supplier_id as string) ?? '', titolo: 'Smontaggio AV', categoria: 'Audio Video', data: av.data_smontaggio as string, ora_inizio: av.ora_smontaggio as string, ora_fine: null, luogo: '', note: '' })
    }

    for (const al of (allestRes.data ?? []) as Record<string, unknown>[]) {
      if (al.data_montaggio && al.ora_montaggio) program.push({ id: al.id + '-mont', supplier_id: (al.supplier_id as string) ?? '', titolo: `Montaggio: ${(al.descrizione as string) || 'Allestimento'}`, categoria: 'Allestimenti', data: al.data_montaggio as string, ora_inizio: al.ora_montaggio as string, ora_fine: null, luogo: (al.area_utilizzo as string) || '', note: '' })
      if (al.data_smontaggio && al.ora_smontaggio) program.push({ id: al.id + '-smont', supplier_id: (al.supplier_id as string) ?? '', titolo: `Smontaggio: ${(al.descrizione as string) || 'Allestimento'}`, categoria: 'Allestimenti', data: al.data_smontaggio as string, ora_inizio: al.ora_smontaggio as string, ora_fine: null, luogo: (al.area_utilizzo as string) || '', note: '' })
    }

    for (const g of (graficaRes.data ?? []) as Record<string, unknown>[]) {
      if (g.data_consegna) program.push({ id: g.id as string, supplier_id: (g.supplier_id as string) ?? '', titolo: `Consegna: ${(g.tipo_materiale as string) || 'Materiale'}`, categoria: 'Grafica/Stampa', data: g.data_consegna as string, ora_inizio: '09:00', ora_fine: null, luogo: '', note: (g.formato as string) || '' })
    }

    return program
  }

  useEffect(() => { loadAll() }, [event.id])

  const allEntries = useMemo(() => {
    const merged: ProgramEntry[] = [
      ...autoEntries,
      ...manualEntries.map(m => ({
        id: m.id,
        supplier_id: m.supplier_id || '',
        titolo: m.titolo,
        categoria: m.categoria,
        data: m.data,
        data_fine: m.data_fine,
        ora_inizio: m.ora_inizio,
        ora_fine: m.ora_fine,
        luogo: m.luogo,
        note: m.note,
        pax: m.pax,
        servizio: m.servizio,
        manual: true,
      })),
    ]
    merged.sort((a, b) => {
      const cmpDate = a.data.localeCompare(b.data)
      if (cmpDate !== 0) return cmpDate
      return a.ora_inizio.localeCompare(b.ora_inizio)
    })
    return merged
  }, [autoEntries, manualEntries])

  const grouped = allEntries.reduce<Record<string, ProgramEntry[]>>((acc, e) => {
    if (!acc[e.data]) acc[e.data] = []
    acc[e.data].push(e)
    return acc
  }, {})

  function openEdit(entry: ProgramEntry) {
    const m = manualEntries.find(r => r.id === entry.id)
    if (!m) return
    setFormData({
      supplier_id: m.supplier_id || '',
      titolo: m.titolo,
      categoria: m.categoria,
      data: m.data,
      data_fine: m.data_fine || '',
      ora_inizio: m.ora_inizio,
      ora_fine: m.ora_fine || '',
      luogo: m.luogo,
      note: m.note,
      pax: m.pax ? String(m.pax) : '',
      servizio: m.servizio,
    })
    setEditingId(m.id)
    setShowForm(true)
  }

  function openDuplicate(entry: ProgramEntry) {
    const m = manualEntries.find(r => r.id === entry.id)
    if (!m) return
    const nextDay = new Date(m.data)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStr = nextDay.toISOString().split('T')[0]
    setFormData({
      supplier_id: m.supplier_id || '',
      titolo: m.titolo,
      categoria: m.categoria,
      data: nextDayStr,
      data_fine: '',
      ora_inizio: m.ora_inizio,
      ora_fine: m.ora_fine || '',
      luogo: m.luogo,
      note: m.note,
      pax: m.pax ? String(m.pax) : '',
      servizio: m.servizio,
    })
    setEditingId(null)
    setShowForm(true)
  }

  async function handleSave() {
    if (!formData.titolo.trim() || !formData.data || !formData.ora_inizio) return
    if (formData.data_fine && formData.data_fine < formData.data) return
    const payload = {
      event_id: event.id,
      supplier_id: formData.supplier_id || null,
      titolo: formData.titolo.trim(),
      categoria: formData.categoria,
      data: formData.data,
      data_fine: formData.data_fine || null,
      ora_inizio: formData.ora_inizio,
      ora_fine: formData.ora_fine || null,
      luogo: formData.luogo.trim(),
      note: formData.note.trim(),
      pax: formData.pax ? parseInt(formData.pax) : null,
      servizio: formData.servizio.trim(),
    }

    if (editingId) {
      await supabase.from('event_program').update(payload).eq('id', editingId)
    } else {
      await supabase.from('event_program').insert(payload)
    }
    resetForm()
    await loadAll()
  }

  async function handleDelete(id: string) {
    await supabase.from('event_program').delete().eq('id', id)
    await loadAll()
  }

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento programma...</div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--muted)' }}>
          Programma evento
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--red2) 10%, transparent)', color: 'var(--red2)' }}>
            {allEntries.length} attivita
          </span>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}
          >
            <Plus className="w-3.5 h-3.5" /> Aggiungi
          </button>
        </div>
      </div>

      {showForm && (
        <div className="panel p-5 space-y-4" style={{ border: '1px solid var(--red2)', borderRadius: '12px' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {editingId ? 'Modifica voce programma' : 'Nuova voce programma'}
            </p>
            <button onClick={resetForm} className="p-1 rounded hover:bg-[var(--line)]"><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Fornitore</label>
              <select
                value={formData.supplier_id}
                onChange={e => setFormData(prev => ({ ...prev, supplier_id: e.target.value, servizio: '' }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              >
                <option value="">-- Nessun fornitore --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.nome}{s.categoria ? ` (${s.categoria})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Servizio collegato</label>
              <input
                value={formData.servizio}
                onChange={e => setFormData(prev => ({ ...prev, servizio: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="es. Coffee break, Allestimento palco..."
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Titolo *</label>
              <input
                value={formData.titolo}
                onChange={e => setFormData(prev => ({ ...prev, titolo: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="es. Coffee break, Meeting plenaria..."
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Categoria</label>
              <select
                value={formData.categoria}
                onChange={e => setFormData(prev => ({ ...prev, categoria: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              >
                {PROGRAM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Data *</label>
              <input
                type="date"
                value={formData.data}
                onChange={e => setFormData(prev => ({ ...prev, data: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Data fine</label>
              <input
                type="date"
                value={formData.data_fine}
                min={formData.data || undefined}
                onChange={e => setFormData(prev => ({ ...prev, data_fine: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              />
              <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
                Lascia vuoto se dura un solo giorno. Es. pernottamento 27-28: data 27, data fine 29 (check-out).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Ora inizio *</label>
                <input
                  type="time"
                  value={formData.ora_inizio}
                  onChange={e => setFormData(prev => ({ ...prev, ora_inizio: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Ora fine</label>
                <input
                  type="time"
                  value={formData.ora_fine}
                  onChange={e => setFormData(prev => ({ ...prev, ora_fine: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Location / Sala</label>
              <input
                value={formData.luogo}
                onChange={e => setFormData(prev => ({ ...prev, luogo: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="es. Sala Galileo, Terrazza..."
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Pax</label>
              <input
                type="number"
                value={formData.pax}
                onChange={e => setFormData(prev => ({ ...prev, pax: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="Numero partecipanti"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Note operative</label>
              <textarea
                value={formData.note}
                onChange={e => setFormData(prev => ({ ...prev, note: e.target.value }))}
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="Note operative, istruzioni..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ color: 'var(--muted)' }}>Annulla</button>
            <button
              onClick={handleSave}
              disabled={!formData.titolo.trim() || !formData.data || !formData.ora_inizio}
              className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}
            >
              {editingId ? 'Salva modifiche' : 'Aggiungi al programma'}
            </button>
          </div>
        </div>
      )}

      {allEntries.length === 0 && !showForm && (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessuna voce nel programma</p>
          <p className="text-xs mt-1">Aggiungi voci manuali o compila i servizi dei fornitori per generare il programma</p>
        </div>
      )}

      {Object.entries(grouped).map(([dateStr, dayItems]) => (
        <div key={dateStr}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3 px-1"
            style={{ color: 'var(--muted)' }}>
            {fmtFullLong(dateStr)}
          </p>
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-2 bottom-2 w-px" style={{ background: 'var(--line)' }} />
            <div className="space-y-3">
              {dayItems.map(entry => {
                const sup = suppliers.find(s => s.id === entry.supplier_id)
                return (
                  <div key={entry.id} className="relative flex items-start gap-3">
                    <div className="absolute left-[-18px] top-2.5 w-2.5 h-2.5 rounded-full border-2"
                      style={{ borderColor: entry.manual ? 'var(--blue)' : 'var(--red2)', background: 'var(--bg)' }} />
                    <div className="flex-1 panel p-4" style={{ border: entry.manual ? '1px solid var(--blue)' : undefined }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                              {entry.ora_inizio?.slice(0, 5)}
                              {entry.ora_fine ? ` - ${entry.ora_fine.slice(0, 5)}` : ''}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: entry.manual ? 'color-mix(in srgb, var(--blue) 10%, transparent)' : 'color-mix(in srgb, var(--red2) 10%, transparent)', color: entry.manual ? 'var(--blue)' : 'var(--red2)' }}>
                              {entry.categoria}
                            </span>
                            {entry.data_fine && entry.data_fine !== entry.data && (
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                fino al {fmtFullLong(entry.data_fine)}
                              </span>
                            )}
                            {entry.pax && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                                <Users className="w-3 h-3 inline mr-0.5" />{entry.pax} pax
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium mt-1" style={{ color: 'var(--text)' }}>
                            {entry.titolo}
                          </p>
                          {sup && (
                            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                              <Truck className="w-3 h-3 inline mr-1" />{sup.nome}
                            </p>
                          )}
                          {entry.servizio && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                              <Link2 className="w-3 h-3 inline mr-1" />{entry.servizio}
                            </p>
                          )}
                          {entry.luogo && (
                            <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                              <MapPin className="w-3 h-3 inline" />{entry.luogo}
                            </div>
                          )}
                          {entry.note && <p className="text-xs mt-1 italic" style={{ color: 'var(--muted)' }}>{entry.note}</p>}
                        </div>
                        {entry.manual && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => openDuplicate(entry)} className="p-1.5 rounded-lg hover:bg-[var(--line)] transition-colors" title="Duplica (es. per un'altra notte)">
                              <Copy className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                            </button>
                            <button onClick={() => openEdit(entry)} className="p-1.5 rounded-lg hover:bg-[var(--line)] transition-colors">
                              <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                            </button>
                            <button onClick={() => handleDelete(entry.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
