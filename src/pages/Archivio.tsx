import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Folder, FileText, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
  created_at: string
}

export default function Archivio() {
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [items, setItems] = useState<ArchiveItem[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
const [tags, setTags] = useState('')
const [fileUrl, setFileUrl] = useState('')
const [fileName, setFileName] = useState('')


const [editingId, setEditingId] = useState<string | null>(null)

  async function loadData() {
    const { data: f } = await supabase.from('archive_folders').select('*').order('name')
    const { data: i } = await supabase.from('archive_items').select('*').order('created_at', { ascending: false })
    setFolders(f ?? [])
    setItems(i ?? [])
    if (!selectedFolder && f && f.length > 0) setSelectedFolder(f[0].id)
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const inFolder = selectedFolder ? item.folder_id === selectedFolder : true
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q) ||
        (item.tags ?? []).some(t => t.toLowerCase().includes(q))

      return inFolder && matchSearch
    })
  }, [items, selectedFolder, search])
  const selectedFolderName =
  folders.find(f => f.id === selectedFolder)?.name ?? 'Archivio'

  async function createItem() {
    if (!title.trim()) return alert('Inserisci un titolo')

    const { error } = await supabase.from('archive_items').insert({
      folder_id: selectedFolder,
      title: title.trim(),
     category: selectedFolderName,
      description: description.trim() || null,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      file_url: fileUrl.trim() || null,
      file_name: fileName.trim() || null,
    })

    if (error) {
      alert(error.message)
      return
    }

    setTitle('')
    setDescription('')
    setTags('')
    setFileUrl('')
    setFileName('')
    setShowCreate(false)
    loadData()
  }
  
async function updateItem() {
  if (!editingId) return
  if (!title.trim()) return alert('Inserisci un titolo')

  const { error } = await supabase
    .from('archive_items')
    .update({
      folder_id: selectedFolder,
      title: title.trim(),
      category: selectedFolderName,
      description: description.trim() || null,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      file_url: fileUrl.trim() || null,
      file_name: fileName.trim() || null,
    })
    .eq('id', editingId)

  if (error) {
    alert(error.message)
    return
  }

  setEditingId(null)
  setTitle('')
  setDescription('')
  setTags('')
  setFileUrl('')
  setFileName('')
  setShowCreate(false)
  loadData()
}
  
  async function deleteItem(id: string) {
    if (!confirm('Eliminare questo elemento?')) return
    await supabase.from('archive_items').delete().eq('id', id)
    loadData()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>
          Archivio
        </h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>
          Knowledge Library di Simmetria Synergy.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="panel p-4 space-y-2">
          {folders.map(folder => (
            <button
              key={folder.id}
              onClick={() => setSelectedFolder(folder.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-left"
              style={{
                background: selectedFolder === folder.id ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'var(--panel2)',
                color: selectedFolder === folder.id ? 'white' : 'var(--text)',
              }}
            >
              <Folder className="w-4 h-4" />
              {folder.name}
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex gap-3">
            <div className="panel flex-1 flex items-center gap-2 px-3 py-2">
              <Search className="w-4 h-4" style={{ color: 'var(--muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cerca in archivio..."
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--text)' }}
              />
            </div>

            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}
            >
              <Plus className="w-4 h-4" />
              Nuovo
            </button>
          </div>

          {showCreate && (
            <div className="panel p-5 space-y-3">
              <input className="w-full px-3 py-2 rounded-xl" placeholder="Titolo" value={title} onChange={e => setTitle(e.target.value)} />
<div
  className="w-full px-3 py-2 rounded-xl text-sm"
  style={{
    background: 'var(--panel2)',
    color: 'var(--muted)'
  }}
>
  Categoria: {selectedFolderName}
</div>
              <textarea className="w-full px-3 py-2 rounded-xl" placeholder="Descrizione" value={description} onChange={e => setDescription(e.target.value)} />
              <input className="w-full px-3 py-2 rounded-xl" placeholder="Tag separati da virgola" value={tags} onChange={e => setTags(e.target.value)} />
              <input className="w-full px-3 py-2 rounded-xl" placeholder="Nome file" value={fileName} onChange={e => setFileName(e.target.value)} />
              <input className="w-full px-3 py-2 rounded-xl" placeholder="URL file" value={fileUrl} onChange={e => setFileUrl(e.target.value)} />

              <div className="flex gap-2">
                <button onClick={editingId ? updateItem : createItem} className="px-4 py-2 rounded-xl" style={{ background: 'var(--red2)', color: 'white' }}>
                  {editingId ? 'Aggiorna' : 'Salva'}
                </button>
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl" style={{ background: 'var(--panel2)', color: 'var(--text)' }}>
                  Annulla
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {filteredItems.map(item => (
              <div key={item.id} className="panel p-4 flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <FileText className="w-5 h-5 mt-0.5" style={{ color: 'var(--red2)' }} />
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text)' }}>{item.title}</p>
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>{item.category}</p>
                    {item.description && <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{item.description}</p>}
                    {item.file_url && (
                      <a href={item.file_url} target="_blank" rel="noreferrer" className="text-sm underline" style={{ color: 'var(--red2)' }}>
                        {item.file_name || 'Apri file'}
                      </a>
                    )}
                  </div>
                </div>
<div className="flex items-center gap-3">

  <button
    onClick={() => {
      setEditingId(item.id)
      setTitle(item.title)
      setDescription(item.description ?? '')
      setTags((item.tags ?? []).join(', '))
      setFileUrl(item.file_url ?? '')
      setFileName(item.file_name ?? '')
      setShowCreate(true)
    }}
    className="text-sm font-medium"
    style={{ color: 'var(--blue)' }}
  >
    Modifica
  </button>

  <button onClick={() => deleteItem(item.id)}>
<Trash2 className="w-4 h-4" style={{ color: '#d0003a' }} />
  </button>

</div>
              </div>
            ))}

            {filteredItems.length === 0 && (
              <div className="panel p-8 text-center" style={{ color: 'var(--muted)' }}>
                Nessun elemento trovato.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}