import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Plus, X, Palette, Upload, Trash2, Edit3, Filter,
  Calendar, User, Tag, CheckCircle, Clock, Eye, Download,
} from 'lucide-react'
import {
  fetchCreativeProjects, upsertCreativeProject, updateCreativeProject, deleteCreativeProject,
  uploadCreativeFile, CREATIVE_TYPES, CREATIVE_STATUSES, OUTPUT_FORMATS,
  type CreativeProject,
} from '@/lib/creative-service'
import { fetchEvents } from '@/lib/events-service'
import { fetchClients } from '@/lib/clients-service'
import { fetchAllProfiles, type Profile } from '@/lib/profiles'
import type { Event } from '@/data/events'

interface Client { id: string; nome: string }

function statusColor(s: string) {
  return CREATIVE_STATUSES.find(x => x.id === s)?.color ?? '#9ba3aa'
}
function statusLabel(s: string) {
  return CREATIVE_STATUSES.find(x => x.id === s)?.label ?? s
}
function typeLabel(t: string) {
  return CREATIVE_TYPES.find(x => x.id === t)?.label ?? t
}
function formatDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CreativeStudio() {
  const [projects, setProjects] = useState<CreativeProject[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CreativeProject | null>(null)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const refresh = useCallback(async () => {
    const [p, e, c, pr] = await Promise.all([fetchCreativeProjects(), fetchEvents(), fetchClients(), fetchAllProfiles()])
    setProjects(p)
    setEvents(e)
    setClients(c as Client[])
    setProfiles(pr)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    let list = projects
    if (filterType) list = list.filter(p => p.type === filterType)
    if (filterStatus) list = list.filter(p => p.status === filterStatus)
    return list
  }, [projects, filterType, filterStatus])

  const stats = useMemo(() => ({
    total: projects.length,
    inLavorazione: projects.filter(p => p.status === 'in_lavorazione').length,
    inRevisione: projects.filter(p => p.status === 'in_revisione').length,
    completati: projects.filter(p => p.status === 'completato' || p.status === 'approvato').length,
  }), [projects])

  function handleEdit(p: CreativeProject) {
    setEditing(p)
    setShowForm(true)
  }

  async function handleDelete(id: string) {
    await deleteCreativeProject(id)
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  async function handleStatusChange(id: string, status: string) {
    await updateCreativeProject(id, { status })
    setProjects(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Creative Studio</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Gestione materiali creativi per eventi</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          <Plus className="w-4 h-4" /> Nuovo Progetto
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Totale Progetti', value: stats.total, color: 'var(--text)', icon: Palette },
          { label: 'In Lavorazione', value: stats.inLavorazione, color: '#4db4ff', icon: Clock },
          { label: 'In Revisione', value: stats.inRevisione, color: '#ffc24b', icon: Eye },
          { label: 'Completati', value: stats.completati, color: '#38d27d', icon: CheckCircle },
        ].map((kpi, i) => (
          <div key={i} className="panel p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${kpi.color}18` }}>
              <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{kpi.label}</p>
              <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <option value="">Tutti i tipi</option>
          {CREATIVE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <option value="">Tutti gli stati</option>
          {CREATIVE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {(filterType || filterStatus) && (
          <button onClick={() => { setFilterType(''); setFilterStatus('') }}
            className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--red2)' }}>
            Resetta
          </button>
        )}
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--muted)' }}>Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 panel rounded-2xl">
          <Palette className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--muted)' }} />
          <p style={{ color: 'var(--muted)' }}>Nessun progetto creativo</p>
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="mt-3 text-sm font-medium" style={{ color: 'var(--red2)' }}>
            Crea il primo progetto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <ProjectCard key={p.id} project={p} events={events} clients={clients} profiles={profiles}
              onEdit={handleEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <ProjectForm
          project={editing}
          events={events}
          clients={clients}
          profiles={profiles}
          onClose={() => setShowForm(false)}
          onSave={async (data) => {
            await upsertCreativeProject(data)
            setShowForm(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function ProjectCard({ project, events, clients, profiles, onEdit, onDelete, onStatusChange }: {
  project: CreativeProject
  events: Event[]
  clients: Client[]
  profiles: Profile[]
  onEdit: (p: CreativeProject) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: string) => void
}) {
  const event = events.find(e => e.id === project.event_id)
  const client = clients.find(c => c.id === project.client_id)
  const responsible = profiles.find(p => p.id === project.responsible_id)

  return (
    <div className="panel p-4 rounded-2xl space-y-3 hover:shadow-lg transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{project.title}</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{typeLabel(project.type)}</p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap"
          style={{ background: `${statusColor(project.status)}20`, color: statusColor(project.status) }}>
          {statusLabel(project.status)}
        </span>
      </div>

      <div className="space-y-1.5 text-xs" style={{ color: 'var(--muted)' }}>
        {event && (
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3" /> {event.nome}
          </div>
        )}
        {client && (
          <div className="flex items-center gap-1.5">
            <User className="w-3 h-3" /> {client.nome}
          </div>
        )}
        {responsible && (
          <div className="flex items-center gap-1.5">
            <User className="w-3 h-3" style={{ color: 'var(--blue)' }} /> {responsible.first_name} {responsible.last_name}
          </div>
        )}
        {project.due_date && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Scadenza: {formatDate(project.due_date)}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Tag className="w-3 h-3" /> Output: {project.output_format.toUpperCase()}
        </div>
      </div>

      {project.file_url && (
        <a href={project.file_url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--blue)' }}>
          <Download className="w-3 h-3" /> Scarica file
        </a>
      )}

      {/* Status change + actions */}
      <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
        <select value={project.status} onChange={e => onStatusChange(project.id, e.target.value)}
          className="flex-1 px-2 py-1 rounded-lg text-xs"
          style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          {CREATIVE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <button onClick={() => onEdit(project)} className="p-1.5 rounded-lg hover:bg-white/10">
          <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
        </button>
        <button onClick={() => onDelete(project.id)} className="p-1.5 rounded-lg hover:bg-white/10">
          <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
        </button>
      </div>
    </div>
  )
}

function ProjectForm({ project, events, clients, profiles, onClose, onSave }: {
  project: CreativeProject | null
  events: Event[]
  clients: Client[]
  profiles: Profile[]
  onClose: () => void
  onSave: (data: Partial<CreativeProject> & { title: string }) => void
}) {
  const [title, setTitle] = useState(project?.title ?? '')
  const [type, setType] = useState(project?.type ?? 'presentazione')
  const [eventId, setEventId] = useState(project?.event_id ?? '')
  const [clientId, setClientId] = useState(project?.client_id ?? '')
  const [responsibleId, setResponsibleId] = useState(project?.responsible_id ?? '')
  const [status, setStatus] = useState(project?.status ?? 'bozza')
  const [dueDate, setDueDate] = useState(project?.due_date ?? '')
  const [notes, setNotes] = useState(project?.notes ?? '')
  const [outputFormat, setOutputFormat] = useState(project?.output_format ?? 'pdf')
  const [uploading, setUploading] = useState(false)
  const [fileUrl, setFileUrl] = useState(project?.file_url ?? '')

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const id = project?.id ?? crypto.randomUUID()
    const url = await uploadCreativeFile(file, id)
    if (url) setFileUrl(url)
    setUploading(false)
  }

  function handleSubmit() {
    if (!title.trim()) return
    onSave({
      ...(project?.id ? { id: project.id } : {}),
      title,
      type,
      event_id: eventId || null,
      client_id: clientId || null,
      responsible_id: responsibleId || null,
      status,
      due_date: dueDate || null,
      notes,
      output_format: outputFormat,
      file_url: fileUrl || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
            {project ? 'Modifica Progetto' : 'Nuovo Progetto Creativo'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo progetto"
            className="w-full px-3 py-2.5 rounded-xl text-sm"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Tipo</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                {CREATIVE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Formato Output</label>
              <select value={outputFormat} onChange={e => setOutputFormat(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                {OUTPUT_FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Evento</label>
              <select value={eventId} onChange={e => setEventId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">Nessuno</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Cliente</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">Nessuno</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Stato</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                {CREATIVE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Scadenza</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Responsabile</label>
            <select value={responsibleId} onChange={e => setResponsibleId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="">Nessuno</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
            </select>
          </div>

          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note"
            rows={3} className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />

          {/* File upload */}
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>File Output</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <Upload className="w-4 h-4" />
                {uploading ? 'Caricamento...' : 'Carica file'}
                <input type="file" className="hidden" onChange={handleFileUpload} />
              </label>
              {fileUrl && (
                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs" style={{ color: 'var(--blue)' }}>File caricato</a>
              )}
            </div>
          </div>
        </div>

        <button onClick={handleSubmit} disabled={!title.trim()}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          {project ? 'Salva Modifiche' : 'Crea Progetto'}
        </button>
      </div>
    </div>
  )
}
