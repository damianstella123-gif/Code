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

// ─── Category styles ──────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { color: string; icon: string; label: string }> = {
  'Hotel':             { color: '#e02040', icon: 'bed',      label: 'Hotel' },
  'Location':          { color: '#7B3FE4', icon: 'building', label: 'Location' },
  'Ristorante':        { color: '#2f9e68', icon: 'utensils', label: 'Ristorante' },
  'Catering':          { color: '#12a594', icon: 'chef',     label: 'Catering' },
  'Transfer':          { color: '#2f6fbe', icon: 'bus',      label: 'Transfer' },
  'Audio Video':       { color: '#c98920', icon: 'speaker',  label: 'Audio Video' },
  'Esperienze':        { color: '#e8590c', icon: 'sparkles', label: 'Esperienze' },
  'Staff Esterno':     { color: '#0d9488', icon: 'users',    label: 'Staff' },
  'Gadget':            { color: '#c026d3', icon: 'gift',     label: 'Gadget' },
  'DMC':               { color: '#475569', icon: 'globe',    label: 'DMC' },
  'Agenzia di Viaggi': { color: '#0891b2', icon: 'plane',    label: 'Agenzia Viaggi' },
  'Assicurazioni':     { color: '#64748b', icon: 'shield',   label: 'Assicurazioni' },
}
const DEFAULT_STYLE = { color: '#5f666d', icon: 'dot', label: 'Altro' }

function styleFor(category: string | null) {
  return CATEGORY_STYLE[category ?? ''] ?? DEFAULT_STYLE
}

// ─── SVG glyphs (12x12, white on transparent) ────────────────────────────

const SVG_GLYPHS: Record<string, string> = {
  bed:      '<path d="M1 8h10M1 5h10M3 5V3h6v2" stroke="#fff" stroke-width="1.2" fill="none"/>',
  building: '<rect x="2" y="1" width="8" height="10" rx="1" stroke="#fff" stroke-width="1.2" fill="none"/><line x1="5" y1="3" x2="5" y2="5" stroke="#fff" stroke-width="1"/><line x1="7" y1="3" x2="7" y2="5" stroke="#fff" stroke-width="1"/><line x1="5" y1="7" x2="5" y2="9" stroke="#fff" stroke-width="1"/><line x1="7" y1="7" x2="7" y2="9" stroke="#fff" stroke-width="1"/>',
  utensils: '<path d="M3 1v4c0 1 1 2 2 2v4M9 1v10M7 1v3c0 1 1 1.5 2 1.5" stroke="#fff" stroke-width="1.2" fill="none"/>',
  chef:     '<path d="M3 9h6M4 9V7a2 2 0 014 0v2" stroke="#fff" stroke-width="1.2" fill="none"/><circle cx="6" cy="4" r="2.5" stroke="#fff" stroke-width="1.2" fill="none"/>',
  bus:      '<rect x="1.5" y="2" width="9" height="7" rx="1.5" stroke="#fff" stroke-width="1.2" fill="none"/><line x1="1.5" y1="7" x2="10.5" y2="7" stroke="#fff" stroke-width="1"/><circle cx="3.5" cy="10" r="0.8" fill="#fff"/><circle cx="8.5" cy="10" r="0.8" fill="#fff"/>',
  speaker:  '<rect x="2" y="3" width="3" height="6" rx="0.5" stroke="#fff" stroke-width="1.2" fill="none"/><path d="M5 4l3-2v8l-3-2" stroke="#fff" stroke-width="1.2" fill="none"/>',
  sparkles: '<path d="M6 1l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#fff"/>',
  users:    '<circle cx="4" cy="4" r="2" stroke="#fff" stroke-width="1.1" fill="none"/><circle cx="8.5" cy="4.5" r="1.5" stroke="#fff" stroke-width="1" fill="none"/><path d="M0.5 11c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5" stroke="#fff" stroke-width="1.1" fill="none"/>',
  gift:     '<rect x="2" y="5" width="8" height="6" rx="1" stroke="#fff" stroke-width="1.2" fill="none"/><line x1="6" y1="5" x2="6" y2="11" stroke="#fff" stroke-width="1"/><path d="M6 5C6 3 4 2 3 3s0 2 3 2M6 5c0-2 2-3 3-2s0 2-3 2" stroke="#fff" stroke-width="1" fill="none"/>',
  globe:    '<circle cx="6" cy="6" r="5" stroke="#fff" stroke-width="1.2" fill="none"/><ellipse cx="6" cy="6" rx="2.2" ry="5" stroke="#fff" stroke-width="0.8" fill="none"/><line x1="1" y1="6" x2="11" y2="6" stroke="#fff" stroke-width="0.8"/>',
  plane:    '<path d="M6 1L6 11M3 4l3-1 3 1M2 8l4-1 4 1" stroke="#fff" stroke-width="1.2" fill="none"/>',
  shield:   '<path d="M6 1L2 3v3c0 3 2 5 4 6 2-1 4-3 4-6V3z" stroke="#fff" stroke-width="1.2" fill="none"/>',
  dot:      '<circle cx="6" cy="6" r="3" fill="#fff"/>',
}

function svgGlyph(icon: string): string {
  const body = SVG_GLYPHS[icon] ?? SVG_GLYPHS.dot
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12">${body}</svg>`
}

// ─── Marker icons (cached) ───────────────────────────────────────────────

const iconCache = new Map<string, L.DivIcon>()
function markerIcon(category: string | null): L.DivIcon {
  const key = category ?? '_default'
  if (!iconCache.has(key)) {
    const s = styleFor(category)
    iconCache.set(key, L.divIcon({
      className: '',
      html: `<div style="width:28px;height:28px;border-radius:50%;background:${s.color};border:2px solid #fff;box-shadow:0 2px 8px rgba(38,41,46,0.3);display:flex;align-items:center;justify-content:center">${svgGlyph(s.icon)}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    }))
  }
  return iconCache.get(key)!
}

// ─── Cluster icon (dominant category colour) ─────────────────────────────

function clusterIcon(cluster: { getChildCount(): number; getAllChildMarkers(): L.Marker[] }) {
  const count = cluster.getChildCount()
  const size = count < 10 ? 34 : count < 50 ? 42 : 50

  const freq = new Map<string, number>()
  for (const m of cluster.getAllChildMarkers()) {
    const cat = ((m.options as Record<string, unknown>).category as string) ?? '_default'
    freq.set(cat, (freq.get(cat) ?? 0) + 1)
  }
  let topCat = '_default'
  let topCount = 0
  for (const [cat, n] of freq) {
    if (n > topCount) { topCat = cat; topCount = n }
  }
  const color = styleFor(topCat === '_default' ? null : topCat).color

  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(38,41,46,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:500;font-size:${size < 42 ? 12 : 14}px;font-family:Inter,system-ui,sans-serif">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// ─── Component ───────────────────────────────────────────────────────────

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

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of suppliers) {
      if (s.category) counts.set(s.category, (counts.get(s.category) ?? 0) + 1)
    }
    return counts
  }, [suppliers])

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

        {/* Legend */}
        {categories.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {categories.map(cat => {
              const s = styleFor(cat)
              const active = categoryFilter === cat
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(active ? '' : cat)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: 'var(--panel-solid)',
                    border: `1px solid ${active ? s.color : 'var(--line)'}`,
                    borderRadius: 999, padding: '4px 10px', fontSize: 12,
                    color: active ? s.color : 'var(--muted)',
                    cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 500 : 400,
                    transition: 'all 150ms',
                  }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: s.color, flexShrink: 0,
                  }} />
                  {s.label}
                  <span style={{ opacity: 0.7 }}>{categoryCounts.get(cat) ?? 0}</span>
                </button>
              )
            })}
          </div>
        )}
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
                <Marker
                  key={s.id}
                  position={[s.latitude, s.longitude]}
                  icon={markerIcon(s.category)}
                  {...{ category: s.category } as Record<string, unknown>}
                >
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
  const catStyle = styleFor(s.category)

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13 }}>
      <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{s.name}</p>

      {s.category && (
        <span style={{
          display: 'inline-block', marginTop: 5,
          background: `color-mix(in srgb, ${catStyle.color} 12%, transparent)`,
          color: catStyle.color, fontSize: 11, padding: '3px 9px',
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
              fontSize: 12, fontWeight: 500, color: catStyle.color,
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
            flex: 1, height: 32, background: catStyle.color, color: '#fff',
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
