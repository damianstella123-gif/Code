import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckSquare,
  Clock,
  AlertCircle,
  Calendar,
  ChevronRight,
  X,
  Filter,
  Search,
  ArrowRight,
  ArrowLeft,
  User,
  Plus,
  Edit3,
  Trash2,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { loadEventsFromStorage, cacheTasksSnapshot } from '@/lib/storage'
import { fetchTasks, upsertTask, deleteTask as deleteTaskRemote, changeTaskStatus } from '@/lib/tasks-service'
import { fetchAllProfiles } from '@/lib/profiles'
import { daysLeft, fmtShort } from '@/lib/format'
import type { Task } from '@/data/tasks'
import type { Profile } from '@/lib/profiles'

const COLUMNS: { id: Task['stato']; label: string; color: string; bg: string }[] = [
  { id: 'da_fare', label: 'Da Fare', color: 'var(--yellow)', bg: 'rgba(255, 194, 75, 0.06)' },
  { id: 'in_corso', label: 'In Corso', color: 'var(--blue)', bg: 'rgba(77, 180, 255, 0.06)' },
  { id: 'completato', label: 'Completati', color: 'var(--green)', bg: 'rgba(56, 210, 125, 0.06)' },
]

function prioritaColor(p: string) {
  switch (p) {
    case 'alta': return 'var(--red2)'
    case 'media': return 'var(--yellow)'
    case 'bassa': return 'var(--green)'
    default: return 'var(--muted)'
  }
}

function getVisibleTasks(allTasks: Task[], ruolo: string, userId: string): Task[] {
  switch (ruolo) {
    case 'Admin':
    case 'Partner':
    case 'Manager':
      return allTasks
    case 'Finance':
      return allTasks.filter(t => {
        const evt = t.evento ? loadEventsFromStorage().find(e => e.id === t.evento) : null
        return t.assegnatario === userId || (evt && (evt.team.includes(userId) || evt.responsabile === userId))
      })
    case 'Commerciale':
      return allTasks.filter(t => t.assegnatario === userId || t.evento === null)
    case 'Operativo':
    case 'Fornitore':
      return allTasks.filter(t => t.assegnatario === userId)
    default:
      return allTasks.filter(t => t.assegnatario === userId)
  }
}

// ─── Task Form Modal ──────────────────────────────────────────────────────────

function TaskFormModal({ task, onSave, onClose, users }: {
  task?: Task; onSave: (t: Task) => void; onClose: () => void; users: Profile[]
}) {
  const [titolo, setTitolo] = useState(task?.titolo ?? '')
  const [descrizione, setDescrizione] = useState(task?.descrizione ?? '')
  const [assegnatario, setAssegnatario] = useState(task?.assegnatario ?? (loadUser()?.id ?? ''))
  const [evento, setEvento] = useState(task?.evento ?? '')
  const [priorita, setPriorita] = useState<Task['priorita']>(task?.priorita ?? 'media')
  const [stato, setStato] = useState<Task['stato']>(task?.stato ?? 'da_fare')
  const [scadenza, setScadenza] = useState(task?.scadenza ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!titolo.trim() || !scadenza) return
    onSave({
      id: task?.id ?? `tsk_${Date.now()}`,
      titolo: titolo.trim(),
      descrizione: descrizione.trim(),
      assegnatario,
      evento: evento || null,
      priorita,
      stato,
      scadenza,
      creatoIl: task?.creatoIl ?? new Date().toISOString().slice(0, 10),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--line)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
            {task ? 'Modifica task' : 'Nuovo task'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Titolo *</label>
            <input type="text" value={titolo} onChange={e => setTitolo(e.target.value)}
              className="input w-full py-2.5 text-sm rounded-lg" placeholder="Titolo del task" required />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Descrizione</label>
            <textarea value={descrizione} onChange={e => setDescrizione(e.target.value)}
              className="input w-full py-2.5 text-sm rounded-lg resize-none" rows={2} placeholder="Descrizione..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Assegnatario</label>
              <select value={assegnatario} onChange={e => setAssegnatario(e.target.value)}
                className="input w-full py-2.5 text-sm rounded-lg">
                {users.map(u => (
                  <option key={u.id} value={u.first_name + ' ' + u.last_name}>{u.first_name} {u.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Evento</label>
              <select value={evento} onChange={e => setEvento(e.target.value)}
                className="input w-full py-2.5 text-sm rounded-lg">
                <option value="">Nessuno</option>
                {loadEventsFromStorage().map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Priorita</label>
              <select value={priorita} onChange={e => setPriorita(e.target.value as Task['priorita'])}
                className="input w-full py-2.5 text-sm rounded-lg">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Stato</label>
              <select value={stato} onChange={e => setStato(e.target.value as Task['stato'])}
                className="input w-full py-2.5 text-sm rounded-lg">
                <option value="da_fare">Da fare</option>
                <option value="in_corso">In corso</option>
                <option value="completato">Completato</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--muted)' }}>Scadenza *</label>
              <input type="date" value={scadenza} onChange={e => setScadenza(e.target.value)}
                className="input w-full py-2.5 text-sm rounded-lg" required />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm" style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
              Annulla
            </button>
            <button type="submit" className="btn-primary px-5 py-2.5 rounded-xl text-sm">
              {task ? 'Salva' : 'Crea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Task Detail Modal ────────────────────────────────────────────────────────

function TaskDetail({ task, onClose, onMove, onEdit, onDelete }: {
  task: Task; onClose: () => void; onMove: (taskId: string, to: Task['stato']) => void
  onEdit: () => void; onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const evento = task.evento ? loadEventsFromStorage().find(e => e.id === task.evento) : null
  const dl = daysLeft(task.scadenza)
  const isOverdue = dl < 0

  const currentIdx = COLUMNS.findIndex(c => c.id === task.stato)
  const prevCol = currentIdx > 0 ? COLUMNS[currentIdx - 1] : null
  const nextCol = currentIdx < COLUMNS.length - 1 ? COLUMNS[currentIdx + 1] : null
  const currentCol = COLUMNS[currentIdx]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex items-start justify-between gap-3" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-start gap-3 flex-1">
            <div className="w-1.5 rounded-full flex-shrink-0 mt-1" style={{ height: '44px', background: prioritaColor(task.priorita) }} />
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{task.titolo}</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{task.descrizione}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition-all hover:bg-white/10 flex-shrink-0">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Stato</p>
              <span className="text-sm font-semibold px-2 py-0.5 rounded"
                style={{ background: `${currentCol?.color}20`, color: currentCol?.color }}>
                {currentCol?.label}
              </span>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Priorita</p>
              <span className="text-sm font-semibold px-2 py-0.5 rounded capitalize"
                style={{ background: `${prioritaColor(task.priorita)}20`, color: prioritaColor(task.priorita) }}>
                {task.priorita}
              </span>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Scadenza</p>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" style={{ color: isOverdue ? 'var(--red2)' : 'var(--muted)' }} />
                <span className="text-sm font-semibold" style={{ color: isOverdue ? 'var(--red2)' : 'var(--text)' }}>
                  {fmtShort(task.scadenza)}
                </span>
              </div>
              {isOverdue && <p className="text-xs mt-0.5" style={{ color: 'var(--red2)' }}>{Math.abs(dl)}gg scaduto</p>}
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Assegnatario</p>
              {task.assegnatario ? (
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{task.assegnatario}</span>
              ) : <span className="text-sm" style={{ color: 'var(--muted)' }}>—</span>}
            </div>
          </div>

          {evento && (
            <div className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: 'rgba(77,180,255,0.08)', border: '1px solid rgba(77,180,255,0.2)' }}>
              <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--blue)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Evento collegato</p>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{evento.nome}</p>
              </div>
            </div>
          )}

          <div className="pt-1">
            <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Sposta task</p>
            <div className="flex gap-2">
              {prevCol && (
                <button onClick={() => { onMove(task.id, prevCol.id); onClose() }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                  style={{ background: `${prevCol.color}12`, color: prevCol.color, border: `1px solid ${prevCol.color}30` }}>
                  <ArrowLeft className="w-4 h-4" /> {prevCol.label}
                </button>
              )}
              {nextCol && (
                <button onClick={() => { onMove(task.id, nextCol.id); onClose() }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                  style={{ background: `${nextCol.color}12`, color: nextCol.color, border: `1px solid ${nextCol.color}30` }}>
                  {nextCol.label} <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <button onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
              style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
              <Edit3 className="w-3.5 h-3.5" /> Modifica
            </button>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-red-500/10"
                style={{ border: '1px solid rgba(255,49,95,0.2)', color: 'var(--red2)' }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={() => { onDelete(); onClose() }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(255,49,95,0.15)', color: 'var(--red2)', border: '1px solid rgba(255,49,95,0.3)' }}>
                Conferma
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onClick, onQuickMove }: {
  task: Task; onClick: () => void; onQuickMove: (to: Task['stato']) => void
}) {
  const evento = task.evento ? loadEventsFromStorage().find(e => e.id === task.evento) : null
  const dl = daysLeft(task.scadenza)
  const isOverdue = dl < 0 && task.stato !== 'completato'
  const urgentSoon = !isOverdue && dl <= 2 && task.stato !== 'completato'
  const currentIdx = COLUMNS.findIndex(c => c.id === task.stato)
  const nextCol = currentIdx < COLUMNS.length - 1 ? COLUMNS[currentIdx + 1] : null

  return (
    <div className="rounded-xl p-4 cursor-pointer transition-all group"
      style={{ background: 'var(--panel)', border: `1px solid ${isOverdue ? 'rgba(255,49,95,0.3)' : 'var(--line)'}` }}
      onClick={onClick}>
      <div className="flex items-start gap-2 mb-2.5">
        <div className="w-1 rounded-full mt-1 flex-shrink-0" style={{ height: '14px', background: prioritaColor(task.priorita) }} />
        <p className="text-sm font-semibold leading-snug flex-1" style={{ color: 'var(--text)' }}>{task.titolo}</p>
      </div>
      <p className="text-xs mb-3 line-clamp-2 ml-3" style={{ color: 'var(--muted)' }}>{task.descrizione}</p>
      {evento && (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg mb-3 ml-3" style={{ background: 'rgba(77,180,255,0.1)' }}>
          <Calendar className="w-3 h-3" style={{ color: 'var(--blue)' }} />
          <span className="text-xs truncate max-w-[150px]" style={{ color: 'var(--blue)' }}>{evento.nome}</span>
        </div>
      )}
      <div className="flex items-center justify-between pt-2.5 ml-3" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="flex items-center gap-1.5">
          {isOverdue ? <AlertCircle className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
            : urgentSoon ? <Clock className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
            : <Clock className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />}
          <span className="text-xs font-medium"
            style={{ color: isOverdue ? 'var(--red2)' : urgentSoon ? 'var(--yellow)' : 'var(--muted)' }}>
            {isOverdue ? `${Math.abs(dl)}gg fa` : dl === 0 ? 'Oggi' : fmtShort(task.scadenza)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {nextCol && (
            <button onClick={e => { e.stopPropagation(); onQuickMove(nextCol.id) }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all hover:bg-white/10"
              title={`Sposta in "${nextCol.label}"`}>
              <ChevronRight className="w-3.5 h-3.5" style={{ color: nextCol.color }} />
            </button>
          )}
          {task.assegnatario ? (
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-semibold" style={{ background: 'var(--panel2)', color: 'var(--text)' }} title={task.assegnatario}>
              {task.assegnatario.charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--panel2)' }}>
              <User className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TaskPage() {
  const currentUser = loadUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const [taskList, setTaskList] = useState<Task[]>([])
  const [selected, setSelected] = useState<Task | null>(null)
  const [search, setSearch] = useState('')
  const [filterPriorita, setFilterPriorita] = useState('Tutte')
  const [filterAssegnatario, setFilterAssegnatario] = useState('Tutti')
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined)
  const [allUsers, setAllUsers] = useState<Profile[]>([])

  // Task: fonte di verita' Supabase. Nessun fallback mock.
  // La snapshot in localStorage resta solo per gli altri moduli che la leggono.
  useEffect(() => {
    let cancelled = false
    fetchTasks().then(remote => {
      if (cancelled) return
      setTaskList(remote)
      cacheTasksSnapshot(remote)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Load users from Supabase
  useEffect(() => {
    let cancelled = false
    fetchAllProfiles().then(profiles => {
      if (cancelled) return
      setAllUsers(profiles)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const targetId = searchParams.get('id')
    if (!targetId || taskList.length === 0) return
    const found = taskList.find(t => t.id === targetId)
    if (found) {
      setSelected(found)
      setSearchParams({}, { replace: true })
    }
  }, [taskList, searchParams, setSearchParams])

  const visibleTasks = useMemo(() => {
    if (!currentUser) return []
    return getVisibleTasks(taskList, currentUser.ruolo, currentUser.id)
  }, [taskList, currentUser])

  const filtered = useMemo(() => {
    return visibleTasks.filter(t => {
      const matchSearch = search === '' || t.titolo.toLowerCase().includes(search.toLowerCase()) || t.descrizione.toLowerCase().includes(search.toLowerCase())
      const matchPriorita = filterPriorita === 'Tutte' || t.priorita === filterPriorita
      const matchAssegnatario = filterAssegnatario === 'Tutti' || t.assegnatario === filterAssegnatario
      return matchSearch && matchPriorita && matchAssegnatario
    })
  }, [visibleTasks, search, filterPriorita, filterAssegnatario])

  const moveTask = useCallback(async (taskId: string, to: Task['stato']) => {
    setTaskList(prev => {
      const updated = prev.map(t => t.id === taskId ? { ...t, stato: to } : t)
      cacheTasksSnapshot(updated)
      return updated
    })
    await changeTaskStatus(taskId, to)
  }, [])

  const saveTask = useCallback(async (task: Task) => {
    const saved = await upsertTask(task)
    const finalTask = saved ?? task
    setTaskList(prev => {
      const exists = prev.find(t => t.id === finalTask.id)
      const updated = exists
        ? prev.map(t => (t.id === finalTask.id ? finalTask : t))
        : [finalTask, ...prev]
      cacheTasksSnapshot(updated)
      return updated
    })
    setShowForm(false)
    setEditingTask(undefined)
  }, [])

  const deleteTask = useCallback(async (taskId: string) => {
    await deleteTaskRemote(taskId)
    setTaskList(prev => {
      const updated = prev.filter(t => t.id !== taskId)
      cacheTasksSnapshot(updated)
      return updated
    })
    setSelected(null)
  }, [])

  const columns = COLUMNS.map(col => ({ ...col, tasks: filtered.filter(t => t.stato === col.id) }))
  const overdueCount = visibleTasks.filter(t => daysLeft(t.scadenza) < 0 && t.stato !== 'completato').length
  const teamMembers = useMemo(() => {
    const names = [...new Set(visibleTasks.map(t => t.assegnatario).filter(Boolean))]
    return names
  }, [visibleTasks])

  const selectedCurrent = selected ? (taskList.find(t => t.id === selected.id) ?? selected) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Task</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            {filtered.length} task visibili
            {overdueCount > 0 && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,49,95,0.15)', color: 'var(--red2)' }}>
                {overdueCount} scaduti
              </span>
            )}
          </p>
        </div>
        <button onClick={() => { setEditingTask(undefined); setShowForm(true) }}
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl">
          <Plus className="w-4 h-4" /> Nuovo task
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {columns.map(col => (
          <div key={col.id} className="panel p-4 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: col.color }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{col.label}</p>
              <p className="text-2xl font-bold" style={{ color: col.color }}>{col.tasks.length}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl flex-1 min-w-[180px]"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input type="text" placeholder="Cerca task..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none" style={{ color: 'var(--text)' }} />
          {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} /></button>}
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <Filter className="w-4 h-4 mx-1" style={{ color: 'var(--muted)' }} />
          {(['Tutte', 'alta', 'media', 'bassa'] as const).map(p => (
            <button key={p} onClick={() => setFilterPriorita(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
              style={{
                background: filterPriorita === p ? `${p === 'Tutte' ? 'rgba(255,255,255,0.08)' : `${prioritaColor(p)}15`}` : 'transparent',
                color: filterPriorita === p ? (p === 'Tutte' ? 'var(--text)' : prioritaColor(p)) : 'var(--muted)',
              }}>
              {p}
            </button>
          ))}
        </div>
        <select value={filterAssegnatario} onChange={e => setFilterAssegnatario(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm focus:outline-none cursor-pointer"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <option value="Tutti">Tutti i membri</option>
          {teamMembers.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map(col => (
          <div key={col.id} className="flex flex-col rounded-2xl overflow-hidden"
            style={{ background: col.bg, border: `1px solid ${col.color}22`, minHeight: '400px' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${col.color}22` }}>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                <span className="font-semibold text-sm" style={{ color: col.color }}>{col.label}</span>
              </div>
              <span className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: `${col.color}18`, color: col.color }}>
                {col.tasks.length}
              </span>
            </div>
            <div className="flex-1 p-3 space-y-3">
              {col.tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed"
                  style={{ borderColor: `${col.color}18` }}>
                  <CheckSquare className="w-8 h-8 mb-2 opacity-20" style={{ color: col.color }} />
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Nessun task</p>
                </div>
              ) : col.tasks.map((task, i) => (
                <div key={task.id} className="animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                  <TaskCard task={task} onClick={() => setSelected(task)} onQuickMove={to => moveTask(task.id, to)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedCurrent && (
        <TaskDetail task={selectedCurrent} onClose={() => setSelected(null)} onMove={moveTask}
          onEdit={() => { setEditingTask(selectedCurrent); setSelected(null); setShowForm(true) }}
          onDelete={() => deleteTask(selectedCurrent.id)} />
      )}

      {showForm && (
        <TaskFormModal task={editingTask} onSave={saveTask} onClose={() => { setShowForm(false); setEditingTask(undefined) }} users={allUsers} />
      )}
    </div>
  )
}
