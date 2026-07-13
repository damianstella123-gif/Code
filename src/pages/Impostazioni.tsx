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
  ScrollText,
  Filter,
  Calendar,
} from 'lucide-react'
import { loadUser, isAdmin } from '@/lib/auth'
import { useTheme, type ThemeMode } from '@/lib/theme'
import { supabase } from '@/lib/supabase'
import { fetchErrorLog, type ErrorLogEntry } from '@/lib/error-log'
import { createLeaveRequest, cancelLeaveRequest } from '@/lib/leave-requests-service'

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
  morningEdition: boolean
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
  morningEdition: true,
}

const SK = 'simmetria_settings'
const MIGRATED_KEY = 'simmetria_settings_migrated'

export function loadSettings(): AppSettings {
  try { const r = localStorage.getItem(SK); return r ? { ...DEFAULT_SETTINGS, ...JSON.parse(r) } : DEFAULT_SETTINGS }
  catch { return DEFAULT_SETTINGS }
}

async function loadSettingsFromDb(): Promise<AppSettings> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return loadSettings()

  const { data } = await supabase
    .from('profiles')
    .select('settings')
    .eq('id', user.id)
    .maybeSingle()

  if (data?.settings && Object.keys(data.settings).length > 0) {
    return { ...DEFAULT_SETTINGS, ...(data.settings as Partial<AppSettings>) }
  }

  // One-shot migration: localStorage → DB
  if (!localStorage.getItem(MIGRATED_KEY)) {
    const local = loadSettings()
    const hasLocal = localStorage.getItem(SK)
    if (hasLocal) {
      await supabase.from('profiles').update({ settings: local }).eq('id', user.id)
      localStorage.removeItem(SK)
      localStorage.setItem(MIGRATED_KEY, '1')
      return local
    }
  }

  return DEFAULT_SETTINGS
}

async function saveSettingsToDb(s: AppSettings): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('profiles').update({ settings: s }).eq('id', user.id)
}

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

// 2FA — temporaneamente disattivato, riattivare quando fotocamera disponibile
export function TwoFactorSection() {
  const [mfaActive, setMfaActive] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [factorId, setFactorId] = useState('')
  const [qrUri, setQrUri] = useState('')
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showDisableConfirm, setShowDisableConfirm] = useState(false)
  const [disableCode, setDisableCode] = useState('')

  useEffect(() => {
    checkMfaStatus()
  }, [])

  async function checkMfaStatus() {
    try {
      const { data, error: mfaError } = await supabase.auth.mfa.listFactors()
      if (mfaError) {
        setMfaActive(false)
      } else {
        const verified = data.totp.filter(f => f.status === 'verified')
        setMfaActive(verified.length > 0)
        if (verified.length > 0) setFactorId(verified[0].id)
      }
    } catch {
      setMfaActive(false)
    } finally {
      setLoading(false)
    }
  }

  async function handleEnroll() {
    setEnrolling(true)
    setError(null)
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (enrollError) {
        setError(enrollError.message)
        setEnrolling(false)
        return
      }
      if (data) {
        setFactorId(data.id)
        setQrUri(data.totp.uri)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore')
    } finally {
      setEnrolling(false)
    }
  }

  async function handleVerifyEnroll() {
    if (code.length !== 6) {
      setError('Inserisci un codice di 6 cifre')
      return
    }
    setVerifying(true)
    setError(null)
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) { setError(challengeError.message); setVerifying(false); return }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      })
      if (verifyError) { setError('Codice non valido. Riprova.'); setVerifying(false); return }

      setMfaActive(true)
      setQrUri('')
      setCode('')
      setSuccess('2FA attivato correttamente')
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di verifica')
    } finally {
      setVerifying(false)
    }
  }

  async function handleDisable() {
    if (disableCode.length !== 6) {
      setError('Inserisci il codice corrente')
      return
    }
    setVerifying(true)
    setError(null)
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) { setError(challengeError.message); setVerifying(false); return }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: disableCode,
      })
      if (verifyError) { setError('Codice non valido.'); setVerifying(false); return }

      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId })
      if (unenrollError) { setError(unenrollError.message); setVerifying(false); return }

      setMfaActive(false)
      setShowDisableConfirm(false)
      setDisableCode('')
      setSuccess('2FA disattivato')
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore')
    } finally {
      setVerifying(false)
    }
  }

  if (loading) {
    return (
      <SectionCard icon={ShieldCheck} title="Autenticazione a Due Fattori" subtitle="Proteggi il tuo account con un codice aggiuntivo">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</p>
      </SectionCard>
    )
  }

  return (
    <SectionCard icon={ShieldCheck} title="Autenticazione a Due Fattori" subtitle="Proteggi il tuo account con un codice aggiuntivo">
      <div className="space-y-5 max-w-md">
        {mfaActive && !showDisableConfirm && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
              style={{ background: 'rgba(56,210,125,0.08)', border: '1px solid rgba(56,210,125,0.2)', color: 'var(--green)' }}>
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">2FA attivo</span>
            </div>
            <button
              onClick={() => setShowDisableConfirm(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-mono uppercase tracking-wide transition-all"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)' }}
            >
              Disattiva 2FA
            </button>
          </div>
        )}

        {mfaActive && showDisableConfirm && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text)' }}>
              Inserisci il codice corrente per confermare la disattivazione.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none text-center tracking-[0.3em] font-mono"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
            <div className="flex gap-2">
              <button onClick={handleDisable} disabled={verifying}
                className="px-4 py-2.5 rounded-xl text-xs font-mono uppercase tracking-wide text-white transition-all"
                style={{ background: 'var(--red2)', opacity: verifying ? 0.6 : 1 }}>
                {verifying ? 'Verifica...' : 'Conferma disattivazione'}
              </button>
              <button onClick={() => { setShowDisableConfirm(false); setDisableCode(''); setError(null) }}
                className="px-4 py-2.5 rounded-xl text-xs font-mono uppercase tracking-wide transition-all"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
                Annulla
              </button>
            </div>
          </div>
        )}

        {!mfaActive && !qrUri && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text)' }}>
              Scarica <strong>Google Authenticator</strong> o <strong>Authy</strong>, poi clicca per generare il codice QR.
            </p>
            <button onClick={handleEnroll} disabled={enrolling}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-mono uppercase tracking-wide text-white transition-all"
              style={{ background: 'var(--red2)', opacity: enrolling ? 0.6 : 1 }}>
              <ShieldCheck className="w-4 h-4" />
              {enrolling ? 'Generazione...' : 'Attiva autenticazione a due fattori'}
            </button>
          </div>
        )}

        {!mfaActive && qrUri && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text)' }}>
              Inquadra il codice QR con la tua app authenticator
            </p>
            <div className="flex justify-center p-4 rounded-xl" style={{ background: 'white' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                alt="QR Code"
                className="w-48 h-48"
              />
            </div>
            <Field label="Codice di verifica">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none text-center tracking-[0.3em] font-mono"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }}
              />
            </Field>
            <button onClick={handleVerifyEnroll} disabled={verifying}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-mono uppercase tracking-wide text-white transition-all"
              style={{ background: 'var(--red2)', opacity: verifying ? 0.6 : 1 }}>
              {verifying ? 'Verifica...' : 'Verifica e attiva'}
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ background: 'rgba(208,0,58,0.08)', border: '1px solid rgba(208,0,58,0.2)', color: 'var(--red2)' }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ background: 'rgba(56,210,125,0.08)', border: '1px solid rgba(56,210,125,0.2)', color: 'var(--green)' }}>
            <Check className="w-3.5 h-3.5 flex-shrink-0" />
            {success}
          </div>
        )}
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
          <ToggleRow label="Edizione del mattino" hint="Ricevi ogni mattina una sintesi operativa personalizzata da Fly" checked={s.morningEdition} onChange={v => upd({ morningEdition: v })} />
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

  async function handleAction(key: string) {
    if (key === 'export') {
      const s = await loadSettingsFromDb()
      const data = {
        settings: s,
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
        await saveSettingsToDb(DEFAULT_SETTINGS)
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

// ─── Sentinel Section (Admin / Super Admin) ─────────────────────────────────

interface SentinelAlert {
  id: string
  created_at: string
  severity: 'info' | 'warning' | 'critical'
  category: string
  message: string
  detail: Record<string, unknown> | null
  status: 'new' | 'acknowledged' | 'resolved'
  resolved_at: string | null
  resolved_by: string | null
}

function SentinelSection() {
  const [alerts, setAlerts] = useState<SentinelAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all')

  useEffect(() => {
    loadAlerts()
  }, [])

  async function loadAlerts() {
    setLoading(true)
    const { data } = await supabase
      .from('sentinel_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setAlerts(data as SentinelAlert[])
    setLoading(false)
  }

  async function resolve(alertId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('sentinel_alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: user.id })
      .eq('id', alertId)
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: user.id } : a))
  }

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter)
  const criticalNew = alerts.filter(a => a.severity === 'critical' && a.status === 'new').length

  const severityIcon = (s: string) => {
    switch (s) {
      case 'critical': return { color: '#dc2626', bg: 'rgba(220,38,38,0.10)', label: 'CRITICO' }
      case 'warning': return { color: '#d97706', bg: 'rgba(217,119,6,0.10)', label: 'WARNING' }
      default: return { color: '#2563eb', bg: 'rgba(37,99,235,0.10)', label: 'INFO' }
    }
  }

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m fa`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h fa`
    return `${Math.floor(hrs / 24)}g fa`
  }

  return (
    <SectionCard icon={AlertTriangle} title="Sentinel" subtitle="Monitoraggio automatico del sistema">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(['all', 'critical', 'warning', 'info'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wide transition-all"
            style={{
              background: filter === f ? 'var(--red2)' : 'var(--bg)',
              color: filter === f ? 'white' : 'var(--muted)',
              border: `1px solid ${filter === f ? 'transparent' : 'var(--line)'}`,
            }}>
            {f === 'all' ? 'Tutti' : f === 'critical' ? 'Critici' : f === 'warning' ? 'Warning' : 'Info'}
            {f === 'critical' && criticalNew > 0 && (
              <span style={{ marginLeft: 6, background: '#dc2626', color: 'white', borderRadius: 99, fontSize: 9, padding: '1px 5px' }}>
                {criticalNew}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <ShieldCheck className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--muted)', opacity: 0.4 }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun alert {filter !== 'all' ? `di tipo ${filter}` : ''}</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto">
          {filtered.map(a => {
            const sev = severityIcon(a.severity)
            return (
              <div key={a.id} className="px-3 py-3 rounded-lg text-xs" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded font-mono font-bold uppercase" style={{ background: sev.bg, color: sev.color, fontSize: 9 }}>
                      {sev.label}
                    </span>
                    <span className="font-mono" style={{ color: 'var(--muted)' }}>{a.category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--muted)' }}>{timeAgo(a.created_at)}</span>
                    {a.status === 'new' ? (
                      <span className="px-2 py-0.5 rounded font-mono" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: 9 }}>NEW</span>
                    ) : a.status === 'resolved' ? (
                      <span className="px-2 py-0.5 rounded font-mono" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', fontSize: 9 }}>RISOLTO</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded font-mono" style={{ background: 'rgba(217,119,6,0.1)', color: '#d97706', fontSize: 9 }}>ACK</span>
                    )}
                  </div>
                </div>
                <p className="mb-2" style={{ color: 'var(--text)', fontSize: 13 }}>{a.message}</p>
                {a.status === 'new' && (
                  <button onClick={() => resolve(a.id)}
                    className="px-3 py-1 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                    style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.2)' }}>
                    Segna come risolto
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

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

// ─── Audit Log Section (Super Admin only) ────────────────────────────────────

interface AuditEntry {
  id: string
  created_at: string
  user_id: string | null
  user_email: string | null
  action: string
  table_name: string | null
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}

function AuditLogSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTable, setFilterTable] = useState('')
  const [filterUser, setFilterUser] = useState('')

  useEffect(() => {
    loadAuditLog()
  }, [])

  async function loadAuditLog() {
    setLoading(true)
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error && data) setEntries(data as AuditEntry[])
    setLoading(false)
  }

  const filtered = entries.filter(e => {
    if (filterTable && e.table_name !== filterTable) return false
    if (filterUser && !(e.user_email || '').toLowerCase().includes(filterUser.toLowerCase())) return false
    return true
  })

  const tables = [...new Set(entries.map(e => e.table_name).filter(Boolean))]

  const actionColor = (action: string) => {
    switch (action) {
      case 'DELETE': return { color: '#dc2626', bg: 'rgba(220,38,38,0.08)' }
      case 'UPDATE': return { color: '#d97706', bg: 'rgba(217,119,6,0.08)' }
      default: return { color: 'var(--muted)', bg: 'var(--line)' }
    }
  }

  const formatTime = (d: string) => {
    const date = new Date(d)
    return date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <SectionCard icon={ScrollText} title="Audit Log" subtitle="Registro delle azioni critiche eseguite nel sistema">
      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
          <select
            value={filterTable}
            onChange={e => setFilterTable(e.target.value)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              padding: '6px 10px', borderRadius: '6px',
              background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)',
            }}
          >
            <option value="">Tutte le tabelle</option>
            {tables.map(t => <option key={t} value={t!}>{t}</option>)}
          </select>
        </div>
        <input
          type="text"
          placeholder="Filtra per email..."
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px',
            padding: '6px 10px', borderRadius: '6px', width: '200px',
            background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)',
          }}
        />
        <button onClick={loadAuditLog}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase',
            padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--line)',
            background: 'var(--bg)', color: 'var(--muted)', cursor: 'pointer',
          }}>
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)', padding: '20px 0' }}>
          Caricamento...
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)', padding: '20px 0' }}>
          Nessuna voce di audit trovata.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '9px' }}>Data</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '9px' }}>Utente</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '9px' }}>Azione</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '9px' }}>Tabella</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '9px' }}>Record ID</th>
                <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '9px' }}>Dettagli</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const ac = actionColor(entry.action)
                return (
                  <tr key={entry.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                      {formatTime(entry.created_at)}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text)' }}>
                      {entry.user_email || entry.user_id?.slice(0, 8) || '—'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: '4px', fontSize: '9px',
                        fontWeight: 600, color: ac.color, background: ac.bg,
                      }}>
                        {entry.action}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text)' }}>
                      {entry.table_name || '—'}
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--muted)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {entry.record_id?.slice(0, 8) || '—'}
                    </td>
                    <td style={{ padding: '8px 10px', maxWidth: '250px' }}>
                      {entry.action === 'DELETE' && entry.old_data && (
                        <span style={{ color: 'var(--muted)', fontSize: '10px' }}>
                          {String((entry.old_data as Record<string, string>).nome || (entry.old_data as Record<string, string>).name || (entry.old_data as Record<string, string>).title || (entry.old_data as Record<string, string>).titolo || JSON.stringify(entry.old_data).slice(0, 60))}
                        </span>
                      )}
                      {entry.action === 'UPDATE' && entry.old_data && entry.new_data && (
                        <span style={{ color: 'var(--muted)', fontSize: '10px' }}>
                          {Object.keys(entry.new_data).map(k => `${k}: ${String((entry.old_data as Record<string, unknown>)?.[k] ?? '')} → ${String((entry.new_data as Record<string, unknown>)?.[k] ?? '')}`).join(', ').slice(0, 80)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}

// ─── Le mie Ferie Section ────────────────────────────────────────────────────

function LeMieFerieSection() {
  const user = loadUser()
  const [leaves, setLeaves] = useState<{ id: string; tipo: string; data_inizio: string; data_fine: string; stato: string; note_admin: string | null; motivo: string | null }[]>([])
  const [showForm, setShowForm] = useState(false)
  const [tipo, setTipo] = useState<'ferie' | 'permesso' | 'malattia' | 'recupero'>('ferie')
  const [dataInizio, setDataInizio] = useState('')
  const [dataFine, setDataFine] = useState('')
  const [oraInizio, setOraInizio] = useState('')
  const [oraFine, setOraFine] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!user?.id) return
    const { data } = await supabase.from('leave_requests').select('id, tipo, data_inizio, data_fine, stato, note_admin, motivo').eq('user_id', user.id).order('created_at', { ascending: false })
    setLeaves(data ?? [])
  }
  useEffect(() => { load() }, [])

  const calcDays = (d1: string, d2: string) => Math.max(1, Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000) + 1)

  const cancel = async (id: string, _row: typeof leaves[0]) => {
    await cancelLeaveRequest(id)
    load()
  }

  const submit = async () => {
    if (!dataInizio || !dataFine || !user?.id) return
    setSaving(true)
    try {
      await createLeaveRequest({ tipo, dataInizio, dataFine, oraInizio: oraInizio || undefined, oraFine: oraFine || undefined, motivo: motivo || undefined })
      setShowForm(false); setDataInizio(''); setDataFine(''); setMotivo('')
      load()
    } catch { /* handled */ } finally { setSaving(false) }
  }

  const TIPO_COLORS: Record<string, string> = { ferie: 'var(--blue)', permesso: '#eab308', malattia: '#6b7280', recupero: '#22c55e' }
  const STATO_COLORS: Record<string, string> = { in_attesa: '#eab308', approvata: '#22c55e', negata: 'var(--red2)', annullata: '#6b7280' }
  const TIPI = [{ value: 'ferie' as const, label: 'Ferie' }, { value: 'permesso' as const, label: 'Permesso' }, { value: 'malattia' as const, label: 'Malattia' }, { value: 'recupero' as const, label: 'Recupero' }]

  return (
    <SectionCard icon={Calendar} title="Le mie Ferie" subtitle="Storico e nuove richieste">
      <button onClick={() => setShowForm(!showForm)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '5px 14px', borderRadius: 6, border: '1px solid var(--line)', background: showForm ? 'rgba(208,0,58,0.06)' : 'transparent', color: showForm ? 'var(--red2)' : 'var(--muted)', cursor: 'pointer', marginBottom: 14 }}>
        {showForm ? 'Chiudi form' : '+ Nuova richiesta'}
      </button>

      {showForm && (
        <div style={{ padding: 14, borderRadius: 8, border: '1px solid var(--line)', marginBottom: 16, background: 'var(--bg)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {TIPI.map(t => (
              <button key={t.value} onClick={() => setTipo(t.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 10px', borderRadius: 6, border: tipo === t.value ? '1.5px solid var(--red2)' : '1px solid var(--line)', background: tipo === t.value ? 'rgba(208,0,58,0.08)' : 'transparent', color: tipo === t.value ? 'var(--red2)' : 'var(--muted)', cursor: 'pointer' }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input type="date" value={dataInizio} onChange={e => { setDataInizio(e.target.value); if (!dataFine || e.target.value > dataFine) setDataFine(e.target.value) }} placeholder="Dal" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel-solid)', color: 'var(--text)' }} />
            <input type="date" value={dataFine} min={dataInizio} onChange={e => setDataFine(e.target.value)} placeholder="Al" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel-solid)', color: 'var(--text)' }} />
          </div>
          {tipo === 'permesso' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input type="time" value={oraInizio} onChange={e => setOraInizio(e.target.value)} placeholder="Dalle" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel-solid)', color: 'var(--text)' }} />
              <input type="time" value={oraFine} onChange={e => setOraFine(e.target.value)} placeholder="Alle" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel-solid)', color: 'var(--text)' }} />
            </div>
          )}
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} placeholder="Motivo (opzionale)" style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel-solid)', color: 'var(--text)', resize: 'vertical', marginBottom: 10 }} />
          <button onClick={submit} disabled={!dataInizio || !dataFine || saving} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--red2)', color: '#fff', cursor: 'pointer', opacity: (!dataInizio || !dataFine || saving) ? 0.5 : 1 }}>
            {saving ? 'Invio...' : 'Invia richiesta'}
          </button>
        </div>
      )}

      {leaves.length === 0 && !showForm && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Nessuna richiesta presente.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {leaves.map(l => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${TIPO_COLORS[l.tipo] || '#888'}20`, color: TIPO_COLORS[l.tipo] || '#888' }}>{l.tipo}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{l.data_inizio} — {l.data_fine}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{calcDays(l.data_inizio, l.data_fine)}gg</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${STATO_COLORS[l.stato] || '#888'}20`, color: STATO_COLORS[l.stato] || '#888', marginLeft: 'auto' }}>{l.stato.replace('_', ' ')}</span>
            {l.stato === 'in_attesa' && (
              <button onClick={() => cancel(l.id, l)} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>Annulla</button>
            )}
            {l.stato === 'negata' && l.note_admin && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.note_admin}>{l.note_admin}</span>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ─── Sidebar nav ──────────────────────────────────────────────────────────────

type SectionDef = { id: string; icon: React.ElementType; label: string; group: 'personal' | 'admin' }

const ALL_SECTIONS: SectionDef[] = [
  { id: 'profilo', icon: User, label: 'Il mio Profilo', group: 'personal' },
  { id: 'password', icon: Key, label: 'Cambio Password', group: 'personal' },
  /* 2FA — temporaneamente disattivato, riattivare quando fotocamera disponibile */
  // { id: '2fa', icon: ShieldCheck, label: 'Autenticazione 2FA', group: 'personal' },
  { id: 'tema', icon: Sun, label: 'Tema', group: 'personal' },
  { id: 'notifiche', icon: Bell, label: 'Notifiche', group: 'personal' },
  { id: 'ferie', icon: Calendar, label: 'Le mie Ferie', group: 'personal' },
  { id: 'fly', icon: Zap, label: 'Fly Assistant', group: 'personal' },
  { id: 'azienda', icon: Building2, label: 'Profilo Azienda', group: 'admin' },
  { id: 'branding', icon: Palette, label: 'Branding', group: 'admin' },
  { id: 'ruoli', icon: ShieldCheck, label: 'Ruoli e Permessi', group: 'admin' },
  { id: 'sicurezza', icon: Lock, label: 'Sicurezza Sistema', group: 'admin' },
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard Globale', group: 'admin' },
  { id: 'dati', icon: Database, label: 'Dati Applicazione', group: 'admin' },
  { id: 'errori', icon: FileWarning, label: 'Registro Errori', group: 'admin' },
  { id: 'sentinel', icon: AlertTriangle, label: 'Sentinel', group: 'admin' },
  { id: 'audit', icon: ScrollText, label: 'Audit Log', group: 'admin' },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Impostazioni() {
  const currentUser = loadUser()
  const showAdmin = isAdmin(currentUser)

  const sections = showAdmin
    ? ALL_SECTIONS.filter(s => s.id !== 'audit' || currentUser?.role === 'Super Admin')
    : ALL_SECTIONS.filter(s => s.group === 'personal')

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [activeSection, setActiveSection] = useState('profilo')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSettingsFromDb().then(s => {
      setSettings(s)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!sections.find(s => s.id === activeSection)) {
      setActiveSection('profilo')
    }
  }, [sections, activeSection])

  function upd(partial: Partial<AppSettings>) {
    setSettings(s => ({ ...s, ...partial }))
    setDirty(true)
  }

  async function handleSave() {
    await saveSettingsToDb(settings)
    setSaved(true)
    setDirty(false)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleReset() {
    loadSettingsFromDb().then(s => { setSettings(s); setDirty(false) })
  }

  const personalSections = sections.filter(s => s.group === 'personal')
  const adminSections = sections.filter(s => s.group === 'admin')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)' }}>Caricamento impostazioni...</p>
      </div>
    )
  }

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
          {/* 2FA — temporaneamente disattivato, riattivare quando fotocamera disponibile */}
          {/* activeSection === '2fa' && <TwoFactorSection /> */}
          {activeSection === 'tema' && <TemaSection />}
          {activeSection === 'notifiche' && <NotifichePersonali s={settings} upd={upd} />}
          {activeSection === 'ferie' && <LeMieFerieSection />}
          {activeSection === 'fly' && <FlyConfig s={settings} upd={upd} />}
          {showAdmin && activeSection === 'azienda' && <ProfiloAzienda s={settings} upd={upd} />}
          {showAdmin && activeSection === 'branding' && <Branding s={settings} upd={upd} />}
          {showAdmin && activeSection === 'ruoli' && <RuoliPermessi />}
          {showAdmin && activeSection === 'sicurezza' && <SicurezzaSistema s={settings} upd={upd} />}
          {showAdmin && activeSection === 'dashboard' && <ConfigDashboard s={settings} upd={upd} />}
          {showAdmin && activeSection === 'dati' && <DatiApplicazione />}
          {showAdmin && activeSection === 'errori' && <RegistroErrori />}
          {showAdmin && activeSection === 'sentinel' && <SentinelSection />}
          {currentUser?.role === 'Super Admin' && activeSection === 'audit' && <AuditLogSection />}
        </div>
      </div>
    </div>
  )
}
