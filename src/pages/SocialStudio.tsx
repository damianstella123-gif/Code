import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Plus, X, Trash2, Edit3, Filter, Calendar, Tag, Upload,
  Instagram, Linkedin, Facebook, Mail, Clock, Eye, CheckCircle, Send, User,
} from 'lucide-react'
import {
  fetchSocialContents, upsertSocialContent, updateSocialContent, deleteSocialContent,
  uploadSocialAsset, SOCIAL_CHANNELS, SOCIAL_STATUSES, type SocialContent,
} from '@/lib/social-service'
import { fetchEvents } from '@/lib/events-service'
import { fetchClients } from '@/lib/clients-service'
import { fetchCreativeProjects, type CreativeProject } from '@/lib/creative-service'
import { fetchAllProfiles, type Profile } from '@/lib/profiles'
import type { Event } from '@/data/events'

interface Client { id: string; nome: string }

function statusColor(s: string) {
  return SOCIAL_STATUSES.find(x => x.id === s)?.color ?? '#9ba3aa'
}
function statusLabel(s: string) {
  return SOCIAL_STATUSES.find(x => x.id === s)?.label ?? s
}
function channelLabel(c: string) {
  return SOCIAL_CHANNELS.find(x => x.id === c)?.label ?? c
}
function channelIcon(c: string) {
  switch (c) {
    case 'instagram_post': case 'instagram_story': return Instagram
    case 'linkedin_post': return Linkedin
    case 'facebook_post': return Facebook
    case 'newsletter': return Mail
    default: return Tag
  }
}
function formatDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SocialStudio() {
  const [contents, setContents] = useState<SocialContent[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [creativeProjects, setCreativeProjects] = useState<CreativeProject[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SocialContent | null>(null)
  const [filterChannel, setFilterChannel] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const refresh = useCallback(async () => {
    const [sc, ev, cl, cp, pr] = await Promise.all([
      fetchSocialContents(), fetchEvents(), fetchClients(), fetchCreativeProjects(), fetchAllProfiles(),
    ])
    setContents(sc)
    setEvents(ev)
    setClients(cl as Client[])
    setCreativeProjects(cp)
    setProfiles(pr)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    let list = contents
    if (filterChannel) list = list.filter(c => c.channel === filterChannel)
    if (filterStatus) list = list.filter(c => c.status === filterStatus)
    return list
  }, [contents, filterChannel, filterStatus])

  const stats = useMemo(() => ({
    total: contents.length,
    programmati: contents.filter(c => c.status === 'programmato').length,
    pubblicati: contents.filter(c => c.status === 'pubblicato').length,
    inRevisione: contents.filter(c => c.status === 'in_revisione').length,
  }), [contents])

  async function handleDelete(id: string) {
    await deleteSocialContent(id)
    setContents(prev => prev.filter(c => c.id !== id))
  }

  async function handleStatusChange(id: string, status: string) {
    await updateSocialContent(id, { status })
    setContents(prev => prev.map(c => c.id === id ? { ...c, status } : c))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Social Studio</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Pianificazione contenuti social e newsletter</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          <Plus className="w-4 h-4" /> Nuovo Contenuto
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Totale', value: stats.total, color: 'var(--text)', icon: Tag },
          { label: 'In Revisione', value: stats.inRevisione, color: '#ffc24b', icon: Eye },
          { label: 'Programmati', value: stats.programmati, color: '#4db4ff', icon: Clock },
          { label: 'Pubblicati', value: stats.pubblicati, color: '#38d27d', icon: CheckCircle },
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
        <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <option value="">Tutti i canali</option>
          {SOCIAL_CHANNELS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
          <option value="">Tutti gli stati</option>
          {SOCIAL_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--muted)' }}>Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 panel rounded-2xl">
          <Send className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--muted)' }} />
          <p style={{ color: 'var(--muted)' }}>Nessun contenuto social</p>
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="mt-3 text-sm font-medium" style={{ color: 'var(--red2)' }}>
            Crea il primo contenuto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const Icon = channelIcon(c.channel)
            const event = events.find(e => e.id === c.event_id)
            const responsible = profiles.find(p => p.id === c.responsible_id)
            return (
              <div key={c.id} className="panel p-4 rounded-2xl space-y-3 hover:shadow-lg transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${statusColor(c.status)}20` }}>
                      <Icon className="w-4 h-4" style={{ color: statusColor(c.status) }} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{c.title}</h3>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{channelLabel(c.channel)}</p>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap"
                    style={{ background: `${statusColor(c.status)}20`, color: statusColor(c.status) }}>
                    {statusLabel(c.status)}
                  </span>
                </div>

                {c.copy && (
                  <p className="text-xs line-clamp-2" style={{ color: 'var(--muted)' }}>{c.copy}</p>
                )}

                <div className="space-y-1 text-xs" style={{ color: 'var(--muted)' }}>
                  {event && <div className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {event.nome}</div>}
                  {c.publish_date && <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {formatDate(c.publish_date)}</div>}
                  {responsible && <div className="flex items-center gap-1.5"><User className="w-3 h-3" style={{ color: 'var(--blue)' }} /> {responsible.first_name} {responsible.last_name}</div>}
                </div>

                <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
                  <select value={c.status} onChange={e => handleStatusChange(c.id, e.target.value)}
                    className="flex-1 px-2 py-1 rounded-lg text-xs"
                    style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                    {SOCIAL_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <button onClick={() => { setEditing(c); setShowForm(true) }} className="p-1.5 rounded-lg hover:bg-white/10">
                    <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-white/10">
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <SocialForm
          content={editing}
          events={events}
          clients={clients}
          creativeProjects={creativeProjects}
          profiles={profiles}
          onClose={() => setShowForm(false)}
          onSave={async (data) => {
            await upsertSocialContent(data)
            setShowForm(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function SocialForm({ content, events, clients, creativeProjects, profiles, onClose, onSave }: {
  content: SocialContent | null
  events: Event[]
  clients: Client[]
  creativeProjects: CreativeProject[]
  profiles: Profile[]
  onClose: () => void
  onSave: (data: Partial<SocialContent> & { title: string }) => void
}) {
  const [title, setTitle] = useState(content?.title ?? '')
  const [channel, setChannel] = useState(content?.channel ?? 'instagram_post')
  const [eventId, setEventId] = useState(content?.event_id ?? '')
  const [clientId, setClientId] = useState(content?.client_id ?? '')
  const [creativeId, setCreativeId] = useState(content?.creative_project_id ?? '')
  const [responsibleId, setResponsibleId] = useState(content?.responsible_id ?? '')
  const [copy, setCopy] = useState(content?.copy ?? '')
  const [publishDate, setPublishDate] = useState(content?.publish_date ?? '')
  const [status, setStatus] = useState(content?.status ?? 'idea')
  const [notes, setNotes] = useState(content?.notes ?? '')
  const [uploading, setUploading] = useState(false)
  const [assetUrl, setAssetUrl] = useState(content?.asset_url ?? '')

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const id = content?.id ?? crypto.randomUUID()
    const url = await uploadSocialAsset(file, id)
    if (url) setAssetUrl(url)
    setUploading(false)
  }

  function handleSubmit() {
    if (!title.trim()) return
    onSave({
      ...(content?.id ? { id: content.id } : {}),
      title,
      channel,
      event_id: eventId || null,
      client_id: clientId || null,
      creative_project_id: creativeId || null,
      responsible_id: responsibleId || null,
      copy,
      publish_date: publishDate || null,
      status,
      notes,
      asset_url: assetUrl || null,
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
            {content ? 'Modifica Contenuto' : 'Nuovo Contenuto Social'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titolo contenuto"
            className="w-full px-3 py-2.5 rounded-xl text-sm"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Canale</label>
              <select value={channel} onChange={e => setChannel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                {SOCIAL_CHANNELS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Stato</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                {SOCIAL_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
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
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Data pubblicazione</label>
              <input type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Asset Creativo</label>
              <select value={creativeId} onChange={e => setCreativeId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">Nessuno</option>
                {creativeProjects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Copy</label>
            <textarea value={copy} onChange={e => setCopy(e.target.value)} placeholder="Testo del post..."
              rows={4} className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>

          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note interne"
            rows={2} className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />

          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Responsabile</label>
            <select value={responsibleId} onChange={e => setResponsibleId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="">Nessuno</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Asset (immagine/video)</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <Upload className="w-4 h-4" />
                {uploading ? 'Caricamento...' : 'Carica asset'}
                <input type="file" className="hidden" accept="image/*,video/*" onChange={handleFileUpload} />
              </label>
              {assetUrl && (
                <a href={assetUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs" style={{ color: 'var(--blue)' }}>Asset caricato</a>
              )}
            </div>
          </div>
        </div>

        <button onClick={handleSubmit} disabled={!title.trim()}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          {content ? 'Salva Modifiche' : 'Crea Contenuto'}
        </button>
      </div>
    </div>
  )
}
