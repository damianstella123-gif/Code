import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Users,
  Search,
  X,
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  TrendingUp,
  Star,
  MessageSquare,
  Video,
  Send,
  FileText,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Palette,
  Zap,
} from 'lucide-react'
import type { Client, Contatto } from '@/data/clients'
import { fetchClients, upsertClient, deleteClient, fetchContacts } from '@/lib/clients-service'
import { fetchEvents } from '@/lib/events-service'
import { fetchCreativeProjects, type CreativeProject } from '@/lib/creative-service'
import { fetchSocialContents, type SocialContent } from '@/lib/social-service'
import { supabase } from '@/lib/supabase'

type FilterStato = 'Tutti' | 'attivo' | 'vip' | 'prospect' | 'perso'

const FILTERS: { id: FilterStato; label: string; color: string }[] = [
  { id: 'Tutti', label: 'Tutti', color: 'var(--text)' },
  { id: 'attivo', label: 'Attivo', color: 'var(--green)' },
  { id: 'vip', label: 'VIP', color: 'var(--yellow)' },
  { id: 'prospect', label: 'Prospect', color: 'var(--blue)' },
  { id: 'perso', label: 'Perso', color: 'var(--muted)' },
]

function statoColor(stato: Client['stato']) {
  switch (stato) {
    case 'attivo': return 'var(--green)'
    case 'vip': return 'var(--yellow)'
    case 'prospect': return 'var(--blue)'
    case 'perso': return 'var(--muted)'
  }
}

function statoLabel(stato: Client['stato']) {
  switch (stato) {
    case 'attivo': return 'Attivo'
    case 'vip': return 'VIP'
    case 'prospect': return 'Prospect'
    case 'perso': return 'Perso'
  }
}

function faseLabel(fase: Client['faseTrattativa']) {
  switch (fase) {
    case 'lead': return 'Lead'
    case 'qualificato': return 'Qualificato'
    case 'proposta': return 'Proposta Inviata'
    case 'negoziazione': return 'In Negoziazione'
    case 'chiuso_vinto': return 'Chiuso Vinto'
    case 'chiuso_perso': return 'Chiuso Perso'
  }
}

function faseColor(fase: Client['faseTrattativa']) {
  switch (fase) {
    case 'lead': return 'var(--muted)'
    case 'qualificato': return 'var(--blue)'
    case 'proposta': return 'var(--yellow)'
    case 'negoziazione': return '#f97316'
    case 'chiuso_vinto': return 'var(--green)'
    case 'chiuso_perso': return 'var(--red2)'
  }
}

function contattoIcon(tipo: Contatto['tipo']) {
  switch (tipo) {
    case 'chiamata': return Phone
    case 'email': return Mail
    case 'meeting': return Video
    case 'proposta': return FileText
    case 'offerta': return Send
    default: return MessageSquare
  }
}

function contattoColor(tipo: Contatto['tipo']) {
  switch (tipo) {
    case 'chiamata': return 'var(--green)'
    case 'email': return 'var(--blue)'
    case 'meeting': return 'var(--yellow)'
    case 'proposta': return '#f97316'
    case 'offerta': return 'var(--red2)'
    default: return 'var(--muted)'
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

const FASE_STEPS: Client['faseTrattativa'][] = [
  'lead', 'qualificato', 'proposta', 'negoziazione', 'chiuso_vinto',
]

function FasePipeline({ fase }: { fase: Client['faseTrattativa'] }) {
  if (fase === 'chiuso_perso') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,49,95,0.15)', color: 'var(--red2)' }}>
          Chiuso Perso
        </span>
      </div>
    )
  }
  const currentIdx = FASE_STEPS.indexOf(fase)
  return (
    <div className="flex items-center gap-1">
      {FASE_STEPS.map((step, i) => (
        <div key={step} className="flex items-center gap-1">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{
              width: '28px',
              background: i <= currentIdx ? faseColor(fase) : 'var(--line)',
            }}
          />
        </div>
      ))}
      <span className="text-xs ml-1" style={{ color: faseColor(fase) }}>
        {faseLabel(fase)}
      </span>
    </div>
  )
}

interface ClientFormModalProps {
  initial: Client | null
  onClose: () => void
  onSaved: (saved: Client) => void
}

function ClientFormModal({ initial, onClose, onSaved }: ClientFormModalProps) {
  const isEdit = initial !== null
  const [nome, setNome] = useState(initial?.nome ?? '')
  const [settore, setSettore] = useState(initial?.settore ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [telefono, setTelefono] = useState(initial?.telefono ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!nome.trim()) {
      setError('Il nome del cliente è obbligatorio')
      return
    }
    setError(null)
    setSaving(true)
    const id = initial?.id ?? `cli_${Date.now()}`
    const payload: Client = {
      id,
      nome: nome.trim(),
      settore: settore.trim(),
      email: email.trim(),
      telefono: telefono.trim(),
      referente: initial?.referente ?? '',
      avatar: initial?.avatar ?? '',
      stato: initial?.stato ?? 'prospect',
      nazione: initial?.nazione ?? 'Italia',
      citta: initial?.citta ?? '',
      source: initial?.source ?? 'contatto',
      fatturato: initial?.fatturato ?? 0,
      valoreStimato: initial?.valoreStimato ?? 0,
      faseTrattativa: initial?.faseTrattativa ?? 'lead',
      note: note.trim(),
    }
    const saved = await upsertClient(payload)
    setSaving(false)
    if (!saved) {
      setError('Salvataggio non riuscito')
      return
    }
    onSaved({ ...payload, ...saved })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg panel p-6 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
              {isEdit ? 'Modifica cliente' : 'Nuovo cliente'}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              {isEdit ? 'Aggiorna le informazioni del cliente' : 'Aggiungi un nuovo cliente al CRM'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>
              Nome cliente *
            </label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Es. TechnoCorp Industries"
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{
                background: 'var(--panel2)',
                border: '1px solid var(--line)',
                color: 'var(--text)',
              }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>
                Settore
              </label>
              <input
                type="text"
                value={settore}
                onChange={e => setSettore(e.target.value)}
                placeholder="Es. Tecnologia"
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{
                  background: 'var(--panel2)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                }}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>
                Telefono
              </label>
              <input
                type="text"
                value={telefono}
                onChange={e => setTelefono(e.target.value)}
                placeholder="+39 ..."
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{
                  background: 'var(--panel2)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="cliente@azienda.com"
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
              style={{
                background: 'var(--panel2)',
                border: '1px solid var(--line)',
                color: 'var(--text)',
              }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>
              Note
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="Note interne sul cliente..."
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none resize-none"
              style={{
                background: 'var(--panel2)',
                border: '1px solid var(--line)',
                color: 'var(--text)',
              }}
            />
          </div>
          {error && (
            <p className="text-xs" style={{ color: 'var(--red2)' }}>{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-white/5"
            style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}
          >
            Annulla
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
              color: 'white',
              boxShadow: 'var(--shadow-red)',
            }}
          >
            {saving ? 'Salvataggio...' : isEdit ? 'Salva modifiche' : 'Crea cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ title, message, confirmLabel = 'Elimina', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onCancel}
    >
      <div className="w-full max-w-sm panel p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{title}</h3>
        <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>{message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5"
            style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--red2)', color: 'white' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ClientDetailProps {
  client: Client
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  events: import('@/data/events').Event[]
}

function ClientDetail({ client, onBack, onEdit, onDelete, events }: ClientDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'storico' | 'eventi' | 'materiali'>('overview')
  const [clientCreative, setClientCreative] = useState<CreativeProject[]>([])
  const [clientSocial, setClientSocial] = useState<SocialContent[]>([])
  const [clientPresentations, setClientPresentations] = useState<{ id: string; template_name: string; status: string; created_at: string }[]>([])
  const [clientContatti, setClientContatti] = useState<Contatto[]>([])

  useEffect(() => {
    fetchCreativeProjects().then(all => {
      setClientCreative(all.filter(p => p.client_id === client.id))
    })
    fetchSocialContents().then(all => {
      setClientSocial(all.filter(c => c.client_id === client.id))
    })
    supabase.from('presentation_versions').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setClientPresentations(data)
    })
    fetchContacts(client.id).then(setClientContatti)
  }, [client.id])

  const clientEvents = events.filter(e => e.cliente === client.id)

  const tabs = [
    { id: 'overview' as const, label: 'Panoramica' },
    { id: 'storico' as const, label: `Storico (${clientContatti.length})` },
    { id: 'eventi' as const, label: `Eventi (${clientEvents.length})` },
    { id: 'materiali' as const, label: `Materiali (${clientCreative.length + clientSocial.length + clientPresentations.length})` },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
          style={{ color: 'var(--muted)' }}
        >
          <ArrowLeft className="w-4 h-4" /> Torna ai clienti
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-white/5"
            style={{ color: 'var(--text)', border: '1px solid var(--line)' }}
          >
            <Pencil className="w-4 h-4" />
            Modifica
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-red-500/10"
            style={{ color: 'var(--red2)', border: '1px solid var(--line)' }}
          >
            <Trash2 className="w-4 h-4" />
            Elimina
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="panel p-6 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{ background: `linear-gradient(135deg, ${statoColor(client.stato)} 0%, transparent 60%)` }}
        />
        <div className="relative flex flex-wrap items-start gap-6">
          {client.avatar ? (
            <img
              src={client.avatar}
              alt={client.nome}
              className="w-20 h-20 rounded-2xl object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl font-bold"
              style={{ background: 'var(--panel2)', color: 'var(--muted)' }}
            >
              {client.nome.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{
                  background: `${statoColor(client.stato)}18`,
                  color: statoColor(client.stato),
                  border: `1px solid ${statoColor(client.stato)}35`,
                }}
              >
                {client.stato === 'vip' && <Star className="w-3 h-3 inline mr-1 -mt-0.5" />}
                {statoLabel(client.stato)}
              </span>
              {client.settore && (
                <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                  {client.settore}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{client.nome}</h1>
            {client.referente && (
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                Ref: {client.referente}
              </p>
            )}
            <div className="mt-3">
              <FasePipeline fase={client.faseTrattativa} />
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 flex-shrink-0">
            <div className="text-center p-4 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Fatturato</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--green)' }}>
                {client.fatturato > 0 ? `€${(client.fatturato / 1000).toFixed(0)}K` : '—'}
              </p>
            </div>
            <div className="text-center p-4 rounded-xl" style={{ background: 'var(--panel2)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Potenziale</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--blue)' }}>
                {client.valoreStimato > 0 ? `€${(client.valoreStimato / 1000).toFixed(0)}K` : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: activeTab === tab.id
                ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                : 'transparent',
              color: activeTab === tab.id ? 'white' : 'var(--muted)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contatti */}
            <div className="panel p-5">
              <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Recapiti</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--blue)' }} />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{client.email || '—'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--green)' }} />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{client.telefono || '—'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red2)' }} />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>
                    {[client.citta, client.nazione].filter(Boolean).join(', ') || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Trattativa */}
            <div className="panel p-5">
              <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Trattativa</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>Fase</span>
                  <span className="text-sm font-medium px-2 py-0.5 rounded"
                    style={{ background: `${faseColor(client.faseTrattativa)}15`, color: faseColor(client.faseTrattativa) }}>
                    {faseLabel(client.faseTrattativa)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>Fonte</span>
                  <span className="text-sm capitalize" style={{ color: 'var(--text)' }}>{client.source}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>Contatti</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{clientContatti.length}</span>
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="panel p-5 md:col-span-2">
              <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Note</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
                {client.note || 'Nessuna nota disponibile.'}
              </p>
            </div>

            {/* Valore commerciale */}
            <div className="panel p-5 md:col-span-2">
              <p className="text-xs uppercase tracking-wide mb-4" style={{ color: 'var(--muted)' }}>Valore Commerciale</p>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { label: 'Fatturato storico', value: client.fatturato, color: 'var(--green)' },
                  { label: 'Valore stimato', value: client.valoreStimato, color: 'var(--blue)' },
                  { label: 'Margine (est. 30%)', value: Math.round(client.fatturato * 0.3), color: 'var(--yellow)' },
                ].map(item => (
                  <div key={item.label} className="text-center p-4 rounded-xl" style={{ background: 'var(--panel2)' }}>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>{item.label}</p>
                    <p className="text-xl font-bold mt-1" style={{ color: item.color }}>
                      {item.value > 0 ? `€${item.value.toLocaleString('it-IT')}` : '—'}
                    </p>
                  </div>
                ))}
              </div>
              {client.fatturato > 0 && client.valoreStimato > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--muted)' }}>
                    <span>Fatturato vs Potenziale</span>
                    <span>{Math.round((client.fatturato / client.valoreStimato) * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--panel2)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (client.fatturato / client.valoreStimato) * 100)}%`,
                        background: 'var(--green)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'storico' && (
          <div className="space-y-3">
            {clientContatti.length === 0 ? (
              <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Nessun contatto registrato</p>
              </div>
            ) : (
              <div className="panel p-5">
                <div className="relative">
                  <div
                    className="absolute left-5 top-0 bottom-0 w-0.5"
                    style={{ background: 'var(--line)' }}
                  />
                  <div className="space-y-5">
                    {clientContatti.map((cnt, i) => {
                      const Icon = contattoIcon(cnt.tipo)
                      const color = contattoColor(cnt.tipo)
                      const autore = { nome: cnt.autore || '—' }
                      return (
                        <div key={cnt.id} className="flex gap-5 relative animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                          <div
                            className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: `${color}18`, border: `1.5px solid ${color}40` }}
                          >
                            <Icon className="w-4 h-4" style={{ color }} />
                          </div>
                          <div className="flex-1 pb-5" style={{ borderBottom: i < clientContatti.length - 1 ? '0' : 'none' }}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{cnt.titolo}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{cnt.note}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span
                                  className="text-xs px-2 py-0.5 rounded capitalize"
                                  style={{ background: `${color}15`, color }}
                                >
                                  {cnt.tipo}
                                </span>
                                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{formatDate(cnt.data)}</p>
                              </div>
                            </div>
                            {autore && (
                              <div className="flex items-center gap-2 mt-2">
                                <div className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                                  {autore.nome.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-xs" style={{ color: 'var(--muted)' }}>{autore.nome}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'eventi' && (
          <div className="space-y-3">
            {clientEvents.length === 0 ? (
              <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Nessun evento collegato</p>
              </div>
            ) : (
              clientEvents.map(evt => {
                const statoEvtColor = {
                  in_corso: 'var(--red2)',
                  pianificazione: 'var(--blue)',
                  completato: 'var(--green)',
                  bozza: 'var(--yellow)',
                }[evt.stato]
                const statoEvtLabel = {
                  in_corso: 'In Corso',
                  pianificazione: 'Pianificazione',
                  completato: 'Completato',
                  bozza: 'Bozza',
                }[evt.stato]
                return (
                  <div key={evt.id} className="panel p-5 flex items-start gap-4">
                    <div
                      className="w-1.5 self-stretch rounded-full flex-shrink-0"
                      style={{ background: statoEvtColor }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ background: `${statoEvtColor}15`, color: statoEvtColor }}
                        >
                          {statoEvtLabel}
                        </span>
                      </div>
                      <p className="font-semibold" style={{ color: 'var(--text)' }}>{evt.nome}</p>
                      <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{evt.location}</p>
                      <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(evt.dataInizio).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {evt.partecipanti} partecipanti
                        </span>
                        <span className="flex items-center gap-1" style={{ color: 'var(--green)' }}>
                          €{evt.budget.toLocaleString('it-IT')}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {activeTab === 'materiali' && (
          <div className="space-y-6">
            {clientCreative.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-wide mb-3 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                  <Palette className="w-3.5 h-3.5" /> Materiali Creativi ({clientCreative.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {clientCreative.map(p => (
                    <div key={p.id} className="panel p-4" style={{ border: '1px solid var(--line)' }}>
                      <p className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{p.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs capitalize" style={{ color: 'var(--muted)' }}>{p.type.replace(/_/g, ' ')}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded capitalize"
                          style={{ background: p.status === 'completato' ? 'rgba(56,210,125,0.15)' : 'rgba(155,163,170,0.15)', color: p.status === 'completato' ? 'var(--green)' : 'var(--muted)' }}>
                          {p.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {clientSocial.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-wide mb-3 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                  <Zap className="w-3.5 h-3.5" /> Contenuti Social ({clientSocial.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {clientSocial.map(c => (
                    <div key={c.id} className="panel p-4" style={{ border: '1px solid var(--line)' }}>
                      <p className="font-medium text-sm truncate" style={{ color: 'var(--text)' }}>{c.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs capitalize" style={{ color: 'var(--muted)' }}>{c.channel.replace(/_/g, ' ')}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded capitalize"
                          style={{ background: c.status === 'pubblicato' ? 'rgba(56,210,125,0.15)' : 'rgba(155,163,170,0.15)', color: c.status === 'pubblicato' ? 'var(--green)' : 'var(--muted)' }}>
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {clientPresentations.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-wide mb-3 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                  <FileText className="w-3.5 h-3.5" /> Presentazioni ({clientPresentations.length})
                </h4>
                <div className="space-y-2">
                  {clientPresentations.map(v => (
                    <div key={v.id} className="panel p-4 flex items-center gap-3" style={{ border: '1px solid var(--line)' }}>
                      <FileText className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--blue)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{v.template_name}</p>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>
                          {new Date(v.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded capitalize"
                        style={{ background: v.status === 'pronto' ? 'rgba(56,210,125,0.15)' : 'rgba(155,163,170,0.15)', color: v.status === 'pronto' ? 'var(--green)' : 'var(--muted)' }}>
                        {v.status === 'generazione_richiesta' ? 'in generazione' : v.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {clientCreative.length === 0 && clientSocial.length === 0 && clientPresentations.length === 0 && (
              <div className="panel p-8 text-center">
                <Palette className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--muted)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun materiale collegato a questo cliente</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CRM() {
  const [clientList, setClientList] = useState<Client[]>([])
  const [selected, setSelected] = useState<Client | null>(null)
  const [filter, setFilter] = useState<FilterStato>('Tutti')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Client | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const [events, setEvents] = useState<import('@/data/events').Event[]>([])
  const [allContacts, setAllContacts] = useState<Contatto[]>([])

  const refresh = useCallback(async () => {
    const [list, evs, contacts] = await Promise.all([fetchClients(), fetchEvents(), fetchContacts()])
    setClientList(list)
    setEvents(evs)
    setAllContacts(contacts)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    return clientList.filter(c => {
      const matchFilter = filter === 'Tutti' || c.stato === filter
      const q = search.trim().toLowerCase()
      const matchSearch =
        q === '' ||
        c.nome.toLowerCase().includes(q) ||
        c.settore.toLowerCase().includes(q) ||
        c.referente.toLowerCase().includes(q) ||
        c.citta.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      return matchFilter && matchSearch
    })
  }, [clientList, filter, search])

  const totFatturato = clientList.reduce((s, c) => s + c.fatturato, 0)
  const totPotenziale = clientList.reduce((s, c) => s + c.valoreStimato, 0)
  const vipCount = clientList.filter(c => c.stato === 'vip').length
  const prospectCount = clientList.filter(c => c.stato === 'prospect').length

  const handleSaved = async (saved: Client) => {
    setShowForm(false)
    setEditTarget(null)
    await refresh()
    if (selected && selected.id === saved.id) {
      setSelected(saved)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    const ok = await deleteClient(deleteTarget.id)
    setDeleteTarget(null)
    if (ok) {
      if (selected && selected.id === deleteTarget.id) setSelected(null)
      await refresh()
    }
  }

  if (selected) {
    return (
      <>
        <ClientDetail
          client={selected}
          onBack={() => setSelected(null)}
          onEdit={() => setEditTarget(selected)}
          onDelete={() => setDeleteTarget(selected)}
          events={events}
        />
        {(showForm || editTarget) && (
          <ClientFormModal
            initial={editTarget}
            onClose={() => { setShowForm(false); setEditTarget(null) }}
            onSaved={handleSaved}
          />
        )}
        {deleteTarget && (
          <ConfirmDialog
            title="Eliminare il cliente?"
            message={`Vuoi eliminare definitivamente "${deleteTarget.nome}"? Gli eventi collegati non verranno rimossi.`}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>CRM</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            {filtered.length} clienti visibili
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)',
            color: 'white',
            boxShadow: 'var(--shadow-red)',
          }}
        >
          <Plus className="w-4 h-4" />
          Nuovo cliente
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Clienti Totali', value: clientList.length, display: String(clientList.length), color: 'var(--text)' },
          { label: 'Fatturato Totale', value: totFatturato, display: `€${(totFatturato / 1000).toFixed(0)}K`, color: 'var(--green)' },
          { label: 'Potenziale Pipeline', value: totPotenziale, display: `€${(totPotenziale / 1000).toFixed(0)}K`, color: 'var(--blue)' },
          { label: 'VIP / Prospect', value: vipCount + prospectCount, display: `${vipCount} VIP · ${prospectCount} Prospect`, color: 'var(--yellow)' },
        ].map((kpi, i) => (
          <div key={i} className="panel p-4">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{kpi.label}</p>
            <p className="text-2xl font-bold mt-1 truncate" style={{ color: kpi.color }}>{kpi.display}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl flex-1 min-w-[200px]"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Cerca cliente, settore, referente, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--text)' }}
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>

        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: filter === f.id
                  ? f.id === 'Tutti'
                    ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)'
                    : `${f.color}18`
                  : 'transparent',
                color: filter === f.id
                  ? f.id === 'Tutti' ? 'white' : f.color
                  : 'var(--muted)',
                border: filter === f.id && f.id !== 'Tutti'
                  ? `1px solid ${f.color}35`
                  : '1px solid transparent',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="panel p-12 text-center" style={{ color: 'var(--muted)' }}>
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nessun cliente trovato</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((client, i) => {
            const clientContatti = allContacts.filter(c => c.clienteId === client.id)
            const lastContact = clientContatti.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0]
            const clientEvents = events.filter(e => e.cliente === client.id)

            return (
              <div
                key={client.id}
                className="panel hover-card p-5 cursor-pointer animate-fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => setSelected(client)}
              >
                <div className="flex items-start gap-4">
                  <div className="relative flex-shrink-0">
                    {client.avatar ? (
                      <img
                        src={client.avatar}
                        alt={client.nome}
                        className="w-14 h-14 rounded-xl object-cover"
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold"
                        style={{ background: 'var(--panel2)', color: 'var(--muted)' }}
                      >
                        {client.nome.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {client.stato === 'vip' && (
                      <div
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--yellow)', boxShadow: '0 0 8px rgba(255,194,75,0.6)' }}
                      >
                        <Star className="w-3 h-3 text-black" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span
                            className="text-xs px-2 py-0.5 rounded font-medium"
                            style={{
                              background: `${statoColor(client.stato)}15`,
                              color: statoColor(client.stato),
                            }}
                          >
                            {statoLabel(client.stato)}
                          </span>
                          {client.settore && (
                            <span className="text-xs" style={{ color: 'var(--muted)' }}>{client.settore}</span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                          {client.nome}
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--muted)' }}>
                          {[client.referente, client.citta].filter(Boolean).join(' · ') || client.email || '—'}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <p className="text-lg font-bold" style={{ color: client.fatturato > 0 ? 'var(--green)' : 'var(--muted)' }}>
                          {client.fatturato > 0 ? `€${(client.fatturato / 1000).toFixed(0)}K` : '—'}
                        </p>
                        {client.valoreStimato > 0 && (
                          <p className="text-xs" style={{ color: 'var(--blue)' }}>
                            est. €{(client.valoreStimato / 1000).toFixed(0)}K
                          </p>
                        )}
                        <ChevronRight className="w-4 h-4 mt-1" style={{ color: 'var(--muted)' }} />
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                      <div className="flex flex-wrap items-center gap-4">
                        <FasePipeline fase={client.faseTrattativa} />
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                          <Calendar className="w-3.5 h-3.5" />
                          {clientEvents.length} evento{clientEvents.length !== 1 ? 'i' : ''}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                          <MessageSquare className="w-3.5 h-3.5" />
                          {clientContatti.length} contatti
                        </div>
                      </div>
                      {lastContact && (
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                          <TrendingUp className="w-3.5 h-3.5" />
                          Ultimo: {formatDate(lastContact.data)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(showForm || editTarget) && (
        <ClientFormModal
          initial={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(null) }}
          onSaved={handleSaved}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Eliminare il cliente?"
          message={`Vuoi eliminare definitivamente "${deleteTarget.nome}"? Gli eventi collegati non verranno rimossi.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
