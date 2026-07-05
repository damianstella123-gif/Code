import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, MapPin, Globe, Star, FileText, Euro,
  Search, X, Plus, Trash2, Save, Upload, Building2, Edit3, Link2,
  Hotel, UtensilsCrossed, MapPinned, Sparkles, Bus, CookingPot,
  Speaker, PaintBucket, Users, MoreHorizontal, Camera, Video, Shield,
  Music, ChevronRight, Navigation,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { fetchSuppliers, upsertSupplier, deleteSupplier as deleteSupplierRemote, updateSupplier } from '@/lib/suppliers-service'
import { useRealtimeTable } from '@/lib/use-realtime'
import { supabase } from '@/lib/supabase'
import type { Supplier, SupplierDetails, SalaMeeting, StatoContratto } from '@/data/suppliers'
import { SUPPLIER_CATEGORIES } from '@/data/suppliers'

// ─── Constants ──────────────────────────────────────────────────────────────

const NAV_CATEGORIES = ['Hotel', 'Ristorante', 'Audio Video', 'Catering', 'Location', 'Trasporti', 'Allestimenti', 'Altro'] as const

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Hotel, Ristorante: UtensilsCrossed, Location: MapPinned,
  'Attività': Sparkles, Trasporti: Bus, Catering: CookingPot,
  'Audio Video': Speaker, Allestimenti: PaintBucket, Hostess: Users,
  Entertainment: Music, Fotografia: Camera, Video: Video, Sicurezza: Shield,
  Altro: MoreHorizontal,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function matchesCategory(supplierCat: string, filterCat: string): boolean {
  const a = (supplierCat || '').toLowerCase().trim()
  const b = (filterCat || '').toLowerCase().trim()
  if (a === b) return true
  const aliases: Record<string, string[]> = {
    'hotel': ['hotel', 'hotels'],
    'ristorante': ['ristorante', 'ristoranti', 'ristorazione'],
    'audio video': ['audio video', 'audio/video', 'audiovideo', 'av'],
    'location': ['location', 'locations', 'venue'],
    'attività': ['attività', 'attivita', 'team building', 'activities'],
    'trasporti': ['trasporti', 'trasporto', 'transfer', 'transport'],
    'catering': ['catering'],
    'allestimenti': ['allestimenti', 'allestimento', 'scenografia'],
    'hostess': ['hostess', 'staff', 'personale'],
    'entertainment': ['entertainment', 'intrattenimento', 'spettacolo'],
    'fotografia': ['fotografia', 'foto', 'photographer'],
    'video': ['video', 'videomaking', 'video making'],
    'sicurezza': ['sicurezza', 'security'],
    'altro': ['altro', 'varie', 'tecnologia', 'other'],
  }
  for (const [, vals] of Object.entries(aliases)) {
    if (vals.includes(a) && vals.includes(b)) return true
  }
  return false
}

function normalizeCategory(cat: string): string {
  if (!cat || !cat.trim()) return 'Altro'
  for (const c of SUPPLIER_CATEGORIES) {
    if (matchesCategory(cat, c)) return c
  }
  return 'Altro'
}

function getSupplierCity(s: Supplier): string {
  return s.city || s.location || ''
}

function getSupplierRegion(s: Supplier): string {
  return s.region || ''
}

function getSupplierCountry(s: Supplier): string {
  if (s.country) return s.country
  if (s.region || s.city || s.province) return 'Italia'
  if (s.location) return 'Italia'
  return 'Altro'
}

function getCountryGroup(country: string): string {
  const c = country.toLowerCase().trim()
  if (!c || c === 'altro') return 'Altro'
  if (c === 'italia' || c === 'it' || c === 'italy') return 'Italia'
  return 'Estero'
}

function getCapacity(s: Supplier): number {
  const d = s.details
  if (!d) return 0
  return Math.max(
    d.capienza_sala_massima ?? 0,
    d.capienza_totale_meeting ?? 0,
    d.capienza_totale ?? 0,
    d.capienza_interna ?? 0,
    d.capienza_esterna ?? 0,
    d.capienza_massima ?? 0,
    d.capienza_cena ?? 0,
    d.capienza_cocktail ?? 0,
    d.numero_massimo_ospiti ?? 0,
    d.capienza ?? 0,
  )
}

function getRooms(s: Supplier): number {
  return s.details?.numero_camere ?? 0
}

function getMeetingRooms(s: Supplier): number {
  return s.details?.numero_sale_meeting ?? 0
}

// ─── Smart Search Parser ────────────────────────────────────────────────────

interface ParsedSearch {
  textTokens: string[]
  minCapacity: number
  minRooms: number
  minMeetingRooms: number
  categoryHint: string | null
}

function parseSearchQuery(raw: string): ParsedSearch {
  const result: ParsedSearch = { textTokens: [], minCapacity: 0, minRooms: 0, minMeetingRooms: 0, categoryHint: null }
  if (!raw.trim()) return result

  const text = raw.toLowerCase().trim()

  // Extract capacity: "200 persone", "200 pax", "200 posti", "200 ospiti"
  const capacityMatch = text.match(/(\d+)\s*(person[ei]|pax|posti|coperti|ospiti)/i)
  if (capacityMatch) result.minCapacity = parseInt(capacityMatch[1])

  // Extract rooms: "300 camere"
  const roomsMatch = text.match(/(\d+)\s*camer[ea]/i)
  if (roomsMatch) result.minRooms = parseInt(roomsMatch[1])

  // Extract meeting rooms: "5 sale" or "5 sale meeting"
  const meetingMatch = text.match(/(\d+)\s*sal[ea](?:\s*meeting)?/i)
  if (meetingMatch) result.minMeetingRooms = parseInt(meetingMatch[1])

  // Detect category hint
  for (const cat of NAV_CATEGORIES) {
    if (text.includes(cat.toLowerCase())) {
      result.categoryHint = cat
      break
    }
  }
  if (!result.categoryHint) {
    if (text.includes('ristorante') || text.includes('ristoranti')) result.categoryHint = 'Ristorante'
    else if (text.includes('audio') || text.includes('av ')) result.categoryHint = 'Audio Video'
    else if (text.includes('location') || text.includes('venue')) result.categoryHint = 'Location'
    else if (text.includes('catering')) result.categoryHint = 'Catering'
    else if (text.includes('trasport')) result.categoryHint = 'Trasporti'
    else if (text.includes('allestiment')) result.categoryHint = 'Allestimenti'
  }

  // Remaining text tokens (remove matched patterns)
  let cleaned = text
    .replace(/\d+\s*(person[ei]|pax|posti|coperti|ospiti|camer[ea]|sal[ea](?:\s*meeting)?)/gi, '')
    .replace(/\b(hotel|ristorante|ristoranti|audio\s*video|catering|location|locations|venue|trasporti|trasporto|allestimenti|allestimento|altro)\b/gi, '')
    .trim()
  result.textTokens = cleaned.split(/\s+/).filter(t => t.length > 1)

  return result
}

function supplierMatchesSearch(s: Supplier, parsed: ParsedSearch): boolean {
  if (parsed.categoryHint && !matchesCategory(s.categoria, parsed.categoryHint)) return false
  if (parsed.minCapacity > 0 && getCapacity(s) < parsed.minCapacity) return false
  if (parsed.minRooms > 0 && getRooms(s) < parsed.minRooms) return false
  if (parsed.minMeetingRooms > 0 && getMeetingRooms(s) < parsed.minMeetingRooms) return false

  if (parsed.textTokens.length === 0) return true

  const searchable = [
    s.nome,
    s.city, s.region, s.province, s.country, s.location, s.address,
    s.categoria,
    s.email, s.telefono, s.sito,
    s.referente, s.referenteTelefono,
    s.noteOperative,
    ...(s.servizi ?? []),
    s.details ? JSON.stringify(s.details) : '',
  ].join(' ').toLowerCase()

  return parsed.textTokens.every(token => searchable.includes(token))
}

// ─── Shared UI ──────────────────────────────────────────────────────────────

function InteractiveStars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const w = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={w}
          fill={i <= Math.round(rating) ? 'var(--yellow)' : 'transparent'}
          style={{ color: i <= Math.round(rating) ? 'var(--yellow)' : 'var(--line)' }} />
      ))}
    </div>
  )
}

function SupplierLogo({ supplier, size = 48 }: { supplier: Supplier; size?: number }) {
  const initials = supplier.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (supplier.logoUrl) {
    return <img src={supplier.logoUrl} alt={supplier.nome} className="rounded-xl object-cover" style={{ width: size, height: size }} />
  }
  return (
    <div className="rounded-xl flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', fontSize: size * 0.35 }}>
      {initials}
    </div>
  )
}

function MiniCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="panel p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(208,0,58,0.08)' }}>
        <Icon className="w-4 h-4" style={{ color: 'var(--red2)' }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</p>
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{value}</p>
      </div>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-5">
      <p className="text-sm font-bold mb-4" style={{ color: 'var(--text)' }}>{title}</p>
      {children}
    </div>
  )
}

function InfoGrid({ items }: { items: { label: string; value: string | number | undefined }[] }) {
  const valid = items.filter(i => i.value !== undefined && i.value !== '' && i.value !== 0)
  if (!valid.length) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {valid.map(i => (
        <div key={i.label}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{i.label}</p>
          <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text)' }}>{i.value}</p>
        </div>
      ))}
    </div>
  )
}

function BoolGrid({ items }: { items: { label: string; value: boolean | undefined }[] }) {
  const valid = items.filter(i => i.value)
  if (!valid.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {valid.map(i => (
        <span key={i.label} className="px-2.5 py-1 rounded-full text-[11px] font-medium"
          style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>{i.label}</span>
      ))}
    </div>
  )
}

// ─── Category Detail Cards ──────────────────────────────────────────────────

function HotelCard({ d }: { d: SupplierDetails }) {
  const sale = (d.sale_meeting ?? []) as SalaMeeting[]
  return (
    <div className="space-y-4">
      <InfoGrid items={[
        { label: 'Catena', value: d.catena },
        { label: 'Stelle', value: d.stelle ? `${d.stelle} stelle` : undefined },
        { label: 'Camere', value: d.numero_camere },
        { label: 'N. Sale Meeting', value: d.numero_sale_meeting },
        { label: 'Cap. sala max', value: d.capienza_sala_massima },
        { label: 'Cap. totale meeting', value: d.capienza_totale_meeting },
      ]} />
      <BoolGrid items={[
        { label: 'Ristorante interno', value: d.ristorante_interno },
        { label: 'Parcheggio', value: d.parcheggio },
        { label: 'Parcheggio bus', value: d.parcheggio_bus },
        { label: 'WiFi', value: d.servizi_hotel?.wifi },
        { label: 'Spa', value: d.servizi_hotel?.spa },
        { label: 'Piscina', value: d.servizi_hotel?.piscina },
        { label: 'Palestra', value: d.servizi_hotel?.palestra },
        { label: 'Business Center', value: d.servizi_hotel?.business_center },
        { label: 'Navetta aeroporto', value: d.servizi_hotel?.navetta_aeroporto },
        { label: 'Colonnine EV', value: d.servizi_hotel?.colonnine_elettriche },
        { label: 'Pet friendly', value: d.servizi_hotel?.pet_friendly },
      ]} />
      {sale.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Sale Meeting</p>
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--line)' }}>
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ background: 'var(--panel2)' }}>
                  <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Sala</th>
                  <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--muted)' }}>mq</th>
                  <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Teatro</th>
                  <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Banchetto</th>
                  <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Cocktail</th>
                </tr>
              </thead>
              <tbody>
                {sale.map((s, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{s.nome || `Sala ${i + 1}`}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.mq ?? '-'}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.teatro ?? '-'}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.banchetto ?? '-'}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.cocktail ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function RistoranteCard({ d }: { d: SupplierDetails }) {
  return (
    <div className="space-y-3">
      <InfoGrid items={[
        { label: 'Tipo cucina', value: d.tipo_cucina },
        { label: 'N. sale', value: d.numero_sale },
        { label: 'Capienza interna', value: d.capienza_interna },
        { label: 'Capienza esterna', value: d.capienza_esterna },
        { label: 'Capienza totale', value: d.capienza_totale },
      ]} />
      <BoolGrid items={[
        { label: 'Dehors', value: d.dehors },
        { label: 'Terrazza', value: d.terrazza },
        { label: 'Menu eventi', value: d.menu_eventi },
        { label: 'Adatto gruppi', value: d.adatto_gruppi },
        { label: 'Cene aziendali', value: d.adatto_cene_aziendali },
        { label: 'Gala', value: d.adatto_gala },
      ]} />
    </div>
  )
}

function GenericDetailCard({ d }: { d: SupplierDetails }) {
  const entries = Object.entries(d).filter(([k, v]) =>
    v !== undefined && v !== '' && v !== null && v !== false &&
    k !== 'contatti' && k !== 'sale_meeting' && k !== 'servizi_hotel' && k !== 'documenti'
  )
  if (!entries.length) return <p className="text-xs" style={{ color: 'var(--muted)' }}>Nessun dettaglio compilato.</p>
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {entries.slice(0, 12).map(([k, v]) => (
        <div key={k}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{k.replace(/_/g, ' ')}</p>
          <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text)' }}>{typeof v === 'boolean' ? 'Si' : String(v)}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Supplier Card (list item) ──────────────────────────────────────────────

function SupplierCard({ supplier, onClick }: { supplier: Supplier; onClick: () => void }) {
  const geoLine = [supplier.city, supplier.province, supplier.region].filter(Boolean).join(', ') || supplier.location
  const capacity = getCapacity(supplier)
  const rooms = getRooms(supplier)
  const meetingRooms = getMeetingRooms(supplier)

  return (
    <div onClick={onClick}
      className="panel p-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
      style={{ border: '1px solid var(--line)' }}>
      <div className="flex items-start gap-3 mb-3">
        <SupplierLogo supplier={supplier} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{supplier.nome}</p>
          <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
            {geoLine || normalizeCategory(supplier.categoria)}
          </p>
        </div>
        {supplier.stato === 'inattivo' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(255,49,95,0.1)', color: 'var(--red2)' }}>Inattivo</span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <InteractiveStars rating={supplier.rating} size="sm" />
        <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--muted)' }}>
          {rooms > 0 && <span>{rooms} camere</span>}
          {capacity > 0 && <span>cap. {capacity}</span>}
          {meetingRooms > 0 && <span>{meetingRooms} sale</span>}
        </div>
      </div>
      {supplier.servizi.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {supplier.servizi.slice(0, 3).map(s => (
            <span key={s} className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>{s}</span>
          ))}
          {supplier.servizi.length > 3 && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>+{supplier.servizi.length - 3}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Supplier Detail ────────────────────────────────────────────────────────

function SupplierDetail({ supplier, onBack, onSave, onEdit, onDelete }: {
  supplier: Supplier; onBack: () => void; onSave: (s: Supplier) => void
  onEdit: () => void; onDelete: () => void
}) {
  const [rating, setRating] = useState(supplier.rating)
  const [notes, setNotes] = useState(supplier.noteOperative)
  const [editingNotes, setEditingNotes] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const d = supplier.details ?? {}
  const cat = normalizeCategory(supplier.categoria)

  async function handleRating(v: number) {
    setRating(v)
    await updateSupplier(supplier.id, { rating: v } as Partial<Supplier>)
  }

  async function saveNotes() {
    setEditingNotes(false)
    const updated = { ...supplier, noteOperative: notes }
    onSave(updated)
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `${supplier.id}.${ext}`
    await supabase.storage.from('supplier-logos').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('supplier-logos').getPublicUrl(path)
    const logoUrl = data.publicUrl + '?t=' + Date.now()
    await supabase.from('suppliers').update({ logo_url: logoUrl }).eq('id', supplier.id)
    onSave({ ...supplier, logoUrl })
    setUploading(false)
  }

  const geoLine = [supplier.city, supplier.province, supplier.region, supplier.country].filter(Boolean).join(', ')

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="w-4 h-4" /> Indietro
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}>
            <Edit3 className="w-4 h-4" /> <span className="hidden sm:inline">Modifica</span>
          </button>
          <button onClick={onDelete} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{ border: '1px solid var(--line)', color: 'var(--red2)' }}>
            <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Elimina</span>
          </button>
        </div>
      </div>

      <div className="panel p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
          <div className="relative group">
            <SupplierLogo supplier={supplier} size={72} />
            <button onClick={() => fileRef.current?.click()}
              className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.6)' }}>
              {uploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Upload className="w-5 h-5 text-white" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{supplier.nome}</h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>{cat}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4 mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              {(geoLine || supplier.location) && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{geoLine || supplier.location}</span></span>}
              {supplier.telefono && <a href={`tel:${supplier.telefono}`} className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 flex-shrink-0" />{supplier.telefono}</a>}
              {supplier.email && <a href={`mailto:${supplier.email}`} className="flex items-center gap-1 truncate"><Mail className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{supplier.email}</span></a>}
              {supplier.sito && <a href={supplier.sito.startsWith('http') ? supplier.sito : `https://${supplier.sito}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate"><Globe className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{supplier.sito}</span></a>}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star key={i} className="w-5 h-5 cursor-pointer"
                    fill={i <= Math.round(rating) ? 'var(--yellow)' : 'transparent'}
                    style={{ color: i <= Math.round(rating) ? 'var(--yellow)' : 'var(--line)' }}
                    onClick={() => handleRating(i)} />
                ))}
              </div>
              <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{rating}/5</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniCard icon={Building2} label="Referente" value={supplier.referente || '-'} />
        <MiniCard icon={Phone} label="Tel. Referente" value={supplier.referenteTelefono || '-'} />
        <MiniCard icon={FileText} label="P.IVA" value={supplier.piva || '-'} />
        <MiniCard icon={Euro} label="Costo medio" value={supplier.costoMedioPerEvento ? `${supplier.costoMedioPerEvento.toLocaleString('it-IT')} EUR` : '-'} />
      </div>

      {d && Object.keys(d).length > 0 && (
        <DetailSection title={`Scheda ${cat}`}>
          {cat === 'Hotel' ? <HotelCard d={d} /> :
           cat === 'Ristorante' ? <RistoranteCard d={d} /> :
           <GenericDetailCard d={d} />}
        </DetailSection>
      )}

      <div className="panel p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Note operative interne</p>
          {!editingNotes ? (
            <button onClick={() => setEditingNotes(true)} className="text-xs font-medium" style={{ color: 'var(--red2)' }}>Modifica</button>
          ) : (
            <button onClick={saveNotes} className="flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-lg text-white"
              style={{ background: 'var(--red2)' }}>
              <Save className="w-3 h-3" /> Salva
            </button>
          )}
        </div>
        {editingNotes ? (
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
            className="w-full px-3 py-2 rounded-lg text-xs resize-none"
            style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }} />
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: notes ? 'var(--text)' : 'var(--muted)' }}>
            {notes || 'Nessuna nota operativa.'}
          </p>
        )}
      </div>

      {supplier.servizi.length > 0 && (
        <div className="panel p-5">
          <p className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>Servizi</p>
          <div className="flex flex-wrap gap-2">
            {supplier.servizi.map(s => (
              <span key={s} className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(208,0,58,0.08)', color: 'var(--red2)' }}>{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Form Modal ─────────────────────────────────────────────────────────────

function SupplierFormModal({ supplier, onSave, onCancel }: {
  supplier?: Supplier; onSave: (s: Supplier) => void; onCancel: () => void
}) {
  const [nome, setNome] = useState(supplier?.nome ?? '')
  const [email, setEmail] = useState(supplier?.email ?? '')
  const [telefono, setTelefono] = useState(supplier?.telefono ?? '')
  const [categoria, setCategoria] = useState(supplier?.categoria ?? '')
  const [referente, setReferente] = useState(supplier?.referente ?? '')
  const [referenteTelefono, setReferenteTelefono] = useState(supplier?.referenteTelefono ?? '')
  const [location, setLocation] = useState(supplier?.location ?? '')
  const [sito, setSito] = useState(supplier?.sito ?? '')
  const [piva, setPiva] = useState(supplier?.piva ?? '')
  const [stato, setStato] = useState<'attivo' | 'inattivo'>(supplier?.stato ?? 'attivo')
  const [statoContratto, setStatoContratto] = useState<StatoContratto>(supplier?.statoContratto ?? 'attivo')
  const [servizi, setServizi] = useState(supplier?.servizi?.join(', ') ?? '')
  const [noteOperative, setNoteOperative] = useState(supplier?.noteOperative ?? '')
  const [city, setCity] = useState(supplier?.city ?? '')
  const [province, setProvince] = useState(supplier?.province ?? '')
  const [region, setRegion] = useState(supplier?.region ?? '')
  const [country, setCountry] = useState(supplier?.country ?? 'Italia')
  const [detailsJson, setDetailsJson] = useState(supplier?.details ? JSON.stringify(supplier.details, null, 2) : '')
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [showAdvancedJson, setShowAdvancedJson] = useState(false)

  // Hotel-specific fields (read from existing details)
  const det = supplier?.details
  const [hotelCitta, setHotelCitta] = useState(det?.citta ?? '')
  const [hotelCatena, setHotelCatena] = useState(det?.catena ?? '')
  const [hotelNumeroCamere, setHotelNumeroCamere] = useState<number | ''>(det?.numero_camere ?? '')
  const [hotelNumeroSaleMeeting, setHotelNumeroSaleMeeting] = useState<number | ''>(det?.numero_sale_meeting ?? '')
  const [hotelParcheggio, setHotelParcheggio] = useState<boolean>(det?.parcheggio ?? false)
  const [hotelRistoranteInterno, setHotelRistoranteInterno] = useState<boolean>(det?.ristorante_interno ?? false)
  const [hotelStelle, setHotelStelle] = useState<number | ''>(det?.stelle ?? '')
  const [hotelCapienzaSalaMassima, setHotelCapienzaSalaMassima] = useState<number | ''>(det?.capienza_sala_massima ?? '')
  const [hotelCapienzaTotaleMeeting, setHotelCapienzaTotaleMeeting] = useState<number | ''>(det?.capienza_totale_meeting ?? '')

  const isHotel = matchesCategory(categoria, 'Hotel')

  function buildDetails(): SupplierDetails | undefined {
    if (isHotel) {
      // Merge hotel fields into existing details
      let base: Record<string, unknown> = {}
      if (detailsJson.trim()) {
        try {
          base = JSON.parse(detailsJson)
        } catch {
          // fallback: use supplier's existing details
          base = supplier?.details ? { ...supplier.details } : {}
        }
      } else if (supplier?.details) {
        base = { ...supplier.details }
      }
      // Overlay hotel-specific fields
      base.citta = hotelCitta || undefined
      base.catena = hotelCatena || undefined
      base.numero_camere = hotelNumeroCamere !== '' ? Number(hotelNumeroCamere) : undefined
      base.numero_sale_meeting = hotelNumeroSaleMeeting !== '' ? Number(hotelNumeroSaleMeeting) : undefined
      base.parcheggio = hotelParcheggio
      base.ristorante_interno = hotelRistoranteInterno
      base.stelle = hotelStelle !== '' ? Number(hotelStelle) : undefined
      base.capienza_sala_massima = hotelCapienzaSalaMassima !== '' ? Number(hotelCapienzaSalaMassima) : undefined
      base.capienza_totale_meeting = hotelCapienzaTotaleMeeting !== '' ? Number(hotelCapienzaTotaleMeeting) : undefined
      // Remove undefined keys
      for (const k of Object.keys(base)) {
        if (base[k] === undefined) delete base[k]
      }
      return base as SupplierDetails
    }
    // Non-hotel: parse JSON as before
    if (detailsJson.trim()) {
      try {
        return JSON.parse(detailsJson)
      } catch {
        setDetailsError('JSON non valido')
        return null as any
      }
    }
    return supplier?.details
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setDetailsError(null)
    const parsedDetails = buildDetails()
    if (parsedDetails === null) return // JSON error for non-hotel
    const updated: Supplier = {
      id: supplier?.id ?? `sup_${Date.now()}`,
      nome: nome.trim(), email: email.trim(), telefono: telefono.trim(),
      categoria: categoria.trim() || 'Altro', referente: referente.trim(),
      referenteTelefono: referenteTelefono.trim(), rating: supplier?.rating ?? 0,
      stato, statoContratto,
      scadenzaContratto: supplier?.scadenzaContratto ?? '',
      servizi: servizi.split(',').map(s => s.trim()).filter(Boolean),
      location: location.trim(), sito: sito.trim(),
      costoMedioPerEvento: supplier?.costoMedioPerEvento ?? 0,
      costoMinimo: supplier?.costoMinimo ?? 0, costoMassimo: supplier?.costoMassimo ?? 0,
      noteOperative: noteOperative.trim(), eventiId: supplier?.eventiId ?? [],
      documenti: supplier?.documenti ?? [], recensioni: supplier?.recensioni ?? [],
      piva: piva.trim(), logoUrl: supplier?.logoUrl, details: parsedDetails,
      city: city.trim(), province: province.trim(), region: region.trim(), country: country.trim(),
    }
    onSave(updated)
  }

  const inputCls = "w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
  const inputStyle = { background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full sm:max-w-2xl max-h-[100vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 safe-bottom"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg sm:text-xl font-bold" style={{ color: 'var(--text)' }}>
            {supplier ? 'Modifica Fornitore' : 'Nuovo Fornitore'}
          </h2>
          <button onClick={onCancel} className="p-2 rounded-lg transition-all hover:bg-white/5">
            <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Nome *</label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} required
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}
                className={inputCls} style={inputStyle}>
                <option value="">-- Seleziona --</option>
                {SUPPLIER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Telefono</label>
              <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Referente</label>
              <input type="text" value={referente} onChange={e => setReferente(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Tel. referente</label>
              <input type="text" value={referenteTelefono} onChange={e => setReferenteTelefono(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Citta</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Provincia</label>
              <input type="text" value={province} onChange={e => setProvince(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Regione</label>
              <input type="text" value={region} onChange={e => setRegion(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Paese</label>
              <input type="text" value={country} onChange={e => setCountry(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Location (legacy)</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Sito web</label>
              <input type="text" value={sito} onChange={e => setSito(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>P.IVA</label>
              <input type="text" value={piva} onChange={e => setPiva(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Servizi (separati da virgola)</label>
            <input type="text" value={servizi} onChange={e => setServizi(e.target.value)}
              className={inputCls} style={inputStyle}
              placeholder="Es. Impianti audio, Video proiezione" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Note operative</label>
            <textarea value={noteOperative} onChange={e => setNoteOperative(e.target.value)} rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
              style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Stato</label>
            <select value={stato} onChange={e => setStato(e.target.value as 'attivo' | 'inattivo')}
              className={inputCls} style={inputStyle}>
              <option value="attivo">Attivo</option>
              <option value="inattivo">Inattivo</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Stato Contratto</label>
            <select value={statoContratto} onChange={e => setStatoContratto(e.target.value as StatoContratto)}
              className={inputCls} style={inputStyle}>
              <option value="attivo">Attivo</option>
              <option value="in_scadenza">In scadenza</option>
              <option value="scaduto">Scaduto</option>
              <option value="in_rinnovo">In rinnovo</option>
              <option value="sospeso">Sospeso</option>
            </select>
          </div>

          {/* Hotel-specific fields */}
          {isHotel && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(208,0,58,0.03)', border: '1px solid rgba(208,0,58,0.12)' }}>
              <p className="text-xs font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--red2)' }}>
                <Hotel className="w-4 h-4" /> Dati Hotel
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Citta (hotel)</label>
                  <input type="text" value={hotelCitta} onChange={e => setHotelCitta(e.target.value)}
                    className={inputCls} style={inputStyle} placeholder="Roma" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Catena</label>
                  <input type="text" value={hotelCatena} onChange={e => setHotelCatena(e.target.value)}
                    className={inputCls} style={inputStyle} placeholder="NH Hotels" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Stelle</label>
                  <select value={hotelStelle} onChange={e => setHotelStelle(e.target.value ? Number(e.target.value) : '')}
                    className={inputCls} style={inputStyle}>
                    <option value="">--</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Numero camere</label>
                  <input type="number" min={0} value={hotelNumeroCamere} onChange={e => setHotelNumeroCamere(e.target.value ? Number(e.target.value) : '')}
                    className={inputCls} style={inputStyle} placeholder="200" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Numero sale meeting</label>
                  <input type="number" min={0} value={hotelNumeroSaleMeeting} onChange={e => setHotelNumeroSaleMeeting(e.target.value ? Number(e.target.value) : '')}
                    className={inputCls} style={inputStyle} placeholder="6" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Capienza sala massima</label>
                  <input type="number" min={0} value={hotelCapienzaSalaMassima} onChange={e => setHotelCapienzaSalaMassima(e.target.value ? Number(e.target.value) : '')}
                    className={inputCls} style={inputStyle} placeholder="300" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Capienza totale meeting</label>
                  <input type="number" min={0} value={hotelCapienzaTotaleMeeting} onChange={e => setHotelCapienzaTotaleMeeting(e.target.value ? Number(e.target.value) : '')}
                    className={inputCls} style={inputStyle} placeholder="800" />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={hotelParcheggio} onChange={e => setHotelParcheggio(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 rounded-full peer-checked:bg-[var(--red2)] transition-colors" style={{ background: hotelParcheggio ? undefined : 'var(--panel2)' }} />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                  </label>
                  <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>Parcheggio</span>
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={hotelRistoranteInterno} onChange={e => setHotelRistoranteInterno(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 rounded-full peer-checked:bg-[var(--red2)] transition-colors" style={{ background: hotelRistoranteInterno ? undefined : 'var(--panel2)' }} />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                  </label>
                  <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>Ristorante interno</span>
                </div>
              </div>
            </div>
          )}

          {/* Advanced JSON section (collapsible) */}
          <div>
            <button type="button" onClick={() => setShowAdvancedJson(!showAdvancedJson)}
              className="text-xs font-medium flex items-center gap-1.5 mb-2 transition-all hover:opacity-80"
              style={{ color: 'var(--muted)' }}>
              <ChevronRight className={`w-3 h-3 transition-transform ${showAdvancedJson ? 'rotate-90' : ''}`} />
              Dettagli avanzati (JSON)
              {detailsError && <span style={{ color: 'var(--red2)' }}> - {detailsError}</span>}
            </button>
            {showAdvancedJson && (
              <textarea value={detailsJson} onChange={e => { setDetailsJson(e.target.value); setDetailsError(null) }} rows={5}
                className="w-full px-4 py-3 rounded-xl text-xs font-mono focus:outline-none resize-none"
                style={{ background: 'var(--panel)', border: `1px solid ${detailsError ? 'var(--red2)' : 'var(--line)'}`, color: 'var(--text)' }}
                placeholder='{"catena": "NH Hotels", "stelle": 4, "numero_camere": 200}' />
            )}
          </div>

          <div className="flex gap-3 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="submit" className="btn-primary flex-1 py-3 rounded-xl text-sm font-semibold">
              {supplier ? 'Salva Modifiche' : 'Crea Fornitore'}
            </button>
            <button type="button" onClick={onCancel}
              className="px-6 py-3 rounded-xl text-sm font-medium"
              style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--line)' }}>
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────────

interface BreadcrumbItem {
  label: string
  onClick: () => void
}

function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-sm">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--line)' }} />}
          <button
            onClick={item.onClick}
            className="font-medium transition-all hover:opacity-80"
            style={{ color: i === items.length - 1 ? 'var(--text)' : 'var(--muted)' }}>
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Navigation Tile ────────────────────────────────────────────────────────

function NavTile({ label, count, icon: Icon, onClick }: {
  label: string; count: number; icon?: React.ElementType; onClick: () => void
}) {
  const TileIcon = Icon ?? MapPin
  return (
    <button onClick={onClick}
      className="panel p-5 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 w-full"
      style={{ border: '1px solid var(--line)' }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(208,0,58,0.08)' }}>
          <TileIcon className="w-5 h-5" style={{ color: 'var(--red2)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{label}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {count} {count === 1 ? 'fornitore' : 'fornitori'}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--line)' }} />
      </div>
    </button>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Fornitori() {
  loadUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const [supplierList, setSupplierList] = useState<Supplier[]>([])
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>(undefined)
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Mode: 'navigate' or 'search'
  const [mode, setMode] = useState<'navigate' | 'search'>('navigate')

  // Navigation state
  const [navCategory, setNavCategory] = useState<string | null>(null)
  const [navCountryGroup, setNavCountryGroup] = useState<string | null>(null)
  const [navRegion, setNavRegion] = useState<string | null>(null)
  const [navCity, setNavCity] = useState<string | null>(null)
  const [navChain, setNavChain] = useState<string | null>(null)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')

  const loadData = useCallback(async () => {
    const sups = await fetchSuppliers()
    setSupplierList(sups)
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useRealtimeTable('suppliers', loadData)

  useEffect(() => {
    const id = searchParams.get('id')
    if (id && supplierList.length > 0) {
      const found = supplierList.find(s => s.id === id)
      if (found) setSelected(found)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, supplierList, setSearchParams])

  async function handleSave(s: Supplier) {
    setSaveError(null)
    if (editingSupplier) {
      const result = await updateSupplier(s.id, s)
      if (!result) {
        setSaveError('Errore durante il salvataggio del fornitore. Riprova.')
        return
      }
    } else {
      const result = await upsertSupplier(s)
      if (!result) {
        setSaveError('Errore durante la creazione del fornitore. Riprova.')
        return
      }
    }
    await loadData()
    if (selected?.id === s.id) {
      const refreshed = (await fetchSuppliers()).find(x => x.id === s.id)
      setSelected(refreshed ?? s)
    }
    setShowForm(false)
    setEditingSupplier(undefined)
  }

  async function handleDelete() {
    if (!deletingSupplier) return
    const ok = await deleteSupplierRemote(deletingSupplier.id)
    if (!ok) console.error('SUPABASE DELETE ERROR', { id: deletingSupplier.id, name: deletingSupplier.nome })
    await loadData()
    setSelected(null)
    setDeletingSupplier(null)
  }

  // ─── Navigation data derivation ────────────────────────────────────────────

  const categorySuppliers = useMemo(() => {
    if (!navCategory) return supplierList
    return supplierList.filter(s => matchesCategory(s.categoria, navCategory))
  }, [supplierList, navCategory])

  const countryGroups = useMemo(() => {
    const map: Record<string, Supplier[]> = {}
    for (const s of categorySuppliers) {
      const g = getCountryGroup(getSupplierCountry(s))
      if (!map[g]) map[g] = []
      map[g].push(s)
    }
    return map
  }, [categorySuppliers])

  const regionSuppliers = useMemo(() => {
    if (!navCountryGroup) return categorySuppliers
    return categorySuppliers.filter(s => getCountryGroup(getSupplierCountry(s)) === navCountryGroup)
  }, [categorySuppliers, navCountryGroup])

  const regions = useMemo(() => {
    const map: Record<string, Supplier[]> = {}
    for (const s of regionSuppliers) {
      const r = getSupplierRegion(s) || getSupplierCity(s) || 'Altro'
      if (!map[r]) map[r] = []
      map[r].push(s)
    }
    return map
  }, [regionSuppliers])

  const citySuppliers = useMemo(() => {
    if (!navRegion) return regionSuppliers
    return regionSuppliers.filter(s => (getSupplierRegion(s) || getSupplierCity(s) || 'Altro') === navRegion)
  }, [regionSuppliers, navRegion])

  const cities = useMemo(() => {
    const map: Record<string, Supplier[]> = {}
    for (const s of citySuppliers) {
      const c = getSupplierCity(s) || 'Altro'
      if (!map[c]) map[c] = []
      map[c].push(s)
    }
    return map
  }, [citySuppliers])

  const finalNavList = useMemo(() => {
    if (!navCity) return citySuppliers
    return citySuppliers.filter(s => (getSupplierCity(s) || 'Altro') === navCity)
  }, [citySuppliers, navCity])

  // Category counts for landing
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of supplierList) {
      const c = normalizeCategory(s.categoria)
      map[c] = (map[c] || 0) + 1
    }
    return map
  }, [supplierList])

  // Hotel chain grouping
  const hotelChains = useMemo(() => {
    if (navCategory !== 'Hotel') return {}
    const map: Record<string, Supplier[]> = {}
    for (const s of categorySuppliers) {
      const chain = s.details?.catena || 'Indipendenti'
      if (!map[chain]) map[chain] = []
      map[chain].push(s)
    }
    return map
  }, [categorySuppliers, navCategory])

  const chainSuppliers = useMemo(() => {
    if (!navChain) return []
    const chainKey = navChain === 'Indipendenti' ? '' : navChain
    return categorySuppliers.filter(s => {
      const sc = s.details?.catena || ''
      if (navChain === 'Indipendenti') return !sc
      return sc === chainKey
    })
  }, [categorySuppliers, navChain])

  // ─── Search results ─────────────────────────────────────────────────────────

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const parsed = parseSearchQuery(searchQuery)
    const results = supplierList.filter(s => supplierMatchesSearch(s, parsed))
    return results
  }, [supplierList, searchQuery])

  // ─── Breadcrumb construction ────────────────────────────────────────────────

  const breadcrumbItems = useMemo(() => {
    const items: BreadcrumbItem[] = [
      { label: 'Fornitori', onClick: () => { setNavCategory(null); setNavCountryGroup(null); setNavRegion(null); setNavCity(null); setNavChain(null) } }
    ]
    if (navCategory) {
      items.push({ label: navCategory, onClick: () => { setNavCountryGroup(null); setNavRegion(null); setNavCity(null); setNavChain(null) } })
    }
    if (navChain) {
      items.push({ label: 'Catene', onClick: () => { setNavChain(null) } })
      items.push({ label: navChain, onClick: () => {} })
    } else {
      if (navCountryGroup) {
        items.push({ label: navCountryGroup, onClick: () => { setNavRegion(null); setNavCity(null) } })
      }
      if (navRegion) {
        items.push({ label: navRegion, onClick: () => { setNavCity(null) } })
      }
      if (navCity) {
        items.push({ label: navCity, onClick: () => {} })
      }
    }
    return items
  }, [navCategory, navCountryGroup, navRegion, navCity, navChain])

  // ─── Detail View ────────────────────────────────────────────────────────────

  if (selected) {
    const live = supplierList.find(s => s.id === selected.id) ?? selected
    return (
      <>
        <SupplierDetail
          supplier={live}
          onBack={() => setSelected(null)}
          onSave={handleSave}
          onEdit={() => { setEditingSupplier(live); setShowForm(true) }}
          onDelete={() => setDeletingSupplier(live)}
        />
        {showForm && <SupplierFormModal supplier={editingSupplier} onSave={handleSave} onCancel={() => { setShowForm(false); setEditingSupplier(undefined) }} />}
        {saveError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl text-sm font-medium animate-fade-in flex items-center gap-3"
            style={{ background: 'rgba(208,0,58,0.95)', color: 'white', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <span>{saveError}</span>
            <button onClick={() => setSaveError(null)} className="ml-2 text-white/70 hover:text-white">✕</button>
          </div>
        )}
        {deletingSupplier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,49,95,0.12)' }}>
                  <Trash2 className="w-5 h-5" style={{ color: 'var(--red2)' }} />
                </div>
                <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Elimina fornitore</h3>
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
                Sei sicuro di voler eliminare <strong style={{ color: 'var(--text)' }}>"{deletingSupplier.nome}"</strong>?
              </p>
              <div className="flex gap-3">
                <button onClick={handleDelete} className="flex-1 py-3 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--red2)' }}>Elimina</button>
                <button onClick={() => setDeletingSupplier(null)} className="flex-1 py-3 rounded-xl text-sm font-medium" style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--line)' }}>Annulla</button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Fornitori</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {supplierList.length} fornitori nel database MICE
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex p-1 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
            <button
              onClick={() => setMode('navigate')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: mode === 'navigate' ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'transparent',
                color: mode === 'navigate' ? 'white' : 'var(--muted)',
              }}>
              <Navigation className="w-3.5 h-3.5" /> Naviga
            </button>
            <button
              onClick={() => setMode('search')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: mode === 'search' ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'transparent',
                color: mode === 'search' ? 'white' : 'var(--muted)',
              }}>
              <Search className="w-3.5 h-3.5" /> Cerca
            </button>
          </div>
          <button onClick={() => { setEditingSupplier(undefined); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
            <Plus className="w-4 h-4" /> Nuovo
          </button>
        </div>
      </div>

      {/* ─── SEARCH MODE ───────────────────────────────────────────────────────── */}
      {mode === 'search' && (
        <div className="space-y-4 animate-fade-in">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder='Cerca: "Milano 200 persone", "hotel Lombardia 300 camere", "audio video Torino"...'
              className="w-full pl-12 pr-10 py-4 rounded-2xl text-sm focus:outline-none"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            )}
          </div>

          {searchQuery.trim() && (
            <p className="text-xs font-medium px-1" style={{ color: 'var(--muted)' }}>
              {searchResults.length} fornitor{searchResults.length !== 1 ? 'i' : 'e'} trovat{searchResults.length !== 1 ? 'i' : 'o'}
            </p>
          )}

          {searchQuery.trim() && searchResults.length === 0 && (
            <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Nessun fornitore trovato</p>
              <p className="text-xs mt-2">Prova a rimuovere filtri di capienza o cambiare la citta nella ricerca.</p>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map(sup => (
                <SupplierCard key={sup.id} supplier={sup} onClick={() => setSelected(sup)} />
              ))}
            </div>
          )}

          {!searchQuery.trim() && (
            <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
              <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Scrivi una ricerca per trovare fornitori per citta, categoria, capienza, servizi...</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {['Milano 200 persone', 'hotel Lombardia', 'audio video Torino', 'ristorante Roma 100 persone', 'catering Bari'].map(ex => (
                  <button key={ex} onClick={() => setSearchQuery(ex)}
                    className="text-xs px-3 py-1.5 rounded-full transition-all hover:opacity-80"
                    style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── NAVIGATE MODE ─────────────────────────────────────────────────────── */}
      {mode === 'navigate' && (
        <div className="space-y-4 animate-fade-in">
          {/* Breadcrumb */}
          {navCategory && navCountryGroup !== '__chains__' && <Breadcrumb items={breadcrumbItems} />}

          {/* Level: Categories */}
          {!navCategory && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {NAV_CATEGORIES.map(cat => {
                const Icon = CATEGORY_ICONS[cat] ?? MoreHorizontal
                const count = categoryCounts[cat] ?? 0
                return (
                  <button key={cat} onClick={() => setNavCategory(cat)}
                    className="panel p-5 text-center transition-all hover:shadow-lg hover:-translate-y-0.5"
                    style={{ border: '1px solid var(--line)' }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                      style={{ background: 'rgba(208,0,58,0.08)' }}>
                      <Icon className="w-6 h-6" style={{ color: 'var(--red2)' }} />
                    </div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{cat}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                      {count} {count === 1 ? 'fornitore' : 'fornitori'}
                    </p>
                  </button>
                )
              })}
            </div>
          )}

          {/* Level: Country groups (Catene / Italia / Estero / Altro) */}
          {navCategory && !navCountryGroup && !navChain && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {navCategory === 'Hotel' && (
                <NavTile
                  label="Catene"
                  count={Object.keys(hotelChains).length}
                  icon={Link2}
                  onClick={() => setNavCountryGroup('__chains__')}
                />
              )}
              {Object.entries(countryGroups)
                .sort(([a], [b]) => {
                  const order = ['Italia', 'Estero', 'Altro']
                  return order.indexOf(a) - order.indexOf(b)
                })
                .map(([group, sups]) => (
                  <NavTile key={group} label={group} count={sups.length} icon={MapPin}
                    onClick={() => setNavCountryGroup(group)} />
                ))}
            </div>
          )}

          {/* Level: Hotel Chains list */}
          {navCategory === 'Hotel' && navCountryGroup === '__chains__' && !navChain && (
            <div className="space-y-3">
              <Breadcrumb items={[
                { label: 'Fornitori', onClick: () => { setNavCategory(null); setNavCountryGroup(null); setNavChain(null) } },
                { label: 'Hotel', onClick: () => { setNavCountryGroup(null); setNavChain(null) } },
                { label: 'Catene', onClick: () => {} },
              ]} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(hotelChains)
                  .sort(([a, sa], [b, sb]) => {
                    if (a === 'Indipendenti') return 1
                    if (b === 'Indipendenti') return -1
                    return sb.length - sa.length
                  })
                  .map(([chain, sups]) => (
                    <NavTile key={chain} label={chain} count={sups.length} icon={Hotel}
                      onClick={() => setNavChain(chain)} />
                  ))}
              </div>
            </div>
          )}

          {/* Level: Hotel Chain supplier list */}
          {navCategory === 'Hotel' && navCountryGroup === '__chains__' && navChain && (
            <div className="space-y-3">
              <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                {chainSuppliers.length} hotel {navChain}
              </p>
              {chainSuppliers.length === 0 ? (
                <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
                  <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Nessun hotel in questa catena</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {chainSuppliers.map(sup => (
                    <SupplierCard key={sup.id} supplier={sup} onClick={() => setSelected(sup)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Level: Regions */}
          {navCategory && navCountryGroup && navCountryGroup !== '__chains__' && !navRegion && (
            <>
              {Object.keys(regions).length === 1 ? (
                // Skip region level if only one region
                (() => {
                  const onlyRegion = Object.keys(regions)[0]
                  // Auto-navigate to cities of that region
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(
                        (() => {
                          const sups = regions[onlyRegion]
                          const map: Record<string, Supplier[]> = {}
                          for (const s of sups) {
                            const c = getSupplierCity(s) || 'Altro'
                            if (!map[c]) map[c] = []
                            map[c].push(s)
                          }
                          return map
                        })()
                      )
                        .sort(([, a], [, b]) => b.length - a.length)
                        .map(([city, sups]) => (
                          <NavTile key={city} label={city} count={sups.length} icon={MapPin}
                            onClick={() => { setNavRegion(onlyRegion); setNavCity(city) }} />
                        ))}
                    </div>
                  )
                })()
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(regions)
                    .sort(([, a], [, b]) => b.length - a.length)
                    .map(([region, sups]) => (
                      <NavTile key={region} label={region} count={sups.length} icon={MapPin}
                        onClick={() => setNavRegion(region)} />
                    ))}
                </div>
              )}
            </>
          )}

          {/* Level: Cities */}
          {navCategory && navCountryGroup && navCountryGroup !== '__chains__' && navRegion && !navCity && (
            <>
              {Object.keys(cities).length === 1 ? (
                // Only one city, show suppliers directly
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {citySuppliers.map(sup => (
                    <SupplierCard key={sup.id} supplier={sup} onClick={() => setSelected(sup)} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(cities)
                    .sort(([, a], [, b]) => b.length - a.length)
                    .map(([city, sups]) => (
                      <NavTile key={city} label={city} count={sups.length} icon={MapPin}
                        onClick={() => setNavCity(city)} />
                    ))}
                </div>
              )}
            </>
          )}

          {/* Level: Supplier list (final) */}
          {navCategory && navCountryGroup && navCountryGroup !== '__chains__' && (navCity || (navRegion && Object.keys(cities).length === 1)) && (
            <div className="space-y-3">
              <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                {finalNavList.length} risultat{finalNavList.length !== 1 ? 'i' : 'o'}
              </p>
              {finalNavList.length === 0 ? (
                <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
                  <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Nessun fornitore in questa posizione</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {finalNavList.map(sup => (
                    <SupplierCard key={sup.id} supplier={sup} onClick={() => setSelected(sup)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showForm && <SupplierFormModal supplier={editingSupplier} onSave={handleSave} onCancel={() => { setShowForm(false); setEditingSupplier(undefined) }} />}
      {deletingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,49,95,0.12)' }}>
                <Trash2 className="w-5 h-5" style={{ color: 'var(--red2)' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Elimina fornitore</h3>
            </div>
            <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
              Sei sicuro di voler eliminare <strong style={{ color: 'var(--text)' }}>"{deletingSupplier.nome}"</strong>?
            </p>
            <div className="flex gap-3">
              <button onClick={handleDelete} className="flex-1 py-3 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--red2)' }}>Elimina</button>
              <button onClick={() => setDeletingSupplier(null)} className="flex-1 py-3 rounded-xl text-sm font-medium" style={{ background: 'var(--panel)', color: 'var(--muted)', border: '1px solid var(--line)' }}>Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
