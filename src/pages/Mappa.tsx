import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MapPin, Phone, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'

interface SaleRoom {
  nome?: string
  mq?: number
  teatro?: number
  banchetto?: number
  cabaret?: number
  ferro?: number
  scuola?: number
  boardroom?: number
  cocktail?: number
}

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
  details: { sale?: SaleRoom[]; [k: string]: unknown } | null
}

const supplierIcon = L.divIcon({
  className: '',
  html: '<div style="width:26px;height:26px;border-radius:50%;background:#e02040;border:2px solid #fff;box-shadow:0 2px 8px rgba(38,41,46,0.25)"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

function clusterIcon(cluster: { getChildCount(): number }) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 34 : count < 50 ? 42 : 50
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#e02040;border:2px solid #fff;box-shadow:0 2px 8px rgba(38,41,46,0.25);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:500;font-size:${size < 42 ? 12 : 14}px;font-family:Inter,system-ui,sans-serif">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export default function Mappa() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<MapSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [minTeatro, setMinTeatro] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('id, name, category, city, country, address, phone, email, website, latitude, longitude, loc_capienza_teatro, loc_capienza_banquetto, loc_capienza_cocktail, loc_tipo, notes, details')
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
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: 'var(--text)', margin: 0 }}>
          Mappa fornitori
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
          {loading ? 'Caricamento...' : `${filtered.length} fornitori georeferenziati`}
        </p>
      </div>

      {/* Filter bar */}
      <div style={{
        background: 'var(--panel-solid)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-md)',
        padding: 12,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--muted)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca nome o città..."
              style={{
                width: '100%', height: 38, paddingLeft: 34, paddingRight: 10,
                background: 'var(--panel-solid)', border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)', fontSize: 14, color: 'var(--text)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{
              height: 38, background: 'var(--panel-solid)', border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)', fontSize: 14, color: 'var(--text)',
              paddingLeft: 10, paddingRight: 10, outline: 'none',
            }}
          >
            <option value="">Tutte le categorie</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            type="number"
            value={minTeatro}
            onChange={e => setMinTeatro(e.target.value)}
            placeholder="Capienza teatro minima"
            min={0}
            style={{
              height: 38, background: 'var(--panel-solid)',
              border: `1px solid ${minTeatro ? 'var(--red2)' : 'var(--line)'}`,
              borderRadius: 'var(--radius-sm)', fontSize: 14, color: 'var(--text)',
              paddingLeft: 10, paddingRight: 10, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Map */}
      <div style={{
        flex: 1, minHeight: 420,
        borderRadius: 'var(--radius-md)', overflow: 'hidden',
        border: '1px solid var(--line)',
      }}>
        {!loading && (
          <MapContainer
            center={[42.5, 12.5]}
            zoom={6}
            scrollWheelZoom
            style={{ width: '100%', height: '100%', minHeight: 420 }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
            />
            <MarkerClusterGroup chunkedLoading iconCreateFunction={clusterIcon}>
              {filtered.map(s => (
                <Marker key={s.id} position={[s.latitude, s.longitude]} icon={supplierIcon}>
                  <Popup maxWidth={320} minWidth={240}>
                    <SupplierPopup s={s} onOpen={() => navigate(`/network/fornitori?id=${s.id}`)} />
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

const CAPACITY_LAYOUTS = ['teatro', 'banchetto', 'cabaret', 'ferro', 'scuola', 'boardroom', 'cocktail'] as const

function SupplierPopup({ s, onOpen }: { s: MapSupplier; onOpen: () => void }) {
  const [saleOpen, setSaleOpen] = useState(false)
  const sale = (s.details?.sale as SaleRoom[] | undefined) ?? []
  const hasCapacities = (s.loc_capienza_teatro ?? 0) > 0 || (s.loc_capienza_banquetto ?? 0) > 0 || (s.loc_capienza_cocktail ?? 0) > 0

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13 }}>
      <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{s.name}</p>

      {s.category && (
        <span style={{
          display: 'inline-block', marginTop: 5,
          background: 'color-mix(in srgb, var(--red2) 10%, transparent)',
          color: 'var(--red2)', fontSize: 11, padding: '3px 9px',
          borderRadius: 999, fontWeight: 500,
        }}>
          {s.category}
        </span>
      )}

      {s.notes && (
        <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 12 }}>{s.notes}</p>
      )}

      {(s.address || s.city) && (
        <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <MapPin style={{ width: 12, height: 12, flexShrink: 0 }} />
          {[s.address, s.city, s.country].filter(Boolean).join(', ')}
        </p>
      )}

      {hasCapacities && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
          {[
            { val: s.loc_capienza_teatro, label: 'teatro' },
            { val: s.loc_capienza_banquetto, label: 'banchetto' },
            { val: s.loc_capienza_cocktail, label: 'cocktail' },
          ].filter(c => c.val && c.val > 0).map(c => (
            <div key={c.label} style={{
              background: 'var(--panel2)', borderRadius: 8, padding: 7, textAlign: 'center',
            }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>{c.val}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {sale.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setSaleOpen(!saleOpen)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 12, fontWeight: 500, color: 'var(--red2)',
            }}
          >
            {saleOpen ? '▾' : '▸'} Dettaglio sale ({sale.length})
          </button>
          {saleOpen && (
            <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sale.map((room, i) => (
                <div key={i} style={{ background: 'var(--panel2)', borderRadius: 8, padding: '6px 8px' }}>
                  <div style={{ fontWeight: 500, fontSize: 12, color: 'var(--text)' }}>
                    {room.nome || `Sala ${i + 1}`}
                    {room.mq ? <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>{room.mq} mq</span> : null}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {CAPACITY_LAYOUTS
                      .filter(k => room[k] && (room[k] as number) > 0)
                      .map(k => `${k} ${room[k]}`)
                      .join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <button
          onClick={onOpen}
          style={{
            flex: 1, height: 32, background: 'var(--red2)', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Apri scheda
        </button>
        {s.email && (
          <a href={`mailto:${s.email}`} style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--line)', borderRadius: 10, color: 'var(--muted)', textDecoration: 'none',
          }}>
            <Mail style={{ width: 14, height: 14 }} />
          </a>
        )}
        {s.phone && (
          <a href={`tel:${s.phone}`} style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--line)', borderRadius: 10, color: 'var(--muted)', textDecoration: 'none',
          }}>
            <Phone style={{ width: 14, height: 14 }} />
          </a>
        )}
      </div>
    </div>
  )
}
