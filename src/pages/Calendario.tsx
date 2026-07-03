import { useState, useMemo, useEffect, useCallback } from 'react'
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
  Bell,
  Trash2,
  Edit3,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { daysLeft, fmtShort, fmtLong, toISO, addDays } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Pratica } from '@/data/pratiche'
import type { Uscita } from '@/data/amministrazione'
import { fetchEvents, upsertEvent } from '@/lib/events-service'
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

function DetailPopup({ item, allTasks, allUscite, onClose, onTaskStateChange, onMemoEdit, onMemoDelete }: {
  item: CalItem
  allTasks: Task[]
  allUscite: Uscita[]
  onClose: () => void
  onTaskStateChange: (id: string, stato: Task['stato']) => void
  onMemoEdit: (item: CalendarItem) => void
  onMemoDelete: (id: string) => void
}) {
  if (item.type === 'memo') {
    const m = item.data as CalendarItem
    const color = memoColor(m)
    const dl = daysLeft(m.start_date)
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
                  <Bell className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{ITEM_TYPE_LABELS[m.item_type]}</span>
                </div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{m.title}</h3>
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

  // Creative detail
  if (item.type === 'creative') {
    const c = item.data as CreativeProject
    const color = creativeColor(c)
    const dl = c.due_date ? daysLeft(c.due_date) : null
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
                  <Tag className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Creative</span>
                  <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ background: `${color}18`, color }}>{c.type}</span>
                </div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{c.title}</h3>
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
                  <Zap className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                  <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Social</span>
                  <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ background: `${color}18`, color }}>{s.channel.replace(/_/g, ' ')}</span>
                </div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{s.title}</h3>
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
            <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>Cambia stato rapido</p>
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

function CalPill({ item, onClick, onDragStart }: {
  item: CalItem
  onClick: () => void
  onDragStart?: (e: React.DragEvent) => void
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
      {item.type === 'memo' && <Bell style={{ display: 'inline', width: 9, height: 9, marginRight: 2, marginBottom: 1 }} />}
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
          <div key={d} className="py-2.5 text-center text-xs font-semibold"
            style={{ color: i === 0 || i === 6 ? 'rgba(155,163,170,0.45)' : 'var(--muted)' }}>{d}</div>
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
                  const id = item.type === 'event' ? (item.data as Event).id : item.type === 'task' ? (item.data as Task).id : item.type === 'creative' ? (item.data as CreativeProject).id : item.type === 'social' ? (item.data as SocialContent).id : item.type === 'memo' ? (item.data as CalendarItem).id : (item.data as Pratica).id
                  const draggable = item.type === 'event' || item.type === 'task' || item.type === 'memo'
                  return (
                    <CalPill key={id} item={item}
                      onClick={() => onItemClick(item)}
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
    </div>
  </div> 
  )
}

// ─── Weekly view ──────────────────────────────────────────────────────────────

function WeekView({ weekStart, items, today, onItemClick, onMoveItem }: {
  weekStart: Date;
  items: CalItem[];
  today: Date;
  onItemClick: (item: CalItem) => void;
  onMoveItem: (id: string, type: 'event' | 'task', newDate: string) => void;
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
      <div className="grid grid-cols-7 min-w-[600px]" style={{ minHeight: 300 }}>
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
                const id = item.type === 'event' ? (item.data as Event).id : item.type === 'task' ? (item.data as Task).id : item.type === 'memo' ? (item.data as CalendarItem).id : (item.data as Pratica).id
                const draggable = item.type === 'event' || item.type === 'task' || item.type === 'memo'
                return (
                  <CalPill key={id} item={item}
                    onClick={() => onItemClick(item)}
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
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
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
          />
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Descrizione (opzionale)"
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>
                {type === 'event' || type === 'memo' ? 'Data inizio' : 'Scadenza'}
              </label>
              <input type="date" value={dataInizio} onChange={e => setDataInizio(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
              />
            </div>
            {(type === 'event' || type === 'memo') && (
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Data fine</label>
                <input type="date" value={dataFine} onChange={e => setDataFine(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
                />
              </div>
            )}
            {type !== 'event' && type !== 'memo' && (
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Priorita</label>
                <select value={priorita} onChange={e => setPriorita(e.target.value as 'alta' | 'media' | 'bassa')}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
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
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Tipo</label>
                <select value={memoType} onChange={e => setMemoType(e.target.value as typeof memoType)}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                  <option value="promemoria">Promemoria</option>
                  <option value="evento">Evento</option>
                  <option value="scadenza">Scadenza</option>
                  <option value="task">Task</option>
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Alert</label>
                <select value={alert} onChange={e => setAlert(e.target.value as typeof alert)}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
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
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
          )}

          {(type === 'task' || type === 'pratica') && events.length > 0 && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Evento collegato</label>
              <select value={eventoId} onChange={e => setEventoId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Modifica elemento</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Titolo" className="w-full px-3 py-2.5 rounded-xl text-sm"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Descrizione (opzionale)" rows={2}
            className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Data inizio</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Data fine</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Tipo</label>
              <select value={itemType} onChange={e => setItemType(e.target.value as typeof itemType)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="promemoria">Promemoria</option>
                <option value="evento">Evento</option>
                <option value="scadenza">Scadenza</option>
                <option value="task">Task</option>
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Alert</label>
              <select value={alertVal} onChange={e => setAlertVal(e.target.value as typeof alertVal)}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
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
      const diffMs = new Date(newDate).getTime() - new Date(target.dataInizio).getTime()
      const updated: Event = {
        ...target,
        dataInizio: newDate,
        dataFine: new Date(new Date(target.dataFine).getTime() + diffMs).toISOString().slice(0, 10),
      }
      setAllEvents(prev => prev.map(e => e.id === id ? updated : e))
      await upsertEvent(updated)
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
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white', boxShadow: '0 4px 16px rgba(208,0,58,0.3)' }}>
            <Bell className="w-4 h-4" />
            + Promemoria
          </button>
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
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Promemoria attivi', value: allMemos.length, color: '#a78bfa', icon: Bell },
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
          { label: 'Promemoria', color: '#a78bfa' },
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
          allTasks={allTasks}
          allUscite={allUscite}
          onClose={() => setSelectedItem(null)}
          onTaskStateChange={handleTaskStateChange}
          onMemoEdit={m => { setSelectedItem(null); setEditingMemo(m) }}
          onMemoDelete={id => { setSelectedItem(null); handleMemoDelete(id) }}
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
    </div>
  )
}
