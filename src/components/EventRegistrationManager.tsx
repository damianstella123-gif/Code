import { useState, useEffect, useCallback } from 'react'
import { Globe, Copy, Trash2, Save, Send, RotateCcw, XCircle, Eye, Lock, ChevronDown, ChevronRight } from 'lucide-react'
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
} from '@/lib/registration-site-service'
import RegistrationFieldsManager from '@/components/RegistrationFieldsManager'
import RegistrationParticipantsManager from '@/components/RegistrationParticipantsManager'

const PUBLIC_APP_URL =
  (import.meta.env.VITE_PUBLIC_APP_URL || 'https://simmetriasynergy.netlify.app')
    .replace(/\/+$/, '')

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
    opens_at: site.opens_at ? site.opens_at.slice(0, 16) : '',
    closes_at: site.closes_at ? site.closes_at.slice(0, 16) : '',
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
    opens_at: form.opens_at || null,
    closes_at: form.closes_at || null,
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
      } else {
        setSite(null)
        setForm(emptyForm)
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
            {site.status === 'published' && (
              <button style={styles.btnOutline} onClick={copyLink}>
                <Copy size={14} /> Copia Link
              </button>
            )}
            {!readOnly && (
              <button style={styles.btnPrimary} onClick={() => setEditing(true)}>
                Modifica
              </button>
            )}
          </div>
        </div>

        {site.status === 'published' && (
          <div style={styles.publicPath}>
            <Globe size={14} style={{ color: 'var(--green)' }} />
            <a href={`${PUBLIC_APP_URL}/r/${site.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-code)', fontSize: 13, color: 'inherit', textDecoration: 'none' }}>
              {PUBLIC_APP_URL}/r/{site.slug}
            </a>
          </div>
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
          <Field label="URL Logo" value={form.logo_url} onChange={v => handleChange('logo_url', v)} placeholder="https://..." />
          <Field label="URL Immagine Hero" value={form.hero_image_url} onChange={v => handleChange('hero_image_url', v)} placeholder="https://..." />
          <Field
            label="Slug"
            value={form.slug}
            onChange={handleSlugChange}
            hint="Indirizzo breve della pagina. Min. 3 caratteri, solo lettere minuscole, numeri e trattini."
          />
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
    marginBottom: 16,
  },
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
