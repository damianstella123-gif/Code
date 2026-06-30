import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search,
  X,
  Plus,
  Filter,
  ChevronDown,
  Inbox,
  Send,
  Star,
  AlertCircle,
  Calendar,
  Tag,
  Paperclip,
  ArrowLeft,
  Check,
  CheckCheck,
  Circle,
  Bell,
} from 'lucide-react'
import { loadUser } from '@/lib/auth'
import type { Messaggio, Priorita, TipoCanale } from '@/data/comunicazioni'
import { loadEventsFromStorage, loadTasksFromStorage } from '@/lib/storage'
import {
  fetchCommunications,
  upsertCommunication,
  updateCommunication,
  deleteCommunication,
} from '@/lib/communications-service'
import { supabase } from '@/lib/supabase'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDt(d: string) {
  const dt = new Date(d)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - dt.getTime()) / 86400000)
  if (diffDays === 0) return dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Ieri'
  if (diffDays < 7) return dt.toLocaleDateString('it-IT', { weekday: 'short' })
  return dt.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

function prioritaColor(p: Priorita) {
  switch (p) {
    case 'alta': return 'var(--red2)'
    case 'media': return 'var(--yellow)'
    case 'bassa': return 'var(--muted)'
  }
}
function prioritaLabel(p: Priorita) {
  switch (p) { case 'alta': return 'Alta'; case 'media': return 'Media'; case 'bassa': return 'Bassa' }
}

function canaleColor(c: TipoCanale) {
  switch (c) {
    case 'interno': return 'var(--text)'
    case 'evento': return 'var(--blue)'
    case 'task': return 'var(--yellow)'
    case 'crm': return 'var(--green)'
    case 'amministrativo': return '#f97316'
    case 'fornitore': return 'var(--muted)'
  }
}
function canaleLabel(c: TipoCanale) {
  switch (c) {
    case 'interno': return 'Interno'
    case 'evento': return 'Evento'
    case 'task': return 'Task'
    case 'crm': return 'CRM'
    case 'amministrativo': return 'Amministrativo'
    case 'fornitore': return 'Fornitore'
  }
}

function eventName(id: string | null) {
  if (!id) return null
  return loadEventsFromStorage().find(e => e.id === id)?.nome ?? null
}
function taskTitle(id: string | null) {
  if (!id) return null
  return loadTasksFromStorage().find(t => t.id === id)?.titolo ?? null
}

// ─── Composer ────────────────────────────────────────────────────────────────

interface ComposerProps {
  currentUserId: string
  onClose: () => void
  onSend: (msg: Omit<Messaggio, 'id' | 'letto'>) => void
}

function Composer({ currentUserId, onClose, onSend }: ComposerProps) {
  const [destinatari, setDestinatari] = useState<string[]>([])
  const [oggetto, setOggetto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [eventoId, setEventoId] = useState<string>('none')
  const [taskId, setTaskId] = useState<string>('none')
  const [priorita, setPriorita] = useState<Priorita>('media')
  const [canale, setCanale] = useState<TipoCanale>('interno')
  const [destInput, setDestInput] = useState('')

  function addDest(id: string) { setDestinatari(p => [...p, id]); setDestInput('') }
  function removeDest(id: string) { setDestinatari(p => p.filter(d => d !== id)) }

function handleSend() {
  const finalDestinatari = destinatari.length > 0
    ? destinatari
    : destInput.trim()
      ? [destInput.trim()]
      : []

  if (!oggetto.trim()) {
    alert('Inserisci oggetto')
    return
  }

  if (!corpo.trim()) {
    alert('Inserisci messaggio')
    return
  }

  if (finalDestinatari.length === 0) {
    alert('Inserisci almeno un destinatario email')
    return
  }

  console.log('CLICK INVIA MESSAGGIO', {
    destinatari: finalDestinatari,
    oggetto,
    corpo,
  })

  onSend({
    mittente: currentUserId,
    destinatari: finalDestinatari,
    oggetto: oggetto.trim(),
    corpo: corpo.trim(),
    eventoId: eventoId === 'none' ? null : eventoId,
    taskId: taskId === 'none' ? null : taskId,
    priorita,
    data: new Date().toISOString(),
    canale,
    allegati: [],
  })
}

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--line)',
    color: 'var(--text)',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden animate-fade-in"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>Nuovo messaggio</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-all">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Destinatari */}
          <div>
            <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Destinatari</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {destinatari.map(id => (
                <span
                  key={id}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}
                >
                  {id}
                  <button onClick={() => removeDest(id)} className="hover:opacity-70 ml-0.5">
                    <X className="w-3 h-3" style={{ color: 'var(--muted)' }} />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Inserisci ID destinatario..."
                value={destInput}
                onChange={e => setDestInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && destInput.trim()) {
                    addDest(destInput.trim())
                  }
                }}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Oggetto */}
          <div>
            <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Oggetto</label>
            <input
              type="text"
              placeholder="Oggetto del messaggio..."
              value={oggetto}
              onChange={e => setOggetto(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
              style={inputStyle}
            />
          </div>

          {/* Row: canale + priorità */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Canale</label>
              <select
                value={canale}
                onChange={e => setCanale(e.target.value as TipoCanale)}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={inputStyle}
              >
                {(['interno', 'evento', 'crm', 'amministrativo', 'fornitore', 'task'] as TipoCanale[]).map(c => (
                  <option key={c} value={c}>{canaleLabel(c)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Priorita</label>
              <select
                value={priorita}
                onChange={e => setPriorita(e.target.value as Priorita)}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={inputStyle}
              >
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </select>
            </div>
          </div>

          {/* Evento + Task */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Evento (opz.)</label>
              <select
                value={eventoId}
                onChange={e => setEventoId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={inputStyle}
              >
                <option value="none">Nessun evento</option>
                {loadEventsFromStorage().map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Task (opz.)</label>
              <select
                value={taskId}
                onChange={e => setTaskId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={inputStyle}
              >
                <option value="none">Nessun task</option>
                {loadTasksFromStorage().map(t => <option key={t.id} value={t.id}>{t.titolo}</option>)}
              </select>
            </div>
          </div>

          {/* Corpo */}
          <div>
            <label className="text-xs uppercase tracking-wide mb-2 block" style={{ color: 'var(--muted)' }}>Messaggio</label>
            <textarea
              rows={6}
              placeholder="Scrivi il tuo messaggio..."
              value={corpo}
              onChange={e => setCorpo(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none resize-none"
              style={inputStyle}
            />
          </div>

{/* Actions */}
<div className="flex gap-3 pt-1">
  <button
    onClick={onClose}
    className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
    style={{
      background: 'var(--panel2)',
      color: 'var(--muted)',
      border: '1px solid var(--line)',
    }}
  >
    Annulla
  </button>

  <button
    onClick={handleSend}
    disabled={false}
    className="flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-40"
    style={{
      background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
      color: 'white',
    }}
  >
    <Send className="w-4 h-4" />
    Invia
  </button>
</div>
        </div>
      </div>
    </div>
  )
}

// ─── Message Thread ───────────────────────────────────────────────────────────

interface ThreadProps {
  msg: Messaggio
  currentUserId: string
  onBack: () => void
  onReply: (original: Messaggio) => void
  onMarkRead: (id: string) => void
  onDelete: (id: string) => void
}

function MessageThread({ msg, currentUserId, onBack, onReply, onMarkRead, onDelete }: ThreadProps) {
  const isUnread = !msg.letto.includes(currentUserId)

  const evName = eventName(msg.eventoId)
  const tskTitle = taskTitle(msg.taskId)

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
        style={{ color: 'var(--muted)' }}
      >
        <ArrowLeft className="w-4 h-4" /> Torna alla lista
      </button>

      <div className="panel p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--panel2)', color: 'var(--text)' }}>
            {msg.mittente.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{msg.oggetto}</h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                  Da: <span style={{ color: 'var(--text)' }}>{msg.mittente}</span>
                  {' · '}
                  A: <span style={{ color: 'var(--text)' }}>
                    {msg.destinatari.join(', ')}
                  </span>
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  {new Date(msg.data).toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {isUnread && (
                  <button
                    onClick={() => onMarkRead(msg.id)}
                    className="text-xs mt-1 px-2 py-0.5 rounded transition-all hover:opacity-80"
                    style={{ background: 'rgba(77,180,255,0.12)', color: 'var(--blue)' }}
                  >
                    Segna come letto
                  </button>
                )}
              </div>
            </div>

            {/* Meta badges */}
            <div className="flex flex-wrap gap-2 mt-3">
              <span
                className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{ background: `${canaleColor(msg.canale)}15`, color: canaleColor(msg.canale) }}
              >
                {canaleLabel(msg.canale)}
              </span>
              <span
                className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1"
                style={{ background: `${prioritaColor(msg.priorita)}12`, color: prioritaColor(msg.priorita) }}
              >
                <AlertCircle className="w-3 h-3" />
                Priorita {prioritaLabel(msg.priorita)}
              </span>
              {evName && (
                <span
                  className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1"
                  style={{ background: 'rgba(77,180,255,0.1)', color: 'var(--blue)' }}
                >
                  <Calendar className="w-3 h-3" />
                  {evName}
                </span>
              )}
              {tskTitle && (
                <span
                  className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1"
                  style={{ background: 'rgba(255,194,75,0.1)', color: 'var(--yellow)' }}
                >
                  <Tag className="w-3 h-3" />
                  {tskTitle}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--line)' }} />

        {/* Body */}
        <div
          className="text-sm leading-relaxed whitespace-pre-wrap rounded-xl p-4"
          style={{ background: 'var(--panel2)', color: 'var(--text)' }}
        >
          {msg.corpo}
        </div>

        {/* Allegati */}
        {msg.allegati.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>Allegati</p>
            <div className="flex flex-wrap gap-2">
              {msg.allegati.map(a => (
                <button
                  key={a}
                  onClick={() => alert(`Download demo: ${a}`)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all hover:opacity-80"
                  style={{ background: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--line)' }}
                >
                  <Paperclip className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stato lettura */}
        <div>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>Stato lettura</p>
          <div className="flex flex-wrap gap-2">
            {[msg.mittente, ...msg.destinatari].map(id => {
              const read = msg.letto.includes(id)
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs"
                  style={{ background: 'var(--panel2)', border: `1px solid ${read ? 'rgba(56,210,125,0.2)' : 'var(--line)'}` }}
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: 'var(--line)', color: 'var(--text)' }}>
                    {id.slice(0, 1).toUpperCase()}
                  </div>
                  <span style={{ color: 'var(--text)' }}>{id}</span>
                  {read
                    ? <CheckCheck className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                    : <Circle className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3" style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
          <button
            onClick={() => onReply(msg)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}
          >
            <Send className="w-4 h-4" /> Rispondi
          </button>
          <button
            onClick={() => { if (confirm('Eliminare questo messaggio?')) onDelete(msg.id) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-red-500/10"
            style={{ color: 'var(--red2)', border: '1px solid rgba(208,0,58,0.2)' }}
          >
            <X className="w-4 h-4" /> Elimina
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const SIDEBAR: { id: string; label: string; canale?: TipoCanale; icon: React.FC<{ className?: string; style?: React.CSSProperties }> }[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'sent', label: 'Inviati', icon: Send },
  { id: 'evento', label: 'Evento', canale: 'evento', icon: Calendar },
  { id: 'crm', label: 'CRM', canale: 'crm', icon: Star },
  { id: 'amministrativo', label: 'Amministrativo', canale: 'amministrativo', icon: Tag },
  { id: 'fornitore', label: 'Fornitore', canale: 'fornitore', icon: Filter },
  { id: 'interno', label: 'Interno', canale: 'interno', icon: Bell },
]

export default function Comunicazioni() {
  const currentUser = loadUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const [msgs, setMsgs] = useState<Messaggio[]>([])
  const [view, setView] = useState<string>('inbox')
  const [selected, setSelected] = useState<Messaggio | null>(null)
  const [showComposer, setShowComposer] = useState(false)
  const [_replyTo, setReplyTo] = useState<Messaggio | null>(null)
  const [search, setSearch] = useState('')
  const [filterEvento, setFilterEvento] = useState('tutti')
  const [filterPriorita, setFilterPriorita] = useState('tutti')
  const [filterMittente, setFilterMittente] = useState('tutti')

  const refresh = useCallback(async () => {
    const list = await fetchCommunications()
    setMsgs(list)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const targetId = searchParams.get('id')
    if (!targetId || msgs.length === 0) return
    const found = msgs.find(m => m.id === targetId)
    if (found) {
      setSelected(found)
      setSearchParams({}, { replace: true })
    }
  }, [msgs, searchParams, setSearchParams])

  if (!currentUser) return null

  const uid = currentUser.id
  const ruolo = currentUser.ruolo

  // ── Permission filter ───────────────────────────────────────────────────────
  const visibleMsgs = useMemo(() => {
    return msgs.filter(m => {
      const involvedInMsg = m.mittente === uid || m.destinatari.includes(uid)

      if (ruolo === 'Admin' || ruolo === 'Partner') return true

      if (ruolo === 'Manager') {
        const myTeamIds = [
          ...loadEventsFromStorage().filter(e => e.responsabile === uid || e.team.includes(uid)).flatMap(e => e.team),
          uid,
        ]
        return involvedInMsg ||
          myTeamIds.includes(m.mittente) ||
          m.destinatari.some(d => myTeamIds.includes(d))
      }

      if (ruolo === 'Finance') {
        return involvedInMsg || m.canale === 'amministrativo'
      }

      if (ruolo === 'Commerciale') {
        return involvedInMsg || m.canale === 'crm'
      }

      if (ruolo === 'Operativo') {
        const myEventIds = loadEventsFromStorage()
          .filter(e => e.responsabile === uid || e.team.includes(uid))
          .map(e => e.id)
        const myTaskIds = loadTasksFromStorage().filter(t => t.assegnatario === uid).map(t => t.id)
        return involvedInMsg ||
          (m.eventoId !== null && myEventIds.includes(m.eventoId)) ||
          (m.taskId !== null && myTaskIds.includes(m.taskId))
      }

      if (ruolo === 'Fornitore') {
        return involvedInMsg || m.canale === 'fornitore'
      }

      return involvedInMsg
    })
  }, [msgs, uid, ruolo])

  // ── View filter ─────────────────────────────────────────────────────────────
  const viewFiltered = useMemo(() => {
    return visibleMsgs.filter(m => {
      if (view === 'inbox') return m.destinatari.includes(uid)
      if (view === 'sent') return m.mittente === uid
      const sidebar = SIDEBAR.find(s => s.id === view)
      if (sidebar?.canale) return m.canale === sidebar.canale
      return true
    })
  }, [visibleMsgs, view, uid])

  // ── Additional filters ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return viewFiltered.filter(m => {
      const matchSearch = search === '' ||
        m.oggetto.toLowerCase().includes(search.toLowerCase()) ||
        m.corpo.toLowerCase().includes(search.toLowerCase()) ||
        m.mittente.toLowerCase().includes(search.toLowerCase())
      const matchEvento = filterEvento === 'tutti' || m.eventoId === filterEvento
      const matchPriorita = filterPriorita === 'tutti' || m.priorita === filterPriorita
      const matchMittente = filterMittente === 'tutti' || m.mittente === filterMittente
      return matchSearch && matchEvento && matchPriorita && matchMittente
    }).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  }, [viewFiltered, search, filterEvento, filterPriorita, filterMittente])

  // ── Unread counts ───────────────────────────────────────────────────────────
  function unreadCount(viewId: string) {
    let base = visibleMsgs
    if (viewId === 'inbox') base = base.filter(m => m.destinatari.includes(uid))
    else if (viewId === 'sent') return 0
    else {
      const s = SIDEBAR.find(x => x.id === viewId)
      if (s?.canale) base = base.filter(m => m.canale === s.canale)
    }
    return base.filter(m => !m.letto.includes(uid)).length
  }

  const totalUnread = visibleMsgs.filter(m => m.destinatari.includes(uid) && !m.letto.includes(uid)).length

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function markRead(id: string) {
    const target = msgs.find(m => m.id === id)
    if (!target || target.letto.includes(uid)) return
    const newLetto = [...target.letto, uid]
    setMsgs(prev => prev.map(m => m.id === id ? { ...m, letto: newLetto } : m))
    await updateCommunication(id, { letto: newLetto })
  }

  async function markAllRead() {
    const toMark = msgs.filter(m => m.destinatari.includes(uid) && !m.letto.includes(uid))
    if (toMark.length === 0) return
    setMsgs(prev => prev.map(m =>
      (m.destinatari.includes(uid) && !m.letto.includes(uid))
        ? { ...m, letto: [...m.letto, uid] }
        : m
    ))
    await Promise.all(toMark.map(m =>
      updateCommunication(m.id, { letto: [...m.letto, uid] })
    ))
  }

 async function handleSend(data: Omit<Messaggio, 'id' | 'letto'>) {
  const newMsg: Messaggio = {
    ...data,
    id: `msg_new_${Date.now()}`,
    letto: [uid],
  }

  setMsgs(prev => [newMsg, ...prev])
  setShowComposer(false)
  setReplyTo(null)
  setView('sent')

  await upsertCommunication(newMsg)

  const validEmails = data.destinatari.filter(d =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d)
  )

  if (validEmails.length > 0) {
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        to: validEmails,
        subject: data.oggetto,
        html: data.corpo.replace(/\n/g, '<br />'),
        text: data.corpo,
      },
    })

    if (error) {
      console.error('Errore invio email:', error)
      alert('Messaggio salvato, ma invio email non riuscito.')
    } else {
      alert('Messaggio salvato ed email inviata.')
    }
  }

  await refresh()
}

  async function deleteMsg(id: string) {
    setMsgs(prev => prev.filter(m => m.id !== id))
    setSelected(null)
    await deleteCommunication(id)
  }

  function openMsg(m: Messaggio) {
    setSelected(m)
    void markRead(m.id)
  }

  function handleReply(original: Messaggio) {
    setReplyTo(original)
    setShowComposer(true)
  }

  // Sidebar views allowed by role
  const allowedViews = useMemo(() => {
    const all = SIDEBAR.map(s => s.id)
    if (ruolo === 'Super Admin' || ruolo === 'Admin' || ruolo === 'Partner' || ruolo === 'Project Manager') return all
    if (ruolo === 'Manager') return ['inbox', 'sent', 'evento', 'interno']
    if (ruolo === 'Finance') return ['inbox', 'sent', 'amministrativo', 'interno']
    if (ruolo === 'Commerciale') return ['inbox', 'sent', 'crm', 'interno']
    if (ruolo === 'Operativo') return ['inbox', 'sent', 'evento', 'interno']
    if (ruolo === 'Fornitore') return ['inbox', 'sent', 'fornitore']
    return ['inbox', 'sent']
  }, [ruolo])

  const activeSidebar = SIDEBAR.filter(s => allowedViews.includes(s.id))

  const viewLabel = SIDEBAR.find(s => s.id === view)?.label ?? view

  if (selected) {
    return (
      <>
        <MessageThread
          msg={selected}
          currentUserId={uid}
          onBack={() => setSelected(null)}
          onReply={handleReply}
          onMarkRead={markRead}
          onDelete={deleteMsg}
        />
        {showComposer && (
          <Composer
            currentUserId={uid}
            onClose={() => { setShowComposer(false); setReplyTo(null) }}
            onSend={handleSend}
          />
        )}
      </>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>Comunicazioni</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            Centro messaggi interno
            {totalUnread > 0 && (
              <span
                className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(255,49,95,0.15)', color: 'var(--red2)' }}
              >
                {totalUnread} non letti
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {totalUnread > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)' }}
            >
              <CheckCheck className="w-4 h-4" /> Segna tutti letti
            </button>
          )}
          <button
            onClick={() => { setReplyTo(null); setShowComposer(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white' }}
          >
            <Plus className="w-4 h-4" /> Nuovo messaggio
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Sidebar */}
        <div
          className="hidden md:flex flex-col gap-1 p-2 rounded-2xl flex-shrink-0"
          style={{ width: '200px', background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          {activeSidebar.map(s => {
            const count = unreadCount(s.id)
            const Icon = s.icon
            const active = view === s.id
            return (
              <button
                key={s.id}
                onClick={() => setView(s.id)}
                className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: active ? `${canaleColor(s.canale ?? 'interno')}15` : 'transparent',
                  color: active
                    ? s.canale ? canaleColor(s.canale) : 'var(--text)'
                    : 'var(--muted)',
                  borderLeft: active ? `2px solid ${s.canale ? canaleColor(s.canale) : 'var(--red2)'}` : '2px solid transparent',
                }}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {s.label}
                </div>
                {count > 0 && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-bold min-w-[20px] text-center"
                    style={{ background: 'var(--red2)', color: 'white', fontSize: '10px' }}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Main area */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Mobile view selector */}
          <div className="md:hidden flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
            {activeSidebar.map(s => {
              const Icon = s.icon
              const count = unreadCount(s.id)
              return (
                <button
                  key={s.id}
                  onClick={() => setView(s.id)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all relative"
                  style={{
                    background: view === s.id ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'transparent',
                    color: view === s.id ? 'white' : 'var(--muted)',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {s.label}
                  {count > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center"
                      style={{ background: 'var(--red2)', fontSize: '9px' }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Search + filters */}
          <div className="flex flex-wrap gap-2">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-[180px]"
              style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
            >
              <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
              <input
                type="text"
                placeholder="Cerca messaggi..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm focus:outline-none"
                style={{ color: 'var(--text)' }}
              />
              {search && <button onClick={() => setSearch('')}><X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} /></button>}
            </div>

            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
              <Filter className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
              <select
                value={filterEvento}
                onChange={e => setFilterEvento(e.target.value)}
                className="bg-transparent text-xs focus:outline-none"
                style={{ color: filterEvento === 'tutti' ? 'var(--muted)' : 'var(--text)' }}
              >
                <option value="tutti">Tutti gli eventi</option>
                {loadEventsFromStorage().map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
              </select>
              <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
            </div>

            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
              <select
                value={filterPriorita}
                onChange={e => setFilterPriorita(e.target.value)}
                className="bg-transparent text-xs focus:outline-none"
                style={{ color: filterPriorita === 'tutti' ? 'var(--muted)' : 'var(--text)' }}
              >
                <option value="tutti">Tutte le priorita</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="bassa">Bassa</option>
              </select>
              <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
            </div>

            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
              <select
                value={filterMittente}
                onChange={e => setFilterMittente(e.target.value)}
                className="bg-transparent text-xs focus:outline-none"
                style={{ color: filterMittente === 'tutti' ? 'var(--muted)' : 'var(--text)' }}
              >
                <option value="tutti">Tutti i mittenti</option>
              </select>
              <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted)' }} />
            </div>
          </div>

          {/* Title bar */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              {viewLabel}
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--muted)' }}>
                {filtered.length} messaggi
              </span>
            </h2>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="panel p-12 text-center" style={{ color: 'var(--muted)' }}>
              <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nessun messaggio trovato</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((m, i) => {
                const unread = !m.letto.includes(uid)
                const evName = eventName(m.eventoId)
                const tskTitle = taskTitle(m.taskId)
                const isFromMe = m.mittente === uid

                return (
                  <div
                    key={m.id}
                    className="panel hover-card cursor-pointer animate-fade-in"
                    style={{
                      animationDelay: `${i * 30}ms`,
                      borderLeft: unread ? `3px solid ${prioritaColor(m.priorita)}` : '3px solid transparent',
                      background: unread ? 'rgba(255,255,255,0.02)' : undefined,
                    }}
                    onClick={() => openMsg(m)}
                  >
                    <div className="p-4 flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: 'var(--panel2)', color: 'var(--text)' }}>
                        {m.mittente.slice(0, 2).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                              <span
                                className="text-sm font-semibold truncate"
                                style={{ color: unread ? 'var(--text)' : 'var(--muted)' }}
                              >
                                {isFromMe
                                  ? `A: ${m.destinatari.slice(0, 2).join(', ')}${m.destinatari.length > 2 ? ` +${m.destinatari.length - 2}` : ''}`
                                  : m.mittente}
                              </span>
                              {unread && (
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ background: prioritaColor(m.priorita) }}
                                />
                              )}
                            </div>
                            <p
                              className="text-sm truncate"
                              style={{ color: unread ? 'var(--text)' : 'var(--muted)', fontWeight: unread ? 600 : 400 }}
                            >
                              {m.oggetto}
                            </p>
                            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>
                              {m.corpo.replace(/\n/g, ' ')}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-xs" style={{ color: 'var(--muted)' }}>{formatDt(m.data)}</span>
                            {m.allegati.length > 0 && <Paperclip className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />}
                            {m.letto.includes(uid) && !unread
                              ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                              : null}
                          </div>
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ background: `${canaleColor(m.canale)}12`, color: canaleColor(m.canale) }}
                          >
                            {canaleLabel(m.canale)}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ background: `${prioritaColor(m.priorita)}10`, color: prioritaColor(m.priorita) }}
                          >
                            {prioritaLabel(m.priorita)}
                          </span>
                          {evName && (
                            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(77,180,255,0.1)', color: 'var(--blue)' }}>
                              {evName}
                            </span>
                          )}
                          {tskTitle && (
                            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,194,75,0.1)', color: 'var(--yellow)' }}>
                              {tskTitle}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showComposer && (
        <Composer
          currentUserId={uid}
          onClose={() => { setShowComposer(false); setReplyTo(null) }}
          onSend={handleSend}
        />
      )}
    </div>
  )
}
