import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Circle, ChevronDown,
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
        <div className="wire-masthead">
          <div>
            <span className="wire-masthead-title">Workflow Eventi</span>
          </div>
        </div>
        <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
          <div className="animate-pulse text-sm" style={{ color: 'var(--muted)' }}>Calcolo stato eventi...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Masthead */}
      <div className="wire-masthead">
        <div>
          <span className="wire-masthead-title">Workflow Eventi</span>
        </div>
      </div>

      {/* Global KPIs - wire-ticker style */}
      <div className="wire-ticker">
        <span>Eventi attivi <strong style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{globalStats.total}</strong></span>
        <span>Pronti <strong style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>{globalStats.ready}</strong></span>
        <span>Critici &lt;40% <strong style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: globalStats.critical > 0 ? 'var(--red2)' : 'var(--text)' }}>{globalStats.critical}</strong></span>
        <span>Media <strong style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: globalStats.avgPct >= 70 ? 'var(--green)' : 'var(--yellow)' }}>{globalStats.avgPct}%</strong></span>
      </div>

      {/* Filter tabs - wire-tabs pattern */}
      <div className="flex gap-1">
        {(['incomplete', 'all', 'complete'] as const).map(f => (
          <button key={f}
            onClick={() => setFilterStatus(f)}
            className={`wire-tab ${filterStatus === f ? 'wire-tab--active' : ''}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '6px 12px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              background: filterStatus === f ? 'var(--panel-solid)' : 'transparent',
              color: filterStatus === f ? 'var(--text)' : 'var(--muted)',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}>
            {f === 'incomplete' ? 'DA COMPLETARE' : f === 'all' ? 'TUTTI' : 'PRONTI'}
          </button>
        ))}
      </div>

      {/* Event checklists */}
      {filtered.length === 0 ? (
        <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 32, textAlign: 'center' }}>
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
              <div key={cl.event.id} style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
                <button
                  className="w-full text-left flex items-center gap-4"
                  onClick={() => setExpandedId(isExpanded ? null : cl.event.id)}
                  style={{ padding: 16, borderBottom: 'none' }}
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
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: pctColor, fontFamily: 'var(--font-mono)' }}>
                      {cl.pct}%
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cl.event.nome}</p>
                    <p style={{ fontSize: '11px', marginTop: 4, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                      {done}/{cl.items.length} COMPLETATI
                      {missing.length > 0 && ` — ${missing.length} MANCANTI`}
                    </p>
                  </div>

                  <ChevronDown className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    style={{ color: 'var(--muted)' }} />
                </button>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--line)', padding: 16 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>CHECKLIST</p>
                      <button onClick={() => navigate(`/eventi?id=${cl.event.id}`)}
                        style={{
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          color: 'var(--red2)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          transition: 'opacity 150ms ease',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        APRI EVENTO
                      </button>
                    </div>

                    <div className="space-y-1">
                      {cl.items.map(item => (
                        <div key={item.id} className="flex items-center gap-2" style={{ paddingTop: 6, paddingBottom: 6 }}>
                          {item.completed ? (
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green)' }} />
                          ) : (
                            <Circle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                          )}
                          <span style={{
                            fontSize: '12px',
                            color: item.completed ? 'var(--text)' : 'var(--muted)',
                            textDecoration: item.completed ? 'line-through' : 'none',
                            opacity: item.completed ? 0.7 : 1,
                            fontFamily: item.completed ? 'var(--font-mono)' : 'inherit',
                          }}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {missing.length > 0 && (
                      <div style={{
                        marginTop: 12,
                        padding: 8,
                        borderRadius: 6,
                        background: 'rgba(245,158,11,0.06)',
                        border: '1px solid rgba(245,158,11,0.15)',
                      }}>
                        <p style={{
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 500,
                          color: 'var(--yellow)',
                        }}>
                          MANCANO {missing.length} ELEMENTI
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
