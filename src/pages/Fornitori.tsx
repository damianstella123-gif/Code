import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, MapPin, Globe, Star, FileText, Euro,
  Search, X, Plus, Trash2, Save, Upload, Building2, Edit3, Link2,
  Hotel, UtensilsCrossed, MapPinned, CookingPot,
  Speaker, PaintBucket, Users, MoreHorizontal, Camera, Video, Shield,
  Music, ChevronRight, Navigation, Plane, Car, Printer,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { displayUrl, ensureHttps, inferRegion } from '@/lib/format'
import { fetchSuppliers, upsertSupplier, deleteSupplier as deleteSupplierRemote, updateSupplier } from '@/lib/suppliers-service'
import { useRealtimeTable } from '@/lib/use-realtime'
import { supabase } from '@/lib/supabase'
import type { Supplier, SupplierDetails, SalaMeeting, StatoContratto } from '@/data/suppliers'
import { SUPPLIER_CATEGORIES } from '@/data/suppliers'

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Hotel, Ristorante: UtensilsCrossed, Location: MapPinned,
  'Audio Video': Speaker, Catering: CookingPot, Allestimenti: PaintBucket,
  Staff: Users, Transfer: Car, 'Grafica & Stampa': Printer,
  Esperienze: Star, DMC: Navigation, 'Agenzia di Viaggi': Plane,
  Entertainment: Music, Fotografia: Camera, Video: Video,
  Sicurezza: Shield, Altro: MoreHorizontal,
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
    'transfer': ['transfer', 'trasferimenti', 'navette', 'ncc', 'trasporti', 'trasporto', 'transport'],
    'catering': ['catering'],
    'allestimenti': ['allestimenti', 'allestimento', 'scenografia'],
    'staff': ['staff', 'hostess', 'personale', 'steward'],
    'entertainment': ['entertainment', 'intrattenimento', 'spettacolo'],
    'fotografia': ['fotografia', 'foto', 'photographer'],
    'video': ['video', 'videomaking', 'video making'],
    'sicurezza': ['sicurezza', 'security'],
    'dmc': ['dmc', 'destination management', 'destination management company'],
    'grafica & stampa': ['grafica & stampa', 'grafica', 'stampa', 'tipografia', 'grafica e stampa'],
    'esperienze': ['esperienze', 'experience', 'experiences'],
    'agenzia di viaggi': ['agenzia di viaggi', 'agenzia viaggi', 'travel agency'],
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
  return inferRegion(s.city || s.province || '', s.region || '')
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

  const capacityMatch = text.match(/(\d+)\s*(person[ei]|pax|posti|coperti|ospiti)/i)
  if (capacityMatch) result.minCapacity = parseInt(capacityMatch[1])

  const roomsMatch = text.match(/(\d+)\s*camer[ea]/i)
  if (roomsMatch) result.minRooms = parseInt(roomsMatch[1])

  const meetingMatch = text.match(/(\d+)\s*sal[ea](?:\s*meeting)?/i)
  if (meetingMatch) result.minMeetingRooms = parseInt(meetingMatch[1])

  for (const cat of SUPPLIER_CATEGORIES) {
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

  let cleaned = text
    .replace(/\d+\s*(person[ei]|pax|posti|coperti|ospiti|camer[ea]|sal[ea](?:\s*meeting)?)/gi, '')
    .replace(/\b(hotel|ristorante|ristoranti|audio\s*video|catering|location|locations|venue|trasporti|trasporto|allestimenti|allestimento|altro)\b/gi, '')
    .trim()
  result.textTokens = cleaned.split(/\s+/).filter(t => t.length > 1)

  return result
}

function supplierMatchesSearch(s: Supplier, parsed: ParsedSearch): boolean {
  if (parsed.categoryHint) {
    const cats = s.categorie?.length ? s.categorie : [s.categoria]
    if (!cats.some(c => matchesCategory(c, parsed.categoryHint!))) return false
  }
  if (parsed.minCapacity > 0 && getCapacity(s) < parsed.minCapacity) return false
  if (parsed.minRooms > 0 && getRooms(s) < parsed.minRooms) return false
  if (parsed.minMeetingRooms > 0 && getMeetingRooms(s) < parsed.minMeetingRooms) return false

  if (parsed.textTokens.length === 0) return true

  const searchable = [
    s.nome,
    s.city, s.region, s.province, s.country, s.location, s.address,
    s.categoria,
    ...(s.categorie ?? []),
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
    <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '14px 16px' }}
      className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--panel2)' }}>
        <Icon className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
      </div>
      <div className="min-w-0">
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>{label}</p>
        <p className="truncate" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>{value}</p>
      </div>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '16px' }}>{title}</p>
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
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>{i.label}</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500, color: 'var(--text)', marginTop: '3px' }}>{i.value}</p>
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
        <span key={i.label} className="px-2.5 py-1 rounded-full"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'color-mix(in srgb, var(--green) 10%, transparent)', color: 'var(--green)' }}>{i.label}</span>
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
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>Sale Meeting</p>
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--line)' }}>
            <table className="w-full" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
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
  if (!entries.length) return <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>Nessun dettaglio compilato.</p>
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {entries.slice(0, 12).map(([k, v]) => (
        <div key={k}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>{k.replace(/_/g, ' ')}</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500, color: 'var(--text)', marginTop: '3px' }}>{typeof v === 'boolean' ? 'Si' : String(v)}</p>
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
      className="cursor-pointer transition-all"
      style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '16px 18px' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}>
      <div className="flex items-start gap-3 mb-3">
        <SupplierLogo supplier={supplier} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate" style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>{supplier.nome}</p>
          <p className="truncate" style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
            {geoLine || normalizeCategory(supplier.categoria)}
          </p>
        </div>
        {supplier.stato === 'inattivo' && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: 'color-mix(in srgb, var(--red2) 12%, transparent)', color: 'var(--red2)' }}>Inattivo</span>
        )}
      </div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {(() => {
          const cats = supplier.categorie?.length ? supplier.categorie : [supplier.categoria]
          const shown = cats.slice(0, 2)
          const rest = cats.length - 2
          return (
            <>
              {shown.map(c => (
                <span key={c} style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: 'var(--panel2)', color: 'var(--muted)' }}>
                  {normalizeCategory(c)}
                </span>
              ))}
              {rest > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)' }}>+{rest} altre</span>}
            </>
          )
        })()}
        <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>
          {rooms > 0 && <span>{rooms} camere</span>}
          {capacity > 0 && <span>cap. {capacity}</span>}
          {meetingRooms > 0 && <span>{meetingRooms} sale</span>}
        </div>
      </div>
      <InteractiveStars rating={supplier.rating} size="sm" />
      {supplier.servizi.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {supplier.servizi.slice(0, 3).map(s => (
            <span key={s} style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--panel2)', color: 'var(--muted)' }}>{s}</span>
          ))}
          {supplier.servizi.length > 3 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--panel2)', color: 'var(--muted)' }}>+{supplier.servizi.length - 3}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Supplier Contacts Section ─────────────────────────────────────────────

interface SupplierContact {
  id: string
  supplier_id: string
  nome: string
  ruolo: string | null
  email: string | null
  telefono: string | null
  note: string | null
  is_primary: boolean
}

function SupplierContactsSection({ supplierId }: { supplierId: string }) {
  const [contacts, setContacts] = useState<SupplierContact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState({ nome: '', ruolo: '', email: '', telefono: '', note: '', is_primary: false })
  const { showToast } = useToast()

  const fetchContacts = useCallback(async () => {
    const { data } = await supabase.from('supplier_contacts').select('*').eq('supplier_id', supplierId).order('is_primary', { ascending: false }).order('created_at', { ascending: true })
    setContacts(data || [])
    setLoading(false)
  }, [supplierId])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  async function handleSave() {
    if (!form.nome.trim()) return
    if (form.is_primary) {
      await supabase.from('supplier_contacts').update({ is_primary: false }).eq('supplier_id', supplierId).eq('is_primary', true)
    }
    if (editingId) {
      await supabase.from('supplier_contacts').update({ nome: form.nome.trim(), ruolo: form.ruolo.trim() || null, email: form.email.trim() || null, telefono: form.telefono.trim() || null, note: form.note.trim() || null, is_primary: form.is_primary }).eq('id', editingId)
      showToast('Contatto aggiornato', 'success')
    } else {
      await supabase.from('supplier_contacts').insert({ supplier_id: supplierId, nome: form.nome.trim(), ruolo: form.ruolo.trim() || null, email: form.email.trim() || null, telefono: form.telefono.trim() || null, note: form.note.trim() || null, is_primary: form.is_primary })
      showToast('Contatto aggiunto', 'success')
    }
    setForm({ nome: '', ruolo: '', email: '', telefono: '', note: '', is_primary: false })
    setShowForm(false)
    setEditingId(null)
    fetchContacts()
  }

  async function handleDelete(id: string) {
    await supabase.from('supplier_contacts').delete().eq('id', id)
    setConfirmDeleteId(null)
    showToast('Contatto eliminato', 'success')
    fetchContacts()
  }

  function startEdit(c: SupplierContact) {
    setForm({ nome: c.nome, ruolo: c.ruolo || '', email: c.email || '', telefono: c.telefono || '', note: c.note || '', is_primary: c.is_primary })
    setEditingId(c.id)
    setShowForm(true)
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-xs focus:outline-none"
  const inputStyle: React.CSSProperties = { background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }
  const labelStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', display: 'block', marginBottom: '4px' }

  return (
    <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
      <div className="flex items-center justify-between mb-4">
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>CONTATTI</p>
        {!showForm && (
          <button onClick={() => { setForm({ nome: '', ruolo: '', email: '', telefono: '', note: '', is_primary: contacts.length === 0 }); setEditingId(null); setShowForm(true) }}
            className="flex items-center gap-1 transition-all hover:opacity-80"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Plus className="w-3 h-3" /> AGGIUNGI CONTATTO
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>Caricamento...</p>
      ) : contacts.length === 0 && !showForm ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>Nessun contatto registrato.</p>
      ) : (
        <div className="space-y-3">
          {contacts.map(c => (
            <div key={c.id} className="flex items-start justify-between gap-3 py-2" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{c.nome}</span>
                  {c.is_primary && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '1px 5px', borderRadius: '3px', background: 'var(--yellow)', color: '#1a1a1a' }}>PRINCIPALE</span>
                  )}
                  {c.ruolo && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: 'var(--panel2)', color: 'var(--muted)' }}>{c.ruolo}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>
                  {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:opacity-80"><Mail className="w-2.5 h-2.5" />{c.email}</a>}
                  {c.telefono && <a href={`tel:${c.telefono}`} className="flex items-center gap-1 hover:opacity-80"><Phone className="w-2.5 h-2.5" />{c.telefono}</a>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {confirmDeleteId === c.id ? (
                  <div className="flex items-center gap-1">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--red2)' }}>Sei sicuro?</span>
                    <button onClick={() => handleDelete(c.id)} style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--red2)', background: 'none', border: 'none', cursor: 'pointer' }}>Si</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>No</button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => startEdit(c)} className="p-1 rounded hover:bg-white/5 transition-all" style={{ color: 'var(--muted)' }}><Edit3 className="w-3 h-3" /></button>
                    <button onClick={() => setConfirmDeleteId(c.id)} className="p-1 rounded hover:bg-white/5 transition-all" style={{ color: 'var(--muted)' }}><Trash2 className="w-3 h-3" /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="mt-4 p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Nome *</label>
              <input type="text" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Ruolo</label>
              <input type="text" value={form.ruolo} onChange={e => setForm({ ...form, ruolo: e.target.value })} className={inputCls} style={inputStyle} placeholder="es. Banqueting Manager" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Telefono</label>
              <input type="text" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Note</label>
            <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className={inputCls} style={inputStyle} />
          </div>
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={form.is_primary} onChange={e => setForm({ ...form, is_primary: e.target.checked })} className="sr-only peer" />
              <div className="w-8 h-4 rounded-full peer-checked:bg-[var(--red2)] transition-colors" style={{ background: form.is_primary ? undefined : 'var(--line)' }} />
              <div className="absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </label>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>Contatto principale</span>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave}
              className="px-4 py-2 rounded-lg"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 600, background: 'var(--red2)', color: 'white' }}>
              {editingId ? 'SALVA' : 'AGGIUNGI'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null) }}
              className="px-4 py-2 rounded-lg"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }}>
              ANNULLA
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── DMC History Section ────────────────────────────────────────────────────

const DMC_CAT_LABELS: Record<string, string> = {
  hotel: 'Hotel', voli: 'Voli', transfer: 'Transfer', location: 'Location',
  attivita: 'Attivita', fee_dmc: 'Fee DMC', altro: 'Altro',
}

function DmcHistorySection({ supplierId }: { supplierId: string }) {
  const [stats, setStats] = useState<{ eventCount: number; avgByCat: Record<string, number> } | null>(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('event_experience_details')
        .select('event_id, dmc_categoria, costo_totale, costo_unitario, costo_per_persona, pax, quantita')
        .eq('supplier_id', supplierId)
      if (!data || data.length === 0) { setStats(null); return }
      const events = new Set(data.map(r => r.event_id))
      const totByCat: Record<string, number> = {}
      for (const row of data) {
        const cat = row.dmc_categoria || 'altro'
        const qty = row.pax || row.quantita || 1
        const costo = row.costo_totale || ((row.costo_unitario || row.costo_per_persona || 0) * qty)
        totByCat[cat] = (totByCat[cat] || 0) + costo
      }
      const n = events.size || 1
      const avgByCat: Record<string, number> = {}
      for (const [k, v] of Object.entries(totByCat)) {
        avgByCat[k] = Math.round(v / n)
      }
      setStats({ eventCount: events.size, avgByCat })
    })()
  }, [supplierId])

  if (!stats || Object.keys(stats.avgByCat).length === 0) return null

  return (
    <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '12px' }}>
        STORICO DMC ({stats.eventCount} eventi)
      </p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)' }}>
        {Object.entries(stats.avgByCat).filter(([, v]) => v > 0).map(([k, v]) => `${DMC_CAT_LABELS[k] || k} \u20AC${v.toLocaleString('it-IT')} medio`).join(', ')}
      </p>
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
  const supplierCats = supplier.categorie?.length ? supplier.categorie : [supplier.categoria]
  const cat = normalizeCategory(supplierCats[0])

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

  const geoLine = [supplier.city, supplier.province, supplier.region, supplier.country].filter(Boolean).join(' \u00B7 ')

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Editorial header */}
      <div style={{ paddingTop: '28px', paddingBottom: '18px', borderBottom: '1.5px solid var(--text)' }}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack}
            className="flex items-center gap-2 transition-all hover:opacity-80"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft className="w-3.5 h-3.5" /> INDIETRO
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
              <Edit3 className="w-3.5 h-3.5 inline mr-1" />MODIFICA
            </button>
            <button onClick={onDelete}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
              <Trash2 className="w-3.5 h-3.5 inline mr-1" />ELIMINA
            </button>
          </div>
        </div>

        <div className="editorial-header flex items-start gap-4">
          <div className="relative group flex-shrink-0">
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
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '26px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{supplier.nome}</h1>
              {supplierCats.map(c => (
                <span key={c} style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 7px', borderRadius: '4px', background: 'var(--panel2)', color: 'var(--muted)' }}>{normalizeCategory(c)}</span>
              ))}
            </div>
            {(geoLine || supplier.location) && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px' }}>
                {geoLine || supplier.location}
              </p>
            )}
            <div className="flex items-center gap-3 mt-3">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star key={i} className="w-5 h-5 cursor-pointer"
                    fill={i <= Math.round(rating) ? 'var(--yellow)' : 'transparent'}
                    style={{ color: i <= Math.round(rating) ? 'var(--yellow)' : 'var(--line)' }}
                    onClick={() => handleRating(i)} />
                ))}
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>{rating}/5</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          {supplier.telefono && <a href={`tel:${supplier.telefono}`} className="flex items-center gap-1 hover:opacity-80"><Phone className="w-3 h-3" />{supplier.telefono}</a>}
          {supplier.email && <a href={`mailto:${supplier.email}`} className="flex items-center gap-1 truncate hover:opacity-80"><Mail className="w-3 h-3" /><span className="truncate">{supplier.email}</span></a>}
          {supplier.sito && <a href={ensureHttps(supplier.sito)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate hover:opacity-80" title={supplier.sito}><Globe className="w-3 h-3" /><span className="truncate">{displayUrl(supplier.sito)}</span></a>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniCard icon={FileText} label="P.IVA" value={supplier.piva || '-'} />
        <MiniCard icon={Euro} label="Costo medio" value={supplier.costoMedioPerEvento ? `${supplier.costoMedioPerEvento.toLocaleString('it-IT')} EUR` : '-'} />
      </div>

      <SupplierContactsSection supplierId={supplier.id} />

      {supplierCats.some(c => c.toLowerCase().includes('dmc') || c.toLowerCase().includes('destination management')) && (
        <DmcHistorySection supplierId={supplier.id} />
      )}

      {d && Object.keys(d).length > 0 && (
        <DetailSection title={`SCHEDA ${cat.toUpperCase()}`}>
          {cat === 'Hotel' ? <HotelCard d={d} /> :
           cat === 'Ristorante' ? <RistoranteCard d={d} /> :
           <GenericDetailCard d={d} />}
        </DetailSection>
      )}

      <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
        <div className="flex items-center justify-between mb-3">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>NOTE OPERATIVE INTERNE</p>
          {!editingNotes ? (
            <button onClick={() => setEditingNotes(true)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
              [ MODIFICA ]
            </button>
          ) : (
            <button onClick={saveNotes} className="flex items-center gap-1 px-3 py-1 rounded-lg"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--red2)', color: 'white' }}>
              <Save className="w-3 h-3" /> SALVA
            </button>
          )}
        </div>
        {editingNotes ? (
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
            className="w-full px-3 py-2 rounded-lg text-xs resize-none focus:outline-none"
            style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }} />
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: notes ? 'var(--text)' : 'var(--muted)' }}>
            {notes || 'Nessuna nota operativa.'}
          </p>
        )}
      </div>

      {supplier.servizi.length > 0 && (
        <div style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '20px' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: '12px' }}>SERVIZI</p>
          <div className="flex flex-wrap gap-2">
            {supplier.servizi.map(s => (
              <span key={s} className="px-3 py-1 rounded-full"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Form Modal ─────────────────────────────────────────────────────────────

export function SupplierFormModal({ supplier, onSave, onCancel, initialName }: {
  supplier?: Supplier; onSave: (s: Supplier) => void; onCancel: () => void; initialName?: string
}) {
  const [nome, setNome] = useState(supplier?.nome ?? initialName ?? '')
  const [email, setEmail] = useState(supplier?.email ?? '')
  const [telefono, setTelefono] = useState(supplier?.telefono ?? '')
  const [categorie, setCategorie] = useState<string[]>(supplier?.categorie?.length ? supplier.categorie : (supplier?.categoria ? [supplier.categoria] : []))
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
  const [contactNome, setContactNome] = useState('')
  const [contactRuolo, setContactRuolo] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactTelefono, setContactTelefono] = useState('')
  const [detailsJson, setDetailsJson] = useState(supplier?.details ? JSON.stringify(supplier.details, null, 2) : '')
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [showAdvancedJson, setShowAdvancedJson] = useState(false)

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

  const isHotel = categorie.some(c => matchesCategory(c, 'Hotel'))

  function buildDetails(): SupplierDetails | undefined {
    if (isHotel) {
      let base: Record<string, unknown> = {}
      if (detailsJson.trim()) {
        try {
          base = JSON.parse(detailsJson)
        } catch {
          base = supplier?.details ? { ...supplier.details } : {}
        }
      } else if (supplier?.details) {
        base = { ...supplier.details }
      }
      base.citta = hotelCitta || undefined
      base.catena = hotelCatena || undefined
      base.numero_camere = hotelNumeroCamere !== '' ? Number(hotelNumeroCamere) : undefined
      base.numero_sale_meeting = hotelNumeroSaleMeeting !== '' ? Number(hotelNumeroSaleMeeting) : undefined
      base.parcheggio = hotelParcheggio
      base.ristorante_interno = hotelRistoranteInterno
      base.stelle = hotelStelle !== '' ? Number(hotelStelle) : undefined
      base.capienza_sala_massima = hotelCapienzaSalaMassima !== '' ? Number(hotelCapienzaSalaMassima) : undefined
      base.capienza_totale_meeting = hotelCapienzaTotaleMeeting !== '' ? Number(hotelCapienzaTotaleMeeting) : undefined
      for (const k of Object.keys(base)) {
        if (base[k] === undefined) delete base[k]
      }
      return base as SupplierDetails
    }
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    if (categorie.length === 0) return
    setDetailsError(null)
    const parsedDetails = buildDetails()
    if (parsedDetails === null) return
    const updated: Supplier = {
      id: supplier?.id ?? `sup_${Date.now()}`,
      nome: nome.trim(), email: email.trim(), telefono: telefono.trim(),
      categoria: categorie[0] || 'Altro', categorie: categorie.length > 0 ? categorie : ['Altro'], referente: referente.trim(),
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
    if (!supplier && contactNome.trim()) {
      setTimeout(async () => {
        await supabase.from('supplier_contacts').insert({
          supplier_id: updated.id,
          nome: contactNome.trim(),
          ruolo: contactRuolo.trim() || null,
          email: contactEmail.trim() || null,
          telefono: contactTelefono.trim() || null,
          is_primary: true,
        })
      }, 300)
    }
  }

  const inputCls = "w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
  const inputStyle = { background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }
  const labelStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', display: 'block', marginBottom: '6px' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full sm:max-w-2xl max-h-[100vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 safe-bottom"
        style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>
            {supplier ? 'Modifica Fornitore' : 'Nuovo Fornitore'}
          </h2>
          <button onClick={onCancel} className="p-2 rounded-lg transition-all hover:bg-white/5">
            <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Nome *</label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} required
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Categorie *</label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 p-3 rounded-xl" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                {SUPPLIER_CATEGORIES.map(c => (
                  <label key={c} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={categorie.includes(c)}
                      onChange={e => {
                        if (e.target.checked) setCategorie(prev => [...prev, c])
                        else setCategorie(prev => prev.filter(x => x !== c))
                      }}
                      className="rounded" style={{ accentColor: 'var(--red2)' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text)' }}>{c}</span>
                  </label>
                ))}
              </div>
              {categorie.length === 0 && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--red2)', marginTop: '4px' }}>Seleziona almeno 1 categoria</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Telefono</label>
              <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Referente</label>
              <input type="text" value={referente} onChange={e => setReferente(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Tel. referente</label>
              <input type="text" value={referenteTelefono} onChange={e => setReferenteTelefono(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label style={labelStyle}>Citta</label>
              <input type="text" value={city} onChange={e => {
                setCity(e.target.value)
                if (!region) {
                  const inferred = inferRegion(e.target.value, '')
                  if (inferred) setRegion(inferred)
                }
              }}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Provincia</label>
              <input type="text" value={province} onChange={e => setProvince(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Regione</label>
              <input type="text" value={region} onChange={e => setRegion(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Paese</label>
              <input type="text" value={country} onChange={e => setCountry(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label style={labelStyle}>Location (legacy)</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Sito web</label>
              <input type="text" value={sito} onChange={e => setSito(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>P.IVA</label>
              <input type="text" value={piva} onChange={e => setPiva(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Servizi (separati da virgola)</label>
            <input type="text" value={servizi} onChange={e => setServizi(e.target.value)}
              className={inputCls} style={inputStyle}
              placeholder="Es. Impianti audio, Video proiezione" />
          </div>
          <div>
            <label style={labelStyle}>Note operative</label>
            <textarea value={noteOperative} onChange={e => setNoteOperative(e.target.value)} rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
              style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Stato</label>
            <select value={stato} onChange={e => setStato(e.target.value as 'attivo' | 'inattivo')}
              className={inputCls} style={inputStyle}>
              <option value="attivo">Attivo</option>
              <option value="inattivo">Inattivo</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Stato Contratto</label>
            <select value={statoContratto} onChange={e => setStatoContratto(e.target.value as StatoContratto)}
              className={inputCls} style={inputStyle}>
              <option value="attivo">Attivo</option>
              <option value="in_scadenza">In scadenza</option>
              <option value="scaduto">Scaduto</option>
              <option value="in_rinnovo">In rinnovo</option>
              <option value="sospeso">Sospeso</option>
            </select>
          </div>

          {!supplier && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }} className="flex items-center gap-2">
                <Building2 className="w-4 h-4" /> CONTATTO PRINCIPALE
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Nome contatto</label>
                  <input type="text" value={contactNome} onChange={e => setContactNome(e.target.value)} className={inputCls} style={inputStyle} placeholder="Mario Rossi" />
                </div>
                <div>
                  <label style={labelStyle}>Ruolo</label>
                  <input type="text" value={contactRuolo} onChange={e => setContactRuolo(e.target.value)} className={inputCls} style={inputStyle} placeholder="Banqueting Manager" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label style={labelStyle}>Email contatto</label>
                  <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Telefono contatto</label>
                  <input type="text" value={contactTelefono} onChange={e => setContactTelefono(e.target.value)} className={inputCls} style={inputStyle} />
                </div>
              </div>
            </div>
          )}

          {isHotel && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }} className="flex items-center gap-2">
                <Hotel className="w-4 h-4" /> DATI HOTEL
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label style={labelStyle}>Citta (hotel)</label>
                  <input type="text" value={hotelCitta} onChange={e => setHotelCitta(e.target.value)}
                    className={inputCls} style={inputStyle} placeholder="Roma" />
                </div>
                <div>
                  <label style={labelStyle}>Catena</label>
                  <input type="text" value={hotelCatena} onChange={e => setHotelCatena(e.target.value)}
                    className={inputCls} style={inputStyle} placeholder="NH Hotels" />
                </div>
                <div>
                  <label style={labelStyle}>Stelle</label>
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
                  <label style={labelStyle}>Numero camere</label>
                  <input type="number" min={0} value={hotelNumeroCamere} onChange={e => setHotelNumeroCamere(e.target.value ? Number(e.target.value) : '')}
                    className={inputCls} style={inputStyle} placeholder="200" />
                </div>
                <div>
                  <label style={labelStyle}>Numero sale meeting</label>
                  <input type="number" min={0} value={hotelNumeroSaleMeeting} onChange={e => setHotelNumeroSaleMeeting(e.target.value ? Number(e.target.value) : '')}
                    className={inputCls} style={inputStyle} placeholder="6" />
                </div>
                <div>
                  <label style={labelStyle}>Capienza sala massima</label>
                  <input type="number" min={0} value={hotelCapienzaSalaMassima} onChange={e => setHotelCapienzaSalaMassima(e.target.value ? Number(e.target.value) : '')}
                    className={inputCls} style={inputStyle} placeholder="300" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label style={labelStyle}>Capienza totale meeting</label>
                  <input type="number" min={0} value={hotelCapienzaTotaleMeeting} onChange={e => setHotelCapienzaTotaleMeeting(e.target.value ? Number(e.target.value) : '')}
                    className={inputCls} style={inputStyle} placeholder="800" />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={hotelParcheggio} onChange={e => setHotelParcheggio(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 rounded-full peer-checked:bg-[var(--red2)] transition-colors" style={{ background: hotelParcheggio ? undefined : 'var(--panel2)' }} />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                  </label>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>Parcheggio</span>
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={hotelRistoranteInterno} onChange={e => setHotelRistoranteInterno(e.target.checked)} className="sr-only peer" />
                    <div className="w-9 h-5 rounded-full peer-checked:bg-[var(--red2)] transition-colors" style={{ background: hotelRistoranteInterno ? undefined : 'var(--panel2)' }} />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                  </label>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>Ristorante interno</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <button type="button" onClick={() => setShowAdvancedJson(!showAdvancedJson)}
              className="flex items-center gap-1.5 mb-2 transition-all hover:opacity-80"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <ChevronRight className={`w-3 h-3 transition-transform ${showAdvancedJson ? 'rotate-90' : ''}`} />
              DETTAGLI AVANZATI (JSON)
              {detailsError && <span style={{ color: 'var(--red2)' }}> - {detailsError}</span>}
            </button>
            {showAdvancedJson && (
              <textarea value={detailsJson} onChange={e => { setDetailsJson(e.target.value); setDetailsError(null) }} rows={5}
                className="w-full px-4 py-3 rounded-xl text-xs font-mono focus:outline-none resize-none"
                style={{ background: 'var(--panel2)', border: `1px solid ${detailsError ? 'var(--red2)' : 'var(--line)'}`, color: 'var(--text)' }}
                placeholder='{"catena": "NH Hotels", "stelle": 4, "numero_camere": 200}' />
            )}
          </div>

          <div className="flex gap-3 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="submit" className="flex-1 py-3 rounded-xl"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, background: 'var(--red2)', color: 'white' }}>
              {supplier ? 'SALVA MODIFICHE' : 'CREA FORNITORE'}
            </button>
            <button type="button" onClick={onCancel}
              className="px-6 py-3 rounded-xl"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }}>
              ANNULLA
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
    <div className="flex items-center gap-1 flex-wrap" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <span style={{ color: 'var(--line)' }}>/</span>}
          <button
            onClick={item.onClick}
            className="transition-all hover:opacity-100"
            style={{ color: i === items.length - 1 ? 'var(--text)' : 'var(--muted)', opacity: i === items.length - 1 ? 1 : 0.8, background: 'none', border: 'none', cursor: 'pointer' }}>
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
      className="text-left w-full transition-all"
      style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', padding: '18px 20px' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--panel2)' }}>
          <TileIcon className="w-4 h-4" style={{ color: 'var(--muted)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>{label}</p>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, marginTop: '2px' }}>{count}</p>
        </div>
      </div>
    </button>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Fornitori() {
  loadUser()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [supplierList, setSupplierList] = useState<Supplier[]>([])
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>(undefined)
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [mode, setMode] = useState<'navigate' | 'search'>('navigate')

  const [navCategory, setNavCategory] = useState<string | null>(null)
  const [navCountryGroup, setNavCountryGroup] = useState<string | null>(null)
  const [navRegion, setNavRegion] = useState<string | null>(null)
  const [navCity, setNavCity] = useState<string | null>(null)
  const [navChain, setNavChain] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')

  const loadData = useCallback(async () => {
    try {
      const sups = await fetchSuppliers()
      setSupplierList(sups)
    } catch (err) {
      showToast('Errore caricamento fornitori')
    }
  }, [showToast])

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
    return supplierList.filter(s => {
      const cats = s.categorie?.length ? s.categorie : [s.categoria]
      return cats.some(c => matchesCategory(c, navCategory))
    })
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

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of supplierList) {
      const cats = s.categorie?.length ? s.categorie : [s.categoria]
      const normalized = new Set(cats.map(c => normalizeCategory(c)))
      for (const c of normalized) {
        map[c] = (map[c] || 0) + 1
      }
    }
    return map
  }, [supplierList])

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

  // Average rating
  const avgRating = useMemo(() => {
    const rated = supplierList.filter(s => s.rating > 0)
    if (!rated.length) return 0
    return rated.reduce((a, s) => a + s.rating, 0) / rated.length
  }, [supplierList])

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
            <button onClick={() => setSaveError(null)} className="ml-2 text-white/70 hover:text-white">&#10005;</button>
          </div>
        )}
        {deletingSupplier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="w-full max-w-sm p-6" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--red2) 12%, transparent)' }}>
                  <Trash2 className="w-4 h-4" style={{ color: 'var(--red2)' }} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>Elimina fornitore</h3>
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
                Sei sicuro di voler eliminare <strong style={{ color: 'var(--text)' }}>"{deletingSupplier.nome}"</strong>?
              </p>
              <div className="flex gap-3">
                <button onClick={handleDelete} className="flex-1 py-3 rounded-xl text-white"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, background: 'var(--red2)' }}>ELIMINA</button>
                <button onClick={() => setDeletingSupplier(null)} className="flex-1 py-3 rounded-xl"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }}>ANNULLA</button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Wire masthead */}
      <div className="wire-masthead">
        <div>
          <span className="wire-masthead-title">FORNITORI</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginLeft: '12px' }}>
            {supplierList.length}
          </span>
        </div>
        <div className="wire-masthead-right">
          <button onClick={() => { setEditingSupplier(undefined); setShowForm(true) }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted)' }}>
            <Plus className="w-3 h-3 inline mr-1 -mt-0.5" />NUOVO FORNITORE
          </button>
        </div>
      </div>

      {/* Wire ticker */}
      <div className="wire-ticker">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          <strong>{supplierList.length}</strong> totali
        </span>
        {(categoryCounts['Hotel'] ?? 0) > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
            <strong>{categoryCounts['Hotel']}</strong> hotel
          </span>
        )}
        {(categoryCounts['Ristorante'] ?? 0) > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
            <strong>{categoryCounts['Ristorante']}</strong> ristoranti
          </span>
        )}
        {(categoryCounts['Audio Video'] ?? 0) > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
            <strong>{categoryCounts['Audio Video']}</strong> audio/video
          </span>
        )}
        {(categoryCounts['Location'] ?? 0) > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
            <strong>{categoryCounts['Location']}</strong> location
          </span>
        )}
        {avgRating > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--yellow)' }}>
            <Star className="w-3 h-3 inline -mt-0.5 mr-0.5" fill="var(--yellow)" /><strong>{avgRating.toFixed(1)}</strong> rating medio
          </span>
        )}
      </div>

      {/* Wire tabs: mode selector */}
      <div className="wire-tabs">
        <button onClick={() => setMode('navigate')}
          className={`wire-tab ${mode === 'navigate' ? 'wire-tab--active' : ''}`}>
          <Navigation className="w-3 h-3 inline mr-1 -mt-0.5" />NAVIGA
        </button>
        <button onClick={() => setMode('search')}
          className={`wire-tab ${mode === 'search' ? 'wire-tab--active' : ''}`}>
          <Search className="w-3 h-3 inline mr-1 -mt-0.5" />CERCA
        </button>
      </div>

      {/* ─── SEARCH MODE ───────────────────────────────────────────────────────── */}
      {mode === 'search' && (
        <div className="space-y-4 animate-fade-in" style={{ marginTop: '20px' }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder='Cerca: "Milano 200 persone", "hotel Lombardia", "audio video Torino"...'
              className="w-full pl-10 pr-9 py-3 rounded-lg text-sm focus:outline-none"
              style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
              </button>
            )}
            {!searchQuery && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2" style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Usa Fly ↑ per domande complesse</span>
            )}
          </div>

          {searchQuery.trim() && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
              {searchResults.length} fornitor{searchResults.length !== 1 ? 'i' : 'e'} trovat{searchResults.length !== 1 ? 'i' : 'o'}
            </p>
          )}

          {searchQuery.trim() && searchResults.length === 0 && (
            <div className="p-10 text-center" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', color: 'var(--muted)' }}>
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>Nessun fornitore trovato</p>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {searchResults.map(sup => (
                <SupplierCard key={sup.id} supplier={sup} onClick={() => setSelected(sup)} />
              ))}
            </div>
          )}

          {!searchQuery.trim() && (
            <div className="p-10 text-center" style={{ background: 'var(--panel-solid)', border: '1px dashed var(--line)', borderRadius: '14px' }}>
              <Search className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: 'var(--muted)' }} />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>Scrivi una ricerca per trovare fornitori</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {['Milano 200 persone', 'hotel Lombardia', 'audio video Torino', 'ristorante Roma 100 persone', 'catering Bari'].map(ex => (
                  <button key={ex} onClick={() => setSearchQuery(ex)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '4px 10px', borderRadius: '6px', background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)', cursor: 'pointer' }}>
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
        <div className="space-y-4 animate-fade-in" style={{ marginTop: '20px' }}>
          {/* Breadcrumb */}
          {navCategory && navCountryGroup !== '__chains__' && <Breadcrumb items={breadcrumbItems} />}

          {/* Level: Categories */}
          {!navCategory && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {SUPPLIER_CATEGORIES.map(cat => {
                const Icon = CATEGORY_ICONS[cat] ?? MoreHorizontal
                const count = categoryCounts[cat] ?? 0
                return (
                  <NavTile key={cat} label={cat} count={count} icon={Icon} onClick={() => setNavCategory(cat)} />
                )
              })}
            </div>
          )}

          {/* Level: Country groups */}
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
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
                {chainSuppliers.length} hotel {navChain}
              </p>
              {chainSuppliers.length === 0 ? (
                <div className="p-10 text-center" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', color: 'var(--muted)' }}>
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>Nessun hotel in questa catena</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                (() => {
                  const onlyRegion = Object.keys(regions)[0]
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
                {finalNavList.length} risultat{finalNavList.length !== 1 ? 'i' : 'o'}
              </p>
              {finalNavList.length === 0 ? (
                <div className="p-10 text-center" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', color: 'var(--muted)' }}>
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>Nessun fornitore in questa posizione</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-sm p-6" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--red2) 12%, transparent)' }}>
                <Trash2 className="w-4 h-4" style={{ color: 'var(--red2)' }} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>Elimina fornitore</h3>
            </div>
            <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
              Sei sicuro di voler eliminare <strong style={{ color: 'var(--text)' }}>"{deletingSupplier.nome}"</strong>?
            </p>
            <div className="flex gap-3">
              <button onClick={handleDelete} className="flex-1 py-3 rounded-xl text-white"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, background: 'var(--red2)' }}>ELIMINA</button>
              <button onClick={() => setDeletingSupplier(null)} className="flex-1 py-3 rounded-xl"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--line)' }}>ANNULLA</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
