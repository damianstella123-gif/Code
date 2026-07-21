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
  Download,
  Printer,
  Filter,
  HelpCircle,
  PanelLeftOpen,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { daysLeft, fmtShort, fmtLong, toISO, addDays, addDaysISO, diffDaysISO } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Pratica } from '@/data/pratiche'
import type { Uscita } from '@/data/amministrazione'
import { fetchEvents, moveEventWithTimelineShift, resizeEventOnly } from '@/lib/events-service'
import { trackAction } from '@/lib/impact-tracker'
import { fetchTasks, upsertTask, changeTaskStatus } from '@/lib/tasks-service'
import { fetchDossiers as fetchPractices } from '@/lib/dossier-service'
import { fetchBudgets } from '@/lib/budgets-service'
import { fetchCreativeProjects, type CreativeProject } from '@/lib/creative-service'
import { fetchSocialContents, type SocialContent } from '@/lib/social-service'
import { supabase } from '@/lib/supabase'
import { createLeaveRequest } from '@/lib/leave-requests-service'

// ─── Calendar Item type ──────────────────────────────────────────────────────

export interface CalendarItem {
  id: string
  user_id: string
  title: string
  description: string
  item_type: 'promemoria' | 'evento' | 'scadenza' | 'task'
  start_date: string
  end_date: string | null
  start_time: string | null
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
const HEADER_DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const DAYS_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function isoToLocalMidnight(iso?: string | null): Date {
  if (!iso) return new Date(NaN)
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
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

type ViewMode = 'month' | 'week' | 'day' | 'agenda' | 'team'
type LayerKey = 'eventi' | 'task' | 'memo' | 'ferie' | 'creative' | 'social' | 'pratiche'
type CalItem =
  | { type: 'event'; data: Event }
  | { type: 'task'; data: Task }
  | { type: 'pratica'; data: Pratica }
  | { type: 'creative'; data: CreativeProject }
  | { type: 'social'; data: SocialContent }
  | { type: 'memo'; data: CalendarItem }
  | { type: 'leave'; data: LeaveRequest }

interface LeaveRequest {
  id: string
  user_id: string
  tipo: string
  data_inizio: string
  data_fine: string
  ora_inizio: string | null
  ora_fine: string | null
  stato: string
  profiles?: { first_name: string; last_name: string; avatar_url?: string }
}

interface ProfileInfo {
  id: string
  first_name: string
  last_name: string
  avatar_url?: string | null
}

const LAYER_DEFAULTS: Record<LayerKey, boolean> = { eventi: true, task: true, memo: true, ferie: true, creative: true, social: true, pratiche: true }

function loadLayers(): Record<LayerKey, boolean> {
  try { return JSON.parse(localStorage.getItem('cal_layers') || 'null') ?? LAYER_DEFAULTS } catch { return LAYER_DEFAULTS }
}
function saveLayers(l: Record<LayerKey, boolean>) { localStorage.setItem('cal_layers', JSON.stringify(l)) }

function loadFilterPeople(): string[] {
  try { return JSON.parse(localStorage.getItem('cal_filter_people') || '[]') } catch { return [] }
}
function saveFilterPeople(p: string[]) { localStorage.setItem('cal_filter_people', JSON.stringify(p)) }

function getDayLoad(n: number): 'light' | 'medium' | 'heavy' | 'critical' {
  if (n === 0) return 'light'
  if (n <= 2) return 'medium'
  if (n <= 5) return 'heavy'
  return 'critical'
}

function generateICS(items: CalItem[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Simmetria Synergy//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const item of items) {
    if (item.type === 'event') {
      const ev = item.data as Event
      lines.push('BEGIN:VEVENT', `UID:synergy-event-${ev.id}`, `DTSTART;VALUE=DATE:${ev.dataInizio.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${ev.dataFine.replace(/-/g, '')}`, `SUMMARY:${ev.nome}`, `DESCRIPTION:${ev.location || ''} ${ev.partecipanti || ''} pax`, 'STATUS:CONFIRMED', 'END:VEVENT')
    } else if (item.type === 'task') {
      const t = item.data as Task
      lines.push('BEGIN:VTODO', `UID:synergy-task-${t.id}`, `DUE;VALUE=DATE:${t.scadenza.replace(/-/g, '')}`, `SUMMARY:${t.titolo}`, `DESCRIPTION:${t.descrizione || ''}`, 'END:VTODO')
    } else if (item.type === 'memo') {
      const m = item.data as CalendarItem
      lines.push('BEGIN:VEVENT', `UID:synergy-memo-${m.id}`, `DTSTART;VALUE=DATE:${m.start_date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${(m.end_date || m.start_date).replace(/-/g, '')}`, `SUMMARY:${m.title}`, `DESCRIPTION:${m.description || ''}`, 'END:VEVENT')
    }
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

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
                {m.start_time ? `${m.start_time.slice(0, 5)} · ` : ''}{fmtLong(m.start_date)}{m.end_date ? ` \u2192 ${fmtLong(m.end_date)}` : ''}
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

  if (item.type === 'leave') {
    const l = item.data as LeaveRequest
    const timeStr = l.tipo === 'permesso' && l.ora_inizio && l.ora_fine
      ? `${l.ora_inizio.slice(0, 5)}\u2013${l.ora_fine.slice(0, 5)}`
      : null
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}>
        <div className="w-full max-w-sm rounded-2xl overflow-hidden animate-fade-in"
          style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}
          onClick={e => e.stopPropagation()}>
          <div className="p-5" style={{ borderBottom: '1px solid var(--line)', borderLeft: '3px solid #3b82f6', paddingLeft: '17px' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Assenza</span>
                <h3 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{l.tipo}</h3>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0">
                <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <span className="text-xs px-2 py-0.5 rounded mt-2 inline-block"
              style={{ background: l.stato === 'approvata' ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)', color: l.stato === 'approvata' ? '#22c55e' : '#eab308' }}>
              {l.stato.replace('_', ' ')}
            </span>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
              <span style={{ fontSize: 14, color: 'var(--text)' }}>
                {fmtLong(l.data_inizio)}{l.data_fine !== l.data_inizio ? ` \u2192 ${fmtLong(l.data_fine)}` : ''}
              </span>
            </div>
            {timeStr && (
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                <span style={{ fontSize: 14, color: 'var(--text)' }}>{timeStr}</span>
              </div>
            )}
            {l.profiles && (
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                <span style={{ fontSize: 14, color: 'var(--text)' }}>{l.profiles.first_name} {l.profiles.last_name}</span>
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

function CalPill({ item, onClick, onDragStart, isLastDay, isFirstDay, isContinuation, onResizeStart }: {
  item: CalItem
  onClick: () => void
  onDragStart?: (e: React.DragEvent) => void
  isLastDay?: boolean
  isFirstDay?: boolean
  isContinuation?: boolean
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
            : item.type === 'leave'
              ? '#3b82f6'
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
            : item.type === 'leave'
              ? ((item.data as LeaveRequest).tipo + ((item.data as LeaveRequest).tipo === 'permesso' && (item.data as LeaveRequest).ora_inizio && (item.data as LeaveRequest).ora_fine ? ` ${(item.data as LeaveRequest).ora_inizio!.slice(0, 5)}–${(item.data as LeaveRequest).ora_fine!.slice(0, 5)}` : ''))
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
            : item.type === 'leave'
              ? daysLeft((item.data as LeaveRequest).data_inizio)
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
            : item.type === 'leave'
              ? false
              : (item.data as Pratica).stato === 'completata'
  const isOverdue = dl < 0 && !isDone

  const isMultiDay = item.type === 'event' && (isFirstDay !== undefined || isContinuation)
  const isMiddle = isMultiDay && !isFirstDay && !isLastDay

  const pillRadius = !isMultiDay ? '6px'
    : isFirstDay && isLastDay ? '6px'
    : isFirstDay ? '6px 0 0 6px'
    : isLastDay ? '0 6px 6px 0'
    : '0'

  const pillBorderLeft = (!isMultiDay || (isFirstDay && !isContinuation))
    ? `3px solid ${color}` : 'none'

  const pillBg = isMiddle || (isMultiDay && isLastDay && !isFirstDay)
    ? `${color}0c` : `${color}15`

  const pillBorderTop = isMiddle ? `1px solid ${color}20` : 'none'
  const pillBorderBottom = isMiddle ? `1px solid ${color}20` : 'none'

  const showLabel = !isMultiDay || isFirstDay || isContinuation

  return (
    <div draggable={!!onDragStart} onDragStart={onDragStart}
      onClick={e => { e.stopPropagation(); onClick() }}
      className={`relative truncate px-1.5 py-0.5 text-xs transition-colors select-none ${onDragStart ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} group/pill`}
      style={{
        borderRadius: pillRadius,
        background: pillBg,
        color,
        borderLeft: pillBorderLeft,
        borderTop: pillBorderTop,
        borderBottom: pillBorderBottom,
        fontSize: '11px',
        fontFamily: 'inherit',
        opacity: isDone && item.type !== 'event' ? 0.5 : 1,
        outline: isOverdue ? `1px dashed ${color}60` : 'none',
        marginLeft: isMultiDay && !isFirstDay ? '-4px' : undefined,
        marginRight: isMultiDay && !isLastDay ? '-4px' : undefined,
      }}>
      {urgent && <Zap style={{ display: 'inline', width: 9, height: 9, marginRight: 2, marginBottom: 1 }} />}
      {item.type === 'memo' && <Bell style={{ display: 'inline', width: 9, height: 9, marginRight: 2, marginBottom: 1 }} />}
      {item.type === 'memo' && (item.data as CalendarItem).start_time && <span style={{ opacity: 0.7 }}>{(item.data as CalendarItem).start_time!.slice(0, 5)} </span>}
      {showLabel ? (isContinuation && !isFirstDay ? `\u2190 ${label}` : label) : '\u00A0'}
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
        return day >= isoToLocalMidnight(ev.dataInizio) && day <= isoToLocalMidnight(ev.dataFine)
      }
      if (item.type === 'pratica') {
        return sameDay(day, isoToLocalMidnight((item.data as Pratica).scadenza))
      }
      if (item.type === 'creative') {
        const c = item.data as CreativeProject
        return c.due_date ? sameDay(day, isoToLocalMidnight(c.due_date)) : false
      }
      if (item.type === 'social') {
        const s = item.data as SocialContent
        return s.publish_date ? sameDay(day, isoToLocalMidnight(s.publish_date)) : false
      }
      if (item.type === 'memo') {
        const m = item.data as CalendarItem
        if (m.end_date) {
          return day >= isoToLocalMidnight(m.start_date) && day <= isoToLocalMidnight(m.end_date)
        }
        return sameDay(day, isoToLocalMidnight(m.start_date))
      }
      if (item.type === 'leave') {
        const leave = item.data as LeaveRequest
        if (!leave.data_inizio || !leave.data_fine) return false
        return day >= isoToLocalMidnight(leave.data_inizio) && day <= isoToLocalMidnight(leave.data_fine)
      }
      return sameDay(day, isoToLocalMidnight((item.data as Task).scadenza))
    })
  }

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
      <div className="grid grid-cols-7 border-b min-w-[600px]" style={{ borderColor: 'var(--line)' }}>
        {HEADER_DAYS.map((d, i) => (
          <div key={d} className="py-2 text-center"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', opacity: i >= 5 ? 0.4 : 0.6 }}>{d}</div>
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
              {(() => {
                const load = getDayLoad(dayItems.length)
                if (load === 'light') return null
                const w = load === 'medium' ? '20%' : load === 'heavy' ? '60%' : '100%'
                const c = load === 'medium' ? 'var(--green)' : load === 'heavy' ? 'var(--yellow)' : 'var(--red2)'
                return <div className="mx-1 mt-0.5 h-[3px] rounded-full" style={{ width: w, background: c }} title={load === 'critical' ? 'Giornata intensa' : undefined} />
              })()}
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
                  const isEvtFirstDay = item.type === 'event' && sameDay(day, isoToLocalMidnight((item.data as Event).dataInizio))
                  const isEvtLastDay = item.type === 'event' && sameDay(day, isoToLocalMidnight((item.data as Event).dataFine))
                  const isEvtMultiDay = item.type === 'event' && (item.data as Event).dataInizio !== (item.data as Event).dataFine
                  const isEvtContinuation = isEvtMultiDay && !isEvtFirstDay && day.getDay() === 1
                  return (
                    <CalPill key={id} item={item}
                      onClick={() => onItemClick(item)}
                      isFirstDay={isEvtMultiDay ? isEvtFirstDay : undefined}
                      isLastDay={isEvtLastDay}
                      isContinuation={isEvtContinuation || undefined}
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
        return day >= isoToLocalMidnight(ev.dataInizio) && day <= isoToLocalMidnight(ev.dataFine)
      }
      if (item.type === 'pratica') {
        return sameDay(day, isoToLocalMidnight((item.data as Pratica).scadenza))
      }
      if (item.type === 'creative') {
        const c = item.data as CreativeProject
        return c.due_date ? sameDay(day, isoToLocalMidnight(c.due_date)) : false
      }
      if (item.type === 'social') {
        const s = item.data as SocialContent
        return s.publish_date ? sameDay(day, isoToLocalMidnight(s.publish_date)) : false
      }
      if (item.type === 'memo') {
        const m = item.data as CalendarItem
        if (m.end_date) return day >= isoToLocalMidnight(m.start_date) && day <= isoToLocalMidnight(m.end_date)
        return sameDay(day, isoToLocalMidnight(m.start_date))
      }
      if (item.type === 'leave') {
        const leave = item.data as LeaveRequest
        if (!leave.data_inizio || !leave.data_fine) return false
        return day >= isoToLocalMidnight(leave.data_inizio) && day <= isoToLocalMidnight(leave.data_fine)
      }
      return sameDay(day, isoToLocalMidnight((item.data as Task).scadenza))
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
                const isEvtLastDay = item.type === 'event' && sameDay(day, isoToLocalMidnight((item.data as Event).dataFine))
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
      return day >= isoToLocalMidnight(ev.dataInizio) && day <= isoToLocalMidnight(ev.dataFine)
    }
    if (item.type === 'pratica') {
      return sameDay(day, isoToLocalMidnight((item.data as Pratica).scadenza))
    }
    if (item.type === 'creative') {
      const c = item.data as CreativeProject
      return c.due_date ? sameDay(day, isoToLocalMidnight(c.due_date)) : false
    }
    if (item.type === 'social') {
      const s = item.data as SocialContent
      return s.publish_date ? sameDay(day, isoToLocalMidnight(s.publish_date)) : false
    }
    if (item.type === 'memo') {
      const m = item.data as CalendarItem
      if (m.end_date) return day >= isoToLocalMidnight(m.start_date) && day <= isoToLocalMidnight(m.end_date)
      return sameDay(day, isoToLocalMidnight(m.start_date))
    }
    if (item.type === 'leave') {
      const leave = item.data as LeaveRequest
      if (!leave.data_inizio || !leave.data_fine) return false
      return day >= isoToLocalMidnight(leave.data_inizio) && day <= isoToLocalMidnight(leave.data_fine)
    }
    return sameDay(day, isoToLocalMidnight((item.data as Task).scadenza))
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
    { label: 'Mattina', range: '08:00 - 12:00', emoji: '🌅', items: evItems.slice(0, Math.ceil(evItems.length / 2)) },
    { label: 'Pomeriggio', range: '13:00 - 18:00', emoji: '☀️', items: evItems.slice(Math.ceil(evItems.length / 2)) },
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

type CreateType = 'promemoria' | 'task' | 'evento'

function QuickCreateModal({ defaultDate, onClose, onCreate }: {
  defaultDate: string
  onClose: () => void
  onCreate: () => void
}) {
  const [type, setType] = useState<CreateType>('promemoria')
  const [titolo, setTitolo] = useState('')
  const [desc, setDesc] = useState('')
  const [dataInizio, setDataInizio] = useState(defaultDate)
  const [dataFine, setDataFine] = useState(defaultDate)
  const [selectedTime, setSelectedTime] = useState('')
  const [alert, setAlert] = useState<'none' | '10min' | '1h' | '1d' | '1w'>('none')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!titolo.trim() || saving) return
    setSaving(true)
    const itemType: CalendarItem['item_type'] = type
    const hasEndDate = type !== 'task' && dataFine && dataFine !== dataInizio
    await upsertCalendarItem({
      title: titolo,
      description: desc,
      item_type: itemType,
      start_date: dataInizio,
      end_date: hasEndDate ? dataFine : null,
      start_time: selectedTime || null,
      alert,
    })
    setSaving(false)
    onCreate()
  }

  const typeLabel = type === 'promemoria' ? 'Promemoria' : type === 'task' ? 'Task' : 'Evento'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md rounded-2xl p-5 space-y-4"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
            Nuovo {typeLabel}
          </h3>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {/* Type selector - 3 columns */}
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'promemoria' as CreateType, label: 'Promemoria', icon: Bell },
            { id: 'task' as CreateType, label: 'Task', icon: CheckSquare },
            { id: 'evento' as CreateType, label: 'Evento', icon: Calendar },
          ]).map(t => (
            <button key={t.id} onClick={() => setType(t.id)}
              className="flex flex-col items-center gap-1 py-3 rounded-xl font-medium transition-all"
              style={{
                background: type === t.id ? 'var(--red)' : 'transparent',
                color: type === t.id ? 'white' : 'var(--muted)',
                border: type === t.id ? 'none' : '1px solid var(--line)',
                fontSize: '14px',
                minHeight: '44px',
              }}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <input
            value={titolo} onChange={e => setTitolo(e.target.value)}
            placeholder={type === 'evento' ? 'Nome evento' : type === 'promemoria' ? 'Titolo promemoria' : 'Titolo task'}
            className="w-full px-3 py-3 rounded-xl"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '14px' }}
          />
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Descrizione (opzionale)"
            rows={2}
            className="w-full px-3 py-3 rounded-xl resize-none"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '14px' }}
          />

          {/* Date fields */}
          {type === 'task' ? (
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Scadenza</label>
              <input type="date" value={dataInizio} onChange={e => setDataInizio(e.target.value)}
                className="w-full px-3 py-3 rounded-xl"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '16px', minHeight: '44px' }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Data inizio</label>
                <input type="date" value={dataInizio} onChange={e => setDataInizio(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '16px', minHeight: '44px' }}
                />
              </div>
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Data fine (opz.)</label>
                <input type="date" value={dataFine} onChange={e => setDataFine(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '16px', minHeight: '44px' }}
                />
              </div>
            </div>
          )}

          {/* Time field */}
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Orario</label>
            <input type="time" value={selectedTime} onChange={e => setSelectedTime(e.target.value)}
              className="w-full px-3 py-3 rounded-xl"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '16px', minHeight: '44px' }}
            />
          </div>

          {/* Alert - available for all types */}
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Alert</label>
            <select value={alert} onChange={e => setAlert(e.target.value as typeof alert)}
              className="w-full px-3 py-3 rounded-xl"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '14px', minHeight: '44px' }}>
              <option value="none">Nessun alert</option>
              <option value="10min">10 minuti prima</option>
              <option value="1h">1 ora prima</option>
              <option value="1d">1 giorno prima</option>
              <option value="1w">1 settimana prima</option>
            </select>
          </div>
        </div>

        <button onClick={handleSubmit} disabled={!titolo.trim() || saving}
          className="w-full py-3 rounded-xl font-semibold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white', fontSize: '14px', minHeight: '44px' }}>
          {saving ? 'Salvataggio...' : `Crea ${typeLabel}`}
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
    return addDaysISO(iso, days)
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
  const [editTime, setEditTime] = useState(item.start_time ? item.start_time.slice(0, 5) : '')
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
      start_time: editTime || null,
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
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'block', color: 'var(--muted)' }}>Orario</label>
            <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: '16px', minHeight: '44px' }}
            />
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

// ─── Team View ───────────────────────────────────────────────────────────────

function TeamView({ weekStart, items, profiles, onItemClick }: {
  weekStart: Date; items: CalItem[]; profiles: ProfileInfo[]; onItemClick: (item: CalItem) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  function getForDayUser(day: Date, userId: string): CalItem[] {
    return items.filter(item => {
      const owner = getItemOwner(item)
      if (owner !== userId) return false
      if (item.type === 'event') {
        const ev = item.data as Event
        return day >= isoToLocalMidnight(ev.dataInizio) && day <= isoToLocalMidnight(ev.dataFine)
      }
      if (item.type === 'task') return sameDay(day, isoToLocalMidnight((item.data as Task).scadenza))
      if (item.type === 'leave') {
        const l = item.data as LeaveRequest
        return day >= isoToLocalMidnight(l.data_inizio) && day <= isoToLocalMidnight(l.data_fine)
      }
      if (item.type === 'memo') {
        const m = item.data as CalendarItem
        if (m.end_date) return day >= isoToLocalMidnight(m.start_date) && day <= isoToLocalMidnight(m.end_date)
        return sameDay(day, isoToLocalMidnight(m.start_date))
      }
      return false
    })
  }

  function getItemOwner(item: CalItem): string {
    if (item.type === 'event') return (item.data as Event).responsabile || ''
    if (item.type === 'task') return (item.data as Task).assegnatario || ''
    if (item.type === 'leave') return (item.data as LeaveRequest).user_id || ''
    if (item.type === 'memo') return (item.data as CalendarItem).user_id || ''
    return ''
  }

  const LEAVE_COLORS: Record<string, string> = {
    ferie: 'rgba(59,130,246,0.15)',
    permesso: 'rgba(234,179,8,0.12)',
    malattia: 'rgba(107,114,128,0.12)',
    recupero: 'rgba(34,197,94,0.12)',
  }

  if (profiles.length === 0) return <div className="panel p-8 text-center" style={{ color: 'var(--muted)' }}>Caricamento team...</div>

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(700, profiles.length * 160 + 80) }}>
          {/* Header row */}
          <div className="grid border-b" style={{ gridTemplateColumns: `60px repeat(${profiles.length}, 1fr)`, borderColor: 'var(--line)' }}>
            <div className="p-2" style={{ borderRight: '1px solid var(--line)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>
                {fmtShort(toISO(weekStart))}
              </span>
            </div>
            {profiles.map(p => (
              <div key={p.id} className="p-2 text-center" style={{ borderRight: '1px solid var(--line)' }}>
                <div className="w-6 h-6 rounded-full mx-auto mb-1 flex items-center justify-center text-[10px] font-bold" style={{ background: 'var(--red)', color: '#fff' }}>
                  {(p.first_name?.[0] || '').toUpperCase()}{(p.last_name?.[0] || '').toUpperCase()}
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>
                  {p.first_name}
                </span>
              </div>
            ))}
          </div>
          {/* Day rows */}
          {days.map((day, di) => {
            const isToday = sameDay(day, new Date())
            return (
              <div key={di} className="grid border-b" style={{ gridTemplateColumns: `60px repeat(${profiles.length}, 1fr)`, borderColor: 'var(--line)', background: isToday ? 'color-mix(in srgb, var(--red2) 3%, transparent)' : undefined }}>
                <div className="p-2 flex flex-col justify-center" style={{ borderRight: '1px solid var(--line)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--red2)' : 'var(--text)' }}>{day.getDate()}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)' }}>{DAYS_IT[day.getDay()]}</span>
                </div>
                {profiles.map(p => {
                  const userItems = getForDayUser(day, p.id)
                  const leave = userItems.find(i => i.type === 'leave')
                  const leaveData = leave ? (leave.data as LeaveRequest) : undefined
                  const leaveBg = leaveData ? LEAVE_COLORS[leaveData.tipo] || LEAVE_COLORS.ferie : undefined
                  const isInAttesa = leaveData?.stato === 'in_attesa'
                  return (
                    <div key={p.id} className="p-1 min-h-[44px] space-y-0.5" style={{ borderRight: '1px solid var(--line)', background: leaveBg, opacity: isInAttesa ? 0.5 : 1, borderStyle: isInAttesa ? 'dashed' : 'solid', borderWidth: isInAttesa ? '1px' : undefined }}>
                      {leave && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--blue)' }}>
                          {leaveData!.tipo}{leaveData!.tipo === 'permesso' && leaveData!.ora_inizio && leaveData!.ora_fine ? ` ${leaveData!.ora_inizio.slice(0, 5)}–${leaveData!.ora_fine.slice(0, 5)}` : ''}{isInAttesa ? ' (attesa)' : ''}
                        </span>
                      )}
                      {userItems.filter(i => i.type !== 'leave').slice(0, 2).map(item => (
                        <CalPill key={item.type === 'event' ? (item.data as Event).id : (item.data as Task).id} item={item} onClick={() => onItemClick(item)} />
                      ))}
                    </div>
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

// ─── Mini Calendar ───────────────────────────────────────────────────────────

function MiniCalendar({ cursor, items, onDayClick }: {
  cursor: Date; items: CalItem[]; onDayClick: (d: Date) => void
}) {
  const [month, setMonth] = useState(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const calStart = startOfWeek(month)
  const cells: Date[] = []
  for (let d = new Date(calStart); cells.length < 42; d = addDays(d, 1)) cells.push(new Date(d))

  function dayHasItems(day: Date): boolean {
    return items.some(item => {
      if (item.type === 'event') {
        const ev = item.data as Event
        return day >= isoToLocalMidnight(ev.dataInizio) && day <= isoToLocalMidnight(ev.dataFine)
      }
      if (item.type === 'task') return sameDay(day, isoToLocalMidnight((item.data as Task).scadenza))
      if (item.type === 'memo') {
        const m = item.data as CalendarItem
        if (m.end_date) return day >= isoToLocalMidnight(m.start_date) && day <= isoToLocalMidnight(m.end_date)
        return sameDay(day, isoToLocalMidnight(m.start_date))
      }
      return false
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-1 rounded hover:bg-white/10"><ChevronLeft className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} /></button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>{MONTHS_IT[month.getMonth()].slice(0, 3).toUpperCase()} {month.getFullYear()}</span>
        <button onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-1 rounded hover:bg-white/10"><ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} /></button>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className="text-center py-0.5" style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)' }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          const isCurrentMonth = day.getMonth() === month.getMonth()
          const isToday = sameDay(day, today)
          const hasItems = dayHasItems(day)
          return (
            <button key={i} onClick={() => onDayClick(day)}
              className="w-7 h-7 flex flex-col items-center justify-center rounded-full relative transition-colors"
              style={{ background: isToday ? 'var(--red2)' : 'transparent', color: isToday ? '#fff' : isCurrentMonth ? 'var(--text)' : 'var(--muted)', opacity: isCurrentMonth ? 1 : 0.3, fontSize: 10, fontFamily: 'var(--font-mono)' }}>
              {day.getDate()}
              {hasItems && !isToday && <span className="absolute bottom-0.5 w-1 h-1 rounded-full" style={{ background: 'var(--red2)' }} />}
            </button>
          )
        })}
      </div>
      <div className="space-y-1 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
        {[{ label: 'Evento', color: '#ff315f' }, { label: 'Task', color: '#38d27d' }, { label: 'Memo', color: '#a78bfa' }, { label: 'Ferie', color: '#3b82f6' }].map(l => (
          <div key={l.label} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Leave Request Form ──────────────────────────────────────────────────────

function LeaveRequestForm({ userId, onClose, onSubmit }: {
  userId: string; onClose: () => void; onSubmit: () => void
}) {
  const [tipo, setTipo] = useState<'ferie' | 'permesso' | 'malattia' | 'recupero'>('ferie')
  const [dataInizio, setDataInizio] = useState('')
  const [dataFine, setDataFine] = useState('')
  const [oraInizio, setOraInizio] = useState('')
  const [oraFine, setOraFine] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const durata = useMemo(() => {
    if (!dataInizio || !dataFine) return 0
    const d1 = new Date(dataInizio); const d2 = new Date(dataFine)
    return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1)
  }, [dataInizio, dataFine])

  const handleSubmit = async () => {
    setSubmitError(null)
    if (!dataInizio || !dataFine) {
      setSubmitError('Inserisci la data di inizio e di fine.')
      return
    }
    if (dataFine < dataInizio) {
      setSubmitError('La data di fine non può essere precedente a quella di inizio.')
      return
    }
    if (tipo === 'permesso') {
      if (!oraInizio || !oraFine) {
        setSubmitError('Per un permesso è necessario indicare ora inizio e ora fine.')
        return
      }
      if (oraFine <= oraInizio) {
        setSubmitError('L\'ora di fine deve essere successiva a quella di inizio.')
        return
      }
    }
    if (!userId) return
    setSaving(true)
    try {
      const result = await createLeaveRequest({ tipo, dataInizio, dataFine, oraInizio: oraInizio || undefined, oraFine: oraFine || undefined, motivo: motivo || undefined })
      if (result && result.error) {
        setSubmitError('Impossibile inviare la richiesta. Riprova più tardi.')
        return
      }
      onSubmit()
    } catch {
      setSubmitError('Impossibile inviare la richiesta. Riprova più tardi.')
    } finally { setSaving(false) }
  }

  const TIPI = [
    { value: 'ferie' as const, label: 'Ferie' },
    { value: 'permesso' as const, label: 'Permesso' },
    { value: 'malattia' as const, label: 'Malattia' },
    { value: 'recupero' as const, label: 'Recupero' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 28, width: 400, maxWidth: '90vw' }}>
        <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text)', marginBottom: 18 }}>Richiesta Ferie / Permesso</h3>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {TIPI.map(t => (
            <button key={t.value} onClick={() => setTipo(t.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 14, padding: '10px 14px', minHeight: 44, borderRadius: 6, border: tipo === t.value ? '1.5px solid var(--red2)' : '1px solid var(--line)', background: tipo === t.value ? 'rgba(208,0,58,0.08)' : 'transparent', color: tipo === t.value ? 'var(--red2)' : 'var(--muted)', cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--muted)' }}>
            Dal
            <input type="date" value={dataInizio} onChange={e => { setDataInizio(e.target.value); if (!dataFine || e.target.value > dataFine) setDataFine(e.target.value) }}
              style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 14, padding: '10px 8px', minHeight: 44, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)' }} />
          </label>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--muted)' }}>
            Al
            <input type="date" value={dataFine} min={dataInizio} onChange={e => setDataFine(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 14, padding: '10px 8px', minHeight: 44, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)' }} />
          </label>
        </div>

        {tipo === 'permesso' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--muted)' }}>
              Dalle
              <input type="time" value={oraInizio} onChange={e => setOraInizio(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 14, padding: '10px 8px', minHeight: 44, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)' }} />
            </label>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--muted)' }}>
              Alle
              <input type="time" value={oraFine} onChange={e => setOraFine(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 14, padding: '10px 8px', minHeight: 44, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)' }} />
            </label>
          </div>
        )}

        {durata > 0 && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', marginBottom: 12, fontWeight: 600 }}>Durata: {durata} giorn{durata === 1 ? 'o' : 'i'}</p>
        )}

        <label style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--muted)', display: 'block', marginBottom: 16 }}>
          Motivo (opzionale)
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} placeholder="Opzionale..."
            style={{ display: 'block', width: '100%', marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 14, padding: '10px 8px', minHeight: 44, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)', resize: 'vertical' }} />
        </label>

        {submitError && (
          <p role="alert" style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--red2)', marginBottom: 12, fontWeight: 500 }}>{submitError}</p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ fontFamily: 'var(--font-mono)', fontSize: 14, padding: '10px 14px', minHeight: 44, borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>Annulla</button>
          <button onClick={handleSubmit} disabled={saving}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 14, padding: '10px 14px', minHeight: 44, borderRadius: 6, border: 'none', background: 'var(--red2)', color: '#fff', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Invio...' : 'Invia richiesta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Filter Bar ──────────────────────────────────────────────────────────────

function FilterBar({ layers, onToggleLayer, people, selectedPeople, onTogglePerson, profiles }: {
  layers: Record<LayerKey, boolean>
  onToggleLayer: (k: LayerKey) => void
  people: string[]
  selectedPeople: string[]
  onTogglePerson: (id: string) => void
  profiles: ProfileInfo[]
}) {
  const allSelected = selectedPeople.length === 0

  return (
    <div className="panel p-3 space-y-3">
      <div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Layer</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LAYER_DEFAULTS) as LayerKey[]).map(k => (
            <button key={k} onClick={() => onToggleLayer(k)}
              className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
              style={{ fontFamily: 'var(--font-mono)', background: layers[k] ? 'color-mix(in srgb, var(--red2) 12%, transparent)' : 'var(--panel2)', color: layers[k] ? 'var(--red2)' : 'var(--muted)', border: `1px solid ${layers[k] ? 'color-mix(in srgb, var(--red2) 30%, transparent)' : 'var(--line)'}` }}>
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {profiles.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Persone</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => { people.forEach(id => { if (selectedPeople.includes(id)) onTogglePerson(id) }) }}
              className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
              style={{ fontFamily: 'var(--font-mono)', background: allSelected ? 'color-mix(in srgb, var(--blue) 12%, transparent)' : 'var(--panel2)', color: allSelected ? 'var(--blue)' : 'var(--muted)', border: `1px solid ${allSelected ? 'color-mix(in srgb, var(--blue) 30%, transparent)' : 'var(--line)'}` }}>
              Tutti
            </button>
            {profiles.map(p => {
              const selected = selectedPeople.includes(p.id) || allSelected
              return (
                <button key={p.id} onClick={() => onTogglePerson(p.id)}
                  className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
                  style={{ fontFamily: 'var(--font-mono)', background: selected ? 'color-mix(in srgb, var(--blue) 12%, transparent)' : 'var(--panel2)', color: selected ? 'var(--text)' : 'var(--muted)', border: `1px solid ${selected ? 'color-mix(in srgb, var(--blue) 30%, transparent)' : 'var(--line)'}` }}>
                  {p.first_name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shortcuts Help ──────────────────────────────────────────────────────────

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    ['T', 'Oggi'], ['M', 'Mese'], ['W', 'Settimana'], ['D', 'Giorno'],
    ['E', 'Team'], ['A', 'Agenda'], ['N', 'Nuovo'], ['F', 'Filtri'],
    ['\u2190\u2192', 'Naviga'], ['Esc', 'Chiudi'],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative rounded-xl p-5 max-w-xs w-full" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }} onClick={e => e.stopPropagation()}>
        <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Scorciatoie tastiera</h4>
        <div className="grid grid-cols-2 gap-2">
          {shortcuts.map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ fontFamily: 'var(--font-mono)', background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>{key}</kbd>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Calendario() {
  const nav = useNavigate()
  const { showToast } = useToast()
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [allEvents, setAllEvents] = useState<Event[]>([])
  const [allPratiche, setAllPratiche] = useState<Pratica[]>([])
  const [allUscite, setAllUscite] = useState<Uscita[]>([])
  const [allCreative, setAllCreative] = useState<CreativeProject[]>([])
  const [allSocial, setAllSocial] = useState<SocialContent[]>([])
  const [allMemos, setAllMemos] = useState<CalendarItem[]>([])
  const [allLeaves, setAllLeaves] = useState<LeaveRequest[]>([])
  const [teamProfiles, setTeamProfiles] = useState<ProfileInfo[]>([])
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0); return t
  })
  const [selectedItem, setSelectedItem] = useState<CalItem | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [editingMemo, setEditingMemo] = useState<CalendarItem | null>(null)
  const [editingEventDates, setEditingEventDates] = useState<Event | null>(null)
  const [shiftToast, setShiftToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(loadLayers)
  const [selectedPeople, setSelectedPeople] = useState<string[]>(loadFilterPeople)
  const [showSidebar, setShowSidebar] = useState(() => localStorage.getItem('cal_sidebar') !== 'false')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }, [])

  const currentUser = loadUser()
  const ruolo = currentUser?.ruolo ?? 'Admin'

  const refresh = useCallback(async () => {
    try {
      const [t, e, p, u, cr, so, memos] = await Promise.all([fetchTasks(), fetchEvents(), fetchPractices(), fetchBudgets(), fetchCreativeProjects(), fetchSocialContents(), fetchCalendarItems()])
      setAllTasks(t)
      setAllEvents(e)
      setAllPratiche(p)
      setAllUscite(u)
      setAllCreative(cr)
      setAllSocial(so)
      setAllMemos(memos)
      // Fetch only approved leave requests (all roles, all users)
      const { data: leaves } = await supabase.from('leave_requests')
        .select('id, user_id, tipo, data_inizio, data_fine, ora_inizio, ora_fine, stato, profiles!leave_requests_user_id_fkey(first_name, last_name, avatar_url)')
        .eq('stato', 'approvata')
      setAllLeaves((leaves ?? []) as unknown as LeaveRequest[])
      // Fetch active profiles for team view
      const { data: profs } = await supabase.from('profiles').select('id, first_name, last_name, avatar_url').eq('stato', 'attivo').order('first_name')
      setTeamProfiles((profs ?? []) as ProfileInfo[])
      setLastRefresh(new Date())
    } catch (err) {
      showToast('Errore caricamento calendario')
    }
  }, [showToast])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => { refresh() }, 300000)
    return () => clearInterval(interval)
  }, [refresh])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as Element).tagName)) return
      switch (e.key) {
        case 't': case 'T': { const t = new Date(); t.setHours(0, 0, 0, 0); setCursor(t) } break
        case 'm': case 'M': setView('month'); break
        case 'w': case 'W': setView('week'); break
        case 'd': case 'D': setView('day'); break
        case 'a': case 'A': setView('agenda'); break
        case 'e': case 'E': setView('team'); break
        case 'n': case 'N': setShowCreate(true); break
        case 'f': case 'F': setShowFilters(f => !f); break
        case 'ArrowLeft': if (!e.shiftKey) navigateCal(-1); break
        case 'ArrowRight': if (!e.shiftKey) navigateCal(1); break
        case 'Escape': setSelectedItem(null); setShowCreate(false); setShowShortcuts(false); break
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [view])

  // Layer/filter persistence
  function handleToggleLayer(k: LayerKey) {
    setLayers(prev => { const next = { ...prev, [k]: !prev[k] }; saveLayers(next); return next })
  }
  function handleTogglePerson(id: string) {
    setSelectedPeople(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      saveFilterPeople(next); return next
    })
  }
  function handleSidebarToggle() {
    setShowSidebar(v => { localStorage.setItem('cal_sidebar', String(!v)); return !v })
  }

  // Permission-filtered visible items
  const visibleItems = useMemo((): CalItem[] => {
    let filteredEvents = allEvents
    let filteredTasks = allTasks

    if (ruolo !== 'Admin' && ruolo !== 'Partner') {
    if (ruolo === 'Operativo') {
      filteredTasks = allTasks.filter(t => t.assegnatario === currentUser?.id)
      filteredEvents = []
    } else if (ruolo === 'Finance' || ruolo === 'Amministrazione') {
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
      ...(layers.eventi ? filteredEvents.map(e => ({ type: 'event' as const, data: e })) : []),
      ...(layers.task ? filteredTasks.map(t => ({ type: 'task' as const, data: t })) : []),
      ...(layers.pratiche ? visiblePratiche.map(p => ({ type: 'pratica' as const, data: p })) : []),
      ...(layers.creative ? visibleCreative.map(c => ({ type: 'creative' as const, data: c })) : []),
      ...(layers.social ? visibleSocial.map(s => ({ type: 'social' as const, data: s })) : []),
      ...(layers.memo ? allMemos.map(m => ({ type: 'memo' as const, data: m })) : []),
      ...(layers.ferie ? allLeaves.map(l => ({ type: 'leave' as const, data: l })) : []),
    ].filter(item => {
      if (selectedPeople.length === 0) return true
      const owner = item.type === 'event' ? (item.data as Event).responsabile
        : item.type === 'task' ? (item.data as Task).assegnatario
        : item.type === 'leave' ? (item.data as LeaveRequest).user_id
        : item.type === 'memo' ? (item.data as CalendarItem).user_id
        : null
      if (!owner) return true
      return selectedPeople.includes(owner)
    })
  }, [allTasks, allEvents, allPratiche, allCreative, allSocial, allMemos, allLeaves, ruolo, currentUser, layers, selectedPeople])

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
          await upsertCalendarItem({ id, title: memo.title, start_date: newDate, end_date: memo.end_date, start_time: memo.start_time, alert: memo.alert, item_type: memo.item_type, description: memo.description })
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
      const deltaDays = diffDaysISO(newDate, target.dataInizio)
      if (deltaDays === 0) return
      const newEnd = addDaysISO(target.dataFine, deltaDays)
      setAllEvents(prev => prev.map(e => e.id === id ? { ...e, dataInizio: newDate, dataFine: newEnd } : e))
      const { shift: result } = await moveEventWithTimelineShift(id, newDate)
      trackAction('calendar_cascade', { eventId: id })
      if (result.skipped.length > 0) {
        setShiftToast({ message: 'Evento spostato. Alcune scadenze non sono state aggiornate automaticamente.', type: 'warning' })
      } else {
        setShiftToast({ message: 'Evento spostato. Programma e servizi collegati aggiornati.', type: 'success' })
      }
      setTimeout(() => setShiftToast(null), 5000)
    }
    await refresh()
  }

  async function handleCreate() {
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
    if (view === 'week' || view === 'team') return `${fmtShort(toISO(weekStart))} - ${fmtShort(toISO(weekEnd))}`
    if (view === 'day') return `${DAYS_FULL[cursor.getDay()]} ${cursor.getDate()} ${MONTHS_IT[cursor.getMonth()]}`
    return 'Prossime scadenze'
  }, [view, cursor, weekStart, weekEnd])

  function navigateCal(dir: -1 | 1) {
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
      <div className="wire-card-flat" style={{ padding: '16px', borderRadius: 12, border: '1px solid var(--line)' }}>
        {/* Wire masthead */}
        <div className="wire-masthead" style={{ marginBottom: 0 }}>
          <div>
            <span className="wire-masthead-title">CALENDARIO</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginLeft: '12px' }}>
              {MONTHS_IT[cursor.getMonth()].toUpperCase()} {cursor.getFullYear()}
              {ruolo !== 'Admin' && ruolo !== 'Partner' && (
                <span style={{ marginLeft: '8px', color: 'var(--blue)' }}>[ {ruolo.toUpperCase()} ]</span>
              )}
            </span>
          </div>
          <div className="wire-masthead-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>
              {lastRefresh.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button onClick={handleSidebarToggle} title="Mini calendario"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: showSidebar ? 'var(--text)' : 'var(--muted)' }}>
              <PanelLeftOpen className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowFilters(f => !f)} title="Filtri [F]"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: showFilters ? 'var(--red2)' : 'var(--muted)' }}>
              <Filter className="w-3.5 h-3.5" />
            </button>
            <div className="relative">
              <button onClick={() => setShowExportMenu(v => !v)} title="Esporta"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <Download className="w-3.5 h-3.5" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 rounded-lg py-1 z-30 min-w-[180px]" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}>
                  <button onClick={() => { const ics = generateICS(visibleItems.filter(i => { if (i.type !== 'event') return false; const ev = i.data as Event; const m = cursor.getMonth(); return new Date(ev.dataInizio).getMonth() === m })); const blob = new Blob([ics], { type: 'text/calendar' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `synergy-${MONTHS_IT[cursor.getMonth()].toLowerCase()}.ics`; a.click(); URL.revokeObjectURL(url); setShowExportMenu(false) }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-white/5" style={{ color: 'var(--text)' }}>Esporta mese (.ics)</button>
                  <button onClick={() => { const ics = generateICS(visibleItems); const blob = new Blob([ics], { type: 'text/calendar' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'synergy-tutti.ics'; a.click(); URL.revokeObjectURL(url); setShowExportMenu(false) }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-white/5" style={{ color: 'var(--text)' }}>Esporta tutti (.ics)</button>
                </div>
              )}
            </div>
            <button onClick={() => window.print()} title="Stampa"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowShortcuts(true)} title="Scorciatoie [?]"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowLeaveForm(true)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
              + FERIE
            </button>
            <button onClick={() => setShowCreate(true)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
              + NUOVO
            </button>
          </div>
        </div>

        {/* Wire tabs — view selector */}
        <div className="wire-tabs" style={{ marginTop: 12 }}>
          {([
            { id: 'month' as ViewMode, label: 'MESE' },
            { id: 'week' as ViewMode, label: 'SETTIMANA' },
            { id: 'day' as ViewMode, label: 'GIORNO' },
            { id: 'team' as ViewMode, label: 'TEAM' },
            { id: 'agenda' as ViewMode, label: 'AGENDA' },
          ]).map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`wire-tab ${view === v.id ? 'wire-tab--active' : ''}`}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Wire ticker — KPIs */}
        <div className="wire-ticker" style={{ marginTop: 8 }}>
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
      </div>

      {/* Filter bar */}
      {showFilters && (
        <FilterBar
          layers={layers}
          onToggleLayer={handleToggleLayer}
          people={teamProfiles.map(p => p.id)}
          selectedPeople={selectedPeople}
          onTogglePerson={handleTogglePerson}
          profiles={teamProfiles}
        />
      )}

      {/* Navigation */}
      {view !== 'agenda' && (
        <div className="flex items-center gap-3">
          <button onClick={() => navigateCal(-1)}
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
          <button onClick={() => navigateCal(1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', transition: 'color 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Views */}
      <div className="flex gap-4 calendario-print">
        {showSidebar && (
          <div className="hidden sm:block flex-shrink-0 no-print" style={{ width: 200 }}>
            <MiniCalendar cursor={cursor} items={visibleItems} onDayClick={d => { setCursor(d); setView('day') }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
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
          {view === 'team' && (
            <TeamView
              weekStart={weekStart}
              items={visibleItems}
              profiles={teamProfiles}
              onItemClick={setSelectedItem}
            />
          )}
          {view === 'agenda' && (
            <AgendaView items={visibleItems} onItemClick={setSelectedItem} />
          )}
        </div>
      </div>

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

      {/* Leave request form */}
      {showLeaveForm && (
        <LeaveRequestForm
          userId={currentUser?.id ?? ''}
          onClose={() => setShowLeaveForm(false)}
          onSubmit={async () => { setShowLeaveForm(false); await refresh() }}
        />
      )}

      {/* Quick create modal */}
      {showCreate && (
        <QuickCreateModal
          defaultDate={toISO(cursor)}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

      {/* Shortcuts help */}
      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}

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
