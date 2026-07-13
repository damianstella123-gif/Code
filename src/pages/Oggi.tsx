import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Calendar, ArrowRight, Bell, CreditCard, Palmtree } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadUser } from '@/lib/auth'
import { fmtLong } from '@/lib/format'
import type { Task } from '@/data/tasks'

interface LeaveRequest {
  id: string
  user_id: string
  data_inizio: string
  data_fine: string
  tipo: string
  profiles?: { first_name: string; last_name: string }
}

const GIORNI = ['Domenica', 'Lunedi', 'Martedi', 'Mercoledi', 'Giovedi', 'Venerdi', 'Sabato']
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']

function formatDate(d: Date): string {
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

export default function Oggi() {
  const navigate = useNavigate()
  const user = loadUser()
  const [urgentTasks, setUrgentTasks] = useState<Task[]>([])
  const [nextEvent, setNextEvent] = useState<any>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingPayments, setPendingPayments] = useState(0)
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = user?.role === 'Admin' || user?.role === 'Super Admin' || user?.role === 'Amministrazione'
  const today = new Date()
  const todayISO = today.toISOString().split('T')[0]
  const tomorrowISO = new Date(today.getTime() + 86400000).toISOString().split('T')[0]

  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || cancelled) return
      const userId = session.user.id

      const [tasksRes, eventsRes, notifsRes, paymentsRes, leavesRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*')
          .lte('scadenza', tomorrowISO)
          .neq('stato', 'completato')
          .eq('assegnatario', userId)
          .order('scadenza', { ascending: true }),
        supabase
          .from('events')
          .select('*')
          .in('stato', ['in_corso', 'pianificazione'])
          .gte('data_inizio', todayISO)
          .order('data_inizio', { ascending: true })
          .limit(1),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_read', false),
        isAdmin
          ? supabase
              .from('event_payments')
              .select('id', { count: 'exact', head: true })
              .eq('stato_approvazione', 'in_attesa')
          : Promise.resolve({ count: 0 }),
        supabase
          .from('leave_requests')
          .select('id, user_id, data_inizio, data_fine, tipo, profiles(first_name, last_name)')
          .eq('stato', 'approvata')
          .lte('data_inizio', todayISO)
          .gte('data_fine', todayISO),
      ])

      if (cancelled) return
      setUrgentTasks((tasksRes.data || []) as Task[])
      setNextEvent(eventsRes.data?.[0] || null)
      setUnreadCount(notifsRes.count || 0)
      setPendingPayments((paymentsRes as any).count || 0)
      setLeaves((leavesRes.data || []) as unknown as LeaveRequest[])
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [user?.id])

  function openFly() {
    const input = document.querySelector<HTMLInputElement>('.cmd-bar-input')
    if (input) {
      input.focus()
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, 'cosa dovrei fare adesso?')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: 'var(--red2)' }} />
      </div>
    )
  }

  const todayTasks = urgentTasks.filter(t => t.scadenza <= todayISO)
  const tomorrowTasks = urgentTasks.filter(t => t.scadenza > todayISO)

  return (
    <div style={{ maxWidth: 640, padding: '0 16px' }}>
      {/* Masthead */}
      <div style={{ marginBottom: 32 }}>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--muted)',
          marginBottom: 6,
        }}>
          OGGI &mdash; {formatDate(today).toUpperCase()}
        </p>
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 28,
          fontWeight: 600,
          color: 'var(--text)',
          margin: 0,
        }}>
          Buongiorno, {user?.first_name || 'team'}.
        </h1>
      </div>

      {/* SECTION 1: L'URGENTE */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 12,
        }}>
          L'urgente
        </h2>

        {todayTasks.length === 0 && tomorrowTasks.length === 0 ? (
          <div style={{
            padding: '20px 16px',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--green) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--green) 20%, transparent)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <CheckCircle2 size={18} style={{ color: 'var(--green)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green)' }}>
              Niente di urgente oggi
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {todayTasks.map(task => (
              <TaskCard key={task.id} task={task} isToday navigate={navigate} />
            ))}
            {tomorrowTasks.length > 0 && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 8, marginBottom: 4 }}>
                DOMANI
              </p>
            )}
            {tomorrowTasks.map(task => (
              <TaskCard key={task.id} task={task} isToday={false} navigate={navigate} />
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2: IL PROSSIMO EVENTO */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 12,
        }}>
          Il prossimo evento
        </h2>

        {nextEvent ? (
          <div
            className="wire-card"
            onClick={() => navigate(`/eventi?id=${nextEvent.id}`)}
            style={{
              padding: 20,
              borderRadius: 12,
              background: 'var(--panel-solid)',
              border: '1px solid var(--line)',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--red2)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Calendar size={16} style={{ color: 'var(--red2)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                tra {daysUntil(nextEvent.data_inizio)} giorni
              </span>
            </div>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>
              {nextEvent.nome}
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
              {fmtLong(nextEvent.data_inizio)}
              {nextEvent.luogo && ` \u00B7 ${nextEvent.luogo}`}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red2)' }}>
                Apri evento
              </span>
              <ArrowRight size={12} style={{ color: 'var(--red2)' }} />
            </div>
          </div>
        ) : (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
            Nessun evento imminente in programma.
          </p>
        )}
      </section>

      {/* SECTION 3: IL TEAM */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 12,
        }}>
          Il team
        </h2>

        {leaves.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green)' }}>
            Tutto il team e presente oggi.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leaves.map(leave => {
              const profile = leave.profiles as any
              const name = profile ? `${profile.first_name} ${profile.last_name}` : 'Collega'
              return (
                <div key={leave.id} className="wire-card-sm" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
                  <Palmtree size={14} style={{ color: 'var(--yellow)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>
                    {name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
                    rientra {fmtLong(leave.data_fine)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* SECTION 4: DA NON PERDERE */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 12,
        }}>
          Da non perdere
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => navigate('/comunicazioni')}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 10,
              background: 'var(--panel-solid)', border: '1px solid var(--line)',
              cursor: 'pointer', width: '100%', textAlign: 'left',
            }}
          >
            <Bell size={16} style={{ color: unreadCount > 0 ? 'var(--red2)' : 'var(--muted)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', flex: 1 }}>
              Messaggi non letti
            </span>
            {unreadCount > 0 && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                background: 'var(--red2)', color: '#fff',
                padding: '2px 8px', borderRadius: 99,
              }}>
                {unreadCount}
              </span>
            )}
            {unreadCount === 0 && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>0</span>
            )}
          </button>

          {isAdmin && (
            <button
              onClick={() => navigate('/amministrazione')}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 10,
                background: 'var(--panel-solid)', border: '1px solid var(--line)',
                cursor: 'pointer', width: '100%', textAlign: 'left',
              }}
            >
              <CreditCard size={16} style={{ color: pendingPayments > 0 ? 'var(--yellow)' : 'var(--muted)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', flex: 1 }}>
                Pagamenti in attesa
              </span>
              {pendingPayments > 0 && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  background: 'var(--yellow)', color: '#000',
                  padding: '2px 8px', borderRadius: 99,
                }}>
                  {pendingPayments}
                </span>
              )}
              {pendingPayments === 0 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>0</span>
              )}
            </button>
          )}
        </div>
      </section>

      {/* FLY CTA */}
      <div style={{ paddingBottom: 40 }}>
        <button
          onClick={openFly}
          style={{
            width: '100%',
            padding: '14px 20px',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--red2) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--red2) 25%, transparent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 4.6 9c-1 .6-1.7 1.8-1.7 3s.7 2.4 1.7 3A3.6 3.6 0 0 0 9 19.3c.6 1.1 1.8 1.7 3 1.7s2.4-.6 3-1.7A3.6 3.6 0 0 0 19.4 15c1-.6 1.7-1.8 1.7-3s-.7-2.4-1.7-3A3.6 3.6 0 0 0 15 4.7C14.4 3.6 13.2 3 12 3z"/>
            <circle cx="12" cy="12" r="2"/>
          </svg>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--red2)' }}>
            Chiedi a Fly cosa fare
          </span>
        </button>
      </div>
    </div>
  )
}

function TaskCard({ task, isToday, navigate }: { task: Task; isToday: boolean; navigate: (p: string) => void }) {
  return (
    <div
      className="wire-card-accent"
      onClick={() => navigate(`/task?id=${task.id}`)}
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        background: 'var(--panel-solid)',
        border: '1px solid var(--line)',
        borderLeft: isToday ? '3px solid var(--red2)' : '3px solid var(--yellow)',
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--panel-solid)')}
    >
      <p style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--text)',
        margin: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {task.titolo}
      </p>
      {task.evento && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
          Evento collegato
        </p>
      )}
    </div>
  )
}
