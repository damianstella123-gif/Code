import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, MapPin, Globe, Star, FileText, Euro,
  Search, X, Plus, Edit3, Trash2, Save, Upload, Building2, Filter,
  Hotel, UtensilsCrossed, MapPinned, Sparkles, Bus, CookingPot,
  Speaker, PaintBucket, Users, MoreHorizontal, Camera, Video, Shield,
  Music, ChevronDown,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { fetchSuppliers, upsertSupplier, deleteSupplier as deleteSupplierRemote, updateSupplier } from '@/lib/suppliers-service'
import { fetchEvents } from '@/lib/events-service'
import { useRealtimeTable } from '@/lib/use-realtime'
import { supabase } from '@/lib/supabase'
import type { Supplier, SupplierDetails, SalaMeeting } from '@/data/suppliers'
import { SUPPLIER_CATEGORIES } from '@/data/suppliers'
import type { Event } from '@/data/events'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function matchesCategory(supplierCat: string, filterCat: string): boolean {
  const a = (supplierCat || '').toLowerCase().trim()
  const b = (filterCat || '').toLowerCase().trim()
  if (a === b) return true
  const aliases: Record<string, string[]> = {
    'hotel': ['hotel', 'hotels'],
    'ristorante': ['ristorante', 'ristoranti', 'ristorazione'],
    'audio video': ['audio video', 'audio/video', 'audiovideo', 'av'],
    'location': ['location', 'locations', 'venue'],
    'attività': ['attività', 'attivita', 'attività', 'team building', 'activities'],
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

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Hotel, Ristorante: UtensilsCrossed, Location: MapPinned,
  'Attività': Sparkles, Trasporti: Bus, Catering: CookingPot,
  'Audio Video': Speaker, Allestimenti: PaintBucket, Hostess: Users,
  Entertainment: Music, Fotografia: Camera, Video: Video, Sicurezza: Shield,
  Altro: MoreHorizontal,
}

// ─── Shared UI ───────────────────────────────────────────────────────────────

function InteractiveStars({ rating, onChange, size = 'sm' }: { rating: number; onChange?: (v: number) => void; size?: 'sm' | 'lg' }) {
  const w = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`${w} ${onChange ? 'cursor-pointer' : ''}`}
          fill={i <= Math.round(rating) ? 'var(--yellow)' : 'transparent'}
          style={{ color: i <= Math.round(rating) ? 'var(--yellow)' : 'var(--line)' }}
          onClick={() => onChange?.(i)} />
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

// ─── Category Detail Cards (Read-only) ───────────────────────────────────────

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
                  <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Scuola</th>
                  <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Cabaret</th>
                  <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Banchetto</th>
                  <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Cocktail</th>
                  <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Board</th>
                  <th className="text-center px-2 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Luce nat.</th>
                </tr>
              </thead>
              <tbody>
                {sale.map((s, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>{s.nome || `Sala ${i + 1}`}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.mq ?? '-'}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.teatro ?? '-'}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.scuola ?? '-'}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.cabaret ?? '-'}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.banchetto ?? '-'}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.cocktail ?? '-'}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.boardroom ?? '-'}</td>
                    <td className="text-center px-2 py-2" style={{ color: 'var(--text)' }}>{s.luce_naturale ? 'Si' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {d.contatti && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Contatti eventi</p>
          <InfoGrid items={[
            { label: 'Referente eventi', value: d.contatti.referente_eventi },
            { label: 'Ruolo', value: d.contatti.ruolo },
            { label: 'Email eventi', value: d.contatti.email_eventi },
            { label: 'Tel. eventi', value: d.contatti.telefono_eventi },
            { label: 'Cell. eventi', value: d.contatti.cellulare_eventi },
            { label: 'Ref. tecnico', value: d.contatti.referente_tecnico },
            { label: 'Email tecnica', value: d.contatti.email_tecnica },
          ]} />
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
        { label: 'Accessibile disabili', value: d.accessibile_disabili },
      ]} />
    </div>
  )
}

function AudioVideoCard({ d }: { d: SupplierDetails }) {
  return (
    <div className="space-y-3">
      <BoolGrid items={[
        { label: 'Audio', value: d.audio },
        { label: 'Video', value: d.video },
        { label: 'Luci', value: d.luci },
        { label: 'Ledwall', value: d.ledwall },
        { label: 'Streaming', value: d.streaming },
        { label: 'Regia', value: d.regia },
        { label: 'Traduzione simultanea', value: d.traduzione_simultanea },
        { label: 'Palco', value: d.palco },
        { label: 'Microfoni', value: d.microfoni },
        { label: 'Videoproiettori', value: d.videoproiettori },
        { label: 'Tecnici inclusi', value: d.tecnici_inclusi },
        { label: 'Sopralluogo', value: d.sopralluogo },
        { label: 'Disponibilita nazionale', value: d.disponibilita_nazionale },
      ]} />
      <InfoGrid items={[
        { label: 'Area copertura', value: d.area_copertura },
        { label: 'Magazzino', value: d.magazzino_citta },
        { label: 'Certificazioni', value: d.certificazioni },
        { label: 'Note tecniche', value: d.note_tecniche },
      ]} />
      {d.contatti && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          <InfoGrid items={[
            { label: 'Ref. tecnico', value: d.contatti.referente_tecnico },
            { label: 'Email tecnica', value: d.contatti.email_tecnica },
            { label: 'Tel. tecnico', value: d.contatti.telefono_tecnico },
          ]} />
        </div>
      )}
    </div>
  )
}

function LocationCard({ d }: { d: SupplierDetails }) {
  return (
    <div className="space-y-3">
      <InfoGrid items={[
        { label: 'Tipo', value: d.tipo_location },
        { label: 'Capienza max', value: d.capienza_massima },
        { label: 'Capienza cena', value: d.capienza_cena },
        { label: 'Capienza cocktail', value: d.capienza_cocktail },
        { label: 'mq totali', value: d.mq_totali },
        { label: 'Vincoli musica', value: d.vincoli_musica },
        { label: 'Orario limite', value: d.orario_limite },
      ]} />
      <BoolGrid items={[
        { label: 'Spazi interni', value: d.spazi_interni },
        { label: 'Spazi esterni', value: d.spazi_esterni },
        { label: 'Catering interno', value: d.catering_interno },
        { label: 'Catering esclusivo', value: d.catering_esclusivo },
      ]} />
    </div>
  )
}

function CateringCard({ d }: { d: SupplierDetails }) {
  return (
    <div className="space-y-3">
      <InfoGrid items={[
        { label: 'Tipologia servizi', value: d.tipologia_servizi },
        { label: 'N. max ospiti', value: d.numero_massimo_ospiti },
      ]} />
      <BoolGrid items={[
        { label: 'Coffee break', value: d.coffee_break },
        { label: 'Light lunch', value: d.light_lunch },
        { label: 'Cena servita', value: d.cena_servita },
        { label: 'Buffet', value: d.buffet },
        { label: 'Cocktail', value: d.cocktail },
        { label: 'Banqueting', value: d.banqueting },
        { label: 'Cucina interna', value: d.cucina_interna },
        { label: 'Attrezzature incluse', value: d.attrezzature_incluse },
        { label: 'Personale incluso', value: d.personale_incluso },
        { label: 'Intolleranze', value: d.intolleranze },
        { label: 'Vegano', value: d.vegano },
        { label: 'Vegetariano', value: d.vegetariano },
        { label: 'Kosher', value: d.kosher },
        { label: 'Halal', value: d.halal },
      ]} />
    </div>
  )
}

function GenericCard({ d }: { d: SupplierDetails }) {
  const entries = Object.entries(d).filter(([k, v]) =>
    v !== undefined && v !== '' && v !== null && v !== false &&
    k !== 'contatti' && k !== 'sale_meeting' && k !== 'servizi_hotel' && k !== 'documenti'
  )
  if (!entries.length) return <p className="text-xs" style={{ color: 'var(--muted)' }}>Nessun dettaglio compilato.</p>
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {entries.map(([k, v]) => (
        <div key={k}>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{k.replace(/_/g, ' ')}</p>
          <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text)' }}>{typeof v === 'boolean' ? 'Si' : String(v)}</p>
        </div>
      ))}
    </div>
  )
}

function getCategoryCard(cat: string) {
  const norm = normalizeCategory(cat)
  switch (norm) {
    case 'Hotel': return HotelCard
    case 'Ristorante': return RistoranteCard
    case 'Audio Video': return AudioVideoCard
    case 'Location': return LocationCard
    case 'Catering': return CateringCard
    default: return GenericCard
  }
}

// ─── Category Edit Fields ────────────────────────────────────────────────────

function HotelFields({ details, onChange }: { details: SupplierDetails; onChange: (d: SupplierDetails) => void }) {
  const upd = (k: string, v: unknown) => onChange({ ...details, [k]: v })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <FormField label="Catena" value={details.catena ?? ''} onChange={v => upd('catena', v)} />
      <FormField label="Stelle" value={String(details.stelle ?? '')} onChange={v => upd('stelle', parseInt(v) || undefined)} type="number" />
      <FormField label="N. Camere" value={String(details.numero_camere ?? '')} onChange={v => upd('numero_camere', parseInt(v) || undefined)} type="number" />
      <FormField label="N. Sale meeting" value={String(details.numero_sale_meeting ?? '')} onChange={v => upd('numero_sale_meeting', parseInt(v) || undefined)} type="number" />
      <FormField label="Cap. sala max" value={String(details.capienza_sala_massima ?? '')} onChange={v => upd('capienza_sala_massima', parseInt(v) || undefined)} type="number" />
      <FormCheck label="Ristorante interno" checked={!!details.ristorante_interno} onChange={v => upd('ristorante_interno', v)} />
      <FormCheck label="Parcheggio" checked={!!details.parcheggio} onChange={v => upd('parcheggio', v)} />
      <FormCheck label="Parcheggio bus" checked={!!details.parcheggio_bus} onChange={v => upd('parcheggio_bus', v)} />
    </div>
  )
}

function RistoranteFields({ details, onChange }: { details: SupplierDetails; onChange: (d: SupplierDetails) => void }) {
  const upd = (k: string, v: unknown) => onChange({ ...details, [k]: v })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <FormField label="Tipo cucina" value={details.tipo_cucina ?? ''} onChange={v => upd('tipo_cucina', v)} />
      <FormField label="N. Sale" value={String(details.numero_sale ?? '')} onChange={v => upd('numero_sale', parseInt(v) || undefined)} type="number" />
      <FormField label="Capienza interna" value={String(details.capienza_interna ?? '')} onChange={v => upd('capienza_interna', parseInt(v) || undefined)} type="number" />
      <FormField label="Capienza esterna" value={String(details.capienza_esterna ?? '')} onChange={v => upd('capienza_esterna', parseInt(v) || undefined)} type="number" />
      <FormCheck label="Dehors" checked={!!details.dehors} onChange={v => upd('dehors', v)} />
      <FormCheck label="Terrazza" checked={!!details.terrazza} onChange={v => upd('terrazza', v)} />
      <FormCheck label="Menu eventi" checked={!!details.menu_eventi} onChange={v => upd('menu_eventi', v)} />
      <FormCheck label="Adatto gruppi" checked={!!details.adatto_gruppi} onChange={v => upd('adatto_gruppi', v)} />
    </div>
  )
}

function AudioVideoFields({ details, onChange }: { details: SupplierDetails; onChange: (d: SupplierDetails) => void }) {
  const upd = (k: string, v: unknown) => onChange({ ...details, [k]: v })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <FormCheck label="Audio" checked={!!details.audio} onChange={v => upd('audio', v)} />
      <FormCheck label="Video" checked={!!details.video} onChange={v => upd('video', v)} />
      <FormCheck label="Luci" checked={!!details.luci} onChange={v => upd('luci', v)} />
      <FormCheck label="Ledwall" checked={!!details.ledwall} onChange={v => upd('ledwall', v)} />
      <FormCheck label="Streaming" checked={!!details.streaming} onChange={v => upd('streaming', v)} />
      <FormCheck label="Regia" checked={!!details.regia} onChange={v => upd('regia', v)} />
      <FormCheck label="Tecnici inclusi" checked={!!details.tecnici_inclusi} onChange={v => upd('tecnici_inclusi', v)} />
      <FormField label="Area copertura" value={details.area_copertura ?? ''} onChange={v => upd('area_copertura', v)} />
      <FormField label="Magazzino citta" value={details.magazzino_citta ?? ''} onChange={v => upd('magazzino_citta', v)} />
    </div>
  )
}

function LocationFields({ details, onChange }: { details: SupplierDetails; onChange: (d: SupplierDetails) => void }) {
  const upd = (k: string, v: unknown) => onChange({ ...details, [k]: v })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <FormField label="Tipo location" value={details.tipo_location ?? ''} onChange={v => upd('tipo_location', v)} />
      <FormField label="Capienza max" value={String(details.capienza_massima ?? '')} onChange={v => upd('capienza_massima', parseInt(v) || undefined)} type="number" />
      <FormField label="Capienza cena" value={String(details.capienza_cena ?? '')} onChange={v => upd('capienza_cena', parseInt(v) || undefined)} type="number" />
      <FormField label="Capienza cocktail" value={String(details.capienza_cocktail ?? '')} onChange={v => upd('capienza_cocktail', parseInt(v) || undefined)} type="number" />
      <FormField label="mq totali" value={String(details.mq_totali ?? '')} onChange={v => upd('mq_totali', parseInt(v) || undefined)} type="number" />
      <FormCheck label="Spazi interni" checked={!!details.spazi_interni} onChange={v => upd('spazi_interni', v)} />
      <FormCheck label="Spazi esterni" checked={!!details.spazi_esterni} onChange={v => upd('spazi_esterni', v)} />
      <FormCheck label="Catering interno" checked={!!details.catering_interno} onChange={v => upd('catering_interno', v)} />
    </div>
  )
}

function CateringFields({ details, onChange }: { details: SupplierDetails; onChange: (d: SupplierDetails) => void }) {
  const upd = (k: string, v: unknown) => onChange({ ...details, [k]: v })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <FormField label="Tipologia servizi" value={details.tipologia_servizi ?? ''} onChange={v => upd('tipologia_servizi', v)} />
      <FormField label="N. max ospiti" value={String(details.numero_massimo_ospiti ?? '')} onChange={v => upd('numero_massimo_ospiti', parseInt(v) || undefined)} type="number" />
      <FormCheck label="Coffee break" checked={!!details.coffee_break} onChange={v => upd('coffee_break', v)} />
      <FormCheck label="Light lunch" checked={!!details.light_lunch} onChange={v => upd('light_lunch', v)} />
      <FormCheck label="Cena servita" checked={!!details.cena_servita} onChange={v => upd('cena_servita', v)} />
      <FormCheck label="Buffet" checked={!!details.buffet} onChange={v => upd('buffet', v)} />
      <FormCheck label="Vegano" checked={!!details.vegano} onChange={v => upd('vegano', v)} />
      <FormCheck label="Halal" checked={!!details.halal} onChange={v => upd('halal', v)} />
    </div>
  )
}

function FormField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-xs"
        style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }} />
    </div>
  )
}

function FormCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} id={`chk_${label.replace(/\s/g, '_')}`} />
      <label htmlFor={`chk_${label.replace(/\s/g, '_')}`} className="text-xs" style={{ color: 'var(--text)' }}>{label}</label>
    </div>
  )
}

function getCategoryEditFields(cat: string) {
  const norm = normalizeCategory(cat)
  switch (norm) {
    case 'Hotel': return HotelFields
    case 'Ristorante': return RistoranteFields
    case 'Audio Video': return AudioVideoFields
    case 'Location': return LocationFields
    case 'Catering': return CateringFields
    default: return null
  }
}

// ─── Supplier Detail ─────────────────────────────────────────────────────────

function SupplierDetail({ supplier, onBack, onEdit, onDelete, onSave }: {
  supplier: Supplier
  onBack: () => void; onEdit: () => void; onDelete: () => void
  onSave: (s: Supplier) => void
}) {
  const [rating, setRating] = useState(supplier.rating)
  const [notes, setNotes] = useState(supplier.noteOperative)
  const [details, setDetails] = useState<SupplierDetails>(supplier.details ?? {})
  const [editingNotes, setEditingNotes] = useState(false)
  const [editingDetails, setEditingDetails] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const DetailCard = getCategoryCard(supplier.categoria)
  const DetailEditForm = getCategoryEditFields(supplier.categoria)

  async function handleRating(v: number) {
    setRating(v)
    await updateSupplier(supplier.id, { rating: v } as Partial<Supplier>)
  }

  async function saveNotes() {
    setEditingNotes(false)
    const updated = { ...supplier, noteOperative: notes }
    onSave(updated)
  }

  async function saveDetails() {
    setEditingDetails(false)
    await supabase.from('suppliers').update({ details }).eq('id', supplier.id)
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
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="w-4 h-4" /> Tutti i fornitori
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ border: '1px solid var(--line)', color: 'var(--muted)' }}>
            <Edit3 className="w-3.5 h-3.5" /> Modifica
          </button>
          <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ border: '1px solid var(--line)', color: 'var(--red2)' }}>
            <Trash2 className="w-3.5 h-3.5" /> Elimina
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="panel p-6">
        <div className="flex flex-col sm:flex-row items-start gap-5">
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
                style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>{normalizeCategory(supplier.categoria)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              {(geoLine || supplier.location) && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{geoLine || supplier.location}</span>}
              {supplier.telefono && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{supplier.telefono}</span>}
              {supplier.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{supplier.email}</span>}
              {supplier.sito && <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" />{supplier.sito}</span>}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <InteractiveStars rating={rating} onChange={handleRating} size="lg" />
              <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{rating}/5</span>
            </div>
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniCard icon={Building2} label="Referente" value={supplier.referente || '-'} />
        <MiniCard icon={Phone} label="Tel. Referente" value={supplier.referenteTelefono || '-'} />
        <MiniCard icon={FileText} label="P.IVA" value={supplier.piva || '-'} />
        <MiniCard icon={Euro} label="Costo medio" value={supplier.costoMedioPerEvento ? `${supplier.costoMedioPerEvento.toLocaleString('it-IT')} EUR` : '-'} />
      </div>

      {/* Category-specific details */}
      <DetailSection title={`Scheda ${normalizeCategory(supplier.categoria)}`}>
        <div className="flex items-center justify-end mb-3 -mt-8">
          {!editingDetails ? (
            <button onClick={() => setEditingDetails(true)} className="text-xs font-medium px-3 py-1 rounded-lg"
              style={{ color: 'var(--red2)', border: '1px solid var(--line)' }}>
              <Edit3 className="w-3 h-3 inline mr-1" />Modifica
            </button>
          ) : (
            <button onClick={saveDetails} className="text-xs font-medium px-3 py-1 rounded-lg text-white"
              style={{ background: 'var(--red2)' }}>
              <Save className="w-3 h-3 inline mr-1" />Salva
            </button>
          )}
        </div>
        {editingDetails && DetailEditForm ? (
          <DetailEditForm details={details} onChange={setDetails} />
        ) : (
          <DetailCard d={details} />
        )}
      </DetailSection>

      {/* Note operative */}
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

      {/* Services */}
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

// ─── Form Modal ──────────────────────────────────────────────────────────────

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
  const [servizi, setServizi] = useState(supplier?.servizi?.join(', ') ?? '')
  const [noteOperative, setNoteOperative] = useState(supplier?.noteOperative ?? '')
  const [city, setCity] = useState(supplier?.city ?? '')
  const [province, setProvince] = useState(supplier?.province ?? '')
  const [region, setRegion] = useState(supplier?.region ?? '')
  const [country, setCountry] = useState(supplier?.country ?? 'Italia')
  const [address, setAddress] = useState(supplier?.address ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    const updated: Supplier = {
      id: supplier?.id ?? `sup_${Date.now()}`,
      nome: nome.trim(),
      email: email.trim(),
      telefono: telefono.trim(),
      categoria: categoria.trim() || 'Altro',
      referente: referente.trim(),
      referenteTelefono: referenteTelefono.trim(),
      rating: supplier?.rating ?? 0,
      stato,
      statoContratto: supplier?.statoContratto ?? 'attivo',
      scadenzaContratto: supplier?.scadenzaContratto ?? '',
      servizi: servizi.split(',').map(s => s.trim()).filter(Boolean),
      location: location.trim(),
      sito: sito.trim(),
      costoMedioPerEvento: supplier?.costoMedioPerEvento ?? 0,
      costoMinimo: supplier?.costoMinimo ?? 0,
      costoMassimo: supplier?.costoMassimo ?? 0,
      noteOperative: noteOperative.trim(),
      eventiId: supplier?.eventiId ?? [],
      documenti: supplier?.documenti ?? [],
      recensioni: supplier?.recensioni ?? [],
      piva: piva.trim(),
      logoUrl: supplier?.logoUrl,
      details: supplier?.details,
      city: city.trim(),
      province: province.trim(),
      region: region.trim(),
      country: country.trim(),
      address: address.trim(),
      latitude: supplier?.latitude,
      longitude: supplier?.longitude,
    }
    onSave(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
            {supplier ? 'Modifica Fornitore' : 'Nuovo Fornitore'}
          </h2>
          <button onClick={onCancel} className="p-2 rounded-lg transition-all hover:bg-white/5">
            <X className="w-5 h-5" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Nome azienda *</label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="">-- Seleziona --</option>
                {SUPPLIER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Telefono</label>
              <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Referente</label>
              <input type="text" value={referente} onChange={e => setReferente(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Tel. referente</label>
              <input type="text" value={referenteTelefono} onChange={e => setReferenteTelefono(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          {/* Geo fields */}
          <div className="pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text)' }}>Localizzazione</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Citta</label>
                <input type="text" value={city} onChange={e => setCity(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Provincia</label>
                <input type="text" value={province} onChange={e => setProvince(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Regione</label>
                <input type="text" value={region} onChange={e => setRegion(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Paese</label>
                <input type="text" value={country} onChange={e => setCountry(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Indirizzo</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Location (legacy)</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Sito web</label>
              <input type="text" value={sito} onChange={e => setSito(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>P.IVA</label>
              <input type="text" value={piva} onChange={e => setPiva(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Stato</label>
              <select value={stato} onChange={e => setStato(e.target.value as 'attivo' | 'inattivo')}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                <option value="attivo">Attivo</option>
                <option value="inattivo">Inattivo</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Servizi (separati da virgola)</label>
            <input type="text" value={servizi} onChange={e => setServizi(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }}
              placeholder="Es. Impianti audio, Video proiezione, Illuminazione" />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Note operative</label>
            <textarea value={noteOperative} onChange={e => setNoteOperative(e.target.value)} rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
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

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Fornitori() {
  loadUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const [supplierList, setSupplierList] = useState<Supplier[]>([])
  const [_eventsList, setEventsList] = useState<Event[]>([])
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>(undefined)
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null)
  const [showGeoFilters, setShowGeoFilters] = useState(false)

  // Geo filters
  const [filterRegion, setFilterRegion] = useState('')
  const [filterProvince, setFilterProvince] = useState('')
  const [filterCity, setFilterCity] = useState('')
  const [filterMinRating, setFilterMinRating] = useState(0)

  const loadData = useCallback(async () => {
    const [sups, evs] = await Promise.all([fetchSuppliers(), fetchEvents()])
    setSupplierList(sups)
    setEventsList(evs)
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useRealtimeTable('suppliers', loadData)

  useEffect(() => {
    const id = searchParams.get('id')
    if (id && supplierList.length > 0) {
      const found = supplierList.find(s => s.id === id)
      if (found) { setSelected(found); setActiveCategory(normalizeCategory(found.categoria)) }
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, supplierList, setSearchParams])

  // Derive geo options from data
  const geoOptions = useMemo(() => {
    const regions = new Set<string>()
    const provinces = new Set<string>()
    const cities = new Set<string>()
    for (const s of supplierList) {
      if (s.region) regions.add(s.region)
      if (s.province) provinces.add(s.province)
      if (s.city) cities.add(s.city)
    }
    return {
      regions: [...regions].sort(),
      provinces: [...provinces].sort(),
      cities: [...cities].sort(),
    }
  }, [supplierList])

  async function handleSave(s: Supplier) {
    await upsertSupplier(s)
    await loadData()
    if (selected?.id === s.id) setSelected(s)
    setShowForm(false)
    setEditingSupplier(undefined)
  }

  async function handleDelete() {
    if (!deletingSupplier) return
    await deleteSupplierRemote(deletingSupplier.id)
    await loadData()
    setSelected(null)
    setDeletingSupplier(null)
  }

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of supplierList) {
      const c = normalizeCategory(s.categoria)
      map[c] = (map[c] || 0) + 1
    }
    return map
  }, [supplierList])

  const filtered = useMemo(() => {
    let list = supplierList
    if (activeCategory && activeCategory !== '__all__') {
      list = list.filter(s => matchesCategory(s.categoria, activeCategory))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.nome.toLowerCase().includes(q) ||
        (s.location || '').toLowerCase().includes(q) ||
        (s.referente || '').toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q) ||
        (s.province || '').toLowerCase().includes(q) ||
        (s.region || '').toLowerCase().includes(q)
      )
    }
    if (filterRegion) list = list.filter(s => s.region === filterRegion)
    if (filterProvince) list = list.filter(s => s.province === filterProvince)
    if (filterCity) list = list.filter(s => s.city === filterCity || (s.location || '').toLowerCase().includes(filterCity.toLowerCase()))
    if (filterMinRating > 0) list = list.filter(s => s.rating >= filterMinRating)
    return list
  }, [supplierList, activeCategory, search, filterRegion, filterProvince, filterCity, filterMinRating])

  // ─── Detail View ─────────────────────────────────────────────────────────────
  if (selected) {
    const live = supplierList.find(s => s.id === selected.id) ?? selected
    return (
      <SupplierDetail
        supplier={live}
        onBack={() => setSelected(null)}
        onEdit={() => { setEditingSupplier(live); setShowForm(true) }}
        onDelete={() => setDeletingSupplier(live)}
        onSave={handleSave}
      />
    )
  }

  // ─── Category Tiles (landing) ─────────────────────────────────────────────────
  if (!activeCategory) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Fornitori</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {supplierList.length} fornitori nel database MICE
            </p>
          </div>
          <button onClick={() => { setEditingSupplier(undefined); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
            <Plus className="w-4 h-4" /> Nuovo Fornitore
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {SUPPLIER_CATEGORIES.map(cat => {
            const Icon = CATEGORY_ICONS[cat] ?? MoreHorizontal
            const count = categoryCounts[cat] ?? 0
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)}
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

        {/* Quick search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); if (e.target.value) setActiveCategory('__all__') }}
            placeholder="Cerca in tutti i fornitori..."
            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
        </div>

        {showForm && <SupplierFormModal supplier={editingSupplier} onSave={handleSave} onCancel={() => { setShowForm(false); setEditingSupplier(undefined) }} />}
      </div>
    )
  }

  // ─── Supplier List (category selected) ─────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setActiveCategory(null); setSearch(''); setFilterRegion(''); setFilterProvince(''); setFilterCity(''); setFilterMinRating(0) }}
            className="p-2 rounded-lg transition-all hover:bg-white/5"
            style={{ border: '1px solid var(--line)' }}>
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
              {activeCategory === '__all__' ? 'Tutti i Fornitori' : activeCategory}
            </h1>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{filtered.length} risultati</p>
          </div>
        </div>
        <button onClick={() => { setEditingSupplier(undefined); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
          <Plus className="w-4 h-4" /> Nuovo
        </button>
      </div>

      {/* Search + Geo Filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cerca nome, citta, referente..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
          <button onClick={() => setShowGeoFilters(!showGeoFilters)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium"
            style={{ background: showGeoFilters ? 'rgba(208,0,58,0.1)' : 'var(--panel)', color: showGeoFilters ? 'var(--red2)' : 'var(--muted)', border: '1px solid var(--line)' }}>
            <Filter className="w-3.5 h-3.5" /> Filtri geo
            <ChevronDown className={`w-3 h-3 transition-transform ${showGeoFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {showGeoFilters && (
          <div className="panel p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in">
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Regione</label>
              <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
                <option value="">Tutte</option>
                {geoOptions.regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Provincia</label>
              <select value={filterProvince} onChange={e => setFilterProvince(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
                <option value="">Tutte</option>
                {geoOptions.provinces.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Citta</label>
              <select value={filterCity} onChange={e => setFilterCity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
                <option value="">Tutte</option>
                {geoOptions.cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>Rating min.</label>
              <select value={filterMinRating} onChange={e => setFilterMinRating(parseInt(e.target.value))}
                className="w-full px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}>
                <option value="0">Tutti</option>
                <option value="3">3+</option>
                <option value="4">4+</option>
                <option value="5">5</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun fornitore trovato</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(sup => {
            const geoLine = [sup.city, sup.province].filter(Boolean).join(', ')
            return (
              <div key={sup.id} onClick={() => setSelected(sup)}
                className="panel p-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
                style={{ border: '1px solid var(--line)' }}>
                <div className="flex items-start gap-3 mb-3">
                  <SupplierLogo supplier={sup} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{sup.nome}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                      {geoLine || sup.location || normalizeCategory(sup.categoria)}
                    </p>
                  </div>
                  {sup.stato === 'inattivo' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(255,49,95,0.1)', color: 'var(--red2)' }}>Inattivo</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <InteractiveStars rating={sup.rating} size="sm" />
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--muted)' }}>
                    {sup.details?.numero_camere && <span>{sup.details.numero_camere} camere</span>}
                    {sup.details?.capienza_massima && <span>cap. {sup.details.capienza_massima}</span>}
                    {sup.details?.capienza_totale && <span>{sup.details.capienza_totale} coperti</span>}
                    {sup.details?.numero_sale_meeting && <span>{sup.details.numero_sale_meeting} sale</span>}
                  </div>
                </div>
                {sup.servizi.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {sup.servizi.slice(0, 3).map(s => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>{s}</span>
                    ))}
                    {sup.servizi.length > 3 && <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>+{sup.servizi.length - 3}</span>}
                  </div>
                )}
              </div>
            )
          })}
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
