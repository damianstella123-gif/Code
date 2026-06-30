import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Palette,
  ShieldCheck,
  Bell,
  Lock,
  Database,
  LayoutDashboard,
  Zap,
  Save,
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
} from 'lucide-react'
import { loadUser, isPartnerUser } from '@/lib/auth'
import { useTheme, type ThemeMode } from '@/lib/theme'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppSettings {
  // Profilo azienda
  nomeAzienda: string
  emailAziendale: string
  telefono: string
  indirizzo: string
  sitoWeb: string
  timezone: string
  lingua: string
  // Branding
  logoTestuale: string
  coloreAccento: string
  coloreSecondario: string
  mostraLogoSidebar: boolean
  // Notifiche
  notificheEmail: boolean
  notifichePush: boolean
  notificheTask: boolean
  notificheEventi: boolean
  notificheWorkflow: boolean
  notificheBudget: boolean
  notificheFornitore: boolean
  frequenzaDigest: 'istantanea' | 'oraria' | 'giornaliera' | 'settimanale'
  // Dashboard
  layoutDashboard: 'compatto' | 'standard' | 'espanso'
  kpiVisibili: string[]
  widgetOrdinati: string[]
  mostraAvanzamentoWorkflow: boolean
  mostraCalendarioLaterale: boolean
  // Sicurezza (demo)
  sessionTimeout: number
  richieciMFA: boolean
  logAccessi: boolean
  // Fly Assistant
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
        background: checked ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'var(--panel2)',
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
    <div className="panel p-6 space-y-6 animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(208,0,58,0.12)', border: '1px solid rgba(208,0,58,0.2)' }}>
          <Icon className="w-5 h-5" style={{ color: 'var(--red2)' }} />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{subtitle}</p>
        </div>
      </div>
      <div className="border-t" style={{ borderColor: 'var(--line)' }} />
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
              background: active ? 'rgba(208,0,58,0.12)' : 'var(--panel2)',
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
              background: active ? 'rgba(208,0,58,0.07)' : 'var(--panel2)',
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

// ─── Sections ─────────────────────────────────────────────────────────────────

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
            { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC-8/-7)' },
            { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+4)' },
          ]} />
        </Field>
        <Field label="Lingua interfaccia">
          <SelectInput value={s.lingua} onChange={v => upd({ lingua: v })} options={[
            { value: 'it', label: 'Italiano' },
            { value: 'en', label: 'English' },
            { value: 'fr', label: 'Français' },
            { value: 'es', label: 'Español' },
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
        <Field label="Colore principale" hint="Accento brand (rosso di default)">
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="color" value={s.coloreAccento} onChange={e => upd({ coloreAccento: e.target.value })}
                className="w-12 h-12 rounded-xl border-0 cursor-pointer p-1"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }} />
            </div>
            <TextInput value={s.coloreAccento} onChange={v => upd({ coloreAccento: v })} placeholder="#d0003a" />
          </div>
        </Field>
        <Field label="Colore secondario" hint="Variante chiara del principale">
          <div className="flex items-center gap-3">
            <div className="relative">
              <input type="color" value={s.coloreSecondario} onChange={e => upd({ coloreSecondario: e.target.value })}
                className="w-12 h-12 rounded-xl border-0 cursor-pointer p-1"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }} />
            </div>
            <TextInput value={s.coloreSecondario} onChange={v => upd({ coloreSecondario: v })} placeholder="#ff315f" />
          </div>
        </Field>
      </div>

      {/* Preview */}
      <div className="mt-4 p-4 rounded-xl" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
        <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Anteprima brand</p>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${s.coloreAccento} 0%, ${s.coloreSecondario} 100%)`, boxShadow: `0 4px 16px ${s.coloreAccento}40` }}>
            <span className="text-white font-bold text-sm">{(s.logoTestuale || 'S').charAt(0)}</span>
          </div>
          <span className="text-lg font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            {s.logoTestuale.split(' ')[0]}
            <span style={{ color: s.coloreSecondario }}> {s.logoTestuale.split(' ').slice(1).join(' ')}</span>
          </span>
        </div>
        <div className="flex gap-2 mt-3">
          <div className="px-4 py-2 rounded-lg text-xs font-semibold"
            style={{ background: `linear-gradient(135deg, ${s.coloreAccento} 0%, ${s.coloreSecondario} 100%)`, color: 'white' }}>
            Pulsante primario
          </div>
          <div className="px-4 py-2 rounded-lg text-xs border"
            style={{ borderColor: s.coloreAccento + '40', color: s.coloreSecondario }}>
            Pulsante outline
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

function RuoliPermessi() {
  const ruoli = [
    { nome: 'Admin', badge: '#ff315f', desc: 'Accesso completo a tutte le sezioni e impostazioni', permessi: ['Dashboard', 'Eventi', 'CRM', 'Task', 'Calendario', 'Fornitori', 'Amministrazione', 'Comunicazioni', 'Workflow', 'Utenti', 'Impostazioni'] },
    { nome: 'Manager', badge: '#4db4ff', desc: 'Gestione eventi, task e workflow del team', permessi: ['Dashboard', 'Eventi', 'Task', 'Calendario', 'Comunicazioni', 'Workflow'] },
    { nome: 'Operativo', badge: '#ffc24b', desc: 'Esecuzione task assegnati e comunicazioni', permessi: ['Dashboard', 'Task', 'Calendario', 'Comunicazioni'] },
    { nome: 'Finance', badge: '#38d27d', desc: 'Gestione finanziaria ed amministrativa', permessi: ['Dashboard', 'Amministrazione', 'Eventi', 'Calendario'] },
    { nome: 'Commerciale', badge: '#a78bfa', desc: 'CRM, clienti e gestione pipeline vendite', permessi: ['Dashboard', 'CRM', 'Eventi', 'Calendario', 'Comunicazioni'] },
    { nome: 'Fornitore', badge: '#9ba3aa', desc: 'Accesso limitato a task e calendario assegnati', permessi: ['Dashboard', 'Task', 'Calendario'] },
  ]

  return (
    <SectionCard icon={ShieldCheck} title="Ruoli e Permessi" subtitle="Matrice accessi per ruolo (sola lettura in demo)">
      <div className="flex items-center gap-2 p-3 rounded-xl mb-4" style={{ background: 'rgba(77,180,255,0.06)', border: '1px solid rgba(77,180,255,0.15)' }}>
        <Info className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--blue)' }} />
        <p className="text-xs" style={{ color: 'var(--blue)' }}>
          In modalità demo i permessi sono predefiniti. In produzione è possibile personalizzare ogni ruolo singolarmente.
        </p>
      </div>
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
                  ✓ {p}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function NotificheSection({ s, upd }: { s: AppSettings; upd: (p: Partial<AppSettings>) => void }) {
  return (
    <SectionCard icon={Bell} title="Preferenze Notifiche" subtitle="Configura canali e frequenza degli avvisi">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Canali</p>
          <div>
            <ToggleRow label="Notifiche email" hint="Digest periodici via email" checked={s.notificheEmail} onChange={v => upd({ notificheEmail: v })} />
            <ToggleRow label="Notifiche push" hint="Alert in-app in tempo reale" checked={s.notifichePush} onChange={v => upd({ notifichePush: v })} />
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Tipologie</p>
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
        <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Frequenza digest email</p>
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

function SicurezzaSection({ s, upd }: { s: AppSettings; upd: (p: Partial<AppSettings>) => void }) {
  const [showPw, setShowPw] = useState(false)

  return (
    <SectionCard icon={Lock} title="Sicurezza" subtitle="Sessioni, autenticazione e accessi (demo)">
      <div className="flex items-center gap-2 p-3 rounded-xl mb-4" style={{ background: 'rgba(255,194,75,0.06)', border: '1px solid rgba(255,194,75,0.15)' }}>
        <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--yellow)' }} />
        <p className="text-xs" style={{ color: 'var(--yellow)' }}>Queste impostazioni sono in modalità demo e non influenzano la sicurezza reale.</p>
      </div>
      <div className="space-y-5">
        <Field label="Timeout sessione" hint="Minuti di inattività prima del logout automatico">
          <SliderInput value={s.sessionTimeout} onChange={v => upd({ sessionTimeout: v })} min={15} max={480} step={15} label={v => `${v} min${v >= 60 ? ` (${Math.floor(v / 60)}h${v % 60 ? ` ${v % 60}m` : ''})` : ''}`} />
        </Field>

        <div>
          <ToggleRow label="Autenticazione multi-fattore (MFA)" hint="Richiedi verifica aggiuntiva al login" checked={s.richieciMFA} onChange={v => upd({ richieciMFA: v })} />
          <ToggleRow label="Log accessi" hint="Registra tutti i login e le attività sensibili" checked={s.logAccessi} onChange={v => upd({ logAccessi: v })} />
        </div>

        <Field label="Password di accesso (demo)" hint="Modifica la password amministratore">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input type={showPw ? 'text' : 'password'} defaultValue="••••••••••••"
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none pr-10"
                style={{ background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              <button onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:opacity-80">
                {showPw
                  ? <EyeOff className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                  : <Eye className="w-4 h-4" style={{ color: 'var(--muted)' }} />}
              </button>
            </div>
            <button className="px-4 py-3 rounded-xl text-sm font-medium"
              onClick={() => alert('Password aggiornata (demo)')}
              style={{ background: 'var(--panel2)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
              Aggiorna
            </button>
          </div>
        </Field>

        {/* Demo access log */}
        <div>
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Ultimi accessi (demo)</p>
          <div className="space-y-2">
            {[
              { data: '28 mag 2026, 09:14', ip: '185.22.145.12', browser: 'Chrome 124 · macOS', attuale: true },
              { data: '27 mag 2026, 17:43', ip: '185.22.145.12', browser: 'Chrome 124 · macOS', attuale: false },
              { data: '26 mag 2026, 11:02', ip: '91.200.55.8', browser: 'Safari 17 · iPhone', attuale: false },
            ].map((log, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'var(--panel2)', border: `1px solid ${log.attuale ? 'rgba(56,210,125,0.2)' : 'var(--line)'}` }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: log.attuale ? 'var(--green)' : 'var(--muted)' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs" style={{ color: 'var(--text)' }}>{log.data} {log.attuale && <span style={{ color: 'var(--green)' }}>· Sessione attuale</span>}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{log.ip} · {log.browser}</p>
                </div>
              </div>
            ))}
          </div>
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
      } else if (key === 'clear_cal') {
        localStorage.removeItem('cal_tasks')
        localStorage.removeItem('cal_events')
        setDone('clear_cal')
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
    { key: 'clear_workflows', icon: Trash2, label: 'Reset workflow localStorage', desc: 'Elimina avanzamenti workflow salvati (ripristina demo)', color: 'var(--yellow)', safe: false },
    { key: 'clear_cal', icon: Trash2, label: 'Reset calendario localStorage', desc: 'Elimina modifiche task/eventi del calendario', color: 'var(--yellow)', safe: false },
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

      {/* Storage usage */}
      <div className="mt-2 p-4 rounded-xl" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
        <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>localStorage utilizzato</p>
        <div className="space-y-2">
          {[
            { key: 'simmetria_user', label: 'Sessione utente' },
            { key: 'simmetria_settings', label: 'Impostazioni app' },
            { key: 'simmetria_workflows', label: 'Workflow' },
            { key: 'cal_tasks', label: 'Calendario task' },
          ].map(item => {
            const raw = localStorage.getItem(item.key)
            const size = raw ? new Blob([raw]).size : 0
            return (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{item.label}</span>
                <span className="text-xs font-medium" style={{ color: raw ? 'var(--text)' : 'var(--muted)', opacity: raw ? 1 : 0.4 }}>
                  {raw ? `${(size / 1024).toFixed(1)} KB` : 'vuoto'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </SectionCard>
  )
}

function ConfigDashboard({ s, upd }: { s: AppSettings; upd: (p: Partial<AppSettings>) => void }) {
  return (
    <SectionCard icon={LayoutDashboard} title="Configurazione Dashboard" subtitle="Layout, widget e KPI visibili">
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Layout</p>
          <RadioGroup value={s.layoutDashboard} onChange={v => upd({ layoutDashboard: v as AppSettings['layoutDashboard'] })}
            options={[
              { value: 'compatto', label: 'Compatto', desc: 'Più informazioni in meno spazio, font ridotto' },
              { value: 'standard', label: 'Standard', desc: 'Bilanciamento ottimale leggibilità/densità' },
              { value: 'espanso', label: 'Espanso', desc: 'Card grandi, ideale per monitor ad alta risoluzione' },
            ]}
          />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>KPI visibili</p>
          <ChipGroup
            options={[
              { value: 'eventi', label: 'Eventi attivi' },
              { value: 'task', label: 'Task aperti' },
              { value: 'fatturato', label: 'Fatturato' },
              { value: 'fornitori', label: 'Fornitori' },
              { value: 'workflow', label: 'Workflow' },
              { value: 'clienti', label: 'Clienti' },
              { value: 'budget', label: 'Budget disponibile' },
              { value: 'margine', label: 'Margine netto' },
            ]}
            selected={s.kpiVisibili}
            onChange={v => upd({ kpiVisibili: v })}
          />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Componenti attivi</p>
          <div>
            <ToggleRow label="Avanzamento workflow" hint="Mostra barra progresso workflow nella dashboard" checked={s.mostraAvanzamentoWorkflow} onChange={v => upd({ mostraAvanzamentoWorkflow: v })} />
            <ToggleRow label="Calendario laterale" hint="Mini-calendario nella sidebar dashboard" checked={s.mostraCalendarioLaterale} onChange={v => upd({ mostraCalendarioLaterale: v })} />
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Ordine widget</p>
          <div className="space-y-2">
            {(s.widgetOrdinati.length ? s.widgetOrdinati : ['kpi', 'eventi', 'task', 'calendario', 'workflow']).map((w, i) => {
              const labels: Record<string, string> = { kpi: 'KPI Overview', eventi: 'Lista eventi', task: 'Task urgenti', calendario: 'Prossime scadenze', workflow: 'Avanzamento workflow' }
              return (
                <div key={w} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                  <span className="w-5 h-5 rounded text-xs flex items-center justify-center flex-shrink-0 font-bold"
                    style={{ background: 'rgba(208,0,58,0.12)', color: 'var(--red2)' }}>{i + 1}</span>
                  <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>{labels[w] ?? w}</span>
                  <div className="flex gap-1">
                    <button onClick={() => {
                      if (i === 0) return
                      const arr = [...s.widgetOrdinati]
                      ;[arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]
                      upd({ widgetOrdinati: arr })
                    }} className="p-1.5 rounded-lg hover:bg-white/10 transition-all"
                      style={{ color: 'var(--muted)', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                    <button onClick={() => {
                      if (i === s.widgetOrdinati.length - 1) return
                      const arr = [...s.widgetOrdinati]
                      ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
                      upd({ widgetOrdinati: arr })
                    }} className="p-1.5 rounded-lg hover:bg-white/10 transition-all"
                      style={{ color: 'var(--muted)', opacity: i === s.widgetOrdinati.length - 1 ? 0.3 : 1 }}>↓</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

function FlyConfig({ s, upd }: { s: AppSettings; upd: (p: Partial<AppSettings>) => void }) {
  return (
    <SectionCard icon={Zap} title="Configurazione Fly Assistant" subtitle="Comportamento, personalità e presenza di Fly">
      <div className="space-y-6">
        {/* Master toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl"
          style={{ background: s.flyAbilitato ? 'rgba(208,0,58,0.07)' : 'var(--panel2)', border: `1px solid ${s.flyAbilitato ? 'rgba(208,0,58,0.3)' : 'var(--line)'}` }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Fly Assistant abilitato</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              {s.flyAbilitato ? 'Fly è attivo e monitorerà le operazioni' : 'Fly è disattivato — nessuna notifica proattiva'}
            </p>
          </div>
          <Toggle checked={s.flyAbilitato} onChange={v => upd({ flyAbilitato: v })} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ opacity: s.flyAbilitato ? 1 : 0.4, pointerEvents: s.flyAbilitato ? 'auto' : 'none' }}>
          <div>
            <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Presenza UI</p>
            <RadioGroup value={s.flyPresenza} onChange={v => upd({ flyPresenza: v as AppSettings['flyPresenza'] })}
              options={[
                { value: 'sempre', label: 'Sempre visibile', desc: 'Il pulsante Fly è sempre in primo piano' },
                { value: 'hover', label: 'Solo su hover', desc: 'Appare avvicinando il mouse all\'angolo' },
                { value: 'nascosto', label: 'Nascosto', desc: 'Accessibile solo via scorciatoia tastiera' },
              ]}
            />
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Tono personalità</p>
            <RadioGroup value={s.flyTono} onChange={v => upd({ flyTono: v as AppSettings['flyTono'] })}
              options={[
                { value: 'professionale', label: 'Professionale', desc: 'Risposte formali, dati al centro' },
                { value: 'amichevole', label: 'Amichevole', desc: 'Tono caldo, emojis occasionali' },
                { value: 'conciso', label: 'Conciso', desc: 'Solo l\'essenziale, zero fluff' },
              ]}
            />
          </div>
        </div>

        <div style={{ opacity: s.flyAbilitato ? 1 : 0.4, pointerEvents: s.flyAbilitato ? 'auto' : 'none' }}>
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Intensità notifiche</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { value: 'alta', label: 'Alta', desc: 'Notifica tutto', color: 'var(--red2)' },
              { value: 'media', label: 'Media', desc: 'Solo urgenze', color: 'var(--yellow)' },
              { value: 'bassa', label: 'Bassa', desc: 'Solo critici', color: 'var(--muted)' },
            ] as const).map(n => (
              <button key={n.value} onClick={() => upd({ flyNotificheIntensita: n.value })}
                className="p-3 rounded-xl text-center transition-all"
                style={{
                  background: s.flyNotificheIntensita === n.value ? `${n.color}12` : 'var(--panel2)',
                  border: `1px solid ${s.flyNotificheIntensita === n.value ? n.color + '40' : 'var(--line)'}`,
                }}>
                <div className="w-6 h-6 rounded-full mx-auto mb-1 flex items-center justify-center"
                  style={{ background: s.flyNotificheIntensita === n.value ? `${n.color}20` : 'transparent' }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: n.color }} />
                </div>
                <p className="text-xs font-semibold" style={{ color: s.flyNotificheIntensita === n.value ? n.color : 'var(--text)' }}>{n.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{n.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div style={{ opacity: s.flyAbilitato ? 1 : 0.4, pointerEvents: s.flyAbilitato ? 'auto' : 'none' }}>
          <div>
            <ToggleRow label="Modalità proattiva" hint="Fly invia avvisi automatici senza essere interpellato" checked={s.flyModalitaProattiva} onChange={v => upd({ flyModalitaProattiva: v })} />
            <ToggleRow label="Suggerimenti automatici" hint="Propone chip di risposta contestuale" checked={s.flySuggerimentiAutomatici} onChange={v => upd({ flySuggerimentiAutomatici: v })} />
            <ToggleRow label="Risposte veloci" hint="Suggerisce azioni rapide in base al contesto attivo" checked={s.flyRisposteVeloce} onChange={v => upd({ flyRisposteVeloce: v })} />
          </div>
        </div>

        <div style={{ opacity: s.flyAbilitato ? 1 : 0.4, pointerEvents: s.flyAbilitato ? 'auto' : 'none' }}>
          <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Aree di focus proattive</p>
          <ChipGroup
            options={[
              { value: 'task', label: 'Task e scadenze' },
              { value: 'workflow', label: 'Workflow' },
              { value: 'budget', label: 'Budget' },
              { value: 'fornitori', label: 'Fornitori' },
              { value: 'eventi', label: 'Eventi' },
              { value: 'crm', label: 'CRM' },
              { value: 'comunicazioni', label: 'Comunicazioni' },
            ]}
            selected={s.flyFocusArea}
            onChange={v => upd({ flyFocusArea: v })}
          />
        </div>
      </div>
    </SectionCard>
  )
}

// ─── Tema Section ─────────────────────────────────────────────────────────────

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

// ─── Sidebar nav ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'profilo', icon: Building2, label: 'Profilo Azienda' },
  { id: 'tema', icon: Sun, label: 'Tema' },
  { id: 'branding', icon: Palette, label: 'Branding' },
  { id: 'ruoli', icon: ShieldCheck, label: 'Ruoli e Permessi' },
  { id: 'notifiche', icon: Bell, label: 'Notifiche' },
  { id: 'sicurezza', icon: Lock, label: 'Sicurezza' },
  { id: 'dati', icon: Database, label: 'Dati Applicazione' },
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'fly', icon: Zap, label: 'Fly Assistant' },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Impostazioni() {
  const navigate = useNavigate()
  const currentUser = loadUser()

  // Admin-only guard
  useEffect(() => {
    if (!isPartnerUser(currentUser) && currentUser?.ruolo !== 'Admin') navigate('/dashboard', { replace: true })
  }, [currentUser, navigate])

  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [activeSection, setActiveSection] = useState('profilo')
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

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

  if (!isPartnerUser(currentUser) && currentUser?.ruolo !== 'Admin') return null

  return (
    <div className="space-y-0 -mt-1">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Impostazioni</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Configurazione sistema — solo Admin</p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <button onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
              <RotateCcw className="w-4 h-4" /> Annulla
            </button>
          )}
          <button onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: saved ? 'rgba(56,210,125,0.12)' : dirty ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'var(--panel)',
              color: saved ? 'var(--green)' : dirty ? 'white' : 'var(--muted)',
              border: `1px solid ${saved ? 'rgba(56,210,125,0.3)' : dirty ? 'transparent' : 'var(--line)'}`,
              boxShadow: dirty && !saved ? 'var(--shadow-red)' : 'none',
            }}>
            {saved ? <><Check className="w-4 h-4" />Salvato</> : <><Save className="w-4 h-4" />Salva impostazioni</>}
          </button>
        </div>
      </div>

      {dirty && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4"
          style={{ background: 'rgba(255,194,75,0.06)', border: '1px solid rgba(255,194,75,0.2)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--yellow)' }} />
          <p className="text-sm" style={{ color: 'var(--yellow)' }}>Hai modifiche non salvate — premi "Salva impostazioni" per confermare.</p>
        </div>
      )}

      <div className="flex gap-6 items-start">
        {/* Left nav */}
        <div className="hidden lg:flex flex-col gap-1 w-52 flex-shrink-0 sticky top-24">
          {SECTIONS.map(sec => {
            const active = activeSection === sec.id
            return (
              <button key={sec.id} onClick={() => setActiveSection(sec.id)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-left transition-all"
                style={{
                  background: active ? 'linear-gradient(135deg, var(--red)18 0%, var(--red2)12 100%)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--muted)',
                  border: `1px solid ${active ? 'rgba(208,0,58,0.25)' : 'transparent'}`,
                  boxShadow: active ? 'inset 3px 0 0 var(--red2)' : 'none',
                }}>
                <sec.icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? 'var(--red2)' : 'inherit' }} />
                {sec.label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto flex-shrink-0" style={{ color: 'var(--red2)' }} />}
              </button>
            )
          })}
        </div>

        {/* Mobile tabs */}
        <div className="lg:hidden w-full">
          <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
            {SECTIONS.map(sec => {
              const active = activeSection === sec.id
              return (
                <button key={sec.id} onClick={() => setActiveSection(sec.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all"
                  style={{
                    background: active ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'var(--panel)',
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
          {activeSection === 'profilo' && <ProfiloAzienda s={settings} upd={upd} />}
          {activeSection === 'tema' && <TemaSection />}
          {activeSection === 'branding' && <Branding s={settings} upd={upd} />}
          {activeSection === 'ruoli' && <RuoliPermessi />}
          {activeSection === 'notifiche' && <NotificheSection s={settings} upd={upd} />}
          {activeSection === 'sicurezza' && <SicurezzaSection s={settings} upd={upd} />}
          {activeSection === 'dati' && <DatiApplicazione />}
          {activeSection === 'dashboard' && <ConfigDashboard s={settings} upd={upd} />}
          {activeSection === 'fly' && <FlyConfig s={settings} upd={upd} />}
        </div>
      </div>
    </div>
  )
}
