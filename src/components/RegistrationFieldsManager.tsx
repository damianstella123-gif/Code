import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, X, LayoutTemplate } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import {
  fetchRegistrationFields,
  createRegistrationField,
  updateRegistrationField,
  deleteRegistrationField,
  reorderRegistrationFields,
  type RegistrationFormField,
  type FieldType,
  type RegistrationFieldInsert,
  type RegistrationFieldUpdate,
} from '@/lib/registration-site-service'

interface Props {
  siteId: string
  readOnly: boolean
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Testo' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Telefono' },
  { value: 'number', label: 'Numero' },
  { value: 'textarea', label: 'Area di testo' },
  { value: 'select', label: 'Selezione' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Data' },
]

const FIELD_KEY_REGEX = /^[a-z][a-z0-9_]*$/

interface FieldForm {
  field_key: string
  label: string
  field_type: FieldType
  required: boolean
  options: string
  placeholder: string
  help_text: string
  is_active: boolean
}

const emptyFieldForm: FieldForm = {
  field_key: '',
  label: '',
  field_type: 'text',
  required: false,
  options: '',
  placeholder: '',
  help_text: '',
  is_active: true,
}

function fieldToForm(f: RegistrationFormField): FieldForm {
  return {
    field_key: f.field_key,
    label: f.label,
    field_type: f.field_type,
    required: f.required,
    options: (f.options ?? []).join('\n'),
    placeholder: f.placeholder ?? '',
    help_text: f.help_text ?? '',
    is_active: f.is_active,
  }
}

function friendlyError(msg: string): string {
  if (msg.includes('duplicate') || msg.includes('23505')) return 'Questa chiave campo esiste già.'
  if (msg.includes('violates') || msg.includes('constraint')) return 'Dati non validi. Verificare i campi.'
  if (msg.includes('permission') || msg.includes('denied')) return 'Permessi insufficienti.'
  return 'Si è verificato un errore. Riprovare.'
}

type FormTemplate = {
  id: string
  nome: string
  descrizione: string
  tipo_evento: string
  n_campi: number
  sezioni: string[]
}

export default function RegistrationFieldsManager({ siteId, readOnly }: Props) {
  const [templates, setTemplates] = useState<FormTemplate[]>([])
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null)
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const { showToast } = useToast()
  const [fields, setFields] = useState<RegistrationFormField[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingField, setEditingField] = useState<RegistrationFormField | null>(null)
  const [form, setForm] = useState<FieldForm>(emptyFieldForm)
  const [deleteTarget, setDeleteTarget] = useState<RegistrationFormField | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchRegistrationFields(siteId)
      setFields(data)
    } catch (err: any) {
      setError('Impossibile caricare i campi del modulo.')
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setEditingField(null)
    setForm(emptyFieldForm)
    setFormErrors({})
    setModalOpen(true)
  }

  const openEdit = (f: RegistrationFormField) => {
    setEditingField(f)
    setForm(fieldToForm(f))
    setFormErrors({})
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingField(null)
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.label.trim()) errs.label = 'L\'etichetta è obbligatoria.'
    const key = form.field_key.toLowerCase().trim()
    if (!key) errs.field_key = 'La chiave campo è obbligatoria.'
    else if (!FIELD_KEY_REGEX.test(key)) errs.field_key = 'Deve iniziare con una lettera e contenere solo a-z, 0-9, _.'
    if (form.field_type === 'select') {
      const opts = form.options.split('\n').map(o => o.trim()).filter(Boolean)
      if (opts.length === 0) errs.options = 'Inserire almeno un\'opzione.'
    }
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const key = form.field_key.toLowerCase().trim()
      const options = form.field_type === 'select'
        ? form.options.split('\n').map(o => o.trim()).filter(Boolean)
        : null

      if (editingField) {
        const payload: RegistrationFieldUpdate = {
          label: form.label.trim(),
          field_type: form.field_type,
          required: form.required,
          options,
          placeholder: form.placeholder.trim() || null,
          help_text: form.help_text.trim() || null,
          is_active: form.is_active,
        }
        await updateRegistrationField(editingField.id, payload)
        showToast('Campo aggiornato', 'success')
      } else {
        const payload: RegistrationFieldInsert = {
          site_id: siteId,
          field_key: key,
          label: form.label.trim(),
          field_type: form.field_type,
          required: form.required,
          options,
          placeholder: form.placeholder.trim() || null,
          help_text: form.help_text.trim() || null,
          is_active: form.is_active,
          sort_order: fields.length,
        }
        await createRegistrationField(payload)
        showToast('Campo aggiunto', 'success')
      }
      closeModal()
      await load()
    } catch (err: any) {
      showToast(friendlyError(err.message ?? ''), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (f: RegistrationFormField) => {
    setSaving(true)
    try {
      await updateRegistrationField(f.id, { is_active: !f.is_active })
      showToast(f.is_active ? 'Campo disattivato' : 'Campo attivato', 'success')
      await load()
    } catch (err: any) {
      showToast(friendlyError(err.message ?? ''), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await deleteRegistrationField(deleteTarget.id)
      showToast('Campo eliminato', 'success')
      setDeleteTarget(null)
      await load()
    } catch (err: any) {
      showToast(friendlyError(err.message ?? ''), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= fields.length) return
    setSaving(true)
    try {
      const reordered = [...fields]
      const tmp = reordered[index]
      reordered[index] = reordered[swapIndex]
      reordered[swapIndex] = tmp
      const updates = reordered.map((f, i) => ({ id: f.id, sort_order: i }))
      await reorderRegistrationFields(updates)
      setFields(reordered.map((f, i) => ({ ...f, sort_order: i })))
    } catch (err: any) {
      showToast(friendlyError(err.message ?? ''), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={styles.container}><p style={styles.loadingText}>Caricamento campi...</p></div>
  }

  if (error) {
    return (
      <div style={styles.container}>
        <p style={{ ...styles.loadingText, color: 'var(--red)' }}>{error}</p>
        <button style={styles.btnOutline} onClick={load}>Riprova</button>
      </div>
    )
  }

  useEffect(() => {
    supabase.rpc('list_form_templates').then(({ data }) => {
      if (Array.isArray(data)) setTemplates(data as FormTemplate[])
    })
  }, [])

  async function applyTemplate(sovrascrivi: boolean) {
    if (!selectedTemplate) return
    setApplyingTemplate(true)
    try {
      const { data, error } = await supabase.rpc('apply_form_template', {
        p_site_id: siteId,
        p_template_id: selectedTemplate.id,
        p_sovrascrivi: sovrascrivi,
      })
      if (error) { showToast(error.message, 'error'); return }
      const res = data as { error?: string; campi_creati?: number; campi_gia_presenti?: number }
      if (res?.error) { showToast(res.error, 'error'); return }
      showToast(
        `Modello applicato: ${res.campi_creati ?? 0} campi creati` +
        (res.campi_gia_presenti ? `, ${res.campi_gia_presenti} gia presenti` : ''),
        'success'
      )
      setTemplateModalOpen(false)
      setSelectedTemplate(null)
      await load()
    } finally {
      setApplyingTemplate(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.title}>Campi del Modulo</h4>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8 }}>
            {templates.length > 0 && (
              <button
                style={{ ...styles.btnPrimary, background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}
                onClick={() => setTemplateModalOpen(true)}
                disabled={saving}
                aria-label="Applica un modello di campi"
              >
                <LayoutTemplate size={14} /> Applica modello
              </button>
            )}
            <button style={styles.btnPrimary} onClick={openAdd} disabled={saving} aria-label="Aggiungi campo">
              <Plus size={14} /> Aggiungi
            </button>
          </div>
        )}
      </div>

      {fields.length === 0 ? (
        <p style={styles.emptyText}>Nessun campo configurato. {!readOnly && 'Applica un modello per partire velocemente, oppure aggiungi i campi uno a uno.'}</p>
      ) : (
        <div style={styles.fieldList}>
          {fields.map((f, idx) => (
            <FieldRow
              key={f.id}
              field={f}
              index={idx}
              total={fields.length}
              readOnly={readOnly}
              saving={saving}
              onEdit={() => openEdit(f)}
              onToggle={() => handleToggleActive(f)}
              onDelete={() => setDeleteTarget(f)}
              onMoveUp={() => handleMove(idx, 'up')}
              onMoveDown={() => handleMove(idx, 'down')}
            />
          ))}
        </div>
      )}

      {templateModalOpen && (
        <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Applica un modello di campi">
          <div style={{ ...styles.modal, maxWidth: 520 }}>
            <div style={styles.modalHeader}>
              <h4 style={styles.modalTitle}>Applica un modello</h4>
              <button style={styles.iconBtn} onClick={() => { setTemplateModalOpen(false); setSelectedTemplate(null) }} aria-label="Chiudi">
                <X size={16} />
              </button>
            </div>

            {!selectedTemplate ? (
              <div style={{ display: 'grid', gap: 10, padding: '4px 0' }}>
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t)}
                    style={{
                      textAlign: 'left', padding: 14, borderRadius: 10, cursor: 'pointer',
                      background: 'var(--panel-solid)', border: '1px solid var(--line)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t.nome}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{t.n_campi} campi</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{t.descrizione}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                      {t.sezioni.map(sec => (
                        <span key={sec} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--panel2)', color: 'var(--muted)' }}>{sec}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>
                  Modello selezionato: <strong>{selectedTemplate.nome}</strong> ({selectedTemplate.n_campi} campi)
                </div>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
                  {fields.length > 0
                    ? `Questo modulo ha gia ${fields.length} campi. Come vuoi procedere?`
                    : 'Il modulo e vuoto: i campi del modello verranno creati tutti.'}
                </p>

                <div style={{ display: 'grid', gap: 8 }}>
                  <button
                    onClick={() => applyTemplate(false)}
                    disabled={applyingTemplate}
                    style={{ ...styles.btnPrimary, justifyContent: 'center', padding: '11px 16px' }}
                  >
                    {applyingTemplate ? 'Applico...' : 'Aggiungi i campi mancanti'}
                  </button>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -2, marginBottom: 6 }}>
                    I campi gia presenti restano invariati.
                  </div>

                  {fields.length > 0 && (
                    <>
                      <button
                        onClick={() => {
                          if (confirm(`Verranno eliminati tutti i ${fields.length} campi attuali e sostituiti con i ${selectedTemplate.n_campi} del modello. Procedere?`)) {
                            applyTemplate(true)
                          }
                        }}
                        disabled={applyingTemplate}
                        style={{
                          ...styles.btnPrimary, justifyContent: 'center', padding: '11px 16px',
                          background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)',
                        }}
                      >
                        Sostituisci tutti i campi
                      </button>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -2 }}>
                        Cancella i campi attuali. Le risposte gia raccolte non vengono toccate.
                      </div>
                    </>
                  )}

                  <button
                    onClick={() => setSelectedTemplate(null)}
                    disabled={applyingTemplate}
                    style={{ ...styles.btnPrimary, justifyContent: 'center', padding: '11px 16px', background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)', marginTop: 4 }}
                  >
                    Scegli un altro modello
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <FieldModal
          isEdit={!!editingField}
          form={form}
          formErrors={formErrors}
          saving={saving}
          onChange={(key, val) => setForm(prev => ({ ...prev, [key]: val }))}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}

      {deleteTarget && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <h4 style={{ fontSize: '15px', color: 'var(--text)', marginBottom: 8 }}>Conferma Eliminazione</h4>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 16 }}>
              Eliminare il campo <strong>{deleteTarget.label}</strong>? Questa azione non è reversibile.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={styles.btnOutline} onClick={() => setDeleteTarget(null)} disabled={saving}>Annulla</button>
              <button style={styles.btnDanger} onClick={handleDelete} disabled={saving}>
                {saving ? 'Eliminazione...' : 'Elimina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── FieldRow ────────────────────────────────────────────────────────────────

function FieldRow({ field, index, total, readOnly, saving, onEdit, onToggle, onDelete, onMoveUp, onMoveDown }: {
  field: RegistrationFormField
  index: number
  total: number
  readOnly: boolean
  saving: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const typeLabel = FIELD_TYPES.find(t => t.value === field.field_type)?.label ?? field.field_type
  return (
    <div style={{ ...styles.fieldRow, opacity: field.is_active ? 1 : 0.55 }}>
      <div style={styles.fieldInfo}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={styles.fieldLabel}>{field.label}</span>
          <span style={styles.badge}>{typeLabel}</span>
          {field.required && <span style={{ ...styles.badge, background: 'rgba(211,28,48,0.10)', color: 'var(--red)' }}>Obbligatorio</span>}
          {!field.is_active && <span style={{ ...styles.badge, background: 'var(--panel2)', color: 'var(--muted)' }}>Disattivo</span>}
        </div>
        <span style={styles.fieldKey}>{field.field_key}</span>
      </div>
      {!readOnly && (
        <div style={styles.fieldActions}>
          <IconBtn icon={<ChevronUp size={15} />} onClick={onMoveUp} disabled={saving || index === 0} label="Sposta su" />
          <IconBtn icon={<ChevronDown size={15} />} onClick={onMoveDown} disabled={saving || index === total - 1} label="Sposta giù" />
          <IconBtn icon={field.is_active ? <EyeOff size={15} /> : <Eye size={15} />} onClick={onToggle} disabled={saving} label={field.is_active ? 'Disattiva' : 'Attiva'} />
          <IconBtn icon={<Pencil size={14} />} onClick={onEdit} disabled={saving} label="Modifica" />
          <IconBtn icon={<Trash2 size={14} />} onClick={onDelete} disabled={saving} label="Elimina" danger />
        </div>
      )}
    </div>
  )
}

function IconBtn({ icon, onClick, disabled, label, danger }: {
  icon: React.ReactNode; onClick: () => void; disabled?: boolean; label: string; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color: danger ? 'var(--red)' : 'var(--muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background var(--transition-fast)',
      }}
    >
      {icon}
    </button>
  )
}

// ─── FieldModal ──────────────────────────────────────────────────────────────

function FieldModal({ isEdit, form, formErrors, saving, onChange, onSave, onClose }: {
  isEdit: boolean
  form: FieldForm
  formErrors: Record<string, string>
  saving: boolean
  onChange: (key: keyof FieldForm, val: any) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.dialog, maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
            {isEdit ? 'Modifica Campo' : 'Nuovo Campo'}
          </h4>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }} aria-label="Chiudi">
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ModalField
            label="Etichetta *"
            value={form.label}
            onChange={v => onChange('label', v)}
            error={formErrors.label}
          />
          <ModalField
            label="Chiave campo *"
            value={form.field_key}
            onChange={v => onChange('field_key', v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            error={formErrors.field_key}
            disabled={isEdit}
            hint={isEdit ? 'Non modificabile dopo la creazione.' : 'Lettere minuscole, numeri e underscore. Es: nome_completo'}
          />
          <div style={styles.formField}>
            <label style={styles.formLabel}>Tipo campo</label>
            <select
              style={styles.input}
              value={form.field_type}
              onChange={e => onChange('field_type', e.target.value as FieldType)}
            >
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {form.field_type === 'select' && (
            <div style={styles.formField}>
              <label style={styles.formLabel}>Opzioni (una per riga) *</label>
              <textarea
                style={{ ...styles.input, minHeight: 80, resize: 'vertical' }}
                value={form.options}
                onChange={e => onChange('options', e.target.value)}
                placeholder={'Opzione 1\nOpzione 2\nOpzione 3'}
              />
              {formErrors.options && <span style={styles.fieldError}>{formErrors.options}</span>}
            </div>
          )}
          <ModalField
            label="Placeholder"
            value={form.placeholder}
            onChange={v => onChange('placeholder', v)}
          />
          <ModalField
            label="Testo di aiuto"
            value={form.help_text}
            onChange={v => onChange('help_text', v)}
          />
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.required} onChange={e => onChange('required', e.target.checked)} />
              Obbligatorio
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_active} onChange={e => onChange('is_active', e.target.checked)} />
              Attivo
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button style={styles.btnOutline} onClick={onClose} disabled={saving}>Annulla</button>
          <button style={styles.btnPrimary} onClick={onSave} disabled={saving}>
            {saving ? 'Salvataggio...' : isEdit ? 'Aggiorna' : 'Crea Campo'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalField({ label, value, onChange, error, disabled, hint }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; disabled?: boolean; hint?: string
}) {
  return (
    <div style={styles.formField}>
      <label style={styles.formLabel}>{label}</label>
      <input
        style={{ ...styles.input, opacity: disabled ? 0.6 : 1 }}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      />
      {hint && <span style={styles.hint}>{hint}</span>}
      {error && <span style={styles.fieldError}>{error}</span>}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginTop: 20,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text)',
  },
  loadingText: {
    fontSize: '13px',
    color: 'var(--muted)',
    padding: '16px 0',
  },
  emptyText: {
    fontSize: '13px',
    color: 'var(--muted)',
    padding: '24px 0',
    textAlign: 'center',
  },
  fieldList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  fieldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    background: 'var(--panel)',
    borderRadius: 10,
    border: '1px solid var(--line)',
    flexWrap: 'wrap' as const,
  },
  fieldInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text)',
  },
  fieldKey: {
    fontSize: '12px',
    fontFamily: 'var(--font-code)',
    color: 'var(--muted)',
  },
  badge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 500,
    padding: '1px 6px',
    borderRadius: 4,
    background: 'rgba(47,111,190,0.10)',
    color: 'var(--blue)',
  },
  fieldActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9000,
    padding: 16,
  },
  dialog: {
    background: 'var(--panel-solid)',
    borderRadius: 'var(--radius-md)',
    padding: 24,
    maxWidth: 400,
    width: '100%',
    border: '1px solid var(--line)',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
  },
  formField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  formLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--muted)',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    fontFamily: 'var(--font-sans)',
    color: 'var(--text)',
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    outline: 'none',
  },
  hint: {
    fontSize: '11px',
    color: 'var(--muted)',
  },
  fieldError: {
    fontSize: '12px',
    color: 'var(--red)',
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
}
