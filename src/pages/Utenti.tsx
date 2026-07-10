import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Lock,
  Unlock,
  Key,
  Edit3,
  X,
  Check,
  AlertCircle,
  User,
  Mail,
  Camera,
} from 'lucide-react'
import { loadUser, canManageUsers, canResetOtherPasswords, canChangeRoles } from '@/lib/auth'
import type { AppRole } from '@/lib/database.types'
import { APP_ROLES } from '@/lib/database.types'
import type { Profile } from '@/lib/profiles'
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminResetPassword,
} from '@/lib/users-service'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function roleColor(role: string) {
  switch (role) {
    case 'Super Admin': return 'var(--red2)'
    case 'Admin': return '#e67e22'
    case 'Senior PM': return '#8e44ad'
    case 'Project Manager': return 'var(--blue)'
    case 'Regista': return '#9b59b6'
    case 'Commerciale': return '#27ae60'
    case 'Amministrazione': return '#16a085'
    default: return 'var(--muted)'
  }
}

type FilterStato = 'Tutti' | 'attivo' | 'disattivato'

const STATO_FILTERS: { id: FilterStato; label: string }[] = [
  { id: 'Tutti', label: 'TUTTI' },
  { id: 'attivo', label: 'ATTIVI' },
  { id: 'disattivato', label: 'DISATTIVATI' },
]

// ─── FORM TYPES ───────────────────────────────────────────────────────────────

interface CreateFormData {
  first_name: string
  last_name: string
  email: string
  password: string
  role: AppRole
}

interface EditFormData {
  first_name: string
  last_name: string
  email: string
  role: AppRole
  is_active: boolean
  avatar_url: string
}

const emptyCreateForm: CreateFormData = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  role: 'Project Manager',
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function Utenti() {
  const currentUser = loadUser()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<'Tutti' | AppRole>('Tutti')
  const [filterStato, setFilterStato] = useState<FilterStato>('Tutti')
  const [showCreate, setShowCreate] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [resetUser, setResetUser] = useState<Profile | null>(null)
  const [createForm, setCreateForm] = useState<CreateFormData>(emptyCreateForm)
  const [editForm, setEditForm] = useState<EditFormData>({ first_name: '', last_name: '', email: '', role: 'Project Manager', is_active: true, avatar_url: '' })
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  const isPartner = canManageUsers(currentUser)
  const canEditRoles = canChangeRoles(currentUser)
  const canResetPasswords = canResetOtherPasswords(currentUser)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const list = await adminListUsers()
      setUsers(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento utenti')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const cards = document.querySelectorAll('[data-user-card]')
      let inside = false
      cards.forEach(c => {
        if (c.contains(e.target as Node)) inside = true
      })
      if (!inside) setExpandedUser(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!error && !success) return
    const t = setTimeout(() => { setError(null); setSuccess(null) }, 5000)
    return () => clearTimeout(t)
  }, [error, success])

  const filtered = users.filter(u => {
    if (filterRole !== 'Tutti' && u.role !== filterRole) return false
    if (filterStato === 'attivo' && !u.is_active) return false
    if (filterStato === 'disattivato' && u.is_active) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    )
  })

  const openEdit = (u: Profile) => {
    setEditingUser(u)
    setEditForm({
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      role: u.role,
      is_active: u.is_active,
      avatar_url: u.avatar_url ?? '',
    })
  }

  const handleCreate = async () => {
    if (!createForm.first_name || !createForm.last_name || !createForm.email || !createForm.password) {
      setError('Compila tutti i campi obbligatori')
      return
    }
    if (createForm.password.length < 6) {
      setError('La password deve avere almeno 6 caratteri')
      return
    }
    setSubmitting(true)
    try {
      await adminCreateUser({
        email: createForm.email,
        password: createForm.password,
        first_name: createForm.first_name,
        last_name: createForm.last_name,
        role: createForm.role,
      })
      setSuccess(`Utente ${createForm.first_name} ${createForm.last_name} creato con successo`)
      setShowCreate(false)
      setCreateForm(emptyCreateForm)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore creazione utente')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingUser) return
    if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
      setError('Nome e cognome sono obbligatori')
      return
    }
    if (!editForm.email.trim()) {
      setError('Email obbligatoria')
      return
    }

    const emailChanged = editForm.email !== editingUser.email
    const changes: string[] = []
    if (editForm.first_name !== editingUser.first_name) changes.push('nome')
    if (editForm.last_name !== editingUser.last_name) changes.push('cognome')
    if (emailChanged) changes.push(`email (da ${editingUser.email} a ${editForm.email})`)
    if (editForm.role !== editingUser.role) changes.push(`ruolo (da ${editingUser.role} a ${editForm.role})`)
    if (editForm.is_active !== editingUser.is_active) changes.push(editForm.is_active ? 'riattivazione' : 'disattivazione')
    if ((editForm.avatar_url || '') !== (editingUser.avatar_url || '')) changes.push('avatar')

    if (changes.length === 0) {
      setEditingUser(null)
      return
    }

    const confirmMsg = emailChanged
      ? `Confermi le modifiche?\n\nModifiche: ${changes.join(', ')}\n\nATTENZIONE: La modifica dell'email aggiornerà anche le credenziali di accesso. L'utente dovrà usare la nuova email per il login.`
      : `Confermi le modifiche?\n\nModifiche: ${changes.join(', ')}`

    setConfirmAction({
      message: confirmMsg,
      onConfirm: () => executeUpdate(),
    })
  }

  const executeUpdate = async () => {
    if (!editingUser) return
    setConfirmAction(null)
    setSubmitting(true)
    try {
      await adminUpdateUser({
        user_id: editingUser.id,
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        email: editForm.email !== editingUser.email ? editForm.email : undefined,
        role: editForm.role,
        is_active: editForm.is_active,
        avatar_url: editForm.avatar_url || null,
      })
      setSuccess(`Utente ${editForm.first_name} ${editForm.last_name} aggiornato con successo`)
      setEditingUser(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore aggiornamento utente')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (user: Profile) => {
    const action = user.is_active ? 'disattivare' : 'riattivare'
    setConfirmAction({
      message: `Confermi di voler ${action} l'utente ${user.first_name} ${user.last_name}?`,
      onConfirm: async () => {
        setConfirmAction(null)
        try {
          await adminUpdateUser({
            user_id: user.id,
            is_active: !user.is_active,
          })
          setSuccess(user.is_active ? 'Utente disattivato' : 'Utente riattivato')
          await refresh()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Errore')
        }
      },
    })
  }

  const handleResetPassword = async () => {
    if (!resetUser || !newPassword) return
    if (newPassword.length < 6) {
      setError('La password deve avere almeno 6 caratteri')
      return
    }
    setSubmitting(true)
    try {
      await adminResetPassword(resetUser.id, newPassword)
      setSuccess(`Password resettata per ${resetUser.first_name} ${resetUser.last_name}`)
      setResetUser(null)
      setNewPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore reset password')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── STATS ──────────────────────────────────────────────────────────────────

  const activeCount = users.filter(u => u.is_active).length
  const inactiveCount = users.filter(u => !u.is_active).length

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0 animate-fade-in">
      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm animate-fade-in mb-6" style={{ background: 'rgba(208,0,58,0.08)', border: '1px solid rgba(208,0,58,0.2)', color: 'var(--red2)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm animate-fade-in mb-6" style={{ background: 'rgba(56,210,125,0.08)', border: '1px solid rgba(56,210,125,0.2)', color: 'var(--green)' }}>
          <Check className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">{success}</span>
        </div>
      )}

      {/* Wire Masthead */}
      <div className="wire-masthead">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="wire-masthead-title">TEAM</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
            COUNT UTENTI
          </span>
        </div>
        {isPartner && (
          <div className="wire-masthead-right">
            <span
              onClick={() => { setShowCreate(true); setCreateForm(emptyCreateForm) }}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--red2)', cursor: 'pointer', transition: 'opacity 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
            >
              + NUOVO
            </span>
          </div>
        )}
      </div>

      {/* Wire Ticker - Stats */}
      <div className="wire-ticker">
        <span>Attivi <strong>{activeCount}</strong></span>
        <span>Disattivati <strong>{inactiveCount}</strong></span>
      </div>

      {/* Filters bar - inline compact */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
        {/* Search + Role Filter Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {/* Search */}
          <div className="relative flex-1" style={{ minWidth: '180px' }}>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              placeholder="Cerca nel team..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '10px',
                paddingRight: '12px',
                paddingTop: '8px',
                paddingBottom: '8px',
                borderRadius: '6px',
                border: '1px solid var(--line)',
                background: 'transparent',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
              }}
            />
          </div>

          {/* Role filter */}
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value as 'Tutti' | AppRole)}
            style={{
              paddingLeft: '10px',
              paddingRight: '12px',
              paddingTop: '8px',
              paddingBottom: '8px',
              borderRadius: '6px',
              border: '1px solid var(--line)',
              background: 'transparent',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              cursor: 'pointer',
              appearance: 'none',
            }}
          >
            <option value="Tutti">Tutti i ruoli</option>
            {APP_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Status filter pills - wire-tab pattern */}
        <div style={{ display: 'flex', gap: 20 }}>
          {STATO_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilterStato(f.id)}
              className={`wire-tab ${filterStato === f.id ? 'wire-tab--active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* User Cards Grid */}
      <div style={{ marginTop: 20 }}>
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, animationDelay: `${i * 50}ms` }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--panel2)' }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ height: 16, width: 120, borderRadius: 4, background: 'var(--panel2)' }} />
                    <div style={{ height: 12, width: 90, borderRadius: 4, background: 'var(--panel2)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 32px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>Nessun utente trovato</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', marginTop: 6 }}>Prova a modificare i filtri di ricerca</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {filtered.map((u, i) => (
              <UserCard
                key={u.id}
                user={u}
                isPartner={isPartner}
                canResetPw={canResetPasswords}
                isSelf={u.id === currentUser?.id}
                delay={i * 40}
                expanded={expandedUser === u.id}
                onToggle={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                onEdit={() => openEdit(u)}
                onToggleActive={() => handleToggleActive(u)}
                onResetPassword={() => { setResetUser(u); setNewPassword('') }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Create Modal ─────────────────────────────────────────── */}
      {showCreate && (
        <Modal title="Nuovo Utente" subtitle="Crea un nuovo account" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Nome" value={createForm.first_name} onChange={v => setCreateForm(p => ({ ...p, first_name: v }))} placeholder="Mario" />
              <FormField label="Cognome" value={createForm.last_name} onChange={v => setCreateForm(p => ({ ...p, last_name: v }))} placeholder="Rossi" />
            </div>
            <FormField label="Email" type="email" value={createForm.email} onChange={v => setCreateForm(p => ({ ...p, email: v }))} placeholder="mario@simmetria.it" icon={<Mail className="w-3.5 h-3.5" />} />
            <FormField label="Password" type="password" value={createForm.password} onChange={v => setCreateForm(p => ({ ...p, password: v }))} placeholder="Min. 6 caratteri" icon={<Key className="w-3.5 h-3.5" />} />
            <RoleSelect value={createForm.role} onChange={v => setCreateForm(p => ({ ...p, role: v }))} />
            <div style={{ paddingTop: 8 }}>
              <button onClick={handleCreate} disabled={submitting} style={{ width: '100%', padding: '12px 16px', background: 'var(--red2)', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', cursor: 'pointer', opacity: submitting ? 0.6 : 1, transition: 'opacity 0.15s' }}>
                {submitting ? 'CREAZIONE IN CORSO...' : 'CREA UTENTE'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Edit Modal ───────────────────────────────────────────── */}
      {editingUser && (
        <Modal title="Modifica Utente" subtitle={`${editingUser.first_name} ${editingUser.last_name}`} onClose={() => setEditingUser(null)}>
          <div className="space-y-5">
            {/* User preview card */}
            <div style={{ display: 'flex', gap: 16, padding: 14, borderRadius: 10, background: 'var(--panel2)', border: '1px solid var(--line)', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontSize: 14,
                  fontWeight: 'bold',
                  color: 'white',
                  background: `linear-gradient(135deg, ${roleColor(editForm.role)} 0%, ${roleColor(editForm.role)}88 100%)`,
                  flexShrink: 0,
                }}
              >
                {editForm.avatar_url
                  ? <img src={editForm.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'cover' }} />
                  : <>{(editForm.first_name || '?').charAt(0)}{(editForm.last_name || '?').charAt(0)}</>
                }
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editForm.first_name || 'Nome'} {editForm.last_name || 'Cognome'}</p>
                <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editForm.email || 'email'}</p>
                <span style={{ display: 'inline-block', marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 8px', borderRadius: 4, background: `${roleColor(editForm.role)}20`, color: roleColor(editForm.role), border: `1px solid ${roleColor(editForm.role)}40` }}>
                  {editForm.role}
                </span>
              </div>
            </div>

            <div style={{ borderBottom: '1px solid var(--line)' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Nome" value={editForm.first_name} onChange={v => setEditForm(p => ({ ...p, first_name: v }))} icon={<User className="w-3.5 h-3.5" />} />
              <FormField label="Cognome" value={editForm.last_name} onChange={v => setEditForm(p => ({ ...p, last_name: v }))} icon={<User className="w-3.5 h-3.5" />} />
            </div>

            <FormField label="Email" type="email" value={editForm.email} onChange={v => setEditForm(p => ({ ...p, email: v }))} icon={<Mail className="w-3.5 h-3.5" />} />
            {editForm.email !== editingUser.email && (
              <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(208,0,58,0.08)', border: '1px solid rgba(208,0,58,0.2)', fontSize: '11px', color: 'var(--red2)', lineHeight: 1.5 }}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 marginTop 2" style={{ marginTop: 2 }} />
                <span>La modifica dell'email aggiornerà le credenziali di accesso. L'utente dovrà usare la nuova email per il login.</span>
              </div>
            )}

            {canEditRoles && (
              <RoleSelect value={editForm.role} onChange={v => setEditForm(p => ({ ...p, role: v }))} />
            )}

            {editingUser.id !== currentUser?.id && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: 4 }}>Stato Account</p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: editForm.is_active ? 'var(--green)' : 'var(--red2)' }}>
                    {editForm.is_active ? 'Attivo' : 'Disattivato'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(p => ({ ...p, is_active: !p.is_active }))}
                  style={{
                    position: 'relative',
                    width: 44,
                    height: 24,
                    borderRadius: 999,
                    background: editForm.is_active ? 'var(--green)' : 'rgba(255,255,255,0.1)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  <span style={{ position: 'absolute', top: 4, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', left: editForm.is_active ? '24px' : '4px' }} />
                </button>
              </div>
            )}

            <FormField label="URL Avatar (opzionale)" value={editForm.avatar_url} onChange={v => setEditForm(p => ({ ...p, avatar_url: v }))} placeholder="https://..." icon={<Camera className="w-3.5 h-3.5" />} />

            <div style={{ paddingTop: 8 }}>
              <button onClick={handleUpdate} disabled={submitting} style={{ width: '100%', padding: '12px 16px', background: 'var(--red2)', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', cursor: 'pointer', opacity: submitting ? 0.6 : 1, transition: 'opacity 0.15s' }}>
                {submitting ? 'SALVATAGGIO IN CORSO...' : 'SALVA MODIFICHE'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Reset Password Modal ─────────────────────────────────── */}
      {resetUser && (
        <Modal title="Reset Password" subtitle={`${resetUser.first_name} ${resetUser.last_name}`} onClose={() => setResetUser(null)}>
          <div className="space-y-4">
            <div style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 8, background: 'var(--panel2)', border: '1px solid var(--line)', alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', color: 'white', background: `linear-gradient(135deg, ${roleColor(resetUser.role)} 0%, ${roleColor(resetUser.role)}88 100%)` }}>
                {(resetUser.first_name || '').charAt(0)}{(resetUser.last_name || '').charAt(0)}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{resetUser.first_name} {resetUser.last_name}</p>
                <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: 2 }}>{resetUser.email}</p>
              </div>
            </div>
            <FormField label="Nuova Password" type="password" value={newPassword} onChange={setNewPassword} placeholder="Min. 6 caratteri" icon={<Key className="w-3.5 h-3.5" />} />
            <div style={{ paddingTop: 8 }}>
              <button onClick={handleResetPassword} disabled={submitting} style={{ width: '100%', padding: '12px 16px', background: 'var(--red2)', color: 'white', border: 'none', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', cursor: 'pointer', opacity: submitting ? 0.6 : 1, transition: 'opacity 0.15s' }}>
                {submitting ? 'RESET IN CORSO...' : 'RESET PASSWORD'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Confirmation Dialog ──────────────────────────────────── */}
      {confirmAction && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', cursor: 'pointer' }} onClick={() => setConfirmAction(null)} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 400, borderRadius: 14, padding: 24, background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(208,0,58,0.1)', border: '1px solid rgba(208,0,58,0.2)' }}>
                <AlertCircle className="w-5 h-5" style={{ color: 'var(--red2)' }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Conferma Operazione</h3>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7, marginBottom: 20, whiteSpace: 'pre-line' }}>
              {confirmAction.message}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setConfirmAction(null)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)', cursor: 'pointer', transition: 'opacity 0.15s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7' }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}>
                Annulla
              </button>
              <button onClick={confirmAction.onConfirm} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, background: 'var(--red2)', color: 'white', border: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', cursor: 'pointer', transition: 'opacity 0.15s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.8' }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}>
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── USER CARD COMPONENT ──────────────────────────────────────────────────────

function UserCard({ user, isPartner, canResetPw, isSelf, delay, expanded, onToggle, onEdit, onToggleActive, onResetPassword }: {
  user: Profile
  isPartner: boolean
  canResetPw: boolean
  isSelf: boolean
  delay: number
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onToggleActive: () => void
  onResetPassword: () => void
}) {
  const color = roleColor(user.role)

  return (
    <div
      data-user-card
      onClick={onToggle}
      style={{
        background: 'var(--panel-solid)',
        border: `1px solid ${expanded ? 'var(--red2)' : 'var(--line)'}`,
        borderRadius: 14,
        padding: 16,
        opacity: user.is_active ? 1 : 0.7,
        position: 'relative',
        cursor: 'pointer',
        animation: `fadeIn 0.3s ease-out ${delay}ms forwards`,
        animationFillMode: 'both',
        transition: 'border-color 0.2s ease, background 0.15s ease',
      }}
      onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'var(--panel2)' }}
      onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'var(--panel-solid)' }}
    >
      {/* Status indicator */}
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: user.is_active ? 'var(--green)' : 'var(--red2)',
          }}
        />
      </div>

      {/* Avatar + Info */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: 'bold',
            color: 'white',
            flexShrink: 0,
            background: `linear-gradient(135deg, ${color} 0%, ${color}88 100%)`,
          }}
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'cover' }} />
          ) : (
            <>{(user.first_name || '').charAt(0)}{(user.last_name || '').charAt(0)}</>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.first_name} {user.last_name}
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.email}
          </p>
        </div>
      </div>

      {/* Role badge + status */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            fontWeight: 500,
            padding: '3px 7px',
            borderRadius: 4,
            background: `${color}20`,
            color,
            border: `1px solid ${color}40`,
          }}
        >
          {user.role}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '3px 7px',
            borderRadius: 4,
            background: user.is_active ? 'rgba(56,210,125,0.15)' : 'rgba(208,0,58,0.15)',
            color: user.is_active ? 'var(--green)' : 'var(--red2)',
          }}
        >
          {user.is_active ? 'ATTIVO' : 'DISATTIVATO'}
        </span>
      </div>

      {/* Admin actions - hidden until expanded */}
      {isPartner && (
        <div
          style={{
            overflow: 'hidden',
            maxHeight: expanded ? 60 : 0,
            opacity: expanded ? 1 : 0,
            transition: 'max-height 0.2s ease, opacity 0.2s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--line)',
              justifyContent: 'flex-start',
            }}
          >
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontWeight: 500,
                color: 'var(--blue)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
            >
              <Edit3 className="w-3 h-3" />
              MODIFICA
            </button>
            {canResetPw && !isSelf && (
              <button
                onClick={e => { e.stopPropagation(); onResetPassword() }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  fontWeight: 500,
                  color: 'var(--yellow)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
              >
                <Key className="w-3 h-3" />
                PASSWORD
              </button>
            )}
            {!isSelf && (
              <button
                onClick={e => { e.stopPropagation(); onToggleActive() }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  fontWeight: 500,
                  color: user.is_active ? 'var(--red2)' : 'var(--green)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  marginLeft: 'auto',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
              >
                {user.is_active ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {user.is_active ? 'DISATTIVA' : 'RIATTIVA'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', cursor: 'pointer' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 448, maxHeight: '90vh', overflowY: 'auto', borderRadius: 14, background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'var(--panel-solid)', borderBottom: '1px solid var(--line)' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{title}</h3>
            {subtitle && <p style={{ fontSize: '10px', marginTop: 4, color: 'var(--muted)' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ padding: 8, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', transition: 'opacity 0.15s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7' }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}>
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div style={{ padding: '20px' }}>{children}</div>
      </div>
    </div>
  )
}

function FormField({ label, value, onChange, type = 'text', placeholder, icon }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; icon?: React.ReactNode
}) {
  return (
    <div>
      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, color: 'var(--muted)' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        {icon && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: icon ? '10px 12px 10px 32px' : '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--line)',
            background: 'var(--panel2)',
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: '13px',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text)' }}
          onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)' }}
        />
      </div>
    </div>
  )
}

const ROLE_DESCRIPTIONS: Partial<Record<AppRole, string>> = {
  'Super Admin': 'Accesso totale',
  'Admin': 'Direzione aziendale',
  'Senior PM': 'PM con autonomia estesa',
  'Project Manager': 'Gestione eventi',
  'Regista': 'Regia tecnica eventi',
  'Commerciale': 'Vendite e clienti',
  'Amministrazione': 'Contabilita e pagamenti',
}

function RoleSelect({ value, onChange }: { value: AppRole; onChange: (v: AppRole) => void }) {
  return (
    <div>
      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, color: 'var(--muted)' }}>Ruolo</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as AppRole)}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid var(--line)',
          background: 'var(--panel2)',
          color: 'var(--text)',
          fontFamily: 'inherit',
          fontSize: '13px',
          cursor: 'pointer',
          appearance: 'none',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--text)' }}
        onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)' }}
      >
        {APP_ROLES.map(r => (
          <option key={r} value={r}>
            {r}{ROLE_DESCRIPTIONS[r] ? ` — ${ROLE_DESCRIPTIONS[r]}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
