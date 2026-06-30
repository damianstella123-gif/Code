import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Users,
  Search,
  X,
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Star,
  Building2,
  Pencil,
  Upload,
} from 'lucide-react'
import type { Client } from '@/data/clients'
import { fetchClients, updateClient, uploadCompanyLogo, setCompanyLogo } from '@/lib/clients-service'
import { useRealtimeTable } from '@/lib/use-realtime'
import { setFlyContext } from '@/lib/fly'

type FilterStato = 'Tutti' | 'attivo' | 'vip' | 'prospect' | 'perso'

interface CompanyGroup {
  companyName: string
  rows: Client[]
  city: string
  country: string
  status: Client['stato']
  logoUrl?: string
}

const FILTERS: { id: FilterStato; label: string; color: string }[] = [
  { id: 'Tutti', label: 'Tutti', color: 'var(--text)' },
  { id: 'attivo', label: 'Attivo', color: 'var(--green)' },
  { id: 'vip', label: 'VIP', color: 'var(--yellow)' },
  { id: 'prospect', label: 'Prospect', color: 'var(--blue)' },
  { id: 'perso', label: 'Perso', color: 'var(--muted)' },
]

function statoColor(stato: Client['stato']) {
  switch (stato) {
    case 'attivo': return 'var(--green)'
    case 'vip': return 'var(--yellow)'
    case 'prospect': return 'var(--blue)'
    case 'perso': return 'var(--muted)'
  }
}

function statoLabel(stato: Client['stato']) {
  switch (stato) {
    case 'attivo': return 'Attivo'
    case 'vip': return 'VIP'
    case 'prospect': return 'Prospect'
    case 'perso': return 'Perso'
  }
}

function buildGroups(clients: Client[]): CompanyGroup[] {
  const map = new Map<string, Client[]>()
  for (const c of clients) {
    const key = (c.nome || '').trim().toUpperCase()
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }
  const groups: CompanyGroup[] = []
  for (const [, rows] of map) {
    const first = rows[0]
    const city = rows.find(r => r.citta)?.citta ?? ''
    const country = rows.find(r => r.nazione)?.nazione ?? ''
    const logoUrl = rows.find(r => r.logoUrl)?.logoUrl
    const statusPriority: Client['stato'][] = ['vip', 'attivo', 'prospect', 'perso']
    let status: Client['stato'] = 'prospect'
    for (const s of statusPriority) {
      if (rows.some(r => r.stato === s)) { status = s; break }
    }
    groups.push({ companyName: first.nome, rows, city, country, status, logoUrl })
  }
  groups.sort((a, b) => a.companyName.localeCompare(b.companyName))
  return groups
}

interface EditReferenteModalProps {
  row: Client
  onClose: () => void
  onSaved: () => void
}

function EditReferenteModal({ row, onClose, onSaved }: EditReferenteModalProps) {
  const [referente, setReferente] = useState(row.referente)
  const [email, setEmail] = useState(row.email)
  const [telefono, setTelefono] = useState(row.telefono)
  const [note, setNote] = useState(row.note)
  const [stato, setStato] = useState<Client['stato']>(row.stato)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSaving(true)
    setError(null)
    const result = await updateClient(row.id, { referente, email, telefono, note, stato })
    setSaving(false)
    if (!result) {
      setError('Salvataggio non riuscito')
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-md panel p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Modifica referente</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Nome referente</label>
            <input type="text" value={referente} onChange={e => setReferente(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Telefono</label>
            <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Carica / Note</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Status</label>
            <select value={stato} onChange={e => setStato(e.target.value as Client['stato'])}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <option value="attivo">Attivo</option>
              <option value="vip">VIP</option>
              <option value="prospect">Prospect</option>
              <option value="perso">Perso</option>
            </select>
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--red2)' }}>{error}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5"
            style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
            Annulla
          </button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}>
            {saving ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface CompanyDetailProps {
  group: CompanyGroup
  onBack: () => void
  onRefresh: () => void
}

function CompanyDetail({ group, onBack, onRefresh }: CompanyDetailProps) {
  const [referenteSearch, setReferenteSearch] = useState('')
  const [editTarget, setEditTarget] = useState<Client | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredRefs = useMemo(() => {
    if (!referenteSearch.trim()) return group.rows
    const q = referenteSearch.toLowerCase()
    return group.rows.filter(r =>
      r.referente.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.note.toLowerCase().includes(q)
    )
  }, [group.rows, referenteSearch])

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!allowed.includes(file.type)) {
      setUploadError('Formato non supportato. Usa PNG, JPG, WEBP o SVG.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('File troppo grande. Max 2MB.')
      return
    }

    setUploading(true)
    setUploadError(null)

    const publicUrl = await uploadCompanyLogo(group.companyName, file)
    if (!publicUrl) {
      setUploadError('Upload non riuscito.')
      setUploading(false)
      return
    }

    const ok = await setCompanyLogo(group.companyName, publicUrl)
    setUploading(false)
    if (!ok) {
      setUploadError('Salvataggio URL non riuscito.')
      return
    }
    onRefresh()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <button onClick={onBack}
        className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
        style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="w-4 h-4" /> Torna alle aziende
      </button>

      {/* Hero */}
      <div className="panel relative overflow-hidden" style={{ minHeight: '150px' }}>
        {/* Logo watermark - right side only */}
        {group.logoUrl ? (
          <img src={group.logoUrl} alt="" aria-hidden
            className="absolute right-4 top-[50%] -translate-y-1/2 h-[80%] w-[45%] object-contain object-right pointer-events-none select-none"
            style={{ opacity: 0.10 }} />
        ) : (
          <div className="absolute right-6 top-[50%] -translate-y-1/2 pointer-events-none select-none">
            <span className="text-8xl font-black" style={{ opacity: 0.06, color: statoColor(group.status) }}>
              {group.companyName.split(' ').map(w => w[0]).join('').slice(0, 3)}
            </span>
          </div>
        )}

        {/* Gradient overlay - protects left text */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to right, var(--bg) 45%, transparent 80%)' }} />

        {/* Content */}
        <div className="relative p-6 flex flex-col justify-between" style={{ minHeight: '150px' }}>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ background: `${statoColor(group.status)}18`, color: statoColor(group.status), border: `1px solid ${statoColor(group.status)}35` }}>
                {group.status === 'vip' && <Star className="w-3 h-3 inline mr-1 -mt-0.5" />}
                {statoLabel(group.status)}
              </span>
            </div>
            <h1 className="text-2xl font-bold max-w-[70%]" style={{ color: 'var(--text)' }}>{group.companyName}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              {(group.city || group.country) && (
                <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                  <MapPin className="w-3.5 h-3.5" /> {[group.city, group.country].filter(Boolean).join(', ')}
                </span>
              )}
              <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                <Users className="w-3.5 h-3.5" /> {group.rows.length} referent{group.rows.length !== 1 ? 'i' : 'e'}
              </span>
            </div>
          </div>

          {/* Upload logo button */}
          <div className="mt-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
              style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}>
              {uploading ? (
                <span>Caricamento...</span>
              ) : (
                <><Upload className="w-3 h-3" /> {group.logoUrl ? 'Cambia logo' : 'Carica logo'}</>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.svg"
              className="hidden"
              onChange={handleLogoUpload}
            />
            {uploadError && <p className="text-xs mt-1.5" style={{ color: 'var(--red2)' }}>{uploadError}</p>}
          </div>
        </div>
      </div>

      {/* Referenti section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Referenti</h2>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
            <input type="text" placeholder="Cerca referente..."
              value={referenteSearch} onChange={e => setReferenteSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm bg-transparent"
              style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
        </div>

        {filteredRefs.length === 0 ? (
          <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Nessun referente trovato</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRefs.map((row, i) => (
              <div key={row.id}
                className="panel p-4 flex items-start gap-4 group transition-all animate-fade-in"
                style={{ animationDelay: `${i * 30}ms`, border: '1px solid var(--line)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                  style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                  {row.referente ? row.referente.split(' ').map(w => w.charAt(0)).slice(0, 2).join('') : '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {row.referente || 'Senza nome'}
                  </span>
                  {row.note && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{row.note}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    {row.email && (
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--blue)' }}>
                        <Mail className="w-3 h-3" /> {row.email}
                      </span>
                    )}
                    {row.telefono && (
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                        <Phone className="w-3 h-3" /> {row.telefono}
                      </span>
                    )}
                  </div>
                  {row.stato && (
                    <span className="inline-block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded mt-2 font-medium"
                      style={{ background: `${statoColor(row.stato)}15`, color: statoColor(row.stato) }}>
                      {statoLabel(row.stato)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setEditTarget(row)}
                  className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 flex-shrink-0"
                  title="Modifica referente">
                  <Pencil className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editTarget && (
        <EditReferenteModal
          row={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={onRefresh}
        />
      )}
    </div>
  )
}

export default function CRM() {
  const [clientList, setClientList] = useState<Client[]>([])
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterStato>('Tutti')
  const [search, setSearch] = useState('')

  const refresh = useCallback(async () => {
    const list = await fetchClients()
    setClientList(list)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useRealtimeTable('clients', refresh)

  const groups = useMemo(() => buildGroups(clientList), [clientList])

  const selectedGroup = useMemo(() => {
    if (!selectedName) return null
    return groups.find(g => g.companyName.toUpperCase() === selectedName.toUpperCase()) ?? null
  }, [groups, selectedName])

  // Set Fly AI context
  useEffect(() => {
    setFlyContext({
      page: 'crm',
      clientId: selectedGroup?.rows[0]?.id ?? undefined,
      eventId: undefined,
    })
    return () => { setFlyContext({ page: 'crm', clientId: undefined }) }
  }, [selectedGroup])

  const filtered = useMemo(() => {
    return groups.filter(g => {
      const matchFilter = filter === 'Tutti' || g.status === filter
      const q = search.trim().toLowerCase()
      if (!q) return matchFilter
      const matchSearch =
        g.companyName.toLowerCase().includes(q) ||
        g.rows.some(r =>
          r.referente.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.note.toLowerCase().includes(q)
        )
      return matchFilter && matchSearch
    })
  }, [groups, filter, search])

  if (selectedGroup) {
    return (
      <CompanyDetail
        group={selectedGroup}
        onBack={() => setSelectedName(null)}
        onRefresh={refresh}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>CRM</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            {filtered.length} aziend{filtered.length !== 1 ? 'e' : 'a'}
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl flex-1 min-w-[200px]"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input type="text" placeholder="Cerca azienda, referente, email, carica..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--text)' }} />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: filter === f.id ? (f.id === 'Tutti' ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : `${f.color}18`) : 'transparent',
                color: filter === f.id ? (f.id === 'Tutti' ? 'white' : f.color) : 'var(--muted)',
                border: filter === f.id && f.id !== 'Tutti' ? `1px solid ${f.color}35` : '1px solid transparent',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Company cards grid */}
      {filtered.length === 0 ? (
        <div className="panel p-12 text-center" style={{ color: 'var(--muted)' }}>
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nessuna azienda trovata</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((group, i) => (
            <div
              key={group.companyName}
              className="panel hover-card cursor-pointer animate-fade-in relative overflow-hidden"
              style={{ animationDelay: `${i * 40}ms`, minHeight: '130px' }}
              onClick={() => setSelectedName(group.companyName)}
            >
              {/* Logo - right side, full height */}
              {group.logoUrl ? (
                <img
                  src={group.logoUrl}
                  alt=""
                  aria-hidden
                  className="absolute right-3 top-[50%] -translate-y-1/2 h-[80%] w-[45%] object-contain object-right pointer-events-none select-none"
                  style={{ opacity: 0.12 }}
                />
              ) : (
                <div className="absolute right-4 top-[50%] -translate-y-1/2 pointer-events-none select-none"
                  style={{ opacity: 0.06 }}>
                  <span className="text-7xl font-black" style={{ color: statoColor(group.status) }}>
                    {(group.companyName || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* Gradient overlay - protects left text from logo bleed */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(to right, var(--bg) 40%, transparent 75%)' }} />

              {/* Content - left aligned */}
              <div className="relative p-5 flex flex-col justify-between h-full" style={{ minHeight: '130px' }}>
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `${statoColor(group.status)}15`, color: statoColor(group.status), border: `1px solid ${statoColor(group.status)}30` }}>
                      {group.status === 'vip' && <Star className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                      {statoLabel(group.status)}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold truncate max-w-[70%]" style={{ color: 'var(--text)' }}>
                    {group.companyName}
                  </h3>
                  {group.city && (
                    <p className="text-xs flex items-center gap-1 mt-0.5 max-w-[65%]" style={{ color: 'var(--muted)' }}>
                      <MapPin className="w-3 h-3 flex-shrink-0" /> {[group.city, group.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs mt-3" style={{ color: 'var(--muted)' }}>
                  <Users className="w-3.5 h-3.5" />
                  {group.rows.length} referent{group.rows.length !== 1 ? 'i' : 'e'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
