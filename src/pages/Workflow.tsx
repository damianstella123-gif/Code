import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Circle, AlertTriangle, ChevronDown,
  ClipboardList,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchEvents } from '@/lib/events-service'
import type { Event } from '@/data/events'

interface CheckItem {
  id: string
  label: string
  completed: boolean
  category: 'base' | 'fornitori' | 'programma' | 'documenti' | 'budget'
}

interface EventChecklist {
  event: Event
  items: CheckItem[]
  pct: number
}

export default function Workflow() {
  const navigate = useNavigate()
  const [checklists, setChecklists] = useState<EventChecklist[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'incomplete' | 'complete'>('incomplete')

  const loadAll = useCallback(async () => {
    setLoading(true)
    const evts = await fetchEvents()
    const activeEvents = evts.filter(e => e.stato !== 'completato')

    const eventIds = activeEvents.map(e => e.id)
    if (eventIds.length === 0) { setChecklists([]); setLoading(false); return }

    const [suppRes, progRes, docsRes] = await Promise.all([
      supabase.from('event_suppliers').select('event_id, supplier_id').in('event_id', eventIds),
      supabase.from('event_program').select('event_id').in('event_id', eventIds),
      supabase.from('documents').select('event_id, categoria').eq('scope', 'project').in('event_id', eventIds),
    ])

    const suppliers = suppRes.data ?? []
    const programs = progRes.data ?? []
    const docs = docsRes.data ?? []

    const results: EventChecklist[] = activeEvents.map(event => {
      const eid = event.id
      const eventDocs = docs.filter(d => d.event_id === eid)
      const eventSupps = suppliers.filter(s => s.event_id === eid)
      const eventProgs = programs.filter(p => p.event_id === eid)

      const items: CheckItem[] = [
        { id: 'cliente', label: 'Cliente assegnato', completed: !!event.cliente, category: 'base' },
        { id: 'fornitori', label: 'Fornitori collegati', completed: eventSupps.length > 0, category: 'fornitori' },
        { id: 'programma', label: 'Programma evento presente', completed: eventProgs.length > 0, category: 'programma' },
        { id: 'budget_voci', label: 'Budget con voci economiche', completed: (event.budget ?? 0) > 0, category: 'budget' },
        { id: 'doc_contratti', label: 'Contratti caricati', completed: eventDocs.some(d => d.categoria === 'Contratti'), category: 'documenti' },
        { id: 'doc_preventivi', label: 'Preventivi fornitori caricati', completed: eventDocs.some(d => d.categoria === 'Preventivi'), category: 'documenti' },
        { id: 'doc_budget', label: 'Budget PDF caricato', completed: eventDocs.some(d => d.categoria === 'Budget'), category: 'documenti' },
        { id: 'doc_materiali', label: 'Materiali evento caricati', completed: eventDocs.some(d => d.categoria === 'Materiali Evento'), category: 'documenti' },
        { id: 'doc_rooming', label: 'Rooming List caricata', completed: eventDocs.some(d => d.categoria === 'Rooming List'), category: 'documenti' },
      ]

      const done = items.filter(i => i.completed).length
      const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0

      return { event, items, pct }
    })

    results.sort((a, b) => a.pct - b.pct)
    setChecklists(results)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const filtered = useMemo(() => {
    if (filterStatus === 'complete') return checklists.filter(c => c.pct === 100)
    if (filterStatus === 'incomplete') return checklists.filter(c => c.pct < 100)
    return checklists
  }, [checklists, filterStatus])

  const globalStats = useMemo(() => {
    const total = checklists.length
    const ready = checklists.filter(c => c.pct === 100).length
    const critical = checklists.filter(c => c.pct < 40).length
    const avgPct = total > 0 ? Math.round(checklists.reduce((s, c) => s + c.pct, 0) / total) : 0
    return { total, ready, critical, avgPct }
  }, [checklists])

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Workflow Eventi</h1>
        <div className="panel p-12 text-center"><div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Calcolo stato eventi...</div></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Workflow Eventi</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
          Stato di completamento calcolato automaticamente dai dati presenti nel sistema
        </p>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="panel p-4">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Eventi attivi</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{globalStats.total}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Pronti</p>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--green)' }}>{globalStats.ready}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Critici (&lt;40%)</p>
          <p className="text-2xl font-bold mt-1" style={{ color: globalStats.critical > 0 ? 'var(--red2)' : 'var(--text)' }}>{globalStats.critical}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Media completamento</p>
          <p className="text-2xl font-bold mt-1" style={{ color: globalStats.avgPct >= 70 ? 'var(--green)' : 'var(--yellow)' }}>{globalStats.avgPct}%</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['incomplete', 'all', 'complete'] as const).map(f => (
          <button key={f} onClick={() => setFilterStatus(f)}
            className="px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filterStatus === f ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'var(--panel)',
              color: filterStatus === f ? '#fff' : 'var(--muted)',
              border: `1px solid ${filterStatus === f ? 'transparent' : 'var(--line)'}`,
            }}>
            {f === 'incomplete' ? 'Da completare' : f === 'all' ? 'Tutti' : 'Pronti'}
          </button>
        ))}
      </div>

      {/* Event checklists */}
      {filtered.length === 0 ? (
        <div className="panel p-12 text-center">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--muted)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun evento in questa vista</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(cl => {
            const isExpanded = expandedId === cl.event.id
            const done = cl.items.filter(i => i.completed).length
            const missing = cl.items.filter(i => !i.completed)
            const pctColor = cl.pct >= 80 ? 'var(--green)' : cl.pct >= 50 ? 'var(--blue)' : cl.pct >= 30 ? 'var(--yellow)' : 'var(--red2)'

            return (
              <div key={cl.event.id} className="panel overflow-hidden">
                <button
                  className="w-full text-left px-4 py-4 flex items-center gap-4"
                  onClick={() => setExpandedId(isExpanded ? null : cl.event.id)}
                >
                  {/* Progress ring */}
                  <div className="relative w-12 h-12 flex-shrink-0">
                    <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke="var(--line)" strokeWidth="3" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke={pctColor} strokeWidth="3"
                        strokeDasharray={`${cl.pct}, 100`}
                        strokeLinecap="round" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: pctColor }}>
                      {cl.pct}%
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{cl.event.nome}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      {done}/{cl.items.length} completati
                      {missing.length > 0 && ` - ${missing.length} mancanti`}
                    </p>
                  </div>

                  <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--muted)' }} />
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid var(--line)' }}>
                    <div className="pt-3 pb-1 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Checklist</p>
                      <button onClick={() => navigate(`/eventi?id=${cl.event.id}`)}
                        className="text-xs font-medium px-2 py-1 rounded-lg transition-all hover:bg-white/5"
                        style={{ color: 'var(--red2)' }}>
                        Apri Evento
                      </button>
                    </div>

                    {cl.items.map(item => (
                      <div key={item.id} className="flex items-center gap-3 py-1.5">
                        {item.completed ? (
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green)' }} />
                        ) : (
                          <Circle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                        )}
                        <span className="text-sm" style={{
                          color: item.completed ? 'var(--text)' : 'var(--muted)',
                          textDecoration: item.completed ? 'line-through' : 'none',
                          opacity: item.completed ? 0.7 : 1,
                        }}>
                          {item.label}
                        </span>
                        {!item.completed && (
                          <AlertTriangle className="w-3 h-3 ml-auto flex-shrink-0" style={{ color: 'var(--yellow)' }} />
                        )}
                      </div>
                    ))}

                    {missing.length > 0 && (
                      <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                        <p className="text-xs font-medium" style={{ color: 'var(--yellow)' }}>
                          Mancano {missing.length} elementi per completare l'evento
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
