import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Users,
  Search,
  X,
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Star,
  ChevronRight,
  Building2,
} from 'lucide-react'
import type { Client } from '@/data/clients'
import { fetchClients } from '@/lib/clients-service'
import { useRealtimeTable } from '@/lib/use-realtime'

type FilterStato = 'Tutti' | 'attivo' | 'vip' | 'prospect' | 'perso'

interface CompanyGroup {
  companyName: string
  rows: Client[]
  city: string
  country: string
  status: Client['stato']
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
    const statusPriority: Client['stato'][] = ['vip', 'attivo', 'prospect', 'perso']
    let status: Client['stato'] = 'prospect'
    for (const s of statusPriority) {
      if (rows.some(r => r.stato === s)) { status = s; break }
    }
    groups.push({
      companyName: first.nome,
      rows,
      city,
      country,
      status,
    })
  }
  groups.sort((a, b) => a.companyName.localeCompare(b.companyName))
  return groups
}

interface CompanyDetailProps {
  group: CompanyGroup
  onBack: () => void
}

function CompanyDetail({ group, onBack }: CompanyDetailProps) {
  const [referenteSearch, setReferenteSearch] = useState('')

  const filteredRefs = useMemo(() => {
    if (!referenteSearch.trim()) return group.rows
    const q = referenteSearch.toLowerCase()
    return group.rows.filter(r =>
      r.referente.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.note.toLowerCase().includes(q)
    )
  }, [group.rows, referenteSearch])

  return (
    <div className="space-y-6 animate-fade-in">
      <button onClick={onBack}
        className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
        style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="w-4 h-4" /> Torna alle aziende
      </button>

      {/* Hero */}
      <div className="panel p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ background: `linear-gradient(135deg, ${statoColor(group.status)} 0%, transparent 60%)` }} />
        <div className="relative flex flex-wrap items-start gap-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl font-bold"
            style={{ background: `${statoColor(group.status)}18`, color: statoColor(group.status) }}>
            <Building2 className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ background: `${statoColor(group.status)}18`, color: statoColor(group.status), border: `1px solid ${statoColor(group.status)}35` }}>
                {group.status === 'vip' && <Star className="w-3 h-3 inline mr-1 -mt-0.5" />}
                {statoLabel(group.status)}
              </span>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{group.companyName}</h1>
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
                className="panel p-4 flex items-start gap-4 transition-all animate-fade-in"
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CRM() {
  const [clientList, setClientList] = useState<Client[]>([])
  const [selected, setSelected] = useState<CompanyGroup | null>(null)
  const [filter, setFilter] = useState<FilterStato>('Tutti')
  const [search, setSearch] = useState('')

  const refresh = useCallback(async () => {
    const list = await fetchClients()
    setClientList(list)
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useRealtimeTable('clients', refresh)

  const groups = useMemo(() => buildGroups(clientList), [clientList])

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

  if (selected) {
    return <CompanyDetail group={selected} onBack={() => setSelected(null)} />
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
              className="panel hover-card p-5 cursor-pointer animate-fade-in relative overflow-hidden"
              style={{ animationDelay: `${i * 40}ms` }}
              onClick={() => setSelected(group)}
            >
              <div className="absolute top-0 right-0 w-24 h-24 opacity-[0.06] rounded-bl-full"
                style={{ background: statoColor(group.status) }} />

              <div className="flex items-start gap-3 mb-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
                  style={{ background: `${statoColor(group.status)}15`, color: statoColor(group.status) }}>
                  {group.companyName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>
                    {group.companyName}
                  </h3>
                  {group.city && (
                    <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted)' }}>
                      <MapPin className="w-3 h-3" /> {[group.city, group.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--muted)' }} />
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: `${statoColor(group.status)}15`, color: statoColor(group.status), border: `1px solid ${statoColor(group.status)}30` }}>
                  {group.status === 'vip' && <Star className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                  {statoLabel(group.status)}
                </span>
              </div>

              <div className="flex items-center pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
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
