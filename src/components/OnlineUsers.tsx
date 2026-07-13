import { useState, useEffect, useCallback } from 'react'
import { getOnlineUsers, type OnlineUser } from '@/lib/presence-service'
import { supabase } from '@/lib/supabase'

export function OnlineUsers() {
  const [users, setUsers] = useState<OnlineUser[]>([])
  const [expanded, setExpanded] = useState(false)

  const refresh = useCallback(() => {
    setUsers(getOnlineUsers())
  }, [])

  useEffect(() => {
    refresh()

    const channel = supabase.channel('online-users')
    channel.on('presence', { event: 'sync' }, refresh)

    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [refresh])

  if (users.length === 0) return null

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 99,
          background: 'color-mix(in srgb, var(--green) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--green) 20%, transparent)',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--green)',
          boxShadow: '0 0 6px var(--green)',
          animation: 'presence-pulse 2s ease-in-out infinite',
        }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--green)', fontWeight: 600,
        }}>
          {users.length}
        </span>

        <div style={{ display: 'flex', marginLeft: 2 }}>
          {users.slice(0, 3).map((u, i) => (
            <div
              key={u.user_id}
              style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--green), #2dd4bf)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 700, color: '#fff',
                border: '1.5px solid var(--panel-solid)',
                marginLeft: i > 0 ? -6 : 0,
                zIndex: 3 - i,
              }}
              title={`${u.first_name} ${u.last_name}`}
            >
              {u.first_name?.[0]}{u.last_name?.[0]}
            </div>
          ))}
          {users.length > 3 && (
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: 'var(--panel2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 700, color: 'var(--muted)',
              border: '1.5px solid var(--panel-solid)',
              marginLeft: -6,
            }}>
              +{users.length - 3}
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
          <div
            style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 8,
              background: 'var(--panel-solid)', border: '1px solid var(--line)',
              borderRadius: 12, padding: '12px 0', minWidth: 200,
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)', zIndex: 50,
            }}
            className="animate-fade-in"
          >
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              letterSpacing: '.1em', color: 'var(--muted)',
              padding: '0 14px 8px', borderBottom: '1px solid var(--line)',
              textTransform: 'uppercase',
            }}>
              Utenti online ({users.length})
            </p>
            <div style={{ maxHeight: 240, overflowY: 'auto', padding: '6px 0' }}>
              {users.map(u => (
                <div key={u.user_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--green), #2dd4bf)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>
                    {u.first_name?.[0]}{u.last_name?.[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.first_name} {u.last_name}
                    </p>
                  </div>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--green)',
                    boxShadow: '0 0 4px var(--green)',
                    flexShrink: 0,
                  }} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes presence-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
