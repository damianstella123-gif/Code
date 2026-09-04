import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { fetchTasksByEvent, upsertTask, changeTaskStatus, deleteTask } from '@/lib/tasks-service'
import { TaskRow, TaskFormModal, TaskDetailPanel } from '@/pages/Task'
import type { Task } from '@/data/tasks'
import type { Event } from '@/data/events'
import type { Profile } from '@/lib/profiles'

export function TabTask({ event, internalUsers }: { event: Event; internalUsers: { id: string; nome: string }[] }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setTasks(await fetchTasksByEvent(event.id)) } catch { /* ignore */ }
    setLoading(false)
  }, [event.id])

  useEffect(() => { load() }, [load])

  function getInitials(userId: string): string {
    const u = internalUsers.find(x => x.id === userId)
    if (!u) return '?'
    const parts = u.nome.split(' ')
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : u.nome.slice(0, 2).toUpperCase()
  }

  function getFullName(userId: string): string {
    return internalUsers.find(x => x.id === userId)?.nome ?? 'Sconosciuto'
  }

  async function handleCycleStatus(task: Task) {
    const next: Task['stato'] = task.stato === 'da_fare' ? 'in_corso' : task.stato === 'in_corso' ? 'completato' : 'da_fare'
    await changeTaskStatus(task.id, next)
    load()
  }

  const usersAsProfiles = internalUsers.map(u => {
    const [nome = '', ...rest] = u.nome.split(' ')
    return { id: u.id, nome, cognome: rest.join(' ') } as unknown as Profile
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="wire-section-title" style={{ margin: 0 }}>Task ({tasks.length})</p>
        <button
          onClick={() => { setEditingTask(null); setShowForm(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'var(--red2)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          <Plus className="w-4 h-4" /> Nuovo Task
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Caricamento...</p>
      ) : tasks.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nessun task per questo evento</p>
      ) : (
        <div>
          {tasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              events={[{ id: event.id, nome: event.nome }]}
              getInitials={getInitials}
              getFullName={getFullName}
              onCycleStatus={() => handleCycleStatus(t)}
              onRowClick={() => setSelectedTask(t)}
              onNavigateEvent={() => {}}
              isCompleting={false}
            />
          ))}
        </div>
      )}

      {showForm && (
        <TaskFormModal
          task={editingTask ?? undefined}
          users={usersAsProfiles}
          events={[{ id: event.id, nome: event.nome }]}
          onSave={async (t: Task) => {
            await upsertTask({ ...t, evento: event.id })
            setShowForm(false)
            load()
          }}
          onClose={() => setShowForm(false)}
        />
      )}

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          events={[{ id: event.id, nome: event.nome }]}
          getInitials={getInitials}
          getFullName={getFullName}
          onClose={() => setSelectedTask(null)}
          onEdit={() => { setEditingTask(selectedTask); setSelectedTask(null); setShowForm(true) }}
          onDelete={async () => { await deleteTask(selectedTask.id); setSelectedTask(null); load() }}
          onStatusChange={async (to: Task['stato']) => { await changeTaskStatus(selectedTask.id, to); setSelectedTask(null); load() }}
          onNavigateEvent={() => {}}
        />
      )}
    </div>
  )
}
