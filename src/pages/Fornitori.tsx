import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, MapPin, Globe, Star, FileText, Euro,
  Search, X, Plus, Edit3, Trash2, Save, Upload, Building2,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import { fetchSuppliers, upsertSupplier, deleteSupplier as deleteSupplierRemote, updateSupplier } from '@/lib/suppliers-service'
import { fetchEvents } from '@/lib/events-service'
import { useRealtimeTable } from '@/lib/use-realtime'
import { supabase } from '@/lib/supabase'
import type { Supplier, SupplierDetails, SupplierCategory } from '@/data/suppliers'
import { SUPPLIER_CATEGORIES } from '@/data/suppliers'
import type { Event } from '@/data/events'

const ALL_FILTER = 'Tutte'

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
    return (
      <img src={supplier.logoUrl} alt={supplier.nome}
        className="rounded-xl object-cover" style={{ width: size, height: size }} />
    )
  }
  return (
    <div className="rounded-xl flex items-center justify-center text-white font-bold"
      style={{ width: size, height: size, background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', fontSize: size * 0.35 }}>
      {initials}
    </div>
  )
}

// ─── Category Detail Forms ───────────────────────────────────────────────────

function HotelFields({ details, onChange }: { details: SupplierDetails; onChange: (d: SupplierDetails) => void }) {
  const upd = (k: keyof SupplierDetails, v: unknown) => onChange({ ...details, [k]: v })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="Citta" value={details.citta ?? ''} onChange={v => upd('citta', v)} />
      <Field label="Catena" value={details.catena ?? ''} onChange={v => upd('catena', v)} />
      <Field label="N. Camere" value={String(details.numero_camere ?? '')} onChange={v => upd('numero_camere', parseInt(v) || undefined)} type="number" />
      <Field label="N. Sale meeting" value={String(details.numero_sale_meeting ?? '')} onChange={v => upd('numero_sale_meeting', parseInt(v) || undefined)} type="number" />
      <Field label="Capienza sale" value={String(details.capienza_sale ?? '')} onChange={v => upd('capienza_sale', parseInt(v) || undefined)} type="number" />
      <Check label="Ristorante interno" checked={!!details.ristorante_interno} onChange={v => upd('ristorante_interno', v)} />
      <Check label="Parcheggio" checked={!!details.parcheggio} onChange={v => upd('parcheggio', v)} />
    </div>
  )
}

function RistorantiFields({ details, onChange }: { details: SupplierDetails; onChange: (d: SupplierDetails) => void }) {
  const upd = (k: keyof SupplierDetails, v: unknown) => onChange({ ...details, [k]: v })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="Citta" value={details.citta ?? ''} onChange={v => upd('citta', v)} />
      <Field label="Tipologia cucina" value={details.tipologia_cucina ?? ''} onChange={v => upd('tipologia_cucina', v)} />
      <Field label="Coperti totali" value={String(details.coperti_totali ?? '')} onChange={v => upd('coperti_totali', parseInt(v) || undefined)} type="number" />
      <Check label="Indoor" checked={!!details.indoor} onChange={v => upd('indoor', v)} />
      <Check label="Dehor" checked={!!details.dehor} onChange={v => upd('dehor', v)} />
      <Check label="Terrazza" checked={!!details.terrazza} onChange={v => upd('terrazza', v)} />
      <Check label="Sala privata" checked={!!details.sala_privata} onChange={v => upd('sala_privata', v)} />
      <Check label="Esclusiva" checked={!!details.esclusiva} onChange={v => upd('esclusiva', v)} />
    </div>
  )
}

function LocationFields({ details, onChange }: { details: SupplierDetails; onChange: (d: SupplierDetails) => void }) {
  const upd = (k: keyof SupplierDetails, v: unknown) => onChange({ ...details, [k]: v })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="Citta" value={details.citta ?? ''} onChange={v => upd('citta', v)} />
      <Field label="Capienza" value={String(details.capienza ?? '')} onChange={v => upd('capienza', parseInt(v) || undefined)} type="number" />
      <Check label="Indoor" checked={!!details.indoor} onChange={v => upd('indoor', v)} />
      <Check label="Outdoor" checked={!!details.outdoor} onChange={v => upd('outdoor', v)} />
      <Check label="Parcheggio" checked={!!details.parcheggio} onChange={v => upd('parcheggio', v)} />
    </div>
  )
}

function AttivitaFields({ details, onChange }: { details: SupplierDetails; onChange: (d: SupplierDetails) => void }) {
  const upd = (k: keyof SupplierDetails, v: unknown) => onChange({ ...details, [k]: v })
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field label="Citta" value={details.citta ?? ''} onChange={v => upd('citta', v)} />
      <Field label="Tipologia attivita" value={details.tipologia_attivita ?? ''} onChange={v => upd('tipologia_attivita', v)} />
      <Field label="Capienza" value={String(details.capienza ?? '')} onChange={v => upd('capienza', parseInt(v) || undefined)} type="number" />
      <Field label="Durata" value={details.durata ?? ''} onChange={v => upd('durata', v)} />
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-xs"
        style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }} />
    </div>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        id={`chk_${label.replace(/\s/g, '_')}`} />
      <label htmlFor={`chk_${label.replace(/\s/g, '_')}`} className="text-xs" style={{ color: 'var(--text)' }}>{label}</label>
    </div>
  )
}

function getCategoryDetailsComponent(cat: string) {
  const norm = cat.toLowerCase()
  if (norm === 'hotel') return HotelFields
  if (norm === 'ristoranti' || norm === 'ristorante') return RistorantiFields
  if (norm === 'location' || norm.includes('location')) return LocationFields
  if (norm === 'attività' || norm === 'attivita' || norm.includes('attivit')) return AttivitaFields
  return null
}

// ─── Supplier Detail ─────────────────────────────────────────────────────────

function SupplierDetail({ supplier, onBack, onEdit, onDelete, onSave }: {
  supplier: Supplier; events: Event[]
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

  const DetailForm = getCategoryDetailsComponent(supplier.categoria)

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

      {/* Header Card */}
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
                style={{ background: 'rgba(208,0,58,0.1)', color: 'var(--red2)' }}>{supplier.categoria}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              {supplier.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{supplier.location}</span>}
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
        <MiniCard icon={Euro} label="Costo medio" value={supplier.costoMedioPerEvento ? `€${supplier.costoMedioPerEvento.toLocaleString('it-IT')}` : '-'} />
      </div>

      {/* Category-specific details */}
      {DetailForm && (
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Scheda {supplier.categoria}</p>
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
          {editingDetails ? (
            <DetailForm details={details} onChange={setDetails} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(details).filter(([, v]) => v !== undefined && v !== '' && v !== null && v !== false).map(([k, v]) => (
                <div key={k}>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{k.replace(/_/g, ' ')}</p>
                  <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text)' }}>{typeof v === 'boolean' ? 'Si' : String(v)}</p>
                </div>
              ))}
              {Object.keys(details).filter(k => details[k as keyof SupplierDetails] !== undefined && details[k as keyof SupplierDetails] !== '' && details[k as keyof SupplierDetails] !== null && details[k as keyof SupplierDetails] !== false).length === 0 && (
                <p className="text-xs col-span-full" style={{ color: 'var(--muted)' }}>Nessun dettaglio compilato. Clicca Modifica per aggiungere informazioni.</p>
              )}
            </div>
          )}
        </div>
      )}

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

function MiniCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="panel p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(208,0,58,0.08)' }}>
        <Icon className="w-4 h-4" style={{ color: 'var(--red2)' }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</p>
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{value}</p>
      </div>
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !email.trim()) return
    const updated: Supplier = {
      id: supplier?.id ?? `sup_${Date.now()}`,
      nome: nome.trim(),
      email: email.trim(),
      telefono: telefono.trim(),
      categoria: categoria.trim(),
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
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Categoria *</label>
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
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Location / Citta</label>
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
  const [eventsList, setEventsList] = useState<Event[]>([])
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState(ALL_FILTER)
  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>(undefined)
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null)

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
      if (found) setSelected(found)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, supplierList, setSearchParams])

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

  const categories = useMemo(() => {
    const cats = new Set(supplierList.map(s => s.categoria).filter(Boolean))
    return [ALL_FILTER, ...SUPPLIER_CATEGORIES.filter(c => cats.has(c)), ...[...cats].filter(c => !SUPPLIER_CATEGORIES.includes(c as SupplierCategory))]
  }, [supplierList])

  const filtered = useMemo(() => {
    let list = supplierList
    if (filterCategoria !== ALL_FILTER) {
      list = list.filter(s => s.categoria === filterCategoria)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.nome.toLowerCase().includes(q) ||
        s.categoria.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q) ||
        s.referente.toLowerCase().includes(q)
      )
    }
    return list
  }, [supplierList, filterCategoria, search])

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of supplierList) {
      const c = s.categoria || 'Varie'
      map[c] = (map[c] || 0) + 1
    }
    return map
  }, [supplierList])

  if (selected) {
    const live = supplierList.find(s => s.id === selected.id) ?? selected
    return (
      <SupplierDetail
        supplier={live}
        events={eventsList}
        onBack={() => setSelected(null)}
        onEdit={() => { setEditingSupplier(live); setShowForm(true) }}
        onDelete={() => setDeletingSupplier(live)}
        onSave={handleSave}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Fornitori</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {supplierList.length} fornitori · Knowledge Base aziendale
          </p>
        </div>
        <button onClick={() => { setEditingSupplier(undefined); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
          <Plus className="w-4 h-4" /> Nuovo Fornitore
        </button>
      </div>

      {/* Category navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilterCategoria(cat)}
            className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
            style={{
              background: filterCategoria === cat ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'var(--panel)',
              color: filterCategoria === cat ? 'white' : 'var(--muted)',
              border: `1px solid ${filterCategoria === cat ? 'transparent' : 'var(--line)'}`,
            }}>
            {cat} {cat !== ALL_FILTER && categoryCounts[cat] ? `(${categoryCounts[cat]})` : cat === ALL_FILTER ? `(${supplierList.length})` : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cerca fornitore..."
          className="w-full pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)' }} />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        )}
      </div>

      {/* Supplier Grid */}
      {filtered.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Nessun fornitore trovato</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(sup => (
            <div key={sup.id} onClick={() => setSelected(sup)}
              className="panel p-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ border: '1px solid var(--line)' }}>
              <div className="flex items-start gap-3 mb-3">
                <SupplierLogo supplier={sup} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{sup.nome}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{sup.categoria}</p>
                </div>
                {sup.stato === 'inattivo' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(255,49,95,0.1)', color: 'var(--red2)' }}>Inattivo</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <InteractiveStars rating={sup.rating} size="sm" />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{sup.location}</span>
              </div>
              {sup.servizi.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {sup.servizi.slice(0, 3).map(s => (
                    <span key={s} className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>{s}</span>
                  ))}
                  {sup.servizi.length > 3 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>+{sup.servizi.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <SupplierFormModal supplier={editingSupplier} onSave={handleSave} onCancel={() => { setShowForm(false); setEditingSupplier(undefined) }} />
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
    </div>
  )
}
