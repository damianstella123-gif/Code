import { useState, useEffect, useCallback } from 'react'
import { Users, Pencil, X, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { EVENT_ROLES } from '@/data/event-roles'
import type { Event } from '@/data/events'
import type { InternalUser } from '../shared-types'

interface TeamRoleRow {
  id: string
  event_id: string
  profile_id: string
  ruoli_operativi: string[]
}

export function TabTeam({ event, internalUsers }: { event: Event; internalUsers: InternalUser[] }) {
  const teamMembers = internalUsers.filter(u => event.team.includes(u.id))
  const responsabile = internalUsers.find(u => u.id === event.responsabile)

  const [rolesMap, setRolesMap] = useState<Record<string, string[]>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [customRole, setCustomRole] = useState('')
  const [saving, setSaving] = useState(false)

  const loadRoles = useCallback(async () => {
    const { data } = await supabase
      .from('event_team_roles')
      .select('profile_id, ruoli_operativi')
      .eq('event_id', event.id)
    if (data) {
      const map: Record<string, string[]> = {}
      for (const row of data as TeamRoleRow[]) {
        map[row.profile_id] = row.ruoli_operativi || []
      }
      setRolesMap(map)
    }
  }, [event.id])

  useEffect(() => { loadRoles() }, [loadRoles])

  function startEdit(profileId: string) {
    setEditingId(profileId)
    setSelectedRoles([...(rolesMap[profileId] || [])])
    setCustomRole('')
  }

  function toggleRole(role: string) {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  function addCustomRole() {
    const trimmed = customRole.trim()
    if (trimmed && !selectedRoles.includes(trimmed)) {
      setSelectedRoles(prev => [...prev, trimmed])
    }
    setCustomRole('')
  }

  async function saveRoles() {
    if (!editingId) return
    setSaving(true)
    await supabase
      .from('event_team_roles')
      .upsert({
        event_id: event.id,
        profile_id: editingId,
        ruoli_operativi: selectedRoles,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'event_id,profile_id' })
    setRolesMap(prev => ({ ...prev, [editingId]: selectedRoles }))
    setEditingId(null)
    setSaving(false)
  }

  function RoleBadges({ roles }: { roles: string[] }) {
    if (!roles || roles.length === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
        {roles.map(r => (
          <span key={r} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 99,
            background: 'rgba(200,25,46,0.08)',
            color: 'var(--red2)',
            border: '1px solid rgba(200,25,46,0.2)',
            display: 'inline-block',
            whiteSpace: 'nowrap',
          }}>
            {r}
          </span>
        ))}
      </div>
    )
  }

  if (teamMembers.length === 0 && !responsabile) {
    return (
      <div className="space-y-4">
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun membro del team assegnato</p>
          <p className="text-xs mt-1">Modifica l'evento per aggiungere il team</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {responsabile && (
        <div className="panel p-4" style={{ border: '1px solid var(--red2)' }}>
          <div className="flex items-center gap-4">
            <img src={responsabile.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{responsabile.nome}</p>
              <p className="text-xs" style={{ color: 'var(--red2)' }}>Responsabile evento</p>
              <RoleBadges roles={rolesMap[responsabile.id] || []} />
            </div>
            <button
              onClick={() => startEdit(responsabile.id)}
              style={{ padding: 6, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              title="Modifica ruoli operativi"
            >
              <Pencil style={{ width: 14, height: 14 }} />
            </button>
          </div>
          {editingId === responsabile.id && (
            <EditPanel
              selectedRoles={selectedRoles}
              customRole={customRole}
              setCustomRole={setCustomRole}
              toggleRole={toggleRole}
              addCustomRole={addCustomRole}
              saveRoles={saveRoles}
              saving={saving}
              onClose={() => setEditingId(null)}
            />
          )}
        </div>
      )}

      {teamMembers.filter(m => m.id !== event.responsabile).map(m => (
        <div key={m.id} className="panel p-4">
          <div className="flex items-center gap-4">
            <img src={m.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{m.nome}</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Membro team</p>
              <RoleBadges roles={rolesMap[m.id] || []} />
            </div>
            <button
              onClick={() => startEdit(m.id)}
              style={{ padding: 6, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              title="Modifica ruoli operativi"
            >
              <Pencil style={{ width: 14, height: 14 }} />
            </button>
          </div>
          {editingId === m.id && (
            <EditPanel
              selectedRoles={selectedRoles}
              customRole={customRole}
              setCustomRole={setCustomRole}
              toggleRole={toggleRole}
              addCustomRole={addCustomRole}
              saveRoles={saveRoles}
              saving={saving}
              onClose={() => setEditingId(null)}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function EditPanel({ selectedRoles, customRole, setCustomRole, toggleRole, addCustomRole, saveRoles, saving, onClose }: {
  selectedRoles: string[]
  customRole: string
  setCustomRole: (v: string) => void
  toggleRole: (r: string) => void
  addCustomRole: () => void
  saveRoles: () => void
  saving: boolean
  onClose: () => void
}) {
  return (
    <div style={{
      marginTop: 12,
      padding: 14,
      borderRadius: 10,
      background: 'var(--panel2)',
      border: '1px solid var(--line)',
    }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>
          Ruoli Operativi
        </p>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
        {EVENT_ROLES.map(role => (
          <label key={role} style={{
            display: 'flex', alignItems: 'center',
            gap: 8, padding: '5px 0',
            cursor: 'pointer', fontSize: 12,
            color: 'var(--text)',
          }}>
            <input
              type="checkbox"
              checked={selectedRoles.includes(role)}
              onChange={() => toggleRole(role)}
              style={{ accentColor: 'var(--red2)', width: 14, height: 14 }}
            />
            {role}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <input
          type="text"
          value={customRole}
          onChange={e => setCustomRole(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomRole() } }}
          placeholder="Ruolo personalizzato..."
          style={{
            flex: 1,
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--line)',
            background: 'var(--panel-solid)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text)',
            outline: 'none',
          }}
        />
        <button
          onClick={addCustomRole}
          disabled={!customRole.trim()}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--line)',
            background: 'var(--panel-solid)',
            cursor: customRole.trim() ? 'pointer' : 'not-allowed',
            color: customRole.trim() ? 'var(--text)' : 'var(--muted)',
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11,
          }}
        >
          <Plus style={{ width: 12, height: 12 }} /> Aggiungi
        </button>
      </div>

      {selectedRoles.filter(r => !EVENT_ROLES.includes(r as typeof EVENT_ROLES[number])).length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {selectedRoles.filter(r => !EVENT_ROLES.includes(r as typeof EVENT_ROLES[number])).map(r => (
            <span key={r} style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 8px',
              borderRadius: 99, background: 'rgba(200,25,46,0.08)', color: 'var(--red2)',
              border: '1px solid rgba(200,25,46,0.2)', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {r}
              <button onClick={() => toggleRole(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red2)', padding: 0, lineHeight: 1 }}>
                <X style={{ width: 10, height: 10 }} />
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        onClick={saveRoles}
        disabled={saving}
        style={{
          marginTop: 12,
          width: '100%',
          padding: '8px 0',
          borderRadius: 8,
          border: 'none',
          background: 'var(--red2)',
          color: '#fff',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '.04em',
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Salvataggio...' : 'Salva ruoli'}
      </button>
    </div>
  )
}
