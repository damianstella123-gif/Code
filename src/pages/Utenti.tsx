import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Search,
  Shield,
  Lock,
  Unlock,
  Key,
  Edit3,
  X,
  Check,
  AlertCircle,
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

interface UserFormData {
  first_name: string
  last_name: string
  email: string
  password: string
  role: AppRole
}

const emptyForm: UserFormData = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  role: 'Junior Event Assistant',
}

export default function Utenti() {
  const currentUser = loadUser()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [resetUser, setResetUser] = useState<Profile | null>(null)
  const [formData, setFormData] = useState<UserFormData>(emptyForm)
  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
    if (isPartner) refresh()
    else setLoading(false)
  }, [isPartner, refresh])

  useEffect(() => {
    if (!error && !success) return
    const t = setTimeout(() => { setError(null); setSuccess(null) }, 4000)
    return () => clearTimeout(t)
  }, [error, success])

  const filtered = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    )
  })

  const handleCreate = async () => {
    if (!formData.first_name || !formData.last_name || !formData.email || !formData.password) {
      setError('Compila tutti i campi obbligatori')
      return
    }
    if (formData.password.length < 6) {
      setError('La password deve avere almeno 6 caratteri')
      return
    }
    setSubmitting(true)
    try {
      await adminCreateUser({
        email: formData.email,
        password: formData.password,
        first_name: formData.first_name,
        last_name: formData.last_name,
        role: formData.role,
      })
      setSuccess(`Utente ${formData.first_name} ${formData.last_name} creato`)
      setShowCreate(false)
      setFormData(emptyForm)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore creazione')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingUser) return
    setSubmitting(true)
    try {
      await adminUpdateUser({
        user_id: editingUser.id,
        first_name: formData.first_name,
        last_name: formData.last_name,
        role: formData.role,
      })
      setSuccess(`Utente aggiornato`)
      setEditingUser(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore aggiornamento')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (user: Profile) => {
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
      setSuccess(`Password resettata per ${resetUser.first_name}`)
      setResetUser(null)
      setNewPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore reset')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isPartner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(208,0,58,0.1)' }}>
          <Shield className="w-8 h-8" style={{ color: 'var(--red2)' }} />
        </div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Accesso negato</h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Solo i Partner possono gestire gli utenti.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Gestione Utenti</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {users.length} utenti registrati
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setFormData(emptyForm) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', boxShadow: 'var(--shadow-red)' }}
        >
          <Plus className="w-4 h-4" />
          Nuovo Utente
        </button>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(56,210,125,0.1)', color: 'var(--green)' }}>
          <Check className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Search */}
      <div className="relative" style={{ maxWidth: 360 }}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
        <input
          type="text"
          placeholder="Cerca per nome, email o ruolo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
        />
      </div>

      {/* Users list */}
      {loading ? (
        <div className="text-center py-12" style={{ color: 'var(--muted)' }}>Caricamento...</div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--line)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: 'var(--panel)' }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Utente</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider hidden md:table-cell" style={{ color: 'var(--muted)' }}>Ruolo</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider hidden lg:table-cell" style={{ color: 'var(--muted)' }}>Stato</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="transition-all hover:bg-white/[0.02]" style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: `linear-gradient(135deg, ${roleColor(u.role)} 0%, ${roleColor(u.role)}cc 100%)`, opacity: u.is_active ? 1 : 0.5 }}
                      >
                        {u.first_name.charAt(0)}{u.last_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: u.is_active ? 'var(--text)' : 'var(--muted)' }}>
                          {u.first_name} {u.last_name}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${roleColor(u.role)}20`, color: roleColor(u.role) }}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded" style={{
                      background: u.is_active ? 'rgba(56,210,125,0.1)' : 'rgba(208,0,58,0.1)',
                      color: u.is_active ? 'var(--green)' : 'var(--red2)',
                    }}>
                      {u.is_active ? 'Attivo' : 'Disattivato'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => { setEditingUser(u); setFormData({ first_name: u.first_name, last_name: u.last_name, email: u.email, password: '', role: u.role }) }}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-all"
                        title="Modifica"
                      >
                        <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                      </button>
                      <button
                        onClick={() => { setResetUser(u); setNewPassword('') }}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-all"
                        title="Reset password"
                      >
                        <Key className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => handleToggleActive(u)}
                          className="p-1.5 rounded-lg hover:bg-white/5 transition-all"
                          title={u.is_active ? 'Disattiva' : 'Riattiva'}
                        >
                          {u.is_active
                            ? <Lock className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
                            : <Unlock className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                          }
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--muted)' }}>
                    Nessun utente trovato
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal title="Nuovo Utente" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nome" value={formData.first_name} onChange={v => setFormData(p => ({ ...p, first_name: v }))} />
              <FormField label="Cognome" value={formData.last_name} onChange={v => setFormData(p => ({ ...p, last_name: v }))} />
            </div>
            <FormField label="Email" type="email" value={formData.email} onChange={v => setFormData(p => ({ ...p, email: v }))} />
            <FormField label="Password" type="password" value={formData.password} onChange={v => setFormData(p => ({ ...p, password: v }))} />
            <RoleSelect value={formData.role} onChange={v => setFormData(p => ({ ...p, role: v }))} />
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Creazione...' : 'Crea Utente'}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <Modal title={`Modifica: ${editingUser.first_name} ${editingUser.last_name}`} onClose={() => setEditingUser(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nome" value={formData.first_name} onChange={v => setFormData(p => ({ ...p, first_name: v }))} />
              <FormField label="Cognome" value={formData.last_name} onChange={v => setFormData(p => ({ ...p, last_name: v }))} />
            </div>
            <RoleSelect value={formData.role} onChange={v => setFormData(p => ({ ...p, role: v }))} />
            <button
              onClick={handleUpdate}
              disabled={submitting}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Salvataggio...' : 'Salva Modifiche'}
            </button>
          </div>
        </Modal>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <Modal title={`Reset Password: ${resetUser.first_name} ${resetUser.last_name}`} onClose={() => setResetUser(null)}>
          <div className="space-y-4">
            <FormField label="Nuova Password" type="password" value={newPassword} onChange={setNewPassword} placeholder="Min. 6 caratteri" />
            <button
              onClick={handleResetPassword}
              disabled={submitting}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Reset...' : 'Reset Password'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5"><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
      />
    </div>
  )
}

function RoleSelect({ value, onChange }: { value: AppRole; onChange: (v: AppRole) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--muted)' }}>Ruolo</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as AppRole)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none appearance-none"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
      >
        {APP_ROLES.map(r => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </div>
  )
}
