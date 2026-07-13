import { useState, useEffect } from 'react'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtShort } from '@/lib/format'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Client } from '@/data/clients'
import type { Uscita } from '@/data/amministrazione'
import type { Messaggio } from '@/data/comunicazioni'
import type { InternalUser } from '../shared-types'
import { EventEconomicSummary } from '../EventEconomicSummary'

function getTimeline(event: Event) {
  const start = new Date(event.dataInizio)
  const end = new Date(event.dataFine)
  const now = new Date()
  return [
    { id: 'plan', label: 'Avvio Pianificazione', data: fmtShort(new Date(start.getTime() - 60 * 86400000).toISOString()), completato: now > new Date(start.getTime() - 60 * 86400000), inRitardo: false },
    { id: 'fornitori', label: 'Conferma Fornitori', data: fmtShort(new Date(start.getTime() - 30 * 86400000).toISOString()), completato: now > new Date(start.getTime() - 30 * 86400000), inRitardo: !now.valueOf() && now > new Date(start.getTime() - 30 * 86400000) },
    { id: 'brief', label: 'Briefing Team', data: fmtShort(new Date(start.getTime() - 7 * 86400000).toISOString()), completato: now > new Date(start.getTime() - 7 * 86400000), inRitardo: false },
    { id: 'start', label: 'Inizio Evento', data: fmtShort(event.dataInizio), completato: now >= start, inRitardo: false },
    { id: 'end', label: 'Fine Evento', data: fmtShort(event.dataFine), completato: now > end, inRitardo: false },
    { id: 'report', label: 'Report & Fatturazione', data: fmtShort(new Date(end.getTime() + 7 * 86400000).toISOString()), completato: now > new Date(end.getTime() + 7 * 86400000), inRitardo: now > new Date(end.getTime() + 14 * 86400000) && !(now > new Date(end.getTime() + 7 * 86400000)) },
  ]
}

function formatMsgDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m fa`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h fa`
  return fmtShort(iso)
}

export function TabOverview({ event, progress, completedTasks, totalTasks, budgets, clients, onClientClick, internalUsers, comunicazioni }: {
  event: Event
  progress: number
  completedTasks: number
  totalTasks: number
  budgets: Uscita[]
  clients: Client[]
  onClientClick?: (clientName: string) => void
  internalUsers: InternalUser[]
  comunicazioni?: Messaggio[]
}) {
  const eventUscite = budgets.filter(u => u.eventoId === event.id)
  const totUscite = eventUscite.reduce((s, u) => s + u.importo, 0)
  const hasRealData = eventUscite.length > 0

  const cliente = clients.find(c => c.id === event.cliente)

  const [taskList, setTaskList] = useState<Task[]>([])
  const [teamRolesMap, setTeamRolesMap] = useState<Record<string, string[]>>({})

  useEffect(() => {
    supabase.from('tasks').select('*')
      .eq('event_id', event.id)
      .neq('stato', 'completato')
      .order('scadenza', { ascending: true })
      .limit(5)
      .then(({ data }) => {
        if (data) setTaskList(data as unknown as Task[])
      })
    supabase.from('event_team_roles').select('profile_id, ruoli_operativi')
      .eq('event_id', event.id)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string[]> = {}
          for (const row of data) map[row.profile_id] = row.ruoli_operativi || []
          setTeamRolesMap(map)
        }
      })
  }, [event.id])

  async function handleCheckTask(taskId: string) {
    await supabase.from('tasks')
      .update({ stato: 'completato' })
      .eq('id', taskId)
    setTaskList(prev => prev.filter(t => t.id !== taskId))
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cliente && (
        <div
          className="cursor-pointer transition-all hover:translate-x-0.5"
          onClick={() => onClientClick?.(cliente.nome)}
          style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}
        >
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '12px' }}>Cliente</p>
          <div>
            <p style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: 'var(--blue)' }}>{cliente.nome}</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{cliente.settore}</p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{cliente.referente}</p>
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', marginTop: '10px', color: 'var(--muted)', opacity: 0.6 }}>CLICCA PER APRIRE NEL CRM</p>
        </div>
      )}

      <EventEconomicSummary event={event} />

      {totalTasks > 0 && (
        <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '12px' }}>Avanzamento Task</p>
          <div className="flex items-end gap-4">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '36px', fontWeight: 700, color: progress >= 80 ? 'var(--green)' : progress >= 50 ? 'var(--blue)' : 'var(--red2)' }}>
              {progress}%
            </div>
            <div className="flex-1 pb-1">
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>{completedTasks}/{totalTasks} completati</p>
              <div style={{ height: '4px', borderRadius: '2px', background: 'var(--line)', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', borderRadius: '2px', background: progress >= 80 ? 'var(--green)' : progress >= 50 ? 'var(--blue)' : 'var(--red2)', transition: 'width 0.3s ease' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '12px' }}>Flusso Finanziario</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4" style={{ color: 'var(--green)' }} />
              <span className="text-sm" style={{ color: 'var(--muted)' }}>Budget evento</span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: event.budget > 0 ? 'var(--green)' : 'var(--muted)' }}>
              {event.budget > 0 ? `\u20AC${event.budget.toLocaleString('it-IT')}` : 'Non inserito'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--yellow)' }} />
              <span className="text-sm" style={{ color: 'var(--muted)' }}>Uscite registrate</span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: hasRealData ? 'var(--yellow)' : 'var(--muted)' }}>
              {hasRealData ? `\u20AC${totUscite.toLocaleString('it-IT')}` : 'Nessuna'}
            </span>
          </div>
        </div>
      </div>

      {/* Team Section */}
      <div className="md:col-span-2" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
        <p className="wire-section-title" style={{ marginTop: 0 }}>Team</p>
        {event.team.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nessun membro nel team</p>
        ) : (
          <div className="wire-list-container">
            {event.team.map(memberId => {
              const u = internalUsers.find(x => x.id === memberId)
              if (!u) return null
              const isResp = memberId === event.responsabile
              const roles = teamRolesMap[memberId] || []
              return (
                <div key={memberId} className="wire-card-flat" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src={u.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{u.nome}</span>
                    {roles.length > 0 && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
                        — {roles.join(', ')}
                      </span>
                    )}
                  </div>
                  {isResp && (
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--red2)', flexShrink: 0 }}>RESPONSABILE</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Task Section */}
      <div className="md:col-span-2" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p className="wire-section-title" style={{ marginTop: 0 }}>Task</p>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{completedTasks}/{totalTasks} completati</span>
        </div>
        {taskList.length === 0 && totalTasks === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nessun task per questo evento</p>
        ) : taskList.length === 0 ? (
          <p style={{ color: 'var(--green)', fontSize: 13 }}>Tutti i task completati</p>
        ) : (
          <div className="wire-list-container">
            {taskList.map(t => (
              <div key={t.id} className="wire-card-flat" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={false} onChange={() => handleCheckTask(t.id)} style={{ flexShrink: 0, accentColor: 'var(--red2)' }} />
                <span style={{ fontSize: 13, flex: 1, color: 'var(--text)' }}>{t.titolo}</span>
                {t.scadenza && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{fmtShort(t.scadenza)}</span>
                )}
              </div>
            ))}
            {totalTasks > 5 && (
              <p style={{ fontSize: 12, color: 'var(--red2)', marginTop: 8, cursor: 'pointer' }}>
                Vedi tutti i task &rarr;
              </p>
            )}
          </div>
        )}
      </div>

      {/* ══════ TIMELINE ══════ */}
      <div className="md:col-span-2">
        <div className="wire-section-title" style={{ marginTop: 24 }}>TIMELINE</div>
        <div className="wire-list-container">
          {getTimeline(event).map(m => (
            <div key={m.id} className="wire-card-flat" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: m.completato ? 'var(--green)' : m.inRitardo ? 'var(--red2)' : 'var(--blue)' }} />
              <div style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{m.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: m.inRitardo ? 'var(--red2)' : 'var(--muted)' }}>
                {m.data}
              </div>
              {m.completato && (
                <span style={{ fontSize: 9, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>done</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ══════ COMUNICAZIONI ══════ */}
      {comunicazioni && comunicazioni.length > 0 && (
        <div className="md:col-span-2">
          <div className="wire-section-title" style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>COMUNICAZIONI</span>
            {comunicazioni.length > 0 && (
              <span style={{ background: 'var(--red2)', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, fontFamily: 'var(--font-mono)' }}>
                {comunicazioni.length} messaggi
              </span>
            )}
          </div>
          <div className="wire-list-container">
            {comunicazioni.slice(0, 3).map(msg => (
              <div key={msg.id} className="wire-card-flat" style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--red2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: 'white' }}>
                  {msg.mittente?.[0] || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                      {msg.oggetto || 'Messaggio'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>
                      {formatMsgDate(msg.data)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {msg.corpo}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
