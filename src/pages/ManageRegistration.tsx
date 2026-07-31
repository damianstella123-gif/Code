import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  fetchEditableRegistration,
  updateEditableRegistration,
  type EditableRegistration,
  type EditableRegistrationField,
  type EditableRegistrationPatch,
} from '../lib/public-registration-service'

/* ── helpers ───────────────────────────────────────────────────── */

function formatExpiry(iso: string): string {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch { return iso }
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: EditableRegistrationField
  value: string
  onChange: (v: string) => void
}) {
  const base: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid #d1d5db', fontSize: 14, lineHeight: 1.5,
    background: '#fff', transition: 'border-color .15s',
  }

  if (field.field_type === 'textarea') {
    return <textarea style={{ ...base, minHeight: 80, resize: 'vertical' }} value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />
  }

  if (field.field_type === 'select' && field.options?.length) {
    return (
      <select style={base} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{field.placeholder || 'Seleziona...'}</option>
        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  if (field.field_type === 'checkbox') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={value === 'true'} onChange={e => onChange(String(e.target.checked))} />
        {field.label}
      </label>
    )
  }

  const typeMap: Record<string, string> = { date: 'date', number: 'number', email: 'email', phone: 'tel' }

  return <input type={typeMap[field.field_type] ?? 'text'} style={base} value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} />
}

/* ── main page ─────────────────────────────────────────────────── */

export default function ManageRegistration() {
  const { token } = useParams<{ token: string }>()
  const [reg, setReg] = useState<EditableRegistration | null>(null)
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)

  // form state
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [dietary, setDietary] = useState('')
  const [accessibility, setAccessibility] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({})

  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // security headers via meta tags
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.appendChild(robots)
    const referrer = document.createElement('meta')
    referrer.name = 'referrer'
    referrer.content = 'no-referrer'
    return () => { robots.remove(); referrer.remove() }
  }, [])

  const load = useCallback(async () => {
    if (!token || !/^[0-9a-fA-F]{64}$/.test(token)) {
      setInvalid(true)
      setLoading(false)
      return
    }
    const data = await fetchEditableRegistration(token)
    if (!data) {
      setInvalid(true)
      setLoading(false)
      return
    }
    setReg(data)
    setPhone(data.phone ?? '')
    setCompany(data.company ?? '')
    setJobTitle(data.job_title ?? '')
    setDietary(data.dietary_requirements ?? '')
    setAccessibility(data.accessibility_requirements ?? '')
    setMarketingConsent(data.marketing_consent ?? false)
    const ca: Record<string, string> = {}
    if (data.custom_answers) {
      for (const [k, v] of Object.entries(data.custom_answers)) {
        ca[k] = typeof v === 'boolean' ? String(v) : String(v ?? '')
      }
    }
    setCustomAnswers(ca)
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !reg) return
    setError(null)
    setSaving(true)
    try {
      const patch: EditableRegistrationPatch = {
        phone: phone.trim() || null,
        company: company.trim() || null,
        job_title: jobTitle.trim() || null,
        dietary_requirements: dietary.trim() || null,
        accessibility_requirements: accessibility.trim() || null,
        marketing_consent: marketingConsent,
      }
      if (Object.keys(customAnswers).length > 0) {
        const cleaned: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(customAnswers)) {
          cleaned[k] = v === 'true' ? true : v === 'false' ? false : v
        }
        patch.custom_answers = cleaned
      }
      const result = await updateEditableRegistration(token, patch)
      if (result.ok) {
        setSuccess(true)
      } else {
        setError(result.error ?? 'Si è verificato un errore.')
      }
    } catch {
      setError('Si è verificato un errore. Riprovare più tardi.')
    } finally {
      setSaving(false)
    }
  }

  // theme
  const primaryColor = (reg?.site_theme as Record<string, string>)?.primaryColor || '#2563eb'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid #d1d5db', fontSize: 14, lineHeight: 1.5,
    background: '#fff', transition: 'border-color .15s',
  }

  // ── loading ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #d1d5db', borderTopColor: '#6b7280', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#6b7280', fontSize: 14 }}>Caricamento...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  // ── invalid / expired ───────────────────────────────────────────
  if (invalid || !reg) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', padding: '16px' }}>
        <div style={{ maxWidth: 440, width: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,.08)', padding: 32, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 8 }}>Collegamento non valido</h1>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
            Questo collegamento potrebbe essere scaduto o non essere più attivo. Contatta l'organizzazione per assistenza.
          </p>
        </div>
      </div>
    )
  }

  // ── success ────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', padding: '16px' }}>
        <div style={{ maxWidth: 440, width: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,.08)', padding: 32, textAlign: 'center' }}>
          {reg.site_logo_url && <img src={reg.site_logo_url} alt="" style={{ height: 48, margin: '0 auto 20px', objectFit: 'contain' }} />}
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: primaryColor + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 8 }}>Dati aggiornati</h1>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>Le modifiche alla tua registrazione sono state salvate.</p>
          <button
            type="button"
            onClick={() => { setSuccess(false); load() }}
            style={{ marginTop: 20, padding: '10px 24px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 14, cursor: 'pointer', color: '#374151' }}
          >
            Torna al modulo
          </button>
        </div>
      </div>
    )
  }

  // ── form ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '32px 16px' }}>
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {reg.site_logo_url && <img src={reg.site_logo_url} alt="" style={{ height: 48, margin: '0 auto 16px', objectFit: 'contain' }} />}
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 4 }}>{reg.event_title || reg.site_title}</h1>
          <p style={{ fontSize: 14, color: '#6b7280' }}>Modifica i dati della tua registrazione</p>
          {reg.manage_token_expires_at && (
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              Possibilità di modifica fino al {formatExpiry(reg.manage_token_expires_at)}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,.08)', padding: '24px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Standard fields */}
          <div style={{ display: 'grid', gap: 16 }}>
            <FieldGroup label="Telefono">
              <input type="tel" style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Numero di telefono" />
            </FieldGroup>
            <FieldGroup label="Azienda">
              <input type="text" style={inputStyle} value={company} onChange={e => setCompany(e.target.value)} placeholder="Nome azienda" />
            </FieldGroup>
            <FieldGroup label="Ruolo">
              <input type="text" style={inputStyle} value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Titolo o ruolo" />
            </FieldGroup>
            <FieldGroup label="Esigenze alimentari">
              <input type="text" style={inputStyle} value={dietary} onChange={e => setDietary(e.target.value)} placeholder="Allergie, intolleranze..." />
            </FieldGroup>
            <FieldGroup label="Esigenze di accessibilità">
              <input type="text" style={inputStyle} value={accessibility} onChange={e => setAccessibility(e.target.value)} placeholder="Sedia a rotelle, interprete LIS..." />
            </FieldGroup>

            {/* Dynamic fields */}
            {reg.fields.length > 0 && (
              <>
                <div style={{ borderTop: '1px solid #e5e7eb', margin: '4px 0' }} />
                {reg.fields.filter(f => f.field_type !== 'checkbox').map(f => (
                  <FieldGroup key={f.field_key} label={f.label} required={f.required} helpText={f.help_text}>
                    <DynamicField field={f} value={customAnswers[f.field_key] ?? ''} onChange={v => setCustomAnswers(prev => ({ ...prev, [f.field_key]: v }))} />
                  </FieldGroup>
                ))}
                {reg.fields.filter(f => f.field_type === 'checkbox').map(f => (
                  <div key={f.field_key}>
                    <DynamicField field={f} value={customAnswers[f.field_key] ?? 'false'} onChange={v => setCustomAnswers(prev => ({ ...prev, [f.field_key]: v }))} />
                    {f.help_text && <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{f.help_text}</p>}
                  </div>
                ))}
              </>
            )}

            {/* Marketing consent */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={e => setMarketingConsent(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span style={{ color: '#374151', lineHeight: 1.5 }}>
                  Acconsento a ricevere comunicazioni relative a futuri eventi
                </span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              marginTop: 20, width: '100%', padding: '12px 0',
              borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              background: primaryColor, color: '#fff', fontSize: 15, fontWeight: 600,
              opacity: saving ? 0.6 : 1, transition: 'opacity .15s',
            }}
          >
            {saving ? 'Salvataggio...' : 'Salva modifiche'}
          </button>
        </form>
      </div>
    </div>
  )
}

function FieldGroup({ label, required, helpText, children }: {
  label: string
  required?: boolean
  helpText?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      {children}
      {helpText && <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{helpText}</p>}
    </div>
  )
}
