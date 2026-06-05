import { useState, useEffect, useCallback } from 'react'
import {
  Plus, X, Upload, FileText, Download, AlertTriangle, Trash2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchEvents } from '@/lib/events-service'
import { fetchClients } from '@/lib/clients-service'
import { fetchBudgets } from '@/lib/budgets-service'
import { fetchTasks } from '@/lib/tasks-service'
import { fetchSuppliers } from '@/lib/suppliers-service'
import type { Event } from '@/data/events'
import type { Uscita } from '@/data/amministrazione'
import type { Task } from '@/data/tasks'

interface Client { id: string; nome: string }
interface Supplier { id: string; nome: string }

interface PresentationTemplate {
  name: string
  url: string
  uploaded_at: string
}

interface PresentationVersion {
  id: string
  event_id: string
  client_id: string
  template_name: string
  status: 'bozza' | 'generazione_richiesta' | 'pronto' | 'errore'
  notes: string
  file_url: string | null
  created_at: string
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Presentazioni() {
  const [events, setEvents] = useState<Event[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [budgets, setBudgets] = useState<Uscita[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [templates, setTemplates] = useState<PresentationTemplate[]>([])
  const [versions, setVersions] = useState<PresentationVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewPresentation, setShowNewPresentation] = useState(false)
  const [uploading, setUploading] = useState(false)

  const refresh = useCallback(async () => {
    const [ev, cl, sp, bg, tk] = await Promise.all([
      fetchEvents(), fetchClients(), fetchSuppliers(), fetchBudgets(), fetchTasks(),
    ])
    setEvents(ev)
    setClients(cl as Client[])
    setSuppliers(sp as Supplier[])
    setBudgets(bg)
    setTasks(tk)
    await loadTemplates()
    await loadVersions()
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function loadTemplates() {
    const { data } = await supabase.storage.from('templates').list('presentations', { limit: 100 })
    if (data) {
      setTemplates(data.filter(f => f.name !== '.emptyFolderPlaceholder').map(f => ({
        name: f.name,
        url: supabase.storage.from('templates').getPublicUrl(`presentations/${f.name}`).data.publicUrl,
        uploaded_at: f.created_at ?? '',
      })))
    }
  }

  async function loadVersions() {
    const { data } = await supabase
      .from('presentation_versions')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setVersions(data as PresentationVersion[])
  }

  async function handleTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const path = `presentations/${file.name}`
    await supabase.storage.from('templates').upload(path, file, { upsert: true })
    await loadTemplates()
    setUploading(false)
  }

  async function handleDeleteTemplate(name: string) {
    await supabase.storage.from('templates').remove([`presentations/${name}`])
    await loadTemplates()
  }

  async function handleCreateVersion(data: Omit<PresentationVersion, 'id' | 'created_at'>) {
    const { data: row } = await supabase
      .from('presentation_versions')
      .insert(data)
      .select()
      .maybeSingle()
    if (row) setVersions(prev => [row as PresentationVersion, ...prev])
    setShowNewPresentation(false)
  }

  async function handleDeleteVersion(id: string) {
    await supabase.from('presentation_versions').delete().eq('id', id)
    setVersions(prev => prev.filter(v => v.id !== id))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Presentazioni con Fly</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            Genera presentazioni basate su dati reali degli eventi
          </p>
        </div>
        <button
          onClick={() => setShowNewPresentation(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          <Plus className="w-4 h-4" /> Nuova Presentazione
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--muted)' }}>Caricamento...</div>
      ) : (<>
      {/* Templates Section */}
      <div className="panel p-5 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Template PPTX</h2>
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all hover:opacity-80"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'Caricamento...' : 'Carica Template'}
            <input type="file" accept=".pptx,.ppt" className="hidden" onChange={handleTemplateUpload} />
          </label>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--muted)' }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Nessun template caricato. Carica un file PPTX da usare come base.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map(t => (
              <div key={t.name} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                <FileText className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--red2)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{t.name}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{formatDate(t.uploaded_at)}</p>
                </div>
                <div className="flex gap-1">
                  <a href={t.url} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-white/10">
                    <Download className="w-3.5 h-3.5" style={{ color: 'var(--blue)' }} />
                  </a>
                  <button onClick={() => handleDeleteTemplate(t.name)} className="p-1.5 rounded-lg hover:bg-white/10">
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'rgba(77,180,255,0.08)', border: '1px solid rgba(77,180,255,0.25)' }}>
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--blue)' }} />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--blue)' }}>Generazione PPTX</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            La generazione automatica del file PPTX richiede una Edge Function dedicata (pptxgenjs).
            Al momento puoi preparare i contenuti e scaricare il template. La funzione di generazione
            verra completata tramite Edge Function quando il template aziendale sara caricato.
          </p>
        </div>
      </div>

      {/* Versions / History */}
      <div className="panel p-5 rounded-2xl space-y-4">
        <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Storico Presentazioni</h2>
        {versions.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
            Nessuna presentazione creata. Clicca "Nuova Presentazione" per iniziare.
          </p>
        ) : (
          <div className="space-y-3">
            {versions.map(v => {
              const event = events.find(e => e.id === v.event_id)
              const client = clients.find(c => c.id === v.client_id)
              const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
                bozza: { bg: '#9ba3aa20', color: '#9ba3aa', label: 'Bozza' },
                generazione_richiesta: { bg: '#ffc24b20', color: '#ffc24b', label: 'In Generazione' },
                pronto: { bg: '#38d27d20', color: '#38d27d', label: 'Pronto' },
                errore: { bg: '#ff315f20', color: '#ff315f', label: 'Errore' },
              }
              const st = statusStyles[v.status] ?? statusStyles.bozza

              return (
                <div key={v.id} className="flex items-center gap-4 p-3 rounded-xl"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                  <FileText className="w-8 h-8 flex-shrink-0" style={{ color: 'var(--red2)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {event?.nome ?? 'Evento'} - {client?.nome ?? 'Cliente'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      Template: {v.template_name} | {formatDate(v.created_at)}
                    </p>
                    {v.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{v.notes}</p>}
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                  {v.file_url && (
                    <a href={v.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-white/10">
                      <Download className="w-4 h-4" style={{ color: 'var(--blue)' }} />
                    </a>
                  )}
                  <button onClick={() => handleDeleteVersion(v.id)} className="p-1.5 rounded-lg hover:bg-white/10">
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
      </>)}

      {/* New Presentation Modal */}
      {showNewPresentation && (
        <NewPresentationModal
          events={events}
          clients={clients}
          suppliers={suppliers}
          budgets={budgets}
          tasks={tasks}
          templates={templates}
          onClose={() => setShowNewPresentation(false)}
          onCreate={handleCreateVersion}
        />
      )}
    </div>
  )
}

function NewPresentationModal({ events, clients, suppliers, budgets, tasks, templates, onClose, onCreate }: {
  events: Event[]
  clients: Client[]
  suppliers: Supplier[]
  budgets: Uscita[]
  tasks: Task[]
  templates: PresentationTemplate[]
  onClose: () => void
  onCreate: (data: Omit<PresentationVersion, 'id' | 'created_at'>) => void
}) {
  const [eventId, setEventId] = useState(events[0]?.id ?? '')
  const [clientId, setClientId] = useState('')
  const [templateName, setTemplateName] = useState(templates[0]?.name ?? '')
  const [notes, setNotes] = useState('')

  const selectedEvent = events.find(e => e.id === eventId)
  const eventBudgets = budgets.filter(b => b.eventoId === eventId)
  const eventTasks = tasks.filter(t => t.evento === eventId)
  const eventSuppliers = [...new Set(eventBudgets.map(b => b.fornitoreId))].map(id => suppliers.find(s => s.id === id)).filter(Boolean)

  useEffect(() => {
    if (selectedEvent?.cliente) setClientId(selectedEvent.cliente)
  }, [selectedEvent])

  function handleSubmit() {
    if (!eventId) return
    onCreate({
      event_id: eventId,
      client_id: clientId,
      template_name: templateName || 'default',
      status: templates.length > 0 ? 'generazione_richiesta' : 'bozza',
      notes,
      file_url: null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Genera Presentazione con Fly</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Evento</label>
            <select value={eventId} onChange={e => setEventId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="">Seleziona evento</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Cliente</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="">Seleziona cliente</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </div>

        {templates.length > 0 && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Template</label>
            <select value={templateName} onChange={e => setTemplateName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          </div>
        )}

        {/* Data preview */}
        {eventId && (
          <div className="space-y-3 p-4 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            <h4 className="text-xs font-bold uppercase" style={{ color: 'var(--muted)' }}>Dati inclusi nella presentazione</h4>
            <div className="grid grid-cols-2 gap-3 text-xs" style={{ color: 'var(--text)' }}>
              <div>
                <span style={{ color: 'var(--muted)' }}>Evento:</span> {selectedEvent?.nome}
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Date:</span> {selectedEvent?.dataInizio} - {selectedEvent?.dataFine}
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Location:</span> {selectedEvent?.location}
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Partecipanti:</span> {selectedEvent?.partecipanti}
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Budget totale:</span> {eventBudgets.reduce((s, b) => s + b.importo, 0).toLocaleString('it-IT')} EUR
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Task:</span> {eventTasks.length} ({eventTasks.filter(t => t.stato === 'completato').length} completati)
              </div>
              <div className="col-span-2">
                <span style={{ color: 'var(--muted)' }}>Fornitori:</span> {eventSuppliers.map(s => s!.nome).join(', ') || 'Nessuno'}
              </div>
            </div>
          </div>
        )}

        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note aggiuntive per la presentazione"
          rows={2} className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
          style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />

        <button onClick={handleSubmit} disabled={!eventId}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          {templates.length > 0 ? 'Richiedi Generazione' : 'Salva Bozza (template richiesto)'}
        </button>

        {templates.length === 0 && (
          <p className="text-xs text-center" style={{ color: 'var(--yellow)' }}>
            Carica un template PPTX nella sezione template per abilitare la generazione automatica.
          </p>
        )}
      </div>
    </div>
  )
}
