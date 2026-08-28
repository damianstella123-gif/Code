import { useState, useEffect, useMemo } from 'react'
import { FileText, Download, Lock, FolderOpen } from 'lucide-react'
import { fetchMyDocuments, getSignedUrl, CATEGORY_LABELS, type EmployeeDocument } from '@/lib/employee-documents-service'

export default function AreaPersonaleDocumenti() {
  const [docs, setDocs] = useState<EmployeeDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    fetchMyDocuments()
      .then(setDocs)
      .catch(() => setError('Impossibile caricare i documenti.'))
      .finally(() => setLoading(false))
  }, [])

  const grouped = useMemo(() => {
    const map: Record<string, EmployeeDocument[]> = {}
    for (const doc of docs) {
      const cat = doc.category || 'altro'
      if (!map[cat]) map[cat] = []
      map[cat].push(doc)
    }
    return map
  }, [docs])

  async function handleDownload(doc: EmployeeDocument) {
    setDownloading(doc.id)
    try {
      const url = await getSignedUrl(doc.file_path)
      if (url) window.open(url, '_blank')
    } catch {
      // silent
    } finally {
      setDownloading(null)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--error)' }}>{error}</p>
      </div>
    )
  }

  if (docs.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, padding: 40, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <FolderOpen size={24} style={{ color: 'var(--muted)' }} />
        </div>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
          I Miei Documenti
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', maxWidth: 320 }}>
          Non hai ancora documenti disponibili. Quando l'amministrazione caricherà documenti condivisi con te, li troverai qui.
        </p>
      </div>
    )
  }

  const categories = Object.keys(grouped).sort((a, b) => {
    const order = ['contratto', 'busta_paga', 'cv', 'certificazione', 'valutazione', 'nota', 'altro']
    return order.indexOf(a) - order.indexOf(b)
  })

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Lock size={14} style={{ color: 'var(--muted)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Questi documenti sono visibili solo a te
        </span>
      </div>

      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: 28 }}>
          <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
            {CATEGORY_LABELS[cat] || cat}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {grouped[cat].map(doc => (
              <div
                key={doc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'var(--panel2)',
                  border: '1px solid var(--border)',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <FileText size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.file_name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    {new Date(doc.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(doc)}
                  disabled={downloading === doc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    cursor: 'pointer',
                    opacity: downloading === doc.id ? 0.5 : 1,
                    transition: 'background 0.15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  title="Scarica"
                >
                  <Download size={14} style={{ color: 'var(--text)' }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
