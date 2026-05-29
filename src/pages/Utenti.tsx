import { useState, useMemo } from 'react'
import {
  Search,
  Filter,
  User,
  Mail,
  Briefcase,
  CheckSquare,
  Calendar,
  ChevronDown,
  X,
} from 'lucide-react'
import { users } from '@/data/users'
import { tasks } from '@/data/tasks'
import { events } from '@/data/events'
import type { User as UserType } from '@/data/users'

const RUOLI = ['Tutti', 'Admin', 'Manager', 'Operativo', 'Finance', 'Commerciale', 'Fornitore']
const REPARTI = ['Tutti', 'Direzione', 'Marketing', 'Eventi', 'Amministrazione', 'Vendite', 'Logistica', 'HR', 'Esterno']
const STATI = ['Tutti', 'attivo', 'ferie', 'malattia']

function statoColor(stato: string) {
  switch (stato) {
    case 'attivo': return 'var(--green)'
    case 'ferie': return 'var(--yellow)'
    case 'malattia': return 'var(--red2)'
    default: return 'var(--muted)'
  }
}

function statoLabel(stato: string) {
  switch (stato) {
    case 'attivo': return 'Attivo'
    case 'ferie': return 'Ferie'
    case 'malattia': return 'Malattia'
    default: return stato
  }
}

function ruoloColor(ruolo: string) {
  switch (ruolo) {
    case 'Admin': return 'var(--red2)'
    case 'Manager': return 'var(--blue)'
    case 'Finance': return 'var(--green)'
    case 'Commerciale': return 'var(--yellow)'
    case 'Operativo': return 'var(--muted)'
    case 'Fornitore': return 'var(--gray)'
    default: return 'var(--muted)'
  }
}

interface ProfileModalProps {
  user: UserType
  onClose: () => void
}

function ProfileModal({ user, onClose }: ProfileModalProps) {
  const userTasks = tasks.filter(t => t.assegnatario === user.id)
  const userEvents = events.filter(e => e.team.includes(user.id) || e.responsabile === user.id)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="relative h-32"
          style={{
            background: 'linear-gradient(135deg, var(--red) 0%, rgba(208, 0, 58, 0.4) 100%)',
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg transition-all hover:bg-white/10"
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <div
            className="absolute -bottom-10 left-6 w-20 h-20 rounded-xl overflow-hidden border-4"
            style={{ borderColor: 'var(--panel)' }}
          >
            <img src={user.avatar} alt={user.nome} className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Body */}
        <div className="pt-14 px-6 pb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
                {user.nome}
              </h2>
              <p className="mt-0.5" style={{ color: 'var(--muted)' }}>{user.email}</p>
            </div>
            <div className="flex gap-2 mt-1">
              <span
                className="text-xs px-3 py-1 rounded-full font-medium"
                style={{
                  background: `${ruoloColor(user.ruolo)}20`,
                  color: ruoloColor(user.ruolo),
                }}
              >
                {user.ruolo}
              </span>
              <span
                className="text-xs px-3 py-1 rounded-full font-medium"
                style={{
                  background: `${statoColor(user.stato)}20`,
                  color: statoColor(user.stato),
                }}
              >
                {statoLabel(user.stato)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="p-4 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>Reparto</p>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>{user.reparto}</p>
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>Ruolo</p>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>{user.ruolo}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6">
            {/* Task assegnati */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckSquare className="w-4 h-4" style={{ color: 'var(--red)' }} />
                <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>
                  Task Assegnati ({userTasks.length})
                </p>
              </div>
              <div className="space-y-2">
                {userTasks.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun task</p>
                ) : (
                  userTasks.slice(0, 4).map(task => (
                    <div
                      key={task.id}
                      className="p-2 rounded-lg text-xs"
                      style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium truncate" style={{ color: 'var(--text)' }}>
                          {task.titolo}
                        </span>
                        <span
                          className="ml-2 px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{
                            background: task.stato === 'completato'
                              ? 'rgba(56, 210, 125, 0.15)'
                              : task.stato === 'in_corso'
                              ? 'rgba(77, 180, 255, 0.15)'
                              : 'rgba(255, 194, 75, 0.15)',
                            color: task.stato === 'completato'
                              ? 'var(--green)'
                              : task.stato === 'in_corso'
                              ? 'var(--blue)'
                              : 'var(--yellow)',
                          }}
                        >
                          {task.stato === 'da_fare' ? 'Da fare' : task.stato === 'in_corso' ? 'In corso' : 'Fatto'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Eventi */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4" style={{ color: 'var(--red)' }} />
                <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>
                  Eventi Collegati ({userEvents.length})
                </p>
              </div>
              <div className="space-y-2">
                {userEvents.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun evento</p>
                ) : (
                  userEvents.slice(0, 4).map(evt => (
                    <div
                      key={evt.id}
                      className="p-2 rounded-lg text-xs"
                      style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}
                    >
                      <p className="font-medium truncate" style={{ color: 'var(--text)' }}>
                        {evt.nome}
                      </p>
                      <p className="mt-0.5" style={{ color: 'var(--muted)' }}>
                        {new Date(evt.dataInizio).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Utenti() {
  const [search, setSearch] = useState('')
  const [filterRuolo, setFilterRuolo] = useState('Tutti')
  const [filterReparto, setFilterReparto] = useState('Tutti')
  const [filterStato, setFilterStato] = useState('Tutti')
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const filtered = useMemo(() => {
    return users.filter(u => {
      const matchSearch = search === '' ||
        u.nome.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      const matchRuolo = filterRuolo === 'Tutti' || u.ruolo === filterRuolo
      const matchReparto = filterReparto === 'Tutti' || u.reparto === filterReparto
      const matchStato = filterStato === 'Tutti' || u.stato === filterStato
      return matchSearch && matchRuolo && matchReparto && matchStato
    })
  }, [search, filterRuolo, filterReparto, filterStato])

  const activeFilters = [filterRuolo, filterReparto, filterStato].filter(f => f !== 'Tutti').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>
            Utenti
          </h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            {filtered.length} di {users.length} dipendenti
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-xl flex-1"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Cerca per nome o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--text)' }}
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-all"
          style={{
            background: showFilters || activeFilters > 0
              ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
              : 'var(--panel)',
            border: '1px solid var(--line)',
            color: showFilters || activeFilters > 0 ? 'white' : 'var(--text)',
          }}
        >
          <Filter className="w-4 h-4" />
          Filtri
          {activeFilters > 0 && (
            <span className="bg-white/30 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {activeFilters}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Filter dropdowns */}
      {showFilters && (
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl animate-fade-in"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          {[
            { label: 'Ruolo', value: filterRuolo, setter: setFilterRuolo, options: RUOLI },
            { label: 'Reparto', value: filterReparto, setter: setFilterReparto, options: REPARTI },
            { label: 'Stato', value: filterStato, setter: setFilterStato, options: STATI },
          ].map(({ label, value, setter, options }) => (
            <div key={label}>
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>
                {label}
              </p>
              <div className="flex flex-wrap gap-2">
                {options.map(opt => (
                  <button
                    key={opt}
                    onClick={() => setter(opt)}
                    className="px-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{
                      background: value === opt
                        ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                        : 'var(--panel2)',
                      color: value === opt ? 'white' : 'var(--muted)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    {opt === 'attivo' ? 'Attivo' : opt === 'ferie' ? 'Ferie' : opt === 'malattia' ? 'Malattia' : opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User Grid */}
      {filtered.length === 0 ? (
        <div
          className="panel p-12 flex flex-col items-center justify-center"
          style={{ color: 'var(--muted)' }}
        >
          <User className="w-12 h-12 mb-3 opacity-30" />
          <p>Nessun utente trovato con i filtri selezionati</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((user, i) => {
            const userTasks = tasks.filter(t => t.assegnatario === user.id)
            const openTasks = userTasks.filter(t => t.stato !== 'completato').length
            const userEvents = events.filter(e => e.team.includes(user.id) || e.responsabile === user.id)

            return (
              <div
                key={user.id}
                className="panel hover-card p-5 animate-fade-in flex flex-col gap-4"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* Top row */}
                <div className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    <img
                      src={user.avatar}
                      alt={user.nome}
                      className="w-14 h-14 rounded-xl object-cover"
                    />
                    <div
                      className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2"
                      style={{
                        background: statoColor(user.stato),
                        borderColor: 'var(--panel)',
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate" style={{ color: 'var(--text)' }}>
                      {user.nome}
                    </h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                      <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                        {user.email}
                      </p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-md font-medium"
                        style={{
                          background: `${ruoloColor(user.ruolo)}20`,
                          color: ruoloColor(user.ruolo),
                        }}
                      >
                        {user.ruolo}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-md font-medium"
                        style={{
                          background: `${statoColor(user.stato)}15`,
                          color: statoColor(user.stato),
                        }}
                      >
                        {statoLabel(user.stato)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: 'var(--line)' }} />

                {/* Info row */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="flex items-center justify-center gap-1">
                      <Briefcase className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Reparto</p>
                    <p className="text-xs font-medium mt-0.5 truncate" style={{ color: 'var(--text)' }}>
                      {user.reparto}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center">
                      <CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Task Aperti</p>
                    <p
                      className="text-sm font-bold mt-0.5"
                      style={{ color: openTasks > 0 ? 'var(--red2)' : 'var(--green)' }}
                    >
                      {openTasks}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center">
                      <Calendar className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Eventi</p>
                    <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--blue)' }}>
                      {userEvents.length}
                    </p>
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={() => setSelectedUser(user)}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
                  style={{
                    background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
                    color: 'white',
                  }}
                >
                  Visualizza Profilo
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Profile Modal */}
      {selectedUser && (
        <ProfileModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  )
}
