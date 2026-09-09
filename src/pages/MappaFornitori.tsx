import { useState, useEffect, useMemo } from 'react'
import { Search, Phone, Mail, Globe, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

interface MapSupplier {
  id: string
  name: string
  category: string
  city: string | null
  country: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  latitude: number
  longitude: number
  loc_capienza_teatro: number | null
  loc_capienza_banquetto: number | null
  loc_capienza_cocktail: number | null
  loc_tipo: string | null
  notes: string | null
}

export default function MappaFornitori() {
  const [suppliers, setSuppliers] = useState<MapSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [minTeatro, setMinTeatro] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('id, name, category, city, country, address, phone, email, website, latitude, longitude, loc_capienza_teatro, loc_capienza_banquetto, loc_capienza_cocktail, loc_tipo, notes')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
      setSuppliers((data as MapSupplier[]) ?? [])
      setLoading(false)
    })()
  }, [])

  const categories = useMemo(
    () => [...new Set(suppliers.map(s => s.category).filter(Boolean))].sort(),
    [suppliers],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const minCap = minTeatro ? parseInt(minTeatro, 10) : 0
    return suppliers.filter(s => {
      if (q && !s.name.toLowerCase().includes(q) && !(s.city ?? '').toLowerCase().includes(q)) return false
      if (categoryFilter && s.category !== categoryFilter) return false
      if (minCap > 0 && (s.loc_capienza_teatro ?? 0) < minCap) return false
      return true
    })
  }, [suppliers, search, categoryFilter, minTeatro])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--red2) 12%, transparent)' }}>
            <MapPin className="w-5 h-5" style={{ color: 'var(--red2)' }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Mappa Fornitori</h1>
            <p className="text-xs" style={{ color: 'var(--textSoft)' }}>
              {loading ? 'Caricamento...' : `${filtered.length} fornitori sul territorio`}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b" style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--textSoft)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca nome o città..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg text-xs"
          style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
        >
          <option value="">Tutte le categorie</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="number"
          value={minTeatro}
          onChange={e => setMinTeatro(e.target.value)}
          placeholder="Capienza teatro minima"
          className="w-44 px-2.5 py-1.5 rounded-lg text-xs"
          style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
          min={0}
        />
      </div>

      {/* Map */}
      <div className="flex-1 min-h-0">
        {!loading && (
          <MapContainer
            center={[42.5, 12.5]}
            zoom={6}
            className="w-full h-full"
            style={{ minHeight: 400 }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <MarkerClusterGroup chunkedLoading>
              {filtered.map(s => (
                <Marker key={s.id} position={[s.latitude, s.longitude]}>
                  <Popup maxWidth={280} minWidth={200}>
                    <div style={{ fontFamily: 'inherit' }}>
                      <p className="font-semibold text-sm m-0">{s.name}</p>
                      {s.category && (
                        <span
                          className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{ background: 'color-mix(in srgb, var(--red2) 12%, transparent)', color: 'var(--red2)' }}
                        >
                          {s.category}
                        </span>
                      )}
                      {(s.city || s.country) && (
                        <p className="text-xs mt-1 m-0" style={{ color: '#666' }}>
                          {[s.city, s.country].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {s.address && <p className="text-xs m-0" style={{ color: '#666' }}>{s.address}</p>}
                      {s.notes && <p className="text-xs mt-1 m-0 italic" style={{ color: '#888' }}>{s.notes}</p>}
                      <Capacities s={s} />
                      <div className="flex flex-wrap gap-2 mt-2">
                        {s.phone && (
                          <a href={`tel:${s.phone}`} className="text-xs flex items-center gap-1" style={{ color: 'var(--blue, #2563eb)' }}>
                            <Phone className="w-3 h-3" />{s.phone}
                          </a>
                        )}
                        {s.email && (
                          <a href={`mailto:${s.email}`} className="text-xs flex items-center gap-1" style={{ color: 'var(--blue, #2563eb)' }}>
                            <Mail className="w-3 h-3" />{s.email}
                          </a>
                        )}
                        {s.website && (
                          <a href={s.website.startsWith('http') ? s.website : `https://${s.website}`} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1" style={{ color: 'var(--blue, #2563eb)' }}>
                            <Globe className="w-3 h-3" />Sito
                          </a>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          </MapContainer>
        )}
      </div>
    </div>
  )
}

function Capacities({ s }: { s: MapSupplier }) {
  const parts: string[] = []
  if (s.loc_capienza_teatro && s.loc_capienza_teatro > 0) parts.push(`Teatro: ${s.loc_capienza_teatro}`)
  if (s.loc_capienza_banquetto && s.loc_capienza_banquetto > 0) parts.push(`Banchetto: ${s.loc_capienza_banquetto}`)
  if (s.loc_capienza_cocktail && s.loc_capienza_cocktail > 0) parts.push(`Cocktail: ${s.loc_capienza_cocktail}`)
  if (parts.length === 0) return null
  return <p className="text-xs mt-1 m-0" style={{ color: '#555' }}>{parts.join(' · ')}</p>
}
