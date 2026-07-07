import { useState, useEffect } from 'react'
import {
  Building2,
  Palette,
  ShieldCheck,
  Bell,
  Lock,
  Database,
  LayoutDashboard,
  Zap,
  RotateCcw,
  Check,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  Eye,
  EyeOff,
  AlertTriangle,
  Info,
  Trash2,
  Download,
  User,
  Key,
  FileWarning,
} from 'lucide-react'
import { loadUser, isAdmin } from '@/lib/auth'
import { useTheme, type ThemeMode } from '@/lib/theme'
import { supabase } from '@/lib/supabase'
import { fetchErrorLog, type ErrorLogEntry } from '@/lib/error-log'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppSettings {
  nomeAzienda: string
  emailAziendale: string
  telefono: string
  indirizzo: string
  sitoWeb: string
  timezone: string
  lingua: string
  logoTestuale: string
  coloreAccento: string
  coloreSecondario: string
  mostraLogoSidebar: boolean
  notificheEmail: boolean
  notifichePush: boolean
  notificheTask: boolean
  notificheEventi: boolean
  notificheWorkflow: boolean
  notificheBudget: boolean
  notificheFornitore: boolean
  frequenzaDigest: 'istantanea' | 'oraria' | 'giornaliera' | 'settimanale'
  layoutDashboard: 'compatto' | 'standard' | 'espanso'
  kpiVisibili: string[]
  widgetOrdinati: string[]
  mostraAvanzamentoWorkflow: boolean
  mostraCalendarioLaterale: boolean
  sessionTimeout: number
  richieciMFA: boolean
  logAccessi: boolean
  flyAbilitato: boolean
  flyPresenza: 'sempre' | 'hover' | 'nascosto'
  flyTono: 'professionale' | 'amichevole' | 'conciso'
  flyNotificheIntensita: 'alta' | 'media' | 'bassa'
  flyModalitaProattiva: boolean
  flySuggerimentiAutomatici: boolean
  flyRisposteVeloce: boolean
  flyFocusArea: string[]
}

const DEFAULT_SETTINGS: AppSettings = {
  nomeAzienda: 'Simmetria Events',
  emailAziendale: 'info@simmetria.it',
  telefono: '+39 02 1234 5678',
  indirizzo: 'Via Monte Napoleone 8, 20121 Milano',
  sitoWeb: 'www.simmetria.it',
  timezone: 'Europe/Rome',
  lingua: 'it',
  logoTestuale: 'SIMMETRIA HUB',
  coloreAccento: '#d0003a',
  coloreSecondario: '#ff315f',
  mostraLogoSidebar: true,
  notificheEmail: true,
  notifichePush: true,
  notificheTask: true,
  notificheEventi: true,
  notificheWorkflow: true,
  notificheBudget: true,
  notificheFornitore: false,
  frequenzaDigest: 'giornaliera',
  layoutDashboard: 'standard',
  kpiVisibili: ['eventi', 'task', 'fatturato', 'fornitori'],
  widgetOrdinati: ['kpi', 'eventi', 'task', 'calendario', 'workflow'],
  mostraAvanzamentoWorkflow: true,
  mostraCalendarioLaterale: true,
  sessionTimeout: 60,
  richieciMFA: false,
  logAccessi: true,
  flyAbilitato: true,
  flyPresenza: 'sempre',
  flyTono: 'amichevole',
  flyNotificheIntensita: 'media',
  flyModalitaProattiva: true,
  flySuggerimentiAutomatici: true,
  flyRisposteVeloce: true,
  flyFocusArea: ['task', 'workflow', 'budget'],
}

const SK = 'simmetria_settings'

export function loadSettings(): AppSettings {
  try { const r = localStorage.getItem(SK); return r ? { ...DEFAULT_SETTINGS, ...JSON.parse(r) } : DEFAULT_SETTINGS }
  catch { return DEFAULT_SETTINGS }
}
function saveSettings(s: AppSettings) { localStorage.setItem(SK, JSON.stringify(s)) }

// ─── Shared primitives ────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</label>
      {hint && <p className="text-xs" style={{ color: 'var(--muted)' }}>{hint}</p>}
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
      style={{
        background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)',
      }}
      onFocus={e => { e.target.style.borderColor = 'var(--red2)'; e.target.style.boxShadow = '0 0 0 3px rgba(208,0,58,0.08)' }}
      onBlur={e => { e.target.style.borderColor = 'var(--line)'; e.target.style.boxShadow = 'none' }}
    />
  )
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition-all appearance-none cursor-pointer"
      style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      className="relative flex-shrink-0 w-11 h-6 rounded-full transition-all"
      style={{
        background: checked ? 'var(--red2)' : 'var(--panel2)',
        border: `1px solid ${checked ? 'var(--red2)' : 'var(--line)'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        boxShadow: checked ? '0 0 12px rgba(208,0,58,0.3)' : 'none',
      }}>
      <div className="absolute top-0.5 transition-all rounded-full w-5 h-5 shadow-sm"
        style={{
          left: checked ? 'calc(100% - 22px)' : 2,
          background: 'white',
        }} />
    </button>
  )
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</p>
        {hint && <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{hint}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

function SectionCard({ icon: Icon, title, subtitle, children }: {
  icon: React.ElementType; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div className="animate-fade-in" style={{
      background: 'var(--panel-solid)',
      border: '1px solid var(--line)',
      borderRadius: 14,
      padding: 24,
    }}>
      <div className="flex items-start gap-4 mb-6">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(208,0,58,0.10)' }}>
          <Icon className="w-5 h-5" style={{ color: 'var(--red2)' }} />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-mono uppercase tracking-wide" style={{ color: 'var(--text)' }}>{title}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{subtitle}</p>
        </div>
      </div>
      <div style={{ borderColor: 'var(--line)' }} className="border-t mb-6" />
      {children}
    </div>
  )
}

function ChipGroup({ options, selected, onChange }: {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const active = selected.includes(o.value)
        return (
          <button key={o.value}
            onClick={() => onChange(active ? selected.filter(x => x !== o.value) : [...selected, o.value])}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: active ? 'rgba(208,0,58,0.10)' : 'var(--panel2)',
              color: active ? 'var(--red2)' : 'var(--muted)',
              border: `1px solid ${active ? 'rgba(208,0,58,0.35)' : 'var(--line)'}`,
            }}>
            {active && <Check className="w-3 h-3 inline mr-1 -mt-0.5" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function RadioGroup({ options, value, onChange }: {
  options: { value: string; label: string; desc?: string }[]
  value: string; onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      {options.map(o => {
        const active = value === o.value
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
            style={{
              background: active ? 'rgba(208,0,58,0.06)' : 'var(--panel2)',
              border: `1px solid ${active ? 'rgba(208,0,58,0.35)' : 'var(--line)'}`,
            }}>
            <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ border: `2px solid ${active ? 'var(--red2)' : 'var(--muted)'}` }}>
              {active && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--red2)' }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{o.label}</p>
              {o.desc && <p className="text-xs" style={{ color: 'var(--muted)' }}>{o.desc}</p>}
            </div>
            {active && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--red2)' }} />}
          </button>
        )
      })}
    </div>
  )
}

function SliderInput({ value, onChange, min, max, step = 1, label }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: (v: number) => string
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>{min} min</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--red2)' }}>{label(value)}</span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>{max} min</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--red2) 0%, var(--red2) ${((value - min) / (max - min)) * 100}%, var(--panel2) ${((value - min) / (max - min)) * 100}%, var(--panel2) 100%)`,
          outline: 'none',
        }}
      />
    </div>
  )
}

// ─── PERSONAL SECTIONS ───────────────────────────────────────────────────────

function ProfiloPersonale() {
  const user = loadUser()
  return (
    <SectionCard icon={User} title="Il mio Profilo" subtitle="Informazioni personali del tuo account">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Nome">
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            {user?.first_name || '-'}
          </div>
        </Field>
        <Field label="Cognome">
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            {user?.last_name || '-'}
          </div>
        </Field>
        <Field label="Email">
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            {user?.email || '-'}
          </div>
        </Field>
        <Field label="Ruolo">
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
            {user?.role || '-'}
          </div>
        </Field>
      </div>
      <div className="flex items-center gap-2 p-3 rounded-xl mt-2" style={{ background: 'rgba(77,180,255,0.06)', border: '1px solid rgba(77,180,255,0.15)' }}>
        <Info className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--blue)' }} />
        <p className="text-xs" style={{ color: 'var(--blue)' }}>
          Per modificare nome, cognome o email contatta un amministratore.
        </p>
      </div>
    </SectionCard>
  )
}

function CambioPasswordSection() {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleChangePassword() {
    if (!currentPw || !newPw || !confirmPw) {
      setErrorMsg('Compila tutti i campi')
      setStatus('error')
      return
    }
    if (newPw.length < 6) {
      setErrorMsg('La nuova password deve avere almeno 6 caratteri')
      setStatus('error')
      return
    }
    if (newPw !== confirmPw) {
      setErrorMsg('Le password non corrispondono')
      setStatus('error')
      return
    }
    setStatus('loading')
    setErrorMsg('')

    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    } else {
      setStatus('success')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <SectionCard icon={Key} title="Cambio Password" subtitle="Modifica la tua password di accesso">
      <div className="space-y-4 max-w-md">
        <Field label="Password attuale">
          <div className="relative">
            <input type={showCurrent ? 'text' : 'password'} value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              placeholder="Inserisci password attuale"
              className="w-full px-4 py-3 pr-11 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
            <button onClick={() => setShowCurrent(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
              {showCurrent ? <EyeOff className="w-4 h-4" style={{ color: 'var(--muted)' }} /> : <Eye className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
            </button>
          </div>
        </Field>
        <Field label="Nuova password" hint="Minimo 6 caratteri">
          <div className="relative">
            <input type={showNew ? 'text' : 'password'} value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="Nuova password"
              className="w-full px-4 py-3 pr-11 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
            <button onClick={() => setShowNew(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
              {showNew ? <EyeOff className="w-4 h-4" style={{ color: 'var(--muted)' }} /> : <Eye className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
            </button>
          </div>
        </Field>
        <Field label="Conferma nuova password">
          <input type="password" value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            placeholder="Ripeti nuova password"
            className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
          />
        </Field>

        {status === 'error' && errorMsg && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs" style={{ background: 'rgba(208,0,58,0.08)', border: '1px solid rgba(208,0,58,0.2)', color: 'var(--red2)' }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {errorMsg}
          </div>
        )}
        {status === 'success' && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs" style={{ background: 'rgba(56,210,125,0.08)', border: '1px solid rgba(56,210,125,0.2)', color: 'var(--green)' }}>
            <Check className="w-3.5 h-3.5 flex-shrink-0" />
            Password aggiornata con successo
          </div>
        )}

        <button onClick={handleChangePassword} disabled={status === 'loading'}
          className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-mono uppercase tracking-wide transition-all"
          style={{
            background: status === 'loading' ? 'var(--panel)' : 'var(--red2)',
            color: status === 'loading' ? 'var(--muted)' : 'white',
            opacity: status === 'loading' ? 0.6 : 1,
          }}>
          <Key className="w-4 h-4" />
          {status === 'loading' ? 'Aggiornamento...' : 'Aggiorna'}
        </button>
      </div>
    </SectionCard>
  )
}

function TemaSection() {
  const { theme, setTheme } = useTheme()

  const options: { mode: ThemeMode; icon: React.ElementType; label: string; desc: string }[] = [
    { mode: 'light', icon: Sun, label: 'Light', desc: 'Interfaccia chiara, ideale per ambienti luminosi' },
    { mode: 'dark', icon: Moon, label: 'Dark', desc: 'Interfaccia scura, riduce l\'affaticamento visivo' },
    { mode: 'system', icon: Monitor, label: 'Sistema', desc: 'Segue le preferenze del sistema operativo' },
  ]

  return (
    <SectionCard icon={Sun} title="Tema" subtitle="Aspetto visivo dell'interfaccia">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {options.map(opt => {
          const active = theme === opt.mode
          return (
            <button
              key={opt.mode}
              onClick={() => setTheme(opt.mode)}
              className="p-5 rounded-xl text-left transition-all"
              style={{
                background: active ? 'rgba(208,0,58,0.06)' : 'var(--panel2)',
                border: `2px solid ${active ? 'var(--red2)' : 'var(--line)'}`,
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: active ? 'rgba(208,0,58,0.12)' : 'var(--bg)' }}>
                  <opt.icon className="w-5 h-5" style={{ color: active ? 'var(--red2)' : 'var(--muted)' }} />
                </div>
                {active && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center ml-auto"
                    style={{ background: 'var(--red2)' }}>
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{opt.label}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{opt.desc}</p>
            </button>
          )
        })}
      </div>
    </SectionCard>
  )
}

function NotifichePersonali({ s, upd }: { s: AppSettings; upd: (p: Partial<AppSettings>) => void }) {
  return (
    <SectionCard icon={Bell} title="Notifiche" subtitle="Le tue preferenze di notifica">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Canali</p>
          <div>
            <ToggleRow label="Notifiche email" hint="Digest periodici via email" checked={s.notificheEmail} onChange={v => upd({ notificheEmail: v })} />
            <ToggleRow label="Notifiche push" hint="Alert in-app in tempo reale" checked={s.notifichePush} onChange={v => upd({ notifichePush: v })} />
          </div>
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Tipologie</p>
          <div>
            <ToggleRow label="Task e scadenze" checked={s.notificheTask} onChange={v => upd({ notificheTask: v })} />
            <ToggleRow label="Aggiornamenti eventi" checked={s.notificheEventi} onChange={v => upd({ notificheEventi: v })} />
            <ToggleRow label="Workflow e fasi" checked={s.notificheWorkflow} onChange={v => upd({ notificheWorkflow: v })} />
            <ToggleRow label="Alert budget" checked={s.notificheBudget} onChange={v => upd({ notificheBudget: v })} />
            <ToggleRow label="Scadenze fornitori" checked={s.notificheFornitore} onChange={v => upd({ notificheFornitore: v })} />
          </div>
        </div>
      </div>
      <div>
        <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Frequenza digest email</p>
        <RadioGroup value={s.frequenzaDigest} onChange={v => upd({ frequenzaDigest: v as AppSettings['frequenzaDigest'] })}
          options={[
            { value: 'istantanea', label: 'Istantanea', desc: 'Notifica immediata per ogni evento' },
            { value: 'oraria', label: 'Ogni ora', desc: 'Riassunto orario degli aggiornamenti' },
            { value: 'giornaliera', label: 'Giornaliera', desc: 'Digest mattutino alle 08:00' },
            { value: 'settimanale', label: 'Settimanale', desc: 'Report del lunedì mattina' },
          ]}
        />
      </div>
    </SectionCard>
  )
}

function FlyConfig({ s, upd }: { s: AppSettings; upd: (p: Partial<AppSettings>) => void }) {
  const [memoryData, setMemoryData] = useState<{ preferences: Record<string, unknown>; corrections: unknown[]; context: Record<string, unknown> } | null>(null)
  const [memLoading, setMemLoading] = useState(true)
  const [logsData, setLogsData] = useState<{ totalCost: number; totalCalls: number; topTools: string[] } | null>(null)
  const showAdmin = isAdmin(loadUser())

  useEffect(() => {
    async function loadFlyData() {
      const { data: mem } = await supabase.from('fly_memory').select('preferences, corrections, context').maybeSingle()
      if (mem) setMemoryData(mem as any)
      if (showAdmin) {
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)
        const { data: logs } = await supabase.from('fly_logs').select('estimated_cost_eur, tools_called').gte('created_at', startOfMonth.toISOString())
        if (logs && logs.length > 0) {
          const totalCost = logs.reduce((s, l) => s + (Number(l.estimated_cost_eur) || 0), 0)
          const toolCount: Record<string, number> = {}
          for (const l of logs) {
            for (const t of (l.tools_called || [])) {
              toolCount[t] = (toolCount[t] || 0) + 1
            }
          }
          const topTools = Object.entries(toolCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => `${name} (${count})`)
          setLogsData({ totalCost, totalCalls: logs.length, topTools })
        }
      }
      setMemLoading(false)
    }
    loadFlyData()
  }, [showAdmin])

  async function resetMemory() {
    await supabase.from('fly_memory').delete().not('id', 'is', null)
    setMemoryData(null)
  }

  return (
    <SectionCard icon={Zap} title="Fly Assistant" subtitle="Comportamento e personalità di Fly">
      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 rounded-xl"
          style={{ background: s.flyAbilitato ? 'rgba(208,0,58,0.07)' : 'var(--panel2)', border: `1px solid ${s.flyAbilitato ? 'rgba(208,0,58,0.3)' : 'var(--line)'}` }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Fly Assistant abilitato</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {s.flyAbilitato ? 'Fly è attivo e monitorerà le operazioni' : 'Fly è disattivato'}
            </p>
          </div>
          <Toggle checked={s.flyAbilitato} onChange={v => upd({ flyAbilitato: v })} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ opacity: s.flyAbilitato ? 1 : 0.4, pointerEvents: s.flyAbilitato ? 'auto' : 'none' }}>
          <div>
            <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Presenza UI</p>
            <RadioGroup value={s.flyPresenza} onChange={v => upd({ flyPresenza: v as AppSettings['flyPresenza'] })}
              options={[
                { value: 'sempre', label: 'Sempre visibile', desc: 'Il pulsante Fly è sempre in primo piano' },
                { value: 'hover', label: 'Solo su hover', desc: 'Appare avvicinando il mouse all\'angolo' },
                { value: 'nascosto', label: 'Nascosto', desc: 'Accessibile solo via scorciatoia tastiera' },
              ]}
            />
          </div>
          <div>
            <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Tono personalità</p>
            <RadioGroup value={s.flyTono} onChange={v => upd({ flyTono: v as AppSettings['flyTono'] })}
              options={[
                { value: 'professionale', label: 'Professionale', desc: 'Risposte formali, dati al centro' },
                { value: 'amichevole', label: 'Amichevole', desc: 'Tono caldo' },
                { value: 'conciso', label: 'Conciso', desc: 'Solo l\'essenziale' },
              ]}
            />
          </div>
        </div>

        <div style={{ opacity: s.flyAbilitato ? 1 : 0.4, pointerEvents: s.flyAbilitato ? 'auto' : 'none' }}>
          <ToggleRow label="Modalità proattiva" hint="Fly invia avvisi automatici senza essere interpellato" checked={s.flyModalitaProattiva} onChange={v => upd({ flyModalitaProattiva: v })} />
          <ToggleRow label="Suggerimenti automatici" hint="Propone chip di risposta contestuale" checked={s.flySuggerimentiAutomatici} onChange={v => upd({ flySuggerimentiAutomatici: v })} />
        </div>

        {/* Memory section */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 20 }}>
          <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Memoria Fly</p>
          {memLoading ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Caricamento...</p>
          ) : memoryData ? (
            <div className="space-y-2">
              {Object.keys(memoryData.preferences).length > 0 && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>Preferenze:</span>{' '}
                  <span style={{ color: 'var(--muted)' }}>{JSON.stringify(memoryData.preferences)}</span>
                </div>
              )}
              {memoryData.corrections.length > 0 && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>Correzioni memorizzate:</span>{' '}
                  <span style={{ color: 'var(--muted)' }}>{memoryData.corrections.length}</span>
                </div>
              )}
              {Object.keys(memoryData.context).length > 0 && (
                <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>Contesto:</span>{' '}
                  <span style={{ color: 'var(--muted)' }}>{Object.keys(memoryData.context).length} mappature</span>
                </div>
              )}
              <button onClick={resetMemory} className="mt-2 px-4 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'rgba(208,0,58,0.08)', color: 'var(--red2)', border: '1px solid rgba(208,0,58,0.25)' }}>
                Reimposta memoria
              </button>
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Fly non ha ancora memorizzato preferenze per il tuo profilo.</p>
          )}
        </div>

        {/* Admin logs section */}
        {showAdmin && logsData && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 20 }}>
            <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Osservabilità (Admin)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="px-4 py-3 rounded-xl text-center" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{logsData.totalCalls}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Chiamate mese</p>
              </div>
              <div className="px-4 py-3 rounded-xl text-center" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{logsData.totalCost.toFixed(4)}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Costo stimato (EUR)</p>
              </div>
              <div className="px-4 py-3 rounded-xl text-center" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{logsData.topTools.length}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Tool distinti</p>
              </div>
            </div>
            {logsData.topTools.length > 0 && (
              <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                <span className="font-medium" style={{ color: 'var(--text)' }}>Top tool:</span>{' '}
                <span style={{ color: 'var(--muted)' }}>{logsData.topTools.join(', ')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

// ─── ADMIN SECTIONS ──────────────────────────────────────────────────────────

function ProfiloAzienda({ s, upd }: { s: AppSettings; upd: (p: Partial<AppSettings>) => void }) {
  return (
    <SectionCard icon={Building2} title="Profilo Azienda" subtitle="Informazioni sull'organizzazione">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Nome azienda">
          <TextInput value={s.nomeAzienda} onChange={v => upd({ nomeAzienda: v })} placeholder="Simmetria Events" />
        </Field>
        <Field label="Email aziendale">
          <TextInput value={s.emailAziendale} onChange={v => upd({ emailAziendale: v })} type="email" placeholder="info@azienda.it" />
        </Field>
        <Field label="Telefono">
          <TextInput value={s.telefono} onChange={v => upd({ telefono: v })} placeholder="+39 02 1234 5678" />
        </Field>
        <Field label="Sito web">
          <TextInput value={s.sitoWeb} onChange={v => upd({ sitoWeb: v })} placeholder="www.azienda.it" />
        </Field>
        <Field label="Indirizzo" hint="Sede principale">
          <TextInput value={s.indirizzo} onChange={v => upd({ indirizzo: v })} />
        </Field>
        <Field label="Timezone">
          <SelectInput value={s.timezone} onChange={v => upd({ timezone: v })} options={[
            { value: 'Europe/Rome', label: 'Europe/Rome (UTC+1/+2)' },
            { value: 'Europe/London', label: 'Europe/London (UTC+0/+1)' },
            { value: 'Europe/Berlin', label: 'Europe/Berlin (UTC+1/+2)' },
            { value: 'America/New_York', label: 'America/New_York (UTC-5/-4)' },
          ]} />
        </Field>
      </div>
    </SectionCard>
  )
}

function Branding({ s, upd }: { s: AppSettings; upd: (p: Partial<AppSettings>) => void }) {
  return (
    <SectionCard icon={Palette} title="Branding" subtitle="Logo, colori e identità visiva">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Nome/logo testuale" hint="Testo mostrato nella sidebar">
          <TextInput value={s.logoTestuale} onChange={v => upd({ logoTestuale: v })} placeholder="SIMMETRIA HUB" />
        </Field>
        <Field label="Mostra sidebar logo">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
            <Toggle checked={s.mostraLogoSidebar} onChange={v => upd({ mostraLogoSidebar: v })} />
            <span className="text-sm" style={{ color: 'var(--text)' }}>
              {s.mostraLogoSidebar ? 'Visibile' : 'Nascosto'}
            </span>
          </div>
        </Field>
        <Field label="Colore principale" hint="Accento brand">
          <div className="flex items-center gap-3">
            <input type="color" value={s.coloreAccento} onChange={e => upd({ coloreAccento: e.target.value })}
              className="w-12 h-12 rounded-xl border-0 cursor-pointer p-1"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }} />
            <TextInput value={s.coloreAccento} onChange={v => upd({ coloreAccento: v })} placeholder="#d0003a" />
          </div>
        </Field>
        <Field label="Colore secondario">
          <div className="flex items-center gap-3">
            <input type="color" value={s.coloreSecondario} onChange={e => upd({ coloreSecondario: e.target.value })}
              className="w-12 h-12 rounded-xl border-0 cursor-pointer p-1"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }} />
            <TextInput value={s.coloreSecondario} onChange={v => upd({ coloreSecondario: v })} placeholder="#ff315f" />
          </div>
        </Field>
      </div>
      <div className="mt-4 p-4 rounded-xl" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
        <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Anteprima brand</p>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${s.coloreAccento} 0%, ${s.coloreSecondario} 100%)` }}>
            <span className="text-white font-bold text-sm">{(s.logoTestuale || 'S').charAt(0)}</span>
          </div>
          <span className="text-lg font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            {(s.logoTestuale || '').split(' ')[0]}
            <span style={{ color: s.coloreSecondario }}> {(s.logoTestuale || '').split(' ').slice(1).join(' ')}</span>
          </span>
        </div>
      </div>
    </SectionCard>
  )
}

function RuoliPermessi() {
  const ruoli = [
    { nome: 'Super Admin', badge: '#d0003a', desc: 'Accesso completo, gestione utenti, ruoli, reset password, impostazioni sistema', permessi: ['Tutto', 'Gestione Utenti', 'Ruoli', 'Reset Password', 'Impostazioni Sistema'] },
    { nome: 'Admin', badge: '#e67e22', desc: 'Gestione clienti, eventi, fornitori, CRM, reset password utenti', permessi: ['Clienti', 'Eventi', 'Fornitori', 'CRM', 'Calendario', 'Reset Password', 'Gestione Utenti'] },
    { nome: 'Project Manager', badge: '#4db4ff', desc: 'Gestione eventi, task e workflow, modifica solo propria password', permessi: ['Clienti', 'Eventi', 'Fornitori', 'CRM', 'Calendario', 'Task', 'Workflow'] },
    { nome: 'User', badge: '#9ba3aa', desc: 'Accesso base, modifica solo propria password', permessi: ['Dashboard', 'Task', 'Calendario', 'Comunicazioni'] },
  ]

  return (
    <SectionCard icon={ShieldCheck} title="Ruoli e Permessi" subtitle="Matrice accessi per ruolo">
      <div className="space-y-3">
        {ruoli.map(r => (
          <div key={r.nome} className="p-4 rounded-xl" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: `${r.badge}15`, color: r.badge, border: `1px solid ${r.badge}30` }}>
                {r.nome}
              </span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{r.desc}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r.permessi.map(p => (
                <span key={p} className="text-xs px-2 py-0.5 rounded"
                  style={{ background: 'rgba(56,210,125,0.08)', color: 'var(--green)', border: '1px solid rgba(56,210,125,0.15)' }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function SicurezzaSistema({ s, upd }: { s: AppSettings; upd: (p: Partial<AppSettings>) => void }) {
  return (
    <SectionCard icon={Lock} title="Sicurezza Sistema" subtitle="Sessioni, autenticazione globale">
      <div className="space-y-5">
        <Field label="Timeout sessione" hint="Minuti di inattività prima del logout automatico">
          <SliderInput value={s.sessionTimeout} onChange={v => upd({ sessionTimeout: v })} min={15} max={480} step={15} label={v => `${v} min${v >= 60 ? ` (${Math.floor(v / 60)}h${v % 60 ? ` ${v % 60}m` : ''})` : ''}`} />
        </Field>
        <div>
          <ToggleRow label="Autenticazione multi-fattore (MFA)" hint="Richiedi verifica aggiuntiva al login" checked={s.richieciMFA} onChange={v => upd({ richieciMFA: v })} />
          <ToggleRow label="Log accessi" hint="Registra tutti i login e le attività sensibili" checked={s.logAccessi} onChange={v => upd({ logAccessi: v })} />
        </div>
      </div>
    </SectionCard>
  )
}

function ConfigDashboard({ s, upd }: { s: AppSettings; upd: (p: Partial<AppSettings>) => void }) {
  return (
    <SectionCard icon={LayoutDashboard} title="Configurazione Dashboard" subtitle="Layout, widget e KPI visibili (globale)">
      <div className="space-y-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Layout</p>
          <RadioGroup value={s.layoutDashboard} onChange={v => upd({ layoutDashboard: v as AppSettings['layoutDashboard'] })}
            options={[
              { value: 'compatto', label: 'Compatto', desc: 'Più informazioni in meno spazio' },
              { value: 'standard', label: 'Standard', desc: 'Bilanciamento leggibilità/densità' },
              { value: 'espanso', label: 'Espanso', desc: 'Card grandi per monitor ad alta risoluzione' },
            ]}
          />
        </div>
        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>KPI visibili</p>
          <ChipGroup
            options={[
              { value: 'eventi', label: 'Eventi attivi' },
              { value: 'task', label: 'Task aperti' },
              { value: 'fatturato', label: 'Fatturato' },
              { value: 'fornitori', label: 'Fornitori' },
              { value: 'workflow', label: 'Workflow' },
              { value: 'clienti', label: 'Clienti' },
            ]}
            selected={s.kpiVisibili}
            onChange={v => upd({ kpiVisibili: v })}
          />
        </div>
        <div>
          <ToggleRow label="Avanzamento workflow" hint="Mostra barra progresso workflow nella dashboard" checked={s.mostraAvanzamentoWorkflow} onChange={v => upd({ mostraAvanzamentoWorkflow: v })} />
          <ToggleRow label="Calendario laterale" hint="Mini-calendario nella sidebar dashboard" checked={s.mostraCalendarioLaterale} onChange={v => upd({ mostraCalendarioLaterale: v })} />
        </div>
      </div>
    </SectionCard>
  )
}

function DatiApplicazione() {
  const [showConfirm, setShowConfirm] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function handleAction(key: string) {
    if (key === 'export') {
      const data = {
        settings: loadSettings(),
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'simmetria-hub-backup.json'; a.click()
      URL.revokeObjectURL(url)
      setDone('export')
      setTimeout(() => setDone(null), 2000)
      return
    }
    if (showConfirm === key) {
      if (key === 'reset_settings') {
        localStorage.removeItem('simmetria_settings')
        window.location.reload()
      } else if (key === 'clear_workflows') {
        localStorage.removeItem('simmetria_workflows')
        setDone('clear_workflows')
        setTimeout(() => setDone(null), 2000)
      }
      setShowConfirm(null)
    } else {
      setShowConfirm(key)
    }
  }

  const actions = [
    { key: 'export', icon: Download, label: 'Esporta configurazione', desc: 'Scarica backup impostazioni in JSON', color: 'var(--blue)', safe: true },
    { key: 'reset_settings', icon: RotateCcw, label: 'Ripristina impostazioni', desc: 'Riporta tutte le impostazioni ai valori di default', color: 'var(--yellow)', safe: false },
    { key: 'clear_workflows', icon: Trash2, label: 'Reset workflow localStorage', desc: 'Elimina avanzamenti workflow salvati', color: 'var(--yellow)', safe: false },
  ]

  return (
    <SectionCard icon={Database} title="Dati Applicazione" subtitle="Gestione dati locali, backup e reset">
      <div className="space-y-3">
        {actions.map(a => (
          <div key={a.key} className="flex items-center justify-between gap-4 p-4 rounded-xl transition-all"
            style={{ background: 'var(--panel2)', border: `1px solid ${showConfirm === a.key ? a.color + '40' : 'var(--line)'}` }}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${a.color}12` }}>
                <a.icon className="w-4 h-4" style={{ color: a.color }} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{a.label}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>{a.desc}</p>
              </div>
            </div>
            <button onClick={() => handleAction(a.key)}
              className="px-4 py-2 rounded-xl text-xs font-semibold flex-shrink-0 transition-all"
              style={{
                background: done === a.key ? 'rgba(56,210,125,0.12)' : showConfirm === a.key ? `${a.color}15` : 'var(--panel)',
                color: done === a.key ? 'var(--green)' : showConfirm === a.key ? a.color : 'var(--muted)',
                border: `1px solid ${done === a.key ? 'rgba(56,210,125,0.3)' : showConfirm === a.key ? a.color + '40' : 'var(--line)'}`,
              }}>
              {done === a.key ? <><Check className="w-3.5 h-3.5 inline mr-1" />Fatto</> : showConfirm === a.key ? 'Conferma' : a.label.split(' ')[0]}
            </button>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ─── Registro Errori ─────────────────────────────────────────────────────────

function RegistroErrori() {
  const [entries, setEntries] = useState<ErrorLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchErrorLog(50).then(setEntries).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <SectionCard icon={FileWarning} title="Registro Errori" subtitle="Ultime 50 segnalazioni di errore nel sistema">
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun errore registrato.</p>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto">
          {entries.map(e => (
            <div key={e.id} className="px-3 py-2.5 rounded-lg text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-mono font-semibold" style={{ color: 'var(--red2)' }}>{e.pagina}</span>
                <span style={{ color: 'var(--muted)' }}>
                  {new Date(e.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p style={{ color: 'var(--text)' }}><strong>{e.azione}</strong>: {e.messaggio}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ─── Sidebar nav ──────────────────────────────────────────────────────────────

type SectionDef = { id: string; icon: React.ElementType; label: string; group: 'personal' | 'admin' }

const ALL_SECTIONS: SectionDef[] = [
  { id: 'profilo', icon: User, label: 'Il mio Profilo', group: 'personal' },
  { id: 'password', icon: Key, label: 'Cambio Password', group: 'personal' },
  { id: 'tema', icon: Sun, label: 'Tema', group: 'personal' },
  { id: 'notifiche', icon: Bell, label: 'Notifiche', group: 'personal' },
  { id: 'fly', icon: Zap, label: 'Fly Assistant', group: 'personal' },
  { id: 'azienda', icon: Building2, label: 'Profilo Azienda', group: 'admin' },
  { id: 'branding', icon: Palette, label: 'Branding', group: 'admin' },
  { id: 'ruoli', icon: ShieldCheck, label: 'Ruoli e Permessi', group: 'admin' },
  { id: 'sicurezza', icon: Lock, label: 'Sicurezza Sistema', group: 'admin' },
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard Globale', group: 'admin' },
  { id: 'dati', icon: Database, label: 'Dati Applicazione', group: 'admin' },
  { id: 'errori', icon: FileWarning, label: 'Registro Errori', group: 'admin' },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Impostazioni() {
  const currentUser = loadUser()
  const showAdmin = isAdmin(currentUser)

  const sections = showAdmin
    ? ALL_SECTIONS
    : ALL_SECTIONS.filter(s => s.group === 'personal')

  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [activeSection, setActiveSection] = useState('profilo')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!sections.find(s => s.id === activeSection)) {
      setActiveSection('profilo')
    }
  }, [sections, activeSection])

  function upd(partial: Partial<AppSettings>) {
    setSettings(s => ({ ...s, ...partial }))
    setDirty(true)
  }

  function handleSave() {
    saveSettings(settings)
    setSaved(true)
    setDirty(false)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleReset() {
    setSettings(loadSettings())
    setDirty(false)
  }

  const personalSections = sections.filter(s => s.group === 'personal')
  const adminSections = sections.filter(s => s.group === 'admin')

  return (
    <div className="space-y-0 -mt-1">
      {/* Wire Masthead */}
      <div className="wire-masthead">
        <div>
          <span className="wire-masthead-title">IMPOSTAZIONI</span>
        </div>
        <div className="wire-masthead-right">
          <div className="flex items-center gap-3">
            {dirty && (
              <button onClick={handleReset}
                className="font-mono uppercase text-xs tracking-wide px-3.5 py-2 rounded-lg transition-all"
                style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
                Annulla
              </button>
            )}
            <button onClick={handleSave}
              className="font-mono uppercase text-xs tracking-wide transition-all"
              style={{
                background: saved ? 'var(--panel)' : dirty ? 'var(--red2)' : 'var(--panel)',
                color: saved ? 'var(--green)' : dirty ? 'white' : 'var(--muted)',
                borderRadius: 6,
                padding: '6px 14px',
                border: 'none',
              }}>
              {saved ? 'Salvato' : dirty ? 'Salva' : 'Salva'}
            </button>
          </div>
        </div>
      </div>

      {dirty && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl mx-0 mb-4"
          style={{ background: 'rgba(255,194,75,0.06)', border: '1px solid rgba(255,194,75,0.2)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--yellow)' }} />
          <p className="text-sm" style={{ color: 'var(--yellow)' }}>Hai modifiche non salvate.</p>
        </div>
      )}

      <div className="flex gap-6 items-start">
        {/* Left nav */}
        <div className="hidden lg:flex flex-col gap-1 w-52 flex-shrink-0 sticky top-24">
          <p className="text-xs font-mono uppercase tracking-widest px-4 py-2" style={{ color: 'var(--muted)' }}>
            Personali
          </p>
          {personalSections.map(sec => {
            const active = activeSection === sec.id
            return (
              <button key={sec.id} onClick={() => setActiveSection(sec.id)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-left transition-all"
                style={{
                  background: active ? 'rgba(208,0,58,0.08)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--muted)',
                  border: `1px solid ${active ? 'rgba(208,0,58,0.25)' : 'transparent'}`,
                }}>
                <sec.icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? 'var(--red2)' : 'inherit' }} />
                {sec.label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto flex-shrink-0" style={{ color: 'var(--red2)' }} />}
              </button>
            )
          })}

          {adminSections.length > 0 && (
            <>
              <div className="my-2 border-t" style={{ borderColor: 'var(--line)' }} />
              <p className="text-xs font-mono uppercase tracking-widest px-4 py-2" style={{ color: 'var(--muted)' }}>
                Amministrazione
              </p>
              {adminSections.map(sec => {
                const active = activeSection === sec.id
                return (
                  <button key={sec.id} onClick={() => setActiveSection(sec.id)}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-left transition-all"
                    style={{
                      background: active ? 'rgba(208,0,58,0.08)' : 'transparent',
                      color: active ? 'var(--text)' : 'var(--muted)',
                      border: `1px solid ${active ? 'rgba(208,0,58,0.25)' : 'transparent'}`,
                    }}>
                    <sec.icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? 'var(--red2)' : 'inherit' }} />
                    {sec.label}
                    {active && <ChevronRight className="w-3.5 h-3.5 ml-auto flex-shrink-0" style={{ color: 'var(--red2)' }} />}
                  </button>
                )
              })}
            </>
          )}
        </div>

        {/* Mobile tabs */}
        <div className="lg:hidden w-full">
          <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
            {sections.map(sec => {
              const active = activeSection === sec.id
              return (
                <button key={sec.id} onClick={() => setActiveSection(sec.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wide whitespace-nowrap flex-shrink-0 transition-all"
                  style={{
                    background: active ? 'var(--red2)' : 'var(--panel)',
                    color: active ? 'white' : 'var(--muted)',
                    border: `1px solid ${active ? 'transparent' : 'var(--line)'}`,
                  }}>
                  <sec.icon className="w-3.5 h-3.5" />
                  {sec.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-0">
          {activeSection === 'profilo' && <ProfiloPersonale />}
          {activeSection === 'password' && <CambioPasswordSection />}
          {activeSection === 'tema' && <TemaSection />}
          {activeSection === 'notifiche' && <NotifichePersonali s={settings} upd={upd} />}
          {activeSection === 'fly' && <FlyConfig s={settings} upd={upd} />}
          {showAdmin && activeSection === 'azienda' && <ProfiloAzienda s={settings} upd={upd} />}
          {showAdmin && activeSection === 'branding' && <Branding s={settings} upd={upd} />}
          {showAdmin && activeSection === 'ruoli' && <RuoliPermessi />}
          {showAdmin && activeSection === 'sicurezza' && <SicurezzaSistema s={settings} upd={upd} />}
          {showAdmin && activeSection === 'dashboard' && <ConfigDashboard s={settings} upd={upd} />}
          {showAdmin && activeSection === 'dati' && <DatiApplicazione />}
          {showAdmin && activeSection === 'errori' && <RegistroErrori />}
        </div>
      </div>
    </div>
  )
}
