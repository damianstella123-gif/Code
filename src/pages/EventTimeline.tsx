import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Minus, GripVertical, Clock, Users, Euro, Calendar, MapPin, Hash } from 'lucide-react'
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
    staff_interno: 'Staff Interno',
    staff_esterno: 'Staff Esterno',
    audio_video: 'Audio/Video',
    allestimenti: 'Allestimenti',
    grafica_stampa: 'Grafica/Stampa',
    varie: 'Varie',
  }
  return map[cat] ?? cat
}

function categoriaColor(cat: string): string {
  const map: Record<string, string> = {
    programma: 'var(--blue)',
    transfer: '#9b59b6',
    hotel: '#e67e22',
    ristorante: '#e74c3c',
    experience: '#1abc9c',
    catering: '#f39c12',
    staff_interno: '#3498db',
    staff_esterno: '#2980b9',
    audio_video: '#8e44ad',
    allestimenti: 'var(--green)',
    grafica_stampa: '#d35400',
    varie: 'var(--gray)',
  }
  return map[cat] ?? 'var(--gray)'
}

function formatCurrency(n: number): string {
  if (!n) return '-'
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

export default function EventTimeline() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const { event, days, loading, moveService, addDay, removeDay } = useEventTimeline(eventId ?? '')

  const [dragItem, setDragItem] = useState<TimelineService | null>(null)
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)

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
    <div className="h-full flex flex-col gap-5 p-5 md:p-6">
      {/* Header — cockpit identity */}
      <div
        className="rounded-2xl px-5 py-4"
        style={{
          background: 'var(--cc-glass)',
          backdropFilter: `blur(var(--cc-blur))`,
          WebkitBackdropFilter: `blur(var(--cc-blur))`,
          border: '1px solid var(--cc-glass-border)',
          boxShadow: 'var(--cc-shadow)',
        }}
      >
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => navigate('/calendario')}
            className="flex items-center gap-1.5 text-xs font-medium transition-all rounded-lg px-2.5 py-1.5"
            style={{ color: 'var(--muted)', background: 'var(--panel)', border: '1px solid var(--line)' }}
          >
            <ArrowLeft size={13} />
            Calendario
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}>
              {event.nome}
            </h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                <Calendar size={11} /> {days.length} {days.length === 1 ? 'giornata' : 'giornate'}
              </span>
              {event.cliente && (
                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                  <Hash size={11} /> {event.cliente}
                </span>
              )}
              {event.location && (
                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                  <MapPin size={11} /> {event.location}
                </span>
              )}
              {event.partecipanti > 0 && (
                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                  <Users size={11} /> {event.partecipanti} pax
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={addDay}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
                color: 'white',
                boxShadow: 'var(--shadow-red)',
              }}
            >
              <Plus size={13} />
              Giornata
            </button>
            <button
              onClick={handleRemoveDay}
              disabled={days.length <= 1}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-30"
              style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--line)' }}
            >
              <Minus size={13} />
              Rimuovi
            </button>
          </div>
        </div>
      </div>

      {/* Timeline columns — the operational core */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden" style={{ scrollBehavior: 'smooth' }}>
        <div className="flex gap-3 h-full pb-2" style={{ minWidth: days.length * 240 }}>
          {days.map((day, idx) => (
            <DayColumnComponent
              key={day.date}
              day={day}
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
            />
          ))}
        </div>
      </div>

      {/* Summary bar — cockpit instrument */}
      <div
        className="flex items-center justify-between px-5 py-3.5 rounded-2xl text-sm"
        style={{
          background: 'var(--cc-glass)',
          backdropFilter: `blur(var(--cc-blur))`,
          WebkitBackdropFilter: `blur(var(--cc-blur))`,
          border: '1px solid var(--cc-glass-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Venduto</span>
            <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{formatCurrency(totalVenduto)}</span>
          </div>
          <div className="w-px h-6" style={{ background: 'var(--line)' }} />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Costi</span>
            <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{formatCurrency(totalCosto)}</span>
          </div>
          <div className="w-px h-6" style={{ background: 'var(--line)' }} />
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Margine</span>
            <span className="text-sm font-bold" style={{ color: totalMargine >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {formatCurrency(totalMargine)} ({marginePct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Servizi</span>
          <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{totalServices}</span>
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

function DayColumnComponent({
  day, dayIndex, totalDays, isDragOver, onDragOver, onDragLeave, onDrop, onServiceDragStart,
}: {
  day: DayData
  dayIndex: number
  totalDays: number
  isDragOver: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: () => void
  onServiceDragStart: (svc: TimelineService) => void
}) {
  const { dayName, dayNum, month } = formatDayHeader(day.date)
  const dayCosto = day.services.reduce((s, svc) => s + svc.costo, 0)

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
      <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--cc-divider)' }}>
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold" style={{ color: 'var(--text)', letterSpacing: '-0.04em' }}>{dayNum}</span>
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--muted)' }}>{month.slice(0, 3)}</span>
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md" style={{ background: 'var(--panel)', color: 'var(--muted)' }}>
            {dayIndex + 1}/{totalDays}
          </span>
        </div>
        <p className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>
          {dayName}
        </p>
        {dayCosto > 0 && (
          <p className="text-[10px] mt-1.5 flex items-center gap-1 font-medium" style={{ color: 'var(--muted)' }}>
            <Euro size={9} />
            {formatCurrency(dayCosto)}
          </p>
        )}
      </div>

      {/* Services list */}
      <div className="flex-1 p-2.5 space-y-2 overflow-y-auto">
        {day.services.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-24 rounded-xl"
            style={{ border: '1px dashed var(--line)' }}
          >
            <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Nessun servizio</span>
            <span className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>Trascina qui</span>
          </div>
        )}
        {day.services.map(svc => (
          <ServiceBlockComponent key={svc.id} service={svc} onDragStart={() => onServiceDragStart(svc)} />
        ))}
      </div>

      {/* Day footer */}
      <div className="px-4 py-2.5 text-[10px] font-medium" style={{ borderTop: '1px solid var(--cc-divider)', color: 'var(--muted)' }}>
        {day.services.length} {day.services.length === 1 ? 'elemento' : 'elementi'}
      </div>
    </div>
  )
}

function ServiceBlockComponent({ service, onDragStart }: { service: TimelineService; onDragStart: () => void }) {
  const color = categoriaColor(service.categoria)

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
        borderLeft: `3px solid ${color}`,
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
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
              style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
            >
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
        </div>
      </div>
    </div>
  )
}

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
        className="rounded-2xl p-6 max-w-md w-full"
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
