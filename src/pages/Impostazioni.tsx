import { useState, useEffect } from 'react'
import {
  Building2,
  Palette,
  ShieldCheck,
  Bell,

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
  Heart,
  Calendar,
} from 'lucide-react'
import { loadUser, isAdmin, isSuperAdmin } from '@/lib/auth'
import { adminListUsers } from '@/lib/users-service'
import { resetUserMfa } from '@/lib/mfa'
import { useWellnessConsent } from '@/components/WellnessConsent'
import { useTheme, type ThemeMode } from '@/lib/theme'
import { supabase } from '@/lib/supabase'

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

function ToggleRow({ label, hint, checked, onChange }: { label: React.ReactNode; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
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

interface AdminRow { id: string; first_name: string; last_name: string; email: string; role: string }

function MfaRecoverySection() {
  const currentUser = loadUser()
  const [rows, setRows] = useState<AdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const users = await adminListUsers()
      const admins = users
        .filter(u => (u.role === 'Admin' || u.role === 'Super Admin') && u.id !== currentUser?.id)
        .map(u => ({
          id: u.id,
          first_name: (u as any).first_name ?? '',
          last_name: (u as any).last_name ?? '',
          email: (u as any).email ?? '',
          role: u.role as string,
        }))
      setRows(admins)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(id: string) {
    setBusyId(id)
    setError(null)
    setSuccess(null)
    const res = await resetUserMfa(id)
    setBusyId(null)
    setConfirmId(null)
    if (res.success) {
      setSuccess('2FA reimpostata. La persona dovrà configurarla di nuovo al prossimo accesso.')
      setTimeout(() => setSuccess(null), 5000)
      return
    }
    const msg = res.error ?? ''
    if (msg.includes('AAL2')) {
      setError('Per reimpostare la 2FA di un altro account devi prima attivare la tua 2FA e accedere con essa.')
    } else if (msg.includes('NOT_AUTHORIZED')) {
      setError('Solo un Super Admin può eseguire questa operazione.')
    } else if (msg.includes('INVALID_TARGET')) {
      setError('Operazione non valida.')
    } else {
      setError('Impossibile reimpostare la 2FA. Riprova.')
    }
  }

  return (
    <SectionCard icon={RotateCcw} title="Recupero 2FA" subtitle="Reimposta l'autenticazione a due fattori di un amministratore bloccato">
      <div className="space-y-4 max-w-xl">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Se un amministratore perde l'accesso alla sua app authenticator, puoi azzerare la sua 2FA:
          dovrà configurarla di nuovo al prossimo accesso. Questa azione richiede che tu abbia già la tua 2FA attiva.
        </p>

        {loading && <p className="text-sm" style={{ color: 'var(--muted)' }}>Caricamento...</p>}

        {!loading && rows.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun altro amministratore presente.</p>
        )}

        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                  {`${r.first_name} ${r.last_name}`.trim() || r.email}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{r.role} · {r.email}</p>
              </div>
              {confirmId === r.id ? (
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => handleReset(r.id)} disabled={busyId === r.id}
                    className="px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wide text-white"
                    style={{ background: 'var(--red2)', opacity: busyId === r.id ? 0.6 : 1 }}>
                    {busyId === r.id ? '...' : 'Conferma'}
                  </button>
                  <button onClick={() => setConfirmId(null)}
                    className="px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wide"
                    style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
                    Annulla
                  </button>
                </div>
              ) : (
                <button onClick={() => { setConfirmId(r.id); setError(null); setSuccess(null) }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wide flex-shrink-0"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reimposta 2FA
                </button>
              )}
            </div>
          ))}
        </div>

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

function BenessereSection() {
  const { status, accept, disable } = useWellnessConsent()
  const granted = status === 'granted'

  async function toggle(v: boolean) {
    if (v) await accept()
    else await disable()
  }

  return (
    <SectionCard icon={Heart} title="Benessere" subtitle="Pause intelligenti e check-in di come ti senti">
      <p className="text-sm mb-4" style={{ color: 'var(--muted)', lineHeight: 1.5 }}>
        Se attivo, Simmetria Synergy pu\u00f2 suggerirti delle pause e chiederti come ti senti durante la
        giornata. Sono dati solo per te: nessun collega o responsabile vede le tue risposte individuali.
      </p>
      <ToggleRow
        label="Attiva pause e check-in del benessere"
        hint="Puoi disattivarlo in qualsiasi momento"
        checked={granted}
        onChange={toggle}
      />
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



function ConfigDashboard({ s, upd }: { s: AppSettings; upd: (p: Partial<AppSettings>) => void }) {
  return (
    <SectionCard icon={LayoutDashboard} title="Configurazione Dashboard" subtitle="Layout, widget e KPI visibili (globale)">
      <div className="space-y-6">
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Info size={16} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>
            Le opzioni qui sotto saranno attive in un prossimo aggiornamento. Salviamo già le tue preferenze.
          </p>
        </div>
        <div style={{ opacity: 0.45, pointerEvents: 'none' }}>
          <div style={{ position: 'relative' }}>
            <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>Layout <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--line)', borderRadius: 4, padding: '2px 6px', marginLeft: 6, verticalAlign: 'middle' }}>In arrivo</span></p>
            <RadioGroup value={s.layoutDashboard} onChange={v => upd({ layoutDashboard: v as AppSettings['layoutDashboard'] })}
              options={[
                { value: 'compatto', label: 'Compatto', desc: 'Più informazioni in meno spazio' },
                { value: 'standard', label: 'Standard', desc: 'Bilanciamento leggibilità/densità' },
                { value: 'espanso', label: 'Espanso', desc: 'Card grandi per monitor ad alta risoluzione' },
              ]}
            />
          </div>
          <div style={{ position: 'relative' }}>
            <p className="text-xs font-mono uppercase tracking-widest mb-3 mt-6" style={{ color: 'var(--muted)' }}>KPI visibili <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--line)', borderRadius: 4, padding: '2px 6px', marginLeft: 6, verticalAlign: 'middle' }}>In arrivo</span></p>
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
            <ToggleRow label={<>Avanzamento workflow <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--line)', borderRadius: 4, padding: '2px 6px', marginLeft: 6, verticalAlign: 'middle' }}>In arrivo</span></>} hint="Mostra barra progresso workflow nella dashboard" checked={s.mostraAvanzamentoWorkflow} onChange={v => upd({ mostraAvanzamentoWorkflow: v })} />
            <ToggleRow label={<>Calendario laterale <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--line)', borderRadius: 4, padding: '2px 6px', marginLeft: 6, verticalAlign: 'middle' }}>In arrivo</span></>} hint="Mini-calendario nella sidebar dashboard" checked={s.mostraCalendarioLaterale} onChange={v => upd({ mostraCalendarioLaterale: v })} />
          </div>
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
  { id: '2fa', icon: ShieldCheck, label: 'Autenticazione 2FA', group: 'personal' },
  { id: 'tema', icon: Sun, label: 'Tema', group: 'personal' },
  { id: 'notifiche', icon: Bell, label: 'Notifiche', group: 'personal' },
  { id: 'ferie', icon: Calendar, label: 'Le mie Ferie', group: 'personal' },
  { id: 'benessere', icon: Heart, label: 'Benessere', group: 'personal' },
  { id: 'fly', icon: Zap, label: 'Fly Assistant', group: 'personal' },
  { id: 'azienda', icon: Building2, label: 'Profilo Azienda', group: 'admin' },
  { id: 'branding', icon: Palette, label: 'Branding', group: 'admin' },
  { id: 'ruoli', icon: ShieldCheck, label: 'Ruoli e Permessi', group: 'admin' },
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard Globale', group: 'admin' },
  { id: 'dati', icon: Database, label: 'Dati Applicazione', group: 'admin' },
  { id: 'recupero2fa', icon: RotateCcw, label: 'Recupero 2FA', group: 'admin' },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Impostazioni() {
  const currentUser = loadUser()
  const showAdmin = isAdmin(currentUser)
  const showSuper = isSuperAdmin(currentUser)

  const sections = (showAdmin
    ? ALL_SECTIONS
    : ALL_SECTIONS.filter(s => s.group === 'personal')
  ).filter(s => s.id !== 'recupero2fa' || showSuper)

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

      <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-start">
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
          {activeSection === '2fa' && <TwoFactorSection />}
          {activeSection === 'tema' && <TemaSection />}
          {activeSection === 'notifiche' && <NotifichePersonali s={settings} upd={upd} />}
          {activeSection === 'ferie' && <LeMieFerieSection />}
          {activeSection === 'benessere' && <BenessereSection />}
          {activeSection === 'fly' && <FlyConfig s={settings} upd={upd} />}
          {showAdmin && activeSection === 'azienda' && <ProfiloAzienda s={settings} upd={upd} />}
          {showAdmin && activeSection === 'branding' && <Branding s={settings} upd={upd} />}
          {showAdmin && activeSection === 'ruoli' && <RuoliPermessi />}
          {showAdmin && activeSection === 'dashboard' && <ConfigDashboard s={settings} upd={upd} />}
          {showAdmin && activeSection === 'dati' && <DatiApplicazione />}
          {showSuper && activeSection === 'recupero2fa' && <MfaRecoverySection />}
        </div>
      </div>
    </div>
  )
}
