import { useState, useEffect, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/data/events'
import type { Supplier } from '@/data/suppliers'
import type { ProgramEntry, ManualProgramRow } from './programma/types'
import { loadAutoEntries } from './programma/load-auto-entries'
import { ProgrammaForm } from './programma/ProgrammaForm'
import { ProgrammaTimeline } from './programma/ProgrammaTimeline'

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
      loadAutoEntries(event),
      supabase.from('event_program').select('*').eq('event_id', event.id).order('sort_order', { ascending: true }),
    ])

    setAutoEntries(autoRes)
    setManualEntries((manualRes.data ?? []) as ManualProgramRow[])
    setLoading(false)
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

  async function handleReorder(draggedId: string, droppedOnId: string) {
    const list = [...manualEntries]
    const dragIdx = list.findIndex(e => e.id === draggedId)
    const dropIdx = list.findIndex(e => e.id === droppedOnId)
    if (dragIdx < 0 || dropIdx < 0) return
    const [item] = list.splice(dragIdx, 1)
    list.splice(dropIdx, 0, item)
    setManualEntries(list)
    await Promise.all(list.map((e, i) =>
      supabase.from('event_program').update({ sort_order: i }).eq('id', e.id)
    ))
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

      <ProgrammaForm
        showForm={showForm}
        formData={formData}
        setFormData={setFormData}
        editingId={editingId}
        resetForm={resetForm}
        handleSave={handleSave}
        suppliers={suppliers}
      />

      <ProgrammaTimeline
        allEntries={allEntries}
        showForm={showForm}
        grouped={grouped}
        suppliers={suppliers}
        openDuplicate={openDuplicate}
        openEdit={openEdit}
        handleDelete={handleDelete}
        onReorder={handleReorder}
      />
    </div>
  )
}
