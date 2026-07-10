import { useRef } from 'react'
import { Clock, Edit3, Trash2, Users, Truck, MapPin, Link2, Copy, GripVertical } from 'lucide-react'
import { fmtFullLong } from '@/lib/format'
import type { Supplier } from '@/data/suppliers'
import type { ProgramEntry } from './types'

interface ProgrammaTimelineProps {
  allEntries: ProgramEntry[]
  showForm: boolean
  grouped: Record<string, ProgramEntry[]>
  suppliers: Supplier[]
  openDuplicate: (entry: ProgramEntry) => void
  openEdit: (entry: ProgramEntry) => void
  handleDelete: (id: string) => void
  onReorder: (dragId: string, dropId: string) => void
}

export function ProgrammaTimeline({ allEntries, showForm, grouped, suppliers, openDuplicate, openEdit, handleDelete, onReorder }: ProgrammaTimelineProps) {
  const dragId = useRef<string | null>(null)

  if (allEntries.length === 0 && !showForm) {
    return (
      <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
        <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Nessuna voce nel programma</p>
        <p className="text-xs mt-1">Aggiungi voci manuali o compila i servizi dei fornitori per generare il programma</p>
      </div>
    )
  }

  return (
    <>
      {Object.entries(grouped).map(([dateStr, dayItems]) => (
        <div key={dateStr}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3 px-1"
            style={{ color: 'var(--muted)' }}>
            {fmtFullLong(dateStr)}
          </p>
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-2 bottom-2 w-px" style={{ background: 'var(--line)' }} />
            <div className="space-y-3">
              {dayItems.map(entry => {
                const sup = suppliers.find(s => s.id === entry.supplier_id)
                return (
                  <div key={entry.id} className="relative flex items-start gap-3"
                    onDragOver={e => {
                      if (!entry.manual) return
                      e.preventDefault()
                      e.currentTarget.style.borderTop = '2px solid var(--blue)'
                    }}
                    onDragLeave={e => {
                      e.currentTarget.style.borderTop = ''
                    }}
                    onDrop={e => {
                      e.preventDefault()
                      e.currentTarget.style.borderTop = ''
                      if (dragId.current && dragId.current !== entry.id) {
                        onReorder(dragId.current, entry.id)
                        dragId.current = null
                      }
                    }}>
                    <div className="absolute left-[-18px] top-2.5 w-2.5 h-2.5 rounded-full border-2"
                      style={{ borderColor: entry.manual ? 'var(--blue)' : 'var(--red2)', background: 'var(--bg)' }} />
                    <div className="flex-1 panel p-4"
                      onClick={() => entry.manual && openEdit(entry)}
                      style={{
                        border: entry.manual ? '1px solid var(--line)' : undefined,
                        cursor: entry.manual ? 'pointer' : 'default',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => { if (entry.manual) e.currentTarget.style.borderColor = 'var(--blue)' }}
                      onMouseLeave={e => { if (entry.manual) e.currentTarget.style.borderColor = 'var(--line)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                              {entry.ora_inizio?.slice(0, 5)}
                              {entry.ora_fine ? ` - ${entry.ora_fine.slice(0, 5)}` : ''}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: entry.manual ? 'color-mix(in srgb, var(--blue) 10%, transparent)' : 'color-mix(in srgb, var(--red2) 10%, transparent)', color: entry.manual ? 'var(--blue)' : 'var(--red2)' }}>
                              {entry.categoria}
                            </span>
                            {entry.data_fine && entry.data_fine !== entry.data && (
                              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                fino al {fmtFullLong(entry.data_fine)}
                              </span>
                            )}
                            {entry.pax && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                                <Users className="w-3 h-3 inline mr-0.5" />{entry.pax} pax
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium mt-1" style={{ color: 'var(--text)' }}>
                            {entry.titolo}
                          </p>
                          {sup && (
                            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                              <Truck className="w-3 h-3 inline mr-1" />{sup.nome}
                            </p>
                          )}
                          {entry.servizio && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                              <Link2 className="w-3 h-3 inline mr-1" />{entry.servizio}
                            </p>
                          )}
                          {entry.luogo && (
                            <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                              <MapPin className="w-3 h-3 inline" />{entry.luogo}
                            </div>
                          )}
                          {entry.note && <p className="text-xs mt-1 italic" style={{ color: 'var(--muted)' }}>{entry.note}</p>}
                        </div>
                        {entry.manual && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <div
                              draggable={true}
                              onDragStart={() => { dragId.current = entry.id }}
                              style={{ cursor: 'grab', color: 'var(--muted)', padding: '6px 4px', display: 'flex', alignItems: 'center' }}
                              title="Trascina per riordinare"
                              onClick={e => e.stopPropagation()}>
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); openDuplicate(entry) }} className="p-1.5 rounded-lg hover:bg-[var(--line)] transition-colors" title="Duplica (es. per un'altra notte)">
                              <Copy className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); openEdit(entry) }} className="p-1.5 rounded-lg hover:bg-[var(--line)] transition-colors">
                              <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(entry.id) }} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
