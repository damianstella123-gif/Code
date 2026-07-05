import { useState, useMemo, useCallback, memo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Minus, GripVertical, Clock, Users,
  Calendar, MapPin, Hash, Search, ChevronRight, ChevronDown, Truck, Building2,
  UtensilsCrossed, Sparkles, Music, Palette, Hammer, UserCheck, Package, X,
} from 'lucide-react'
import { useEventTimeline, type TimelineService, type DayData } from '../lib/use-event-timeline'

const DAYS_FULL = ['Domenica', 'Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato']
const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

function formatDayHeader(dateStr: string): { dayName: string; dayNum: number; month: string } {
  const d = new Date(dateStr + 'T00:00:00Z')
  return {
    dayName: DAYS_FULL[d.getUTCDay()],
    dayNum: d.getUTCDate(),
    month: MONTHS_IT[d.getUTCMonth()],
  }
}

function categoriaLabel(cat: string): string {
  const map: Record<string, string> = {
    programma: 'Programma',
    transfer: 'Transfer',
    hotel: 'Hotel',
    ristorante: 'Ristorante',
    experience: 'Experience',
    catering: 'Catering',
    staff_interno: 'Staff Int.',
    staff_esterno: 'Staff Est.',
    audio_video: 'Audio/Video',
    allestimenti: 'Allestimenti',
    grafica_stampa: 'Grafica',
    varie: 'Varie',
  }
  return map[cat] ?? cat
}

interface CategoriaStyle {
  color: string
  bg: string
  icon: React.ElementType
}

function categoriaStyles(cat: string): CategoriaStyle {
  const styles: Record<string, CategoriaStyle> = {
    programma: { color: 'var(--blue)', bg: 'rgba(59,130,246,0.10)', icon: Calendar },
    transfer: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)', icon: Truck },
    hotel: { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', icon: Building2 },
    ristorante: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', icon: UtensilsCrossed },
    experience: { color: '#10b981', bg: 'rgba(16,185,129,0.10)', icon: Sparkles },
    catering: { color: '#f97316', bg: 'rgba(249,115,22,0.10)', icon: UtensilsCrossed },
    staff_interno: { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', icon: UserCheck },
    staff_esterno: { color: '#6366f1', bg: 'rgba(99,102,241,0.10)', icon: Users },
    audio_video: { color: '#a855f7', bg: 'rgba(168,85,247,0.10)', icon: Music },
    allestimenti: { color: 'var(--green)', bg: 'rgba(34,197,94,0.10)', icon: Hammer },
    grafica_stampa: { color: '#ec4899', bg: 'rgba(236,72,153,0.10)', icon: Palette },
    varie: { color: 'var(--muted)', bg: 'rgba(128,128,128,0.08)', icon: Package },
  }
  return styles[cat] ?? { color: 'var(--muted)', bg: 'rgba(128,128,128,0.08)', icon: Package }
}

function formatCurrency(n: number): string {
  if (!n) return '-'
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function formatCurrencyCompact(n: number): string {
  if (!n) return '-'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toFixed(0)
}

export default function EventTimeline() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const { event, days, loading, moveService, addDay, removeDay } = useEventTimeline(eventId ?? '')

  const [dragItem, setDragItem] = useState<TimelineService | null>(null)
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())

  const toggleCollapse = useCallback((date: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }, [])

  const filteredDays = useMemo(() => {
    if (!searchQuery.trim()) return days
    const q = searchQuery.toLowerCase()
    return days.map(day => ({
      ...day,
      services: day.services.filter(svc =>
        svc.titolo.toLowerCase().includes(q) ||
        categoriaLabel(svc.categoria).toLowerCase().includes(q)
      ),
    }))
  }, [days, searchQuery])

  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return null
    return filteredDays.reduce((s, d) => s + d.services.length, 0)
  }, [filteredDays, searchQuery])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Caricamento Timeline...</div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p style={{ color: 'var(--muted)' }}>Evento non trovato</p>
        <button onClick={() => navigate('/calendario')} className="text-sm underline" style={{ color: 'var(--red)' }}>
          Torna al Calendario
        </button>
      </div>
    )
  }

  const totalVenduto = days.reduce((sum, d) => sum + d.services.reduce((s, svc) => s + svc.venduto, 0), 0)
  const totalCosto = days.reduce((sum, d) => sum + d.services.reduce((s, svc) => s + svc.costo, 0), 0)
  const totalMargine = totalVenduto - totalCosto
  const marginePct = totalVenduto > 0 ? (totalMargine / totalVenduto) * 100 : 0
  const totalServices = days.reduce((s, d) => s + d.services.length, 0)

  const lastDayServices = days.length > 0 ? days[days.length - 1].services : []

  function handleRemoveDay() {
    if (lastDayServices.length === 0) {
      removeDay('delete_all')
    } else {
      setShowRemoveDialog(true)
    }
  }

  return (
    <div className="h-full flex flex-col gap-3 p-3 md:gap-4 md:p-5 lg:p-6">
      {/* Header */}
      <div
        className="rounded-2xl px-4 py-3 md:px-5 md:py-4"
        style={{
          background: 'var(--cc-glass)',
          backdropFilter: `blur(var(--cc-blur))`,
          WebkitBackdropFilter: `blur(var(--cc-blur))`,
          border: '1px solid var(--cc-glass-border)',
          boxShadow: 'var(--cc-shadow)',
        }}
      >
        {/* Top row: back + title + actions */}
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/calendario')}
            className="flex items-center gap-1 text-xs font-medium transition-all rounded-lg px-2 py-1.5 shrink-0"
            style={{ color: 'var(--muted)', background: 'var(--panel)', border: '1px solid var(--line)' }}
          >
            <ArrowLeft size={12} />
            <span className="hidden sm:inline">Calendario</span>
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-base md:text-lg font-bold truncate" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {event.nome}
            </h1>
            <div className="flex items-center gap-2 md:gap-3 mt-1 flex-wrap">
              <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                <Calendar size={10} /> {days.length}g
              </span>
              {event.cliente && (
                <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                  <Hash size={10} /> {event.cliente}
                </span>
              )}
              {event.location && (
                <span className="text-[11px] flex items-center gap-1 hidden sm:flex" style={{ color: 'var(--muted)' }}>
                  <MapPin size={10} /> {event.location}
                </span>
              )}
              {event.partecipanti > 0 && (
                <span className="text-[11px] flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                  <Users size={10} /> {event.partecipanti}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={addDay}
              className="flex items-center gap-1 px-2.5 md:px-3.5 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
                color: 'white',
                boxShadow: 'var(--shadow-red)',
              }}
            >
              <Plus size={12} />
              <span className="hidden sm:inline">Giornata</span>
            </button>
            <button
              onClick={handleRemoveDay}
              disabled={days.length <= 1}
              className="flex items-center gap-1 px-2.5 md:px-3.5 py-1.5 md:py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-30"
              style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--line)' }}
            >
              <Minus size={12} />
              <span className="hidden sm:inline">Rimuovi</span>
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-2.5 relative">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--muted)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cerca servizio..."
            className="w-full pl-8 pr-8 py-2 rounded-xl text-xs outline-none transition-all"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity"
              style={{ color: 'var(--muted)' }}
            >
              <X size={12} />
            </button>
          )}
          {matchCount !== null && (
            <span
              className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] font-medium hidden sm:inline"
              style={{ color: matchCount > 0 ? 'var(--blue)' : 'var(--red)' }}
            >
              {matchCount} {matchCount === 1 ? 'risultato' : 'risultati'}
            </span>
          )}
        </div>
      </div>

      {/* ═══ DESKTOP: Horizontal columns ═══ */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden hidden md:block" style={{ scrollBehavior: 'smooth' }}>
        <div className="flex gap-3 h-full pb-2" style={{ minWidth: days.length * 240 }}>
          {filteredDays.map((day, idx) => {
            const isCollapsed = collapsedDays.has(day.date)
            const originalDay = days[idx]
            return isCollapsed ? (
              <CollapsedDayColumn
                key={day.date}
                day={originalDay}
                dayIndex={idx}
                totalDays={days.length}
                onExpand={() => toggleCollapse(day.date)}
                isDragOver={dragOverDay === day.date}
                onDragOver={() => setDragOverDay(day.date)}
                onDragLeave={() => setDragOverDay(null)}
                onDrop={() => {
                  if (dragItem && dragItem.data !== day.date) {
                    moveService(dragItem, day.date)
                  }
                  setDragItem(null)
                  setDragOverDay(null)
                }}
              />
            ) : (
              <DayColumnComponent
                key={day.date}
                day={day}
                originalDay={originalDay}
                dayIndex={idx}
                totalDays={days.length}
                isDragOver={dragOverDay === day.date}
                onDragOver={() => setDragOverDay(day.date)}
                onDragLeave={() => setDragOverDay(null)}
                onDrop={() => {
                  if (dragItem && dragItem.data !== day.date) {
                    moveService(dragItem, day.date)
                  }
                  setDragItem(null)
                  setDragOverDay(null)
                }}
                onServiceDragStart={svc => setDragItem(svc)}
                onCollapse={() => toggleCollapse(day.date)}
                isFiltering={!!searchQuery.trim()}
              />
            )
          })}
        </div>
      </div>

      {/* ═══ MOBILE: Vertical accordion ═══ */}
      <div className="flex-1 overflow-y-auto md:hidden space-y-2 pb-2">
        {filteredDays.map((day, idx) => {
          const isCollapsed = collapsedDays.has(day.date)
          const originalDay = days[idx]
          return (
            <MobileDaySection
              key={day.date}
              day={day}
              originalDay={originalDay}
              dayIndex={idx}
              totalDays={days.length}
              isCollapsed={isCollapsed}
              onToggle={() => toggleCollapse(day.date)}
              isFiltering={!!searchQuery.trim()}
            />
          )
        })}
      </div>

      {/* Summary bar */}
      <div
        className="flex items-center justify-between px-3 py-2.5 md:px-5 md:py-3.5 rounded-2xl"
        style={{
          background: 'var(--cc-glass)',
          backdropFilter: `blur(var(--cc-blur))`,
          WebkitBackdropFilter: `blur(var(--cc-blur))`,
          border: '1px solid var(--cc-glass-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="flex items-center gap-3 md:gap-5 flex-wrap">
          <div className="flex flex-col">
            <span className="text-[9px] md:text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Venduto</span>
            <span className="text-xs md:text-sm font-bold" style={{ color: 'var(--text)' }}>{formatCurrency(totalVenduto)}</span>
          </div>
          <div className="w-px h-5 md:h-6" style={{ background: 'var(--line)' }} />
          <div className="flex flex-col">
            <span className="text-[9px] md:text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Costi</span>
            <span className="text-xs md:text-sm font-bold" style={{ color: 'var(--text)' }}>{formatCurrency(totalCosto)}</span>
          </div>
          <div className="w-px h-5 md:h-6" style={{ background: 'var(--line)' }} />
          <div className="flex flex-col">
            <span className="text-[9px] md:text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Margine</span>
            <span className="text-xs md:text-sm font-bold" style={{ color: totalMargine >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {formatCurrencyCompact(totalMargine)} <span className="hidden sm:inline">({marginePct.toFixed(1)}%)</span>
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] md:text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Srv</span>
          <span className="text-xs md:text-sm font-bold" style={{ color: 'var(--text)' }}>{totalServices}</span>
        </div>
      </div>

      {/* Remove dialog */}
      {showRemoveDialog && (
        <RemoveDayDialog
          day={days[days.length - 1]}
          onClose={() => setShowRemoveDialog(false)}
          onConfirm={async (strategy) => {
            await removeDay(strategy)
            setShowRemoveDialog(false)
          }}
        />
      )}
    </div>
  )
}

/* ═══ MOBILE DAY SECTION — vertical accordion ═══ */
function MobileDaySection({ day, originalDay, dayIndex, totalDays, isCollapsed, onToggle, isFiltering }: {
  day: DayData
  originalDay: DayData
  dayIndex: number
  totalDays: number
  isCollapsed: boolean
  onToggle: () => void
  isFiltering: boolean
}) {
  const { dayName, dayNum, month } = formatDayHeader(day.date)

  const indicators = useMemo(() => {
    const svcs = originalDay.services
    const costo = svcs.reduce((s, svc) => s + svc.costo, 0)
    const venduto = svcs.reduce((s, svc) => s + svc.venduto, 0)
    const margine = venduto - costo
    const fornitori = new Set(svcs.filter(s => s.fornitore_id).map(s => s.fornitore_id)).size
    return { count: svcs.length, costo, venduto, margine, fornitori }
  }, [originalDay.services])

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{
        background: 'var(--cc-glass)',
        backdropFilter: `blur(var(--cc-blur))`,
        WebkitBackdropFilter: `blur(var(--cc-blur))`,
        border: '1px solid var(--cc-glass-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Tappable header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ borderBottom: isCollapsed ? 'none' : '1px solid var(--cc-divider)' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xl font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.03em' }}>{dayNum}</span>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--muted)' }}>
              {month.slice(0, 3)} - {dayName}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-medium" style={{ color: 'var(--muted)' }}>
                {indicators.count} srv
              </span>
              {indicators.fornitori > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                  {indicators.fornitori} forn
                </span>
              )}
              {indicators.margine !== 0 && (
                <span className="text-[10px] font-medium" style={{ color: indicators.margine >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {formatCurrencyCompact(indicators.margine)}
                </span>
              )}
            </div>
          </div>
        </div>

        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0" style={{ background: 'var(--panel)', color: 'var(--muted)' }}>
          {dayIndex + 1}/{totalDays}
        </span>

        {isCollapsed ? (
          <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
        ) : (
          <ChevronDown size={14} style={{ color: 'var(--muted)' }} />
        )}
      </button>

      {/* Expanded content */}
      {!isCollapsed && (
        <div className="px-3 py-2 space-y-2">
          {/* Indicators row */}
          {indicators.count > 0 && (
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              <IndicatorPill label="Srv" value={String(indicators.count)} />
              <IndicatorPill label="Costo" value={formatCurrencyCompact(indicators.costo)} />
              <IndicatorPill label="Vend" value={formatCurrencyCompact(indicators.venduto)} />
              <IndicatorPill
                label="Marg"
                value={formatCurrencyCompact(indicators.margine)}
                color={indicators.margine >= 0 ? 'var(--green)' : 'var(--red)'}
              />
            </div>
          )}

          {/* Service cards */}
          {day.services.length === 0 && (
            <div
              className="flex items-center justify-center py-6 rounded-xl"
              style={{ border: '1px dashed var(--line)' }}
            >
              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                {isFiltering ? 'Nessun risultato' : 'Nessun servizio'}
              </span>
            </div>
          )}
          {day.services.map(svc => (
            <MobileServiceCard key={svc.id} service={svc} />
          ))}

          {/* Footer */}
          {isFiltering && day.services.length !== originalDay.services.length && (
            <p className="text-[10px] text-center py-1" style={{ color: 'var(--muted)' }}>
              {day.services.length}/{originalDay.services.length} visibili
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══ MOBILE SERVICE CARD ═══ */
function MobileServiceCard({ service }: { service: TimelineService }) {
  const style = categoriaStyles(service.categoria)
  const Icon = style.icon

  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderLeft: `3px solid ${style.color}`,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>
            {service.titolo}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
              style={{ background: style.bg, color: style.color }}
            >
              <Icon size={9} />
              {categoriaLabel(service.categoria)}
            </span>
            {service.ora && (
              <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--muted)' }}>
                <Clock size={9} />
                {service.ora.slice(0, 5)}
              </span>
            )}
            {service.pax && (
              <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--muted)' }}>
                <Users size={9} />
                {service.pax}
              </span>
            )}
            {(service.venduto > 0 || service.costo > 0) && (
              <>
                {service.venduto > 0 && (
                  <span className="text-[9px] font-medium" style={{ color: 'var(--green)' }}>
                    +{formatCurrencyCompact(service.venduto)}
                  </span>
                )}
                {service.costo > 0 && (
                  <span className="text-[9px] font-medium" style={{ color: 'var(--red)' }}>
                    -{formatCurrencyCompact(service.costo)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══ COLLAPSED DAY (desktop only) ═══ */
function CollapsedDayColumn({ day, dayIndex, totalDays, onExpand, isDragOver, onDragOver, onDragLeave, onDrop }: {
  day: DayData
  dayIndex: number
  totalDays: number
  onExpand: () => void
  isDragOver: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: () => void
}) {
  const { dayNum, month } = formatDayHeader(day.date)

  return (
    <div
      className="w-12 flex flex-col items-center rounded-2xl cursor-pointer transition-all hover:w-14"
      style={{
        background: isDragOver ? 'var(--cc-glass-deep)' : 'var(--cc-glass)',
        backdropFilter: `blur(var(--cc-blur))`,
        WebkitBackdropFilter: `blur(var(--cc-blur))`,
        border: isDragOver ? '2px solid var(--red)' : '1px solid var(--cc-glass-border)',
        boxShadow: isDragOver ? 'var(--shadow-red)' : 'var(--shadow-sm)',
      }}
      onClick={onExpand}
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop() }}
    >
      <div className="flex flex-col items-center py-4 gap-2">
        <ChevronRight size={12} style={{ color: 'var(--muted)' }} />
        <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{dayNum}</span>
        <span className="text-[8px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>{month.slice(0, 3)}</span>
        <span className="text-[9px] font-medium" style={{ color: 'var(--muted)' }}>{dayIndex + 1}/{totalDays}</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-1.5 pb-4">
        <span
          className="text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full"
          style={{ background: 'var(--panel)', color: 'var(--text)' }}
        >
          {day.services.length}
        </span>
        <span className="text-[8px] text-center" style={{ color: 'var(--muted)' }}>srv</span>
      </div>
    </div>
  )
}

/* ═══ DAY COLUMN (desktop) ═══ */
const DayColumnComponent = memo(function DayColumnComponent({
  day, originalDay, dayIndex, totalDays, isDragOver, onDragOver, onDragLeave, onDrop, onServiceDragStart, onCollapse, isFiltering,
}: {
  day: DayData
  originalDay: DayData
  dayIndex: number
  totalDays: number
  isDragOver: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: () => void
  onServiceDragStart: (svc: TimelineService) => void
  onCollapse: () => void
  isFiltering: boolean
}) {
  const { dayName, dayNum, month } = formatDayHeader(day.date)

  const indicators = useMemo(() => {
    const svcs = originalDay.services
    const costo = svcs.reduce((s, svc) => s + svc.costo, 0)
    const venduto = svcs.reduce((s, svc) => s + svc.venduto, 0)
    const margine = venduto - costo
    const fornitori = new Set(svcs.filter(s => s.fornitore_id).map(s => s.fornitore_id)).size
    const categorie = new Set(svcs.map(s => s.categoria)).size
    return { count: svcs.length, costo, venduto, margine, fornitori, categorie }
  }, [originalDay.services])

  return (
    <div
      className="flex-1 min-w-[220px] max-w-[300px] flex flex-col rounded-2xl transition-all"
      style={{
        background: isDragOver ? 'var(--cc-glass-deep)' : 'var(--cc-glass)',
        backdropFilter: `blur(var(--cc-blur))`,
        WebkitBackdropFilter: `blur(var(--cc-blur))`,
        border: isDragOver ? '2px solid var(--red)' : '1px solid var(--cc-glass-border)',
        boxShadow: isDragOver ? 'var(--shadow-red)' : 'var(--shadow-sm)',
      }}
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop() }}
    >
      {/* Day header */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--cc-divider)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.04em' }}>{dayNum}</span>
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--muted)' }}>{month.slice(0, 3)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md" style={{ background: 'var(--panel)', color: 'var(--muted)' }}>
              {dayIndex + 1}/{totalDays}
            </span>
            <button
              onClick={onCollapse}
              className="p-1 rounded-md transition-all hover:scale-110"
              style={{ color: 'var(--muted)' }}
              title="Chiudi giornata"
            >
              <ChevronRight size={12} className="rotate-180" />
            </button>
          </div>
        </div>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
          {dayName}
        </p>

        {/* Day indicators */}
        {indicators.count > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <IndicatorPill label="Srv" value={String(indicators.count)} />
            <IndicatorPill label="Forn" value={String(indicators.fornitori)} />
            <IndicatorPill label="Cat" value={String(indicators.categorie)} />
            <IndicatorPill label="Costo" value={formatCurrencyCompact(indicators.costo)} />
            <IndicatorPill label="Vend" value={formatCurrencyCompact(indicators.venduto)} />
            <IndicatorPill
              label="Marg"
              value={formatCurrencyCompact(indicators.margine)}
              color={indicators.margine >= 0 ? 'var(--green)' : 'var(--red)'}
            />
          </div>
        )}
      </div>

      {/* Services list */}
      <div className="flex-1 p-2.5 space-y-2 overflow-y-auto">
        {day.services.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-24 rounded-xl"
            style={{ border: '1px dashed var(--line)' }}
          >
            <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
              {isFiltering ? 'Nessun risultato' : 'Nessun servizio'}
            </span>
            {!isFiltering && (
              <span className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>Trascina qui</span>
            )}
          </div>
        )}
        {day.services.map(svc => (
          <ServiceBlockComponent key={svc.id} service={svc} onDragStart={() => onServiceDragStart(svc)} />
        ))}
      </div>

      {/* Day footer */}
      <div className="px-4 py-2 text-[10px] font-medium" style={{ borderTop: '1px solid var(--cc-divider)', color: 'var(--muted)' }}>
        {isFiltering && day.services.length !== originalDay.services.length
          ? `${day.services.length}/${originalDay.services.length} visibili`
          : `${day.services.length} ${day.services.length === 1 ? 'elemento' : 'elementi'}`
        }
      </div>
    </div>
  )
})

/* ═══ INDICATOR PILL ═══ */
function IndicatorPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="flex flex-col items-center py-1 px-1 rounded-lg"
      style={{ background: 'var(--panel)' }}
    >
      <span className="text-[8px] uppercase tracking-wider font-medium" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-[10px] font-bold" style={{ color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  )
}

/* ═══ SERVICE BLOCK (desktop — draggable) ═══ */
const ServiceBlockComponent = memo(function ServiceBlockComponent({ service, onDragStart }: { service: TimelineService; onDragStart: () => void }) {
  const style = categoriaStyles(service.categoria)
  const Icon = style.icon

  return (
    <div
      draggable
      onDragStart={e => {
        onDragStart()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', service.id)
      }}
      className="group rounded-xl px-3 py-2.5 cursor-grab active:cursor-grabbing transition-all active:scale-[1.02]"
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderLeft: `3px solid ${style.color}`,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-start gap-2">
        <GripVertical
          size={12}
          className="mt-0.5 opacity-0 group-hover:opacity-50 transition-opacity shrink-0"
          style={{ color: 'var(--muted)' }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--text)' }}>
            {service.titolo}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
              style={{ background: style.bg, color: style.color }}
            >
              <Icon size={9} />
              {categoriaLabel(service.categoria)}
            </span>
            {service.ora && (
              <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--muted)' }}>
                <Clock size={9} />
                {service.ora.slice(0, 5)}
              </span>
            )}
            {service.pax && (
              <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--muted)' }}>
                <Users size={9} />
                {service.pax}
              </span>
            )}
          </div>
          {(service.venduto > 0 || service.costo > 0) && (
            <div className="flex items-center gap-2 mt-1">
              {service.venduto > 0 && (
                <span className="text-[9px] font-medium" style={{ color: 'var(--green)' }}>
                  +{formatCurrencyCompact(service.venduto)}
                </span>
              )}
              {service.costo > 0 && (
                <span className="text-[9px] font-medium" style={{ color: 'var(--red)' }}>
                  -{formatCurrencyCompact(service.costo)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

/* ═══ REMOVE DAY DIALOG ═══ */
function RemoveDayDialog({ day, onClose, onConfirm }: {
  day: DayData
  onClose: () => void
  onConfirm: (strategy: 'move_prev' | 'move_next' | 'delete_all') => void
}) {
  const { dayNum, month } = formatDayHeader(day.date)
  const categories = [...new Set(day.services.map(s => categoriaLabel(s.categoria)))]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-5 md:p-6 max-w-md w-full"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold mb-1.5" style={{ color: 'var(--text)' }}>
          Rimuovi giornata
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
          Il giorno {dayNum} {month} contiene {day.services.length} {day.services.length === 1 ? 'elemento' : 'elementi'}:
        </p>
        <div className="flex flex-wrap gap-1.5 mb-5">
          {categories.map(cat => (
            <span
              key={cat}
              className="text-[10px] font-medium px-2 py-1 rounded-lg"
              style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}
            >
              {cat} ({day.services.filter(s => categoriaLabel(s.categoria) === cat).length})
            </span>
          ))}
        </div>
        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text)' }}>Come vuoi procedere?</p>
        <div className="space-y-2">
          <button
            onClick={() => onConfirm('move_prev')}
            className="w-full text-left px-4 py-3 rounded-xl text-xs font-medium transition-all hover:brightness-105"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
          >
            Sposta tutto al giorno precedente
          </button>
          <button
            onClick={() => onConfirm('move_next')}
            className="w-full text-left px-4 py-3 rounded-xl text-xs font-medium transition-all hover:brightness-105"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
          >
            Sposta tutto al giorno successivo
          </button>
          <button
            onClick={() => onConfirm('delete_all')}
            className="w-full text-left px-4 py-3 rounded-xl text-xs font-medium transition-all hover:brightness-105"
            style={{ background: 'rgba(211,28,48,0.06)', border: '1px solid rgba(211,28,48,0.15)', color: 'var(--red)' }}
          >
            Elimina tutto
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full mt-3 px-4 py-2.5 rounded-xl text-xs text-center font-medium transition-all hover:brightness-105"
          style={{ color: 'var(--muted)', background: 'var(--bg)' }}
        >
          Annulla
        </button>
      </div>
    </div>
  )
}
