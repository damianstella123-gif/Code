import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogIn, Shield, Briefcase, Wrench, DollarSign, TrendingUp, Truck } from 'lucide-react'
import { users } from '@/data/users'
import { saveUser } from '@/lib/auth'
import type { User } from '@/data/users'

const ruoloIcon: Record<string, React.ElementType> = {
  Admin: Shield,
  Manager: Briefcase,
  Operativo: Wrench,
  Finance: DollarSign,
  Commerciale: TrendingUp,
  Fornitore: Truck,
}

const ruoloColor: Record<string, string> = {
  Admin: 'var(--red2)',
  Manager: 'var(--blue)',
  Finance: 'var(--green)',
  Commerciale: 'var(--yellow)',
  Operativo: 'var(--muted)',
  Fornitore: '#a0aec0',
}

const ruoloDesc: Record<string, string> = {
  Admin: 'Accesso completo a tutto il sistema',
  Manager: 'Gestione eventi, task e team',
  Operativo: 'Task assegnati e calendario',
  Finance: 'Budget, report e amministrazione',
  Commerciale: 'CRM, clienti e opportunita',
  Fornitore: 'Attivita e task collegati',
}

export default function Login() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<User | null>(null)
  const [open, setOpen] = useState(false)

  const handleLogin = () => {
    if (!selected) return
    saveUser(selected)
    navigate('/dashboard')
  }

  const RuoloIconComp = selected ? (ruoloIcon[selected.ruolo] ?? Briefcase) : null

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 app-background"
      style={{
        background: 'linear-gradient(135deg, var(--bg) 0%, rgba(208, 0, 58, 0.05) 50%, var(--bg) 100%)',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4"
            style={{
              background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
              boxShadow: 'var(--shadow-red-lg)',
            }}
          >
            <span className="text-3xl font-bold text-white">S</span>
          </div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>
            SIMMETRIA<span style={{ color: 'var(--red2)' }}> HUB</span>
          </h1>
          <p className="mt-2" style={{ color: 'var(--muted)' }}>
            Accedi come utente demo
          </p>
        </div>

        {/* Card */}
        <div
          className="panel p-6 space-y-5"
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
              Seleziona utente
            </label>

            {/* Custom dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left"
                style={{
                  background: 'var(--bg)',
                  border: `1px solid ${open ? 'var(--red2)' : 'var(--line)'}`,
                  color: 'var(--text)',
                }}
              >
                {selected ? (
                  <>
                    <img
                      src={selected.avatar}
                      alt={selected.nome}
                      className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>
                        {selected.nome}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                        {selected.email}
                      </p>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                      style={{
                        background: `${ruoloColor[selected.ruolo]}20`,
                        color: ruoloColor[selected.ruolo],
                      }}
                    >
                      {selected.ruolo}
                    </span>
                  </>
                ) : (
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>
                    Scegli un dipendente...
                  </span>
                )}
                <ChevronDown
                  className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--muted)' }}
                />
              </button>

              {open && (
                <div
                  className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl overflow-hidden overflow-y-auto"
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    maxHeight: '320px',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                  }}
                >
                  {users.map(user => {
                    const Icon = ruoloIcon[user.ruolo] ?? Briefcase
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setSelected(user)
                          setOpen(false)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-white/5"
                        style={{
                          borderBottom: '1px solid var(--line)',
                          background: selected?.id === user.id ? 'rgba(208, 0, 58, 0.1)' : 'transparent',
                        }}
                      >
                        <img
                          src={user.avatar}
                          alt={user.nome}
                          className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>
                            {user.nome}
                          </p>
                          <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                            {user.reparto} · {user.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Icon className="w-3.5 h-3.5" style={{ color: ruoloColor[user.ruolo] }} />
                          <span
                            className="text-xs"
                            style={{ color: ruoloColor[user.ruolo] }}
                          >
                            {user.ruolo}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Selected user role info */}
          {selected && (
            <div
              className="flex items-center gap-3 p-4 rounded-xl animate-fade-in"
              style={{ background: `${ruoloColor[selected.ruolo]}10`, border: `1px solid ${ruoloColor[selected.ruolo]}30` }}
            >
              {RuoloIconComp && <RuoloIconComp className="w-5 h-5 flex-shrink-0" style={{ color: ruoloColor[selected.ruolo] }} />}
              <div>
                <p className="text-sm font-medium" style={{ color: ruoloColor[selected.ruolo] }}>
                  {selected.ruolo}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {ruoloDesc[selected.ruolo]}
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            disabled={!selected}
            className="w-full py-3 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all"
            style={{
              background: selected
                ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                : 'var(--panel2)',
              boxShadow: selected ? 'var(--shadow-red)' : 'none',
              color: selected ? 'white' : 'var(--muted)',
              cursor: selected ? 'pointer' : 'not-allowed',
              opacity: selected ? 1 : 0.5,
            }}
          >
            <LogIn className="w-4 h-4" />
            Accedi come {selected?.nome.split(' ')[0] ?? '...'}
          </button>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--muted)' }}>
          Ambiente demo — nessun dato reale
        </p>
      </div>
    </div>
  )
}
