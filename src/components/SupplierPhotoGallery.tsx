import { useState, useEffect, useCallback } from 'react'
import { Plus, X, ChevronLeft, ChevronRight, Download, Trash2, Camera, ImageIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'

interface SupplierPhoto {
  id: string
  supplier_id: string
  storage_path: string
  public_url: string | null
  categoria: string
  didascalia: string | null
  is_cover: boolean
  ordine: number
  caricata_da: string | null
  fonte: string
  created_at: string
}

const PHOTO_CATS: Record<string, string[]> = {
  Hotel: ['esterno', 'hall', 'camere', 'bagni', 'ristorante', 'terrazza', 'piscina', 'spa', 'sala_meeting', 'parcheggio'],
  Ristorante: ['esterno', 'hall', 'ristorante', 'terrazza', 'prodotto', 'altro'],
  Location: ['esterno', 'hall', 'terrazza', 'piscina', 'allestimento', 'altro'],
  'Audio Video': ['prodotto', 'allestimento', 'evento', 'altro'],
  Catering: ['prodotto', 'evento', 'team', 'altro'],
  DMC: ['esterno', 'evento', 'prodotto', 'altro'],
  Transfer: ['prodotto', 'evento', 'altro'],
  Staff: ['team', 'evento', 'altro'],
  Allestimenti: ['allestimento', 'prodotto', 'evento', 'altro'],
  Esperienze: ['esterno', 'evento', 'prodotto', 'altro'],
  default: ['esterno', 'prodotto', 'evento', 'altro'],
}

const CAT_LABELS: Record<string, string> = {
  esterno: 'Esterno',
  hall: 'Hall',
  camere: 'Camere',
  bagni: 'Bagni',
  ristorante: 'Ristorante',
  terrazza: 'Terrazza',
  piscina: 'Piscina',
  spa: 'Spa',
  sala_meeting: 'Sale Meeting',
  parcheggio: 'Parcheggio',
  allestimento: 'Allestimento',
  prodotto: 'Prodotto',
  team: 'Team',
  evento: 'Evento',
  altro: 'Altro',
}

export function useSupplierCoverPhoto(supplierId: string | undefined) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!supplierId) return
    supabase
      .from('supplier_photos')
      .select('public_url')
      .eq('supplier_id', supplierId)
      .eq('is_cover', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.public_url) setCoverUrl(data.public_url)
        else {
          supabase
            .from('supplier_photos')
            .select('public_url')
            .eq('supplier_id', supplierId)
            .order('ordine', { ascending: true })
            .limit(1)
            .maybeSingle()
            .then(({ data: first }) => {
              setCoverUrl(first?.public_url ?? null)
            })
        }
      })
  }, [supplierId])

  return coverUrl
}

export function SupplierPhotoGallery({ supplierId, supplierCategory }: { supplierId: string; supplierCategory?: string }) {
  const { showToast } = useToast()
  const [photos, setPhotos] = useState<SupplierPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState<string>('')
  const [showUpload, setShowUpload] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const [uploadCat, setUploadCat] = useState('esterno')
  const [uploadCaption, setUploadCaption] = useState('')
  const [uploadIsCover, setUploadIsCover] = useState(false)
  const [uploading, setUploading] = useState(false)

  const cats = PHOTO_CATS[supplierCategory ?? ''] ?? PHOTO_CATS.default

  const loadPhotos = useCallback(async () => {
    const { data } = await supabase
      .from('supplier_photos')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('ordine', { ascending: true })
      .order('created_at', { ascending: false })
    setPhotos(data ?? [])
    setLoading(false)
  }, [supplierId])

  useEffect(() => { loadPhotos() }, [loadPhotos])

  const filtered = filterCat ? photos.filter(p => p.categoria === filterCat) : photos
  const activeCats = [...new Set(photos.map(p => p.categoria))]

  async function handleUpload(files: FileList) {
    if (!files.length) return
    setUploading(true)
    const session = await supabase.auth.getSession()
    const userId = session.data.session?.user?.id

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = `${supplierId}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage
        .from('supplier-photos')
        .upload(path, file)
      if (uploadErr) { showToast(`Errore upload: ${file.name}`); continue }

      const { data: urlData } = supabase.storage
        .from('supplier-photos')
        .getPublicUrl(path)

      await supabase.from('supplier_photos').insert({
        supplier_id: supplierId,
        storage_path: path,
        public_url: urlData.publicUrl,
        categoria: uploadCat,
        didascalia: uploadCaption || null,
        is_cover: uploadIsCover && i === 0,
        caricata_da: userId || null,
        fonte: 'manuale',
      })
    }
    setUploading(false)
    setShowUpload(false)
    setUploadCaption('')
    setUploadIsCover(false)
    loadPhotos()
    showToast('Foto caricate')
  }

  async function handleDelete(photo: SupplierPhoto) {
    await supabase.storage.from('supplier-photos').remove([photo.storage_path])
    await supabase.from('supplier_photos').delete().eq('id', photo.id)
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
    setLightboxIdx(null)
    showToast('Foto eliminata')
  }

  if (loading) return null

  return (
    <div className="space-y-3">
      {photos.length === 0 && !showUpload ? (
        <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--panel2)', border: '1px dashed var(--line)' }}>
          <div className="flex items-center gap-3">
            <Camera className="w-5 h-5" style={{ color: 'var(--muted)' }} />
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Nessuna foto caricata — aggiungi le prime foto di questo fornitore</p>
          </div>
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{ background: 'var(--red2)', color: 'white' }}>
            <Plus className="w-3 h-3" /> Aggiungi
          </button>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button onClick={() => setFilterCat('')}
                className="px-2 py-1 rounded text-[10px] whitespace-nowrap transition-all"
                style={{ fontFamily: 'var(--font-mono)', background: !filterCat ? 'var(--red2)' : 'var(--panel2)', color: !filterCat ? 'white' : 'var(--muted)', border: '1px solid var(--line)' }}>
                Tutte ({photos.length})
              </button>
              {activeCats.map(c => (
                <button key={c} onClick={() => setFilterCat(filterCat === c ? '' : c)}
                  className="px-2 py-1 rounded text-[10px] whitespace-nowrap transition-all"
                  style={{ fontFamily: 'var(--font-mono)', background: filterCat === c ? 'var(--red2)' : 'var(--panel2)', color: filterCat === c ? 'white' : 'var(--muted)', border: '1px solid var(--line)' }}>
                  {CAT_LABELS[c] ?? c} ({photos.filter(p => p.categoria === c).length})
                </button>
              ))}
            </div>
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}>
              <Plus className="w-3 h-3" /> Foto
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {filtered.map((photo, idx) => (
              <div key={photo.id} className="relative group cursor-pointer rounded-lg overflow-hidden"
                style={{ aspectRatio: '4/3' }}
                onClick={() => setLightboxIdx(idx)}>
                <img src={photo.public_url ?? ''} alt={photo.didascalia ?? ''} loading="lazy"
                  className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                {photo.is_cover && (
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold"
                    style={{ background: 'var(--red2)', color: 'white' }}>COVER</span>
                )}
                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px]"
                  style={{ fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.6)', color: 'white' }}>
                  {CAT_LABELS[photo.categoria] ?? photo.categoria}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Upload Form */}
      {showUpload && (
        <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--panel2)', border: '1px solid var(--line)' }}>
          <div className="flex items-center justify-between">
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', color: 'var(--muted)' }}>CARICA FOTO</p>
            <button onClick={() => setShowUpload(false)}><X className="w-4 h-4" style={{ color: 'var(--muted)' }} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] block mb-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>CATEGORIA</label>
              <select value={uploadCat} onChange={e => setUploadCat(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', color: 'var(--text)' }}>
                {cats.map(c => <option key={c} value={c}>{CAT_LABELS[c] ?? c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>DIDASCALIA</label>
              <input type="text" value={uploadCaption} onChange={e => setUploadCaption(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)', color: 'var(--text)' }}
                placeholder="Opzionale" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={uploadIsCover} onChange={e => setUploadIsCover(e.target.checked)} className="w-4 h-4 rounded" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)' }}>Usa come foto copertina</span>
          </label>
          <label className="flex items-center justify-center gap-2 py-4 rounded-xl cursor-pointer transition-all hover:opacity-80"
            style={{ border: '2px dashed var(--line)', color: 'var(--muted)' }}>
            <Plus className="w-4 h-4" />
            <span className="text-sm">{uploading ? 'Caricamento...' : 'Seleziona immagini'}</span>
            <input type="file" multiple accept="image/*" className="hidden" disabled={uploading}
              onChange={e => { if (e.target.files) handleUpload(e.target.files) }} />
          </label>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && filtered[lightboxIdx] && (
        <PhotoLightbox
          photos={filtered}
          currentIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onPrev={() => setLightboxIdx(prev => prev !== null && prev > 0 ? prev - 1 : (filtered.length - 1))}
          onNext={() => setLightboxIdx(prev => prev !== null && prev < filtered.length - 1 ? prev + 1 : 0)}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}

function PhotoLightbox({ photos, currentIdx, onClose, onPrev, onNext, onDelete }: {
  photos: SupplierPhoto[]
  currentIdx: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onDelete: (p: SupplierPhoto) => void
}) {
  const photo = photos[currentIdx]
  if (!photo) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.9)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all">
        <X className="w-5 h-5 text-white" />
      </button>

      {photos.length > 1 && (
        <>
          <button onClick={onPrev} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <button onClick={onNext} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all">
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </>
      )}

      <div className="max-w-[90vw] max-h-[80vh] flex flex-col items-center gap-4">
        <img src={photo.public_url ?? ''} alt={photo.didascalia ?? ''} className="max-w-full max-h-[70vh] object-contain rounded-lg" />
        <div className="flex items-center gap-4 text-white text-xs">
          <span className="px-2 py-1 rounded bg-white/10" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
            {CAT_LABELS[photo.categoria] ?? photo.categoria}
          </span>
          {photo.didascalia && <span>{photo.didascalia}</span>}
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>{currentIdx + 1} / {photos.length}</span>
          <a href={photo.public_url ?? ''} download target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-all">
            <Download className="w-3 h-3" /> Scarica
          </a>
          <button onClick={() => onDelete(photo)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 hover:bg-red-500/40 transition-all text-red-300">
            <Trash2 className="w-3 h-3" /> Elimina
          </button>
        </div>
      </div>
    </div>
  )
}
