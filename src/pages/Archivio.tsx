import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Search, Plus, Folder, FileText, Trash2, Pencil, X, Upload,
  Download, Star, MapPin, Calendar, Filter, ChevronDown, Eye,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRealtimeTable } from '@/lib/use-realtime'

type FolderRow = {
  id: string
  name: string
  description: string | null
}

type ArchiveItem = {
  id: string
  folder_id: string | null
  title: string
  category: string
  description: string | null
  tags: string[] | null
  file_url: string | null
  file_name: string | null
  city: string | null
  country: string | null
  content_type: string | null
  budget_min: number | null
  budget_max: number | null
  capacity_min: number | null
  capacity_max: number | null
  season: string | null
  rating: number | null
  reusable: boolean | null
  internal_notes: string | null
  created_at: string
}

const CONTENT_TYPES = ['Venue', 'Catering', 'Entertainment', 'Allestimento', 'Tecnica', 'Location', 'Template', 'Documento', 'Altro']
const SEASONS = ['Primavera', 'Estate', 'Autunno', 'Inverno', 'Tutto l\'anno']
const ALLOWED_EXTENSIONS = ['.pdf', '.pptx', '.docx', '.png', '.jpg', '.jpeg']

function fileIcon(name: string | null) {
  if (!name) return 'var(--muted)'
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf': return '#ef4444'
    case 'pptx': return '#f97316'
    case 'docx': return '#3b82f6'
    case 'png': case 'jpg': case 'jpeg': return '#22c55e'
    default: return 'var(--muted)'
  }
}

function fileExtLabel(name: string | null) {
  if (!name) return ''
  return name.split('.').pop()?.toUpperCase() ?? ''
}

export default function Archivio() {
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [items, setItems] = useState<ArchiveItem[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterContentType, setFilterContentType] = useState('')
  const [filterSeason, setFilterSeason] = useState('')
  const [filterReusable, setFilterReusable] = useState<'' | 'true' | 'false'>('')
  const [filterRating, setFilterRating] = useState(0)

  // Form state
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ArchiveItem | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formTags, setFormTags] = useState('')
  const [formCity, setFormCity] = useState('')
  const [formCountry, setFormCountry] = useState('')
  const [formContentType, setFormContentType] = useState('')
  const [formBudgetMin, setFormBudgetMin] = useState('')
  const [formBudgetMax, setFormBudgetMax] = useState('')
  const [formCapacityMin, setFormCapacityMin] = useState('')
  const [formCapacityMax, setFormCapacityMax] = useState('')
  const [formSeason, setFormSeason] = useState('')
  const [formRating, setFormRating] = useState(0)
  const [formReusable, setFormReusable] = useState(true)
  const [formInternalNotes, setFormInternalNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadedFileUrl, setUploadedFileUrl] = useState('')
  const [uploadedFileName, setUploadedFileName] = useState('')

  // Detail view
  const [detailItem, setDetailItem] = useState<ArchiveItem | null>(null)

  const loadData = useCallback(async () => {
    const { data: f } = await supabase.from('archive_folders').select('*').order('name')
    const { data: i } = await supabase.from('archive_items').select('*').order('created_at', { ascending: false })
    setFolders(f ?? [])
    setItems(i ?? [])
    if (!selectedFolder && f && f.length > 0) setSelectedFolder(f[0].id)
  }, [selectedFolder])

  useEffect(() => { loadData() }, [])
  useRealtimeTable('archive_items', loadData)

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const inFolder = selectedFolder ? item.folder_id === selectedFolder : true
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q) ||
        (item.tags ?? []).some(t => t.toLowerCase().includes(q)) ||
        (item.city ?? '').toLowerCase().includes(q) ||
        (item.country ?? '').toLowerCase().includes(q) ||
        (item.content_type ?? '').toLowerCase().includes(q)

      const matchContentType = !filterContentType || item.content_type === filterContentType
      const matchSeason = !filterSeason || item.season === filterSeason
      const matchReusable = !filterReusable || String(item.reusable) === filterReusable
      const matchRating = !filterRating || (item.rating ?? 0) >= filterRating

      return inFolder && matchSearch && matchContentType && matchSeason && matchReusable && matchRating
    })
  }, [items, selectedFolder, search, filterContentType, filterSeason, filterReusable, filterRating])

  const selectedFolderName = folders.find(f => f.id === selectedFolder)?.name ?? 'Archivio'
  const activeFilters = [filterContentType, filterSeason, filterReusable, filterRating > 0 ? 'r' : ''].filter(Boolean).length

  function resetForm() {
    setFormTitle('')
    setFormDescription('')
    setFormTags('')
    setFormCity('')
    setFormCountry('')
    setFormContentType('')
    setFormBudgetMin('')
    setFormBudgetMax('')
    setFormCapacityMin('')
    setFormCapacityMax('')
    setFormSeason('')
    setFormRating(0)
    setFormReusable(true)
    setFormInternalNotes('')
    setUploadedFileUrl('')
    setUploadedFileName('')
    setEditingItem(null)
  }

  function openCreate() {
    resetForm()
    setFormOpen(true)
  }

  function openEdit(item: ArchiveItem) {
    setEditingItem(item)
    setFormTitle(item.title)
    setFormDescription(item.description ?? '')
    setFormTags((item.tags ?? []).join(', '))
    setFormCity(item.city ?? '')
    setFormCountry(item.country ?? '')
    setFormContentType(item.content_type ?? '')
    setFormBudgetMin(item.budget_min?.toString() ?? '')
    setFormBudgetMax(item.budget_max?.toString() ?? '')
    setFormCapacityMin(item.capacity_min?.toString() ?? '')
    setFormCapacityMax(item.capacity_max?.toString() ?? '')
    setFormSeason(item.season ?? '')
    setFormRating(item.rating ?? 0)
    setFormReusable(item.reusable ?? true)
    setFormInternalNotes(item.internal_notes ?? '')
    setUploadedFileUrl(item.file_url ?? '')
    setUploadedFileName(item.file_name ?? '')
    setFormOpen(true)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      alert(`Formato non supportato. Formati ammessi: ${ALLOWED_EXTENSIONS.join(', ')}`)
      return
    }

    setUploading(true)
    const filePath = `${crypto.randomUUID()}/${file.name}`
    const { error } = await supabase.storage.from('archive-files').upload(filePath, file)

    if (error) {
      alert('Errore upload: ' + error.message)
      setUploading(false)
      return
    }

    setUploadedFileUrl(filePath)
    setUploadedFileName(file.name)
    setUploading(false)
  }

  async function saveItem() {
    if (!formTitle.trim()) return alert('Inserisci un titolo')

    const payload = {
      folder_id: selectedFolder,
      title: formTitle.trim(),
      category: selectedFolderName,
      description: formDescription.trim() || null,
      tags: formTags.split(',').map(t => t.trim()).filter(Boolean),
      file_url: uploadedFileUrl || null,
      file_name: uploadedFileName || null,
      city: formCity.trim() || null,
      country: formCountry.trim() || null,
      content_type: formContentType || null,
      budget_min: formBudgetMin ? Number(formBudgetMin) : null,
      budget_max: formBudgetMax ? Number(formBudgetMax) : null,
      capacity_min: formCapacityMin ? Number(formCapacityMin) : null,
      capacity_max: formCapacityMax ? Number(formCapacityMax) : null,
      season: formSeason || null,
      rating: formRating || null,
      reusable: formReusable,
      internal_notes: formInternalNotes.trim() || null,
    }

    if (editingItem) {
      const { error } = await supabase.from('archive_items').update(payload).eq('id', editingItem.id)
      if (error) { alert(error.message); return }
    } else {
      const { error } = await supabase.from('archive_items').insert(payload)
      if (error) { alert(error.message); return }
    }

    setFormOpen(false)
    resetForm()
    loadData()
  }

  async function deleteItem(id: string) {
    if (!confirm('Eliminare questo elemento?')) return
    const item = items.find(i => i.id === id)
    if (item?.file_url) {
      const path = item.file_url.includes('/archive-files/') ? decodeURIComponent(item.file_url.split('/archive-files/')[1]) : item.file_url
      await supabase.storage.from('archive-files').remove([path])
    }
    await supabase.from('archive_items').delete().eq('id', id)
    loadData()
  }

  async function downloadFile(item: ArchiveItem) {
    if (!item.file_url) return
    const path = item.file_url.includes('/archive-files/') ? decodeURIComponent(item.file_url.split('/archive-files/')[1]) : item.file_url
    const { data, error } = await supabase.storage.from('archive-files').download(path)
    if (error || !data) {
      alert('Errore download: ' + (error?.message ?? 'file non trovato'))
      return
    }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = item.file_name ?? 'file'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Detail modal
  if (detailItem) {
    return (
      <div className="space-y-6 animate-fade-in">
        <button
          onClick={() => setDetailItem(null)}
          className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
          style={{ color: 'var(--muted)' }}
        >
          <X className="w-4 h-4" /> Chiudi dettaglio
        </button>

        <div className="panel p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{detailItem.title}</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{detailItem.category}</p>
            </div>
            <div className="flex items-center gap-2">
              {detailItem.rating && (
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className="w-4 h-4" style={{ color: s <= detailItem.rating! ? 'var(--yellow)' : 'var(--line)' }} fill={s <= detailItem.rating! ? 'var(--yellow)' : 'none'} />
                  ))}
                </div>
              )}
              {detailItem.reusable && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--green)' }}>Riutilizzabile</span>
              )}
            </div>
          </div>

          {detailItem.description && <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{detailItem.description}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {detailItem.content_type && (
              <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Tipo contenuto</span>
                <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text)' }}>{detailItem.content_type}</p>
              </div>
            )}
            {(detailItem.city || detailItem.country) && (
              <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Localita</span>
                <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text)' }}>
                  {[detailItem.city, detailItem.country].filter(Boolean).join(', ')}
                </p>
              </div>
            )}
            {detailItem.season && (
              <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Stagione</span>
                <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text)' }}>{detailItem.season}</p>
              </div>
            )}
            {(detailItem.budget_min || detailItem.budget_max) && (
              <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Budget range</span>
                <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text)' }}>
                  {detailItem.budget_min ? `€${Number(detailItem.budget_min).toLocaleString('it-IT')}` : '—'} – {detailItem.budget_max ? `€${Number(detailItem.budget_max).toLocaleString('it-IT')}` : '—'}
                </p>
              </div>
            )}
            {(detailItem.capacity_min || detailItem.capacity_max) && (
              <div className="p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Capacita</span>
                <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text)' }}>
                  {detailItem.capacity_min ?? '—'} – {detailItem.capacity_max ?? '—'} persone
                </p>
              </div>
            )}
          </div>

          {(detailItem.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(detailItem.tags ?? []).map((tag, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'var(--panel2)', color: 'var(--text)' }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {detailItem.internal_notes && (
            <div className="p-4 rounded-xl" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)' }}>
              <span className="text-xs font-medium" style={{ color: 'var(--yellow)' }}>Note interne</span>
              <p className="text-sm mt-1" style={{ color: 'var(--text)' }}>{detailItem.internal_notes}</p>
            </div>
          )}

          {detailItem.file_url && (
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold"
                style={{ background: `${fileIcon(detailItem.file_name)}18`, color: fileIcon(detailItem.file_name) }}>
                {fileExtLabel(detailItem.file_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{detailItem.file_name}</p>
              </div>
              <button onClick={() => downloadFile(detailItem)} className="p-2 rounded-lg hover:bg-white/10">
                <Download className="w-4 h-4" style={{ color: 'var(--blue)' }} />
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <button
              onClick={() => { setDetailItem(null); openEdit(detailItem) }}
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              style={{ border: '1px solid var(--line)', color: 'var(--text)' }}
            >
              <Pencil className="w-3.5 h-3.5" /> Modifica
            </button>
            <button
              onClick={() => { deleteItem(detailItem.id); setDetailItem(null) }}
              className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              style={{ border: '1px solid var(--line)', color: 'var(--red2)' }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Elimina
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Archivio</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>Knowledge Library di Simmetria Synergy.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Sidebar - Folders */}
        <div className="panel p-4 space-y-1 lg:col-span-1">
          <p className="text-xs uppercase tracking-wide mb-3 px-2" style={{ color: 'var(--muted)' }}>Cartelle</p>
          <button
            onClick={() => setSelectedFolder(null)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-left transition-all"
            style={{
              background: !selectedFolder ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'transparent',
              color: !selectedFolder ? 'white' : 'var(--text)',
            }}
          >
            <Folder className="w-4 h-4" />
            Tutte
            <span className="ml-auto text-xs opacity-70">{items.length}</span>
          </button>
          {folders.map(folder => {
            const count = items.filter(i => i.folder_id === folder.id).length
            return (
              <button
                key={folder.id}
                onClick={() => setSelectedFolder(folder.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-left transition-all"
                style={{
                  background: selectedFolder === folder.id ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'transparent',
                  color: selectedFolder === folder.id ? 'white' : 'var(--text)',
                }}
              >
                <Folder className="w-4 h-4" />
                {folder.name}
                <span className="ml-auto text-xs opacity-70">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Main content */}
        <div className="lg:col-span-4 space-y-4">
          {/* Search + Actions */}
          <div className="flex gap-3 flex-wrap">
            <div className="panel flex-1 min-w-[200px] flex items-center gap-2 px-3 py-2.5">
              <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cerca per titolo, tag, citta, tipo..."
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--text)' }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="p-0.5"><X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} /></button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 transition-all"
              style={{ background: showFilters || activeFilters > 0 ? 'rgba(208,0,58,0.1)' : 'var(--panel)', border: '1px solid var(--line)', color: activeFilters > 0 ? 'var(--red2)' : 'var(--text)' }}
            >
              <Filter className="w-4 h-4" />
              Filtri{activeFilters > 0 && ` (${activeFilters})`}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            <button
              onClick={openCreate}
              className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 text-white"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}
            >
              <Plus className="w-4 h-4" /> Nuovo
            </button>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="panel p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Tipo contenuto</label>
                <select value={filterContentType} onChange={e => setFilterContentType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
                  <option value="">Tutti</option>
                  {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Stagione</label>
                <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
                  <option value="">Tutte</option>
                  {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Riutilizzabile</label>
                <select value={filterReusable} onChange={e => setFilterReusable(e.target.value as '' | 'true' | 'false')}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
                  <option value="">Tutti</option>
                  <option value="true">Si</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Rating min.</label>
                <div className="flex items-center gap-1 pt-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button key={s} onClick={() => setFilterRating(filterRating === s ? 0 : s)}>
                      <Star className="w-5 h-5" style={{ color: s <= filterRating ? 'var(--yellow)' : 'var(--line)' }} fill={s <= filterRating ? 'var(--yellow)' : 'none'} />
                    </button>
                  ))}
                </div>
              </div>
              {activeFilters > 0 && (
                <button
                  onClick={() => { setFilterContentType(''); setFilterSeason(''); setFilterReusable(''); setFilterRating(0) }}
                  className="text-xs underline sm:col-span-2 md:col-span-4" style={{ color: 'var(--red2)' }}
                >
                  Rimuovi filtri
                </button>
              )}
            </div>
          )}

          {/* Items list */}
          <div className="space-y-2">
            {filteredItems.map(item => (
              <div key={item.id} className="panel p-4 flex items-start gap-4 group hover:border-opacity-60 transition-all cursor-pointer"
                onClick={() => setDetailItem(item)}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                  style={{ background: `${fileIcon(item.file_name)}15`, color: fileIcon(item.file_name) }}>
                  {item.file_name ? fileExtLabel(item.file_name) : <FileText className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{item.title}</p>
                    {item.content_type && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>{item.content_type}</span>
                    )}
                    {item.reusable && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)' }}>Riutilizzabile</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {item.category && <span className="text-xs" style={{ color: 'var(--muted)' }}>{item.category}</span>}
                    {(item.city || item.country) && (
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                        <MapPin className="w-3 h-3" /> {[item.city, item.country].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {item.season && (
                      <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                        <Calendar className="w-3 h-3" /> {item.season}
                      </span>
                    )}
                  </div>
                  {(item.tags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(item.tags ?? []).slice(0, 4).map((tag, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>{tag}</span>
                      ))}
                      {(item.tags ?? []).length > 4 && <span className="text-[10px]" style={{ color: 'var(--muted)' }}>+{(item.tags ?? []).length - 4}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.rating && (
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} className="w-3 h-3" style={{ color: s <= item.rating! ? 'var(--yellow)' : 'var(--line)' }} fill={s <= item.rating! ? 'var(--yellow)' : 'none'} />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => { e.stopPropagation(); setDetailItem(item) }} className="p-1.5 rounded-lg hover:bg-white/10" title="Visualizza">
                      <Eye className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); openEdit(item) }} className="p-1.5 rounded-lg hover:bg-white/10" title="Modifica">
                      <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteItem(item.id) }} className="p-1.5 rounded-lg hover:bg-white/10" title="Elimina">
                      <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredItems.length === 0 && (
              <div className="panel p-12 text-center" style={{ color: 'var(--muted)' }}>
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nessun elemento trovato</p>
                <p className="text-sm mt-1">Prova a cambiare i filtri o la cartella selezionata.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => { setFormOpen(false); resetForm() }}>
          <div className="w-full max-w-2xl rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
            onClick={e => e.stopPropagation()}>
            <div className="p-5 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--line)' }}>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                {editingItem ? 'Modifica Elemento' : 'Nuovo Elemento'}
              </h3>
              <button onClick={() => { setFormOpen(false); resetForm() }} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Title + Type */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Titolo *</label>
                  <input type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}
                    placeholder="Nome dell'elemento" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Tipo contenuto</label>
                  <select value={formContentType} onChange={e => setFormContentType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
                    <option value="">— Seleziona —</option>
                    {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Descrizione</label>
                <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent resize-none" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}
                  placeholder="Descrizione dettagliata..." />
              </div>

              {/* Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Citta</label>
                  <input type="text" value={formCity} onChange={e => setFormCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Nazione</label>
                  <input type="text" value={formCountry} onChange={e => setFormCountry(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}
                    placeholder="Italia" />
                </div>
              </div>

              {/* Budget + Capacity */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Budget min</label>
                  <input type="number" value={formBudgetMin} onChange={e => setFormBudgetMin(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}
                    placeholder="€" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Budget max</label>
                  <input type="number" value={formBudgetMax} onChange={e => setFormBudgetMax(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}
                    placeholder="€" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Capacita min</label>
                  <input type="number" value={formCapacityMin} onChange={e => setFormCapacityMin(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}
                    placeholder="Persone" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Capacita max</label>
                  <input type="number" value={formCapacityMax} onChange={e => setFormCapacityMax(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}
                    placeholder="Persone" />
                </div>
              </div>

              {/* Season + Rating + Reusable */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Stagione</label>
                  <select value={formSeason} onChange={e => setFormSeason(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}>
                    <option value="">— Nessuna —</option>
                    {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Rating</label>
                  <div className="flex items-center gap-1 pt-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} type="button" onClick={() => setFormRating(formRating === s ? 0 : s)}>
                        <Star className="w-5 h-5" style={{ color: s <= formRating ? 'var(--yellow)' : 'var(--line)' }} fill={s <= formRating ? 'var(--yellow)' : 'none'} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formReusable} onChange={e => setFormReusable(e.target.checked)} className="rounded" />
                    <span className="text-sm" style={{ color: 'var(--text)' }}>Riutilizzabile</span>
                  </label>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Tag (separati da virgola)</label>
                <input type="text" value={formTags} onChange={e => setFormTags(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }}
                  placeholder="es: lusso, outdoor, 500pax" />
              </div>

              {/* Internal Notes */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--yellow)' }}>Note interne</label>
                <textarea value={formInternalNotes} onChange={e => setFormInternalNotes(e.target.value)} rows={2}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent resize-none" style={{ border: '1px solid rgba(234,179,8,0.3)', color: 'var(--text)' }}
                  placeholder="Visibili solo al team..." />
              </div>

              {/* File upload */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>
                  File allegato (PDF, PPTX, DOCX, PNG, JPG)
                </label>
                {uploadedFileName ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--panel2)' }}>
                    <div className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold"
                      style={{ background: `${fileIcon(uploadedFileName)}18`, color: fileIcon(uploadedFileName) }}>
                      {fileExtLabel(uploadedFileName)}
                    </div>
                    <span className="text-sm flex-1 truncate" style={{ color: 'var(--text)' }}>{uploadedFileName}</span>
                    <button onClick={() => { setUploadedFileUrl(''); setUploadedFileName('') }}
                      className="p-1 rounded hover:bg-white/10">
                      <X className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-4 rounded-lg cursor-pointer transition-all hover:bg-white/5"
                    style={{ border: '1px dashed var(--line)', color: 'var(--muted)' }}>
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">{uploading ? 'Caricamento...' : 'Clicca per caricare un file'}</span>
                    <input type="file" className="hidden" accept=".pdf,.pptx,.docx,.png,.jpg,.jpeg"
                      onChange={handleFileUpload} disabled={uploading} />
                  </label>
                )}
              </div>
            </div>

            <div className="p-5 flex justify-end gap-3 flex-shrink-0" style={{ borderTop: '1px solid var(--line)' }}>
              <button onClick={() => { setFormOpen(false); resetForm() }}
                className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
                Annulla
              </button>
              <button onClick={saveItem} disabled={uploading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
                {editingItem ? 'Aggiorna' : 'Crea'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
