import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  X,
  Search,
  Plus,
  Edit3,
  Trash2,
  Circle,
  CircleDot,
  CheckCircle2,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { cacheTasksSnapshot } from '@/lib/storage'
import { fetchTasks, upsertTask, deleteTask as deleteTaskRemote, changeTaskStatus } from '@/lib/tasks-service'
import { fetchEvents } from '@/lib/events-service'
import { fetchAllProfiles } from '@/lib/profiles'
import { useRealtimeTable } from '@/lib/use-realtime'
import { daysLeft } from '@/lib/format'
import type { Task } from '@/data/tasks'
import type { Profile } from '@/lib/profiles'

function prioritaColor(p: string) {
  switch (p) {
    case 'alta': return 'var(--red2)'
    case 'media': return 'var(--yellow)'
    case 'bassa': return 'var(--muted)'
    default: return 'var(--muted)'
  }
}

function getVisibleTasks(allTasks: Task[], ruolo: string, userId: string, eventsList: { id: string; nome: string; team?: string[]; responsabile?: string }[]): Task[] {
  switch (ruolo) {
    case 'Admin':
    case 'Partner':
    case 'Manager':
      return allTasks
    case 'Finance':
      return allTasks.filter(t => {
        const evt = t.evento ? eventsList.find(e => e.id === t.evento) : null
        return t.assegnatario === userId || (evt && ((evt as any).team?.includes(userId) || (evt as any).responsabile === userId))
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

function deadlineLabel(scadenza: string, stato: string): { text: string; color: string } {
  const dl = daysLeft(scadenza)
  if (stato === 'completato') return { text: '\u2713', color: 'var(--green)' }
  if (dl < 0) return { text: `\u2212${Math.abs(dl)}g`, color: 'var(--red2)' }
  if (dl === 0) return { text: 'OGGI', color: 'var(--red2)' }
  if (dl === 1) return { text: 'DOMANI', color: 'var(--yellow)' }
  return { text: `${dl}g`, color: 'var(--muted)' }
}

// ─── Task Form Modal ──────────────────────────────────────────────────────────

function TaskFormModal({ task, onSave, onClose, users, events }: {
  task?: Task; onSave: (t: Task) => void; onClose: () => void; users: Profile[]; events: { id: string; nome: string }[]
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
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--line)' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
            {task ? 'Modifica task' : 'Nuovo task'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Titolo *</label>
            <input type="text" value={titolo} onChange={e => setTitolo(e.target.value)}
              className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              placeholder="Titolo del task" required />
          </div>
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Descrizione</label>
            <textarea value={descrizione} onChange={e => setDescrizione(e.target.value)}
              className="w-full py-2.5 px-3 text-sm rounded-lg resize-none focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              rows={2} placeholder="Descrizione..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Assegnatario</label>
              <select value={assegnatario} onChange={e => setAssegnatario(e.target.value)}
                className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">Nessuno</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Evento</label>
              <select value={evento} onChange={e => setEvento(e.target.value)}
                className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">Nessuno</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Priorita</label>
              <select value={priorita} onChange={e => setPriorita(e.target.value as Task['priorita'])}
                className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </select>
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Stato</label>
              <select value={stato} onChange={e => setStato(e.target.value as Task['stato'])}
                className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="da_fare">Da fare</option>
                <option value="in_corso">In corso</option>
                <option value="completato">Completato</option>
              </select>
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Scadenza *</label>
              <input type="date" value={scadenza} onChange={e => setScadenza(e.target.value)}
                className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                required />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="button" onClick={onClose}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--line)', background: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
              Annulla
            </button>
            <button type="submit"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--red2)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              {task ? 'SALVA' : 'CREA'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TaskPage() {
  const currentUser = loadUser()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [taskList, setTaskList] = useState<Task[]>([])
  const [search, setSearch] = useState('')
  const [filterStato, setFilterStato] = useState('Tutti')
  const [filterPriorita, setFilterPriorita] = useState('Tutte')
  const [filterAssegnatario, setFilterAssegnatario] = useState('Tutti')
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined)
  const [allUsers, setAllUsers] = useState<Profile[]>([])
  const [allEvents, setAllEvents] = useState<{ id: string; nome: string }[]>([])

  useEffect(() => {
    let cancelled = false
    fetchTasks().then(remote => {
      if (cancelled) return
      setTaskList(remote)
      cacheTasksSnapshot(remote)
    })
    return () => { cancelled = true }
  }, [])

  useRealtimeTable('tasks', () => {
    fetchTasks().then(remote => { setTaskList(remote); cacheTasksSnapshot(remote) })
  })

  useEffect(() => {
    let cancelled = false
    fetchAllProfiles().then(profiles => { if (!cancelled) setAllUsers(profiles) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchEvents().then(evts => { if (!cancelled) setAllEvents(evts.map(e => ({ id: e.id, nome: e.nome }))) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const targetId = searchParams.get('id')
    if (!targetId || taskList.length === 0) return
    const found = taskList.find(t => t.id === targetId)
    if (found) {
      setEditingTask(found)
      setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [taskList, searchParams, setSearchParams])

  const visibleTasks = useMemo(() => {
    if (!currentUser) return []
    return getVisibleTasks(taskList, currentUser.ruolo, currentUser.id, allEvents)
  }, [taskList, currentUser, allEvents])

  const filtered = useMemo(() => {
    return visibleTasks.filter(t => {
      const matchSearch = search === '' || t.titolo.toLowerCase().includes(search.toLowerCase()) || t.descrizione.toLowerCase().includes(search.toLowerCase())
      const matchPriorita = filterPriorita === 'Tutte' || t.priorita === filterPriorita
      const matchAssegnatario = filterAssegnatario === 'Tutti' || t.assegnatario === filterAssegnatario
      const matchStato = filterStato === 'Tutti' || t.stato === filterStato
      return matchSearch && matchPriorita && matchAssegnatario && matchStato
    })
  }, [visibleTasks, search, filterPriorita, filterAssegnatario, filterStato])

  const sorted = useMemo(() => {
    const open = filtered.filter(t => t.stato !== 'completato')
    const done = filtered.filter(t => t.stato === 'completato')
    open.sort((a, b) => {
      const dlA = daysLeft(a.scadenza)
      const dlB = daysLeft(b.scadenza)
      const overdueA = dlA < 0 ? 1 : 0
      const overdueB = dlB < 0 ? 1 : 0
      if (overdueA !== overdueB) return overdueB - overdueA
      return dlA - dlB
    })
    return { open, done }
  }, [filtered])

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
  }, [])

  const overdueCount = visibleTasks.filter(t => daysLeft(t.scadenza) < 0 && t.stato !== 'completato').length
  const openCount = visibleTasks.filter(t => t.stato !== 'completato').length
  const completedThisWeek = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    return visibleTasks.filter(t => t.stato === 'completato' && new Date(t.scadenza) >= weekAgo).length
  }, [visibleTasks])
  const highPriCount = visibleTasks.filter(t => t.priorita === 'alta' && t.stato !== 'completato').length

  const teamMembers = useMemo(() => {
    const ids = [...new Set(visibleTasks.map(t => t.assegnatario).filter(Boolean))]
    return ids
  }, [visibleTasks])

  function getProfileInitials(userId: string): string {
    const p = allUsers.find(u => u.id === userId)
    if (p) return `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase()
    return userId.slice(0, 2).toUpperCase()
  }

  function getProfileName(userId: string): string {
    const p = allUsers.find(u => u.id === userId)
    if (p) return `${p.first_name} ${p.last_name}`.trim()
    return userId
  }

  function cycleStatus(task: Task) {
    const seq: Task['stato'][] = ['da_fare', 'in_corso', 'completato']
    const idx = seq.indexOf(task.stato)
    const next = seq[(idx + 1) % seq.length]
    moveTask(task.id, next)
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Masthead */}
      <div className="wire-masthead">
        <span className="wire-masthead-title">TASK — {openCount} APERTI</span>
        <button onClick={() => { setEditingTask(undefined); setShowForm(true) }}
          className="wire-theme-toggle" style={{ borderRadius: '8px' }}>
          <Plus className="w-3.5 h-3.5" style={{ color: 'var(--text)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)' }}>Nuovo task</span>
        </button>
      </div>

      {/* Ticker */}
      <div className="wire-ticker">
        <span><strong>{openCount}</strong> aperti</span>
        <span style={{ color: overdueCount > 0 ? 'var(--red2)' : undefined }}>
          <strong style={{ color: overdueCount > 0 ? 'var(--red2)' : undefined }}>{overdueCount}</strong> in ritardo
        </span>
        <span><strong>{completedThisWeek}</strong> completati (7gg)</span>
        <span><strong>{highPriCount}</strong> alta priorita</span>
      </div>

      {/* Wire tabs: filters */}
      <div className="wire-tabs" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto' }}>
          {(['Tutti', 'da_fare', 'in_corso', 'completato'] as const).map(s => (
            <button key={s}
              className={`wire-tab ${filterStato === s ? 'wire-tab--active' : ''}`}
              onClick={() => setFilterStato(s)}>
              {s === 'Tutti' ? 'TUTTI' : s === 'da_fare' ? 'DA FARE' : s === 'in_corso' ? 'IN CORSO' : 'COMPLETATI'}
            </button>
          ))}
          {(['Tutte', 'alta', 'media', 'bassa'] as const).map(p => (
            <button key={p}
              className={`wire-tab ${filterPriorita === p ? 'wire-tab--active' : ''}`}
              onClick={() => setFilterPriorita(p)}
              style={{ color: filterPriorita === p && p !== 'Tutte' ? prioritaColor(p) : undefined }}>
              {p === 'Tutte' ? 'TUTTE' : p.toUpperCase()}
            </button>
          ))}
          <select value={filterAssegnatario} onChange={e => setFilterAssegnatario(e.target.value)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase',
              background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
              letterSpacing: '0.04em',
            }}>
            <option value="Tutti">ASSEGNATARIO</option>
            {teamMembers.map(id => <option key={id} value={id}>{getProfileName(id)}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', padding: '4px 10px', border: '1px solid var(--line)', background: 'var(--panel)' }}>
          <Search className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
          <input type="text" placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: 'none', border: 'none', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)', width: '100px' }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X className="w-3 h-3" style={{ color: 'var(--muted)' }} /></button>}
        </div>
      </div>

      {/* Task List */}
      <div style={{ marginTop: '8px' }}>
        {sorted.open.length === 0 && sorted.done.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)', fontSize: '13px' }}>
            Nessun task trovato.
          </div>
        ) : (
          <>
            {sorted.open.map((task, i) => (
              <TaskRow
                key={task.id}
                task={task}
                index={i}
                events={allEvents}
                getInitials={getProfileInitials}
                getFullName={getProfileName}
                onCycleStatus={() => cycleStatus(task)}
                onEdit={() => { setEditingTask(task); setShowForm(true) }}
                onDelete={() => deleteTask(task.id)}
                onNavigateEvent={evtId => navigate(`/eventi?id=${evtId}`)}
              />
            ))}
            {sorted.done.length > 0 && (
              <>
                <div style={{
                  margin: '20px 0 8px', padding: '6px 0',
                  borderTop: '1px solid var(--line)',
                  fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)',
                }}>
                  COMPLETATI ({sorted.done.length})
                </div>
                {sorted.done.map((task, i) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    index={sorted.open.length + i}
                    events={allEvents}
                    getInitials={getProfileInitials}
                    getFullName={getProfileName}
                    onCycleStatus={() => cycleStatus(task)}
                    onEdit={() => { setEditingTask(task); setShowForm(true) }}
                    onDelete={() => deleteTask(task.id)}
                    onNavigateEvent={evtId => navigate(`/eventi?id=${evtId}`)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {showForm && (
        <TaskFormModal task={editingTask} onSave={saveTask} onClose={() => { setShowForm(false); setEditingTask(undefined) }} users={allUsers} events={allEvents} />
      )}
    </div>
  )
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, index, events, getInitials, getFullName, onCycleStatus, onEdit, onDelete, onNavigateEvent }: {
  task: Task
  index: number
  events: { id: string; nome: string }[]
  getInitials: (id: string) => string
  getFullName: (id: string) => string
  onCycleStatus: () => void
  onEdit: () => void
  onDelete: () => void
  onNavigateEvent: (evtId: string) => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  const evento = task.evento ? events.find(e => e.id === task.evento) : null
  const dl = deadlineLabel(task.scadenza, task.stato)
  const isCompleted = task.stato === 'completato'
  const code = `Q${String(index + 1).padStart(2, '0')}`

  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 4px',
        borderBottom: '1px solid var(--line)',
        opacity: isCompleted ? 0.55 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* Status toggle - 44px touch target */}
      <button
        onClick={onCycleStatus}
        style={{
          width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
          borderRadius: '50%',
        }}
        title={task.stato === 'da_fare' ? 'Segna in corso' : task.stato === 'in_corso' ? 'Segna completato' : 'Riporta a da fare'}
      >
        {task.stato === 'completato' && <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--green)' }} />}
        {task.stato === 'in_corso' && <CircleDot className="w-5 h-5" style={{ color: 'var(--blue)' }} />}
        {task.stato === 'da_fare' && <Circle className="w-5 h-5" style={{ color: 'var(--muted)' }} />}
      </button>

      {/* Code */}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700,
        color: prioritaColor(task.priorita), flexShrink: 0, width: '32px',
      }}>
        {code}
      </span>

      {/* Title + event label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: 'var(--font-serif)', fontSize: '15px', fontWeight: 500,
          color: 'var(--text)', lineHeight: 1.3, margin: 0,
          textDecoration: isCompleted ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {task.titolo}
        </p>
        {evento && (
          <button
            onClick={e => { e.stopPropagation(); onNavigateEvent(evento.id) }}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.03em',
              color: 'var(--blue)', background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, marginTop: '2px',
              textDecoration: 'none',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'underline' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'none' }}
          >
            {evento.nome}
          </button>
        )}
      </div>

      {/* Assignee avatar */}
      {task.assegnatario ? (
        <div title={getFullName(task.assegnatario)} style={{
          width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
          background: 'var(--panel2)', border: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text)',
        }}>
          {getInitials(task.assegnatario)}
        </div>
      ) : (
        <div style={{ width: '24px', height: '24px', flexShrink: 0 }} />
      )}

      {/* Deadline */}
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600,
        color: dl.color, flexShrink: 0, width: '50px', textAlign: 'right',
      }}>
        {dl.text}
      </span>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
        <button onClick={onEdit}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--muted)', transition: 'color 0.12s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--red2)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}>
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--muted)', transition: 'color 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--red2)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button onClick={() => { onDelete(); setConfirmDel(false) }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--red2)', fontWeight: 700 }}>
            OK
          </button>
        )}
      </div>
    </div>
  )
}
