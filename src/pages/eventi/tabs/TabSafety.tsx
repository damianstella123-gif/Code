import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ShieldCheck,
  Phone,
  Mail,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ClipboardList,
  RefreshCw,
  X,
  Loader2,
} from 'lucide-react'
import { useToast } from '@/lib/toast'
import type { Event } from '@/data/events'
import type {
  SafetyDossierBundle,
  SafetyDossierStatus,
  SafetyContact,
  SafetyContactRole,
} from '@/lib/safety-service'
import {
  fetchSafetyDossier,
  updateSafetyDossier,
  createSafetyContact,
  updateSafetyContact,
  deleteSafetyContact,
} from '@/lib/safety-service'

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SafetyDossierStatus, string> = {
  draft: 'Bozza',
  collecting: 'Raccolta documenti',
  review: 'In revisione',
  approved: 'Approvato',
  archived: 'Archiviato',
}

const STATUS_COLORS: Record<SafetyDossierStatus, { color: string; bg: string }> = {
  draft: { color: 'var(--muted)', bg: 'var(--line)' },
  collecting: { color: 'var(--blue)', bg: 'color-mix(in srgb, var(--blue) 12%, transparent)' },
  review: { color: 'var(--yellow)', bg: 'color-mix(in srgb, var(--yellow) 12%, transparent)' },
  approved: { color: 'var(--green)', bg: 'color-mix(in srgb, var(--green) 12%, transparent)' },
  archived: { color: 'var(--muted)', bg: 'var(--line)' },
}

const CONTACT_ROLE_LABELS: Record<SafetyContactRole, string> = {
  employer: 'Datore di Lavoro',
  delegated_manager: 'Dirigente Delegato',
  rspp: 'RSPP',
  emergency_coordinator: 'Coordinatore Emergenza',
  signatory: 'Firmatario',
  client_contact: 'Referente Cliente',
  agency_contact: 'Referente Agenzia',
  onsite_contact: 'Referente On-Site',
  external_consultant: 'Consulente Esterno',
  other: 'Altro',
}

const ALL_ROLES: SafetyContactRole[] = [
  'employer', 'delegated_manager', 'rspp', 'emergency_coordinator',
  'signatory', 'client_contact', 'agency_contact', 'onsite_contact',
  'external_consultant', 'other',
]

const ALL_STATUSES: SafetyDossierStatus[] = [
  'draft', 'collecting', 'review', 'approved', 'archived',
]

// ─── Props ──────────────────────────────────────────────────────────────────

interface TabSafetyProps {
  event: Event
  canManage: boolean
}

// ─── Main component ─────────────────────────────────────────────────────────

export function TabSafety({ event, canManage }: TabSafetyProps) {
  const [bundle, setBundle] = useState<SafetyDossierBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSafetyDossier(event.id)
      if (!mountedRef.current) return
      setBundle(data)
    } catch {
      if (!mountedRef.current) return
      setError('Impossibile caricare il dossier sicurezza.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [event.id])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 8 }}>
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--muted)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>Caricamento...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <AlertTriangle className="w-6 h-6 mx-auto mb-3" style={{ color: 'var(--red2)' }} />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{error}</p>
        <button onClick={load} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 16px',
          borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel)',
          color: 'var(--text)', cursor: 'pointer', minHeight: 44,
        }}>
          <RefreshCw className="w-3.5 h-3.5" /> Riprova
        </button>
      </div>
    )
  }

  if (!bundle) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <ShieldCheck className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--muted)', opacity: 0.4 }} />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)' }}>
          Dossier sicurezza non trovato.
        </p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <DossierHeader bundle={bundle} event={event} canManage={canManage} onUpdate={load} />
      <ContactsSection contacts={bundle.contacts} dossierId={bundle.dossier.id} canManage={canManage} onUpdate={load} />
      <RequirementsPlaceholder count={bundle.requirements.length} />
    </div>
  )
}

// ─── Dossier Header / Overview ──────────────────────────────────────────────

function DossierHeader({ bundle, event, canManage, onUpdate }: {
  bundle: SafetyDossierBundle
  event: Event
  canManage: boolean
  onUpdate: () => void
}) {
  const { showToast } = useToast()
  const { dossier, progress } = bundle
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [statusVal, setStatusVal] = useState(dossier.status)
  const [notesVal, setNotesVal] = useState(dossier.notes)
  const [saving, setSaving] = useState(false)

  const sc = STATUS_COLORS[dossier.status]

  async function saveStatus(newStatus: SafetyDossierStatus) {
    setSaving(true)
    try {
      await updateSafetyDossier(dossier.id, { status: newStatus })
      showToast('Stato aggiornato', 'success')
      setEditingStatus(false)
      onUpdate()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Errore durante il salvataggio.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveNotes() {
    setSaving(true)
    try {
      await updateSafetyDossier(dossier.id, { notes: notesVal })
      showToast('Note salvate', 'success')
      setEditingNotes(false)
      onUpdate()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Errore durante il salvataggio.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const activatedDate = new Date(dossier.activated_at).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '20px',
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck className="w-5 h-5" style={{ color: 'var(--red2)' }} />
          <h3 style={{ fontFamily: 'var(--font-heading, var(--font-mono))', fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Safety & PGE
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: 4,
            color: sc.color, background: sc.bg,
          }}>
            {STATUS_LABELS[dossier.status]}
          </span>
          {canManage && !editingStatus && (
            <button onClick={() => { setStatusVal(dossier.status); setEditingStatus(true) }}
              disabled={saving}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Status editor */}
      {editingStatus && canManage && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <select
            value={statusVal}
            onChange={e => setStatusVal(e.target.value as SafetyDossierStatus)}
            disabled={saving}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 12, padding: '8px 12px',
              borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)',
              color: 'var(--text)', minHeight: 44,
            }}
          >
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button onClick={() => saveStatus(statusVal)} disabled={saving}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 14px',
              borderRadius: 6, border: '1px solid var(--line)', background: 'var(--red2)',
              color: 'white', cursor: 'pointer', minHeight: 44, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Salvataggio...' : 'Salva'}
          </button>
          <button onClick={() => setEditingStatus(false)} disabled={saving}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 14px',
              borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel)',
              color: 'var(--muted)', cursor: 'pointer', minHeight: 44,
            }}
          >
            Annulla
          </button>
        </div>
      )}

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <InfoCell label="Evento" value={event.nome} />
        <InfoCell label="Date" value={`${event.dataInizio} – ${event.dataFine}`} />
        <InfoCell label="Luogo" value={event.location || '—'} />
        <InfoCell label="Attivato il" value={activatedDate} />
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Avanzamento requisiti
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
            {progress.completed}/{progress.total} ({progress.percentage}%)
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, transition: 'width 0.4s ease',
            width: `${progress.percentage}%`,
            background: progress.percentage === 100 ? 'var(--green)' : progress.percentage >= 50 ? 'var(--blue)' : 'var(--red2)',
          }} />
        </div>
      </div>

      {/* Notes */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Note
          </span>
          {canManage && !editingNotes && (
            <button onClick={() => { setNotesVal(dossier.notes); setEditingNotes(true) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
        {editingNotes && canManage ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              value={notesVal}
              onChange={e => setNotesVal(e.target.value)}
              disabled={saving}
              rows={3}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 13, padding: 10, borderRadius: 6,
                border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--text)',
                resize: 'vertical', width: '100%',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveNotes} disabled={saving}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 14px',
                  borderRadius: 6, background: 'var(--red2)', color: 'white',
                  border: 'none', cursor: 'pointer', minHeight: 44, opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Salvataggio...' : 'Salva'}
              </button>
              <button onClick={() => setEditingNotes(false)} disabled={saving}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 14px',
                  borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel)',
                  color: 'var(--muted)', cursor: 'pointer', minHeight: 44,
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: dossier.notes ? 'var(--text)' : 'var(--muted)', margin: 0, whiteSpace: 'pre-wrap' }}>
            {dossier.notes || '—'}
          </p>
        )}
      </div>
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

// ─── Contacts Section ───────────────────────────────────────────────────────

interface ContactFormData {
  role: SafetyContactRole
  first_name: string
  last_name: string
  organization: string
  email: string
  phone: string
  notes: string
}

const EMPTY_CONTACT: ContactFormData = {
  role: 'other',
  first_name: '',
  last_name: '',
  organization: '',
  email: '',
  phone: '',
  notes: '',
}

function ContactsSection({ contacts, dossierId, canManage, onUpdate }: {
  contacts: SafetyContact[]
  dossierId: string
  canManage: boolean
  onUpdate: () => void
}) {
  const { showToast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SafetyContact | null>(null)
  const [formData, setFormData] = useState<ContactFormData>(EMPTY_CONTACT)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SafetyContact | null>(null)

  function openAdd() {
    setEditing(null)
    setFormData(EMPTY_CONTACT)
    setShowForm(true)
  }

  function openEdit(c: SafetyContact) {
    setEditing(c)
    setFormData({
      role: c.role,
      first_name: c.first_name,
      last_name: c.last_name,
      organization: c.organization,
      email: c.email,
      phone: c.phone,
      notes: c.notes,
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (editing) {
        await updateSafetyContact(editing.id, formData)
        showToast('Contatto aggiornato', 'success')
      } else {
        await createSafetyContact(dossierId, formData)
        showToast('Contatto aggiunto', 'success')
      }
      closeForm()
      onUpdate()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Errore durante il salvataggio.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(contact: SafetyContact) {
    setDeleting(contact.id)
    try {
      await deleteSafetyContact(contact.id)
      showToast('Contatto eliminato', 'success')
      setConfirmDelete(null)
      onUpdate()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Errore durante l\'eliminazione.', 'error')
    } finally {
      setDeleting(null)
    }
  }

  const upd = (patch: Partial<ContactFormData>) => setFormData(prev => ({ ...prev, ...patch }))

  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
          Figure di riferimento
        </h4>
        {canManage && !showForm && (
          <button onClick={openAdd} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 14px',
            borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel)',
            color: 'var(--text)', cursor: 'pointer', minHeight: 44,
          }}>
            <Plus className="w-3.5 h-3.5" /> Aggiungi
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && canManage && (
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8,
          padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              {editing ? 'Modifica contatto' : 'Nuovo contatto'}
            </span>
            <button onClick={closeForm} disabled={saving}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <FormField label="Ruolo *">
              <select value={formData.role} onChange={e => upd({ role: e.target.value as SafetyContactRole })} disabled={saving}
                style={selectStyle}>
                {ALL_ROLES.map(r => <option key={r} value={r}>{CONTACT_ROLE_LABELS[r]}</option>)}
              </select>
            </FormField>
            <FormField label="Nome *">
              <input value={formData.first_name} onChange={e => upd({ first_name: e.target.value })} disabled={saving} style={inputStyle} />
            </FormField>
            <FormField label="Cognome">
              <input value={formData.last_name} onChange={e => upd({ last_name: e.target.value })} disabled={saving} style={inputStyle} />
            </FormField>
            <FormField label="Organizzazione">
              <input value={formData.organization} onChange={e => upd({ organization: e.target.value })} disabled={saving} style={inputStyle} />
            </FormField>
            <FormField label="Email">
              <input type="email" value={formData.email} onChange={e => upd({ email: e.target.value })} disabled={saving} style={inputStyle} />
            </FormField>
            <FormField label="Telefono">
              <input type="tel" value={formData.phone} onChange={e => upd({ phone: e.target.value })} disabled={saving} style={inputStyle} />
            </FormField>
          </div>
          <FormField label="Note">
            <textarea value={formData.notes} onChange={e => upd({ notes: e.target.value })} disabled={saving} rows={2}
              style={{ ...inputStyle, resize: 'vertical', width: '100%' }} />
          </FormField>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleSave} disabled={saving || !formData.first_name.trim()}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 16px',
                borderRadius: 6, background: 'var(--red2)', color: 'white',
                border: 'none', cursor: 'pointer', minHeight: 44,
                opacity: saving || !formData.first_name.trim() ? 0.6 : 1,
              }}
            >
              {saving ? 'Salvataggio...' : editing ? 'Aggiorna' : 'Aggiungi'}
            </button>
            <button onClick={closeForm} disabled={saving}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 16px',
                borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel)',
                color: 'var(--muted)', cursor: 'pointer', minHeight: 44,
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Contact list */}
      {contacts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
            Nessuna figura di riferimento inserita.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contacts.map(c => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
                padding: '12px 14px', borderRadius: 8,
                background: 'var(--bg)', border: '1px solid var(--line)',
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      padding: '2px 6px', borderRadius: 4,
                      color: 'var(--blue)', background: 'color-mix(in srgb, var(--blue) 10%, transparent)',
                    }}>
                      {CONTACT_ROLE_LABELS[c.role]}
                    </span>
                    {c.organization && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                        {c.organization}
                      </span>
                    )}
                  </div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', margin: '0 0 4px', fontWeight: 600 }}>
                    {name}
                  </p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {c.email && (
                      <a href={`mailto:${c.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)', textDecoration: 'none', minHeight: 44, padding: '8px 0' }}>
                        <Mail className="w-3 h-3" /> {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)', textDecoration: 'none', minHeight: 44, padding: '8px 0' }}>
                        <Phone className="w-3 h-3" /> {c.phone}
                      </a>
                    )}
                  </div>
                  {c.notes && (
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                      {c.notes}
                    </p>
                  )}
                </div>

                {canManage && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => openEdit(c)} disabled={!!deleting}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(c)} disabled={!!deleting}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10,
            padding: 24, maxWidth: 400, width: '100%',
          }}>
            <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>
              Elimina contatto
            </h4>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>
              Confermi l'eliminazione di <strong>{[confirmDelete.first_name, confirmDelete.last_name].filter(Boolean).join(' ')}</strong>?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} disabled={!!deleting}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 16px',
                  borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel)',
                  color: 'var(--muted)', cursor: 'pointer', minHeight: 44,
                }}
              >
                Annulla
              </button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={!!deleting}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 16px',
                  borderRadius: 6, background: 'var(--red2)', color: 'white',
                  border: 'none', cursor: 'pointer', minHeight: 44,
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Eliminazione...' : 'Elimina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 13, padding: '8px 10px',
  borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)',
  color: 'var(--text)', minHeight: 44,
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
}

// ─── Requirements Placeholder ───────────────────────────────────────────────

function RequirementsPlaceholder({ count }: { count: number }) {
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '24px 20px',
      textAlign: 'center',
    }}>
      <ClipboardList className="w-6 h-6 mx-auto mb-3" style={{ color: 'var(--muted)', opacity: 0.5 }} />
      <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>
        Checklist documentale
      </h4>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)', margin: 0 }}>
        {count > 0
          ? `${count} requisit${count === 1 ? 'o' : 'i'} registrat${count === 1 ? 'o' : 'i'}. La gestione completa sarà disponibile nel prossimo aggiornamento.`
          : 'La gestione dei requisiti documentali sarà disponibile nel prossimo aggiornamento.'
        }
      </p>
    </div>
  )
}
