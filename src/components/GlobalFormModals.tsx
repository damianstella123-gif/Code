import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadUser } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { fetchAllProfiles } from '@/lib/profiles'
import { fetchEvents } from '@/lib/events-service'
import { fetchClients } from '@/lib/clients-service'
import { upsertTask } from '@/lib/tasks-service'
import { upsertEvent } from '@/lib/events-service'
import { EventFormModal } from '@/pages/eventi/EventFormModal'
import type { Event as AppEvent } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Profile } from '@/lib/profiles'
import type { Client } from '@/data/clients'
import { toISO } from '@/lib/format'

function TaskFormModalGlobal({ prefillEventId, users, events, onSave, onClose }: {
  prefillEventId?: string
  users: Profile[]
  events: { id: string; nome: string }[]
  onSave: (t: Task) => void
  onClose: () => void
}) {
  const [titolo, setTitolo] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [assegnatario, setAssegnatario] = useState(loadUser()?.id ?? '')
  const [evento, setEvento] = useState(prefillEventId ?? '')
  const [priorita, setPriorita] = useState<Task['priorita']>('media')
  const [scadenza, setScadenza] = useState('')
  const [categoria, setCategoria] = useState('')

  const CATEGORIE = ['Amministrativo', 'Creativo', 'Logistico', 'Commerciale', 'Operativo', 'Altro'] as const

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!titolo.trim() || !scadenza) return
    onSave({
      id: `tsk_${Date.now()}`,
      titolo: titolo.trim(),
      descrizione: descrizione.trim(),
      assegnatario,
      evento: evento || null,
      priorita,
      stato: 'da_fare',
      scadenza,
      creatoIl: toISO(new Date()),
      categoria: categoria || null,
    })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--line)' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
            Nuovo task
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Titolo *</label>
            <input type="text" value={titolo} onChange={e => setTitolo(e.target.value)}
              className="w-full py-2.5 px-3 text-sm rounded-lg focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              placeholder="Titolo del task" required autoFocus />
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
              CREA
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function GlobalFormModals() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [showEventForm, setShowEventForm] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskPrefillEventId, setTaskPrefillEventId] = useState<string | undefined>()

  const [users, setUsers] = useState<Profile[]>([])
  const [events, setEvents] = useState<{ id: string; nome: string }[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)

  const loadData = useCallback(async () => {
    if (dataLoaded) return
    const [profiles, evts, cls] = await Promise.all([
      fetchAllProfiles(),
      fetchEvents(),
      fetchClients(),
    ])
    setUsers(profiles)
    setEvents(evts.map(e => ({ id: e.id, nome: e.nome })))
    setClients(cls)
    setDataLoaded(true)
  }, [dataLoaded])

  useEffect(() => {
    const onNewEvent = () => {
      loadData().then(() => setShowEventForm(true))
    }
    const onNewTask = (e: globalThis.Event) => {
      const detail = (e as CustomEvent).detail
      const eventId = detail?.eventId as string | undefined
      setTaskPrefillEventId(eventId)
      loadData().then(() => setShowTaskForm(true))
    }
    window.addEventListener('global-new-event', onNewEvent)
    window.addEventListener('global-new-task', onNewTask)
    return () => {
      window.removeEventListener('global-new-event', onNewEvent)
      window.removeEventListener('global-new-task', onNewTask)
    }
  }, [loadData])

  const handleSaveEvent = useCallback(async (evt: AppEvent) => {
    await upsertEvent(evt)
    setShowEventForm(false)
    showToast('Evento creato', 'success')
    navigate(`/eventi?id=${evt.id}`)
  }, [navigate, showToast])

  const handleSaveTask = useCallback(async (task: Task) => {
    await upsertTask(task)
    setShowTaskForm(false)
    setTaskPrefillEventId(undefined)
    showToast('Task creato', 'success')
    navigate('/task')
  }, [navigate, showToast])

  const internalUsers = users.filter(u => u.is_active).map(u => ({
    id: u.id,
    nome: `${u.first_name} ${u.last_name}`.trim() || u.email,
    avatar: u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.first_name}`,
  }))

  return (
    <>
      {showEventForm && (
        <div style={{ zIndex: 100, position: 'relative' }}>
          <EventFormModal
            internalUsers={internalUsers}
            allClients={clients}
            onSave={handleSaveEvent}
            onCancel={() => setShowEventForm(false)}
          />
        </div>
      )}
      {showTaskForm && (
        <TaskFormModalGlobal
          prefillEventId={taskPrefillEventId}
          users={users}
          events={events}
          onSave={handleSaveTask}
          onClose={() => { setShowTaskForm(false); setTaskPrefillEventId(undefined) }}
        />
      )}
    </>
  )
}
