import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
  Copy,
  FileText,
  Filter,
  Clock,
  ListChecks,
} from 'lucide-react'
import { useToast } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/data/events'
import type {
  SafetyDossierBundle,
  SafetyDossierStatus,
  SafetyContact,
  SafetyContactRole,
  SafetyRequirement,
  SafetyRequirementCategory,
  SafetyRequirementStatus,
  EventSummary,
} from '@/lib/safety-service'
import {
  fetchSafetyDossier,
  updateSafetyDossier,
  createSafetyContact,
  updateSafetyContact,
  deleteSafetyContact,
  createSafetyRequirement,
  updateSafetyRequirement,
  deleteSafetyRequirement,
  buildSafetyConsultantEmail,
  CATEGORY_LABELS_IT,
  STATUS_LABELS_IT,
} from '@/lib/safety-service'
import { fetchEventMembers } from '@/lib/event-members-service'

// ─── Constants ──────────────────────────────────────────────────────────────

const DOSSIER_STATUS_LABELS: Record<SafetyDossierStatus, string> = {
  draft: 'Bozza',
  collecting: 'Raccolta documenti',
  review: 'In revisione',
  approved: 'Approvato',
  archived: 'Archiviato',
}

const DOSSIER_STATUS_COLORS: Record<SafetyDossierStatus, { color: string; bg: string }> = {
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

const ALL_CONTACT_ROLES: SafetyContactRole[] = [
  'employer', 'delegated_manager', 'rspp', 'emergency_coordinator',
  'signatory', 'client_contact', 'agency_contact', 'onsite_contact',
  'external_consultant', 'other',
]

const ALL_DOSSIER_STATUSES: SafetyDossierStatus[] = [
  'draft', 'collecting', 'review', 'approved', 'archived',
]

const ALL_CATEGORIES: SafetyRequirementCategory[] = [
  'general', 'location', 'supplier', 'transport', 'activity',
  'temporary_structures', 'catering', 'speakers', 'cyber_security', 'other',
]

const ALL_REQ_STATUSES: SafetyRequirementStatus[] = [
  'required', 'requested', 'received', 'needs_review', 'approved', 'not_applicable',
]

const REQ_STATUS_COLORS: Record<SafetyRequirementStatus, { color: string; bg: string }> = {
  required: { color: 'var(--red2)', bg: 'color-mix(in srgb, var(--red2) 10%, transparent)' },
  requested: { color: 'var(--yellow)', bg: 'color-mix(in srgb, var(--yellow) 10%, transparent)' },
  received: { color: 'var(--blue)', bg: 'color-mix(in srgb, var(--blue) 10%, transparent)' },
  needs_review: { color: 'var(--yellow)', bg: 'color-mix(in srgb, var(--yellow) 10%, transparent)' },
  approved: { color: 'var(--green)', bg: 'color-mix(in srgb, var(--green) 10%, transparent)' },
  not_applicable: { color: 'var(--muted)', bg: 'var(--line)' },
}

const BASE_CHECKLIST: { category: SafetyRequirementCategory; title: string }[] = [
  { category: 'general', title: 'Programma definitivo dell\'evento' },
  { category: 'general', title: 'Elenco dei soggetti e responsabili coinvolti' },
  { category: 'general', title: 'Elenco fornitori e subappaltatori' },
  { category: 'location', title: 'Responsabile e contatto della location' },
  { category: 'location', title: 'Coordinatore della gestione delle emergenze' },
  { category: 'location', title: 'Planimetria con uscite di sicurezza' },
  { category: 'location', title: 'Piano di emergenza, evacuazione e incendio' },
  { category: 'transport', title: 'Libretti di circolazione dei mezzi' },
  { category: 'transport', title: 'Certificati assicurativi dei mezzi' },
  { category: 'transport', title: 'Patenti degli autisti' },
  { category: 'transport', title: 'Nominativi e recapiti degli autisti' },
  { category: 'activity', title: 'Descrizione e timing delle attività speciali' },
  { category: 'activity', title: 'Valutazione delle misure di sicurezza dell\'attività' },
  { category: 'cyber_security', title: 'Responsabile per incidenti informatici' },
  { category: 'cyber_security', title: 'Protezione dei dati dei partecipanti' },
  { category: 'cyber_security', title: 'Sicurezza Wi-Fi, QR, piattaforme e dispositivi utilizzati' },
  { category: 'cyber_security', title: 'Conservazione e cancellazione dei dati al termine dell\'evento' },
]

// ─── Option types ────────────────────────────────────────────────────────────

interface ProfileOption { id: string; label: string }
interface SupplierOption { id: string; label: string }
interface DocumentOption { id: string; label: string }

// ─── Shared styles ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 13, padding: '8px 10px',
  borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg)',
  color: 'var(--text)', minHeight: 44, width: '100%', boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = { ...inputStyle }

const btnPrimary: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 16px',
  borderRadius: 6, background: 'var(--red2)', color: 'white',
  border: 'none', cursor: 'pointer', minHeight: 44,
}

const btnSecondary: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 16px',
  borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel)',
  color: 'var(--muted)', cursor: 'pointer', minHeight: 44,
}

const btnIcon: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
  padding: 4, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
}

function cardStyle(): React.CSSProperties {
  return { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 20 }
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface TabSafetyProps {
  event: Event
  canManage: boolean
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function TabSafety({ event, canManage }: TabSafetyProps) {
  const [bundle, setBundle] = useState<SafetyDossierBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [documents, setDocuments] = useState<DocumentOption[]>([])
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

  // Load event-scoped options for form selects
  useEffect(() => {
    let cancelled = false
    async function loadOptions() {
      // Team profiles
      const { data: members } = await fetchEventMembers(event.id)
      if (cancelled) return
      const userIds = members.map(m => m.user_id)
      if (event.responsabile && !userIds.includes(event.responsabile)) {
        userIds.push(event.responsabile)
      }
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds)
        if (!cancelled && profs) {
          setProfiles(profs.map((p: { id: string; full_name: string | null; email: string | null }) => ({
            id: p.id,
            label: p.full_name || p.email || p.id.slice(0, 8),
          })))
        }
      }

      // Event suppliers
      const { data: esLinks } = await supabase
        .from('event_suppliers')
        .select('supplier_id')
        .eq('event_id', event.id)
      if (!cancelled && esLinks && esLinks.length > 0) {
        const sIds = esLinks.map((l: { supplier_id: string }) => l.supplier_id)
        const { data: supps } = await supabase
          .from('suppliers')
          .select('id, nome')
          .in('id', sIds)
        if (!cancelled && supps) {
          setSuppliers(supps.map((s: { id: string; nome: string }) => ({ id: s.id, label: s.nome })))
        }
      }

      // Event documents (safe fields only)
      const { data: docs } = await supabase
        .from('documents')
        .select('id, nome')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false })
      if (!cancelled && docs) {
        setDocuments(docs.map((d: { id: string; nome: string }) => ({ id: d.id, label: d.nome })))
      }
    }
    loadOptions()
    return () => { cancelled = true }
  }, [event.id, event.responsabile])

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
        <button onClick={load} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
      <RequirementsSection
        requirements={bundle.requirements}
        dossierId={bundle.dossier.id}
        canManage={canManage}
        onUpdate={load}
        profiles={profiles}
        suppliers={suppliers}
        documents={documents}
      />
      {canManage && (
        <ConsultantEmailButton bundle={bundle} event={event} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DOSSIER HEADER
// ═══════════════════════════════════════════════════════════════════════════

function DossierHeader({ bundle, event, canManage, onUpdate }: {
  bundle: SafetyDossierBundle; event: Event; canManage: boolean; onUpdate: () => void
}) {
  const { showToast } = useToast()
  const { dossier, progress } = bundle
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [statusVal, setStatusVal] = useState(dossier.status)
  const [notesVal, setNotesVal] = useState(dossier.notes)
  const [saving, setSaving] = useState(false)

  const sc = DOSSIER_STATUS_COLORS[dossier.status]

  async function saveField(patch: Record<string, unknown>, close: () => void) {
    setSaving(true)
    try {
      await updateSafetyDossier(dossier.id, patch as Parameters<typeof updateSafetyDossier>[1])
      showToast('Salvato', 'success')
      close()
      onUpdate()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Errore durante il salvataggio.', 'error')
    } finally { setSaving(false) }
  }

  const activatedDate = new Date(dossier.activated_at).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div style={cardStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldCheck className="w-5 h-5" style={{ color: 'var(--red2)' }} />
          <h3 style={{ fontFamily: 'var(--font-heading, var(--font-mono))', fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Safety & PGE
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge color={sc.color} bg={sc.bg}>{DOSSIER_STATUS_LABELS[dossier.status]}</Badge>
          {canManage && !editingStatus && (
            <button onClick={() => { setStatusVal(dossier.status); setEditingStatus(true) }} disabled={saving} style={btnIcon}>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {editingStatus && canManage && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <select value={statusVal} onChange={e => setStatusVal(e.target.value as SafetyDossierStatus)} disabled={saving} style={selectStyle}>
            {ALL_DOSSIER_STATUSES.map(s => <option key={s} value={s}>{DOSSIER_STATUS_LABELS[s]}</option>)}
          </select>
          <button onClick={() => saveField({ status: statusVal }, () => setEditingStatus(false))} disabled={saving}
            style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvataggio...' : 'Salva'}</button>
          <button onClick={() => setEditingStatus(false)} disabled={saving} style={btnSecondary}>Annulla</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        <InfoCell label="Evento" value={event.nome} />
        <InfoCell label="Date" value={`${event.dataInizio} – ${event.dataFine}`} />
        <InfoCell label="Luogo" value={event.location || '—'} />
        <InfoCell label="Attivato il" value={activatedDate} />
      </div>

      <ProgressBar progress={progress} />

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Note</span>
          {canManage && !editingNotes && (
            <button onClick={() => { setNotesVal(dossier.notes); setEditingNotes(true) }} style={btnIcon}><Pencil className="w-3 h-3" /></button>
          )}
        </div>
        {editingNotes && canManage ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea value={notesVal} onChange={e => setNotesVal(e.target.value)} disabled={saving} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => saveField({ notes: notesVal }, () => setEditingNotes(false))} disabled={saving}
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvataggio...' : 'Salva'}</button>
              <button onClick={() => setEditingNotes(false)} disabled={saving} style={btnSecondary}>Annulla</button>
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

// ═══════════════════════════════════════════════════════════════════════════
// CONTACTS SECTION
// ═══════════════════════════════════════════════════════════════════════════

interface ContactFormData {
  role: SafetyContactRole; first_name: string; last_name: string
  organization: string; email: string; phone: string; notes: string
}
const EMPTY_CONTACT: ContactFormData = {
  role: 'other', first_name: '', last_name: '', organization: '', email: '', phone: '', notes: '',
}

function ContactsSection({ contacts, dossierId, canManage, onUpdate }: {
  contacts: SafetyContact[]; dossierId: string; canManage: boolean; onUpdate: () => void
}) {
  const { showToast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SafetyContact | null>(null)
  const [formData, setFormData] = useState<ContactFormData>(EMPTY_CONTACT)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SafetyContact | null>(null)

  function openAdd() { setEditing(null); setFormData(EMPTY_CONTACT); setShowForm(true) }
  function openEdit(c: SafetyContact) {
    setEditing(c)
    setFormData({ role: c.role, first_name: c.first_name, last_name: c.last_name, organization: c.organization, email: c.email, phone: c.phone, notes: c.notes })
    setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditing(null) }

  async function handleSave() {
    setSaving(true)
    try {
      if (editing) { await updateSafetyContact(editing.id, formData); showToast('Contatto aggiornato', 'success') }
      else { await createSafetyContact(dossierId, formData); showToast('Contatto aggiunto', 'success') }
      closeForm(); onUpdate()
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Errore durante il salvataggio.', 'error') }
    finally { setSaving(false) }
  }

  async function handleDelete(c: SafetyContact) {
    setDeleting(c.id)
    try { await deleteSafetyContact(c.id); showToast('Contatto eliminato', 'success'); setConfirmDelete(null); onUpdate() }
    catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Errore durante l\'eliminazione.', 'error') }
    finally { setDeleting(null) }
  }

  const upd = (p: Partial<ContactFormData>) => setFormData(prev => ({ ...prev, ...p }))

  return (
    <div style={cardStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Figure di riferimento</h4>
        {canManage && !showForm && (
          <button onClick={openAdd} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus className="w-3.5 h-3.5" /> Aggiungi
          </button>
        )}
      </div>

      {showForm && canManage && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              {editing ? 'Modifica contatto' : 'Nuovo contatto'}
            </span>
            <button onClick={closeForm} disabled={saving} style={btnIcon}><X className="w-4 h-4" /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <FormField label="Ruolo *">
              <select value={formData.role} onChange={e => upd({ role: e.target.value as SafetyContactRole })} disabled={saving} style={selectStyle}>
                {ALL_CONTACT_ROLES.map(r => <option key={r} value={r}>{CONTACT_ROLE_LABELS[r]}</option>)}
              </select>
            </FormField>
            <FormField label="Nome *"><input value={formData.first_name} onChange={e => upd({ first_name: e.target.value })} disabled={saving} style={inputStyle} /></FormField>
            <FormField label="Cognome"><input value={formData.last_name} onChange={e => upd({ last_name: e.target.value })} disabled={saving} style={inputStyle} /></FormField>
            <FormField label="Organizzazione"><input value={formData.organization} onChange={e => upd({ organization: e.target.value })} disabled={saving} style={inputStyle} /></FormField>
            <FormField label="Email"><input type="email" value={formData.email} onChange={e => upd({ email: e.target.value })} disabled={saving} style={inputStyle} /></FormField>
            <FormField label="Telefono"><input type="tel" value={formData.phone} onChange={e => upd({ phone: e.target.value })} disabled={saving} style={inputStyle} /></FormField>
          </div>
          <FormField label="Note"><textarea value={formData.notes} onChange={e => upd({ notes: e.target.value })} disabled={saving} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></FormField>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleSave} disabled={saving || !formData.first_name.trim()}
              style={{ ...btnPrimary, opacity: saving || !formData.first_name.trim() ? 0.6 : 1 }}>
              {saving ? 'Salvataggio...' : editing ? 'Aggiorna' : 'Aggiungi'}
            </button>
            <button onClick={closeForm} disabled={saving} style={btnSecondary}>Annulla</button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>
          Nessuna figura di riferimento inserita.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contacts.map(c => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--line)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <Badge color="var(--blue)" bg="color-mix(in srgb, var(--blue) 10%, transparent)">{CONTACT_ROLE_LABELS[c.role]}</Badge>
                    {c.organization && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{c.organization}</span>}
                  </div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', margin: '0 0 4px', fontWeight: 600 }}>{name}</p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {c.email && <a href={`mailto:${c.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)', textDecoration: 'none', minHeight: 44, padding: '8px 0' }}><Mail className="w-3 h-3" /> {c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)', textDecoration: 'none', minHeight: 44, padding: '8px 0' }}><Phone className="w-3 h-3" /> {c.phone}</a>}
                  </div>
                  {c.notes && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{c.notes}</p>}
                </div>
                {canManage && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => openEdit(c)} disabled={!!deleting} style={btnIcon}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setConfirmDelete(c)} disabled={!!deleting} style={btnIcon}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Elimina contatto"
          message={`Confermi l'eliminazione di ${[confirmDelete.first_name, confirmDelete.last_name].filter(Boolean).join(' ')}?`}
          confirmLabel={deleting ? 'Eliminazione...' : 'Elimina'}
          loading={!!deleting}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUIREMENTS SECTION
// ═══════════════════════════════════════════════════════════════════════════

interface ReqFormData {
  category: SafetyRequirementCategory; title: string; description: string
  status: SafetyRequirementStatus; due_date: string; responsible_id: string
  supplier_id: string; document_id: string; notes: string
}
const EMPTY_REQ: ReqFormData = {
  category: 'general', title: '', description: '', status: 'required',
  due_date: '', responsible_id: '', supplier_id: '', document_id: '', notes: '',
}

function RequirementsSection({ requirements, dossierId, canManage, onUpdate, profiles, suppliers, documents }: {
  requirements: SafetyRequirement[]; dossierId: string; canManage: boolean; onUpdate: () => void
  profiles: ProfileOption[]; suppliers: SupplierOption[]; documents: DocumentOption[]
}) {
  const { showToast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SafetyRequirement | null>(null)
  const [formData, setFormData] = useState<ReqFormData>(EMPTY_REQ)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<SafetyRequirement | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filterCat, setFilterCat] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterOverdue, setFilterOverdue] = useState(false)
  const [seedingBase, setSeedingBase] = useState(false)
  const [showSeedConfirm, setShowSeedConfirm] = useState(false)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  function isOverdue(r: SafetyRequirement) {
    return r.due_date != null && r.due_date < today && r.status !== 'approved' && r.status !== 'not_applicable'
  }

  const filtered = useMemo(() => {
    let list = requirements
    if (filterCat) list = list.filter(r => r.category === filterCat)
    if (filterStatus) list = list.filter(r => r.status === filterStatus)
    if (filterOverdue) list = list.filter(isOverdue)
    return list
  }, [requirements, filterCat, filterStatus, filterOverdue, today])

  const grouped = useMemo(() => {
    const map = new Map<SafetyRequirementCategory, SafetyRequirement[]>()
    for (const r of filtered) {
      const list = map.get(r.category) || []
      list.push(r)
      map.set(r.category, list)
    }
    return [...map.entries()].sort((a, b) => ALL_CATEGORIES.indexOf(a[0]) - ALL_CATEGORIES.indexOf(b[0]))
  }, [filtered])

  function openAdd() { setEditing(null); setFormData(EMPTY_REQ); setShowForm(true) }
  function openEdit(r: SafetyRequirement) {
    setEditing(r)
    setFormData({
      category: r.category, title: r.title, description: r.description,
      status: r.status, due_date: r.due_date || '', responsible_id: r.responsible_id || '',
      supplier_id: r.supplier_id || '', document_id: r.document_id || '', notes: r.notes,
    })
    setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditing(null) }

  async function handleSave() {
    setSaving(true)
    try {
      const input = {
        category: formData.category,
        title: formData.title,
        description: formData.description || undefined,
        status: formData.status,
        due_date: formData.due_date || null,
        responsible_id: formData.responsible_id || null,
        supplier_id: formData.supplier_id || null,
        document_id: formData.document_id || null,
        notes: formData.notes || undefined,
      }
      if (editing) { await updateSafetyRequirement(editing.id, input); showToast('Requisito aggiornato', 'success') }
      else { await createSafetyRequirement(dossierId, input); showToast('Requisito aggiunto', 'success') }
      closeForm(); onUpdate()
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Errore durante il salvataggio.', 'error') }
    finally { setSaving(false) }
  }

  async function handleDelete(r: SafetyRequirement) {
    setDeleting(r.id)
    try { await deleteSafetyRequirement(r.id); showToast('Requisito eliminato', 'success'); setConfirmDelete(null); onUpdate() }
    catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Errore durante l\'eliminazione.', 'error') }
    finally { setDeleting(null) }
  }

  async function handleQuickStatus(r: SafetyRequirement, newStatus: SafetyRequirementStatus) {
    setSaving(true)
    try {
      await updateSafetyRequirement(r.id, { status: newStatus })
      showToast('Stato aggiornato', 'success')
      onUpdate()
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Errore nel cambio stato.', 'error') }
    finally { setSaving(false) }
  }

  async function seedBaseChecklist() {
    setSeedingBase(true)
    let created = 0
    const existingTitles = new Set(requirements.map(r => r.title.toLowerCase()))
    try {
      for (const item of BASE_CHECKLIST) {
        if (existingTitles.has(item.title.toLowerCase())) continue
        await createSafetyRequirement(dossierId, { category: item.category, title: item.title })
        created++
      }
      showToast(`${created} requisit${created === 1 ? 'o aggiunto' : 'i aggiunti'}`, 'success')
    } catch {
      showToast('Errore durante la creazione della checklist. Verifica lo stato attuale.', 'error')
    } finally {
      setSeedingBase(false)
      setShowSeedConfirm(false)
      onUpdate()
    }
  }

  const upd = (p: Partial<ReqFormData>) => setFormData(prev => ({ ...prev, ...p }))

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p.label])), [profiles])
  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s.label])), [suppliers])
  const docMap = useMemo(() => new Map(documents.map(d => [d.id, d.label])), [documents])

  const goToDocuments = () => {
    window.dispatchEvent(new CustomEvent('navigate-event-tab', { detail: 'documenti' }))
  }

  return (
    <div style={cardStyle()}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClipboardList className="w-4 h-4" style={{ color: 'var(--text)' }} />
          <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Checklist documentale
          </h4>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
            ({requirements.length})
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={goToDocuments}
            style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
            <FileText className="w-3 h-3" /> Gestisci documenti evento
          </button>
          {canManage && !showForm && (
            <button onClick={openAdd} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Plus className="w-3.5 h-3.5" /> Aggiungi
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <Filter className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ ...selectStyle, width: 'auto', fontSize: 11, minHeight: 36, padding: '4px 8px' }}>
          <option value="">Tutte le categorie</option>
          {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS_IT[c]}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ ...selectStyle, width: 'auto', fontSize: 11, minHeight: 36, padding: '4px 8px' }}>
          <option value="">Tutti gli stati</option>
          {ALL_REQ_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS_IT[s]}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', cursor: 'pointer', minHeight: 36 }}>
          <input type="checkbox" checked={filterOverdue} onChange={e => setFilterOverdue(e.target.checked)} />
          <Clock className="w-3 h-3" /> Scaduti
        </label>
      </div>

      {/* Form */}
      {showForm && canManage && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              {editing ? 'Modifica requisito' : 'Nuovo requisito'}
            </span>
            <button onClick={closeForm} disabled={saving} style={btnIcon}><X className="w-4 h-4" /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <FormField label="Categoria">
              <select value={formData.category} onChange={e => upd({ category: e.target.value as SafetyRequirementCategory })} disabled={saving} style={selectStyle}>
                {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS_IT[c]}</option>)}
              </select>
            </FormField>
            <FormField label="Titolo *"><input value={formData.title} onChange={e => upd({ title: e.target.value })} disabled={saving} style={inputStyle} /></FormField>
            <FormField label="Stato">
              <select value={formData.status} onChange={e => upd({ status: e.target.value as SafetyRequirementStatus })} disabled={saving} style={selectStyle}>
                {ALL_REQ_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS_IT[s]}</option>)}
              </select>
            </FormField>
            <FormField label="Scadenza"><input type="date" value={formData.due_date} onChange={e => upd({ due_date: e.target.value })} disabled={saving} style={inputStyle} /></FormField>
            <FormField label="Responsabile">
              <select value={formData.responsible_id} onChange={e => upd({ responsible_id: e.target.value })} disabled={saving} style={selectStyle}>
                <option value="">Nessun responsabile</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </FormField>
            <FormField label="Fornitore">
              <select value={formData.supplier_id} onChange={e => upd({ supplier_id: e.target.value })} disabled={saving} style={selectStyle}>
                <option value="">Nessun fornitore</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </FormField>
            <FormField label="Documento collegato">
              <select value={formData.document_id} onChange={e => upd({ document_id: e.target.value })} disabled={saving} style={selectStyle}>
                <option value="">Nessun documento</option>
                {documents.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Descrizione"><textarea value={formData.description} onChange={e => upd({ description: e.target.value })} disabled={saving} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></FormField>
          <FormField label="Note"><textarea value={formData.notes} onChange={e => upd({ notes: e.target.value })} disabled={saving} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></FormField>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleSave} disabled={saving || !formData.title.trim()}
              style={{ ...btnPrimary, opacity: saving || !formData.title.trim() ? 0.6 : 1 }}>
              {saving ? 'Salvataggio...' : editing ? 'Aggiorna' : 'Aggiungi'}
            </button>
            <button onClick={closeForm} disabled={saving} style={btnSecondary}>Annulla</button>
          </div>
        </div>
      )}

      {/* Base checklist seed */}
      {canManage && requirements.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <ListChecks className="w-6 h-6 mx-auto mb-3" style={{ color: 'var(--muted)', opacity: 0.5 }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            Nessun requisito presente. Puoi iniziare con una checklist di base.
          </p>
          <button onClick={() => setShowSeedConfirm(true)} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ListChecks className="w-3.5 h-3.5" /> Aggiungi checklist base
          </button>
        </div>
      )}

      {/* Empty state after filters */}
      {requirements.length > 0 && filtered.length === 0 && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>
          Nessun requisito corrisponde ai filtri selezionati.
        </p>
      )}

      {/* Grouped list */}
      {grouped.map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <h5 style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', margin: '12px 0 8px', borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
            {CATEGORY_LABELS_IT[cat]} ({items.length})
          </h5>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map(r => {
              const sc = REQ_STATUS_COLORS[r.status]
              const overdue = isOverdue(r)
              return (
                <div key={r.id} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'var(--bg)', border: `1px solid ${overdue ? 'color-mix(in srgb, var(--red2) 30%, var(--line))' : 'var(--line)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        <Badge color={sc.color} bg={sc.bg}>{STATUS_LABELS_IT[r.status]}</Badge>
                        {overdue && <Badge color="var(--red2)" bg="color-mix(in srgb, var(--red2) 10%, transparent)">SCADUTO</Badge>}
                      </div>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text)', margin: '0 0 2px', fontWeight: 600 }}>{r.title}</p>
                      {r.description && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)', margin: '0 0 4px' }}>{r.description}</p>}
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                        {r.due_date && <span>Scad. {new Date(r.due_date).toLocaleDateString('it-IT')}</span>}
                        {r.responsible_id && <span>Resp. {profileMap.get(r.responsible_id) || '—'}</span>}
                        {r.supplier_id && <span>Forn. {supplierMap.get(r.supplier_id) || '—'}</span>}
                        {r.document_id && <span>Doc. {docMap.get(r.document_id) || '—'}</span>}
                      </div>
                      {r.notes && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{r.notes}</p>}
                    </div>
                    {canManage && (
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0, alignItems: 'center' }}>
                        <select
                          value={r.status}
                          onChange={e => handleQuickStatus(r, e.target.value as SafetyRequirementStatus)}
                          disabled={saving}
                          style={{ ...selectStyle, width: 'auto', fontSize: 10, minHeight: 36, padding: '2px 6px' }}
                        >
                          {ALL_REQ_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS_IT[s]}</option>)}
                        </select>
                        <button onClick={() => openEdit(r)} disabled={!!deleting} style={btnIcon}><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setConfirmDelete(r)} disabled={!!deleting} style={btnIcon}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Seed confirm */}
      {showSeedConfirm && (
        <ConfirmModal
          title="Aggiungi checklist base"
          message={`Verranno creati ${BASE_CHECKLIST.length} requisiti di sicurezza standard. I requisiti già presenti non saranno duplicati. Questa checklist non è esaustiva e non sostituisce una valutazione professionale.`}
          confirmLabel={seedingBase ? 'Creazione...' : 'Conferma'}
          loading={seedingBase}
          onConfirm={seedBaseChecklist}
          onCancel={() => setShowSeedConfirm(false)}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <ConfirmModal
          title="Elimina requisito"
          message={`Confermi l'eliminazione di "${confirmDelete.title}"?`}
          confirmLabel={deleting ? 'Eliminazione...' : 'Elimina'}
          loading={!!deleting}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSULTANT EMAIL
// ═══════════════════════════════════════════════════════════════════════════

function ConsultantEmailButton({ bundle, event }: { bundle: SafetyDossierBundle; event: Event }) {
  const { showToast } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  function openModal() {
    const summary: EventSummary = {
      title: event.nome,
      start_date: event.dataInizio,
      end_date: event.dataFine,
      location: event.location,
      attendees: event.partecipanti,
      client_name: event.cliente,
    }
    const result = buildSafetyConsultantEmail(bundle, summary)
    setSubject(result.subject)
    setBody(result.body)
    setShowModal(true)
  }

  async function copyToClipboard(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); showToast(`${label} copiato`, 'success') }
    catch { showToast('Impossibile copiare negli appunti.', 'error') }
  }

  if (!showModal) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={openModal} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Mail className="w-3.5 h-3.5" /> Prepara email per EventSafety
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 24, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Bozza email consulente</h4>
          <button onClick={() => setShowModal(false)} style={btnIcon}><X className="w-4 h-4" /></button>
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--yellow)',
          background: 'color-mix(in srgb, var(--yellow) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--yellow) 20%, transparent)',
          borderRadius: 6, padding: '8px 12px', marginBottom: 16,
        }}>
          <AlertTriangle className="w-3 h-3 inline-block" style={{ marginRight: 6, verticalAlign: '-2px' }} />
          Bozza operativa da verificare prima dell'invio. Non costituisce approvazione o certificazione del PGE.
        </div>

        <FormField label="Oggetto">
          <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
        </FormField>
        <FormField label="Corpo">
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={16} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
        </FormField>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={() => copyToClipboard(subject, 'Oggetto')} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Copy className="w-3 h-3" /> Copia oggetto
          </button>
          <button onClick={() => copyToClipboard(body, 'Testo')} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Copy className="w-3 h-3" /> Copia testo
          </button>
          <button onClick={() => copyToClipboard(`Oggetto: ${subject}\n\n${body}`, 'Tutto')} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Copy className="w-3 h-3" /> Copia tutto
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
      letterSpacing: '0.04em', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 4, color, background: bg,
    }}>
      {children}
    </span>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

function ProgressBar({ progress }: { progress: { completed: number; total: number; percentage: number } }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Avanzamento</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
          {progress.completed}/{progress.total} ({progress.percentage}%)
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3, transition: 'width 0.4s ease', width: `${progress.percentage}%`,
          background: progress.percentage === 100 ? 'var(--green)' : progress.percentage >= 50 ? 'var(--blue)' : 'var(--red2)',
        }} />
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      {children}
    </div>
  )
}

function ConfirmModal({ title, message, confirmLabel, loading, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; loading: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 24, maxWidth: 400, width: '100%' }}>
        <h4 style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>{title}</h4>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)', margin: '0 0 20px', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={loading} style={btnSecondary}>Annulla</button>
          <button onClick={onConfirm} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
