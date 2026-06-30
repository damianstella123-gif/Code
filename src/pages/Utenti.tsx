import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
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
  Users,
  Filter,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
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
    case 'Partner': return 'var(--red2)'
    case 'Project Manager': return 'var(--blue)'
    case 'Event Coordinator': return '#38d27d'
    case 'Event Assistant': return 'var(--yellow)'
    case 'Junior Event Assistant': return 'var(--muted)'
    case 'Amministrazione': return '#38d27d'
    case 'Production Manager': return 'var(--blue)'
    case 'Digital Strategist': return 'var(--yellow)'
    default: return 'var(--muted)'
  }
}

type FilterStato = 'Tutti' | 'attivo' | 'disattivato'

const STATO_FILTERS: { id: FilterStato; label: string }[] = [
  { id: 'Tutti', label: 'Tutti' },
  { id: 'attivo', label: 'Attivi' },
  { id: 'disattivato', label: 'Disattivati' },
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
  role: 'Junior Event Assistant',
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
  const [editForm, setEditForm] = useState<EditFormData>({ first_name: '', last_name: '', email: '', role: 'Junior Event Assistant', is_active: true, avatar_url: '' })
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null)

  const isPartner = currentUser?.role === 'Partner'

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(208,0,58,0.12)' }}>
            <Users className="w-5 h-5" style={{ color: 'var(--red2)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Team</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {activeCount} attivi &middot; {inactiveCount} disattivati &middot; {users.length} totali
            </p>
          </div>
        </div>
        {isPartner && (
          <button
            onClick={() => { setShowCreate(true); setCreateForm(emptyCreateForm) }}
            className="btn-primary flex items-center gap-2 !px-5 !py-2.5 text-sm"
          >
            <Plus className="w-4 h-4" />
            Nuovo Utente
          </button>
        )}
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm animate-fade-in" style={{ background: 'rgba(208,0,58,0.08)', border: '1px solid rgba(208,0,58,0.2)', color: 'var(--red2)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm animate-fade-in" style={{ background: 'rgba(56,210,125,0.08)', border: '1px solid rgba(56,210,125,0.2)', color: 'var(--green)' }}>
          <Check className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">{success}</span>
        </div>
      )}

      {/* Filters bar */}
      <div className="panel p-4 animate-fade-in" style={{ animationDelay: '50ms' }}>
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full lg:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              placeholder="Cerca nel team..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input w-full !pl-10 !py-2.5 text-sm"
            />
          </div>

          {/* Role filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value as 'Tutti' | AppRole)}
              className="input !py-2 !px-3 text-xs appearance-none cursor-pointer"
            >
              <option value="Tutti">Tutti i ruoli</option>
              {APP_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1.5">
            {STATO_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilterStato(f.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: filterStato === f.id ? 'rgba(208,0,58,0.12)' : 'transparent',
                  color: filterStato === f.id ? 'var(--red2)' : 'var(--muted)',
                  border: `1px solid ${filterStato === f.id ? 'rgba(208,0,58,0.25)' : 'var(--line)'}`,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* User Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="panel p-5" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl skeleton" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded skeleton" />
                  <div className="h-3 w-24 rounded skeleton" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel p-16 text-center animate-fade-in">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: 'var(--panel2)' }}>
              <Users className="w-6 h-6" style={{ color: 'var(--muted)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Nessun utente trovato</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Prova a modificare i filtri di ricerca</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((u, i) => (
            <UserCard
              key={u.id}
              user={u}
              isPartner={isPartner}
              isSelf={u.id === currentUser?.id}
              delay={i * 40}
              onEdit={() => openEdit(u)}
              onToggleActive={() => handleToggleActive(u)}
              onResetPassword={() => { setResetUser(u); setNewPassword('') }}
            />
          ))}
        </div>
      )}

      {/* ─── Create Modal ─────────────────────────────────────────── */}
      {showCreate && (
        <Modal title="Nuovo Utente" subtitle="Crea un nuovo account" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nome" value={createForm.first_name} onChange={v => setCreateForm(p => ({ ...p, first_name: v }))} placeholder="Mario" />
              <FormField label="Cognome" value={createForm.last_name} onChange={v => setCreateForm(p => ({ ...p, last_name: v }))} placeholder="Rossi" />
            </div>
            <FormField label="Email" type="email" value={createForm.email} onChange={v => setCreateForm(p => ({ ...p, email: v }))} placeholder="mario@simmetria.it" icon={<Mail className="w-3.5 h-3.5" />} />
            <FormField label="Password" type="password" value={createForm.password} onChange={v => setCreateForm(p => ({ ...p, password: v }))} placeholder="Min. 6 caratteri" icon={<Key className="w-3.5 h-3.5" />} />
            <RoleSelect value={createForm.role} onChange={v => setCreateForm(p => ({ ...p, role: v }))} />
            <div className="pt-2">
              <button onClick={handleCreate} disabled={submitting} className="btn-primary w-full !py-3 text-sm flex items-center justify-center gap-2" style={{ opacity: submitting ? 0.6 : 1 }}>
                <Plus className="w-4 h-4" />
                {submitting ? 'Creazione in corso...' : 'Crea Utente'}
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
            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-base font-bold text-white flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${roleColor(editForm.role)} 0%, ${roleColor(editForm.role)}88 100%)`, boxShadow: `0 4px 16px ${roleColor(editForm.role)}25` }}
              >
                {editForm.avatar_url
                  ? <img src={editForm.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" />
                  : <>{(editForm.first_name || '?').charAt(0)}{(editForm.last_name || '?').charAt(0)}</>
                }
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{editForm.first_name || 'Nome'} {editForm.last_name || 'Cognome'}</p>
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>{editForm.email || 'email'}</p>
                <span className="inline-block mt-1.5 badge !text-[10px]" style={{ background: `${roleColor(editForm.role)}15`, color: roleColor(editForm.role), border: `1px solid ${roleColor(editForm.role)}30` }}>
                  {editForm.role}
                </span>
              </div>
            </div>

            <div className="divider" />

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nome" value={editForm.first_name} onChange={v => setEditForm(p => ({ ...p, first_name: v }))} icon={<User className="w-3.5 h-3.5" />} />
              <FormField label="Cognome" value={editForm.last_name} onChange={v => setEditForm(p => ({ ...p, last_name: v }))} icon={<User className="w-3.5 h-3.5" />} />
            </div>

            <FormField label="Email" type="email" value={editForm.email} onChange={v => setEditForm(p => ({ ...p, email: v }))} icon={<Mail className="w-3.5 h-3.5" />} />
            {editForm.email !== editingUser.email && (
              <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg text-xs" style={{ background: 'rgba(208,0,58,0.06)', border: '1px solid rgba(208,0,58,0.15)', color: 'var(--red2)' }}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span style={{ lineHeight: '1.5' }}>La modifica dell'email aggiornerà le credenziali di accesso. L'utente dovrà usare la nuova email per il login.</span>
              </div>
            )}

            <RoleSelect value={editForm.role} onChange={v => setEditForm(p => ({ ...p, role: v }))} />

            {editingUser.id !== currentUser?.id && (
              <div className="flex items-center justify-between px-4 py-3.5 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--muted)' }}>Stato Account</p>
                  <p className="text-sm font-semibold" style={{ color: editForm.is_active ? 'var(--green)' : 'var(--red2)' }}>
                    {editForm.is_active ? 'Attivo' : 'Disattivato'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(p => ({ ...p, is_active: !p.is_active }))}
                  className="relative w-11 h-6 rounded-full transition-all duration-200"
                  style={{ background: editForm.is_active ? 'var(--green)' : 'rgba(255,255,255,0.12)' }}
                >
                  <span className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200" style={{ left: editForm.is_active ? '24px' : '4px' }} />
                </button>
              </div>
            )}

            <FormField label="URL Avatar (opzionale)" value={editForm.avatar_url} onChange={v => setEditForm(p => ({ ...p, avatar_url: v }))} placeholder="https://..." icon={<Camera className="w-3.5 h-3.5" />} />

            <div className="pt-1">
              <button onClick={handleUpdate} disabled={submitting} className="btn-primary w-full !py-3 text-sm flex items-center justify-center gap-2" style={{ opacity: submitting ? 0.6 : 1 }}>
                <Check className="w-4 h-4" />
                {submitting ? 'Salvataggio in corso...' : 'Salva Modifiche'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Reset Password Modal ─────────────────────────────────── */}
      {resetUser && (
        <Modal title="Reset Password" subtitle={`${resetUser.first_name} ${resetUser.last_name}`} onClose={() => setResetUser(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${roleColor(resetUser.role)} 0%, ${roleColor(resetUser.role)}88 100%)` }}>
                {(resetUser.first_name || '').charAt(0)}{(resetUser.last_name || '').charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{resetUser.first_name} {resetUser.last_name}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{resetUser.email}</p>
              </div>
            </div>
            <FormField label="Nuova Password" type="password" value={newPassword} onChange={setNewPassword} placeholder="Min. 6 caratteri" icon={<Key className="w-3.5 h-3.5" />} />
            <div className="pt-1">
              <button onClick={handleResetPassword} disabled={submitting} className="btn-primary w-full !py-3 text-sm flex items-center justify-center gap-2" style={{ opacity: submitting ? 0.6 : 1 }}>
                <Key className="w-4 h-4" />
                {submitting ? 'Reset in corso...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Confirmation Dialog ──────────────────────────────────── */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmAction(null)} />
          <div className="relative w-full max-w-sm rounded-2xl p-6 animate-fade-in" style={{ background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(208,0,58,0.1)', border: '1px solid rgba(208,0,58,0.2)' }}>
                <AlertCircle className="w-5 h-5" style={{ color: 'var(--red2)' }} />
              </div>
              <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>Conferma Operazione</h3>
            </div>
            <p className="text-sm whitespace-pre-line mb-6" style={{ color: 'var(--muted)', lineHeight: '1.7' }}>
              {confirmAction.message}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)} className="btn-secondary flex-1 !py-2.5 text-sm text-center">
                Annulla
              </button>
              <button onClick={confirmAction.onConfirm} className="btn-primary flex-1 !py-2.5 text-sm">
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

function UserCard({ user, isPartner, isSelf, delay, onEdit, onToggleActive, onResetPassword }: {
  user: Profile
  isPartner: boolean
  isSelf: boolean
  delay: number
  onEdit: () => void
  onToggleActive: () => void
  onResetPassword: () => void
}) {
  const color = roleColor(user.role)

  return (
    <div
      className="panel p-5 hover-card animate-fade-in relative group"
      style={{ animationDelay: `${delay}ms`, opacity: user.is_active ? 1 : 0.7 }}
    >
      {/* Status indicator */}
      <div className="absolute top-4 right-4">
        <span
          className="w-2.5 h-2.5 rounded-full block"
          style={{ background: user.is_active ? 'var(--green)' : 'var(--red2)', boxShadow: `0 0 8px ${user.is_active ? 'var(--green)' : 'var(--red2)'}60` }}
        />
      </div>

      {/* Avatar + Info */}
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${color} 0%, ${color}88 100%)`,
            boxShadow: `0 4px 12px ${color}25`,
          }}
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" />
          ) : (
            <>{(user.first_name || '').charAt(0)}{(user.last_name || '').charAt(0)}</>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
            {user.first_name} {user.last_name}
          </h3>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>
            {user.email}
          </p>
        </div>
      </div>

      {/* Role badge + status */}
      <div className="flex items-center gap-2 mt-4">
        <span
          className="badge"
          style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
        >
          {user.role}
        </span>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded"
          style={{
            background: user.is_active ? 'rgba(56,210,125,0.1)' : 'rgba(208,0,58,0.1)',
            color: user.is_active ? 'var(--green)' : 'var(--red2)',
          }}
        >
          {user.is_active ? 'Attivo' : 'Disattivato'}
        </span>
      </div>

      {/* Partner-only actions */}
      {isPartner && (
        <div
          className="flex items-center gap-1 mt-4 pt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <button onClick={onEdit} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/[0.06]" style={{ color: 'var(--blue)' }}>
            <Edit3 className="w-3.5 h-3.5" />
            Modifica
          </button>
          <button onClick={onResetPassword} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/[0.06]" style={{ color: 'var(--yellow)' }}>
            <Key className="w-3.5 h-3.5" />
            Password
          </button>
          {!isSelf && (
            <button onClick={onToggleActive} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-white/[0.06] ml-auto" style={{ color: user.is_active ? 'var(--red2)' : 'var(--green)' }}>
              {user.is_active ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              {user.is_active ? 'Disattiva' : 'Riattiva'}
            </button>
          )}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl max-h-[90vh] overflow-y-auto animate-fade-in" style={{ background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
          <div>
            <h3 className="text-base font-bold" style={{ color: 'var(--text)' }}>{title}</h3>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition-all hover:bg-white/[0.06]">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function FormField({ label, value, onChange, type = 'text', placeholder, icon }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; icon?: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }}>{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="input w-full text-sm"
          style={{ paddingLeft: icon ? '2.25rem' : undefined }}
        />
      </div>
    </div>
  )
}

function RoleSelect({ value, onChange }: { value: AppRole; onChange: (v: AppRole) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--muted)' }}>Ruolo</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as AppRole)}
        className="input w-full text-sm appearance-none cursor-pointer"
      >
        {APP_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>
  )
}
