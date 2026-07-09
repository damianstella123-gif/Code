import { Search, X, Plus, Truck } from 'lucide-react'
import type { Supplier } from '@/data/suppliers'
import type { CategoryType } from '@/components/TabOperativo'
import { LINK_CATEGORIES } from '../../supplier-details-types'

interface AddSupplierPanelProps {
  adding: boolean
  setAdding: (v: boolean) => void
  search: string
  setSearch: (v: string) => void
  availableSuppliers: Supplier[]
  beginLink: (supplierId: string) => void
  pendingLink: string | null
  setPendingLink: (v: string | null) => void
  linkCategory: CategoryType | ''
  setLinkCategory: (v: CategoryType | '') => void
  confirmLink: () => void
  onShowNewSupplier: () => void
}

export function AddSupplierPanel({
  adding, setAdding, search, setSearch,
  availableSuppliers, beginLink,
  pendingLink, setPendingLink,
  linkCategory, setLinkCategory, confirmLink,
  onShowNewSupplier,
}: AddSupplierPanelProps) {
  return (
    <>
      {/* Search panel for linking */}
      {adding && (
        <div className="panel p-4 space-y-3" style={{ border: '1px solid var(--red2)' }}>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca fornitore per nome o categoria..."
              className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
              autoFocus />
            <button onClick={() => { setAdding(false); setSearch('') }}
              className="p-1.5 rounded-lg" style={{ color: 'var(--muted)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {search.trim().length > 0 ? (
              availableSuppliers.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs p-2" style={{ color: 'var(--muted)' }}>
                    Nessun fornitore trovato per "{search}"
                  </p>
                  <button onClick={onShowNewSupplier}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all mt-1"
                    style={{ background: 'color-mix(in srgb, var(--red2) 12%, transparent)', color: 'var(--red2)', border: '1px solid var(--red2)' }}>
                    <Plus className="w-3.5 h-3.5" /> Crea nuovo fornitore
                  </button>
                </div>
              ) : availableSuppliers.slice(0, 10).map(s => (
                <button key={s.id} onClick={() => beginLink(s.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-[var(--line)]"
                  style={{ border: '1px solid var(--line)' }}>
                  <Truck className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red2)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{s.nome}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{s.categoria} · {s.location}</p>
                  </div>
                </button>
              ))
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '13px', padding: '8px 12px' }}>
                Digita per cercare un fornitore...
              </p>
            )}
          </div>
          <div className="pt-2 border-t" style={{ borderColor: 'var(--line)' }}>
            <button onClick={onShowNewSupplier}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{ color: 'var(--red2)' }}>
              <Plus className="w-3.5 h-3.5" /> Crea nuovo fornitore
            </button>
          </div>
        </div>
      )}

      {/* Category selection modal */}
      {pendingLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPendingLink(null)}>
          <div className="panel p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Seleziona categoria</p>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              Come verra utilizzato questo fornitore in questo evento?
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {LINK_CATEGORIES.map(cat => (
                <button key={cat.value} onClick={() => setLinkCategory(cat.value)}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-left transition-all"
                  style={{
                    background: linkCategory === cat.value ? 'color-mix(in srgb, var(--red2) 15%, transparent)' : 'var(--panel2)',
                    border: `1px solid ${linkCategory === cat.value ? 'var(--red2)' : 'var(--line)'}`,
                    color: linkCategory === cat.value ? 'var(--red2)' : 'var(--text)',
                  }}>
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--panel2)', color: 'var(--text)' }} onClick={() => setPendingLink(null)}>Annulla</button>
              <button disabled={!linkCategory} onClick={confirmLink}
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ background: 'var(--red2)', color: '#fff' }}>Conferma</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
