import { useState, useEffect, FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { buildBadgeUrl } from '@/lib/badge-qr'
import {
  fetchPublicRegistrationSite,
  submitPublicRegistration,
  sendRegistrationConfirmationEmail,
  PublicRegistrationSite,
  PublicRegistrationField,
  RegistrationResult,
  EmailDeliveryStatus,
} from '@/lib/public-registration-service'

function getThemeColor(site: PublicRegistrationSite, key: string, fallback: string): string {
  const theme = site.theme
  if (theme && typeof theme[key] === 'string' && (theme[key] as string).length > 0) {
    return theme[key] as string
  }
  return fallback
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: PublicRegistrationField
  value: unknown
  onChange: (key: string, val: unknown) => void
}) {
  const id = `field-${field.field_key}`
  const baseInput =
    'pr-input w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors'

  const label = (
    <label htmlFor={id} className="pr-label block text-sm font-medium mb-1">
      {field.label}
      {field.required && <span className="text-red-500 ml-1">*</span>}
    </label>
  )

  const helpText = field.help_text ? (
    <p className="mt-1 text-xs pr-muted">{field.help_text}</p>
  ) : null

  if (field.field_type === 'checkbox') {
    return (
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={id}
          checked={value === true}
          onChange={(e) => onChange(field.field_key, e.target.checked)}
          className="pr-checkbox mt-1 h-4 w-4 rounded border-gray-300"
        />
        <div>
          <label htmlFor={id} className="pr-label text-sm">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {helpText}
        </div>
      </div>
    )
  }

  if (field.field_type === 'select') {
    return (
      <div>
        {label}
        <select
          id={id}
          value={(value as string) || ''}
          onChange={(e) => onChange(field.field_key, e.target.value)}
          className={baseInput}
        >
          <option value="">{field.placeholder || 'Seleziona...'}</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {helpText}
      </div>
    )
  }

  if (field.field_type === 'textarea') {
    return (
      <div>
        {label}
        <textarea
          id={id}
          value={(value as string) || ''}
          onChange={(e) => onChange(field.field_key, e.target.value)}
          placeholder={field.placeholder || ''}
          rows={3}
          className={baseInput + ' resize-y'}
        />
        {helpText}
      </div>
    )
  }

  const typeMap: Record<string, string> = {
    text: 'text',
    email: 'email',
    phone: 'tel',
    number: 'number',
    date: 'date',
  }

  return (
    <div>
      {label}
      <input
        id={id}
        type={typeMap[field.field_type] || 'text'}
        value={(value as string) || ''}
        onChange={(e) => onChange(field.field_key, e.target.value)}
        placeholder={field.placeholder || ''}
        className={baseInput}
      />
      {helpText}
    </div>
  )
}

const PUBLIC_CONTENT_LABELS: Record<string, string> = {
  event_info: 'Informazioni sull\'evento',
  program: 'Programma',
  venue: 'Luogo',
  instructions: 'Indicazioni operative',
  contacts: 'Contatti',
}

const PUBLIC_CONTENT_KEYS = ['event_info', 'program', 'venue', 'instructions', 'contacts'] as const

function ContentSections({ content }: { content: Record<string, unknown> | null }) {
  if (!content) return null
  const sections = PUBLIC_CONTENT_KEYS
    .filter(k => typeof content[k] === 'string' && (content[k] as string).trim().length > 0)
    .map(k => ({ key: k, label: PUBLIC_CONTENT_LABELS[k], text: content[k] as string }))
  if (sections.length === 0) return null
  return (
    <div className="space-y-4">
      {sections.map(s => (
        <div key={s.key} className="bg-white rounded-xl shadow-sm p-5 sm:p-6 overflow-hidden">
          <h2 className="text-base font-semibold mb-2">{s.label}</h2>
          <p className="pr-muted text-sm leading-relaxed" style={{ whiteSpace: 'pre-line', overflowWrap: 'break-word' }}>{s.text}</p>
        </div>
      ))}
    </div>
  )
}

export default function PublicRegistration() {
  const { slug } = useParams<{ slug: string }>()
  const [site, setSite] = useState<PublicRegistrationSite | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<RegistrationResult | null>(null)
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [emailRetrying, setEmailRetrying] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [dietary, setDietary] = useState('')
  const [accessibility, setAccessibility] = useState('')
  const [customAnswers, setCustomAnswers] = useState<Record<string, unknown>>({})
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setError('Pagina non trovata.')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchPublicRegistrationSite(slug)
      .then((data) => {
        if (cancelled) return
        if (!data) {
          setError('Questa pagina di registrazione non è disponibile.')
        } else {
          setSite(data)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Errore di caricamento.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [slug])

  function handleCustomChange(key: string, val: unknown) {
    setCustomAnswers((prev) => ({ ...prev, [key]: val }))
  }

  function validate(): boolean {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setValidationError('Nome, cognome ed email sono obbligatori.')
      return false
    }
    if (!privacyAccepted) {
      setValidationError('Devi accettare l\'informativa sulla privacy.')
      return false
    }
    if (site?.fields) {
      for (const field of site.fields) {
        if (!field.required) continue
        const val = customAnswers[field.field_key]
        if (field.field_type === 'checkbox') {
          if (val !== true) {
            setValidationError(`Il campo "${field.label}" è obbligatorio.`)
            return false
          }
        } else {
          if (!val || (typeof val === 'string' && !val.trim())) {
            setValidationError(`Il campo "${field.label}" è obbligatorio.`)
            return false
          }
        }
      }
    }
    setValidationError(null)
    return true
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!slug || !site || submitting) return
    if (!validate()) return

    setSubmitting(true)
    setError(null)
    try {
      const res = await submitPublicRegistration({
        slug,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        company: company.trim() || null,
        job_title: jobTitle.trim() || null,
        dietary_requirements: dietary.trim() || null,
        accessibility_requirements: accessibility.trim() || null,
        custom_answers: Object.keys(customAnswers).length > 0 ? customAnswers : null,
        privacy_accepted: privacyAccepted,
        marketing_consent: marketingConsent,
        honeypot: honeypot || null,
      })
      setResult(res)
      if (res.registration_id && res.qr_token) {
        fireEmail(res.registration_id, res.qr_token)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Si è verificato un errore. Riprovare più tardi.')
    } finally {
      setSubmitting(false)
    }
  }

  async function fireEmail(regId: string, qrTk: string) {
    setEmailState('sending')
    const status: EmailDeliveryStatus = await sendRegistrationConfirmationEmail(regId, qrTk)
    if (status === 'sent' || status === 'already_sent') {
      setEmailState('sent')
    } else if (status === 'processing') {
      setEmailState('sent')
    } else {
      setEmailState('failed')
    }
  }

  async function handleRetryEmail() {
    if (emailRetrying || !result?.registration_id || !result?.qr_token) return
    setEmailRetrying(true)
    await fireEmail(result.registration_id, result.qr_token)
    setEmailRetrying(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-sm">Caricamento...</p>
        </div>
      </div>
    )
  }

  if (!site) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Pagina non disponibile</h1>
          <p className="text-gray-600 text-sm">{error || 'Questa pagina di registrazione non è disponibile.'}</p>
        </div>
      </div>
    )
  }

  const primaryColor = getThemeColor(site, 'primary_color', '#2563eb')
  const bgColor = getThemeColor(site, 'background_color', '#f9fafb')
  const textColor = getThemeColor(site, 'text_color', '#1f2937')

  const themeStyle = `
    .pr-page { --pr-primary: ${primaryColor}; --pr-bg: ${bgColor}; --pr-text: ${textColor}; }
    .pr-page { background-color: var(--pr-bg); color: var(--pr-text); }
    .pr-page h1, .pr-page h2 { color: var(--pr-text); }
    .pr-page .pr-muted { color: color-mix(in srgb, var(--pr-text) 70%, transparent); }
    .pr-page .pr-label { color: var(--pr-text); }
    .pr-page a.pr-link { color: var(--pr-primary); }
    .pr-page .pr-input:focus { outline: none; box-shadow: 0 0 0 2px var(--pr-primary), 0 0 0 4px color-mix(in srgb, var(--pr-primary) 25%, transparent); border-color: var(--pr-primary); }
    .pr-page .pr-btn-primary { background-color: var(--pr-primary); color: #fff; }
    .pr-page .pr-btn-primary:hover { opacity: 0.9; }
    .pr-page .pr-btn-primary:disabled { opacity: 0.5; }
    .pr-page .pr-checkbox:checked { accent-color: var(--pr-primary); }
  `

  if (result) {
    const isWaitlist = result.registration_status === 'waitlist'
    return (
      <div className="pr-page min-h-screen flex items-center justify-center px-4 py-12">
        <style>{themeStyle}{`
        @media print {
          body { font-size: 14px; }
          .print-hidden { display: none !important; }
          .print-section { break-inside: avoid; }
        }
      `}</style>
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          {site.logo_url && (
            <img src={site.logo_url} alt="" className="h-12 mx-auto mb-6 object-contain" />
          )}
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: primaryColor + '1a' }}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke={primaryColor} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">
            {isWaitlist ? 'Inserimento in lista d\'attesa' : 'Registrazione confermata'}
          </h1>
          {result.confirmation_message && (
            <p className="pr-muted mt-4 text-sm leading-relaxed">{result.confirmation_message}</p>
          )}

          {!isWaitlist && result.registration_status === 'confirmed' && result.qr_token && result.qr_token.trim() !== '' ? (
            <div className="mt-6 print-section">
              <div className="inline-block p-4 bg-white border border-gray-200 rounded-xl">
                <QRCodeSVG
                  value={buildBadgeUrl(result.qr_token)}
                  size={200}
                  level="M"
                  bgColor="#ffffff"
                  marginSize={2}
                  title="Codice QR di accesso all'evento"
                />
              </div>
              <p className="pr-muted text-sm mt-4" style={{ minHeight: '1.25rem' }}>
                Conserva questo codice e presentalo all'ingresso.
              </p>
              <button
                type="button"
                onClick={() => window.print()}
                className="pr-btn-primary mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity print-hidden"
              >
                Stampa o salva QR
              </button>
            </div>
          ) : isWaitlist ? (
            <p className="pr-muted text-sm mt-4">
              Riceverai conferma prima di poter accedere all'evento.
            </p>
          ) : null}

          {emailState === 'sending' && (
            <p className="pr-muted text-sm mt-4 flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              Invio email di conferma...
            </p>
          )}
          {emailState === 'sent' && (
            <p className="text-sm mt-4" style={{ color: '#16a34a' }}>Email di conferma inviata.</p>
          )}
          {emailState === 'failed' && (
            <div className="mt-4 space-y-2">
              <p className="text-sm" style={{ color: '#b45309' }}>
                Registrazione completata, ma non è stato possibile inviare l'email.
              </p>
              <button
                type="button"
                disabled={emailRetrying}
                onClick={handleRetryEmail}
                className="pr-btn-primary inline-flex items-center justify-center rounded-lg text-sm font-medium transition-opacity print-hidden"
                style={{ height: '44px', paddingLeft: '20px', paddingRight: '20px' }}
              >
                {emailRetrying ? 'Invio in corso...' : 'Riprova invio email'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="pr-page min-h-screen py-8 px-4">
      <style>{themeStyle}</style>
      {site.hero_image_url && (
        <div className="max-w-3xl mx-auto mb-6 rounded-2xl overflow-hidden shadow-md">
          <img
            src={site.hero_image_url}
            alt=""
            className="w-full h-48 sm:h-64 object-cover"
          />
        </div>
      )}

      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          {site.logo_url && (
            <img src={site.logo_url} alt="" className="h-12 mx-auto mb-4 object-contain" />
          )}
          <h1 className="text-2xl sm:text-3xl font-bold">{site.title}</h1>
          {site.subtitle && <p className="pr-muted text-lg mt-2">{site.subtitle}</p>}
          {site.description && <p className="pr-muted text-sm mt-3 leading-relaxed">{site.description}</p>}
        </div>

        {/* Content sections */}
        <ContentSections content={site.content} />

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 space-y-5">
          {(error || validationError) && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {validationError || error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="pr-label block text-sm font-medium mb-1">
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="pr-input w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="pr-label block text-sm font-medium mb-1">
                Cognome <span className="text-red-500">*</span>
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="pr-input w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="pr-label block text-sm font-medium mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pr-input w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className="pr-label block text-sm font-medium mb-1">Telefono</label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pr-input w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors"
              />
            </div>
            <div>
              <label htmlFor="company" className="pr-label block text-sm font-medium mb-1">Azienda</label>
              <input
                id="company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="pr-input w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="jobTitle" className="pr-label block text-sm font-medium mb-1">Ruolo</label>
            <input
              id="jobTitle"
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="pr-input w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors"
            />
          </div>

          <div>
            <label htmlFor="dietary" className="pr-label block text-sm font-medium mb-1">Esigenze alimentari</label>
            <input
              id="dietary"
              type="text"
              value={dietary}
              onChange={(e) => setDietary(e.target.value)}
              className="pr-input w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors"
            />
          </div>

          <div>
            <label htmlFor="accessibility" className="pr-label block text-sm font-medium mb-1">Requisiti di accessibilità</label>
            <input
              id="accessibility"
              type="text"
              value={accessibility}
              onChange={(e) => setAccessibility(e.target.value)}
              className="pr-input w-full rounded-lg border border-gray-300 px-4 py-3 text-sm transition-colors"
            />
          </div>

          {site.fields.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-gray-100">
              {site.fields
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((field) => (
                  <DynamicField
                    key={field.id}
                    field={field}
                    value={customAnswers[field.field_key]}
                    onChange={handleCustomChange}
                  />
                ))}
            </div>
          )}

          <div className="space-y-3 pt-2 border-t border-gray-100">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="privacy"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="pr-checkbox mt-1 h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="privacy" className="pr-label text-sm">
                {site.privacy_text || 'Accetto l\'informativa sulla privacy'} <span className="text-red-500">*</span>
                {site.privacy_url && (
                  <>
                    {' '}
                    <a
                      href={site.privacy_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pr-link underline"
                    >
                      Leggi informativa
                    </a>
                  </>
                )}
              </label>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="marketing"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="pr-checkbox mt-1 h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="marketing" className="pr-label text-sm">
                Acconsento a ricevere comunicazioni di marketing
              </label>
            </div>
          </div>

          <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="hp_field">Non compilare</label>
            <input
              id="hp_field"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="pr-btn-primary w-full py-3 px-6 rounded-lg font-semibold text-sm transition-opacity"
          >
            {submitting ? 'Invio in corso...' : 'Registrati'}
          </button>
        </form>
      </div>
    </div>
  )
}
