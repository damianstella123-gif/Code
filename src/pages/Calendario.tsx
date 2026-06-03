import { useState, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  CheckSquare,
  AlertTriangle,
  X,
  User,
  MapPin,
  Euro,
  Check,
  Play,
  LayoutGrid,
  List,
  ArrowRight,
  Tag,
  Zap,
  FileText,
} from 'lucide-react'
import { users } from '@/data/users'
import { uscite } from '@/data/amministrazione'
import { loadUser } from '@/lib/auth'
import { loadTasksFromStorage, loadEventsFromStorage, loadPraticheFromStorage, STORAGE_KEYS } from '@/lib/storage'
import { daysLeft, fmtShort, fmtLong, toISO, addDays } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Pratica } from '@/data/pratiche'

function saveTasks(t: Task[]) { localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(t)) }
function saveEvents(e: Event[]) { localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(e)) }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const DAYS_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function startOfWeek(d: Date) {
  const x = new Date(d)
  const day = x.getDay()
  x.setDate(x.getDate() - (day === 0 ? 6 : day - 1))
  return x
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }

function eventColor(ev: Event): string {
  switch (ev.stato) {
    case 'in_corso': return '#ff315f'
    case 'pianificazione': return '#4db4ff'
    case 'completato': return '#38d27d'
    default: return '#9ba3aa'
  }
}
function taskColor(t: Task): string {
  if (t.stato === 'completato') return '#38d27d'
  if (t.priorita === 'alta') return '#ff315f'
  if (t.priorita === 'media') return '#ffc24b'
  return '#9ba3aa'
}
function praticaColor(p: Pratica): string {
  if (p.stato === 'completata') return '#38d27d'
  if (p.priorita === 'alta') return '#ff9500'
  if (p.priorita === 'media') return '#ffc24b'
  return '#9ba3aa'
}
function statoTaskLabel(s: string) {
  return { da_fare: 'Da fare', in_corso: 'In corso', completato: 'Completato' }[s] ?? s
}
function prioritaLabel(p: string) {
  return { alta: 'Alta', media: 'Media', bassa: 'Bassa' }[p] ?? p
}
function userName(id: string) { return users.find(u => u.id === id)?.nome ?? id }
function userAvatar(id: string) { return users.find(u => u.id === id)?.avatar }

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'day' | 'agenda'
type CalItem = { type: 'event'; data: Event } | { type: 'task'; data: Task } | { type: 'pratica'; data: Pratica }

// ─── Detail popup ─────────────────────────────────────────────────────────────

function DetailPopup({ item, onClose, onTaskStateChange }: {
  item: CalItem
  onClose: () => void
  onTaskStateChange: (id: string, stato: Task['stato']) => void
}) {
  if (item.type === 'event') {
    const ev = item.data as Event
    const color = eventColor(ev)
    const evTasks = loadTasksFromStorage().filter(t => t.evento === ev.id)
    const completati = evTasks.filter(t => t.stato === 'completato').length
    const dl = daysLeft(ev.dataInizio)
    const resp = users.find(u => u.id === ev.responsabile)
    const spesa = uscite.filter(u => u.eventoId === ev.id).reduce((s, u) => s + u.importo, 0)

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
        onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
          style={{ background: 'var(--panel)', border: `1px solid ${color}30`, boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 40px ${color}15` }}
          onClick={e => e.stopPropagation()}>
          <div className="p-5 relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${color}15 0%, transparent 70%)`, borderBottom: '1px solid var(--line)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Evento</span>
                </div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{ev.nome}</h3>
                <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{ev.descrizione}</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0">
                <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold capitalize"
                style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                {ev.stato === 'in_corso' ? 'In Corso' : ev.stato === 'pianificazione' ? 'Pianificazione' : ev.stato === 'completato' ? 'Completato' : 'Bozza'}
              </span>
              {dl > 0 && dl <= 7 && ev.stato !== 'completato' && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,194,75,0.12)', color: 'var(--yellow)' }}>
                  <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />tra {dl}g
                </span>
              )}
            </div>
          </div>
          <div className="p-5 space-y-3">
            {[
              { icon: Clock, label: `${fmtLong(ev.dataInizio)} → ${fmtLong(ev.dataFine)}` },
              { icon: MapPin, label: ev.location },
              { icon: User, label: resp?.nome ?? '—' },
              { icon: Euro, label: `Budget €${ev.budget.toLocaleString('it-IT')}${spesa > 0 ? ` · Speso €${spesa.toLocaleString('it-IT')}` : ''}` },
            ].map((r, i) => (
              <div key={i} className="flex items-center gap-3">
                <r.icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>{r.label}</span>
              </div>
            ))}
            {evTasks.length > 0 && (
              <div className="pt-1">
                <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--muted)' }}>
                  <span>Task evento</span><span>{completati}/{evTasks.length}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${(completati / evTasks.length) * 100}%`, background: color }} />
                </div>
              </div>
            )}
            {ev.team.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Team:</span>
                <div className="flex -space-x-1">
                  {ev.team.slice(0, 6).map(uid => {
                    const av = userAvatar(uid)
                    return av ? (
                      <img key={uid} src={av} alt="" className="w-6 h-6 rounded-full border-2 object-cover"
                        style={{ borderColor: 'var(--panel)' }} />
                    ) : null
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Pratica detail
  if (item.type === 'pratica') {
    const p = item.data as Pratica
    const color = praticaColor(p)
    const dl = daysLeft(p.scadenza)
    const categoriaLabel = { contratto: 'Contratto', preventivo: 'Preventivo', permesso: 'Permesso', assicurazione: 'Assicurazione', fattura: 'Fattura', documento: 'Documento' }[p.categoria] ?? p.categoria
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
        onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
          style={{ background: 'var(--panel)', border: `1px solid ${color}30`, boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 40px ${color}15` }}
          onClick={e => e.stopPropagation()}>
          <div className="p-5"
            style={{ background: `linear-gradient(135deg, ${color}12 0%, transparent 70%)`, borderBottom: '1px solid var(--line)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Pratica</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>{categoriaLabel}</span>
                </div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{p.titolo}</h3>
                <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{p.descrizione}</p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0">
                <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
              <span className="text-sm" style={{ color: dl < 0 ? 'var(--red2)' : 'var(--text)' }}>
                Scadenza: {fmtLong(p.scadenza)} {dl < 0 ? `(${Math.abs(dl)}g scaduto)` : dl <= 3 ? `(tra ${dl}g)` : ''}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
              <span className="text-sm" style={{ color: 'var(--text)' }}>Controparte: {p.controparte}</span>
            </div>
            {p.importo && (
              <div className="flex items-center gap-3">
                <Euro className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>
                  Importo: {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(p.importo)}
                </span>
              </div>
            )}
            {p.note && (
              <div className="pt-2" style={{ borderTop: '1px solid var(--line)' }}>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{p.note}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Task detail
  const t = item.data as Task
  const color = taskColor(t)
  const dl = daysLeft(t.scadenza)
  const assegnatario = users.find(u => u.id === t.assegnatario)
  const STATES: Task['stato'][] = ['da_fare', 'in_corso', 'completato']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--panel)', border: `1px solid ${color}30`, boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 40px ${color}15` }}
        onClick={e => e.stopPropagation()}>
        <div className="p-5"
          style={{ background: `linear-gradient(135deg, ${color}12 0%, transparent 70%)`, borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CheckSquare className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Task</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>{prioritaLabel(t.priorita)}</span>
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{t.titolo}</h3>
              <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{t.descrizione}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0">
              <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
              {statoTaskLabel(t.stato)}
            </span>
            {dl < 0 && t.stato !== 'completato' && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,49,95,0.1)', color: 'var(--red2)' }}>
                <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />{Math.abs(dl)}g scaduto
              </span>
            )}
            {dl >= 0 && dl <= 3 && t.stato !== 'completato' && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,194,75,0.12)', color: 'var(--yellow)' }}>
                <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />tra {dl}g
              </span>
            )}
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
            <span className="text-sm" style={{ color: dl < 0 && t.stato !== 'completato' ? 'var(--red2)' : 'var(--text)' }}>
              Scadenza: {fmtLong(t.scadenza)}
            </span>
          </div>
          {assegnatario && (
            <div className="flex items-center gap-3">
              <img src={assegnatario.avatar} alt="" className="w-6 h-6 rounded-lg object-cover" />
              <span className="text-sm" style={{ color: 'var(--text)' }}>{assegnatario.nome}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{assegnatario.ruolo}</span>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>Cambia stato rapido</p>
            <div className="grid grid-cols-3 gap-2">
              {STATES.map(s => {
                const active = t.stato === s
                const sc = s === 'completato' ? 'var(--green)' : s === 'in_corso' ? 'var(--blue)' : 'var(--muted)'
                return (
                  <button key={s} onClick={() => { onTaskStateChange(t.id, s); onClose() }}
                    className="py-2.5 rounded-xl text-xs font-medium transition-all"
                    style={{
                      background: active ? `${sc}18` : 'var(--panel2)',
                      color: active ? sc : 'var(--muted)',
                      border: `1px solid ${active ? sc + '40' : 'var(--line)'}`,
                    }}>
                    {s === 'completato'
                      ? <Check className="w-3.5 h-3.5 mx-auto mb-0.5" />
                      : s === 'in_corso'
                        ? <Play className="w-3.5 h-3.5 mx-auto mb-0.5" />
                        : <Clock className="w-3.5 h-3.5 mx-auto mb-0.5" />}
                    {statoTaskLabel(s)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Calendar pill ────────────────────────────────────────────────────────────

function CalPill({ item, onClick, onDragStart }: {
  item: CalItem
  onClick: () => void
  onDragStart?: (e: React.DragEvent) => void
}) {
  const color = item.type === 'event'
    ? eventColor(item.data as Event)
    : item.type === 'task'
      ? taskColor(item.data as Task)
      : praticaColor(item.data as Pratica)
  const label = item.type === 'event'
    ? (item.data as Event).nome
    : item.type === 'task'
      ? (item.data as Task).titolo
      : (item.data as Pratica).titolo
  const urgent = item.type === 'task' && (item.data as Task).priorita === 'alta' && (item.data as Task).stato !== 'completato'
  const dl = item.type === 'event'
    ? daysLeft((item.data as Event).dataInizio)
    : item.type === 'task'
      ? daysLeft((item.data as Task).scadenza)
      : daysLeft((item.data as Pratica).scadenza)
  const isDone = item.type === 'event'
    ? (item.data as Event).stato === 'completato'
    : item.type === 'task'
      ? (item.data as Task).stato === 'completato'
      : (item.data as Pratica).stato === 'completata'
  const isOverdue = dl < 0 && !isDone

  return (
    <div draggable={!!onDragStart} onDragStart={onDragStart}
      onClick={e => { e.stopPropagation(); onClick() }}
      className="truncate rounded px-1.5 py-0.5 text-xs font-medium cursor-pointer transition-all hover:brightness-110 select-none"
      style={{
        background: `${color}20`,
        color,
        borderLeft: `3px solid ${color}`,
        border: `1px solid ${color}30`,
        borderLeftWidth: 3,
        opacity: isDone && item.type !== 'event' ? 0.5 : 1,
        outline: isOverdue ? `1px dashed ${color}60` : 'none',
      }}>
      {urgent && <Zap style={{ display: 'inline', width: 9, height: 9, marginRight: 2, marginBottom: 1 }} />}
      {label}
    </div>
  )
}

// ─── Monthly view ─────────────────────────────────────────────────────────────

function MonthView({ current, items, today, onItemClick, onDayClick, onMoveItem }: {
  current: Date; items: CalItem[]; today: Date
  onItemClick: (item: CalItem) => void
  onDayClick: (d: Date) => void
  onMoveItem: (id: string, type: 'event' | 'task', newDate: string) => void
}) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; type: 'event' | 'task' } | null>(null)

  const monthStart = startOfMonth(current)
  const calStart = startOfWeek(monthStart)
  const cells: Date[] = []
  for (let d = new Date(calStart); cells.length < 42; d = addDays(d, 1)) cells.push(new Date(d))

  function getForDay(day: Date): CalItem[] {
    return items.filter(item => {
      if (item.type === 'event') {
        const ev = item.data as Event
        return day >= new Date(ev.dataInizio) && day <= new Date(ev.dataFine)
      }
      if (item.type === 'pratica') {
        return sameDay(day, new Date((item.data as Pratica).scadenza))
      }
      return sameDay(day, new Date((item.data as Task).scadenza))
    })
  }

  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--line)' }}>
        {DAYS_IT.map((d, i) => (
          <div key={d} className="py-2.5 text-center text-xs font-semibold"
            style={{ color: i === 0 || i === 6 ? 'rgba(155,163,170,0.45)' : 'var(--muted)' }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const isToday = sameDay(day, today)
          const isCurrentMonth = day.getMonth() === current.getMonth()
          const dayItems = getForDay(day)
          const iso = toISO(day)
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          const isOver = dragOver === iso

          return (
            <div key={idx}
              className="min-h-[90px] border-b border-r last-of-type:border-r-0 relative cursor-pointer"
              style={{
                borderColor: 'var(--line)',
                background: isOver ? 'rgba(208,0,58,0.07)' : isToday ? 'rgba(77,180,255,0.04)' : 'transparent',
              }}
              onDragOver={e => { e.preventDefault(); setDragOver(iso) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => {
                e.preventDefault(); setDragOver(null)
                if (dragging) onMoveItem(dragging.id, dragging.type, iso)
                setDragging(null)
              }}
              onClick={() => onDayClick(day)}>
              <div className="flex items-center justify-center w-6 h-6 mx-1 mt-1 rounded-full"
                style={{
                  background: isToday ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'transparent',
                  color: isToday ? 'white' : isCurrentMonth ? (isWeekend ? 'rgba(155,163,170,0.5)' : 'var(--text)') : 'rgba(155,163,170,0.25)',
                  fontSize: 11, fontWeight: isToday ? 700 : 400,
                }}>
                {day.getDate()}
              </div>
              <div className="px-1 pb-1 space-y-0.5 mt-0.5">
                {dayItems.slice(0, 3).map(item => {
                  const id = item.type === 'event' ? (item.data as Event).id : item.type === 'task' ? (item.data as Task).id : (item.data as Pratica).id
                  return (
                    <CalPill key={id} item={item}
                      onClick={() => onItemClick(item)}
                      onDragStart={item.type !== 'pratica' ? e => {
                        setDragging({ id, type: item.type as 'event' | 'task' })
                        e.dataTransfer.setData('text/plain', `${item.type}:${id}`)
                      } : undefined} />
                  )
                })}
                {dayItems.length > 3 && (
                  <div className="text-xs pl-1" style={{ color: 'var(--muted)' }}>+{dayItems.length - 3}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Weekly view ──────────────────────────────────────────────────────────────

function WeekView({ weekStart, items, today, onItemClick, onMoveItem }: {
  weekStart: Date; items: CalItem[]; today: Date
  onItemClick: (item: CalItem) => void
  onMoveItem: (id: string, type: 'event' | 'task', newDate: string) => void
}) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; type: 'event' | 'task' } | null>(null)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  function getForDay(day: Date): CalItem[] {
    return items.filter(item => {
      if (item.type === 'event') {
        const ev = item.data as Event
        return day >= new Date(ev.dataInizio) && day <= new Date(ev.dataFine)
      }
      if (item.type === 'pratica') {
        return sameDay(day, new Date((item.data as Pratica).scadenza))
      }
      return sameDay(day, new Date((item.data as Task).scadenza))
    })
  }

  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--line)' }}>
        {days.map((day, i) => {
          const isToday = sameDay(day, today)
          return (
            <div key={i} className="py-3 px-1.5 border-r last:border-r-0 text-center"
              style={{ borderColor: 'var(--line)', background: isToday ? 'rgba(77,180,255,0.04)' : 'transparent' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{DAYS_IT[day.getDay()]}</p>
              <div className="w-8 h-8 flex items-center justify-center mx-auto mt-1 rounded-full text-sm font-semibold"
                style={{
                  background: isToday ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'transparent',
                  color: isToday ? 'white' : 'var(--text)',
                }}>
                {day.getDate()}
              </div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{MONTHS_IT[day.getMonth()].slice(0, 3)}</p>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-7" style={{ minHeight: 300 }}>
        {days.map((day, i) => {
          const iso = toISO(day)
          const dayItems = getForDay(day)
          const isToday = sameDay(day, today)
          const isOver = dragOver === iso
          return (
            <div key={i} className="border-r last:border-r-0 p-1.5 space-y-1"
              style={{
                borderColor: 'var(--line)',
                background: isOver ? 'rgba(208,0,58,0.07)' : isToday ? 'rgba(77,180,255,0.03)' : 'transparent',
                minHeight: 200,
              }}
              onDragOver={e => { e.preventDefault(); setDragOver(iso) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => {
                e.preventDefault(); setDragOver(null)
                if (dragging) onMoveItem(dragging.id, dragging.type, iso)
                setDragging(null)
              }}>
              {dayItems.map(item => {
                const id = item.type === 'event' ? (item.data as Event).id : item.type === 'task' ? (item.data as Task).id : (item.data as Pratica).id
                return (
                  <CalPill key={id} item={item}
                    onClick={() => onItemClick(item)}
                    onDragStart={item.type !== 'pratica' ? e => {
                      setDragging({ id, type: item.type as 'event' | 'task' })
                      e.dataTransfer.setData('text/plain', `${item.type}:${id}`)
                    } : undefined} />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Day view ─────────────────────────────────────────────────────────────────

function DayView({ day, items, onItemClick }: {
  day: Date; items: CalItem[]; onItemClick: (item: CalItem) => void
}) {
  const dayItems = items.filter(item => {
    if (item.type === 'event') {
      const ev = item.data as Event
      return day >= new Date(ev.dataInizio) && day <= new Date(ev.dataFine)
    }
    if (item.type === 'pratica') {
      return sameDay(day, new Date((item.data as Pratica).scadenza))
    }
    return sameDay(day, new Date((item.data as Task).scadenza))
  })

  if (dayItems.length === 0) {
    return (
      <div className="panel p-12 text-center">
        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: 'var(--muted)' }} />
        <p style={{ color: 'var(--muted)' }}>Nessuna attività per questo giorno</p>
      </div>
    )
  }

  const evItems = dayItems.filter(i => i.type === 'event')
  const taskItems = dayItems.filter(i => i.type === 'task')
  const praticaItems = dayItems.filter(i => i.type === 'pratica')
  const blocks = [
    { label: 'Mattina', range: '08:00 – 12:00', emoji: '🌅', items: evItems.slice(0, Math.ceil(evItems.length / 2)) },
    { label: 'Pomeriggio', range: '13:00 – 18:00', emoji: '☀️', items: evItems.slice(Math.ceil(evItems.length / 2)) },
    { label: 'Scadenze task', range: 'Task del giorno', emoji: '📋', items: taskItems },
    { label: 'Pratiche', range: 'Scadenze pratiche', emoji: '📄', items: praticaItems },
  ].filter(b => b.items.length > 0)

  return (
    <div className="space-y-3">
      <div className="panel p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
            <span className="text-white font-bold text-xl leading-none">{day.getDate()}</span>
            <span className="text-white text-xs opacity-80">{MONTHS_IT[day.getMonth()].slice(0, 3)}</span>
          </div>
          <div>
            <p className="font-bold" style={{ color: 'var(--text)' }}>{DAYS_FULL[day.getDay()]}</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {dayItems.length} attività · {evItems.length} eventi · {taskItems.length} task
            </p>
          </div>
        </div>
      </div>
      {blocks.map((block, bi) => (
        <div key={bi} className="panel p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base leading-none">{block.emoji}</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{block.label}</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{block.range}</p>
            </div>
          </div>
          <div className="space-y-2 pl-4 border-l-2" style={{ borderColor: 'var(--line)' }}>
            {block.items.map(item => {
              const color = item.type === 'event'
                ? eventColor(item.data as Event)
                : item.type === 'task'
                  ? taskColor(item.data as Task)
                  : praticaColor(item.data as Pratica)
              const label = item.type === 'event'
                ? (item.data as Event).nome
                : item.type === 'task'
                  ? (item.data as Task).titolo
                  : (item.data as Pratica).titolo
              const sub = item.type === 'event'
                ? (item.data as Event).location
                : item.type === 'task'
                  ? `Assegnato a ${userName((item.data as Task).assegnatario)}`
                  : (item.data as Pratica).controparte
              const urgent = item.type === 'task' && (item.data as Task).priorita === 'alta' && (item.data as Task).stato !== 'completato'
              const id = item.type === 'event'
                ? (item.data as Event).id
                : item.type === 'task'
                  ? (item.data as Task).id
                  : (item.data as Pratica).id
              return (
                <button key={item.type + id}
                  onClick={() => onItemClick(item)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:brightness-110"
                  style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                  <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {urgent && <Zap className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--red2)' }} />}
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{label}</p>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{sub}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{ background: `${color}18`, color }}>
                    {item.type === 'event'
                      ? (item.data as Event).stato
                      : item.type === 'task'
                        ? statoTaskLabel((item.data as Task).stato)
                        : (item.data as Pratica).categoria}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Agenda view ──────────────────────────────────────────────────────────────

function AgendaView({ items, onItemClick }: { items: CalItem[]; onItemClick: (item: CalItem) => void }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function getItemDate(item: CalItem): string {
    if (item.type === 'event') return (item.data as Event).dataInizio
    if (item.type === 'pratica') return (item.data as Pratica).scadenza
    return (item.data as Task).scadenza
  }
  function isItemDone(item: CalItem): boolean {
    if (item.type === 'event') return (item.data as Event).stato === 'completato'
    if (item.type === 'pratica') return (item.data as Pratica).stato === 'completata'
    return (item.data as Task).stato === 'completato'
  }

  const overdue = items.filter(item => {
    return new Date(getItemDate(item)) < today && !isItemDone(item)
  })

  const upcoming = [...items]
    .filter(item => new Date(getItemDate(item)) >= today)
    .sort((a, b) => getItemDate(a).localeCompare(getItemDate(b)))

  const grouped: Record<string, CalItem[]> = {}
  upcoming.forEach(item => {
    const iso = getItemDate(item)
    ;(grouped[iso] ??= []).push(item)
  })

  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <div className="panel p-4" style={{ borderLeft: '3px solid var(--red2)' }}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--red2)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--red2)' }}>
              Scaduti senza completamento ({overdue.length})
            </p>
          </div>
          <div className="space-y-1.5">
            {overdue.map(item => {
              const color = item.type === 'event'
                ? eventColor(item.data as Event)
                : item.type === 'task'
                  ? taskColor(item.data as Task)
                  : praticaColor(item.data as Pratica)
              const label = item.type === 'event'
                ? (item.data as Event).nome
                : item.type === 'task'
                  ? (item.data as Task).titolo
                  : (item.data as Pratica).titolo
              const d = getItemDate(item)
              const id = item.type === 'event'
                ? (item.data as Event).id
                : item.type === 'task'
                  ? (item.data as Task).id
                  : (item.data as Pratica).id
              const typeLabel = item.type === 'event' ? 'Evento' : item.type === 'task' ? 'Task' : 'Pratica'
              return (
                <button key={item.type + id} onClick={() => onItemClick(item)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all hover:bg-white/5">
                  <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{label}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{fmtShort(d)} · {typeLabel}</p>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--red2)' }}>{Math.abs(daysLeft(d))}g fa</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {Object.entries(grouped).length === 0 && overdue.length === 0 && (
        <div className="panel p-10 text-center">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: 'var(--muted)' }} />
          <p style={{ color: 'var(--muted)' }}>Nessuna scadenza imminente</p>
        </div>
      )}

      {Object.entries(grouped).map(([iso, dayItems]) => {
        const day = new Date(iso)
        const dl = daysLeft(iso)
        const isToday = sameDay(day, today)
        const isTomorrow = dl === 1
        const urgent = dl <= 3
        return (
          <div key={iso} className="panel overflow-hidden"
            style={{ borderLeft: urgent ? `3px solid ${dl <= 0 ? 'var(--red2)' : dl <= 2 ? 'var(--red2)' : 'var(--yellow)'}` : undefined }}>
            <div className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid var(--line)', background: 'rgba(255,255,255,0.015)' }}>
              <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: isToday ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'var(--panel2)' }}>
                <span style={{ color: isToday ? 'white' : 'var(--text)', fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
                  {day.getDate()}
                </span>
                <span style={{ color: isToday ? 'rgba(255,255,255,0.8)' : 'var(--muted)', fontSize: 10 }}>
                  {MONTHS_IT[day.getMonth()].slice(0, 3)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {isToday ? 'Oggi' : isTomorrow ? 'Domani' : DAYS_FULL[day.getDay()]}
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{dayItems.length} attività</p>
              </div>
              {dl >= 0 && dl <= 7 && !isToday && (
                <span className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                  style={{
                    background: dl <= 2 ? 'rgba(255,49,95,0.1)' : 'rgba(255,194,75,0.1)',
                    color: dl <= 2 ? 'var(--red2)' : 'var(--yellow)',
                  }}>
                  tra {dl}g
                </span>
              )}
            </div>
            <div>
              {dayItems.map((item, ii) => {
                const color = item.type === 'event'
                  ? eventColor(item.data as Event)
                  : item.type === 'task'
                    ? taskColor(item.data as Task)
                    : praticaColor(item.data as Pratica)
                const label = item.type === 'event'
                  ? (item.data as Event).nome
                  : item.type === 'task'
                    ? (item.data as Task).titolo
                    : (item.data as Pratica).titolo
                const sub = item.type === 'event'
                  ? (item.data as Event).location
                  : item.type === 'task'
                    ? `${statoTaskLabel((item.data as Task).stato)} · ${prioritaLabel((item.data as Task).priorita)}`
                    : `${(item.data as Pratica).categoria} · ${(item.data as Pratica).controparte}`
                const id = item.type === 'event'
                  ? (item.data as Event).id
                  : item.type === 'task'
                    ? (item.data as Task).id
                    : (item.data as Pratica).id
                const urgentItem = item.type === 'task' && (item.data as Task).priorita === 'alta' && (item.data as Task).stato !== 'completato'
                return (
                  <button key={item.type + id}
                    onClick={() => onItemClick(item)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-white/5"
                    style={{ borderTop: ii > 0 ? '1px solid var(--line)' : 'none' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}18` }}>
                      {item.type === 'event'
                        ? <Calendar className="w-3.5 h-3.5" style={{ color }} />
                        : item.type === 'task'
                          ? <CheckSquare className="w-3.5 h-3.5" style={{ color }} />
                          : <FileText className="w-3.5 h-3.5" style={{ color }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {urgentItem && <Zap className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--red2)' }} />}
                        <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{label}</p>
                      </div>
                      <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{sub}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Calendario() {
  const [allTasks, setAllTasks] = useState<Task[]>(() => loadTasksFromStorage())
  const [allEvents] = useState<Event[]>(() => loadEventsFromStorage())
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t
  })
  const [selectedItem, setSelectedItem] = useState<CalItem | null>(null)
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }, [])

  const currentUser = loadUser()
  const ruolo = currentUser?.ruolo ?? 'Admin'

  // Permission-filtered visible items
  const visibleItems = useMemo((): CalItem[] => {
    let filteredEvents = allEvents
    let filteredTasks = allTasks

    if (ruolo === 'Operativo') {
      filteredTasks = allTasks.filter(t => t.assegnatario === currentUser?.id)
      filteredEvents = []
    } else if (ruolo === 'Finance') {
      filteredEvents = allEvents
      filteredTasks = allTasks.filter(t => !t.evento)
    } else if (ruolo === 'Commerciale') {
      filteredEvents = allEvents.filter(e =>
        e.responsabile === currentUser?.id || e.team.includes(currentUser?.id ?? ''))
      filteredTasks = allTasks.filter(t => t.assegnatario === currentUser?.id)
    } else if (ruolo === 'Fornitore') {
      filteredEvents = []
      filteredTasks = allTasks.filter(t => t.assegnatario === currentUser?.id)
    } else if (ruolo === 'Manager') {
      filteredEvents = allEvents.filter(e =>
        e.responsabile === currentUser?.id || e.team.includes(currentUser?.id ?? ''))
      const myIds = filteredEvents.map(e => e.id)
      filteredTasks = allTasks.filter(t =>
        t.assegnatario === currentUser?.id || (t.evento && myIds.includes(t.evento)))
    }

    const visiblePratiche = loadPraticheFromStorage().filter(p => p.stato !== 'completata')

    return [
      ...filteredEvents.map(e => ({ type: 'event' as const, data: e })),
      ...filteredTasks.map(t => ({ type: 'task' as const, data: t })),
      ...visiblePratiche.map(p => ({ type: 'pratica' as const, data: p })),
    ]
  }, [allTasks, allEvents, ruolo, currentUser])

  function handleTaskStateChange(id: string, stato: Task['stato']) {
    const updated = allTasks.map(t => t.id === id ? { ...t, stato } : t)
    setAllTasks(updated)
    saveTasks(updated)
  }

  function handleMoveItem(id: string, type: 'event' | 'task', newDate: string) {
    if (type === 'task') {
      const updated = allTasks.map(t => t.id === id ? { ...t, scadenza: newDate } : t)
      setAllTasks(updated)
      saveTasks(updated)
    } else {
      const updated = allEvents.map(e => {
        if (e.id !== id) return e
        const diffMs = new Date(newDate).getTime() - new Date(e.dataInizio).getTime()
        return {
          ...e,
          dataInizio: newDate,
          dataFine: new Date(new Date(e.dataFine).getTime() + diffMs).toISOString().slice(0, 10),
        }
      })
      saveEvents(updated)
    }
  }

  const weekStart = useMemo(() => startOfWeek(cursor), [cursor])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  const navLabel = useMemo(() => {
    if (view === 'month') return `${MONTHS_IT[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (view === 'week') return `${fmtShort(toISO(weekStart))} – ${fmtShort(toISO(weekEnd))}`
    if (view === 'day') return `${DAYS_FULL[cursor.getDay()]} ${cursor.getDate()} ${MONTHS_IT[cursor.getMonth()]}`
    return 'Prossime scadenze'
  }, [view, cursor, weekStart, weekEnd])

  function navigate(dir: -1 | 1) {
    if (view === 'month') setCursor(d => { const x = new Date(d); x.setMonth(x.getMonth() + dir); return x })
    else if (view === 'week') setCursor(d => addDays(d, dir * 7))
    else if (view === 'day') setCursor(d => addDays(d, dir))
  }

  const urgentTasks = allTasks.filter(t => t.priorita === 'alta' && t.stato !== 'completato')
  const overdueItems = visibleItems.filter(item => {
    const d = item.type === 'event'
      ? (item.data as Event).dataInizio
      : item.type === 'task'
        ? (item.data as Task).scadenza
        : (item.data as Pratica).scadenza
    const done = item.type === 'event'
      ? (item.data as Event).stato === 'completato'
      : item.type === 'task'
        ? (item.data as Task).stato === 'completato'
        : (item.data as Pratica).stato === 'completata'
    return new Date(d) < today && !done
  })
  const thisWeekItems = visibleItems.filter(item => {
    const d = item.type === 'event'
      ? (item.data as Event).dataInizio
      : item.type === 'task'
        ? (item.data as Task).scadenza
        : (item.data as Pratica).scadenza
    const di = new Date(d)
    return di >= today && di <= addDays(today, 7)
  })

  return (
    <div className="space-y-5">
      {/* Header + view switcher */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Calendario</h1>
          <p className="mt-1 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
            Pianificazione e scadenze
            {ruolo !== 'Admin' && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(77,180,255,0.1)', color: 'var(--blue)' }}>
                Vista {ruolo}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          {([
            { id: 'month' as ViewMode, icon: LayoutGrid, label: 'Mese' },
            { id: 'week' as ViewMode, icon: Calendar, label: 'Settimana' },
            { id: 'day' as ViewMode, icon: Clock, label: 'Giorno' },
            { id: 'agenda' as ViewMode, icon: List, label: 'Agenda' },
          ]).map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: view === v.id ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'transparent',
                color: view === v.id ? 'white' : 'var(--muted)',
              }}>
              <v.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Task urgenti', value: urgentTasks.length, color: urgentTasks.length > 0 ? 'var(--red2)' : 'var(--green)', icon: Zap },
          { label: 'Scaduti', value: overdueItems.length, color: overdueItems.length > 0 ? 'var(--yellow)' : 'var(--muted)', icon: AlertTriangle },
          { label: 'Questa settimana', value: thisWeekItems.length, color: 'var(--blue)', icon: Calendar },
          { label: 'Attività visibili', value: visibleItems.length, color: 'var(--text)', icon: Tag },
        ].map((kpi, i) => (
          <div key={i} className="panel p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${kpi.color}18` }}>
              <kpi.icon className="w-4.5 h-4.5" style={{ color: kpi.color, width: 18, height: 18 }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{kpi.label}</p>
              <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
        {[
          { label: 'Evento in corso', color: '#ff315f' },
          { label: 'Pianificazione', color: '#4db4ff' },
          { label: 'Completato', color: '#38d27d' },
          { label: 'Task urgente', color: '#ff315f' },
          { label: 'Task media', color: '#ffc24b' },
          { label: 'Inattivo/bozza', color: '#9ba3aa' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Navigation */}
      {view !== 'agenda' && (
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:bg-white/10"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
            <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text)' }} />
          </button>
          <button onClick={() => { const t = new Date(); t.setHours(0,0,0,0); setCursor(t) }}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            Oggi
          </button>
          <span className="flex-1 text-center text-sm font-semibold" style={{ color: 'var(--text)' }}>{navLabel}</span>
          <button onClick={() => navigate(1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:bg-white/10"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--text)' }} />
          </button>
        </div>
      )}

      {/* Views */}
      {view === 'month' && (
        <MonthView
          current={cursor} items={visibleItems} today={today}
          onItemClick={setSelectedItem}
          onDayClick={d => { setCursor(d); setView('day') }}
          onMoveItem={handleMoveItem}
        />
      )}
      {view === 'week' && (
        <WeekView
          weekStart={weekStart} items={visibleItems} today={today}
          onItemClick={setSelectedItem}
          onMoveItem={handleMoveItem}
        />
      )}
      {view === 'day' && (
        <DayView day={cursor} items={visibleItems} onItemClick={setSelectedItem} />
      )}
      {view === 'agenda' && (
        <AgendaView items={visibleItems} onItemClick={setSelectedItem} />
      )}

      {/* Detail popup */}
      {selectedItem && (
        <DetailPopup
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onTaskStateChange={handleTaskStateChange}
        />
      )}
    </div>
  )
}
