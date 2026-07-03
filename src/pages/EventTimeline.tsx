import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Minus, GripVertical, Clock, Users, Euro } from 'lucide-react'
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
    programma: '#4db4ff',
    transfer: '#9b59b6',
    hotel: '#e67e22',
    ristorante: '#e74c3c',
    experience: '#1abc9c',
    catering: '#f39c12',
    staff_interno: '#3498db',
    staff_esterno: '#2980b9',
    audio_video: '#8e44ad',
    allestimenti: '#27ae60',
    grafica_stampa: '#d35400',
    varie: '#7f8c8d',
  }
  return map[cat] ?? '#95a5a6'
}

function formatCurrency(n: number): string {
  if (!n) return ''
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

  const lastDayServices = days.length > 0 ? days[days.length - 1].services : []

  function handleRemoveDay() {
    if (lastDayServices.length === 0) {
      removeDay('delete_all')
    } else {
      setShowRemoveDialog(true)
    }
  }

  return (
    <div className="h-full flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={() => navigate('/calendario')}
          className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{ color: 'var(--muted)' }}
        >
          <ArrowLeft size={16} />
          Calendario
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate" style={{ color: 'var(--text)' }}>{event.nome}</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {event.cliente} &middot; {days.length} {days.length === 1 ? 'giornata' : 'giornate'} &middot; {event.partecipanti} pax &middot; {event.location}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addDay}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all hover:brightness-110"
            style={{ background: 'var(--red)', color: 'white' }}
          >
            <Plus size={14} />
            Giornata
          </button>
          <button
            onClick={handleRemoveDay}
            disabled={days.length <= 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all hover:brightness-110 disabled:opacity-30"
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--line)' }}
          >
            <Minus size={14} />
            Rimuovi
          </button>
        </div>
      </div>

      {/* Timeline columns */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 min-h-[400px] pb-4" style={{ minWidth: days.length * 220 }}>
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

      {/* Summary bar */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-lg text-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
      >
        <div className="flex items-center gap-6">
          <span style={{ color: 'var(--muted)' }}>
            Venduto <strong style={{ color: 'var(--text)' }}>{formatCurrency(totalVenduto)}</strong>
          </span>
          <span style={{ color: 'var(--muted)' }}>
            Costi <strong style={{ color: 'var(--text)' }}>{formatCurrency(totalCosto)}</strong>
          </span>
          <span style={{ color: 'var(--muted)' }}>
            Margine <strong style={{ color: totalMargine >= 0 ? '#38d27d' : '#ff315f' }}>
              {formatCurrency(totalMargine)} ({marginePct.toFixed(1)}%)
            </strong>
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {days.reduce((s, d) => s + d.services.length, 0)} servizi totali
        </span>
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
  const dayVenduto = day.services.reduce((s, svc) => s + svc.venduto, 0)
  const dayCosto = day.services.reduce((s, svc) => s + svc.costo, 0)

  return (
    <div
      className="flex-1 min-w-[200px] max-w-[280px] flex flex-col rounded-lg transition-all"
      style={{
        background: isDragOver ? 'rgba(208,0,58,0.06)' : 'var(--surface)',
        border: isDragOver ? '2px solid rgba(208,0,58,0.4)' : '1px solid var(--line)',
      }}
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop() }}
    >
      {/* Day header */}
      <div className="px-3 py-3 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{dayNum}</span>
          <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{month}</span>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          {dayName} &middot; Giorno {dayIndex + 1} di {totalDays}
        </p>
        {(dayVenduto > 0 || dayCosto > 0) && (
          <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--muted)' }}>
            <Euro size={10} />
            {formatCurrency(dayCosto)} costi
          </p>
        )}
      </div>

      {/* Services list */}
      <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
        {day.services.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs" style={{ color: 'var(--muted)' }}>
            Nessun servizio
          </div>
        )}
        {day.services.map(svc => (
          <ServiceBlockComponent key={svc.id} service={svc} onDragStart={() => onServiceDragStart(svc)} />
        ))}
      </div>

      {/* Day footer */}
      <div className="px-3 py-2 border-t text-xs" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
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
      className="group rounded-md px-2.5 py-2 cursor-grab active:cursor-grabbing transition-all hover:brightness-105"
      style={{
        background: `${color}12`,
        borderLeft: `3px solid ${color}`,
        border: `1px solid ${color}25`,
        borderLeftWidth: 3,
      }}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical size={12} className="mt-0.5 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" style={{ color }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
            {service.titolo}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] px-1 py-0.5 rounded" style={{ background: `${color}20`, color }}>
              {categoriaLabel(service.categoria)}
            </span>
            {service.ora && (
              <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--muted)' }}>
                <Clock size={8} />
                {service.ora.slice(0, 5)}
              </span>
            )}
            {service.pax && (
              <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--muted)' }}>
                <Users size={8} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl p-6 max-w-md w-full mx-4" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
        <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>
          Rimuovi giornata {dayNum} {month}
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          Questa giornata contiene {day.services.length} {day.services.length === 1 ? 'elemento' : 'elementi'}:
        </p>
        <ul className="text-xs mb-5 space-y-1 pl-4" style={{ color: 'var(--text)' }}>
          {categories.map(cat => (
            <li key={cat}>&bull; {cat} ({day.services.filter(s => categoriaLabel(s.categoria) === cat).length})</li>
          ))}
        </ul>
        <p className="text-sm font-medium mb-3" style={{ color: 'var(--text)' }}>Come vuoi procedere?</p>
        <div className="space-y-2">
          <button
            onClick={() => onConfirm('move_prev')}
            className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:brightness-110"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
          >
            Sposta tutto al giorno precedente
          </button>
          <button
            onClick={() => onConfirm('move_next')}
            className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:brightness-110"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
          >
            Sposta tutto al giorno successivo
          </button>
          <button
            onClick={() => onConfirm('delete_all')}
            className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:brightness-110"
            style={{ background: 'rgba(208,0,58,0.08)', border: '1px solid rgba(208,0,58,0.2)', color: '#ff315f' }}
          >
            Elimina tutto
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full mt-3 px-3 py-2 rounded-md text-sm text-center"
          style={{ color: 'var(--muted)' }}
        >
          Annulla
        </button>
      </div>
    </div>
  )
}
