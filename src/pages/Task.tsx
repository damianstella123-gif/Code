import { useState, useMemo, useCallback } from 'react'
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
} from 'lucide-react'
import { users } from '@/data/users'
import { events } from '@/data/events'
import { loadUser } from '@/lib/auth'
import { loadTasksFromStorage, STORAGE_KEYS } from '@/lib/storage'
import { daysLeft, fmtShort } from '@/lib/format'
import type { Task } from '@/data/tasks'

function saveTasks(list: Task[]): void {
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(list))
}

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
    case 'Manager':
      return allTasks
    case 'Finance':
      return allTasks.filter(t => {
        const evt = t.evento ? events.find(e => e.id === t.evento) : null
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

interface TaskDetailProps {
  task: Task
  onClose: () => void
  onMove: (taskId: string, to: Task['stato']) => void
}

function TaskDetail({ task, onClose, onMove }: TaskDetailProps) {
  const assignee = users.find(u => u.id === task.assegnatario)
  const evento = task.evento ? events.find(e => e.id === task.evento) : null
  const dl = daysLeft(task.scadenza)
  const isOverdue = dl < 0

  const currentIdx = COLUMNS.findIndex(c => c.id === task.stato)
  const prevCol = currentIdx > 0 ? COLUMNS[currentIdx - 1] : null
  const nextCol = currentIdx < COLUMNS.length - 1 ? COLUMNS[currentIdx + 1] : null
  const currentCol = COLUMNS[currentIdx]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-5 border-b flex items-start justify-between gap-3"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-start gap-3 flex-1">
            <div
              className="w-1.5 rounded-full flex-shrink-0 mt-1"
              style={{ height: '44px', background: prioritaColor(task.priorita) }}
            />
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                {task.titolo}
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                {task.descrizione}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-all hover:bg-white/10 flex-shrink-0"
          >
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Stato</p>
              <span
                className="text-sm font-semibold px-2 py-0.5 rounded"
                style={{ background: `${currentCol?.color}20`, color: currentCol?.color }}
              >
                {currentCol?.label}
              </span>
            </div>

            <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Priorita</p>
              <span
                className="text-sm font-semibold px-2 py-0.5 rounded capitalize"
                style={{ background: `${prioritaColor(task.priorita)}20`, color: prioritaColor(task.priorita) }}
              >
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
              {isOverdue && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--red2)' }}>{Math.abs(dl)}gg scaduto</p>
              )}
            </div>

            <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Assegnatario</p>
              {assignee ? (
                <div className="flex items-center gap-2">
                  <img src={assignee.avatar} alt={assignee.nome} className="w-5 h-5 rounded object-cover" />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {assignee.nome.split(' ')[0]} {assignee.nome.split(' ')[1]}
                  </span>
                </div>
              ) : (
                <span className="text-sm" style={{ color: 'var(--muted)' }}>—</span>
              )}
            </div>
          </div>

          {/* Evento */}
          {evento && (
            <div
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: 'rgba(77,180,255,0.08)', border: '1px solid rgba(77,180,255,0.2)' }}
            >
              <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--blue)' }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Evento collegato</p>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{evento.nome}</p>
              </div>
            </div>
          )}

          {/* Move actions */}
          <div className="pt-1">
            <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Sposta task</p>
            <div className="flex gap-2">
              {prevCol && (
                <button
                  onClick={() => { onMove(task.id, prevCol.id); onClose() }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                  style={{
                    background: `${prevCol.color}12`,
                    color: prevCol.color,
                    border: `1px solid ${prevCol.color}30`,
                  }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  {prevCol.label}
                </button>
              )}
              {nextCol && (
                <button
                  onClick={() => { onMove(task.id, nextCol.id); onClose() }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                  style={{
                    background: `${nextCol.color}12`,
                    color: nextCol.color,
                    border: `1px solid ${nextCol.color}30`,
                  }}
                >
                  {nextCol.label}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface TaskCardProps {
  task: Task
  onClick: () => void
  onQuickMove: (to: Task['stato']) => void
}

function TaskCard({ task, onClick, onQuickMove }: TaskCardProps) {
  const assignee = users.find(u => u.id === task.assegnatario)
  const evento = task.evento ? events.find(e => e.id === task.evento) : null
  const dl = daysLeft(task.scadenza)
  const isOverdue = dl < 0 && task.stato !== 'completato'
  const urgentSoon = !isOverdue && dl <= 2 && task.stato !== 'completato'
  const currentIdx = COLUMNS.findIndex(c => c.id === task.stato)
  const nextCol = currentIdx < COLUMNS.length - 1 ? COLUMNS[currentIdx + 1] : null

  return (
    <div
      className="rounded-xl p-4 cursor-pointer transition-all group"
      style={{
        background: 'var(--panel)',
        border: `1px solid ${isOverdue ? 'rgba(255,49,95,0.3)' : 'var(--line)'}`,
      }}
      onClick={onClick}
    >
      <div className="flex items-start gap-2 mb-2.5">
        <div
          className="w-1 rounded-full mt-1 flex-shrink-0"
          style={{ height: '14px', background: prioritaColor(task.priorita) }}
        />
        <p className="text-sm font-semibold leading-snug flex-1" style={{ color: 'var(--text)' }}>
          {task.titolo}
        </p>
      </div>

      <p className="text-xs mb-3 line-clamp-2 ml-3" style={{ color: 'var(--muted)' }}>
        {task.descrizione}
      </p>

      {evento && (
        <div
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg mb-3 ml-3"
          style={{ background: 'rgba(77,180,255,0.1)' }}
        >
          <Calendar className="w-3 h-3" style={{ color: 'var(--blue)' }} />
          <span className="text-xs truncate max-w-[150px]" style={{ color: 'var(--blue)' }}>
            {evento.nome}
          </span>
        </div>
      )}

      <div
        className="flex items-center justify-between pt-2.5 ml-3"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <div className="flex items-center gap-1.5">
          {isOverdue ? (
            <AlertCircle className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
          ) : urgentSoon ? (
            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
          ) : (
            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
          )}
          <span
            className="text-xs font-medium"
            style={{ color: isOverdue ? 'var(--red2)' : urgentSoon ? 'var(--yellow)' : 'var(--muted)' }}
          >
            {isOverdue
              ? `${Math.abs(dl)}gg fa`
              : dl === 0
              ? 'Oggi'
              : fmtShort(task.scadenza)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {nextCol && (
            <button
              onClick={e => { e.stopPropagation(); onQuickMove(nextCol.id) }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-all hover:bg-white/10"
              title={`Sposta in "${nextCol.label}"`}
            >
              <ChevronRight className="w-3.5 h-3.5" style={{ color: nextCol.color }} />
            </button>
          )}
          {assignee ? (
            <img
              src={assignee.avatar}
              alt={assignee.nome}
              className="w-6 h-6 rounded-md object-cover"
              title={assignee.nome}
            />
          ) : (
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: 'var(--panel2)' }}
            >
              <User className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TaskPage() {
  const currentUser = loadUser()
  const [taskList, setTaskList] = useState<Task[]>(loadTasksFromStorage)
  const [selected, setSelected] = useState<Task | null>(null)
  const [search, setSearch] = useState('')
  const [filterPriorita, setFilterPriorita] = useState('Tutte')
  const [filterAssegnatario, setFilterAssegnatario] = useState('Tutti')

  const visibleTasks = useMemo(() => {
    if (!currentUser) return []
    return getVisibleTasks(taskList, currentUser.ruolo, currentUser.id)
  }, [taskList, currentUser])

  const filtered = useMemo(() => {
    return visibleTasks.filter(t => {
      const matchSearch =
        search === '' ||
        t.titolo.toLowerCase().includes(search.toLowerCase()) ||
        t.descrizione.toLowerCase().includes(search.toLowerCase())
      const matchPriorita = filterPriorita === 'Tutte' || t.priorita === filterPriorita
      const matchAssegnatario = filterAssegnatario === 'Tutti' || t.assegnatario === filterAssegnatario
      return matchSearch && matchPriorita && matchAssegnatario
    })
  }, [visibleTasks, search, filterPriorita, filterAssegnatario])

  const moveTask = useCallback((taskId: string, to: Task['stato']) => {
    setTaskList(prev => {
      const updated = prev.map(t => t.id === taskId ? { ...t, stato: to } : t)
      saveTasks(updated)
      return updated
    })
  }, [])

  const columns = COLUMNS.map(col => ({
    ...col,
    tasks: filtered.filter(t => t.stato === col.id),
  }))

  const overdueCount = visibleTasks.filter(
    t => daysLeft(t.scadenza) < 0 && t.stato !== 'completato'
  ).length

  const teamMembers = useMemo(() => {
    const ids = [...new Set(visibleTasks.map(t => t.assegnatario))]
    return users.filter(u => ids.includes(u.id))
  }, [visibleTasks])

  // Keep selected task in sync with state changes
  const selectedCurrent = selected
    ? (taskList.find(t => t.id === selected.id) ?? selected)
    : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Task</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          {filtered.length} task visibili
          {overdueCount > 0 && (
            <span
              className="ml-2 text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,49,95,0.15)', color: 'var(--red2)' }}
            >
              {overdueCount} scaduti
            </span>
          )}
        </p>
      </div>

      {/* KPI strip */}
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl flex-1 min-w-[180px]"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Cerca task..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--text)' }}
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>

        <div
          className="flex items-center gap-1 px-2 py-1 rounded-xl"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          <Filter className="w-4 h-4 mx-1" style={{ color: 'var(--muted)' }} />
          {(['Tutte', 'alta', 'media', 'bassa'] as const).map(p => (
            <button
              key={p}
              onClick={() => setFilterPriorita(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
              style={{
                background: filterPriorita === p ? `${p === 'Tutte' ? 'rgba(255,255,255,0.08)' : `${prioritaColor(p)}15`}` : 'transparent',
                color: filterPriorita === p ? (p === 'Tutte' ? 'var(--text)' : prioritaColor(p)) : 'var(--muted)',
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <select
          value={filterAssegnatario}
          onChange={e => setFilterAssegnatario(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm focus:outline-none cursor-pointer"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            color: 'var(--text)',
          }}
        >
          <option value="Tutti">Tutti i membri</option>
          {teamMembers.map(u => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map(col => (
          <div
            key={col.id}
            className="flex flex-col rounded-2xl overflow-hidden"
            style={{
              background: col.bg,
              border: `1px solid ${col.color}22`,
              minHeight: '400px',
            }}
          >
            {/* Column header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: `1px solid ${col.color}22` }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                <span className="font-semibold text-sm" style={{ color: col.color }}>
                  {col.label}
                </span>
              </div>
              <span
                className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: `${col.color}18`, color: col.color }}
              >
                {col.tasks.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 p-3 space-y-3">
              {col.tasks.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed"
                  style={{ borderColor: `${col.color}18` }}
                >
                  <CheckSquare className="w-8 h-8 mb-2 opacity-20" style={{ color: col.color }} />
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Nessun task</p>
                </div>
              ) : (
                col.tasks.map((task, i) => (
                  <div key={task.id} className="animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
                    <TaskCard
                      task={task}
                      onClick={() => setSelected(task)}
                      onQuickMove={to => moveTask(task.id, to)}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Detail modal */}
      {selectedCurrent && (
        <TaskDetail
          task={selectedCurrent}
          onClose={() => setSelected(null)}
          onMove={moveTask}
        />
      )}
    </div>
  )
}
