import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Calendar, ChevronDown, ChevronRight, ArrowLeft, Save, Loader2, History, Users, X, Check } from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { fetchEvents, updateEvent } from '@/lib/events-service'
import { fetchClients, getUniqueCompanies, type UniqueCompany } from '@/lib/clients-service'
import { fetchAllProfiles } from '@/lib/profiles'
import {
  fetchMeetings, fetchMeetingById, fetchMeetingNotes,
  createMeeting, updateMeeting, upsertEventNote,
  computeEventRecap,
  type Meeting, type MeetingEventNote, type EventRecap,
} from '@/lib/meetings-service'
import type { Event } from '@/data/events'

const MANAGER_ROLES = ['Admin', 'Super Admin', 'Senior PM', 'Project Manager']
const ADMIN_ROLES = ['Admin', 'Super Admin']

function canManageMeetings(role?: string) {
  return !!role && MANAGER_ROLES.includes(role)
}
function isAdmin(role?: string) {
  return !!role && ADMIN_ROLES.includes(role)
}

const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

function meseLabel(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${MESI[d.getMonth()]} ${d.getFullYear()}`
}

function yearOf(dateStr: string): number {
  if (!dateStr) return 0
  return new Date(dateStr).getFullYear()
}

function formatDateCompact(start: string, end: string): string {
  if (!start) return '-'
  const s = new Date(start)
  const sDay = s.getDate()
  const sMon = MESI[s.getMonth()]
  const sYear = s.getFullYear()
  if (!end || start === end) return `${sDay} ${sMon} ${sYear}`
  const e = new Date(end)
  const eDay = e.getDate()
  const eMon = MESI[e.getMonth()]
  const eYear = e.getFullYear()
  if (s.getMonth() === e.getMonth() && sYear === eYear) return `${sDay}-${eDay} ${sMon} ${sYear}`
  if (sYear === eYear) return `${sDay} ${sMon} — ${eDay} ${eMon} ${sYear}`
  return `${sDay} ${sMon} ${sYear} — ${eDay} ${eMon} ${eYear}`
}

function resolveClientName(ev: Event, clientMap: Record<string, string>): string {
  if (ev.clientId && clientMap[ev.clientId]) return clientMap[ev.clientId]
  if (ev.cliente && clientMap[ev.cliente]) return clientMap[ev.cliente]
  return ev.cliente || '-'
}

const CURRENT_YEAR = new Date().getFullYear()

interface ProfileEntry { id: string; first_name: string; last_name: string }


const STATUS_OPTIONS: { value: Event['stato']; label: string }[] = [
  { value: 'bozza', label: 'Bozza' },
  { value: 'pianificazione', label: 'Pianificazione' },
  { value: 'in_corso', label: 'In Corso' },
  { value: 'completato', label: 'Completato' },
]


function StatusBadge({ stato }: { stato: string }) {
  const colorMap: Record<string, string> = {
    bozza: 'badge-yellow',
    pianificazione: 'badge-blue',
    in_corso: 'badge-green',
    completato: '',
  }
  const labels: Record<string, string> = { bozza: 'Bozza', pianificazione: 'Pianif.', in_corso: 'In Corso', completato: 'Completato' }
  const cls = colorMap[stato] || ''
  const fallbackStyle = !cls ? { background: 'var(--panel2)', color: 'var(--muted)' } : undefined
  return (
    <span className={`badge ${cls}`} style={{ padding: '2px 8px', fontSize: '11px', borderRadius: '6px', ...fallbackStyle }}>
      {labels[stato] || stato}
    </span>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function Riunioni() {
  const navigate = useNavigate()
  const user = loadUser()
  const canManage = canManageMeetings(user?.role)
  const adminUser = isAdmin(user?.role)

  const [view, setView] = useState<'overview' | 'new' | 'history' | 'detail'>('overview')
  const [events, setEvents] = useState<Event[]>([])
  const [profiles, setProfiles] = useState<ProfileEntry[]>([])
  const [clients, setClients] = useState<UniqueCompany[]>([])
  const [clientMap, setClientMap] = useState<Record<string, string>>({})
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [detailMeetingId, setDetailMeetingId] = useState<string | null>(null)

  const reload = useCallback(() => {
    return fetchEvents().then(setEvents)
  }, [])

  useEffect(() => {
    Promise.all([fetchEvents(), fetchAllProfiles(), fetchMeetings(), fetchClients()])
      .then(([ev, pr, mt, cl]) => {
        setEvents(ev)
        setProfiles(pr)
        setMeetings(mt)
        setClients(getUniqueCompanies(cl))
        const cm: Record<string, string> = {}
        for (const c of cl) { cm[c.id] = c.nome }
        setClientMap(cm)
      })
      .finally(() => setLoading(false))
  }, [])

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of profiles) m[p.id] = `${p.first_name} ${p.last_name}`.trim()
    return m
  }, [profiles])

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--muted)' }} /></div>
  }

  if (view === 'new') {
    return <NewMeeting events={events} profiles={profiles} profileMap={profileMap} clientMap={clientMap} onDone={() => { setView('overview'); fetchMeetings().then(setMeetings); reload() }} onCancel={() => setView('overview')} userRole={user?.role} onEventsChange={reload} />
  }

  if (view === 'history' || (view === 'detail' && detailMeetingId)) {
    return (
      <MeetingHistory
        meetings={meetings} profileMap={profileMap} events={events}
        detailId={detailMeetingId}
        onBack={() => { setView('overview'); setDetailMeetingId(null) }}
        onOpenDetail={(id) => { setDetailMeetingId(id); setView('detail') }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Area Riunioni</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 4 }}>Panoramica eventi e verbali riunioni settimanali</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('history')} className="btn-ghost flex items-center gap-2" style={{ fontSize: '0.85rem' }}>
            <History className="w-4 h-4" /> Storico
          </button>
          {canManage && (
            <button onClick={() => setView('new')} className="btn-primary flex items-center gap-2" style={{ padding: '8px 16px', fontSize: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
              <Plus className="w-4 h-4" /> Nuova Riunione
            </button>
          )}
        </div>
      </div>

      <EventsTable events={events} profileMap={profileMap} clientMap={clientMap} clients={clients} profiles={profiles} adminEdit={adminUser} onEventClick={id => navigate(`/eventi?id=${id}`)} onEventsChange={reload} />
    </div>
  )
}

// ─── Shared filter + sort hook ───────────────────────────────────────────────

function useEventsFilters(events: Event[]) {
  const [sortField, setSortField] = useState<string>('dataInizio')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [filterStatus, setFilterStatus] = useState('Tutti')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState<number>(CURRENT_YEAR)

  const years = useMemo(() => {
    const s = new Set<number>()
    for (const e of events) { const y = yearOf(e.dataInizio); if (y) s.add(y) }
    if (!s.has(CURRENT_YEAR)) s.add(CURRENT_YEAR)
    return [...s].sort((a, b) => b - a)
  }, [events])

  const months = useMemo(() => {
    const filtered = events.filter(e => yearOf(e.dataInizio) === filterYear)
    return [...new Set(filtered.map(e => meseLabel(e.dataInizio)).filter(Boolean))]
  }, [events, filterYear])

  const sorted = useMemo(() => {
    let list = [...events]
    list = list.filter(e => yearOf(e.dataInizio) === filterYear)
    if (filterStatus !== 'Tutti') list = list.filter(e => e.stato === filterStatus)
    if (filterMonth) list = list.filter(e => meseLabel(e.dataInizio) === filterMonth)
    list.sort((a, b) => {
      const av = (a as any)[sortField] ?? ''
      const bv = (b as any)[sortField] ?? ''
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [events, filterStatus, filterMonth, filterYear, sortField, sortDir])

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  return { sorted, sortField, sortDir, toggleSort, filterStatus, setFilterStatus, filterMonth, setFilterMonth, filterYear, setFilterYear, years, months }
}

// ─── Filter Bar ──────────────────────────────────────────────────────────────

function FilterBar({ filterStatus, setFilterStatus, filterMonth, setFilterMonth, filterYear, setFilterYear, years, months, count }: {
  filterStatus: string; setFilterStatus: (v: string) => void
  filterMonth: string; setFilterMonth: (v: string) => void
  filterYear: number; setFilterYear: (v: number) => void
  years: number[]; months: string[]; count: number
}) {
  const selectStyle: React.CSSProperties = { fontSize: '0.8rem', padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--panel2)', color: 'var(--text)' }
  return (
    <div className="flex gap-3 flex-wrap items-center" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
      <select value={filterYear} onChange={e => { setFilterYear(Number(e.target.value)); setFilterMonth('') }} style={selectStyle}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
        <option value="Tutti">Tutti gli stati</option>
        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={selectStyle}>
        <option value="">Tutti i mesi</option>
        {months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 'auto' }}>{count} eventi</span>
    </div>
  )
}

function SortHeader({ field, label, sortField, sortDir, toggleSort }: { field: string; label: string; sortField: string; sortDir: string; toggleSort: (f: string) => void }) {
  return (
    <th onClick={() => toggleSort(field)} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
      {label} {sortField === field && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  )
}

// ─── Inline Edit Cell ────────────────────────────────────────────────────────

function useCellSave(eventId: string, onSaved: () => void) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(patch: Partial<Event>) {
    setSaving(true); setError(null); setSaved(false)
    try {
      await updateEvent(eventId, patch)
      setSaved(true)
      onSaved()
      setTimeout(() => setSaved(false), 1500)
    } catch (e: any) {
      setError(e?.message || 'Errore')
      setTimeout(() => setError(null), 3000)
      throw e
    } finally {
      setSaving(false)
    }
  }

  return { saving, saved, error, save }
}

function SaveIndicator({ saving, saved, error }: { saving: boolean; saved: boolean; error: string | null }) {
  if (saving) return <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--blue)' }} />
  if (saved) return <Check className="w-3 h-3" style={{ color: 'var(--green)' }} />
  if (error) return <span style={{ fontSize: '10px', color: 'var(--red)' }} title={error}>!</span>
  return null
}

function EditableText({ value, eventId, field, onSaved, type = 'text' }: { value: string; eventId: string; field: string; onSaved: () => void; type?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const { saving, saved, error, save } = useCellSave(eventId, onSaved)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function commit() {
    setEditing(false)
    if (draft === value) return
    try {
      await save({ [field]: type === 'number' ? Number(draft) || 0 : draft })
    } catch { setDraft(value) }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1 group" onClick={e => { e.stopPropagation(); setEditing(true) }} style={{ cursor: 'text', minHeight: 24 }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text)' }} className="truncate">{value || '-'}</span>
        <SaveIndicator saving={saving} saved={saved} error={error} />
      </div>
    )
  }

  return (
    <input ref={inputRef} type={type} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
      onClick={e => e.stopPropagation()}
      style={{ fontSize: '0.8rem', padding: '2px 6px', width: '100%', border: '1px solid var(--blue)', borderRadius: 6, background: 'var(--panel-solid)', color: 'var(--text)', outline: 'none' }}
    />
  )
}

function EditableDate({ value, eventId, field, onSaved }: { value: string; eventId: string; field: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const { saving, saved, error, save } = useCellSave(eventId, onSaved)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function commit() {
    setEditing(false)
    if (draft === value) return
    try { await save({ [field]: draft }) } catch { setDraft(value) }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => { e.stopPropagation(); setEditing(true) }} style={{ cursor: 'text' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>{value || '-'}</span>
        <SaveIndicator saving={saving} saved={saved} error={error} />
      </div>
    )
  }

  return (
    <input ref={inputRef} type="date" value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
      onClick={e => e.stopPropagation()}
      style={{ fontSize: '0.8rem', padding: '2px 4px', border: '1px solid var(--blue)', borderRadius: 6, background: 'var(--panel-solid)', color: 'var(--text)', outline: 'none' }}
    />
  )
}

function EditableStatus({ value, eventId, onSaved }: { value: Event['stato']; eventId: string; onSaved: () => void }) {
  const { saving, saved, error, save } = useCellSave(eventId, onSaved)

  async function handleChange(newVal: string) {
    if (newVal === value) return
    try { await save({ stato: newVal as Event['stato'] }) } catch {}
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <select value={value} onChange={e => handleChange(e.target.value)} disabled={saving}
        style={{ fontSize: '0.75rem', padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel2)', color: 'var(--text)', cursor: 'pointer' }}>
        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <SaveIndicator saving={saving} saved={saved} error={error} />
    </div>
  )
}

function EditableClient({ value, clientId, eventId, clients, onSaved }: { value: string; clientId?: string | null; eventId: string; clients: UniqueCompany[]; onSaved: () => void }) {
  const currentId = clientId || clients.find(c => c.nome === value)?.id || ''
  const { saving, saved, error, save } = useCellSave(eventId, onSaved)

  async function handleChange(newId: string) {
    if (newId === currentId) return
    const cl = clients.find(c => c.id === newId)
    try { await save({ clientId: newId || null, cliente: cl?.nome || '' } as any) } catch {}
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <select value={currentId} onChange={e => handleChange(e.target.value)} disabled={saving}
        style={{ fontSize: '0.75rem', padding: '2px 4px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel2)', color: 'var(--text)', cursor: 'pointer', maxWidth: 130 }}>
        <option value="">—</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <SaveIndicator saving={saving} saved={saved} error={error} />
    </div>
  )
}

function EditableResponsabile({ value, eventId, profiles, onSaved }: { value: string; eventId: string; profiles: ProfileEntry[]; onSaved: () => void }) {
  const { saving, saved, error, save } = useCellSave(eventId, onSaved)

  async function handleChange(newId: string) {
    if (newId === value) return
    try { await save({ responsabile: newId }) } catch {}
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <select value={value} onChange={e => handleChange(e.target.value)} disabled={saving}
        style={{ fontSize: '0.75rem', padding: '2px 4px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel2)', color: 'var(--text)', cursor: 'pointer', maxWidth: 110 }}>
        <option value="">—</option>
        {profiles.map(p => <option key={p.id} value={p.id}>{`${p.first_name} ${p.last_name}`.trim()}</option>)}
      </select>
      <SaveIndicator saving={saving} saved={saved} error={error} />
    </div>
  )
}

// ─── Team Popover + Editable ─────────────────────────────────────────────────

function TeamCell({ ev, profileMap, teamPopover, setTeamPopover, adminEdit, profiles, onSaved }: {
  ev: Event; profileMap: Record<string, string>; teamPopover: string | null; setTeamPopover: (v: string | null) => void
  adminEdit: boolean; profiles: ProfileEntry[]; onSaved: () => void
}) {
  const { saving, saved, error, save } = useCellSave(ev.id, onSaved)
  const [adding, setAdding] = useState(false)

  async function removeMember(uid: string) {
    const next = (ev.team || []).filter(u => u !== uid)
    try { await save({ team: next }) } catch {}
  }

  async function addMember(uid: string) {
    if (ev.team?.includes(uid)) return
    const next = [...(ev.team || []), uid]
    setAdding(false)
    try { await save({ team: next }) } catch {}
  }

  return (
    <td style={{ padding: '6px 12px', position: 'relative' }}>
      <button onClick={(e) => { e.stopPropagation(); setTeamPopover(teamPopover === ev.id ? null : ev.id) }}
        style={{ fontSize: '0.8rem', color: 'var(--blue)', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none' }}>
        {ev.team?.length || 0}
      </button>
      <SaveIndicator saving={saving} saved={saved} error={error} />
      {teamPopover === ev.id && (
        <div className="panel" onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, marginTop: 4, padding: 8, minWidth: 180, boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Team ({ev.team?.length || 0})</span>
            <button onClick={() => setTeamPopover(null)} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}><X className="w-3 h-3" /></button>
          </div>
          {(ev.team || []).map(uid => (
            <div key={uid} className="flex items-center justify-between" style={{ padding: '2px 0' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>{profileMap[uid] || uid}</span>
              {adminEdit && <button onClick={() => removeMember(uid)} style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px' }}>rimuovi</button>}
            </div>
          ))}
          {adminEdit && !adding && (
            <button onClick={() => setAdding(true)} style={{ fontSize: '0.75rem', color: 'var(--blue)', marginTop: 4, background: 'none', border: 'none', cursor: 'pointer' }}>+ Aggiungi</button>
          )}
          {adminEdit && adding && (
            <select autoFocus onChange={e => { if (e.target.value) addMember(e.target.value) }} onBlur={() => setAdding(false)}
              style={{ fontSize: '0.75rem', marginTop: 4, width: '100%', padding: '2px 4px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel2)', color: 'var(--text)' }}>
              <option value="">Seleziona...</option>
              {profiles.filter(p => !ev.team?.includes(p.id)).map(p => (
                <option key={p.id} value={p.id}>{`${p.first_name} ${p.last_name}`.trim()}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </td>
  )
}

// ─── Events Table (overview — with inline editing for admins) ────────────────

function EventsTable({ events, profileMap, clientMap, clients, profiles, adminEdit, onEventClick, onEventsChange }: {
  events: Event[]; profileMap: Record<string, string>; clientMap: Record<string, string>; clients: UniqueCompany[]; profiles: ProfileEntry[]
  adminEdit: boolean; onEventClick: (id: string) => void; onEventsChange: () => void
}) {
  const filters = useEventsFilters(events)
  const [teamPopover, setTeamPopover] = useState<string | null>(null)

  const thStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap', letterSpacing: '0.03em', textTransform: 'uppercase' }
  const tdStyle: React.CSSProperties = { padding: '6px 12px', fontSize: '0.8rem', color: 'var(--text)' }
  const tdMutedStyle: React.CSSProperties = { ...tdStyle, color: 'var(--muted)' }

  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <FilterBar {...filters} count={filters.sorted.length} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <SortHeader field="nome" label="Evento" {...filters} />
              <SortHeader field="stato" label="Stato" {...filters} />
              <SortHeader field="dataInizio" label="Inizio" {...filters} />
              <SortHeader field="dataFine" label="Fine" {...filters} />
              <SortHeader field="cliente" label="Cliente" {...filters} />
              <th style={thStyle}>Luogo</th>
              <th style={thStyle}>Pax</th>
              <th style={thStyle}>Team</th>
              <th style={thStyle}>Responsabile</th>
            </tr>
          </thead>
          <tbody>
            {filters.sorted.map(ev => (
              <tr key={ev.id} onClick={() => !adminEdit && onEventClick(ev.id)}
                style={{ borderBottom: '1px solid var(--line)', cursor: adminEdit ? 'default' : 'pointer', transition: 'background var(--transition-fast)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 200 }} className="truncate">
                  {adminEdit ? <EditableText value={ev.nome} eventId={ev.id} field="nome" onSaved={onEventsChange} /> : (ev.nome || `#${ev.eventNumber ?? '-'}`)}
                </td>
                <td style={{ padding: '6px 12px' }}>
                  {adminEdit ? <EditableStatus value={ev.stato} eventId={ev.id} onSaved={onEventsChange} /> : <StatusBadge stato={ev.stato} />}
                </td>
                <td style={tdStyle}>
                  {adminEdit ? <EditableDate value={ev.dataInizio} eventId={ev.id} field="dataInizio" onSaved={onEventsChange} /> : <span style={{ whiteSpace: 'nowrap' }}>{ev.dataInizio || '-'}</span>}
                </td>
                <td style={tdStyle}>
                  {adminEdit ? <EditableDate value={ev.dataFine} eventId={ev.id} field="dataFine" onSaved={onEventsChange} /> : <span style={{ whiteSpace: 'nowrap' }}>{ev.dataFine || '-'}</span>}
                </td>
                <td style={{ ...tdStyle, maxWidth: 140 }} className="truncate">
                  {adminEdit ? <EditableClient value={resolveClientName(ev, clientMap)} clientId={ev.clientId} eventId={ev.id} clients={clients} onSaved={onEventsChange} /> : resolveClientName(ev, clientMap)}
                </td>
                <td style={{ ...tdMutedStyle, maxWidth: 120 }} className="truncate">
                  {adminEdit ? <EditableText value={ev.location} eventId={ev.id} field="location" onSaved={onEventsChange} /> : (ev.location || '-')}
                </td>
                <td style={tdMutedStyle}>
                  {adminEdit ? <EditableText value={String(ev.partecipanti || '')} eventId={ev.id} field="partecipanti" onSaved={onEventsChange} type="number" /> : (ev.partecipanti || '-')}
                </td>
                <TeamCell ev={ev} profileMap={profileMap} teamPopover={teamPopover} setTeamPopover={setTeamPopover} adminEdit={adminEdit} profiles={profiles} onSaved={onEventsChange} />
                <td style={{ ...tdMutedStyle, maxWidth: 110 }} className="truncate">
                  {adminEdit ? <EditableResponsabile value={ev.responsabile} eventId={ev.id} profiles={profiles} onSaved={onEventsChange} /> : (profileMap[ev.responsabile] || '-')}
                </td>
              </tr>
            ))}
            {filters.sorted.length === 0 && (
              <tr><td colSpan={9} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>Nessun evento trovato</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Profiles Autocomplete ───────────────────────────────────────────────────

function ProfilesAutocomplete({ profiles, value, onChange }: { profiles: ProfileEntry[]; value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedNames, setSelectedNames] = useState<string[]>(() => value ? value.split(',').map(s => s.trim()).filter(Boolean) : [])
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => {
    if (!query) return []
    const q = query.toLowerCase()
    return profiles.map(p => `${p.first_name} ${p.last_name}`.trim())
      .filter(name => name.toLowerCase().includes(q) && !selectedNames.includes(name)).slice(0, 8)
  }, [query, profiles, selectedNames])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function addName(name: string) {
    const next = [...selectedNames, name]; setSelectedNames(next); onChange(next.join(', ')); setQuery(''); inputRef.current?.focus()
  }
  function removeName(name: string) {
    const next = selectedNames.filter(n => n !== name); setSelectedNames(next); onChange(next.join(', '))
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Presenti</label>
      <div className="flex flex-wrap gap-1" style={{ padding: 6, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--panel-solid)', minHeight: 38 }}>
        {selectedNames.map(name => (
          <span key={name} className="badge badge-blue flex items-center gap-1" style={{ padding: '2px 8px', fontSize: '0.8rem' }}>
            {name}
            <button type="button" onClick={() => removeName(name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><X className="w-3 h-3" /></button>
          </span>
        ))}
        <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setShowSuggestions(true) }} onFocus={() => setShowSuggestions(true)}
          placeholder={selectedNames.length ? '' : 'Cerca partecipanti...'}
          style={{ flex: 1, minWidth: 120, background: 'transparent', fontSize: '0.85rem', outline: 'none', border: 'none', color: 'var(--text)', padding: '0 4px' }} />
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div className="panel" style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
          {suggestions.map(name => (
            <button key={name} type="button" onClick={() => addName(name)}
              style={{ width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel2)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── New Meeting (full table + click-to-annotate) ────────────────────────────

function NewMeeting({ events, profiles, profileMap, clientMap, onDone, onCancel, userRole, onEventsChange }: {
  events: Event[]; profiles: ProfileEntry[]; profileMap: Record<string, string>; clientMap: Record<string, string>
  onDone: () => void; onCancel: () => void; userRole?: string; onEventsChange: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [meetingId, setMeetingId] = useState<string | null>(null)
  const [presenti, setPresenti] = useState('')
  const [temiGenerali, setTemiGenerali] = useState('')
  const [decisioniTrasversali, setDecisioniTrasversali] = useState('')
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, Partial<MeetingEventNote>>>({})
  const [recaps, setRecaps] = useState<Record<string, EventRecap>>({})
  const [loadingRecap, setLoadingRecap] = useState<string | null>(null)
  const [eventStatuses, setEventStatuses] = useState<Record<string, Event['stato']>>({})
  const [statusSaving, setStatusSaving] = useState<string | null>(null)
  const [teamPopover, setTeamPopover] = useState<string | null>(null)
  const navigate = useNavigate()
  const filters = useEventsFilters(events)
  const adminUser = isAdmin(userRole)

  const annotatedEventIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [eid, note] of Object.entries(notes)) {
      if (note.punti_discussi || note.decisioni || note.azioni || note.criticita || note.lezioni_imparate) ids.add(eid)
    }
    return ids
  }, [notes])

  useEffect(() => {
    const map: Record<string, Event['stato']> = {}
    for (const ev of events) map[ev.id] = ev.stato
    setEventStatuses(map)
  }, [events])

  async function handleCreate() {
    setSaving(true)
    try { const m = await createMeeting({ meeting_date: new Date().toISOString().slice(0, 10), presenti }); if (m) setMeetingId(m.id) } catch {}
    setSaving(false)
  }

  async function toggleEventNote(eventId: string) {
    if (expandedEvent === eventId) { setExpandedEvent(null); return }
    setExpandedEvent(eventId)
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

  async function handleStatusChange(eventId: string, newStatus: Event['stato']) {
    setStatusSaving(eventId)
    try { await updateEvent(eventId, { stato: newStatus }); setEventStatuses(prev => ({ ...prev, [eventId]: newStatus })); onEventsChange() } catch {}
    setStatusSaving(null)
  }

  async function handleSave() {
    if (!meetingId) return
    setSaving(true)
    try {
      await updateMeeting(meetingId, { presenti, temi_generali: temiGenerali, decisioni_trasversali: decisioniTrasversali })
      for (const eventId of annotatedEventIds) {
        const n = notes[eventId] || {}
        await upsertEventNote({ meeting_id: meetingId, event_id: eventId, stato_snapshot: n.stato_snapshot || recaps[eventId] || null, punti_discussi: n.punti_discussi || null, decisioni: n.decisioni || null, azioni: n.azioni || null, criticita: n.criticita || null, lezioni_imparate: n.lezioni_imparate || null })
      }
      onDone()
    } catch {}
    setSaving(false)
  }

  const thStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap', letterSpacing: '0.03em', textTransform: 'uppercase' }
  const tdStyle: React.CSSProperties = { padding: '6px 12px', fontSize: '0.8rem', color: 'var(--text)' }
  const tdMutedStyle: React.CSSProperties = { ...tdStyle, color: 'var(--muted)' }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="btn-ghost" style={{ padding: 8 }}><ArrowLeft className="w-4 h-4" /></button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>Nuova Riunione</h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>

      {!meetingId ? (
        <div className="panel" style={{ padding: 24, maxWidth: 420 }}>
          <ProfilesAutocomplete profiles={profiles} value={presenti} onChange={setPresenti} />
          <button onClick={handleCreate} disabled={saving} className="btn-primary flex items-center gap-2" style={{ marginTop: 16, padding: '8px 16px', fontSize: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Inizia Riunione
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="panel" style={{ overflow: 'hidden' }}>
            <FilterBar {...filters} count={filters.sorted.length} />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    <th style={{ ...thStyle, width: 32 }}></th>
                    <SortHeader field="nome" label="Evento" {...filters} />
                    <SortHeader field="stato" label="Stato" {...filters} />
                    <SortHeader field="dataInizio" label="Date" {...filters} />
                    <SortHeader field="cliente" label="Cliente" {...filters} />
                    <th style={thStyle}>Luogo</th>
                    <th style={thStyle}>Pax</th>
                    <th style={thStyle}>Team</th>
                    <th style={thStyle}>Responsabile</th>
                  </tr>
                </thead>
                <tbody>
                  {filters.sorted.map(ev => {
                    const isExpanded = expandedEvent === ev.id
                    const isAnnotated = annotatedEventIds.has(ev.id)
                    const evStatus = eventStatuses[ev.id] || ev.stato
                    const isClosed = evStatus === 'completato'
                    const note = notes[ev.id] || {}
                    return (
                      <MeetingRow key={ev.id} ev={ev} evStatus={evStatus} isExpanded={isExpanded} isAnnotated={isAnnotated} isClosed={isClosed}
                        adminUser={adminUser} profileMap={profileMap} clientMap={clientMap} teamPopover={teamPopover} setTeamPopover={setTeamPopover}
                        note={note} recaps={recaps} loadingRecap={loadingRecap} statusSaving={statusSaving} profiles={profiles}
                        onToggle={() => toggleEventNote(ev.id)} onUpdateNote={(f, v) => updateNote(ev.id, f, v)}
                        onStatusChange={s => handleStatusChange(ev.id, s)} onNavigate={() => navigate(`/eventi?id=${ev.id}`)}
                        tdStyle={tdStyle} tdMutedStyle={tdMutedStyle} onEventsChange={onEventsChange} />
                    )
                  })}
                  {filters.sorted.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>Nessun evento trovato</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" style={{ padding: 20 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Sezione Generale</h3>
            <NoteField label="Temi generali" value={temiGenerali} onChange={setTemiGenerali} />
            <NoteField label="Decisioni trasversali" value={decisioniTrasversali} onChange={setDecisioniTrasversali} />
          </div>

          <div className="flex items-center justify-between">
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{annotatedEventIds.size > 0 ? `${annotatedEventIds.size} evento/i annotato/i` : 'Nessun evento annotato'}</span>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2" style={{ padding: '10px 20px', fontSize: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva Riunione
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Meeting Event Row (expandable) ──────────────────────────────────────────

function MeetingRow({ ev, evStatus, isExpanded, isAnnotated, isClosed, adminUser, profileMap, clientMap, teamPopover, setTeamPopover, note, recaps, loadingRecap, statusSaving, profiles, onToggle, onUpdateNote, onStatusChange, onNavigate, tdStyle, tdMutedStyle, onEventsChange }: {
  ev: Event; evStatus: string; isExpanded: boolean; isAnnotated: boolean; isClosed: boolean; adminUser: boolean
  profileMap: Record<string, string>; clientMap: Record<string, string>; teamPopover: string | null; setTeamPopover: (v: string | null) => void
  note: Partial<MeetingEventNote>; recaps: Record<string, EventRecap>; loadingRecap: string | null; statusSaving: string | null; profiles: ProfileEntry[]
  onToggle: () => void; onUpdateNote: (f: string, v: string) => void; onStatusChange: (s: Event['stato']) => void; onNavigate: () => void
  tdStyle: React.CSSProperties; tdMutedStyle: React.CSSProperties; onEventsChange: () => void
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--line)', cursor: 'pointer', background: isExpanded ? 'var(--panel2)' : 'transparent', transition: 'background var(--transition-fast)' }}
        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--panel2)' }}
        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}>
        <td style={{ padding: '6px 12px', textAlign: 'center' }}>
          <span className="flex items-center gap-1">
            {isAnnotated && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />}
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} /> : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />}
          </span>
        </td>
        <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 200 }} className="truncate">{ev.nome || `#${ev.eventNumber ?? '-'}`}</td>
        <td style={{ padding: '6px 12px' }}><StatusBadge stato={evStatus} /></td>
        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDateCompact(ev.dataInizio, ev.dataFine)}</td>
        <td style={{ ...tdStyle, maxWidth: 140 }} className="truncate">{resolveClientName(ev, clientMap)}</td>
        <td style={{ ...tdMutedStyle, maxWidth: 120 }} className="truncate">{ev.location || '-'}</td>
        <td style={tdMutedStyle}>{ev.partecipanti || '-'}</td>
        <TeamCell ev={ev} profileMap={profileMap} teamPopover={teamPopover} setTeamPopover={setTeamPopover} adminEdit={false} profiles={profiles} onSaved={onEventsChange} />
        <td style={{ ...tdMutedStyle, maxWidth: 100 }} className="truncate">{profileMap[ev.responsabile] || '-'}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0 }}>
            <div style={{ padding: '16px 24px', background: 'var(--panel2)', borderBottom: '1px solid var(--line)' }} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)' }}>Stato evento:</span>
                  <select value={evStatus} onChange={e => { e.stopPropagation(); onStatusChange(e.target.value as Event['stato']) }} disabled={statusSaving === ev.id}
                    style={{ fontSize: '0.8rem', padding: '3px 8px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--panel-solid)', color: 'var(--text)' }}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {statusSaving === ev.id && <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--muted)' }} />}
                  {!adminUser && <span style={{ fontSize: '10px', color: 'var(--muted)' }}>(richiede accesso)</span>}
                </div>
                <button onClick={onNavigate} style={{ fontSize: '0.8rem', color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>Apri evento</button>
              </div>

              <div className="panel" style={{ padding: 12 }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Riepilogo (auto)</p>
                {loadingRecap === ev.id ? (
                  <div className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--muted)' }} /><span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Calcolo...</span></div>
                ) : recaps[ev.id] ? <RecapDisplay recap={recaps[ev.id]} /> : <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>In attesa...</p>}
              </div>

              <NoteField label="Punti discussi" value={note.punti_discussi || ''} onChange={v => onUpdateNote('punti_discussi', v)} />
              <NoteField label="Decisioni prese" value={note.decisioni || ''} onChange={v => onUpdateNote('decisioni', v)} />
              <NoteField label="Azioni da fare (chi/cosa/quando)" value={note.azioni || ''} onChange={v => onUpdateNote('azioni', v)} />
              <NoteField label="Criticità / rischi" value={note.criticita || ''} onChange={v => onUpdateNote('criticita', v)} />
              {isClosed && <NoteField label="Lezioni imparate (debrief)" value={note.lezioni_imparate || ''} onChange={v => onUpdateNote('lezioni_imparate', v)} placeholder="Cosa abbiamo imparato?" />}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function NoteField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || `${label}...`} rows={3}
        style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--panel-solid)', color: 'var(--text)', fontSize: '0.85rem', resize: 'none' }} />
    </div>
  )
}

function RecapDisplay({ recap }: { recap: EventRecap }) {
  return (
    <div style={{ fontSize: '0.8rem', color: 'var(--text)' }} className="space-y-1">
      <p>Task: {recap.tasks.total} totali, {recap.tasks.completed} completati, {recap.tasks.open} aperti{recap.tasks.overdue > 0 && <span style={{ color: 'var(--red)' }}> ({recap.tasks.overdue} in ritardo)</span>}</p>
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
        <button onClick={onBack} className="btn-ghost" style={{ padding: 8 }}><ArrowLeft className="w-4 h-4" /></button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>{detail ? 'Verbale Riunione' : 'Storico Riunioni'}</h1>
      </div>

      {loadingDetail ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--muted)' }} /></div>
      ) : detail ? (
        <div className="space-y-4">
          <div className="panel" style={{ padding: 20 }}>
            <div className="flex items-center gap-4" style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 16 }}>
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {detail.meeting_date}</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {profileMap[detail.created_by] || 'Sconosciuto'}</span>
            </div>
            {detail.presenti && <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8 }}><strong style={{ color: 'var(--text)' }}>Presenti:</strong> {detail.presenti}</p>}
            {detail.temi_generali && <div style={{ marginBottom: 12 }}><p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Temi generali</p><p style={{ fontSize: '0.85rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{detail.temi_generali}</p></div>}
            {detail.decisioni_trasversali && <div><p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Decisioni trasversali</p><p style={{ fontSize: '0.85rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{detail.decisioni_trasversali}</p></div>}
          </div>

          {detailNotes.map(noteItem => {
            const ev = eventMap[noteItem.event_id]
            const recap = noteItem.stato_snapshot as EventRecap | null
            return (
              <div key={noteItem.id} className="panel" style={{ padding: 20 }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{ev ? (ev.nome || `#${ev.eventNumber}`) : noteItem.event_id}</h4>
                {recap && <div className="panel-2" style={{ padding: 12, marginBottom: 12 }}><RecapDisplay recap={recap} /></div>}
                {noteItem.punti_discussi && <SavedField label="Punti discussi" value={noteItem.punti_discussi} />}
                {noteItem.decisioni && <SavedField label="Decisioni" value={noteItem.decisioni} />}
                {noteItem.azioni && <SavedField label="Azioni" value={noteItem.azioni} />}
                {noteItem.criticita && <SavedField label="Criticità" value={noteItem.criticita} />}
                {noteItem.lezioni_imparate && <SavedField label="Lezioni imparate" value={noteItem.lezioni_imparate} />}
              </div>
            )
          })}
          {detailNotes.length === 0 && <p style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.85rem', color: 'var(--muted)' }}>Nessuna nota per gli eventi in questa riunione.</p>}
        </div>
      ) : (
        <div className="panel" style={{ overflow: 'hidden' }}>
          {meetings.length === 0 ? (
            <p style={{ padding: '32px 16px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--muted)' }}>Nessuna riunione registrata.</p>
          ) : meetings.map(m => (
            <button key={m.id} onClick={() => onOpenDetail(m.id)} className="flex items-center justify-between" style={{ width: '100%', padding: '12px 16px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', transition: 'background var(--transition-fast)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel2)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div>
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{m.meeting_date}</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{profileMap[m.created_by] || 'Sconosciuto'}{m.presenti ? ` — ${m.presenti}` : ''}</p>
              </div>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--muted)' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SavedField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: '0.85rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{value}</p>
    </div>
  )
}
