import { useState, useEffect, useMemo } from 'react'
import { Plus, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import { friendlyError } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Supplier } from '@/data/suppliers'
import type { ProgramEntry, ManualProgramRow } from './programma/types'
import { loadAutoEntries } from './programma/load-auto-entries'
import { ProgrammaForm } from './programma/ProgrammaForm'
import { ProgrammaTimeline } from './programma/ProgrammaTimeline'

export function TabProgramma({ event, suppliers }: { event: Event; suppliers: Supplier[] }) {
  const { showToast } = useToast()
  const [autoEntries, setAutoEntries] = useState<ProgramEntry[]>([])
  const [manualEntries, setManualEntries] = useState<ManualProgramRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showPrint, setShowPrint] = useState(false)
  const [printVersion, setPrintVersion] = useState<'interno' | 'cliente'>('interno')

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
    showToast('Voce duplicata — modifica i dettagli', 'success')
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

    let error
    if (editingId) {
      const res = await supabase.from('event_program').update(payload).eq('id', editingId)
      error = res.error
    } else {
      const res = await supabase.from('event_program').insert(payload)
      error = res.error
    }
    if (error) { showToast(friendlyError(error), 'error'); return }
    resetForm()
    await loadAll()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('event_program').delete().eq('id', id)
    if (error) { showToast(friendlyError(error), 'error'); return }
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

  function handlePrint() {
    const isInterno = printVersion === 'interno'
    const byDay: Record<string, ProgramEntry[]> = {}
    allEntries.forEach(e => {
      const d = e.data || 'TBD'
      if (!byDay[d]) byDay[d] = []
      byDay[d].push(e)
    })

    const dayGroups = Object.entries(byDay).map(([date, entries]) => {
      const dayLabel = date !== 'TBD'
        ? new Date(date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
        : 'DATA DA DEFINIRE'

      const rows = entries.map(e => {
        const supplier = suppliers.find(s => s.id === e.supplier_id)
        return `<div class="entry">
          <div class="time">${e.ora_inizio || '--:--'}${e.ora_fine ? '<br><span style="color:#888;font-size:10px">' + e.ora_fine + '</span>' : ''}</div>
          <div class="content">
            <div class="title">${escapeHtml(e.titolo || e.servizio || '')}</div>
            <div class="meta">${e.luogo ? '&#x1f4cd; ' + escapeHtml(e.luogo) : ''}${e.pax ? ' &middot; &#x1f465; ' + e.pax + ' pax' : ''}${supplier ? ' &middot; ' + escapeHtml(supplier.nome) : ''}</div>
            ${isInterno && e.note ? '<div class="note">' + escapeHtml(e.note) + '</div>' : ''}
          </div>
        </div>`
      }).join('')

      return `<div class="day-group"><div class="day-label">${dayLabel}</div>${rows}</div>`
    }).join('')

    const dateStr = event.dataInizio
      ? new Date(event.dataInizio).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
      : ''

    const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Programma - ${escapeHtml(event.nome)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Montserrat',Arial,sans-serif;color:#1a1a2e;padding:40px;max-width:800px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:16px;border-bottom:3px solid #c8192e;margin-bottom:32px}
.header-left h1{font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:4px}
.header-left p{font-size:12px;color:#888;font-family:monospace;letter-spacing:.05em}
.header-right{text-align:right;font-size:11px;color:#888;font-family:monospace}
.badge{display:inline-block;background:#c8192e;color:white;font-size:10px;padding:2px 8px;border-radius:99px;font-family:monospace;letter-spacing:.06em;margin-bottom:8px}
.day-group{margin-bottom:28px}
.day-label{font-family:monospace;font-size:10px;letter-spacing:.14em;color:#888;text-transform:uppercase;margin-bottom:12px;padding-bottom:4px;border-bottom:1px solid #e5e0da}
.entry{display:flex;gap:16px;padding:12px 0;border-bottom:1px solid #f0ede8;page-break-inside:avoid}
.entry:last-child{border-bottom:none}
.time{font-family:monospace;font-size:12px;color:#c8192e;font-weight:600;min-width:80px;flex-shrink:0}
.content{flex:1}
.title{font-size:13px;font-weight:600;margin-bottom:3px}
.meta{font-family:monospace;font-size:11px;color:#888}
.note{margin-top:6px;font-size:11px;color:#555;font-style:italic;background:#f8f5f0;padding:4px 8px;border-radius:4px;border-left:2px solid #e8a020}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e0da;display:flex;justify-content:space-between;font-family:monospace;font-size:10px;color:#aaa}
@media print{body{padding:20px}.entry{page-break-inside:avoid}}
</style></head><body>
<div class="header">
  <div class="header-left">
    <div class="badge">PROGRAMMA EVENTO</div>
    <h1>${escapeHtml(event.nome)}</h1>
    <p>${escapeHtml(event.location || '')}${dateStr ? ' &middot; ' + dateStr : ''}${event.partecipanti ? ' &middot; ' + event.partecipanti + ' partecipanti' : ''}</p>
  </div>
  <div class="header-right">
    <div>Simmetria Synergy</div>
    <div>${isInterno ? 'Versione interna' : 'Versione cliente'}</div>
    <div>${new Date().toLocaleDateString('it-IT')}</div>
  </div>
</div>
${dayGroups}
<div class="footer">
  <span>Simmetria Synergy &middot; The Event Operating System</span>
  <span>${isInterno ? 'DOCUMENTO INTERNO — USO RISERVATO' : ''}</span>
</div>
</body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 500)
    setShowPrint(false)
  }

  function escapeHtml(str: string) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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
            onClick={() => setShowPrint(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              border: '1px solid var(--line)', background: 'transparent',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--muted)', cursor: 'pointer',
            }}
          >
            <Printer style={{ width: 14, height: 14 }} />
            Stampa / PDF
          </button>
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

      {showPrint && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'var(--panel-solid)', borderRadius: 16, padding: 24, width: 340, border: '1px solid var(--line)' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase' }}>
              Scegli versione
            </p>

            {(['interno', 'cliente'] as const).map(v => (
              <button key={v} onClick={() => setPrintVersion(v)} style={{
                width: '100%', padding: '12px 16px', marginBottom: 8,
                borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                border: printVersion === v ? '2px solid var(--red2)' : '1px solid var(--line)',
                background: printVersion === v ? 'rgba(200,25,46,0.05)' : 'transparent',
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)',
              }}>
                {v === 'interno'
                  ? 'Versione interna — completa con note e responsabili'
                  : 'Versione cliente — pulita, senza note interne'}
              </button>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={handlePrint} style={{
                flex: 1, padding: 10, background: 'var(--red2)', color: 'white',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
              }}>
                Stampa / Salva PDF
              </button>
              <button onClick={() => setShowPrint(false)} style={{
                padding: '10px 16px', border: '1px solid var(--line)',
                background: 'transparent', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)',
              }}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
