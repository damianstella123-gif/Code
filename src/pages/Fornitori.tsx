import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, MapPin, Globe, Star, FileText, Euro,
  Search, X, Plus, Trash2, Save, Upload, Building2, Edit3,
  Hotel, UtensilsCrossed, MapPinned, CookingPot,
  Speaker, PaintBucket, Users, MoreHorizontal, Camera, Video, Shield,
  Music, ChevronRight, Navigation, Plane, Car, Printer, Umbrella,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { displayUrl, ensureHttps, inferRegion } from '@/lib/format'
import { fetchSuppliers, upsertSupplier, deleteSupplier as deleteSupplierRemote, updateSupplier } from '@/lib/suppliers-service'
import { useRealtimeTable } from '@/lib/use-realtime'
import { supabase } from '@/lib/supabase'
import type { Supplier, SupplierDetails, SalaMeeting, StatoContratto } from '@/data/suppliers'
import { SUPPLIER_CATEGORIES } from '@/data/suppliers'
import { SupplierPhotoGallery, useSupplierCoverPhoto } from '@/components/SupplierPhotoGallery'

// ─── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Hotel, Ristorante: UtensilsCrossed, Location: MapPinned,
  'Audio Video': Speaker, Catering: CookingPot, Allestimenti: PaintBucket,
  Staff: Users, Transfer: Car, 'Grafica & Stampa': Printer,
  Esperienze: Star, DMC: Navigation, 'Agenzia di Viaggi': Plane,
  Entertainment: Music, Fotografia: Camera, Video: Video,
  Sicurezza: Shield, Assicurazioni: Umbrella, Altro: MoreHorizontal,
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
    'assicurazioni': ['assicurazioni', 'assicurazione', 'insurance'],
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

function LocationCard({ d }: { d: SupplierDetails }) {
  const hasCapienza = d.loc_capienza_teatro || d.loc_capienza_cocktail || d.loc_capienza_banquetto || d.loc_capienza_cabaret
  return (
    <div className="space-y-4">
      {hasCapienza && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '10px' }}>CAPIENZA</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Teatro', value: d.loc_capienza_teatro },
              { label: 'Cocktail', value: d.loc_capienza_cocktail },
              { label: 'Banquetto', value: d.loc_capienza_banquetto },
              { label: 'Cabaret', value: d.loc_capienza_cabaret },
            ].filter(c => c.value).map(c => (
              <div key={c.label} className="rounded-lg p-3 text-center" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', color: 'var(--muted)' }}>{c.label}</p>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600, color: 'var(--text)', marginTop: '2px' }}>{c.value}</p>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--muted)' }}>pax</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {d.loc_mq && (
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>{d.loc_mq} m&sup2;</p>
      )}
      <InfoGrid items={[
        { label: 'Tipo', value: d.loc_tipo || d.tipo_location },
        { label: 'Capienza massima', value: d.capienza_massima },
      ]} />
      <BoolGrid items={[
        { label: 'Outdoor', value: d.loc_outdoor || d.spazi_esterni },
        { label: 'Indoor', value: d.loc_indoor || d.spazi_interni },
        { label: 'Rooftop', value: d.loc_rooftop },
        { label: 'Parcheggio', value: d.loc_parcheggio },
        { label: 'Esclusiva', value: d.loc_esclusiva || d.esclusiva },
        { label: 'Catering interno', value: d.loc_catering_interno || d.catering_interno },
      ]} />
      {d.loc_note_tecniche && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)', marginTop: '8px' }}>{d.loc_note_tecniche}</p>
      )}
    </div>
  )
}

function AudioVideoCard({ d }: { d: SupplierDetails }) {
  const tipologie = d.av_tipologie ?? []
  return (
    <div className="space-y-4">
      {tipologie.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>SERVIZI</p>
          <div className="flex flex-wrap gap-2">
            {tipologie.map(t => (
              <span key={t} className="px-3 py-1.5 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 500, background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>{t}</span>
            ))}
          </div>
        </div>
      )}
      {d.av_led_wall && (
        <div className="rounded-lg p-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', color: 'var(--muted)' }}>LED WALL</p>
          {d.av_led_wall_mq && <p style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>{d.av_led_wall_mq} m&sup2;</p>}
        </div>
      )}
      {d.av_marchi && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '4px' }}>MARCHI</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>{d.av_marchi}</p>
        </div>
      )}
      <BoolGrid items={[
        { label: 'Audio', value: d.audio },
        { label: 'Video', value: d.video },
        { label: 'Luci', value: d.luci },
        { label: 'LED Wall', value: d.av_led_wall || d.ledwall },
        { label: 'Streaming', value: d.av_streaming || d.streaming },
        { label: 'Regia', value: d.av_regia || d.regia },
        { label: 'Montaggio incluso', value: d.av_montaggio_incluso },
        { label: 'Tecnici inclusi', value: d.tecnici_inclusi },
        { label: 'Traduzione simultanea', value: d.traduzione_simultanea },
        { label: 'Palco', value: d.palco },
        { label: 'Sopralluogo', value: d.sopralluogo },
      ]} />
      {d.av_note && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)', marginTop: '8px' }}>{d.av_note}</p>
      )}
    </div>
  )
}

function CateringCard({ d }: { d: SupplierDetails }) {
  return (
    <div className="space-y-4">
      {d.cat_stile && (
        <span className="inline-block px-4 py-2 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>{d.cat_stile}</span>
      )}
      {(d.cat_min_pax || d.cat_max_pax) && (
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
          Da {d.cat_min_pax ?? '?'} a {d.cat_max_pax ?? '?'} pax
        </p>
      )}
      <InfoGrid items={[
        { label: 'Tipo cucina', value: d.tipo_cucina },
        { label: 'Tipologia servizi', value: d.tipologia_servizi },
        { label: 'Max ospiti', value: d.numero_massimo_ospiti },
      ]} />
      <BoolGrid items={[
        { label: 'Servizio al tavolo', value: d.cat_servizio_tavolo || d.cena_servita },
        { label: 'Buffet', value: d.cat_buffet || d.buffet },
        { label: 'Finger food', value: d.cat_finger_food },
        { label: 'Bio / Naturale', value: d.cat_bio },
        { label: 'Km0', value: d.cat_km0 },
        { label: 'Allergie gestite', value: d.cat_allergie_gestite || d.intolleranze },
        { label: 'Beverage incluso', value: d.cat_beverage },
        { label: 'Personale incluso', value: d.cat_personale_incluso || d.personale_incluso },
        { label: 'Coffee break', value: d.coffee_break },
        { label: 'Light lunch', value: d.light_lunch },
        { label: 'Banqueting', value: d.banqueting },
        { label: 'Vegano', value: d.vegano },
        { label: 'Vegetariano', value: d.vegetariano },
        { label: 'Kosher', value: d.kosher },
        { label: 'Halal', value: d.halal },
      ]} />
    </div>
  )
}

function DMCCard({ d }: { d: SupplierDetails }) {
  const paesi = d.dmc_paesi ?? []
  const lingue = d.dmc_lingue ?? []
  const spec = d.dmc_specialita ?? []
  return (
    <div className="space-y-4">
      {paesi.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>DESTINAZIONI</p>
          <div className="flex flex-wrap gap-2">
            {paesi.slice(0, 6).map(p => (
              <span key={p} className="px-3 py-1.5 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 500, background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>{p}</span>
            ))}
            {paesi.length > 6 && <span className="px-3 py-1.5 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--muted)' }}>+{paesi.length - 6} altri</span>}
          </div>
        </div>
      )}
      {lingue.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>LINGUE</p>
          <div className="flex flex-wrap gap-2">
            {lingue.map(l => (
              <span key={l} className="px-2.5 py-1 rounded-full" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'color-mix(in srgb, var(--blue) 10%, transparent)', color: 'var(--blue)' }}>{l}</span>
            ))}
          </div>
        </div>
      )}
      {spec.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>SPECIALITA</p>
          <div className="flex flex-wrap gap-2">
            {spec.map(s => (
              <span key={s} className="px-3 py-1.5 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>{s}</span>
            ))}
          </div>
        </div>
      )}
      <InfoGrid items={[
        { label: 'Anni esperienza', value: d.dmc_anni_esperienza },
        { label: 'IATA', value: d.dmc_iata ? 'Si' : undefined },
      ]} />
      <BoolGrid items={[
        { label: 'Incentive', value: d.dmc_incentive },
        { label: 'Congressi', value: d.dmc_congressi },
        { label: 'Team Building', value: d.dmc_team_building },
      ]} />
    </div>
  )
}

function TransferCard({ d }: { d: SupplierDetails }) {
  const fleet = [
    { label: 'Auto', value: d.tr_flotta_auto },
    { label: 'Minivan', value: d.tr_flotta_minivan },
    { label: 'Bus', value: d.tr_flotta_bus },
    { label: 'Pullman', value: d.tr_flotta_pullman },
  ].filter(f => f.value)
  const lingue = d.tr_lingue_autisti ?? []
  return (
    <div className="space-y-4">
      {fleet.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '10px' }}>FLOTTA</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {fleet.map(f => (
              <div key={f.label} className="rounded-lg p-3 text-center" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', textTransform: 'uppercase', color: 'var(--muted)' }}>{f.label}</p>
                <p style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginTop: '2px' }}>{f.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {lingue.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>LINGUE AUTISTI</p>
          <div className="flex flex-wrap gap-2">
            {lingue.map(l => (
              <span key={l} className="px-2.5 py-1 rounded-full" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'color-mix(in srgb, var(--blue) 10%, transparent)', color: 'var(--blue)' }}>{l}</span>
            ))}
          </div>
        </div>
      )}
      <BoolGrid items={[
        { label: 'NCC', value: d.tr_ncc },
        { label: 'VIP', value: d.tr_vip },
        { label: 'H24 / 7gg', value: d.tr_h24 },
      ]} />
    </div>
  )
}

function StaffCard({ d }: { d: SupplierDetails }) {
  const ruoli = d.stf_ruoli ?? []
  const lingue = d.stf_lingue ?? []
  return (
    <div className="space-y-4">
      {ruoli.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>FIGURE DISPONIBILI</p>
          <div className="flex flex-wrap gap-2">
            {ruoli.map(r => (
              <span key={r} className="px-3 py-1.5 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 500, background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>{r}</span>
            ))}
          </div>
        </div>
      )}
      {lingue.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>LINGUE</p>
          <div className="flex flex-wrap gap-2">
            {lingue.map(l => (
              <span key={l} className="px-2.5 py-1 rounded-full" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'color-mix(in srgb, var(--blue) 10%, transparent)', color: 'var(--blue)' }}>{l}</span>
            ))}
          </div>
        </div>
      )}
      {d.stf_min_ordine && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)' }}>Minimo {d.stf_min_ordine} unita</p>
      )}
      <BoolGrid items={[
        { label: 'Hostess', value: d.stf_hostess },
        { label: 'Steward', value: d.stf_steward },
        { label: 'Promoter', value: d.stf_promoter },
        { label: 'Interpreti', value: d.stf_interpreti },
        { label: 'Divisa / Dress code', value: d.stf_divisa },
      ]} />
    </div>
  )
}

function AgenziaViaggCard({ d }: { d: SupplierDetails }) {
  const vettori = d.ag_vettori ?? []
  const dest = d.ag_destinazioni ?? []
  return (
    <div className="space-y-4">
      <BoolGrid items={[
        { label: 'IATA', value: d.ag_iata },
        { label: 'Biglietteria aerea', value: d.ag_biglietteria_aerea },
        { label: 'Biglietteria treno', value: d.ag_biglietteria_treno },
        { label: 'Pacchetti', value: d.ag_pacchetti },
        { label: 'MICE specializzato', value: d.ag_mice },
      ]} />
      {vettori.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>VETTORI PRINCIPALI</p>
          <div className="flex flex-wrap gap-2">
            {vettori.map(v => (
              <span key={v} className="px-2.5 py-1 rounded-full" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>{v}</span>
            ))}
          </div>
        </div>
      )}
      {dest.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>DESTINAZIONI TOP</p>
          <div className="flex flex-wrap gap-2">
            {dest.slice(0, 8).map(dd => (
              <span key={dd} className="px-2.5 py-1 rounded-full" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>{dd}</span>
            ))}
            {dest.length > 8 && <span className="px-2.5 py-1 rounded-full" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'var(--panel2)', color: 'var(--muted)' }}>+{dest.length - 8}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function AllestimentiCard({ d }: { d: SupplierDetails }) {
  const tipologie = d.all_tipologie ?? []
  return (
    <div className="space-y-4">
      {tipologie.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>TIPOLOGIE</p>
          <div className="flex flex-wrap gap-2">
            {tipologie.map(t => (
              <span key={t} className="px-3 py-1.5 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 500, background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>{t}</span>
            ))}
          </div>
        </div>
      )}
      {d.all_min_budget && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>Budget minimo: &euro;{d.all_min_budget.toLocaleString('it-IT')}</p>
      )}
      <BoolGrid items={[
        { label: 'Montaggio incluso', value: d.all_montaggio_incluso },
        { label: 'Noleggio', value: d.all_noleggio },
        { label: 'Vendita', value: d.all_vendita },
        { label: 'Grafica inclusa', value: d.all_grafica_inclusa },
      ]} />
    </div>
  )
}

function ExperienceCard({ d }: { d: SupplierDetails }) {
  const lingue = d.exp_lingue ?? []
  const stagioni = d.exp_stagionalita ?? []
  return (
    <div className="space-y-4">
      {d.exp_tipologia && (
        <span className="inline-block px-4 py-2 rounded-lg" style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>{d.exp_tipologia}</span>
      )}
      <InfoGrid items={[
        { label: 'Min pax', value: d.exp_min_pax },
        { label: 'Max pax', value: d.exp_max_pax },
        { label: 'Durata', value: d.exp_durata_minuti ? `${d.exp_durata_minuti} min` : undefined },
      ]} />
      {lingue.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>LINGUE</p>
          <div className="flex flex-wrap gap-2">
            {lingue.map(l => (
              <span key={l} className="px-2.5 py-1 rounded-full" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'color-mix(in srgb, var(--blue) 10%, transparent)', color: 'var(--blue)' }}>{l}</span>
            ))}
          </div>
        </div>
      )}
      <BoolGrid items={[
        { label: 'Outdoor', value: d.exp_outdoor },
        { label: 'Indoor', value: d.exp_indoor },
      ]} />
      {stagioni.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '8px' }}>STAGIONALITA</p>
          <div className="flex flex-wrap gap-2">
            {stagioni.map(s => (
              <span key={s} className="px-2.5 py-1 rounded-full" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'color-mix(in srgb, var(--green) 10%, transparent)', color: 'var(--green)' }}>{s}</span>
            ))}
          </div>
        </div>
      )}
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
  const coverUrl = useSupplierCoverPhoto(supplier.id)

  return (
    <div onClick={onClick}
      className="wire-card cursor-pointer transition-all overflow-hidden"
      style={{ background: 'var(--panel-solid)' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}>
      {coverUrl && (
        <div style={{
          height: 100, borderRadius: '12px 12px 0 0',
          background: `linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.6)), url(${coverUrl}) center/cover`,
          position: 'relative',
        }}>
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            {(() => {
              const cats = supplier.categorie?.length ? supplier.categorie : [supplier.categoria]
              return cats.slice(0, 1).map(c => (
                <span key={c} style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', textTransform: 'uppercase', padding: '2px 5px', borderRadius: '3px', background: 'rgba(0,0,0,0.5)', color: 'white' }}>
                  {normalizeCategory(c)}
                </span>
              ))
            })()}
          </div>
          {supplier.rating > 0 && (
            <div className="absolute top-2 right-2 flex items-center gap-0.5" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'white', background: 'rgba(0,0,0,0.5)', padding: '2px 5px', borderRadius: 3 }}>
              <Star className="w-2.5 h-2.5" style={{ fill: '#ffc24b', color: '#ffc24b' }} /> {supplier.rating}
            </div>
          )}
        </div>
      )}
      <div style={{ padding: '16px 18px' }}>
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
        {!coverUrl && (
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
        )}
        {!coverUrl && <InteractiveStars rating={supplier.rating} size="sm" />}
        {coverUrl && (
          <div className="flex items-center gap-2 mb-1" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>
            {rooms > 0 && <span>{rooms} camere</span>}
            {capacity > 0 && <span>cap. {capacity}</span>}
            {meetingRooms > 0 && <span>{meetingRooms} sale</span>}
          </div>
        )}
        {supplier.servizi.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {supplier.servizi.slice(0, 3).map(s => (
              <span key={s} style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--panel2)', color: 'var(--muted)' }}>{s}</span>
            ))}
            {supplier.servizi.length > 3 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--panel2)', color: 'var(--muted)' }}>+{supplier.servizi.length - 3}</span>}
          </div>
        )}
      </div>
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
        <div className="wire-list-container">
          {contacts.map(c => (
            <div key={c.id} className="wire-card-flat flex items-start justify-between gap-3">
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
              className="absolute inset-0 rounded-xl hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.6)' }}>
              {uploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Upload className="w-5 h-5 text-white" />}
            </button>
            <button onClick={() => fileRef.current?.click()}
              className="md:hidden absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: 'var(--accent)' }} title="Carica logo">
              {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Upload className="w-4 h-4 text-white" />}
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
          <SupplierPhotoGallery supplierId={supplier.id} supplierCategory={cat} />
          {cat === 'Hotel' ? <HotelCard d={d} /> :
           cat === 'Ristorante' ? <RistoranteCard d={d} /> :
           cat === 'Location' ? <LocationCard d={d} /> :
           cat === 'Audio Video' ? <AudioVideoCard d={d} /> :
           cat === 'Catering' ? <CateringCard d={d} /> :
           cat === 'DMC' ? <DMCCard d={d} /> :
           (cat === 'Transfer' || cat === 'Trasporti') ? <TransferCard d={d} /> :
           cat === 'Staff' ? <StaffCard d={d} /> :
           cat === 'Agenzia di Viaggi' ? <AgenziaViaggCard d={d} /> :
           cat === 'Allestimenti' ? <AllestimentiCard d={d} /> :
           (cat === 'Esperienze' || cat === 'Entertainment') ? <ExperienceCard d={d} /> :
           <GenericDetailCard d={d} />}
        </DetailSection>
      )}

      {(!d || Object.keys(d).length === 0) && (
        <DetailSection title="FOTO">
          <SupplierPhotoGallery supplierId={supplier.id} supplierCategory={cat} />
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
  const isLocation = categorie.some(c => matchesCategory(c, 'Location'))
  const isAV = categorie.some(c => matchesCategory(c, 'Audio Video'))
  const isCatering = categorie.some(c => matchesCategory(c, 'Catering'))
  const isDMC = categorie.some(c => matchesCategory(c, 'DMC'))
  const isTransfer = categorie.some(c => matchesCategory(c, 'Transfer') || matchesCategory(c, 'Trasporti'))
  const isStaff = categorie.some(c => matchesCategory(c, 'Staff'))
  const isAgenzia = categorie.some(c => matchesCategory(c, 'Agenzia di Viaggi'))
  const isAllestimenti = categorie.some(c => matchesCategory(c, 'Allestimenti'))
  const isExperience = categorie.some(c => matchesCategory(c, 'Esperienze') || matchesCategory(c, 'Entertainment'))
  const hasCategoryForm = isLocation || isAV || isCatering || isDMC || isTransfer || isStaff || isAgenzia || isAllestimenti || isExperience

  const [catFields, setCatFields] = useState<Record<string, unknown>>(() => {
    const d = supplier?.details ?? {}
    return { ...d }
  })
  function setCF(key: string, value: unknown) {
    setCatFields(prev => ({ ...prev, [key]: value }))
  }
  function setCFArray(key: string, value: string) {
    setCatFields(prev => ({ ...prev, [key]: value.split(',').map(s => s.trim()).filter(Boolean) }))
  }
  function getCFStr(key: string): string { return (catFields[key] as string) ?? '' }
  function getCFNum(key: string): number | '' { const v = catFields[key]; return typeof v === 'number' ? v : '' }
  function getCFBool(key: string): boolean { return !!(catFields[key]) }
  function getCFArr(key: string): string { return ((catFields[key] as string[]) ?? []).join(', ') }

  function buildDetails(): SupplierDetails | undefined {
    if (isHotel) {
      let base: Record<string, unknown> = { ...catFields }
      if (detailsJson.trim()) {
        try { base = { ...base, ...JSON.parse(detailsJson) } } catch { /* keep base */ }
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
      for (const k of Object.keys(base)) { if (base[k] === undefined) delete base[k] }
      return base as SupplierDetails
    }
    if (hasCategoryForm) {
      let base: Record<string, unknown> = { ...catFields }
      if (detailsJson.trim()) {
        try { base = { ...base, ...JSON.parse(detailsJson) } } catch { /* keep base */ }
      }
      for (const k of Object.keys(base)) { if (base[k] === undefined || base[k] === '' || (Array.isArray(base[k]) && (base[k] as unknown[]).length === 0)) delete base[k] }
      return Object.keys(base).length > 0 ? (base as SupplierDetails) : supplier?.details
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

          {isLocation && !isHotel && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>DATI LOCATION</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div><label style={labelStyle}>Tipo</label><input type="text" value={getCFStr('loc_tipo')} onChange={e => setCF('loc_tipo', e.target.value)} className={inputCls} style={inputStyle} placeholder="Villa, Palazzo..." /></div>
                <div><label style={labelStyle}>Cap. Teatro</label><input type="number" min={0} value={getCFNum('loc_capienza_teatro')} onChange={e => setCF('loc_capienza_teatro', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
                <div><label style={labelStyle}>Cap. Cocktail</label><input type="number" min={0} value={getCFNum('loc_capienza_cocktail')} onChange={e => setCF('loc_capienza_cocktail', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
                <div><label style={labelStyle}>Cap. Banquetto</label><input type="number" min={0} value={getCFNum('loc_capienza_banquetto')} onChange={e => setCF('loc_capienza_banquetto', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
                <div><label style={labelStyle}>Cap. Cabaret</label><input type="number" min={0} value={getCFNum('loc_capienza_cabaret')} onChange={e => setCF('loc_capienza_cabaret', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
                <div><label style={labelStyle}>Superficie (m2)</label><input type="number" min={0} value={getCFNum('loc_mq')} onChange={e => setCF('loc_mq', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                {(['loc_outdoor', 'loc_indoor', 'loc_rooftop', 'loc_parcheggio', 'loc_esclusiva', 'loc_catering_interno'] as const).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={getCFBool(k)} onChange={e => setCF(k, e.target.checked)} className="w-4 h-4 rounded" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>{k.replace('loc_', '').replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
              <div><label style={labelStyle}>Note tecniche</label><textarea value={getCFStr('loc_note_tecniche')} onChange={e => setCF('loc_note_tecniche', e.target.value)} rows={2} className={inputCls + ' resize-none'} style={inputStyle} /></div>
            </div>
          )}

          {isAV && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>DATI AUDIO VIDEO</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label style={labelStyle}>Tipologie (virgola)</label><input type="text" value={getCFArr('av_tipologie')} onChange={e => setCFArray('av_tipologie', e.target.value)} className={inputCls} style={inputStyle} placeholder="Luci, Audio, Video, Regia" /></div>
                <div><label style={labelStyle}>Marchi</label><input type="text" value={getCFStr('av_marchi')} onChange={e => setCF('av_marchi', e.target.value)} className={inputCls} style={inputStyle} placeholder="Shure, d&b..." /></div>
                <div><label style={labelStyle}>LED Wall m2</label><input type="number" min={0} step={0.1} value={getCFNum('av_led_wall_mq')} onChange={e => setCF('av_led_wall_mq', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                {(['av_led_wall', 'av_streaming', 'av_regia', 'av_montaggio_incluso'] as const).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={getCFBool(k)} onChange={e => setCF(k, e.target.checked)} className="w-4 h-4 rounded" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>{k.replace('av_', '').replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
              <div><label style={labelStyle}>Note</label><textarea value={getCFStr('av_note')} onChange={e => setCF('av_note', e.target.value)} rows={2} className={inputCls + ' resize-none'} style={inputStyle} /></div>
            </div>
          )}

          {isCatering && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>DATI CATERING</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div><label style={labelStyle}>Stile cucina</label><input type="text" value={getCFStr('cat_stile')} onChange={e => setCF('cat_stile', e.target.value)} className={inputCls} style={inputStyle} placeholder="Mediterranea, Fusion..." /></div>
                <div><label style={labelStyle}>Min pax</label><input type="number" min={0} value={getCFNum('cat_min_pax')} onChange={e => setCF('cat_min_pax', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
                <div><label style={labelStyle}>Max pax</label><input type="number" min={0} value={getCFNum('cat_max_pax')} onChange={e => setCF('cat_max_pax', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                {(['cat_servizio_tavolo', 'cat_buffet', 'cat_finger_food', 'cat_bio', 'cat_km0', 'cat_allergie_gestite', 'cat_beverage', 'cat_personale_incluso'] as const).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={getCFBool(k)} onChange={e => setCF(k, e.target.checked)} className="w-4 h-4 rounded" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>{k.replace('cat_', '').replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isDMC && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>DATI DMC</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label style={labelStyle}>Paesi (virgola)</label><input type="text" value={getCFArr('dmc_paesi')} onChange={e => setCFArray('dmc_paesi', e.target.value)} className={inputCls} style={inputStyle} placeholder="Italia, Francia, Spagna" /></div>
                <div><label style={labelStyle}>Lingue (virgola)</label><input type="text" value={getCFArr('dmc_lingue')} onChange={e => setCFArray('dmc_lingue', e.target.value)} className={inputCls} style={inputStyle} placeholder="IT, EN, FR" /></div>
                <div><label style={labelStyle}>Specialita (virgola)</label><input type="text" value={getCFArr('dmc_specialita')} onChange={e => setCFArray('dmc_specialita', e.target.value)} className={inputCls} style={inputStyle} placeholder="Incentive, Congressi" /></div>
                <div><label style={labelStyle}>Anni esperienza</label><input type="number" min={0} value={getCFNum('dmc_anni_esperienza')} onChange={e => setCF('dmc_anni_esperienza', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                {(['dmc_iata', 'dmc_incentive', 'dmc_congressi', 'dmc_team_building'] as const).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={getCFBool(k)} onChange={e => setCF(k, e.target.checked)} className="w-4 h-4 rounded" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>{k.replace('dmc_', '').replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isTransfer && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>DATI TRANSFER</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div><label style={labelStyle}>Auto</label><input type="number" min={0} value={getCFNum('tr_flotta_auto')} onChange={e => setCF('tr_flotta_auto', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
                <div><label style={labelStyle}>Minivan</label><input type="number" min={0} value={getCFNum('tr_flotta_minivan')} onChange={e => setCF('tr_flotta_minivan', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
                <div><label style={labelStyle}>Bus</label><input type="number" min={0} value={getCFNum('tr_flotta_bus')} onChange={e => setCF('tr_flotta_bus', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
                <div><label style={labelStyle}>Pullman</label><input type="number" min={0} value={getCFNum('tr_flotta_pullman')} onChange={e => setCF('tr_flotta_pullman', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Lingue autisti (virgola)</label><input type="text" value={getCFArr('tr_lingue_autisti')} onChange={e => setCFArray('tr_lingue_autisti', e.target.value)} className={inputCls} style={inputStyle} placeholder="IT, EN, FR" /></div>
              <div className="flex flex-wrap gap-4 pt-2">
                {(['tr_ncc', 'tr_vip', 'tr_h24'] as const).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={getCFBool(k)} onChange={e => setCF(k, e.target.checked)} className="w-4 h-4 rounded" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>{k.replace('tr_', '').replace(/_/g, ' ').toUpperCase()}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isStaff && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>DATI STAFF</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label style={labelStyle}>Ruoli (virgola)</label><input type="text" value={getCFArr('stf_ruoli')} onChange={e => setCFArray('stf_ruoli', e.target.value)} className={inputCls} style={inputStyle} placeholder="Hostess, Steward, Promoter" /></div>
                <div><label style={labelStyle}>Lingue (virgola)</label><input type="text" value={getCFArr('stf_lingue')} onChange={e => setCFArray('stf_lingue', e.target.value)} className={inputCls} style={inputStyle} placeholder="IT, EN, FR" /></div>
                <div><label style={labelStyle}>Minimo ordine</label><input type="number" min={0} value={getCFNum('stf_min_ordine')} onChange={e => setCF('stf_min_ordine', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                {(['stf_hostess', 'stf_steward', 'stf_promoter', 'stf_interpreti', 'stf_divisa'] as const).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={getCFBool(k)} onChange={e => setCF(k, e.target.checked)} className="w-4 h-4 rounded" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>{k.replace('stf_', '').replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isAgenzia && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>DATI AGENZIA VIAGGI</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label style={labelStyle}>Vettori (virgola)</label><input type="text" value={getCFArr('ag_vettori')} onChange={e => setCFArray('ag_vettori', e.target.value)} className={inputCls} style={inputStyle} placeholder="Alitalia, Lufthansa" /></div>
                <div><label style={labelStyle}>Destinazioni (virgola)</label><input type="text" value={getCFArr('ag_destinazioni')} onChange={e => setCFArray('ag_destinazioni', e.target.value)} className={inputCls} style={inputStyle} placeholder="Europa, USA, Asia" /></div>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                {(['ag_iata', 'ag_biglietteria_aerea', 'ag_biglietteria_treno', 'ag_pacchetti', 'ag_mice'] as const).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={getCFBool(k)} onChange={e => setCF(k, e.target.checked)} className="w-4 h-4 rounded" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>{k.replace('ag_', '').replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isAllestimenti && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>DATI ALLESTIMENTI</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label style={labelStyle}>Tipologie (virgola)</label><input type="text" value={getCFArr('all_tipologie')} onChange={e => setCFArray('all_tipologie', e.target.value)} className={inputCls} style={inputStyle} placeholder="Stand, Strutture, Arredi, Floreale" /></div>
                <div><label style={labelStyle}>Budget minimo</label><input type="number" min={0} value={getCFNum('all_min_budget')} onChange={e => setCF('all_min_budget', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                {(['all_montaggio_incluso', 'all_noleggio', 'all_vendita', 'all_grafica_inclusa'] as const).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={getCFBool(k)} onChange={e => setCF(k, e.target.checked)} className="w-4 h-4 rounded" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>{k.replace('all_', '').replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {isExperience && (
            <div className="rounded-xl p-4 space-y-4" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>DATI ESPERIENZA</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div><label style={labelStyle}>Tipologia</label><input type="text" value={getCFStr('exp_tipologia')} onChange={e => setCF('exp_tipologia', e.target.value)} className={inputCls} style={inputStyle} placeholder="Team Building, Cooking..." /></div>
                <div><label style={labelStyle}>Min pax</label><input type="number" min={0} value={getCFNum('exp_min_pax')} onChange={e => setCF('exp_min_pax', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
                <div><label style={labelStyle}>Max pax</label><input type="number" min={0} value={getCFNum('exp_max_pax')} onChange={e => setCF('exp_max_pax', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
                <div><label style={labelStyle}>Durata (min)</label><input type="number" min={0} value={getCFNum('exp_durata_minuti')} onChange={e => setCF('exp_durata_minuti', e.target.value ? Number(e.target.value) : '')} className={inputCls} style={inputStyle} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label style={labelStyle}>Lingue (virgola)</label><input type="text" value={getCFArr('exp_lingue')} onChange={e => setCFArray('exp_lingue', e.target.value)} className={inputCls} style={inputStyle} placeholder="IT, EN" /></div>
                <div><label style={labelStyle}>Stagionalita (virgola)</label><input type="text" value={getCFArr('exp_stagionalita')} onChange={e => setCFArray('exp_stagionalita', e.target.value)} className={inputCls} style={inputStyle} placeholder="Primavera, Estate" /></div>
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                {(['exp_outdoor', 'exp_indoor'] as const).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={getCFBool(k)} onChange={e => setCF(k, e.target.checked)} className="w-4 h-4 rounded" />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text)' }}>{k.replace('exp_', '').replace(/_/g, ' ')}</span>
                  </label>
                ))}
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

// ─── Category Chip ──────────────────────────────────────────────────────────

function CategoryChip({ label, active, count, icon: Icon, onClick }: {
  label: string; active: boolean; count: number; icon?: React.ElementType; onClick: () => void
}) {
  const ChipIcon = Icon ?? MoreHorizontal
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 flex-shrink-0 transition-all"
      style={{
        padding: '6px 14px',
        borderRadius: '99px',
        background: active ? 'var(--red2)' : 'var(--panel2)',
        color: active ? 'white' : 'var(--text)',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}>
      <ChipIcon className="w-3 h-3" />
      <span>{label}</span>
      <span style={{ opacity: 0.7, fontSize: '10px' }}>{count}</span>
    </button>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Fornitori() {
  loadUser()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [supplierList, setSupplierList] = useState<Supplier[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>(undefined)
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const chipsRef = useRef<HTMLDivElement>(null)

  // URL-driven filters
  const activeCat = searchParams.get('cat') || ''
  const luogoSearch = searchParams.get('luogo') || ''

  const setActiveCat = useCallback((cat: string) => {
    const next = new URLSearchParams(searchParams)
    if (cat) next.set('cat', cat)
    else next.delete('cat')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const setLuogoSearch = useCallback((val: string) => {
    const next = new URLSearchParams(searchParams)
    if (val) next.set('luogo', val)
    else next.delete('luogo')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const loadData = useCallback(async () => {
    try {
      const sups = await fetchSuppliers()
      setSupplierList(sups)
    } catch (err) {
      showToast('Errore caricamento fornitori')
    } finally {
      setInitialLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadData() }, [loadData])
  useRealtimeTable('suppliers', loadData)

  useEffect(() => {
    const id = searchParams.get('id')
    if (id && supplierList.length > 0) {
      const found = supplierList.find(s => s.id === id)
      if (found) setSelected(found)
      const next = new URLSearchParams(searchParams)
      next.delete('id')
      setSearchParams(next, { replace: true })
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

  // ─── Category counts ────────────────────────────────────────────────────────

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

  // ─── Filtered & sorted list ─────────────────────────────────────────────────

  const filteredSuppliers = useMemo(() => {
    let list = supplierList

    // Category filter
    if (activeCat) {
      list = list.filter(s => {
        const cats = s.categorie?.length ? s.categorie : [s.categoria]
        return cats.some(c => matchesCategory(c, activeCat))
      })
    }

    // Location filter
    if (luogoSearch.trim()) {
      const luogoLower = luogoSearch.toLowerCase().trim()
      list = list.filter(s => {
        const fields = [s.city, s.region, s.province, s.location, s.country].filter(Boolean).join(' ').toLowerCase()
        return fields.includes(luogoLower)
      })
    }

    // Text search
    if (searchQuery.trim()) {
      const parsed = parseSearchQuery(searchQuery)
      list = list.filter(s => supplierMatchesSearch(s, parsed))
    }

    // Sort: rating desc, name asc
    list = [...list].sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating
      return a.nome.localeCompare(b.nome)
    })

    return list
  }, [supplierList, activeCat, luogoSearch, searchQuery])

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
      <div className="wire-card-flat" style={{ padding: '16px', marginBottom: '20px', borderRadius: 12, border: '1px solid var(--line)' }}>
        {/* Wire masthead */}
        <div className="wire-masthead" style={{ marginBottom: 0 }}>
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
        <div className="wire-ticker" style={{ marginTop: 8 }}>
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

        {/* Category chips */}
        <div ref={chipsRef} className="flex items-center gap-2"
          style={{ overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', paddingBottom: '4px', marginTop: 12 }}>
          <CategoryChip
            label="Tutti"
            active={!activeCat}
            count={supplierList.length}
            icon={Building2}
            onClick={() => setActiveCat('')}
          />
          {SUPPLIER_CATEGORIES.map(cat => {
            const count = categoryCounts[cat] ?? 0
            if (count === 0) return null
            return (
              <CategoryChip
                key={cat}
                label={cat}
                active={activeCat === cat}
                count={count}
                icon={CATEGORY_ICONS[cat]}
                onClick={() => setActiveCat(activeCat === cat ? '' : cat)}
              />
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        {/* Location search + text search row */}
        <div className="flex gap-2 flex-col sm:flex-row">
          {/* Location input */}
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              value={luogoSearch}
              onChange={e => setLuogoSearch(e.target.value)}
              placeholder="Cerca per città, regione..."
              className="w-full pl-9 pr-8 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
            />
            {luogoSearch && (
              <button onClick={() => setLuogoSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
              </button>
            )}
          </div>

          {/* Text search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Cerca nome, servizio, dettaglio..."
              className="w-full pl-9 pr-8 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
              </button>
            )}
          </div>
        </div>

        {/* Result counter */}
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          {filteredSuppliers.length} fornitor{filteredSuppliers.length !== 1 ? 'i' : 'e'}
          {(activeCat || luogoSearch || searchQuery) && ' filtrat' + (filteredSuppliers.length !== 1 ? 'i' : 'o')}
        </p>

        {/* Supplier grid */}
        {initialLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ borderRadius: 14, border: '1px solid var(--line)', padding: 16, background: 'var(--panel)' }}>
                {[80, 60, 40].map((w, j) => (
                  <div key={j} style={{ height: 12, width: `${w}%`, background: 'var(--line)', borderRadius: 6, marginBottom: 8, animation: 'shimmer 1.5s infinite' }} />
                ))}
              </div>
            ))}
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="p-10 text-center" style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: '14px', color: 'var(--muted)' }}>
            <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>Nessun fornitore trovato</p>
            {(activeCat || luogoSearch || searchQuery) && (
              <button onClick={() => { setActiveCat(''); setLuogoSearch(''); setSearchQuery('') }}
                className="mt-3 px-4 py-1.5 rounded-lg transition-all"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)', cursor: 'pointer' }}>
                RESETTA FILTRI
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSuppliers.map(sup => (
              <SupplierCard key={sup.id} supplier={sup} onClick={() => setSelected(sup)} />
            ))}
          </div>
        )}
      </div>

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
