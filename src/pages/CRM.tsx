import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Users,
  Search,
  X,
  ArrowLeft,
  Phone,
  Mail,
  Star,
  Building2,
  Pencil,
  Sparkles,
} from 'lucide-react'
import type { Client } from '@/data/clients'
import type { Event } from '@/data/events'
import { fetchClients, updateClient, uploadCompanyLogo, setCompanyLogo } from '@/lib/clients-service'
import { fetchEventsByClientName } from '@/lib/events-service'
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

const FILTERS: { id: FilterStato; label: string }[] = [
  { id: 'Tutti', label: 'TUTTI' },
  { id: 'attivo', label: 'ATTIVI' },
  { id: 'vip', label: 'VIP' },
  { id: 'prospect', label: 'PROSPECT' },
  { id: 'perso', label: 'PERSI' },
]

function statoColor(stato: Client['stato']) {
  switch (stato) {
    case 'attivo': return 'var(--green)'
    case 'vip': return 'var(--yellow)'
    case 'prospect': return 'var(--blue)'
    case 'perso': return 'var(--muted)'
  }
}

function statoBg(stato: Client['stato']) {
  switch (stato) {
    case 'attivo': return 'color-mix(in srgb, var(--green) 12%, transparent)'
    case 'vip': return 'color-mix(in srgb, var(--yellow) 14%, transparent)'
    case 'prospect': return 'color-mix(in srgb, var(--blue) 12%, transparent)'
    case 'perso': return 'color-mix(in srgb, var(--muted) 12%, transparent)'
  }
}

function statoLabel(stato: Client['stato']) {
  switch (stato) {
    case 'attivo': return 'ATTIVO'
    case 'vip': return 'VIP'
    case 'prospect': return 'PROSPECT'
    case 'perso': return 'PERSO'
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

function evtStatoColor(stato: string) {
  switch (stato) {
    case 'in_corso': return 'var(--red2)'
    case 'pianificazione': return 'var(--blue)'
    case 'completato': return 'var(--green)'
    case 'bozza': return 'var(--yellow)'
    default: return 'var(--muted)'
  }
}

function evtStatoLabel(stato: string) {
  switch (stato) {
    case 'in_corso': return 'IN CORSO'
    case 'pianificazione': return 'PIANIFICAZIONE'
    case 'completato': return 'COMPLETATO'
    case 'bozza': return 'BOZZA'
    default: return stato.toUpperCase()
  }
}

function formatEventDate(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  if (start === end) return s.toLocaleDateString('it-IT', opts)
  return `${s.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} - ${e.toLocaleDateString('it-IT', opts)}`
}

function fmtK(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
  return String(value)
}

function CompanyLogo({ url, name, size, radius }: { url?: string; name: string; size: number; radius: number }) {
  const [imgError, setImgError] = useState(false)
  const initials = name.split(' ').map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase()

  if (url && !imgError) {
    return (
      <img
        src={url}
        alt={name}
        onError={() => setImgError(true)}
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0 }}
      />
    )
  }

  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: 'var(--panel2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: size * 0.3, fontWeight: 600, color: 'var(--muted)' }}>
      {initials || '?'}
    </div>
  )
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
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md p-6 animate-fade-in"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>Modifica referente</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block mb-1.5" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Nome referente</label>
            <input type="text" value={referente} onChange={e => setReferente(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="block mb-1.5" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="block mb-1.5" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Telefono</label>
            <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="block mb-1.5" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Carica / Note</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="block mb-1.5" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Status</label>
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
            className="px-4 py-2 rounded-lg text-sm hover:bg-white/5"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', border: '1px solid var(--line)' }}>
            ANNULLA
          </button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--red2)', color: 'white', fontWeight: 600 }}>
            {saving ? 'SALVATAGGIO...' : 'SALVA'}
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
  onNavigateToEvent?: (eventId: string) => void
}

function CompanyDetail({ group, onBack, onRefresh, onNavigateToEvent }: CompanyDetailProps) {
  const [referenteSearch, setReferenteSearch] = useState('')
  const [editTarget, setEditTarget] = useState<Client | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [clientEvents, setClientEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setEventsLoading(true)
    fetchEventsByClientName(group.companyName).then(evts => {
      if (!cancelled) {
        setClientEvents(evts)
        setEventsLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [group.companyName])

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

  const settore = group.rows.find(r => r.note)?.note ?? ''

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Editorial header */}
      <div style={{ paddingTop: '28px', paddingBottom: '18px', borderBottom: '1.5px solid var(--text)' }}>
        <button onClick={onBack}
          className="flex items-center gap-2 mb-4 transition-all hover:opacity-80"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <ArrowLeft className="w-3.5 h-3.5" /> TORNA ALLE AZIENDE
        </button>

        <div className="flex items-center gap-3 mb-2">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: '4px', background: statoBg(group.status), color: statoColor(group.status) }}>
            {group.status === 'vip' && <Star className="w-3 h-3 inline mr-1 -mt-0.5" />}
            {statoLabel(group.status)}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <CompanyLogo url={group.logoUrl} name={group.companyName} size={52} radius={10} />
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '26px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>
            {group.companyName}
          </h1>
        </div>

        {(settore || group.city || group.country) && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--muted)', marginTop: '6px' }}>
            {[settore, group.city, group.country].filter(Boolean).join(' \u00B7 ')}
          </p>
        )}

        <div style={{ display: 'flex', gap: '18px', marginTop: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
            {group.rows.length} referent{group.rows.length !== 1 ? 'i' : 'e'}
          </span>
          {clientEvents.length > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
              {clientEvents.length} event{clientEvents.length !== 1 ? 'i' : 'o'}
            </span>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
            {uploading ? 'CARICAMENTO...' : group.logoUrl ? '[ CAMBIA LOGO ]' : '[ CARICA LOGO ]'}
          </button>
          <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg" className="hidden" onChange={handleLogoUpload} />
        </div>
        {uploadError && <p className="text-xs mt-1.5" style={{ color: 'var(--red2)' }}>{uploadError}</p>}
      </div>

      {/* Referenti section */}
      <div>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
            REFERENTI ({filteredRefs.length})
          </h2>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            <input type="text" placeholder="Cerca referente..."
              value={referenteSearch} onChange={e => setReferenteSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm bg-transparent focus:outline-none"
              style={{ border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }} />
          </div>
        </div>

        <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden' }}>
          {filteredRefs.length === 0 ? (
            <div className="p-10 text-center" style={{ color: 'var(--muted)' }}>
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>Nessun referente trovato</p>
            </div>
          ) : (
            filteredRefs.map((row, i) => (
              <div key={row.id}
                className="flex items-center gap-3 group transition-colors"
                style={{ padding: '12px 16px', borderBottom: i < filteredRefs.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <div className="flex-shrink-0 flex items-center justify-center"
                  style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--panel2)', fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 600, color: 'var(--muted)' }}>
                  {row.referente ? row.referente.split(' ').map(w => w.charAt(0)).slice(0, 2).join('') : '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      {row.referente || 'Senza nome'}
                    </span>
                    {row === group.rows[0] && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', opacity: 0.7 }}>PRINCIPALE</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-0.5 flex-wrap">
                    {row.email && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--muted)' }}>
                        <Mail className="w-3 h-3 inline mr-1 -mt-0.5" />{row.email}
                      </span>
                    )}
                    {row.telefono && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--muted)' }}>
                        <Phone className="w-3 h-3 inline mr-1 -mt-0.5" />{row.telefono}
                      </span>
                    )}
                    {row.note && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--muted)', opacity: 0.7 }}>{row.note}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setEditTarget(row)}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 flex-shrink-0"
                  title="Modifica referente">
                  <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Events section — cue-sheet style */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '12px' }}>
          EVENTI COLLEGATI{!eventsLoading && clientEvents.length > 0 ? ` (${clientEvents.length})` : ''}
        </h2>

        {eventsLoading ? (
          <div className="p-6 text-center">
            <div className="animate-pulse" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>Caricamento eventi...</div>
          </div>
        ) : clientEvents.length === 0 ? (
          <div className="p-10 text-center" style={{ background: 'var(--panel-solid)', border: '1px dashed var(--line)', borderRadius: '14px' }}>
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: 'var(--muted)' }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
              Nessun evento per questa azienda
            </p>
          </div>
        ) : (
          <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', overflow: 'hidden' }}>
            {clientEvents.map((evt, i) => (
              <div
                key={evt.id}
                className="flex items-center gap-4 cursor-pointer group transition-colors"
                style={{ padding: '12px 16px', borderBottom: i < clientEvents.length - 1 ? '1px solid var(--line)' : 'none' }}
                onClick={() => onNavigateToEvent?.(evt.id)}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--muted)', minWidth: '90px', flexShrink: 0 }}>
                  {formatEventDate(evt.dataInizio, evt.dataFine)}
                </span>
                <span className="flex-1 min-w-0 truncate group-hover:opacity-80 transition-opacity"
                  style={{ fontFamily: 'var(--font-serif)', fontSize: '14px', color: 'var(--text)' }}>
                  {evt.nome}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.04em', color: evtStatoColor(evt.stato), flexShrink: 0 }}>
                  {evtStatoLabel(evt.stato)}
                </span>
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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const refresh = useCallback(async () => {
    const list = await fetchClients()
    setClientList(list)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useRealtimeTable('clients', refresh)

  // Handle deep-link from Events page: /crm?client=CompanyName
  useEffect(() => {
    const clientParam = searchParams.get('client')
    if (clientParam && !selectedName) {
      setSelectedName(clientParam)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, selectedName, setSearchParams])

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

  // KPI stats
  const totalAziende = groups.length
  const attive = groups.filter(g => g.status === 'attivo').length
  const vip = groups.filter(g => g.status === 'vip').length
  const prospect = groups.filter(g => g.status === 'prospect').length

  if (selectedGroup) {
    return (
      <CompanyDetail
        group={selectedGroup}
        onBack={() => setSelectedName(null)}
        onRefresh={refresh}
        onNavigateToEvent={(eventId) => navigate(`/eventi?id=${eventId}`)}
      />
    )
  }

  return (
    <div>
      {/* Wire masthead */}
      <div className="wire-masthead">
        <div>
          <span className="wire-masthead-title">CRM</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginLeft: '12px' }}>
            {totalAziende} AZIENDE
          </span>
        </div>
      </div>

      {/* Wire ticker — KPIs */}
      <div className="wire-ticker">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          <strong>{totalAziende}</strong> totali
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--green)' }}>
          <strong>{attive}</strong> attive
        </span>
        {vip > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--yellow)' }}>
            <Star className="w-3 h-3 inline -mt-0.5 mr-0.5" /><strong>{vip}</strong> VIP
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--blue)' }}>
          <strong>{prospect}</strong> prospect
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          <strong>{fmtK(groups.reduce((s, g) => s + g.rows.length, 0))}</strong> referenti
        </span>
      </div>

      {/* Wire tabs (filters) + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '20px' }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`wire-tab ${filter === f.id ? 'wire-tab--active' : ''}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative" style={{ minWidth: '180px' }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
          <input type="text" placeholder="Cerca..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-transparent focus:outline-none"
            style={{ border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>
      </div>

      {/* Company cards grid */}
      <div style={{ marginTop: '20px' }}>
        {filtered.length === 0 ? (
          <div className="p-12 text-center" style={{ color: 'var(--muted)' }}>
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>Nessuna azienda trovata</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {filtered.map((group) => (
              <div
                key={group.companyName}
                className="cursor-pointer animate-fade-in"
                style={{
                  background: 'var(--panel-solid)',
                  border: '1px solid var(--line)',
                  borderRadius: '14px',
                  padding: '16px 18px',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
                onClick={() => setSelectedName(group.companyName)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
              >
                {/* Top row: logo left, badge right */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <CompanyLogo url={group.logoUrl} name={group.companyName} size={36} radius={8} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 7px', borderRadius: '4px', background: statoBg(group.status), color: statoColor(group.status) }}>
                    {group.status === 'vip' && <Star className="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" />}
                    {statoLabel(group.status)}
                  </span>
                </div>

                {/* Company name */}
                <h3 className="truncate" style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                  {group.companyName}
                </h3>

                {/* Settore + city */}
                {(group.city || group.country) && (
                  <p className="truncate" style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '3px' }}>
                    {[group.city, group.country].filter(Boolean).join(', ')}
                  </p>
                )}

                {/* Data row */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--muted)' }}>
                    {group.rows.length} ref.
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
