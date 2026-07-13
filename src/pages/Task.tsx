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
  Calendar,
  ArrowLeft,
  ArrowRight,
  FileText,
  Briefcase,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { cacheTasksSnapshot } from '@/lib/storage'
import { fetchTasks, upsertTask, deleteTask as deleteTaskRemote, changeTaskStatus } from '@/lib/tasks-service'
import { fetchEvents } from '@/lib/events-service'
import { fetchAllProfiles } from '@/lib/profiles'
import { useRealtimeTable } from '@/lib/use-realtime'
import { daysLeft, toISO, fmtLong } from '@/lib/format'
import { supabase } from '@/lib/supabase'
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

const CATEGORIE = ['Amministrativo', 'Creativo', 'Logistico', 'Commerciale', 'Operativo', 'Altro'] as const

function categoriaColor(c: string | null | undefined) {
  switch (c) {
    case 'Amministrativo': return 'var(--blue)'
    case 'Creativo': return 'var(--yellow)'
    case 'Logistico': return 'var(--green)'
    case 'Commerciale': return 'var(--red2)'
    case 'Operativo': return 'var(--muted)'
    case 'Altro': return 'var(--muted)'
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
    case 'Amministrazione':
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
  const [categoria, setCategoria] = useState(task?.categoria ?? '')

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
      creatoIl: task?.creatoIl ?? toISO(new Date()),
      categoria: categoria || null,
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}
                className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">Nessuna</option>
                {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
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
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [taskList, setTaskList] = useState<Task[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filterStato, setFilterStato] = useState('Tutti')
  const [filterPriorita, setFilterPriorita] = useState('Tutte')
  const [filterAssegnatario, setFilterAssegnatario] = useState('Tutti')
  const [filterCategoria, setFilterCategoria] = useState('Tutte')
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [allUsers, setAllUsers] = useState<Profile[]>([])
  const [allEvents, setAllEvents] = useState<{ id: string; nome: string }[]>([])

  useEffect(() => {
    let cancelled = false
    fetchTasks().then(remote => {
      if (cancelled) return
      setTaskList(remote)
      cacheTasksSnapshot(remote)
      setInitialLoading(false)
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
      setSelectedTaskId(found.id)
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
      const matchCategoria = filterCategoria === 'Tutte' || t.categoria === filterCategoria
      return matchSearch && matchPriorita && matchAssegnatario && matchStato && matchCategoria
    })
  }, [visibleTasks, search, filterPriorita, filterAssegnatario, filterStato, filterCategoria])

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
    if (to === 'completato') {
      setCompletingIds(prev => new Set(prev).add(taskId))
      showToast('Task completato', 'success')
    }
    setTaskList(prev => {
      const updated = prev.map(t => t.id === taskId ? { ...t, stato: to } : t)
      cacheTasksSnapshot(updated)
      return updated
    })
    await changeTaskStatus(taskId, to)
  }, [showToast])

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

  const selectedTask = selectedTaskId ? taskList.find(t => t.id === selectedTaskId) ?? null : null

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
          <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase',
              background: 'none', border: 'none', color: filterCategoria !== 'Tutte' ? categoriaColor(filterCategoria) : 'var(--muted)', cursor: 'pointer',
              letterSpacing: '0.04em',
            }}>
            <option value="Tutte">CATEGORIA</option>
            {CATEGORIE.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', padding: '4px 10px', border: '1px solid var(--line)', background: 'var(--panel)' }}>
          <Search className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
          <input type="text" placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: 'none', border: 'none', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)', width: '100px' }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X className="w-3 h-3" style={{ color: 'var(--muted)' }} /></button>}
          {!search && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Usa Fly ↑ per domande complesse</span>}
        </div>
      </div>

      {/* Task List */}
      <div style={{ marginTop: '8px' }}>
        {initialLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ borderRadius: 14, border: '1px solid var(--line)', padding: 16, background: 'var(--panel)' }}>
                {[80, 60, 40].map((w, j) => (
                  <div key={j} style={{ height: 12, width: `${w}%`, background: 'var(--line)', borderRadius: 6, marginBottom: 8, animation: 'shimmer 1.5s infinite' }} />
                ))}
              </div>
            ))}
          </div>
        ) : sorted.open.length === 0 && sorted.done.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.7 }}>
            Niente da fare &mdash; o e un gran giorno<br/>o e il momento di pianificare il prossimo evento
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
                onRowClick={() => setSelectedTaskId(task.id)}
                onNavigateEvent={evtId => navigate(`/eventi?id=${evtId}`)}
                isCompleting={completingIds.has(task.id)}
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
                    onRowClick={() => setSelectedTaskId(task.id)}
                    onNavigateEvent={evtId => navigate(`/eventi?id=${evtId}`)}
                    isCompleting={false}
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

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          events={allEvents}
          getInitials={getProfileInitials}
          getFullName={getProfileName}
          onClose={() => setSelectedTaskId(null)}
          onEdit={() => { setEditingTask(selectedTask); setSelectedTaskId(null); setShowForm(true) }}
          onDelete={() => { deleteTask(selectedTask.id); setSelectedTaskId(null) }}
          onStatusChange={(to) => moveTask(selectedTask.id, to)}
          onNavigateEvent={evtId => navigate(`/eventi?id=${evtId}`)}
        />
      )}
    </div>
  )
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, index, events, getInitials, getFullName, onCycleStatus, onRowClick, onNavigateEvent, isCompleting }: {
  task: Task
  index: number
  events: { id: string; nome: string }[]
  getInitials: (id: string) => string
  getFullName: (id: string) => string
  onCycleStatus: () => void
  onRowClick: () => void
  onNavigateEvent: (evtId: string) => void
  isCompleting: boolean
}) {
  const evento = task.evento ? events.find(e => e.id === task.evento) : null
  const dl = deadlineLabel(task.scadenza, task.stato)
  const isCompleted = task.stato === 'completato'
  const code = `Q${String(index + 1).padStart(2, '0')}`

  return (
    <div
      className={`wire-card-flat animate-fade-in${isCompleting ? ' task-completing' : ''}`}
      onClick={onRowClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 4px',
        borderBottom: '1px solid var(--line)',
        opacity: isCompleted ? 0.55 : 1,
        cursor: 'pointer',
        transition: 'opacity 0.15s ease, background 0.12s ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--panel)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      {/* Status toggle - 44px touch target */}
      <button
        onClick={e => { e.stopPropagation(); onCycleStatus() }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <p className="task-title" style={{
            fontFamily: 'var(--font-serif)', fontSize: '15px', fontWeight: 500,
            color: 'var(--text)', lineHeight: 1.3, margin: 0,
            textDecoration: isCompleted ? 'line-through' : 'none',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {task.titolo}
          </p>
          {task.categoria && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.04em',
              padding: '2px 6px', borderRadius: '4px', flexShrink: 0,
              color: categoriaColor(task.categoria),
              background: `color-mix(in srgb, ${categoriaColor(task.categoria)} 12%, transparent)`,
            }}>
              {task.categoria}
            </span>
          )}
        </div>
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
    </div>
  )
}

// ─── Task Detail Panel ────────────────────────────────────────────────────────

function TaskDetailPanel({ task, events, getInitials, getFullName, onClose, onEdit, onDelete, onStatusChange, onNavigateEvent }: {
  task: Task
  events: { id: string; nome: string }[]
  getInitials: (id: string) => string
  getFullName: (id: string) => string
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (to: Task['stato']) => void
  onNavigateEvent: (evtId: string) => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  const [linkedDocs, setLinkedDocs] = useState<{ id: string; nome: string }[]>([])
  const [linkedPratiche, setLinkedPratiche] = useState<{ id: string; titolo: string }[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    supabase.from('documents').select('id, nome').eq('task_id', task.id).then(({ data }) => setLinkedDocs(data ?? []))
    supabase.from('dossiers').select('id, titolo').eq('task_id', task.id).then(({ data }) => setLinkedPratiche(data ?? []))
  }, [task.id])

  const evento = task.evento ? events.find(e => e.id === task.evento) : null
  const dl = daysLeft(task.scadenza)
  const isOverdue = dl < 0 && task.stato !== 'completato'
  const statiSeq: Task['stato'][] = ['da_fare', 'in_corso', 'completato']
  const currentIdx = statiSeq.indexOf(task.stato)
  const prevStato = currentIdx > 0 ? statiSeq[currentIdx - 1] : null
  const nextStato = currentIdx < statiSeq.length - 1 ? statiSeq[currentIdx + 1] : null

  function statoLbl(s: Task['stato']) {
    switch (s) { case 'da_fare': return 'DA FARE'; case 'in_corso': return 'IN CORSO'; case 'completato': return 'COMPLETATO' }
  }

  function statoClr(s: Task['stato']) {
    switch (s) { case 'da_fare': return 'var(--yellow)'; case 'in_corso': return 'var(--blue)'; case 'completato': return 'var(--green)' }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.2s ease',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 51,
        width: '420px', maxWidth: '100vw',
        background: 'var(--panel-solid)',
        borderLeft: '1px solid var(--line)',
        overflowY: 'auto',
        animation: 'slideInRight 0.25s ease',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                padding: '3px 8px', borderRadius: '4px',
                color: statoClr(task.stato),
                background: `color-mix(in srgb, ${statoClr(task.stato)} 12%, transparent)`,
              }}>
                {statoLbl(task.stato)}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                padding: '3px 8px', borderRadius: '4px',
                color: prioritaColor(task.priorita),
                background: `color-mix(in srgb, ${prioritaColor(task.priorita)} 12%, transparent)`,
              }}>
                {task.priorita}
              </span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, margin: 0 }}>
            {task.titolo}
          </h2>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '20px 24px' }}>
          {task.descrizione && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '6px' }}>DESCRIZIONE</p>
              <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{task.descrizione}</p>
            </div>
          )}

          {evento && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '6px' }}>EVENTO COLLEGATO</p>
              <button
                onClick={() => onNavigateEvent(evento.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', borderRadius: '8px',
                  background: 'color-mix(in srgb, var(--blue) 8%, transparent)',
                  border: '1px solid var(--blue)',
                  cursor: 'pointer', color: 'var(--blue)',
                  fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500,
                }}
              >
                <Calendar className="w-3.5 h-3.5" />
                {evento.nome}
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '6px' }}>ASSEGNATARIO</p>
              {task.assegnatario ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%',
                    background: 'var(--panel2)', border: '1px solid var(--line)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700, color: 'var(--text)',
                  }}>
                    {getInitials(task.assegnatario)}
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--text)' }}>{getFullName(task.assegnatario)}</span>
                </div>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>&mdash;</span>
              )}
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '6px' }}>SCADENZA</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar className="w-3.5 h-3.5" style={{ color: isOverdue ? 'var(--red2)' : 'var(--muted)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: isOverdue ? 'var(--red2)' : 'var(--text)' }}>
                  {fmtLong(task.scadenza)}
                </span>
              </div>
              {isOverdue && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--red2)', marginTop: '2px' }}>{Math.abs(dl)} giorni in ritardo</p>}
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '6px' }}>CREATO IL</p>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text)' }}>
                {task.creatoIl ? fmtLong(task.creatoIl) : '\u2014'}
              </span>
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '6px' }}>PRIORITA</p>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: prioritaColor(task.priorita), textTransform: 'capitalize' }}>
                {task.priorita}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>CAMBIA STATO</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {prevStato && (
                <button onClick={() => onStatusChange(prevStato)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '8px 12px', borderRadius: '8px', border: `1px solid ${statoClr(prevStato)}`,
                    background: `color-mix(in srgb, ${statoClr(prevStato)} 8%, transparent)`,
                    cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
                    color: statoClr(prevStato),
                  }}>
                  <ArrowLeft className="w-3 h-3" /> {statoLbl(prevStato)}
                </button>
              )}
              {nextStato && (
                <button onClick={() => onStatusChange(nextStato)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '8px 12px', borderRadius: '8px', border: `1px solid ${statoClr(nextStato)}`,
                    background: `color-mix(in srgb, ${statoClr(nextStato)} 8%, transparent)`,
                    cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600,
                    color: statoClr(nextStato),
                  }}>
                  {statoLbl(nextStato)} <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>DOCUMENTI E PRATICHE COLLEGATI</p>
            {linkedDocs.length === 0 && linkedPratiche.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--muted)' }}>Nessun documento o pratica collegata</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {linkedDocs.map(doc => (
                  <button key={doc.id} onClick={() => navigate('/dossier')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)',
                      background: 'var(--panel2)', cursor: 'pointer', textAlign: 'left',
                    }}>
                    <FileText className="w-3.5 h-3.5" style={{ color: 'var(--blue)', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.nome}</span>
                  </button>
                ))}
                {linkedPratiche.map(p => (
                  <button key={p.id} onClick={() => navigate(`/dossier?id=${p.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)',
                      background: 'var(--panel2)', cursor: 'pointer', textAlign: 'left',
                    }}>
                    <Briefcase className="w-3.5 h-3.5" style={{ color: 'var(--green)', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titolo}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line)', display: 'flex', gap: '8px' }}>
          <button onClick={onEdit}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '10px', borderRadius: '8px', border: '1px solid var(--line)',
              background: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: 'var(--text)',
            }}>
            <Edit3 className="w-3.5 h-3.5" /> MODIFICA
          </button>
          {!confirmDel ? (
            <button onClick={() => setConfirmDel(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--red2)',
                background: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: 'var(--red2)',
              }}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={onDelete}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '10px 16px', borderRadius: '8px', border: 'none',
                background: 'var(--red2)', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#fff',
              }}>
              CONFERMA
            </button>
          )}
        </div>
      </div>
    </>
  )
}
