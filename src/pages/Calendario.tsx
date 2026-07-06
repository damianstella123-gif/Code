import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Tag,
  Zap,
  FileText,
  Bell,
  Trash2,
  Edit3,
  Layers,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { daysLeft, fmtShort, fmtLong, toISO, addDays } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Pratica } from '@/data/pratiche'
import type { Uscita } from '@/data/amministrazione'
import { fetchEvents, upsertEvent, moveEventWithTimelineShift, resizeEventOnly } from '@/lib/events-service'
import { fetchTasks, upsertTask, changeTaskStatus } from '@/lib/tasks-service'
import { fetchPractices, upsertPractice } from '@/lib/practices-service'
import { fetchBudgets } from '@/lib/budgets-service'
import { fetchCreativeProjects, type CreativeProject } from '@/lib/creative-service'
import { fetchSocialContents, type SocialContent } from '@/lib/social-service'
import { supabase } from '@/lib/supabase'

// ─── Calendar Item type ──────────────────────────────────────────────────────

export interface CalendarItem {
  id: string
  user_id: string
  title: string
  description: string
  item_type: 'promemoria' | 'evento' | 'scadenza' | 'task'
  start_date: string
  end_date: string | null
  alert: 'none' | '10min' | '1h' | '1d' | '1w'
  created_at: string
}

const ALERT_LABELS: Record<string, string> = {
  none: 'Nessun alert',
  '10min': '10 minuti prima',
  '1h': '1 ora prima',
  '1d': '1 giorno prima',
  '1w': '1 settimana prima',
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  promemoria: 'Promemoria',
  evento: 'Evento',
  scadenza: 'Scadenza',
  task: 'Task',
}

async function fetchCalendarItems(): Promise<CalendarItem[]> {
  const { data, error } = await supabase
    .from('calendar_items')
    .select('*')
    .order('start_date', { ascending: true })
  if (error) { console.error('fetchCalendarItems:', error.message); return [] }
  return (data ?? []) as CalendarItem[]
}

async function upsertCalendarItem(item: Partial<CalendarItem> & { title: string; start_date: string }): Promise<CalendarItem | null> {
  if (item.id) {
    const { data, error } = await supabase
      .from('calendar_items')
      .update({ ...item, updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .select()
      .maybeSingle()
    if (error) { console.error('upsertCalendarItem update:', error.message); return null }
    return data as CalendarItem
  }
  const { data, error } = await supabase
    .from('calendar_items')
    .insert(item)
    .select()
    .maybeSingle()
  if (error) { console.error('upsertCalendarItem insert:', error.message); return null }
  return data as CalendarItem
}

async function deleteCalendarItem(id: string): Promise<boolean> {
  const { error } = await supabase.from('calendar_items').delete().eq('id', id)
  if (error) { console.error('deleteCalendarItem:', error.message); return false }
  return true
}

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
function creativeColor(c: CreativeProject): string {
  if (c.status === 'completato') return '#38d27d'
  if (c.status === 'in_lavorazione') return '#a855f7'
  if (c.status === 'in_revisione') return '#ffc24b'
  return '#e879a0'
}
function socialColor(s: SocialContent): string {
  if (s.status === 'pubblicato') return '#38d27d'
  if (s.status === 'approvato') return '#4db4ff'
  if (s.status === 'in_lavorazione') return '#ffc24b'
  return '#f97316'
}
function memoColor(m: CalendarItem): string {
  switch (m.item_type) {
    case 'promemoria': return '#a78bfa'
    case 'evento': return '#4db4ff'
    case 'scadenza': return '#ffc24b'
    case 'task': return '#38d27d'
    default: return '#a78bfa'
  }
}
function statoTaskLabel(s: string) {
  return { da_fare: 'Da fare', in_corso: 'In corso', completato: 'Completato' }[s] ?? s
}
function prioritaLabel(p: string) {
  return { alta: 'Alta', media: 'Media', bassa: 'Bassa' }[p] ?? p
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'day' | 'agenda'
type CalItem =
  | { type: 'event'; data: Event }
  | { type: 'task'; data: Task }
  | { type: 'pratica'; data: Pratica }
  | { type: 'creative'; data: CreativeProject }
  | { type: 'social'; data: SocialContent }
  | { type: 'memo'; data: CalendarItem }

// ─── Detail popup ─────────────────────────────────────────────────────────────

function DetailPopup({ item, allTasks, allUscite, onClose, onTaskStateChange, onMemoEdit, onMemoDelete, onEventEditDates, onOpenTimeline }: {
  item: CalItem
  allTasks: Task[]
  allUscite: Uscita[]
  onClose: () => void
  onTaskStateChange: (id: string, stato: Task['stato']) => void
  onMemoEdit: (item: CalendarItem) => void
  onMemoDelete: (id: string) => void
  onEventEditDates: (ev: Event) => void
  onOpenTimeline: (ev: Event) => void
}) {
  if (item.type === 'memo') {
    const m = item.data as CalendarItem
    const color = memoColor(m)
    const dl = daysLeft(m.start_date)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
          style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}
          onClick={e => e.stopPropagation()}>
          <div className="p-5"
            style={{ borderBottom: '1px solid var(--line)', borderLeft: `3px solid ${color}`, paddingLeft: '17px' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Bell className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>{ITEM_TYPE_LABELS[m.item_type]}</span>
                </div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>{m.title}</h3>
                {m.description && <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{m.description}</p>}
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0">
                <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            {dl <= 3 && dl >= 0 && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,194,75,0.12)', color: 'var(--yellow)' }}>
                  <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />{dl === 0 ? 'Oggi' : `tra ${dl}g`}
                </span>
              </div>
            )}
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
              <span className="text-sm" style={{ color: 'var(--text)' }}>
                {fmtLong(m.start_date)}{m.end_date ? ` \u2192 ${fmtLong(m.end_date)}` : ''}
              </span>
            </div>
            {m.alert !== 'none' && (
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>{ALERT_LABELS[m.alert]}</span>
              </div>
            )}
          </div>
          <div className="px-5 pb-5 flex gap-2">
            <button onClick={() => { onMemoEdit(m); onClose() }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
              <Edit3 className="w-3.5 h-3.5" /> Modifica
            </button>
            <button onClick={() => { onMemoDelete(m.id); onClose() }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)' }}>
              <Trash2 className="w-3.5 h-3.5" /> Elimina
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (item.type === 'event') {
    const ev = item.data as Event
    const color = eventColor(ev)
    const evTasks = allTasks.filter(t => t.evento === ev.id)
    const completati = evTasks.filter(t => t.stato === 'completato').length
    const dl = daysLeft(ev.dataInizio)
    const spesa = allUscite.filter(u => u.eventoId === ev.id).reduce((s, u) => s + u.importo, 0)

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
          style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}
          onClick={e => e.stopPropagation()}>
          <div className="p-5 relative overflow-hidden"
            style={{ borderBottom: '1px solid var(--line)', borderLeft: `3px solid ${color}`, paddingLeft: '17px' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Evento</span>
                </div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>{ev.nome}</h3>
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
              { icon: User, label: ev.responsabile || '—' },
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
          </div>
          <div className="px-5 pb-5 space-y-2">
            <button onClick={() => { onOpenTimeline(ev); onClose() }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all hover:brightness-110"
              style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}>
              <Layers className="w-3.5 h-3.5" /> Timeline Operativa
            </button>
            <button onClick={() => { onEventEditDates(ev); onClose() }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all hover:brightness-110"
              style={{ background: 'var(--panel2)', color: 'var(--muted)', border: `1px solid var(--line)` }}>
              <Clock className="w-3.5 h-3.5" /> Durata evento
            </button>
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
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
          style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}
          onClick={e => e.stopPropagation()}>
          <div className="p-5"
            style={{ borderBottom: '1px solid var(--line)', borderLeft: `3px solid ${color}`, paddingLeft: '17px' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Pratica</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>{categoriaLabel}</span>
                </div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>{p.titolo}</h3>
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

  // Creative detail
  if (item.type === 'creative') {
    const c = item.data as CreativeProject
    const color = creativeColor(c)
    const dl = c.due_date ? daysLeft(c.due_date) : null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
          style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}
          onClick={e => e.stopPropagation()}>
          <div className="p-5"
            style={{ borderBottom: '1px solid var(--line)', borderLeft: `3px solid ${color}`, paddingLeft: '17px' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Creative</span>
                  <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ background: `${color}18`, color }}>{c.type}</span>
                </div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>{c.title}</h3>
                {c.notes && <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{c.notes}</p>}
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0">
                <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold capitalize"
                style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                {c.status.replace(/_/g, ' ')}
              </span>
              {dl !== null && dl < 0 && c.status !== 'completato' && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,49,95,0.1)', color: 'var(--red2)' }}>
                  <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />{Math.abs(dl)}g scaduto
                </span>
              )}
            </div>
          </div>
          <div className="p-5 space-y-3">
            {c.due_date && (
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>Deadline: {fmtLong(c.due_date)}</span>
              </div>
            )}
            {c.output_format && (
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>Formato: {c.output_format}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Social detail
  if (item.type === 'social') {
    const s = item.data as SocialContent
    const color = socialColor(s)
    const dl = s.publish_date ? daysLeft(s.publish_date) : null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}>
        <div className="w-full max-w-md rounded-2xl overflow-hidden animate-fade-in"
          style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}
          onClick={e => e.stopPropagation()}>
          <div className="p-5"
            style={{ borderBottom: '1px solid var(--line)', borderLeft: `3px solid ${color}`, paddingLeft: '17px' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Social</span>
                  <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ background: `${color}18`, color }}>{s.channel.replace(/_/g, ' ')}</span>
                </div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>{s.title}</h3>
                {s.copy && <p className="text-sm mt-0.5 line-clamp-2" style={{ color: 'var(--muted)' }}>{s.copy}</p>}
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0">
                <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold capitalize"
                style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}>
                {s.status.replace(/_/g, ' ')}
              </span>
              {dl !== null && dl < 0 && s.status !== 'pubblicato' && (
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,49,95,0.1)', color: 'var(--red2)' }}>
                  <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />{Math.abs(dl)}g scaduto
                </span>
              )}
            </div>
          </div>
          <div className="p-5 space-y-3">
            {s.publish_date && (
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text)' }}>Pubblicazione: {fmtLong(s.publish_date)}</span>
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
          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '8px' }}>Cambia stato rapido</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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

function CalPill({ item, onClick, onDragStart, isLastDay, onResizeStart }: {
  item: CalItem
  onClick: () => void
  onDragStart?: (e: React.DragEvent) => void
  isLastDay?: boolean
  onResizeStart?: (e: React.MouseEvent) => void
}) {
  const color = item.type === 'event'
    ? eventColor(item.data as Event)
    : item.type === 'task'
      ? taskColor(item.data as Task)
      : item.type === 'creative'
        ? creativeColor(item.data as CreativeProject)
        : item.type === 'social'
          ? socialColor(item.data as SocialContent)
          : item.type === 'memo'
            ? memoColor(item.data as CalendarItem)
            : praticaColor(item.data as Pratica)
  const label = item.type === 'event'
    ? (item.data as Event).nome
    : item.type === 'task'
      ? (item.data as Task).titolo
      : item.type === 'creative'
        ? (item.data as CreativeProject).title
        : item.type === 'social'
          ? (item.data as SocialContent).title
          : item.type === 'memo'
            ? (item.data as CalendarItem).title
            : (item.data as Pratica).titolo
  const urgent = item.type === 'task' && (item.data as Task).priorita === 'alta' && (item.data as Task).stato !== 'completato'
  const dl = item.type === 'event'
    ? daysLeft((item.data as Event).dataInizio)
    : item.type === 'task'
      ? daysLeft((item.data as Task).scadenza)
      : item.type === 'creative'
        ? daysLeft((item.data as CreativeProject).due_date!)
        : item.type === 'social'
          ? daysLeft((item.data as SocialContent).publish_date!)
          : item.type === 'memo'
            ? daysLeft((item.data as CalendarItem).start_date)
            : daysLeft((item.data as Pratica).scadenza)
  const isDone = item.type === 'event'
    ? (item.data as Event).stato === 'completato'
    : item.type === 'task'
      ? (item.data as Task).stato === 'completato'
      : item.type === 'creative'
        ? (item.data as CreativeProject).status === 'completato'
        : item.type === 'social'
          ? (item.data as SocialContent).status === 'pubblicato'
          : item.type === 'memo'
            ? false
            : (item.data as Pratica).stato === 'completata'
  const isOverdue = dl < 0 && !isDone

  return (
    <div draggable={!!onDragStart} onDragStart={onDragStart}
      onClick={e => { e.stopPropagation(); onClick() }}
      className={`relative truncate px-1.5 py-0.5 text-xs transition-colors select-none ${onDragStart ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} group/pill`}
      style={{
        borderRadius: '6px',
        background: `${color}15`,
        color,
        borderLeft: `3px solid ${color}`,
        fontSize: '11px',
        fontFamily: 'inherit',
        opacity: isDone && item.type !== 'event' ? 0.5 : 1,
        outline: isOverdue ? `1px dashed ${color}60` : 'none',
      }}>
      {urgent && <Zap style={{ display: 'inline', width: 9, height: 9, marginRight: 2, marginBottom: 1 }} />}
      {item.type === 'memo' && <Bell style={{ display: 'inline', width: 9, height: 9, marginRight: 2, marginBottom: 1 }} />}
      {label}
      {isLastDay && item.type === 'event' && onResizeStart && (
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover/pill:opacity-100 transition-opacity"
          style={{ background: `linear-gradient(90deg, transparent, ${color}80)`, borderRadius: '0 3px 3px 0' }}
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onResizeStart(e) }}
        />
      )}
    </div>
  )
}

// ─── Monthly view ─────────────────────────────────────────────────────────────

function MonthView({ current, items, today, onItemClick, onDayClick, onMoveItem, onResizeEvent }: {
  current: Date; items: CalItem[]; today: Date
  onItemClick: (item: CalItem) => void
  onDayClick: (d: Date) => void
  onMoveItem: (id: string, type: 'event' | 'task', newDate: string) => void
  onResizeEvent: (id: string, newEndDate: string) => void
}) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; type: 'event' | 'task' } | null>(null)
  const [resizing, setResizing] = useState<{ id: string; startX: number; startDate: string; endDate: string } | null>(null)
  const [resizePreview, setResizePreview] = useState<string | null>(null)
  const cellRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (!resizing) return
    const currentResizing = resizing
    function onMove(e: MouseEvent) {
      const cells = cellRefs.current
      let closest: string | null = null
      let minDist = Infinity
      for (const [iso, el] of Object.entries(cells)) {
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const dist = Math.abs(e.clientX - cx) + Math.abs(e.clientY - (rect.top + rect.height / 2))
        if (dist < minDist) { minDist = dist; closest = iso }
      }
      if (closest && closest >= currentResizing.startDate) {
        setResizePreview(closest)
      }
    }
    function onUp() {
      if (resizePreview && resizePreview !== currentResizing.endDate) {
        onResizeEvent(currentResizing.id, resizePreview)
      }
      setResizing(null)
      setResizePreview(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [resizing, resizePreview])

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
      if (item.type === 'creative') {
        const c = item.data as CreativeProject
        return c.due_date ? sameDay(day, new Date(c.due_date)) : false
      }
      if (item.type === 'social') {
        const s = item.data as SocialContent
        return s.publish_date ? sameDay(day, new Date(s.publish_date)) : false
      }
      if (item.type === 'memo') {
        const m = item.data as CalendarItem
        if (m.end_date) {
          return day >= new Date(m.start_date) && day <= new Date(m.end_date)
        }
        return sameDay(day, new Date(m.start_date))
      }
      return sameDay(day, new Date((item.data as Task).scadenza))
    })
  }

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
      <div className="grid grid-cols-7 border-b min-w-[600px]" style={{ borderColor: 'var(--line)' }}>
        {DAYS_IT.map((d, i) => (
          <div key={d} className="py-2 text-center"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', opacity: i === 0 || i === 6 ? 0.4 : 0.6 }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 min-w-[600px]">
        {cells.map((day, idx) => {
          const isToday = sameDay(day, today)
          const isCurrentMonth = day.getMonth() === current.getMonth()
          const dayItems = getForDay(day)
          const iso = toISO(day)
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          const isOver = dragOver === iso
          const isResizeHighlight = resizing && resizePreview && iso > resizing.endDate && iso <= resizePreview

          return (
            <div key={idx}
              ref={el => { cellRefs.current[iso] = el }}
              className="min-h-[90px] border-b border-r last-of-type:border-r-0 relative cursor-pointer"
              style={{
                borderColor: 'var(--line)',
                background: isResizeHighlight ? 'rgba(208,0,58,0.08)' : isOver ? 'rgba(208,0,58,0.12)' : isToday ? 'color-mix(in srgb, var(--red2) 4%, transparent)' : 'transparent',
                boxShadow: isResizeHighlight ? 'inset 0 0 0 1px rgba(208,0,58,0.3)' : isOver ? 'inset 0 0 0 2px rgba(208,0,58,0.4)' : 'none',
              }}
              onDragOver={e => { e.preventDefault(); setDragOver(iso) }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => {
                e.preventDefault(); setDragOver(null)
                if (dragging) onMoveItem(dragging.id, dragging.type, iso)
                setDragging(null)
              }}
              onClick={() => onDayClick(day)}>
              <div className="mx-1 mt-1"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'var(--red2)' : isCurrentMonth ? (isWeekend ? 'var(--muted)' : 'var(--text)') : 'var(--muted)',
                  opacity: isCurrentMonth ? 1 : 0.3,
                }}>
                {day.getDate()}
              </div>
              <div className="px-1 pb-1 space-y-0.5 mt-0.5">
                {dayItems.slice(0, 3).map(item => {
                  const id = item.type === 'event' ? (item.data as Event).id : item.type === 'task' ? (item.data as Task).id : item.type === 'creative' ? (item.data as CreativeProject).id : item.type === 'social' ? (item.data as SocialContent).id : item.type === 'memo' ? (item.data as CalendarItem).id : (item.data as Pratica).id
                  const draggable = item.type === 'event' || item.type === 'task' || item.type === 'memo'
                  const isEvtLastDay = item.type === 'event' && sameDay(day, new Date((item.data as Event).dataFine))
                  return (
                    <CalPill key={id} item={item}
                      onClick={() => onItemClick(item)}
                      isLastDay={isEvtLastDay}
                      onResizeStart={isEvtLastDay ? () => {
                        const ev = item.data as Event
                        setResizing({ id: ev.id, startX: 0, startDate: ev.dataInizio, endDate: ev.dataFine })
                        setResizePreview(ev.dataFine)
                      } : undefined}
                      onDragStart={draggable ? e => {
                        setDragging({ id, type: item.type === 'event' ? 'event' : 'task' })
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
      {resizing && resizePreview && (
        <div className="flex items-center justify-center py-1.5 text-xs font-semibold" style={{ color: 'var(--red2)' }}>
          {(() => {
            const [sy, sm, sd] = resizing.startDate.split('-').map(Number)
            const [ey, em, ed] = resizePreview.split('-').map(Number)
            const days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1
            return `${days} ${days === 1 ? 'giorno' : 'giorni'}`
          })()}
        </div>
      )}
    </div>
  </div>
  )
}

// ─── Weekly view ──────────────────────────────────────────────────────────────

function WeekView({ weekStart, items, today, onItemClick, onMoveItem, onResizeEvent }: {
  weekStart: Date;
  items: CalItem[];
  today: Date;
  onItemClick: (item: CalItem) => void;
  onMoveItem: (id: string, type: 'event' | 'task', newDate: string) => void;
  onResizeEvent: (id: string, newEndDate: string) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ id: string; type: 'event' | 'task' } | null>(null)
  const [resizing, setResizing] = useState<{ id: string; startDate: string; endDate: string } | null>(null)
  const [resizePreview, setResizePreview] = useState<string | null>(null)
  const cellRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => {
    if (!resizing) return
    const currentResizing = resizing
    function onMove(e: MouseEvent) {
      const cells = cellRefs.current
      let closest: string | null = null
      let minDist = Infinity
      for (const [iso, el] of Object.entries(cells)) {
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const dist = Math.abs(e.clientX - cx)
        if (dist < minDist) { minDist = dist; closest = iso }
      }
      if (closest && closest >= currentResizing.startDate) {
        setResizePreview(closest)
      }
    }
    function onUp() {
      if (resizePreview && resizePreview !== currentResizing.endDate) {
        onResizeEvent(currentResizing.id, resizePreview)
      }
      setResizing(null)
      setResizePreview(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [resizing, resizePreview])

  function getForDay(day: Date): CalItem[] {
    return items.filter(item => {
      if (item.type === 'event') {
        const ev = item.data as Event
        return day >= new Date(ev.dataInizio) && day <= new Date(ev.dataFine)
      }
      if (item.type === 'pratica') {
        return sameDay(day, new Date((item.data as Pratica).scadenza))
      }
      if (item.type === 'creative') {
        const c = item.data as CreativeProject
        return c.due_date ? sameDay(day, new Date(c.due_date)) : false
      }
      if (item.type === 'social') {
        const s = item.data as SocialContent
        return s.publish_date ? sameDay(day, new Date(s.publish_date)) : false
      }
      if (item.type === 'memo') {
        const m = item.data as CalendarItem
        if (m.end_date) return day >= new Date(m.start_date) && day <= new Date(m.end_date)
        return sameDay(day, new Date(m.start_date))
      }
      return sameDay(day, new Date((item.data as Task).scadenza))
    })
  }

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
      <div className="grid grid-cols-7 border-b min-w-[600px]" style={{ borderColor: 'var(--line)' }}>
        {days.map((day, i) => {
          const isToday = sameDay(day, today)
          return (
            <div key={i} className="py-3 px-1.5 border-r last:border-r-0 text-center"
              style={{ borderColor: 'var(--line)', background: isToday ? 'color-mix(in srgb, var(--red2) 4%, transparent)' : 'transparent' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.6 }}>{DAYS_IT[day.getDay()]}</p>
              <div className="flex items-center justify-center mx-auto mt-1"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '14px',
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'var(--red2)' : 'var(--text)',
                }}>
                {day.getDate()}
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', marginTop: '2px', opacity: 0.5 }}>{MONTHS_IT[day.getMonth()].slice(0, 3)}</p>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-7 min-w-[600px]" style={{ minHeight: 300 }}>
        {days.map((day, i) => {
          const iso = toISO(day)
          const dayItems = getForDay(day)
          const isToday = sameDay(day, today)
          const isOver = dragOver === iso
          const isResizeHighlight = resizing && resizePreview && iso > resizing.endDate && iso <= resizePreview
          return (
            <div key={i} ref={el => { cellRefs.current[iso] = el }}
              className="border-r last:border-r-0 p-1.5 space-y-1"
              style={{
                borderColor: 'var(--line)',
                background: isResizeHighlight ? 'rgba(208,0,58,0.08)' : isOver ? 'rgba(208,0,58,0.12)' : isToday ? 'color-mix(in srgb, var(--red2) 3%, transparent)' : 'transparent',
                boxShadow: isResizeHighlight ? 'inset 0 0 0 1px rgba(208,0,58,0.3)' : isOver ? 'inset 0 0 0 2px rgba(208,0,58,0.4)' : 'none',
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
                const id = item.type === 'event' ? (item.data as Event).id : item.type === 'task' ? (item.data as Task).id : item.type === 'memo' ? (item.data as CalendarItem).id : (item.data as Pratica).id
                const draggable = item.type === 'event' || item.type === 'task' || item.type === 'memo'
                const isEvtLastDay = item.type === 'event' && sameDay(day, new Date((item.data as Event).dataFine))
                return (
                  <CalPill key={id} item={item}
                    onClick={() => onItemClick(item)}
                    isLastDay={isEvtLastDay}
                    onResizeStart={isEvtLastDay ? () => {
                      const ev = item.data as Event
                      setResizing({ id: ev.id, startDate: ev.dataInizio, endDate: ev.dataFine })
                      setResizePreview(ev.dataFine)
                    } : undefined}
                    onDragStart={draggable ? e => {
                      setDragging({ id, type: item.type === 'event' ? 'event' : 'task' })
                      e.dataTransfer.setData('text/plain', `${item.type}:${id}`)
                    } : undefined} />
                )
              })}
            </div>
          )
        })}
      </div>
      {resizing && resizePreview && (
        <div className="flex items-center justify-center py-1.5 text-xs font-semibold" style={{ color: 'var(--red2)' }}>
          {(() => {
            const [sy, sm, sd] = resizing.startDate.split('-').map(Number)
            const [ey, em, ed] = resizePreview.split('-').map(Number)
            const days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1
            return `${days} ${days === 1 ? 'giorno' : 'giorni'}`
          })()}
        </div>
      )}
      </div>
    </div>
  )
}

// ─── Day view ─────────────────────────────────────────────────────────────────

function DayView(props: {
  day: Date;
  items: CalItem[];
  onItemClick: (item: CalItem) => void;
}) {
  const { day, items, onItemClick } = props;
  const dayItems = items.filter(item => {
    if (item.type === 'event') {
      const ev = item.data as Event
      return day >= new Date(ev.dataInizio) && day <= new Date(ev.dataFine)
    }
    if (item.type === 'pratica') {
      return sameDay(day, new Date((item.data as Pratica).scadenza))
    }
    if (item.type === 'creative') {
      const c = item.data as CreativeProject
      return c.due_date ? sameDay(day, new Date(c.due_date)) : false
    }
    if (item.type === 'social') {
      const s = item.data as SocialContent
      return s.publish_date ? sameDay(day, new Date(s.publish_date)) : false
    }
    if (item.type === 'memo') {
      const m = item.data as CalendarItem
      if (m.end_date) return day >= new Date(m.start_date) && day <= new Date(m.end_date)
      return sameDay(day, new Date(m.start_date))
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
  const creativeItems = dayItems.filter(i => i.type === 'creative')
  const socialItems = dayItems.filter(i => i.type === 'social')
  const blocks = [
    { label: 'Mattina', range: '08:00 – 12:00', emoji: '🌅', items: evItems.slice(0, Math.ceil(evItems.length / 2)) },
    { label: 'Pomeriggio', range: '13:00 – 18:00', emoji: '☀️', items: evItems.slice(Math.ceil(evItems.length / 2)) },
    { label: 'Scadenze task', range: 'Task del giorno', emoji: '📋', items: taskItems },
    { label: 'Pratiche', range: 'Scadenze pratiche', emoji: '📄', items: praticaItems },
    { label: 'Creatività', range: 'Deadline materiali', emoji: '🎨', items: creativeItems },
    { label: 'Social', range: 'Pubblicazioni', emoji: '📱', items: socialItems },
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
                  ? `Assegnato a ${(item.data as Task).assegnatario}`
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
    if (item.type === 'creative') return (item.data as CreativeProject).due_date!
    if (item.type === 'social') return (item.data as SocialContent).publish_date!
    if (item.type === 'memo') return (item.data as CalendarItem).start_date
    return (item.data as Task).scadenza
  }
  function isItemDone(item: CalItem): boolean {
    if (item.type === 'event') return (item.data as Event).stato === 'completato'
    if (item.type === 'pratica') return (item.data as Pratica).stato === 'completata'
    if (item.type === 'creative') return (item.data as CreativeProject).status === 'completato'
    if (item.type === 'social') return (item.data as SocialContent).status === 'pubblicato'
    if (item.type === 'memo') return false
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
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: 'var(--red2)' }}>
              SCADUTI ({overdue.length})
            </p>
          </div>
          <div className="space-y-0">
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
              const typeLabel = item.type === 'event' ? 'EVENTO' : item.type === 'task' ? 'TASK' : 'PRATICA'
              return (
                <button key={item.type + id} onClick={() => onItemClick(item)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--line)]"
                  style={{ borderBottom: '1px solid var(--line)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', minWidth: '60px' }}>{fmtShort(d)}</span>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color, opacity: 0.8 }}>{typeLabel}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--red2)' }}>{Math.abs(daysLeft(d))}g fa</span>
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
            style={{ borderLeft: urgent ? `3px solid ${dl <= 2 ? 'var(--red2)' : 'var(--yellow)'}` : undefined }}>
            <div className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: isToday ? 'var(--red2)' : 'var(--text)', minWidth: '32px' }}>
                {day.getDate()}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase' }}>
                {MONTHS_IT[day.getMonth()].slice(0, 3)}
              </span>
              <span className="flex-1" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
                {isToday ? 'OGGI' : isTomorrow ? 'DOMANI' : DAYS_FULL[day.getDay()].toUpperCase()}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>{dayItems.length} elem.</span>
              {dl >= 0 && dl <= 7 && !isToday && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: dl <= 2 ? 'var(--red2)' : 'var(--yellow)' }}>
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
                const typeLabel = item.type === 'event' ? 'EVENTO' : item.type === 'task' ? 'TASK' : 'PRATICA'
                return (
                  <button key={item.type + id}
                    onClick={() => onItemClick(item)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--line)]"
                    style={{ borderTop: ii > 0 ? '1px solid var(--line)' : 'none' }}>
                    <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate" style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', color: 'var(--text)' }}>{label}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{sub}</p>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color, flexShrink: 0 }}>{typeLabel}</span>
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

// ─── Quick Create Modal ───────────────────────────────────────────────────────

type CreateType = 'event' | 'task' | 'pratica' | 'memo'

function QuickCreateModal({ defaultDate, events, onClose, onCreate }: {
  defaultDate: string
  events: Event[]
  onClose: () => void
  onCreate: (type: CreateType, data: Event | Task | Pratica | CalendarItem) => void
}) {
  const [type, setType] = useState<CreateType>('memo')
  const [titolo, setTitolo] = useState('')
  const [desc, setDesc] = useState('')
  const [dataInizio, setDataInizio] = useState(defaultDate)
  const [dataFine, setDataFine] = useState(defaultDate)
  const [eventoId, setEventoId] = useState('')
  const [priorita, setPriorita] = useState<'alta' | 'media' | 'bassa'>('media')
  const [location, setLocation] = useState('')
  const [alert, setAlert] = useState<'none' | '10min' | '1h' | '1d' | '1w'>('none')
  const [memoType, setMemoType] = useState<'promemoria' | 'evento' | 'scadenza' | 'task'>('promemoria')

  function handleSubmit() {
    if (!titolo.trim()) return
    const id = `${type.slice(0, 3)}_${Date.now()}`
    if (type === 'memo') {
      const m: CalendarItem = {
        id,
        user_id: '',
        title: titolo,
        description: desc,
        item_type: memoType,
        start_date: dataInizio,
        end_date: dataFine !== dataInizio ? dataFine : null,
        alert,
        created_at: new Date().toISOString(),
      }
      onCreate('memo', m)
    } else if (type === 'event') {
      const ev: Event = {
        id,
        nome: titolo,
        descrizione: desc,
        cliente: '',
        dataInizio,
        dataFine: dataFine || dataInizio,
        location,
        budget: 0,
        ricavo_cliente: null,
        fee_agenzia_pct: 6,
        margine_target: 25,
        stato: 'pianificazione',
        partecipanti: 0,
        responsabile: '',
        team: [],
      }
      onCreate('event', ev)
    } else if (type === 'task') {
      const t: Task = {
        id,
        titolo,
        descrizione: desc,
        assegnatario: '',
        evento: eventoId || null,
        priorita,
        stato: 'da_fare',
        scadenza: dataInizio,
        creatoIl: new Date().toISOString().slice(0, 10),
      }
      onCreate('task', t)
    } else {
      const p: Pratica = {
        id,
        titolo,
        descrizione: desc,
        eventoId: eventoId || null,
        responsabileId: '',
        categoria: 'documento',
        stato: 'da_aprire',
        priorita,
        creatoIl: new Date().toISOString().slice(0, 10),
        scadenza: dataInizio,
        note: '',
        importo: null,
        controparte: '',
      }
      onCreate('pratica', p)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>
            {type === 'memo' ? 'Nuovo Promemoria' : type === 'event' ? 'Nuovo Evento' : type === 'task' ? 'Nuovo Task' : 'Nuova Pratica'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {/* Type selector */}
        <div className="grid grid-cols-4 gap-1.5">
          {([
            { id: 'memo' as CreateType, label: 'Promemoria', icon: Bell },
            { id: 'task' as CreateType, label: 'Task', icon: CheckSquare },
            { id: 'event' as CreateType, label: 'Evento', icon: Calendar },
            { id: 'pratica' as CreateType, label: 'Pratica', icon: FileText },
          ]).map(t => (
            <button key={t.id} onClick={() => setType(t.id)}
              className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[11px] font-medium transition-all"
              style={{
                background: type === t.id ? 'var(--red)' : 'transparent',
                color: type === t.id ? 'white' : 'var(--muted)',
                border: type === t.id ? 'none' : '1px solid var(--line)',
              }}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <input
            value={titolo} onChange={e => setTitolo(e.target.value)}
            placeholder={type === 'event' ? 'Nome evento' : type === 'memo' ? 'Titolo promemoria' : 'Titolo'}
            className="w-full px-3 py-2.5 rounded-xl text-sm"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
          />
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Descrizione (opzionale)"
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>
                {type === 'event' || type === 'memo' ? 'Data inizio' : 'Scadenza'}
              </label>
              <input type="date" value={dataInizio} onChange={e => setDataInizio(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              />
            </div>
            {(type === 'event' || type === 'memo') && (
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Data fine</label>
                <input type="date" value={dataFine} onChange={e => setDataFine(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>
            )}
            {type !== 'event' && type !== 'memo' && (
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Priorita</label>
                <select value={priorita} onChange={e => setPriorita(e.target.value as 'alta' | 'media' | 'bassa')}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="bassa">Bassa</option>
                </select>
              </div>
            )}
          </div>

          {type === 'memo' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Tipo</label>
                <select value={memoType} onChange={e => setMemoType(e.target.value as typeof memoType)}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                  <option value="promemoria">Promemoria</option>
                  <option value="evento">Evento</option>
                  <option value="scadenza">Scadenza</option>
                  <option value="task">Task</option>
                </select>
              </div>
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Alert</label>
                <select value={alert} onChange={e => setAlert(e.target.value as typeof alert)}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                  <option value="none">Nessun alert</option>
                  <option value="10min">10 minuti prima</option>
                  <option value="1h">1 ora prima</option>
                  <option value="1d">1 giorno prima</option>
                  <option value="1w">1 settimana prima</option>
                </select>
              </div>
            </div>
          )}

          {type === 'event' && (
            <input value={location} onChange={e => setLocation(e.target.value)}
              placeholder="Location"
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
          )}

          {(type === 'task' || type === 'pratica') && events.length > 0 && (
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Evento collegato</label>
              <select value={eventoId} onChange={e => setEventoId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">Nessuno</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.nome}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <button onClick={handleSubmit} disabled={!titolo.trim()}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          Crea {type === 'memo' ? 'Promemoria' : type === 'event' ? 'Evento' : type === 'task' ? 'Task' : 'Pratica'}
        </button>
      </div>
    </div>
  )
}

// ─── Event Date Edit Modal ───────────────────────────────────────────────────

function EventDateEditModal({ event, onClose, onSave }: {
  event: Event
  onClose: () => void
  onSave: (id: string, dataInizio: string, dataFine: string) => void
}) {
  const [startDate, setStartDate] = useState(event.dataInizio)
  const [endDate, setEndDate] = useState(event.dataFine)
  const [saving, setSaving] = useState(false)
  const [warning, setWarning] = useState('')

  const duration = Math.max(0, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000))
  const originalDuration = Math.max(0, Math.ceil((new Date(event.dataFine).getTime() - new Date(event.dataInizio).getTime()) / 86400000))
  const hasChanged = startDate !== event.dataInizio || endDate !== event.dataFine
  const isValid = startDate && endDate && new Date(endDate) >= new Date(startDate)

  function handleStartChange(val: string) {
    setStartDate(val)
    if (new Date(val) > new Date(endDate)) {
      setEndDate(val)
    }
    setWarning('')
  }

  function handleEndChange(val: string) {
    if (new Date(val) < new Date(startDate)) return
    setEndDate(val)
    setWarning('')
  }

  function addDaysToISODate(iso: string, days: number): string {
    const [y, m, d] = iso.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d + days))
    return dt.toISOString().slice(0, 10)
  }

  function addDayToEnd() {
    setEndDate(addDaysToISODate(endDate, 1))
    setWarning('')
  }

  function removeDayFromEnd() {
    const prev = addDaysToISODate(endDate, -1)
    if (prev >= startDate) {
      setEndDate(prev)
      setWarning('')
    }
  }

  async function handleSave() {
    if (!isValid || !hasChanged) return
    setSaving(true)

    if (new Date(endDate) < new Date(event.dataFine)) {
      const hasOOR = await checkOutOfRange(event.id, startDate, endDate)
      if (hasOOR) {
        setWarning('Alcuni elementi potrebbero trovarsi fuori dal nuovo intervallo evento. Verifica il dettaglio evento.')
      }
    }

    onSave(event.id, startDate, endDate)
    setSaving(false)
  }

  async function checkOutOfRange(eventId: string, start: string, end: string): Promise<boolean> {
    const tables = ['event_program', 'event_supplier_services', 'event_restaurant_details', 'event_experience_details', 'event_catering_details', 'event_staff_esterno_details', 'event_staff_interno_details', 'event_varie_details']
    const results = await Promise.all(
      tables.map(t => supabase.from(t).select('id,data').eq('event_id', eventId).not('data', 'is', null))
    )
    for (const { data: rows } of results) {
      if (!rows) continue
      for (const row of rows) {
        const d = (row as Record<string, unknown>).data as string
        if (d && (d < start || d > end)) return true
      }
    }
    return false
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
        <div className="p-5" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4" style={{ color: 'var(--blue)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)' }}>Durata evento</span>
          </div>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>{event.nome}</h3>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Date attuali: {fmtLong(event.dataInizio)} {event.dataInizio !== event.dataFine ? `\u2192 ${fmtLong(event.dataFine)}` : '(giornata singola)'}
            {originalDuration > 0 && ` (${originalDuration + 1} giorni)`}
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '6px', display: 'block', color: 'var(--muted)' }}>Data inizio</label>
              <input type="date" value={startDate} onChange={e => handleStartChange(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '6px', display: 'block', color: 'var(--muted)' }}>Data fine</label>
              <input type="date" value={endDate} onChange={e => handleEndChange(e.target.value)}
                min={startDate}
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          {/* Quick duration buttons */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Durata fine:</span>
            <div className="flex items-center gap-2">
              <button onClick={removeDayFromEnd}
                disabled={endDate === startDate}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold transition-all disabled:opacity-30 hover:brightness-110"
                style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
                -1
              </button>
              <span className="text-sm font-semibold px-2 min-w-[60px] text-center" style={{ color: 'var(--text)' }}>
                {duration + 1} giorn{duration === 0 ? 'o' : 'i'}
              </span>
              <button onClick={addDayToEnd}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold transition-all hover:brightness-110"
                style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
                +1
              </button>
            </div>
          </div>

          {hasChanged && isValid && (
            <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(77,180,255,0.06)', border: '1px solid rgba(77,180,255,0.15)' }}>
              <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--blue)' }} />
              <div className="text-xs" style={{ color: 'var(--text)' }}>
                <span className="font-medium">Nuova durata:</span> {duration + 1} giorn{duration === 0 ? 'o' : 'i'}
                {duration !== originalDuration && (
                  <span style={{ color: duration > originalDuration ? 'var(--green)' : 'var(--yellow)' }}>
                    {' '}({duration > originalDuration ? '+' : ''}{duration - originalDuration} giorn{Math.abs(duration - originalDuration) === 1 ? 'o' : 'i'})
                  </span>
                )}
              </div>
            </div>
          )}
          {!isValid && startDate && endDate && (
            <p className="text-xs" style={{ color: 'var(--red2)' }}>La data fine non puo essere prima della data inizio.</p>
          )}
          {warning && (
            <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(255,194,75,0.08)', border: '1px solid rgba(255,194,75,0.2)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--yellow)' }} />
              <p className="text-xs" style={{ color: 'var(--yellow)' }}>{warning}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'var(--panel2)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
              Annulla
            </button>
            <button onClick={handleSave} disabled={!hasChanged || !isValid || saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
              {saving ? 'Salvataggio...' : 'Salva modifiche'}
            </button>
          </div>
          <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
            Modifica solo le date. Budget, task e fornitori non vengono alterati.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Memo Edit Modal ─────────────────────────────────────────────────────────

function MemoEditModal({ item, onClose, onSave }: {
  item: CalendarItem
  onClose: () => void
  onSave: (updated: CalendarItem) => void
}) {
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description || '')
  const [startDate, setStartDate] = useState(item.start_date)
  const [endDate, setEndDate] = useState(item.end_date || item.start_date)
  const [itemType, setItemType] = useState(item.item_type)
  const [alertVal, setAlertVal] = useState(item.alert)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    const updated = await upsertCalendarItem({
      id: item.id,
      title,
      description,
      item_type: itemType,
      start_date: startDate,
      end_date: endDate !== startDate ? endDate : null,
      alert: alertVal,
    })
    setSaving(false)
    if (updated) onSave(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>Modifica elemento</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Titolo" className="w-full px-3 py-2.5 rounded-xl text-sm"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Descrizione (opzionale)" rows={2}
            className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Data inizio</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Data fine</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Tipo</label>
              <select value={itemType} onChange={e => setItemType(e.target.value as typeof itemType)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="promemoria">Promemoria</option>
                <option value="evento">Evento</option>
                <option value="scadenza">Scadenza</option>
                <option value="task">Task</option>
              </select>
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Alert</label>
              <select value={alertVal} onChange={e => setAlertVal(e.target.value as typeof alertVal)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="none">Nessun alert</option>
                <option value="10min">10 minuti prima</option>
                <option value="1h">1 ora prima</option>
                <option value="1d">1 giorno prima</option>
                <option value="1w">1 settimana prima</option>
              </select>
            </div>
          </div>
        </div>
        <button onClick={handleSave} disabled={!title.trim() || saving}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
          {saving ? 'Salvataggio...' : 'Salva modifiche'}
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Calendario() {
  const nav = useNavigate()
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [allEvents, setAllEvents] = useState<Event[]>([])
  const [allPratiche, setAllPratiche] = useState<Pratica[]>([])
  const [allUscite, setAllUscite] = useState<Uscita[]>([])
  const [allCreative, setAllCreative] = useState<CreativeProject[]>([])
  const [allSocial, setAllSocial] = useState<SocialContent[]>([])
  const [allMemos, setAllMemos] = useState<CalendarItem[]>([])
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t
  })
  const [selectedItem, setSelectedItem] = useState<CalItem | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingMemo, setEditingMemo] = useState<CalendarItem | null>(null)
  const [editingEventDates, setEditingEventDates] = useState<Event | null>(null)
  const [shiftToast, setShiftToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null)
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }, [])

  const currentUser = loadUser()
  const ruolo = currentUser?.ruolo ?? 'Admin'

  const refresh = useCallback(async () => {
    const [t, e, p, u, cr, so, memos] = await Promise.all([fetchTasks(), fetchEvents(), fetchPractices(), fetchBudgets(), fetchCreativeProjects(), fetchSocialContents(), fetchCalendarItems()])
    setAllTasks(t)
    setAllEvents(e)
    setAllPratiche(p)
    setAllUscite(u)
    setAllCreative(cr)
    setAllSocial(so)
    setAllMemos(memos)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Permission-filtered visible items
  const visibleItems = useMemo((): CalItem[] => {
    let filteredEvents = allEvents
    let filteredTasks = allTasks

    if (ruolo !== 'Admin' && ruolo !== 'Partner') {
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
    }

    const visiblePratiche = allPratiche.filter(p => p.stato !== 'completata')
    const visibleCreative = allCreative.filter(c => c.due_date && c.status !== 'completato')
    const visibleSocial = allSocial.filter(s => s.publish_date && s.status !== 'pubblicato')

    return [
      ...filteredEvents.map(e => ({ type: 'event' as const, data: e })),
      ...filteredTasks.map(t => ({ type: 'task' as const, data: t })),
      ...visiblePratiche.map(p => ({ type: 'pratica' as const, data: p })),
      ...visibleCreative.map(c => ({ type: 'creative' as const, data: c })),
      ...visibleSocial.map(s => ({ type: 'social' as const, data: s })),
      ...allMemos.map(m => ({ type: 'memo' as const, data: m })),
    ]
  }, [allTasks, allEvents, allPratiche, allCreative, allSocial, allMemos, ruolo, currentUser])

  async function handleTaskStateChange(id: string, stato: Task['stato']) {
    setAllTasks(prev => prev.map(t => t.id === id ? { ...t, stato } : t))
    await changeTaskStatus(id, stato)
    await refresh()
  }

  async function handleMoveItem(id: string, type: 'event' | 'task', newDate: string) {
    if (type === 'task') {
      const target = allTasks.find(t => t.id === id)
      if (!target) {
        const memo = allMemos.find(m => m.id === id)
        if (memo) {
          const updated = { ...memo, start_date: newDate }
          setAllMemos(prev => prev.map(m => m.id === id ? updated : m))
          await upsertCalendarItem({ id, title: memo.title, start_date: newDate, end_date: memo.end_date, alert: memo.alert, item_type: memo.item_type, description: memo.description })
          await refresh()
        }
        return
      }
      const updated = { ...target, scadenza: newDate }
      setAllTasks(prev => prev.map(t => t.id === id ? updated : t))
      await upsertTask(updated)
    } else {
      const target = allEvents.find(e => e.id === id)
      if (!target) return
      const diffMs = new Date(newDate + 'T00:00:00Z').getTime() - new Date(target.dataInizio + 'T00:00:00Z').getTime()
      const deltaDays = Math.round(diffMs / 86400000)
      if (deltaDays === 0) return
      const [ey, em, ed] = target.dataFine.split('-').map(Number)
      const newEnd = new Date(Date.UTC(ey, em - 1, ed + deltaDays)).toISOString().slice(0, 10)
      setAllEvents(prev => prev.map(e => e.id === id ? { ...e, dataInizio: newDate, dataFine: newEnd } : e))
      const { shift: result } = await moveEventWithTimelineShift(id, newDate)
      if (result.skipped.length > 0) {
        setShiftToast({ message: 'Evento spostato. Alcune scadenze non sono state aggiornate automaticamente.', type: 'warning' })
      } else {
        setShiftToast({ message: 'Evento spostato. Programma e servizi collegati aggiornati.', type: 'success' })
      }
      setTimeout(() => setShiftToast(null), 5000)
    }
    await refresh()
  }

  async function handleCreate(type: CreateType, data: Event | Task | Pratica | CalendarItem) {
    if (type === 'event') await upsertEvent(data as Event)
    else if (type === 'task') await upsertTask(data as Task)
    else if (type === 'pratica') await upsertPractice(data as Pratica)
    else if (type === 'memo') {
      const m = data as CalendarItem
      await upsertCalendarItem({ title: m.title, description: m.description, item_type: m.item_type, start_date: m.start_date, end_date: m.end_date, alert: m.alert })
    }
    setShowCreate(false)
    await refresh()
  }

  async function handleMemoDelete(id: string) {
    setAllMemos(prev => prev.filter(m => m.id !== id))
    await deleteCalendarItem(id)
    await refresh()
  }

  async function handleMemoSave(updated: CalendarItem) {
    setAllMemos(prev => prev.map(m => m.id === updated.id ? updated : m))
    setEditingMemo(null)
    await refresh()
  }

  async function handleEventDateSave(id: string, dataInizio: string, dataFine: string) {
    setAllEvents(prev => prev.map(e => e.id === id ? { ...e, dataInizio, dataFine } : e))
    setEditingEventDates(null)
    await resizeEventOnly(id, dataInizio, dataFine)
    await refresh()
  }

  async function handleResizeEvent(id: string, newEndDate: string) {
    const target = allEvents.find(e => e.id === id)
    if (!target || newEndDate === target.dataFine) return
    setAllEvents(prev => prev.map(e => e.id === id ? { ...e, dataFine: newEndDate } : e))
    await resizeEventOnly(id, target.dataInizio, newEndDate)
    await refresh()
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

  const overdueItems = visibleItems.filter(item => {
    const d = item.type === 'event'
      ? (item.data as Event).dataInizio
      : item.type === 'task'
        ? (item.data as Task).scadenza
        : item.type === 'memo'
          ? (item.data as CalendarItem).start_date
          : (item.data as Pratica).scadenza
    const done = item.type === 'event'
      ? (item.data as Event).stato === 'completato'
      : item.type === 'task'
        ? (item.data as Task).stato === 'completato'
        : item.type === 'memo'
          ? false
          : (item.data as Pratica).stato === 'completata'
    return new Date(d) < today && !done
  })
  const thisWeekItems = visibleItems.filter(item => {
    const d = item.type === 'event'
      ? (item.data as Event).dataInizio
      : item.type === 'task'
        ? (item.data as Task).scadenza
        : item.type === 'memo'
          ? (item.data as CalendarItem).start_date
          : (item.data as Pratica).scadenza
    const di = new Date(d)
    return di >= today && di <= addDays(today, 7)
  })

  return (
    <div className="space-y-5">
      {/* Wire masthead */}
      <div className="wire-masthead">
        <div>
          <span className="wire-masthead-title">CALENDARIO</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginLeft: '12px' }}>
            {MONTHS_IT[cursor.getMonth()].toUpperCase()} {cursor.getFullYear()}
            {ruolo !== 'Admin' && ruolo !== 'Partner' && (
              <span style={{ marginLeft: '8px', color: 'var(--blue)' }}>[ {ruolo.toUpperCase()} ]</span>
            )}
          </span>
        </div>
        <div className="wire-masthead-right" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setShowCreate(true)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
            + PROMEMORIA
          </button>
        </div>
      </div>

      {/* Wire tabs — view selector */}
      <div className="wire-tabs">
        {([
          { id: 'month' as ViewMode, label: 'MESE' },
          { id: 'week' as ViewMode, label: 'SETTIMANA' },
          { id: 'day' as ViewMode, label: 'GIORNO' },
          { id: 'agenda' as ViewMode, label: 'AGENDA' },
        ]).map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`wire-tab ${view === v.id ? 'wire-tab--active' : ''}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Wire ticker — KPIs */}
      <div className="wire-ticker">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          <Bell className="w-3 h-3 inline -mt-0.5 mr-1" />{allMemos.length} promemoria
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: overdueItems.length > 0 ? 'var(--yellow)' : 'var(--muted)' }}>
          {overdueItems.length} scaduti
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--blue)' }}>
          {thisWeekItems.length} questa settimana
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          {visibleItems.length} visibili
        </span>
        {(view === 'month' || view === 'week') && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', opacity: 0.6 }}>
            drag&amp;drop attivo
          </span>
        )}
      </div>

      {/* Navigation */}
      {view !== 'agenda' && (
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', transition: 'color 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => { const t = new Date(); t.setHours(0,0,0,0); setCursor(t) }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'none', border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 10px', color: 'var(--muted)', cursor: 'pointer', transition: 'color 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
            OGGI
          </button>
          <span className="flex-1 text-center" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{navLabel}</span>
          <button onClick={() => navigate(1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', transition: 'color 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
            <ChevronRight className="w-4 h-4" />
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
          onResizeEvent={handleResizeEvent}
        />
      )}
      {view === 'week' && (
        <WeekView
          weekStart={weekStart} items={visibleItems} today={today}
          onItemClick={setSelectedItem}
          onMoveItem={handleMoveItem}
          onResizeEvent={handleResizeEvent}
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
          allTasks={allTasks}
          allUscite={allUscite}
          onClose={() => setSelectedItem(null)}
          onTaskStateChange={handleTaskStateChange}
          onMemoEdit={m => { setSelectedItem(null); setEditingMemo(m) }}
          onMemoDelete={id => { setSelectedItem(null); handleMemoDelete(id) }}
          onEventEditDates={ev => { setSelectedItem(null); setEditingEventDates(ev) }}
          onOpenTimeline={ev => { setSelectedItem(null); nav(`/timeline/${ev.id}`) }}
        />
      )}

      {/* Event date edit modal */}
      {editingEventDates && (
        <EventDateEditModal
          event={editingEventDates}
          onClose={() => setEditingEventDates(null)}
          onSave={handleEventDateSave}
        />
      )}

      {/* Memo edit modal */}
      {editingMemo && (
        <MemoEditModal
          item={editingMemo}
          onClose={() => setEditingMemo(null)}
          onSave={handleMemoSave}
        />
      )}

      {/* Quick create modal */}
      {showCreate && (
        <QuickCreateModal
          defaultDate={toISO(cursor)}
          events={allEvents}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

      {/* Shift toast */}
      {shiftToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl"
            style={{
              background: 'var(--panel)',
              border: `1px solid ${shiftToast.type === 'success' ? 'rgba(56,210,125,0.3)' : 'rgba(255,194,75,0.3)'}`,
              boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 20px ${shiftToast.type === 'success' ? 'rgba(56,210,125,0.1)' : 'rgba(255,194,75,0.1)'}`,
            }}>
            {shiftToast.type === 'success'
              ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green)' }} />
              : <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--yellow)' }} />
            }
            <span className="text-sm" style={{ color: 'var(--text)' }}>{shiftToast.message}</span>
            <button onClick={() => setShiftToast(null)} className="ml-2 p-1 rounded hover:bg-white/10">
              <X className="w-3 h-3" style={{ color: 'var(--muted)' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
