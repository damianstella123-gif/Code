import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, Plus, Search, Users, Shield, Trash2, Edit3, ChevronDown } from 'lucide-react'
import { fetchAllProfiles, type Profile } from '@/lib/profiles'
import { loadUser } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import {
  fetchEventMembers,
  checkCanManageMembers,
  checkAllPermissions,
  upsertEventMember,
  removeEventMember,
  translateError,
  ROLE_LABELS,
  ROLE_PRESETS,
  PERMISSION_LABELS,
  ALL_PERMISSIONS,
  type EventMember,
  type MemberRole,
  type PermissionKey,
} from '@/lib/event-members-service'

interface Props {
  eventId: string
  responsabileId: string
  isArchived?: boolean
  onClose: () => void
}

export default function EventTeamManager({ eventId, responsabileId, isArchived, onClose }: Props) {
  const { showToast } = useToast()
  const [members, setMembers] = useState<EventMember[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [canManage, setCanManage] = useState(false)
  const [callerPerms, setCallerPerms] = useState<Record<PermissionKey, boolean> | null>(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<EventMember | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<EventMember | null>(null)
  const [saving, setSaving] = useState(false)

  const currentUser = loadUser()

  const reload = useCallback(async () => {
    setLoading(true)
    const [m, manage, perms] = await Promise.all([
      fetchEventMembers(eventId),
      checkCanManageMembers(eventId),
      checkAllPermissions(eventId),
    ])
    setMembers(m)
    setCanManage(manage && !isArchived)
    setCallerPerms(perms)
    setLoading(false)
  }, [eventId, isArchived])

  useEffect(() => {
    reload()
    fetchAllProfiles().then(setProfiles)
  }, [reload])

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>()
    profiles.forEach(p => map.set(p.id, p))
    return map
  }, [profiles])

  const handleRemove = async () => {
    if (!confirmRemove) return
    setSaving(true)
    const { error } = await removeEventMember(eventId, confirmRemove.user_id)
    setSaving(false)
    if (error) {
      showToast(translateError(error), 'error')
    } else {
      showToast('Membro rimosso dall\'evento.', 'success')
      setConfirmRemove(null)
      await reload()
    }
  }

  const isOwner = (userId: string) => userId === responsabileId

  const effectiveCanManage = canManage && !isArchived

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 620, maxHeight: '90vh',
        background: 'var(--panel-solid)', borderRadius: 16, border: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
        animation: 'toastSlideIn 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users className="w-4 h-4" style={{ color: 'var(--red2)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Team evento</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>({members.length})</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {effectiveCanManage && (
              <button
                onClick={() => { setEditingMember(null); setFormOpen(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--red2)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600 }}
              >
                <Plus className="w-3 h-3" /> Aggiungi
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>Caricamento...</div>
          ) : members.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>Nessun membro assegnato.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {members.map(m => {
                const profile = profileMap.get(m.user_id)
                const memberIsOwner = isOwner(m.user_id)
                const name = profile ? `${profile.first_name} ${profile.last_name}` : m.user_id
                const activePerms = ALL_PERMISSIONS.filter(p => m[p])
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: memberIsOwner ? 'color-mix(in srgb, var(--red2) 4%, transparent)' : 'transparent', transition: 'background 0.12s' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                      {profile ? `${profile.first_name[0]}${profile.last_name[0]}` : '??'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                        {memberIsOwner && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: 'var(--red2)', background: 'color-mix(in srgb, var(--red2) 10%, transparent)', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            Responsabile evento
                          </span>
                        )}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', background: 'var(--line)', padding: '2px 6px', borderRadius: 4 }}>
                          {ROLE_LABELS[m.member_role]}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        {profile && <span>{profile.email}</span>}
                        {profile && <span style={{ opacity: 0.5 }}>&middot;</span>}
                        {profile && <span>{profile.role}</span>}
                      </div>
                      {activePerms.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                          {activePerms.map(p => (
                            <span key={p} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--blue)', background: 'color-mix(in srgb, var(--blue) 8%, transparent)', padding: '1px 5px', borderRadius: 3 }}>
                              {PERMISSION_LABELS[p]}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {effectiveCanManage && !memberIsOwner && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => { setEditingMember(m); setFormOpen(true) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 4, transition: 'color 0.12s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmRemove(m)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 4, transition: 'color 0.12s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--red2)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {effectiveCanManage && memberIsOwner && currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Super Admin' || currentUser.role === 'Amministrazione' || currentUser.id === responsabileId) && (
                      <button
                        onClick={() => { setEditingMember(m); setFormOpen(true) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 4, transition: 'color 0.12s', flexShrink: 0 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Add/Edit Form */}
        {formOpen && callerPerms && (
          <MemberForm
            eventId={eventId}
            editing={editingMember}
            profiles={profiles}
            existingMemberIds={members.map(m => m.user_id)}
            callerPerms={callerPerms}

            onSaved={async () => { setFormOpen(false); setEditingMember(null); await reload() }}
            onCancel={() => { setFormOpen(false); setEditingMember(null) }}
            showToast={showToast}
          />
        )}

        {/* Remove Confirmation */}
        {confirmRemove && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 16 }}>
            <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 12, padding: 24, maxWidth: 360, width: '90%' }}>
              <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8, fontWeight: 600 }}>Rimuovere questo membro?</p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
                {profileMap.get(confirmRemove.user_id)?.first_name} {profileMap.get(confirmRemove.user_id)?.last_name} perderà l'accesso a questo evento e ai moduli collegati (documenti, budget, pagamenti, creative).
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setConfirmRemove(null)}
                  disabled={saving}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
                >
                  Annulla
                </button>
                <button
                  onClick={handleRemove}
                  disabled={saving}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--red2)', color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Rimozione...' : 'Rimuovi'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Member Form (Add/Edit) ─────────────────────────────────────────────────

interface MemberFormProps {
  eventId: string
  editing: EventMember | null
  profiles: Profile[]
  existingMemberIds: string[]
  callerPerms: Record<PermissionKey, boolean>
  onSaved: () => void
  onCancel: () => void
  showToast: (msg: string, type?: 'error' | 'success' | 'info') => void
}

function MemberForm({ eventId, editing, profiles, existingMemberIds, callerPerms, onSaved, onCancel, showToast }: MemberFormProps) {
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(editing?.user_id ?? null)
  const [role, setRole] = useState<MemberRole>(editing?.member_role ?? 'collaboratore')
  const [perms, setPerms] = useState<Record<PermissionKey, boolean>>(
    editing
      ? Object.fromEntries(ALL_PERMISSIONS.map(p => [p, editing[p]])) as Record<PermissionKey, boolean>
      : ROLE_PRESETS.collaboratore
  )
  const [saving, setSaving] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const currentUser = loadUser()
  const callerIsAdmin = currentUser && ['Admin', 'Super Admin', 'Amministrazione'].includes(currentUser.role)

  const availableProfiles = useMemo(() => {
    if (editing) return []
    return profiles.filter(p =>
      p.is_active &&
      !existingMemberIds.includes(p.id) &&
      (search === '' ||
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        p.email.toLowerCase().includes(search.toLowerCase()))
    )
  }, [profiles, existingMemberIds, search, editing])

  const handleRoleChange = (newRole: MemberRole) => {
    setRole(newRole)
    setPerms(ROLE_PRESETS[newRole])
    setDropdownOpen(false)
  }

  const handlePermToggle = (key: PermissionKey) => {
    if (role === 'sola_lettura') return
    if (role === 'responsabile' && key === 'can_manage_members') return
    setPerms(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const isPermDisabled = (key: PermissionKey): boolean => {
    if (role === 'sola_lettura') return true
    if (role === 'responsabile' && key === 'can_manage_members') return true
    if (!callerIsAdmin && !callerPerms[key]) return true
    return false
  }

  const handleSave = async () => {
    if (!selectedUserId) {
      showToast('Seleziona un utente.', 'error')
      return
    }
    setSaving(true)
    const { error } = await upsertEventMember({
      event_id: eventId,
      user_id: selectedUserId,
      member_role: role,
      ...perms,
    })
    setSaving(false)
    if (error) {
      showToast(translateError(error), 'error')
    } else {
      showToast(editing ? 'Membro aggiornato.' : 'Membro aggiunto al team.', 'success')
      onSaved()
    }
  }

  const selectedProfile = profiles.find(p => p.id === selectedUserId)

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--panel-solid)', display: 'flex', flexDirection: 'column', borderRadius: 16, zIndex: 5 }}>
      {/* Form Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {editing ? 'Modifica membro' : 'Aggiungi membro'}
        </span>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* User selection (only for add) */}
        {!editing && (
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' }}>
              Utente
            </label>
            {selectedProfile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--blue) 4%, transparent)' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{selectedProfile.first_name} {selectedProfile.last_name}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{selectedProfile.email}</span>
                <button onClick={() => setSelectedUserId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px' }}>
                  <Search className="w-3.5 h-3.5" style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Cerca per nome o email..."
                    style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', width: '100%' }}
                  />
                </div>
                {search.length > 0 && availableProfiles.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 8, maxHeight: 180, overflowY: 'auto', zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                    {availableProfiles.slice(0, 8).map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedUserId(p.id); setSearch('') }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--line)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                      >
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                          {p.first_name[0]}{p.last_name[0]}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{p.first_name} {p.last_name}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.email} &middot; {p.role}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {search.length > 1 && availableProfiles.length === 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                    Nessun utente disponibile.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {editing && (
          <div style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--line)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {profiles.find(p => p.id === editing.user_id)?.first_name} {profiles.find(p => p.id === editing.user_id)?.last_name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
              {profiles.find(p => p.id === editing.user_id)?.email}
            </span>
          </div>
        )}

        {/* Role selector */}
        <div>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' }}>
            Ruolo evento
          </label>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}
            >
              {ROLE_LABELS[role]}
              <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </button>
            {dropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                {(Object.keys(ROLE_LABELS) as MemberRole[]).map(r => (
                  <button
                    key={r}
                    onClick={() => handleRoleChange(r)}
                    style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', background: r === role ? 'var(--line)' : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 12, color: r === role ? 'var(--text)' : 'var(--muted)', fontWeight: r === role ? 600 : 400, transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (r !== role) (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--line) 50%, transparent)' }}
                    onMouseLeave={e => { if (r !== role) (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Permissions */}
        <div>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield className="w-3 h-3" /> Permessi
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ALL_PERMISSIONS.map(key => {
              const disabled = isPermDisabled(key)
              const active = perms[key]
              return (
                <button
                  key={key}
                  onClick={() => !disabled && handlePermToggle(key)}
                  disabled={disabled}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 8, border: '1px solid var(--line)',
                    background: active ? 'color-mix(in srgb, var(--blue) 6%, transparent)' : 'transparent',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: active ? 'none' : '1.5px solid var(--muted)',
                    background: active ? 'var(--blue)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.12s',
                  }}>
                    {active && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>&#10003;</span>}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)' }}>
                    {PERMISSION_LABELS[key]}
                  </span>
                  {disabled && !callerIsAdmin && callerPerms && !callerPerms[key] && role !== 'sola_lettura' && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginLeft: 'auto' }}>
                      Non disponibile
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Form Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, padding: '7px 14px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}
        >
          Annulla
        </button>
        <button
          onClick={handleSave}
          disabled={saving || (!editing && !selectedUserId)}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, padding: '7px 14px', borderRadius: 6, border: 'none', background: 'var(--red2)', color: '#fff', cursor: 'pointer', opacity: (saving || (!editing && !selectedUserId)) ? 0.5 : 1 }}
        >
          {saving ? 'Salvataggio...' : editing ? 'Aggiorna' : 'Aggiungi'}
        </button>
      </div>
    </div>
  )
}
