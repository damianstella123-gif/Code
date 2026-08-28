import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Calendar, ChevronRight, ArrowLeft, Save, Loader2, FileText, History, Users } from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { fetchEvents } from '@/lib/events-service'
import { fetchAllProfiles } from '@/lib/profiles'
import {
  fetchMeetings, fetchMeetingById, fetchMeetingNotes,
  createMeeting, updateMeeting, upsertEventNote,
  computeEventRecap,
  type Meeting, type MeetingEventNote, type EventRecap,
} from '@/lib/meetings-service'
import type { Event } from '@/data/events'

const MANAGER_ROLES = ['Admin', 'Super Admin', 'Senior PM', 'Project Manager']

function canManageMeetings(role?: string) {
  return !!role && MANAGER_ROLES.includes(role)
}

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

function meseLabel(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${MESI[d.getMonth()]} ${d.getFullYear()}`
}

export default function Riunioni() {
  const navigate = useNavigate()
  const user = loadUser()
  const canManage = canManageMeetings(user?.role)

  const [view, setView] = useState<'overview' | 'new' | 'history' | 'detail'>('overview')
  const [events, setEvents] = useState<Event[]>([])
  const [profiles, setProfiles] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [detailMeetingId, setDetailMeetingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchEvents(), fetchAllProfiles(), fetchMeetings()])
      .then(([ev, pr, mt]) => {
        setEvents(ev)
        setProfiles(pr)
        setMeetings(mt)
      })
      .finally(() => setLoading(false))
  }, [])

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of profiles) m[p.id] = `${p.first_name} ${p.last_name}`.trim()
    return m
  }, [profiles])

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
  }

  if (view === 'new') {
    return <NewMeeting events={events} profileMap={profileMap} onDone={() => { setView('overview'); fetchMeetings().then(setMeetings) }} onCancel={() => setView('overview')} />
  }

  if (view === 'history' || (view === 'detail' && detailMeetingId)) {
    return (
      <MeetingHistory
        meetings={meetings}
        profileMap={profileMap}
        events={events}
        detailId={detailMeetingId}
        onBack={() => { setView('overview'); setDetailMeetingId(null) }}
        onOpenDetail={(id) => { setDetailMeetingId(id); setView('detail') }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Area Riunioni</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Panoramica eventi e verbali riunioni settimanali</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('history')} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <History className="w-4 h-4" /> Storico
          </button>
          {canManage && (
            <button onClick={() => setView('new')} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Nuova Riunione
            </button>
          )}
        </div>
      </div>

      {/* Events Table */}
      <EventsTable events={events} profileMap={profileMap} onEventClick={id => navigate(`/eventi?id=${id}`)} />
    </div>
  )
}

// ─── Events Table ────────────────────────────────────────────────────────────

function EventsTable({ events, profileMap, onEventClick }: { events: Event[]; profileMap: Record<string, string>; onEventClick: (id: string) => void }) {
  const [sortField, setSortField] = useState<string>('dataInizio')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filterStatus, setFilterStatus] = useState('Tutti')
  const [filterMonth, setFilterMonth] = useState('')

  const sorted = useMemo(() => {
    let list = [...events]
    if (filterStatus !== 'Tutti') list = list.filter(e => e.stato === filterStatus)
    if (filterMonth) list = list.filter(e => meseLabel(e.dataInizio) === filterMonth)
    list.sort((a, b) => {
      const av = (a as any)[sortField] ?? ''
      const bv = (b as any)[sortField] ?? ''
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [events, filterStatus, filterMonth, sortField, sortDir])

  const months = useMemo(() => [...new Set(events.map(e => meseLabel(e.dataInizio)).filter(Boolean))], [events])

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th onClick={() => toggleSort(field)} className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none whitespace-nowrap">
      {label} {sortField === field && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Filters */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex gap-3 flex-wrap items-center">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
          <option value="Tutti">Tutti gli stati</option>
          <option value="bozza">Bozza</option>
          <option value="pianificazione">Pianificazione</option>
          <option value="in_corso">In Corso</option>
          <option value="completato">Completato</option>
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
          <option value="">Tutti i mesi</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{sorted.length} eventi</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-750">
            <tr>
              <SortHeader field="eventNumber" label="N°" />
              <SortHeader field="stato" label="Stato" />
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Mese</th>
              <SortHeader field="dataInizio" label="Inizio" />
              <SortHeader field="dataFine" label="Fine" />
              <SortHeader field="cliente" label="Cliente" />
              <SortHeader field="nome" label="Evento" />
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Luogo</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Pax</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Responsabile</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sorted.map(ev => (
              <tr key={ev.id} onClick={() => onEventClick(ev.id)} className="hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors">
                <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-300">{ev.eventNumber ?? '-'}</td>
                <td className="px-3 py-2"><StatusBadge stato={ev.stato} /></td>
                <td className="px-3 py-2 text-xs text-gray-500">{meseLabel(ev.dataInizio)}</td>
                <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">{ev.dataInizio || '-'}</td>
                <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">{ev.dataFine || '-'}</td>
                <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 max-w-[120px] truncate">{ev.cliente || '-'}</td>
                <td className="px-3 py-2 text-xs font-medium text-gray-900 dark:text-white max-w-[180px] truncate">{ev.nome || '-'}</td>
                <td className="px-3 py-2 text-xs text-gray-500 max-w-[120px] truncate">{ev.location || '-'}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{ev.partecipanti || '-'}</td>
                <td className="px-3 py-2 text-xs text-gray-500 max-w-[100px] truncate">{profileMap[ev.responsabile] || '-'}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">Nessun evento trovato</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBadge({ stato }: { stato: string }) {
  const colors: Record<string, string> = {
    bozza: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    pianificazione: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    in_corso: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    completato: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  }
  const labels: Record<string, string> = { bozza: 'Bozza', pianificazione: 'Pianif.', in_corso: 'In Corso', completato: 'Completato' }
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[stato] || colors.bozza}`}>{labels[stato] || stato}</span>
}

// ─── New Meeting ─────────────────────────────────────────────────────────────

function NewMeeting({ events, onDone, onCancel }: { events: Event[]; profileMap: Record<string, string>; onDone: () => void; onCancel: () => void }) {
  const [saving, setSaving] = useState(false)
  const [meetingId, setMeetingId] = useState<string | null>(null)
  const [presenti, setPresenti] = useState('')
  const [temiGenerali, setTemiGenerali] = useState('')
  const [decisioniTrasversali, setDecisioniTrasversali] = useState('')
  const [discussedEvents, setDiscussedEvents] = useState<Set<string>>(new Set())
  const [activeNoteEvent, setActiveNoteEvent] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, Partial<MeetingEventNote>>>({})
  const [recaps, setRecaps] = useState<Record<string, EventRecap>>({})
  const [loadingRecap, setLoadingRecap] = useState<string | null>(null)
  const navigate = useNavigate()

  async function handleCreate() {
    setSaving(true)
    try {
      const m = await createMeeting({ meeting_date: new Date().toISOString().slice(0, 10), presenti })
      if (m) setMeetingId(m.id)
    } catch {}
    setSaving(false)
  }

  async function openEventNote(eventId: string) {
    setDiscussedEvents(prev => new Set([...prev, eventId]))
    setActiveNoteEvent(eventId)
    if (!recaps[eventId]) {
      setLoadingRecap(eventId)
      try {
        const r = await computeEventRecap(eventId)
        setRecaps(prev => ({ ...prev, [eventId]: r }))
        setNotes(prev => ({ ...prev, [eventId]: { ...prev[eventId], stato_snapshot: r } }))
      } catch {}
      setLoadingRecap(null)
    }
  }

  function updateNote(eventId: string, field: string, value: string) {
    setNotes(prev => ({ ...prev, [eventId]: { ...prev[eventId], [field]: value } }))
  }

  async function handleSave() {
    if (!meetingId) return
    setSaving(true)
    try {
      await updateMeeting(meetingId, { presenti, temi_generali: temiGenerali, decisioni_trasversali: decisioniTrasversali })
      for (const eventId of discussedEvents) {
        const n = notes[eventId] || {}
        await upsertEventNote({
          meeting_id: meetingId,
          event_id: eventId,
          stato_snapshot: n.stato_snapshot || recaps[eventId] || null,
          punti_discussi: n.punti_discussi || null,
          decisioni: n.decisioni || null,
          azioni: n.azioni || null,
          criticita: n.criticita || null,
          lezioni_imparate: n.lezioni_imparate || null,
        })
      }
      onDone()
    } catch {}
    setSaving(false)
  }

  const activeEvent = events.find(e => e.id === activeNoteEvent)
  const isClosedEvent = activeEvent?.stato === 'completato'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ArrowLeft className="w-4 h-4" /></button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Nuova Riunione</h1>
        <span className="text-sm text-gray-400">{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>

      {!meetingId ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Presenti</label>
            <input value={presenti} onChange={e => setPresenti(e.target.value)} placeholder="Nomi partecipanti..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm" />
          </div>
          <button onClick={handleCreate} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Inizia Riunione
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: events list */}
          <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Eventi da discutere</h3>
            </div>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
              {events.map(ev => (
                <button key={ev.id} onClick={() => openEventNote(ev.id)}
                  className={`w-full px-4 py-2.5 text-left flex items-center justify-between transition-colors ${
                    activeNoteEvent === ev.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {discussedEvents.has(ev.id) && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
                      <span className="text-xs font-mono text-gray-400">#{ev.eventNumber}</span>
                      <StatusBadge stato={ev.stato} />
                    </div>
                    <p className="text-sm text-gray-900 dark:text-white truncate mt-0.5">{ev.nome || '-'}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Right: note form */}
          <div className="lg:col-span-2 space-y-4">
            {activeNoteEvent && activeEvent ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    #{activeEvent.eventNumber} — {activeEvent.nome}
                  </h3>
                  <button onClick={() => navigate(`/eventi?id=${activeEvent.id}`)} className="text-xs text-blue-500 hover:underline">Apri evento</button>
                </div>

                {/* Auto-prefilled status */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Stato (auto)</p>
                  {loadingRecap === activeNoteEvent ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3 h-3 animate-spin" /> Calcolo...</div>
                  ) : recaps[activeNoteEvent] ? (
                    <RecapDisplay recap={recaps[activeNoteEvent]} />
                  ) : (
                    <p className="text-xs text-gray-400">In attesa...</p>
                  )}
                </div>

                {/* Structured fields */}
                <NoteField label="Punti discussi" value={notes[activeNoteEvent]?.punti_discussi || ''} onChange={v => updateNote(activeNoteEvent, 'punti_discussi', v)} />
                <NoteField label="Decisioni prese" value={notes[activeNoteEvent]?.decisioni || ''} onChange={v => updateNote(activeNoteEvent, 'decisioni', v)} />
                <NoteField label="Azioni da fare (chi/cosa/quando)" value={notes[activeNoteEvent]?.azioni || ''} onChange={v => updateNote(activeNoteEvent, 'azioni', v)} />
                <NoteField label="Criticità / rischi" value={notes[activeNoteEvent]?.criticita || ''} onChange={v => updateNote(activeNoteEvent, 'criticita', v)} />
                {isClosedEvent && (
                  <NoteField label="Lezioni imparate (debrief)" value={notes[activeNoteEvent]?.lezioni_imparate || ''} onChange={v => updateNote(activeNoteEvent, 'lezioni_imparate', v)} placeholder="Cosa abbiamo imparato da questo evento?" />
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 flex flex-col items-center text-center text-gray-400">
                <FileText className="w-8 h-8 mb-2" />
                <p className="text-sm">Seleziona un evento dalla lista per aggiungere le note</p>
              </div>
            )}

            {/* General meeting section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Sezione Generale</h3>
              <NoteField label="Temi generali" value={temiGenerali} onChange={setTemiGenerali} />
              <NoteField label="Decisioni trasversali" value={decisioniTrasversali} onChange={setDecisioniTrasversali} />
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salva Riunione
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NoteField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || `${label}...`} rows={3}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm resize-none" />
    </div>
  )
}

function RecapDisplay({ recap }: { recap: EventRecap }) {
  return (
    <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
      <p>Task: {recap.tasks.total} totali, {recap.tasks.completed} completati, {recap.tasks.open} aperti{recap.tasks.overdue > 0 && <span className="text-red-500"> ({recap.tasks.overdue} in ritardo)</span>}</p>
      {recap.budget && <p>Budget: {recap.budget.pctUsed}% utilizzato ({recap.budget.used.toLocaleString('it-IT')}€ / {recap.budget.total.toLocaleString('it-IT')}€)</p>}
      {recap.suppliers && <p>Fornitori: {recap.suppliers.confirmed} confermati / {recap.suppliers.total} totali</p>}
      <p>Documenti: {recap.documentsCount}</p>
    </div>
  )
}

// ─── Meeting History ─────────────────────────────────────────────────────────

function MeetingHistory({ meetings, profileMap, events, detailId, onBack, onOpenDetail }: {
  meetings: Meeting[]; profileMap: Record<string, string>; events: Event[]; detailId: string | null; onBack: () => void; onOpenDetail: (id: string) => void
}) {
  const [detail, setDetail] = useState<Meeting | null>(null)
  const [detailNotes, setDetailNotes] = useState<MeetingEventNote[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    setLoadingDetail(true)
    Promise.all([fetchMeetingById(detailId), fetchMeetingNotes(detailId)])
      .then(([m, n]) => { setDetail(m); setDetailNotes(n) })
      .finally(() => setLoadingDetail(false))
  }, [detailId])

  const eventMap = useMemo(() => {
    const m: Record<string, Event> = {}
    for (const e of events) m[e.id] = e
    return m
  }, [events])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ArrowLeft className="w-4 h-4" /></button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{detail ? 'Verbale Riunione' : 'Storico Riunioni'}</h1>
      </div>

      {loadingDetail ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : detail ? (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300 mb-4">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {detail.meeting_date}</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {profileMap[detail.created_by] || 'Sconosciuto'}</span>
            </div>
            {detail.presenti && <p className="text-xs text-gray-500 mb-2"><strong>Presenti:</strong> {detail.presenti}</p>}
            {detail.temi_generali && <div className="mb-3"><p className="text-xs font-semibold text-gray-500 mb-1">Temi generali</p><p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{detail.temi_generali}</p></div>}
            {detail.decisioni_trasversali && <div><p className="text-xs font-semibold text-gray-500 mb-1">Decisioni trasversali</p><p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{detail.decisioni_trasversali}</p></div>}
          </div>

          {detailNotes.map(note => {
            const ev = eventMap[note.event_id]
            const recap = note.stato_snapshot as EventRecap | null
            return (
              <div key={note.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
                  {ev ? `#${ev.eventNumber} — ${ev.nome}` : note.event_id}
                </h4>
                {recap && <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-3"><RecapDisplay recap={recap} /></div>}
                {note.punti_discussi && <SavedField label="Punti discussi" value={note.punti_discussi} />}
                {note.decisioni && <SavedField label="Decisioni" value={note.decisioni} />}
                {note.azioni && <SavedField label="Azioni" value={note.azioni} />}
                {note.criticita && <SavedField label="Criticità" value={note.criticita} />}
                {note.lezioni_imparate && <SavedField label="Lezioni imparate" value={note.lezioni_imparate} />}
              </div>
            )
          })}
          {detailNotes.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nessuna nota per gli eventi in questa riunione.</p>}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {meetings.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">Nessuna riunione registrata.</p>
            ) : meetings.map(m => (
              <button key={m.id} onClick={() => onOpenDetail(m.id)} className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center justify-between transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{m.meeting_date}</p>
                  <p className="text-xs text-gray-500">{profileMap[m.created_by] || 'Sconosciuto'}{m.presenti ? ` — ${m.presenti}` : ''}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SavedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{value}</p>
    </div>
  )
}
