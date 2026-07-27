import { useState, useEffect, useCallback, useRef } from 'react'
import { Globe, Copy, Trash2, Save, Send, RotateCcw, XCircle, Eye, Lock, ChevronDown, ChevronRight, ExternalLink, Mail, MessageCircle, Upload, X } from 'lucide-react'
import { useToast } from '@/lib/toast'
import {
  fetchRegistrationSites,
  createRegistrationSite,
  updateRegistrationSite,
  deleteRegistrationSite,
  canManageRegistration,
  normalizeRegistrationSlug,
  type RegistrationSite,
  type RegistrationSiteUpdate,
  type RegistrationAssetType,
  uploadRegistrationAsset,
  deleteRegistrationAsset,
} from '@/lib/registration-site-service'
import RegistrationFieldsManager from '@/components/RegistrationFieldsManager'
import RegistrationParticipantsManager from '@/components/RegistrationParticipantsManager'

const PUBLIC_APP_URL =
  (import.meta.env.VITE_PUBLIC_APP_URL || 'https://simmetriasynergy.netlify.app')
    .replace(/\/+$/, '')

const THEME_DEFAULTS = {
  primary_color: '#2563EB',
  background_color: '#F9FAFB',
  text_color: '#1F2937',
}

interface ThemeColors {
  primary_color: string
  background_color: string
  text_color: string
}

function isValidHex(v: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(v)
}

function readThemeColors(theme: Record<string, unknown> | null | undefined): ThemeColors {
  return {
    primary_color: typeof theme?.primary_color === 'string' && isValidHex(theme.primary_color) ? theme.primary_color : THEME_DEFAULTS.primary_color,
    background_color: typeof theme?.background_color === 'string' && isValidHex(theme.background_color) ? theme.background_color : THEME_DEFAULTS.background_color,
    text_color: typeof theme?.text_color === 'string' && isValidHex(theme.text_color) ? theme.text_color : THEME_DEFAULTS.text_color,
  }
}

interface Props {
  eventId: string
  eventName: string
  isArchived?: boolean
}

interface FormState {
  title: string
  slug: string
  subtitle: string
  description: string
  privacy_url: string
  privacy_text: string
  confirmation_message: string
  capacity: string
  waitlist_enabled: boolean
  opens_at: string
  closes_at: string
  logo_url: string
  hero_image_url: string
}

const emptyForm: FormState = {
  title: '',
  slug: '',
  subtitle: '',
  description: '',
  privacy_url: '',
  privacy_text: '',
  confirmation_message: '',
  capacity: '',
  waitlist_enabled: false,
  opens_at: '',
  closes_at: '',
  logo_url: '',
  hero_image_url: '',
}

function localToUtc(value: string): string | null {
  if (!value) return null
  return new Date(value).toISOString()
}

function utcToLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function siteToForm(site: RegistrationSite): FormState {
  return {
    title: site.title ?? '',
    slug: site.slug ?? '',
    subtitle: site.subtitle ?? '',
    description: site.description ?? '',
    privacy_url: site.privacy_url ?? '',
    privacy_text: site.privacy_text ?? '',
    confirmation_message: site.confirmation_message ?? '',
    capacity: site.capacity != null ? String(site.capacity) : '',
    waitlist_enabled: site.waitlist_enabled ?? false,
    opens_at: utcToLocal(site.opens_at),
    closes_at: utcToLocal(site.closes_at),
    logo_url: site.logo_url ?? '',
    hero_image_url: site.hero_image_url ?? '',
  }
}

function formToPayload(form: FormState): RegistrationSiteUpdate {
  return {
    title: form.title.trim(),
    slug: normalizeRegistrationSlug(form.slug),
    subtitle: form.subtitle.trim() || null,
    description: form.description.trim() || null,
    privacy_url: form.privacy_url.trim() || null,
    privacy_text: form.privacy_text.trim() || null,
    confirmation_message: form.confirmation_message.trim() || null,
    capacity: form.capacity ? parseInt(form.capacity, 10) : null,
    waitlist_enabled: form.waitlist_enabled,
    opens_at: localToUtc(form.opens_at),
    closes_at: localToUtc(form.closes_at),
    logo_url: form.logo_url.trim() || null,
    hero_image_url: form.hero_image_url.trim() || null,
  }
}

function translateRegistrationError(err: any): string {
  const m = (err?.message ?? '').toLowerCase()
  const code = err?.code ?? ''
  if (code === '23505' || m.includes('duplicate') || m.includes('unique') || m === 'duplicate_slug')
    return 'Questo slug è già in uso. Scegliere un altro indirizzo.'
  if (code === '23514' || m.includes('slug') || m.includes('check'))
    return 'Lo slug contiene caratteri non validi o è troppo corto (min 3 caratteri alfanumerici).'
  if (m.includes('privacy'))
    return 'Inserire URL privacy o testo privacy per pubblicare.'
  if (m.includes('date') || m.includes('closes_at'))
    return 'Le date di apertura/chiusura non sono valide.'
  if (code === '42501' || m.includes('permission') || m.includes('policy'))
    return 'Permessi insufficienti per questa operazione.'
  return 'Errore durante il salvataggio. Riprova o verifica i dati inseriti.'
}

function validateForPublish(form: FormState): string | null {
  if (!form.title.trim()) return 'Il titolo è obbligatorio per pubblicare.'
  const slug = normalizeRegistrationSlug(form.slug)
  if (slug.length < 3) return 'Lo slug deve avere almeno 3 caratteri.'
  if (!form.privacy_url.trim() && !form.privacy_text.trim()) {
    return 'Inserire URL privacy o testo privacy per pubblicare.'
  }
  if (form.opens_at && form.closes_at && new Date(form.closes_at) <= new Date(form.opens_at)) {
    return 'La data di chiusura deve essere successiva a quella di apertura.'
  }
  return null
}

// ─── Color Control ─────────────────────────────────────────────────────────

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])

  const commitText = (v: string) => {
    const normalized = v.startsWith('#') ? v : `#${v}`
    if (isValidHex(normalized)) onChange(normalized)
    else setText(value)
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="color"
          value={value}
          onChange={e => { onChange(e.target.value); setText(e.target.value) }}
          style={{ width: 44, height: 44, border: '1px solid #d1d5db', borderRadius: 6, padding: 2, cursor: 'pointer' }}
        />
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={e => commitText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value) }}
          maxLength={7}
          placeholder="#000000"
          style={{ height: 44, width: 100, fontSize: 14, padding: '0 10px', border: '1px solid #d1d5db', borderRadius: 6, fontFamily: 'monospace' }}
        />
      </div>
    </div>
  )
}

// ─── Asset Upload Control ──────────────────────────────────────────────────

interface AssetUploadControlProps {
  label: string
  assetType: RegistrationAssetType
  currentUrl: string
  siteId: string | null
  eventId: string
  uploading: boolean
  disabled: boolean
  previewStyle: 'logo' | 'hero'
  onUploadStart: () => void
  onUploadEnd: (publicUrl: string | null) => void
  onRemove: () => void
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
}

function AssetUploadControl({
  label, assetType, currentUrl, siteId, eventId,
  uploading, disabled, previewStyle, onUploadStart, onUploadEnd, onRemove, showToast,
}: AssetUploadControlProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file || !siteId) return
    onUploadStart()
    try {
      const { publicUrl } = await uploadRegistrationAsset(eventId, siteId, assetType, file)
      onUploadEnd(publicUrl)
    } catch (err: any) {
      showToast(err?.message || 'Caricamento non riuscito.', 'error')
      onUploadEnd(null)
    }
  }

  if (!siteId) {
    return (
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{label}</label>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Salva prima la bozza per caricare le immagini.</p>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>{label}</label>

      {currentUrl && (
        <div style={{ marginBottom: 8 }}>
          {previewStyle === 'logo' ? (
            <img src={currentUrl} alt="Logo" style={{ maxHeight: 100, maxWidth: '100%', objectFit: 'contain', borderRadius: 6, background: '#f3f4f6' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 6, overflow: 'hidden', background: '#f3f4f6' }}>
              <img src={currentUrl} alt="Hero" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          disabled={uploading || disabled}
          onClick={() => fileRef.current?.click()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: '0 16px', fontSize: 14, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: uploading || disabled ? 'not-allowed' : 'pointer', opacity: uploading || disabled ? 0.6 : 1 }}
        >
          <Upload size={16} />
          {uploading ? 'Caricamento…' : 'Scegli file'}
        </button>

        {currentUrl && (
          <button
            type="button"
            onClick={onRemove}
            disabled={uploading || disabled}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: '0 16px', fontSize: 14, borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: uploading || disabled ? 'not-allowed' : 'pointer', opacity: uploading || disabled ? 0.6 : 1 }}
          >
            <X size={16} />
            Rimuovi
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function EventRegistrationManager({ eventId, eventName, isArchived }: Props) {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [site, setSite] = useState<RegistrationSite | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showDelete, setShowDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)

  // Collapsible sections
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [uploadingAsset, setUploadingAsset] = useState<RegistrationAssetType | null>(null)
  const [themeOpen, setThemeOpen] = useState(false)
  const [themeColors, setThemeColors] = useState<ThemeColors>(THEME_DEFAULTS)

  const readOnly = isArchived || !canManage

  const load = useCallback(async () => {
    try {
      const [sites, perm] = await Promise.all([
        fetchRegistrationSites(eventId),
        canManageRegistration(eventId).catch(() => false),
      ])
      setCanManage(perm)
      if (sites.length > 0) {
        setSite(sites[0])
        setForm(siteToForm(sites[0]))
        setThemeColors(readThemeColors(sites[0].theme))
      } else {
        setSite(null)
        setForm(emptyForm)
        setThemeColors(THEME_DEFAULTS)
      }
    } catch (err: any) {
      showToast(err.message || 'Errore caricamento', 'error')
    } finally {
      setLoading(false)
    }
  }, [eventId, showToast])

  useEffect(() => { load() }, [load])

  const handleChange = (key: keyof FormState, value: string | boolean) => {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      // Auto-generate slug from title for new sites only
      if (key === 'title' && !site) {
        next.slug = normalizeRegistrationSlug(value as string)
      }
      return next
    })
  }

  const handleSlugChange = (value: string) => {
    setForm(prev => ({ ...prev, slug: normalizeRegistrationSlug(value) }))
  }

  const tryDeleteStorageAsset = (url: string) => {
    if (!url) return
    const marker = '/registration-assets/'
    const idx = url.indexOf(marker)
    if (idx === -1) return
    const objectPath = url.substring(idx + marker.length)
    if (!objectPath || objectPath.includes('..')) return
    deleteRegistrationAsset(objectPath).catch(() => {
      showToast('Immagine rimossa dal sito, ma il file nello storage non è stato eliminato.', 'info')
    })
  }

  const handleSave = async (publish?: boolean) => {
    if (readOnly) return
    setPublishError(null)

    // Normalize slug before any validation
    const normalizedSlug = normalizeRegistrationSlug(form.slug)
    const normalizedForm = { ...form, slug: normalizedSlug }
    setForm(normalizedForm)

    if (publish) {
      const err = validateForPublish(normalizedForm)
      if (err) { setPublishError(err); return }
      if (!site) {
        setPublishError('Salva prima la bozza per poter pubblicare.')
        return
      }
    }

    // Date validation
    if (normalizedForm.opens_at && normalizedForm.closes_at && new Date(normalizedForm.closes_at) <= new Date(normalizedForm.opens_at)) {
      setPublishError('La data di chiusura deve essere successiva a quella di apertura.')
      return
    }

    setSaving(true)
    try {
      const payload = formToPayload(normalizedForm)
      const existingTheme = (site?.theme ?? {}) as Record<string, unknown>
      payload.theme = { ...existingTheme, ...themeColors }
      if (publish) {
        payload.status = 'published'
        if (!site?.published_at) payload.published_at = new Date().toISOString()
      } else if (site && site.status === 'published') {
        payload.status = 'published'
      }
      let updated: RegistrationSite
      if (site) {
        updated = await updateRegistrationSite(site.id, payload)
      } else {
        updated = await createRegistrationSite({
          event_id: eventId,
          title: payload.title!,
          slug: payload.slug!,
          ...payload,
        })
      }
      setSite(updated)
      setForm(siteToForm(updated))
      setEditing(false)
      setPublishError(null)
      showToast(publish ? 'Sito pubblicato con successo' : 'Modifiche salvate', 'success')
    } catch (err: any) {
      const msg = translateRegistrationError(err)
      setPublishError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = async () => {
    if (!site || readOnly) return
    setSaving(true)
    try {
      const updated = await updateRegistrationSite(site.id, { status: 'closed' })
      setSite(updated)
      setForm(siteToForm(updated))
      showToast('Registrazioni chiuse', 'success')
    } catch (err: any) {
      showToast(err.message || 'Errore', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleReopen = async () => {
    if (!site || readOnly) return
    setSaving(true)
    try {
      const updated = await updateRegistrationSite(site.id, { status: 'draft' })
      setSite(updated)
      setForm(siteToForm(updated))
      showToast('Riaperto come bozza', 'success')
    } catch (err: any) {
      showToast(err.message || 'Errore', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!site || readOnly) return
    setSaving(true)
    try {
      await deleteRegistrationSite(site.id)
      setSite(null)
      setForm(emptyForm)
      setShowDelete(false)
      setEditing(false)
      showToast('Sito registrazione eliminato', 'success')
    } catch (err: any) {
      showToast(err.message || 'Errore eliminazione', 'error')
    } finally {
      setSaving(false)
    }
  }

  const copyLink = () => {
    if (!site) return
    const url = `${PUBLIC_APP_URL}/r/${site.slug}`
    navigator.clipboard.writeText(url).then(
      () => showToast('Link copiato negli appunti', 'success'),
      () => showToast('Impossibile copiare il link', 'error'),
    )
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingText}>Caricamento registrazione...</div>
      </div>
    )
  }

  // Empty state
  if (!site && !editing) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <Globe size={40} style={{ color: 'var(--muted)', marginBottom: 16 }} />
          <h3 style={styles.emptyTitle}>Nessun sito di registrazione</h3>
          <p style={styles.emptyDesc}>
            Non è ancora stato configurato un sito di registrazione per questo evento.
          </p>
          {!readOnly && (
            <button
              style={styles.btnPrimary}
              onClick={() => { setForm({ ...emptyForm, title: eventName, slug: normalizeRegistrationSlug(eventName) }); setEditing(true) }}
            >
              Crea Sito Registrazione
            </button>
          )}
          {readOnly && !canManage && (
            <p style={styles.readOnlyNote}>
              <Lock size={14} style={{ marginRight: 4 }} />
              Non hai i permessi per gestire la registrazione.
            </p>
          )}
        </div>
      </div>
    )
  }

  // View mode (read-only or not editing)
  if (site && !editing) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h3 style={styles.siteTitle}>{site.title}</h3>
            <StatusBadge status={site.status} />
          </div>
          <div style={styles.headerActions}>
            {!readOnly && (
              <button style={styles.btnPrimary} onClick={() => setEditing(true)}>
                Modifica
              </button>
            )}
          </div>
        </div>

        {site.status === 'published' && (
          <>
            <div style={styles.publicPath}>
              <Globe size={14} style={{ color: 'var(--green)' }} />
              <a href={`${PUBLIC_APP_URL}/r/${site.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-code)', fontSize: 13, color: 'inherit', textDecoration: 'none' }}>
                {PUBLIC_APP_URL}/r/{site.slug}
              </a>
            </div>
            <div style={styles.shareRow}>
              <button
                style={styles.btnOutline}
                aria-label="Copia il link di registrazione"
                onClick={copyLink}
              >
                <Copy size={14} /> Copia link
              </button>
              <button
                style={styles.btnOutline}
                aria-label="Apri il sito di registrazione in una nuova scheda"
                onClick={() => window.open(`${PUBLIC_APP_URL}/r/${site.slug}`, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink size={14} /> Apri sito
              </button>
              <button
                style={styles.btnOutline}
                aria-label="Invia il link di registrazione via email"
                onClick={() => {
                  const subject = encodeURIComponent(`Iscrizione: ${site.title}`)
                  const body = encodeURIComponent(`Ciao,\n\nPuoi iscriverti a "${site.title}" al seguente link:\n${PUBLIC_APP_URL}/r/${site.slug}\n\nA presto!`)
                  window.open(`mailto:?subject=${subject}&body=${body}`, '_self')
                }}
              >
                <Mail size={14} /> Invia via email
              </button>
              <button
                style={styles.btnOutline}
                aria-label="Condividi il link di registrazione su WhatsApp"
                onClick={() => {
                  const text = encodeURIComponent(`Ciao! Iscriviti a "${site.title}" qui: ${PUBLIC_APP_URL}/r/${site.slug}`)
                  window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer')
                }}
              >
                <MessageCircle size={14} /> Condividi su WhatsApp
              </button>
            </div>
          </>
        )}

        <div style={styles.infoGrid}>
          <InfoRow label="Sottotitolo" value={site.subtitle} />
          <InfoRow label="Capacità" value={site.capacity != null ? String(site.capacity) : '—'} />
          <InfoRow label="Lista d'attesa" value={site.waitlist_enabled ? 'Attiva' : 'Disattiva'} />
          <InfoRow label="Apertura" value={site.opens_at ? new Date(site.opens_at).toLocaleString('it-IT') : '—'} />
          <InfoRow label="Chiusura" value={site.closes_at ? new Date(site.closes_at).toLocaleString('it-IT') : '—'} />
          <InfoRow label="Pubblicato il" value={site.published_at ? new Date(site.published_at).toLocaleString('it-IT') : '—'} />
        </div>

        <RegistrationFieldsManager siteId={site.id} readOnly={readOnly} />

        <RegistrationParticipantsManager
          eventId={eventId}
          siteId={site.id}
          readOnly={readOnly}
        />

        {!readOnly && (
          <div style={styles.footerActions}>
            {site.status === 'published' && (
              <button style={styles.btnDanger} onClick={handleClose} disabled={saving}>
                <XCircle size={14} /> Chiudi Registrazioni
              </button>
            )}
            {site.status === 'closed' && (
              <button style={styles.btnOutline} onClick={handleReopen} disabled={saving}>
                <RotateCcw size={14} /> Riapri come Bozza
              </button>
            )}
            <button
              style={{ ...styles.btnDanger, background: 'transparent', color: 'var(--red)' }}
              onClick={() => setShowDelete(true)}
              disabled={saving}
            >
              <Trash2 size={14} /> Elimina
            </button>
          </div>
        )}

        {readOnly && !canManage && (
          <p style={styles.readOnlyNote}>
            <Eye size={14} style={{ marginRight: 4 }} />
            Visualizzazione in sola lettura.
          </p>
        )}

        {showDelete && (
          <DeleteConfirmDialog
            saving={saving}
            onConfirm={handleDelete}
            onCancel={() => setShowDelete(false)}
          />
        )}
      </div>
    )
  }

  // ─── Edit/create mode ──────────────────────────────────────────────
  return (
    <div style={styles.container}>
      <h3 style={styles.siteTitle}>{site ? 'Modifica Sito Registrazione' : 'Nuovo Sito Registrazione'}</h3>

      {/* PRIMARY SECTION */}
      <div style={styles.formSection}>
        <Field label="Titolo *" value={form.title} onChange={v => handleChange('title', v)} />
        <Field label="Sottotitolo" value={form.subtitle} onChange={v => handleChange('subtitle', v)} />
        <Field label="Descrizione" value={form.description} onChange={v => handleChange('description', v)} multiline />
        <Field label="Messaggio dopo la registrazione" value={form.confirmation_message} onChange={v => handleChange('confirmation_message', v)} multiline />
      </div>

      {/* SETTINGS SECTION */}
      <CollapsibleSection
        title="Impostazioni iscrizioni"
        open={settingsOpen}
        onToggle={() => setSettingsOpen(o => !o)}
      >
        <div style={styles.formSection}>
          <Field label="Capacità (facoltativa)" value={form.capacity} onChange={v => handleChange('capacity', v)} type="number" placeholder="Nessun limite" />
          <div style={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.waitlist_enabled}
              onChange={e => handleChange('waitlist_enabled', e.target.checked)}
              id="reg_waitlist"
              style={{ width: 18, height: 18 }}
            />
            <label htmlFor="reg_waitlist" style={{ fontSize: 14, color: 'var(--text)', cursor: 'pointer' }}>
              Abilita lista d'attesa
            </label>
          </div>
          <Field label="Apertura iscrizioni" value={form.opens_at} onChange={v => handleChange('opens_at', v)} type="datetime-local" />
          <Field label="Chiusura iscrizioni" value={form.closes_at} onChange={v => handleChange('closes_at', v)} type="datetime-local" />
        </div>
      </CollapsibleSection>

      {/* PRIVACY SECTION */}
      <CollapsibleSection
        title="Privacy"
        open={privacyOpen}
        onToggle={() => setPrivacyOpen(o => !o)}
      >
        <p style={styles.sectionHint}>
          Per pubblicare è necessario inserire almeno un'informativa privacy (URL o testo).
        </p>
        <div style={styles.formSection}>
          <Field label="URL informativa privacy" value={form.privacy_url} onChange={v => handleChange('privacy_url', v)} placeholder="https://..." />
          <Field label="Testo informativa privacy" value={form.privacy_text} onChange={v => handleChange('privacy_text', v)} multiline />
        </div>
      </CollapsibleSection>

      {/* ADVANCED / APPEARANCE */}
      <CollapsibleSection
        title="Grafica e impostazioni avanzate"
        open={advancedOpen}
        onToggle={() => setAdvancedOpen(o => !o)}
      >
        <div style={styles.formSection}>
          <AssetUploadControl
            label="Carica logo"
            assetType="logo"
            currentUrl={form.logo_url}
            siteId={site?.id ?? null}
            eventId={eventId}
            uploading={uploadingAsset === 'logo'}
            disabled={!!uploadingAsset}
            previewStyle="logo"
            onUploadStart={() => setUploadingAsset('logo')}
            onUploadEnd={async (publicUrl) => {
              setUploadingAsset(null)
              if (publicUrl && site) {
                try {
                  const updated = await updateRegistrationSite(site.id, { logo_url: publicUrl })
                  setSite(updated)
                  setForm(prev => ({ ...prev, logo_url: publicUrl }))
                  showToast('Logo caricato con successo', 'success')
                } catch { showToast('Logo caricato ma salvataggio non riuscito', 'error') }
              }
            }}
            onRemove={async () => {
              if (!site) return
              const prevUrl = form.logo_url
              try {
                const updated = await updateRegistrationSite(site.id, { logo_url: null })
                setSite(updated)
                setForm(prev => ({ ...prev, logo_url: '' }))
                showToast('Logo rimosso', 'success')
                tryDeleteStorageAsset(prevUrl)
              } catch { showToast('Errore durante la rimozione', 'error') }
            }}
            showToast={showToast}
          />
          <AssetUploadControl
            label="Carica immagine copertina"
            assetType="hero"
            currentUrl={form.hero_image_url}
            siteId={site?.id ?? null}
            eventId={eventId}
            uploading={uploadingAsset === 'hero'}
            disabled={!!uploadingAsset}
            previewStyle="hero"
            onUploadStart={() => setUploadingAsset('hero')}
            onUploadEnd={async (publicUrl) => {
              setUploadingAsset(null)
              if (publicUrl && site) {
                try {
                  const updated = await updateRegistrationSite(site.id, { hero_image_url: publicUrl })
                  setSite(updated)
                  setForm(prev => ({ ...prev, hero_image_url: publicUrl }))
                  showToast('Immagine copertina caricata con successo', 'success')
                } catch { showToast('Immagine caricata ma salvataggio non riuscito', 'error') }
              }
            }}
            onRemove={async () => {
              if (!site) return
              const prevUrl = form.hero_image_url
              try {
                const updated = await updateRegistrationSite(site.id, { hero_image_url: null })
                setSite(updated)
                setForm(prev => ({ ...prev, hero_image_url: '' }))
                showToast('Immagine copertina rimossa', 'success')
                tryDeleteStorageAsset(prevUrl)
              } catch { showToast('Errore durante la rimozione', 'error') }
            }}
            showToast={showToast}
          />
          <Field
            label="Slug"
            value={form.slug}
            onChange={handleSlugChange}
            hint="Indirizzo breve della pagina. Min. 3 caratteri, solo lettere minuscole, numeri e trattini."
          />
        </div>
      </CollapsibleSection>

      {/* THEME / COLORS */}
      <CollapsibleSection
        title="Colori e stile"
        open={themeOpen}
        onToggle={() => setThemeOpen(o => !o)}
      >
        <div style={styles.formSection}>
          <ColorControl label="Colore principale" value={themeColors.primary_color} onChange={v => setThemeColors(prev => ({ ...prev, primary_color: v }))} />
          <ColorControl label="Colore di sfondo" value={themeColors.background_color} onChange={v => setThemeColors(prev => ({ ...prev, background_color: v }))} />
          <ColorControl label="Colore del testo" value={themeColors.text_color} onChange={v => setThemeColors(prev => ({ ...prev, text_color: v }))} />

          <div style={{ marginTop: 12, padding: 16, borderRadius: 8, border: '1px solid #e5e7eb', backgroundColor: themeColors.background_color }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: themeColors.text_color }}>Anteprima</p>
            <p style={{ margin: '8px 0 12px', fontSize: 14, color: themeColors.text_color }}>Questo è un testo di esempio per la pagina di registrazione.</p>
            <span style={{ display: 'inline-block', padding: '10px 20px', fontSize: 14, fontWeight: 500, borderRadius: 6, backgroundColor: themeColors.primary_color, color: '#fff' }}>Registrati ora</span>
          </div>

          <button
            type="button"
            onClick={() => setThemeColors(THEME_DEFAULTS)}
            style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: '0 16px', fontSize: 14, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
          >
            <RotateCcw size={14} />
            Ripristina colori predefiniti
          </button>
        </div>
      </CollapsibleSection>

      {/* QUESTIONS / FIELDS SECTION */}
      <CollapsibleSection
        title="Domande del modulo"
        open={fieldsOpen}
        onToggle={() => setFieldsOpen(o => !o)}
      >
        {site ? (
          <>
            <p style={styles.sectionHint}>
              Personalizza le domande che i partecipanti dovranno compilare durante la registrazione.
            </p>
            <RegistrationFieldsManager siteId={site.id} readOnly={readOnly} />
          </>
        ) : (
          <p style={styles.sectionHint}>
            Salva prima la bozza per personalizzare le domande.
          </p>
        )}
      </CollapsibleSection>

      {/* ACTIONS */}
      <div style={styles.footerActions}>
        <button style={styles.btnOutline} onClick={() => { setEditing(false); if (site) setForm(siteToForm(site)) }} disabled={saving}>
          Annulla
        </button>
        <button style={styles.btnOutline} onClick={() => handleSave(false)} disabled={saving}>
          <Save size={14} /> {saving ? 'Salvataggio...' : (site ? 'Salva modifiche' : 'Salva Bozza')}
        </button>
        <button style={styles.btnPrimary} onClick={() => handleSave(true)} disabled={saving}>
          <Send size={14} /> {saving ? 'Pubblicazione...' : 'Pubblica'}
        </button>
      </div>

      {publishError && (
        <div style={{ margin: '8px 0 0', padding: '10px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: 'var(--red, #dc2626)', fontSize: 13, lineHeight: 1.4 }}>
          {publishError}
        </div>
      )}

      {showDelete && (
        <DeleteConfirmDialog
          saving={saving}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CollapsibleSection({ title, open, onToggle, children }: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const Icon = open ? ChevronDown : ChevronRight
  return (
    <div style={styles.collapsible}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={styles.collapsibleHeader}
      >
        <Icon size={16} style={{ flexShrink: 0, color: 'var(--muted)' }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
      </button>
      {open && <div style={styles.collapsibleContent}>{children}</div>}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    draft: { bg: 'var(--panel2)', color: 'var(--muted)' },
    published: { bg: 'rgba(47,158,104,0.12)', color: 'var(--green)' },
    closed: { bg: 'rgba(211,28,48,0.10)', color: 'var(--red)' },
  }
  const labels: Record<string, string> = { draft: 'Bozza', published: 'Pubblicato', closed: 'Chiuso' }
  const c = colors[status] ?? colors.draft
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 12,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 6,
      background: c.bg,
      color: c.color,
      marginTop: 4,
    }}>
      {labels[status] ?? status}
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 14, padding: '4px 0' }}>
      <span style={{ color: 'var(--muted)', minWidth: 120 }}>{label}:</span>
      <span style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  )
}

function Field({ label, value, onChange, multiline, type, placeholder, hint }: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  type?: string
  placeholder?: string
  hint?: string
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'var(--font-sans)',
    color: 'var(--text)',
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    outline: 'none',
    resize: multiline ? 'vertical' : undefined,
    minHeight: multiline ? 80 : 44,
    boxSizing: 'border-box' as const,
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)' }}>{label}</label>
      {multiline ? (
        <textarea style={inputStyle} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input style={inputStyle} type={type ?? 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      )}
      {hint && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{hint}</span>}
    </div>
  )
}

function DeleteConfirmDialog({ saving, onConfirm, onCancel }: { saving: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.dialog}>
        <h4 style={{ fontSize: 15, color: 'var(--text)', marginBottom: 8 }}>Conferma Eliminazione</h4>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
          Questa azione eliminerà definitivamente il sito di registrazione e tutti i dati associati. Continuare?
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={styles.btnOutline} onClick={onCancel} disabled={saving}>Annulla</button>
          <button style={styles.btnDanger} onClick={onConfirm} disabled={saving}>
            {saving ? 'Eliminazione...' : 'Elimina'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 20,
    background: 'var(--panel-solid)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--line)',
  },
  loadingText: {
    fontSize: 14,
    color: 'var(--muted)',
    textAlign: 'center',
    padding: 32,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '32px 16px',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: 'var(--muted)',
    maxWidth: 360,
    marginBottom: 20,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 16,
  },
  headerActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  siteTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: 4,
  },
  publicPath: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'var(--panel)',
    borderRadius: 8,
    marginBottom: 12,
  },
  shareRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 16,
  } as React.CSSProperties,
  infoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 20,
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  footerActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
    marginTop: 16,
  },
  readOnlyNote: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 12,
    color: 'var(--muted)',
    marginTop: 16,
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 500,
    color: '#fff',
    background: 'var(--red)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  },
  btnOutline: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text)',
    background: 'transparent',
    border: '1px solid var(--line)',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  },
  btnDanger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 500,
    color: '#fff',
    background: 'var(--red)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    minHeight: 44,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9000,
  },
  dialog: {
    background: 'var(--panel-solid)',
    borderRadius: 'var(--radius-md)',
    padding: 24,
    maxWidth: 400,
    width: '90%',
    border: '1px solid var(--line)',
  },
  collapsible: {
    marginTop: 16,
    border: '1px solid var(--line)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  collapsibleHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    minHeight: 44,
    padding: '10px 14px',
    background: 'var(--panel)',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  collapsibleContent: {
    padding: '14px 14px 16px',
  },
  sectionHint: {
    fontSize: 13,
    color: 'var(--muted)',
    margin: '0 0 12px 0',
    lineHeight: 1.5,
  },
}
