import { useState, useEffect } from 'react'
import { CheckSquare, Clock, Plus, X, Zap, Edit3, Trash2 } from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { fetchTasksByEvent, upsertTask, changeTaskStatus, deleteTask as deleteTaskRemote } from '@/lib/tasks-service'
import { daysLeft, toISO } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Supplier } from '@/data/suppliers'
import type { InternalUser } from '../shared-types'

const TASK_FASI = ['pianificazione', 'operativo', 'chiusura'] as const
const TASK_CATEGORIE = ['logistica', 'contratti', 'comunicazione', 'tecnico', 'amministrativo', 'altro'] as const

const TASK_TEMPLATES: { titolo: string; fase: string; categoria: string; offsetDays: number; priorita: Task['priorita'] }[] = [
  { titolo: 'Conferma venue / location', fase: 'pianificazione', categoria: 'contratti', offsetDays: -45, priorita: 'alta' },
  { titolo: 'Contratto fornitori principali', fase: 'pianificazione', categoria: 'contratti', offsetDays: -40, priorita: 'alta' },
  { titolo: 'Definizione programma evento', fase: 'pianificazione', categoria: 'logistica', offsetDays: -35, priorita: 'media' },
  { titolo: 'Invio inviti / comunicazioni', fase: 'pianificazione', categoria: 'comunicazione', offsetDays: -30, priorita: 'media' },
  { titolo: 'Conferma catering e F&B', fase: 'pianificazione', categoria: 'contratti', offsetDays: -25, priorita: 'alta' },
  { titolo: 'Conferma transfer e logistica', fase: 'operativo', categoria: 'logistica', offsetDays: -15, priorita: 'media' },
  { titolo: 'Coordinamento allestimenti', fase: 'operativo', categoria: 'tecnico', offsetDays: -10, priorita: 'alta' },
  { titolo: 'Briefing team evento', fase: 'operativo', categoria: 'comunicazione', offsetDays: -3, priorita: 'alta' },
  { titolo: 'Check tecnico audio/video', fase: 'operativo', categoria: 'tecnico', offsetDays: -1, priorita: 'alta' },
  { titolo: 'Raccolta feedback partecipanti', fase: 'chiusura', categoria: 'comunicazione', offsetDays: 3, priorita: 'media' },
  { titolo: 'Rendiconto spese e fatturazione', fase: 'chiusura', categoria: 'amministrativo', offsetDays: 7, priorita: 'alta' },
  { titolo: 'Report finale evento', fase: 'chiusura', categoria: 'amministrativo', offsetDays: 10, priorita: 'media' },
]

// @ts-ignore — kept for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TabTask({ event, suppliers, internalUsers }: { event: Event; suppliers: Supplier[]; internalUsers: InternalUser[] }) {
  const [filter, setFilter] = useState<'tutti' | 'da_fare' | 'in_corso' | 'completato'>('tutti')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [generatingTemplates, setGeneratingTemplates] = useState(false)

  const [form, setForm] = useState({
    titolo: '', descrizione: '', assegnatario: '',
    priorita: 'media' as Task['priorita'], scadenza: event.dataInizio || '',
    supplier_id: '', fase: '', categoria: '',
  })

  useEffect(() => {
    fetchTasksByEvent(event.id).then(t => { setTasks(t); setLoading(false) })
  }, [event.id])

  const filtered = filter === 'tutti' ? tasks : tasks.filter(t => t.stato === filter)
  const counts = {
    da_fare: tasks.filter(t => t.stato === 'da_fare').length,
    in_corso: tasks.filter(t => t.stato === 'in_corso').length,
    completato: tasks.filter(t => t.stato === 'completato').length,
  }

  function resetForm() {
    setForm({ titolo: '', descrizione: '', assegnatario: '', priorita: 'media', scadenza: event.dataInizio || '', supplier_id: '', fase: '', categoria: '' })
    setEditingTask(null)
    setShowForm(false)
  }

  function startEdit(task: Task) {
    setForm({
      titolo: task.titolo, descrizione: task.descrizione, assegnatario: task.assegnatario,
      priorita: task.priorita, scadenza: task.scadenza,
      supplier_id: task.supplier_id || '', fase: task.fase || '', categoria: task.categoria || '',
    })
    setEditingTask(task)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.titolo.trim() || !form.scadenza) return
    const currentUser = loadUser()
    const task: Task = {
      id: editingTask?.id ?? `tsk_${Date.now()}`,
      titolo: form.titolo.trim(),
      descrizione: form.descrizione.trim(),
      assegnatario: form.assegnatario || currentUser?.id || '',
      evento: event.id,
      priorita: form.priorita,
      stato: editingTask?.stato ?? 'da_fare',
      scadenza: form.scadenza,
      creatoIl: editingTask?.creatoIl ?? new Date().toISOString(),
      supplier_id: form.supplier_id || null,
      fase: form.fase || null,
      categoria: form.categoria || null,
    }
    const saved = await upsertTask(task)
    if (saved) {
      setTasks(prev => editingTask
        ? prev.map(t => t.id === saved.id ? saved : t)
        : [...prev, saved]
      )
      resetForm()
    }
  }

  async function handleStatusChange(taskId: string, newStatus: Task['stato']) {
    const result = await changeTaskStatus(taskId, newStatus)
    if (result) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, stato: newStatus } : t))
    }
  }

  async function handleDelete() {
    if (!deletingId) return
    const ok = await deleteTaskRemote(deletingId)
    if (ok) {
      setTasks(prev => prev.filter(t => t.id !== deletingId))
      setDeletingId(null)
    }
  }

  async function generateTemplates() {
    setGeneratingTemplates(true)
    const currentUser = loadUser()
    const eventStart = new Date(event.dataInizio)
    const newTasks: Task[] = []

    for (const tmpl of TASK_TEMPLATES) {
      const dueDate = new Date(eventStart.getTime() + tmpl.offsetDays * 86400000)
      const task: Task = {
        id: `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        titolo: tmpl.titolo,
        descrizione: '',
        assegnatario: currentUser?.id || event.responsabile || '',
        evento: event.id,
        priorita: tmpl.priorita,
        stato: 'da_fare',
        scadenza: toISO(dueDate),
        creatoIl: new Date().toISOString(),
        fase: tmpl.fase,
        categoria: tmpl.categoria,
      }
      const saved = await upsertTask(task)
      if (saved) newTasks.push(saved)
    }

    setTasks(prev => [...prev, ...newTasks])
    setGeneratingTemplates(false)
  }

  if (loading) {
    return <div className="panel p-10 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento task...</div></div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {([
            { id: 'tutti', label: `Tutti (${tasks.length})` },
            { id: 'da_fare', label: `Da fare (${counts.da_fare})` },
            { id: 'in_corso', label: `In corso (${counts.in_corso})` },
            { id: 'completato', label: `Completati (${counts.completato})` },
          ] as const).map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: filter === f.id ? 'color-mix(in srgb, var(--red2) 12%, transparent)' : 'var(--panel)',
                color: filter === f.id ? 'var(--red2)' : 'var(--muted)',
                border: `1px solid ${filter === f.id ? 'var(--red2)' : 'var(--line)'}`,
              }}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {tasks.length === 0 && (
            <button onClick={generateTemplates} disabled={generatingTemplates}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'var(--panel)', color: 'var(--blue)', border: '1px solid var(--line)', opacity: generatingTemplates ? 0.5 : 1 }}>
              <Zap className="w-3.5 h-3.5" />
              {generatingTemplates ? 'Generazione...' : 'Genera template'}
            </button>
          )}
          <button onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'color-mix(in srgb, var(--red2) 12%, transparent)', color: 'var(--red2)', border: '1px solid var(--red2)' }}>
            <Plus className="w-3.5 h-3.5" /> Aggiungi task
          </button>
        </div>
      </div>

      {/* Full form */}
      {showForm && (
        <div className="panel p-5 space-y-4" style={{ border: '1px solid var(--red2)' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {editingTask ? 'Modifica task' : 'Nuovo task'}
            </p>
            <button onClick={resetForm} className="p-1 rounded hover:bg-[var(--line)]">
              <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Titolo *</label>
              <input type="text" value={form.titolo} onChange={e => setForm(p => ({ ...p, titolo: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="es. Conferma venue, Briefing team..." autoFocus />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Descrizione</label>
              <textarea value={form.descrizione} onChange={e => setForm(p => ({ ...p, descrizione: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                rows={2} placeholder="Dettagli..." />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Assegnatario</label>
              <select value={form.assegnatario} onChange={e => setForm(p => ({ ...p, assegnatario: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">-- Seleziona --</option>
                {internalUsers.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Scadenza *</label>
              <input type="date" value={form.scadenza} onChange={e => setForm(p => ({ ...p, scadenza: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Priorita</label>
              <select value={form.priorita} onChange={e => setForm(p => ({ ...p, priorita: e.target.value as Task['priorita'] }))}
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="bassa">Bassa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Fase</label>
              <select value={form.fase} onChange={e => setForm(p => ({ ...p, fase: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">-- Nessuna --</option>
                {TASK_FASI.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Categoria</label>
              <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">-- Nessuna --</option>
                {TASK_CATEGORIE.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Fornitore collegato</label>
              <select value={form.supplier_id} onChange={e => setForm(p => ({ ...p, supplier_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">-- Nessuno --</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 justify-end" style={{ borderTop: '1px solid var(--line)' }}>
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ color: 'var(--muted)' }}>Annulla</button>
            <button onClick={handleSave} disabled={!form.titolo.trim() || !form.scadenza}
              className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40"
              style={{ background: 'var(--red2)' }}>
              {editingTask ? 'Salva' : 'Crea task'}
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{tasks.length === 0 ? 'Nessun task collegato a questo evento' : 'Nessun task in questa categoria'}</p>
          {tasks.length === 0 && <p className="text-xs mt-1">Usa "Genera template" per creare task standard oppure "Aggiungi task"</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const dl = daysLeft(task.scadenza)
            const isOverdue = dl < 0 && task.stato !== 'completato'
            const priColor = task.priorita === 'alta' ? 'var(--red2)' : task.priorita === 'media' ? 'var(--yellow)' : 'var(--muted)'
            const sColor = task.stato === 'completato' ? 'var(--green)' : task.stato === 'in_corso' ? 'var(--blue)' : 'var(--yellow)'
            const statoBg = task.stato === 'completato' ? 'color-mix(in srgb, var(--green) 12%, transparent)' : task.stato === 'in_corso' ? 'color-mix(in srgb, var(--blue) 12%, transparent)' : 'color-mix(in srgb, var(--yellow) 12%, transparent)'
            const supplierName = task.supplier_id ? suppliers.find(s => s.id === task.supplier_id)?.nome : null
            return (
              <div key={task.id} className="panel p-4 flex items-center gap-3">
                <div className="w-1.5 h-12 rounded-full flex-shrink-0" style={{ background: priColor }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{task.titolo}</p>
                    {task.fase && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'var(--panel2)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
                        {task.fase}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                    {task.assegnatario && (
                      <span>{internalUsers.find(u => u.id === task.assegnatario)?.nome || 'Non assegnato'}</span>
                    )}
                    {supplierName && <span>· {supplierName}</span>}
                    {task.categoria && <span>· {task.categoria}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select value={task.stato} onChange={e => handleStatusChange(task.id, e.target.value as Task['stato'])}
                    className="text-xs px-2 py-1 rounded cursor-pointer focus:outline-none"
                    style={{ background: statoBg, color: sColor, border: 'none' }}>
                    <option value="da_fare">Da fare</option>
                    <option value="in_corso">In corso</option>
                    <option value="completato">Completato</option>
                  </select>
                  <span className="text-xs flex items-center gap-1"
                    style={{ color: isOverdue ? 'var(--red2)' : 'var(--muted)' }}>
                    <Clock className="w-3 h-3" />
                    {isOverdue ? `${Math.abs(dl)}gg ritardo` : `${dl}gg`}
                  </span>
                  <button onClick={() => startEdit(task)} className="p-1 rounded hover:bg-[var(--line)]">
                    <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                  </button>
                  <button onClick={() => setDeletingId(task.id)} className="p-1 rounded hover:bg-[var(--line)]">
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingId(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Elimina task</p>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Questa azione non puo essere annullata.</p>
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
