import { useState, useEffect, useCallback } from 'react'
import { Upload, Trash2, Download, FileText, Lock, Eye, ChevronLeft, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  fetchEmployeeDocuments,
  uploadEmployeeDocument,
  deleteEmployeeDocument,
  getSignedUrl,
  CATEGORY_LABELS,
  CATEGORIES,
  type EmployeeDocument,
} from '@/lib/employee-documents-service'

interface Profile {
  id: string
  first_name: string
  last_name: string
  role: string
  is_active: boolean
}

export default function FascicoloDipendenti() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null)
  const [docs, setDocs] = useState<EmployeeDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [uploadSection, setUploadSection] = useState<'condiviso' | 'riservato' | null>(null)
  const [uploadCategory, setUploadCategory] = useState('altro')

  useEffect(() => {
    supabase.from('profiles').select('id, first_name, last_name, role, is_active').eq('is_active', true).order('last_name').then(({ data }) => {
      setProfiles((data ?? []) as Profile[])
    })
  }, [])

  const loadDocs = useCallback(async (empId: string) => {
    setLoading(true)
    try {
      const d = await fetchEmployeeDocuments(empId)
      setDocs(d)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (selectedEmployee) loadDocs(selectedEmployee.id)
  }, [selectedEmployee, loadDocs])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !selectedEmployee || !uploadSection) return
    setUploading(true)
    try {
      for (const file of Array.from(e.target.files)) {
        await uploadEmployeeDocument(selectedEmployee.id, file, uploadCategory, uploadSection)
      }
      await loadDocs(selectedEmployee.id)
    } catch (err: any) {
      alert(err.message || 'Errore upload')
    }
    setUploading(false)
    setUploadSection(null)
    e.target.value = ''
  }

  const handleDelete = async (doc: EmployeeDocument) => {
    if (!confirm(`Eliminare "${doc.file_name}"?`)) return
    await deleteEmployeeDocument(doc)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
  }

  const handleOpen = async (doc: EmployeeDocument) => {
    const url = await getSignedUrl(doc.file_path)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const filteredProfiles = profiles.filter(p => {
    const name = `${p.first_name} ${p.last_name}`.toLowerCase()
    return name.includes(search.toLowerCase())
  })

  if (!selectedEmployee) {
    return (
      <div style={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca dipendente..."
              style={{ width: '100%', padding: '8px 8px 8px 30px', fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)' }}
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {filteredProfiles.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedEmployee(p)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--red2)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
            >
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                {(p.first_name?.[0] ?? '').toUpperCase()}{(p.last_name?.[0] ?? '').toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.first_name} {p.last_name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{p.role}</div>
              </div>
            </button>
          ))}
        </div>
        {filteredProfiles.length === 0 && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 40 }}>Nessun dipendente trovato.</p>
        )}
      </div>
    )
  }

  const condivisi = docs.filter(d => d.visibility === 'condiviso')
  const riservati = docs.filter(d => d.visibility === 'riservato')

  return (
    <div style={{ padding: 0 }}>
      <button onClick={() => setSelectedEmployee(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        <ChevronLeft size={12} /> Torna all&apos;elenco
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          {(selectedEmployee.first_name?.[0] ?? '').toUpperCase()}{(selectedEmployee.last_name?.[0] ?? '').toUpperCase()}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{selectedEmployee.first_name} {selectedEmployee.last_name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>Fascicolo personale &middot; {selectedEmployee.role}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: 'var(--red2)', margin: '0 auto' }} />
        </div>
      ) : (
        <>
          <DocSection
            title="Documenti Condivisi"
            subtitle="Visibili al dipendente"
            icon={<Eye size={13} />}
            docs={condivisi}
            onOpen={handleOpen}
            onDelete={handleDelete}
            onUpload={() => setUploadSection('condiviso')}
          />
          <div style={{ height: 20 }} />
          <DocSection
            title="Documenti Riservati"
            subtitle="Solo amministrazione — il dipendente NON li vede"
            icon={<Lock size={13} />}
            docs={riservati}
            onOpen={handleOpen}
            onDelete={handleDelete}
            onUpload={() => setUploadSection('riservato')}
            isRestricted
          />
        </>
      )}

      {uploadSection && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }} onClick={() => setUploadSection(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 14, padding: 24, maxWidth: 360, width: '90%' }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              Carica in {uploadSection === 'condiviso' ? 'Condivisi' : 'Riservati'}
            </h3>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 16 }}>
              {uploadSection === 'riservato' ? 'Il dipendente NON vedrà questo documento.' : 'Il dipendente potrà vedere e scaricare questo documento.'}
            </p>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Categoria</label>
            <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} style={{ width: '100%', padding: '7px 10px', fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--text)', marginBottom: 14 }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>
              <Upload size={14} />
              {uploading ? 'Caricamento...' : 'Seleziona file'}
              <input type="file" multiple onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

function DocSection({ title, subtitle, icon, docs, onOpen, onDelete, onUpload, isRestricted }: {
  title: string; subtitle: string; icon: React.ReactNode; docs: EmployeeDocument[]; onOpen: (d: EmployeeDocument) => void; onDelete: (d: EmployeeDocument) => void; onUpload: () => void; isRestricted?: boolean
}) {
  return (
    <div style={{ background: 'var(--panel2)', border: `1px solid ${isRestricted ? 'rgba(239,68,68,0.2)' : 'var(--line)'}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: isRestricted ? 'var(--red2)' : 'var(--muted)' }}>{icon}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{subtitle}</div>
          </div>
        </div>
        <button onClick={onUpload} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer' }}>
          <Upload size={11} /> Carica
        </button>
      </div>
      {docs.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textAlign: 'center', padding: '14px 0' }}>Nessun documento.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--line)' }}>
              <FileText size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{CATEGORY_LABELS[doc.category] ?? doc.category}</div>
              </div>
              <button onClick={() => onOpen(doc)} title="Apri" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><Download size={13} /></button>
              <button onClick={() => onDelete(doc)} title="Elimina" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red2)', padding: 4 }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
