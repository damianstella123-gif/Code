import { useState, useEffect, useCallback } from 'react'
import { Globe, Copy, Trash2, Save, Send, RotateCcw, XCircle, Eye, Lock } from 'lucide-react'
import { useToast } from '@/lib/toast'
import {
  fetchRegistrationSites,
  fetchRegistrationFields,
  createRegistrationSite,
  updateRegistrationSite,
  deleteRegistrationSite,
  canManageRegistration,
  normalizeRegistrationSlug,
  type RegistrationSite,
  type RegistrationSiteUpdate,
} from '@/lib/registration-site-service'
import RegistrationFieldsManager from '@/components/RegistrationFieldsManager'

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

function validateForPublish(form: FormState): string | null {
  if (!form.title.trim()) return 'Il titolo è obbligatorio per pubblicare.'
  const slug = normalizeRegistrationSlug(form.slug)
  if (slug.length < 3) return 'Lo slug deve avere almeno 3 caratteri.'
  if (!form.privacy_url.trim() && !form.privacy_text.trim()) {
    return 'Inserire URL privacy o testo privacy per pubblicare.'
  }
  if (!form.opens_at || !form.closes_at) return 'Le date di apertura e chiusura sono obbligatorie.'
  if (new Date(form.closes_at) <= new Date(form.opens_at)) {
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
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSlugChange = (value: string) => {
    setForm(prev => ({ ...prev, slug: normalizeRegistrationSlug(value) }))
  }

  const handleSave = async (publish?: boolean) => {
    if (readOnly) return
    if (publish) {
      const err = validateForPublish(form)
      if (err) { showToast(err, 'error'); return }
      if (!site) {
        showToast('Salva prima la bozza per poter configurare i campi e pubblicare.', 'error')
        return
      }
      const fields = await fetchRegistrationFields(site.id)
      const activeFields = fields.filter(f => f.is_active)
      if (activeFields.length === 0) {
        showToast('Aggiungi almeno un campo attivo prima di pubblicare.', 'error')
        return
      }
    }
    setSaving(true)
    try {
      const payload = formToPayload(form)
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
      showToast(publish ? 'Sito pubblicato con successo' : 'Modifiche salvate', 'success')
    } catch (err: any) {
      const msg = err.message === 'DUPLICATE_SLUG'
        ? 'Questo slug è già in uso. Scegliere un altro indirizzo.'
        : err.message || 'Errore salvataggio'
      showToast(msg, 'error')
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
    const url = `${window.location.origin}/r/${site.slug}`
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
              onClick={() => { setForm({ ...emptyForm, title: eventName }); setEditing(true) }}
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
            <span style={{ fontFamily: 'var(--font-code)', fontSize: '13px' }}>
              /r/{site.slug}
            </span>
          </div>
        )}

        <div style={styles.infoGrid}>
          <InfoRow label="Slug" value={site.slug} />
          <InfoRow label="Sottotitolo" value={site.subtitle} />
          <InfoRow label="Capacità" value={site.capacity != null ? String(site.capacity) : '—'} />
          <InfoRow label="Waitlist" value={site.waitlist_enabled ? 'Attiva' : 'Disattiva'} />
          <InfoRow label="Apertura" value={site.opens_at ? new Date(site.opens_at).toLocaleString('it-IT') : '—'} />
          <InfoRow label="Chiusura" value={site.closes_at ? new Date(site.closes_at).toLocaleString('it-IT') : '—'} />
          <InfoRow label="Pubblicato il" value={site.published_at ? new Date(site.published_at).toLocaleString('it-IT') : '—'} />
        </div>

        <RegistrationFieldsManager siteId={site.id} readOnly={readOnly} />

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

  // Edit/create mode
  return (
    <div style={styles.container}>
      <h3 style={styles.siteTitle}>{site ? 'Modifica Sito Registrazione' : 'Nuovo Sito Registrazione'}</h3>

      <div style={styles.formGrid}>
        <Field label="Titolo *" value={form.title} onChange={v => handleChange('title', v)} />
        <Field label="Slug *" value={form.slug} onChange={handleSlugChange} hint="Min. 3 caratteri. Solo lettere, numeri, trattini." />
        <Field label="Sottotitolo" value={form.subtitle} onChange={v => handleChange('subtitle', v)} />
        <Field label="Descrizione" value={form.description} onChange={v => handleChange('description', v)} multiline />
        <Field label="URL Privacy" value={form.privacy_url} onChange={v => handleChange('privacy_url', v)} placeholder="https://..." />
        <Field label="Testo Privacy" value={form.privacy_text} onChange={v => handleChange('privacy_text', v)} multiline />
        <Field label="Messaggio di Conferma" value={form.confirmation_message} onChange={v => handleChange('confirmation_message', v)} multiline />
        <Field label="Capacità (posti)" value={form.capacity} onChange={v => handleChange('capacity', v)} type="number" />
        <Field label="URL Logo" value={form.logo_url} onChange={v => handleChange('logo_url', v)} placeholder="https://..." />
        <Field label="URL Immagine Hero" value={form.hero_image_url} onChange={v => handleChange('hero_image_url', v)} placeholder="https://..." />
        <Field label="Apertura iscrizioni" value={form.opens_at} onChange={v => handleChange('opens_at', v)} type="datetime-local" />
        <Field label="Chiusura iscrizioni" value={form.closes_at} onChange={v => handleChange('closes_at', v)} type="datetime-local" />

        <div style={styles.checkRow}>
          <input
            type="checkbox"
            checked={form.waitlist_enabled}
            onChange={e => handleChange('waitlist_enabled', e.target.checked)}
            id="waitlist_enabled"
          />
          <label htmlFor="waitlist_enabled" style={{ fontSize: '13px', color: 'var(--text)', cursor: 'pointer' }}>
            Abilita lista d'attesa
          </label>
        </div>
      </div>

      {site && (
        <RegistrationFieldsManager siteId={site.id} readOnly={readOnly} />
      )}

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
      fontSize: '12px',
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
    <div style={{ display: 'flex', gap: 8, fontSize: '13px', padding: '4px 0' }}>
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
    padding: '8px 12px',
    fontSize: '13px',
    fontFamily: 'var(--font-sans)',
    color: 'var(--text)',
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    outline: 'none',
    resize: multiline ? 'vertical' : undefined,
    minHeight: multiline ? 72 : undefined,
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted)' }}>{label}</label>
      {multiline ? (
        <textarea style={inputStyle} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input style={inputStyle} type={type ?? 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      )}
      {hint && <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{hint}</span>}
    </div>
  )
}

function DeleteConfirmDialog({ saving, onConfirm, onCancel }: { saving: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.dialog}>
        <h4 style={{ fontSize: '15px', color: 'var(--text)', marginBottom: 8 }}>Conferma Eliminazione</h4>
        <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 16 }}>
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
    padding: 24,
    background: 'var(--panel-solid)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--line)',
  },
  loadingText: {
    fontSize: '13px',
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
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: '13px',
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
    fontSize: '16px',
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
  formGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginTop: 16,
    marginBottom: 20,
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  footerActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
    marginTop: 8,
  },
  readOnlyNote: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    color: 'var(--muted)',
    marginTop: 16,
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
    background: 'var(--red)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  btnOutline: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text)',
    background: 'transparent',
    border: '1px solid var(--line)',
    borderRadius: 8,
    cursor: 'pointer',
  },
  btnDanger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
    background: 'var(--red)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
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
}
