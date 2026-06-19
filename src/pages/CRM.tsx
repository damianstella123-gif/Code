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
  Building2,
} from 'lucide-react'
import type { Client, Contatto } from '@/data/clients'
import { fetchClients, upsertClient, deleteClient, fetchContacts, fetchAllReferenti, upsertReferente, deleteReferente, setReferentePrincipale, type Referente } from '@/lib/clients-service'
import { fetchEvents } from '@/lib/events-service'
import { fetchCreativeProjects, type CreativeProject } from '@/lib/creative-service'
import { fetchSocialContents, type SocialContent } from '@/lib/social-service'
import { supabase } from '@/lib/supabase'
import { useRealtimeTable } from '@/lib/use-realtime'

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
  const [citta, setCitta] = useState(initial?.citta ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!nome.trim()) {
      setError('Il nome azienda e obbligatorio')
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
      citta: citta.trim(),
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
              {isEdit ? 'Modifica azienda' : 'Nuova azienda'}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              {isEdit ? 'Aggiorna le informazioni' : 'Aggiungi una nuova azienda al CRM'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>
              Nome azienda *
            </label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Es. TechnoCorp Industries"
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Settore</label>
              <input type="text" value={settore} onChange={e => setSettore(e.target.value)} placeholder="Es. Tecnologia"
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Citta</label>
              <input type="text" value={citta} onChange={e => setCitta(e.target.value)} placeholder="Es. Milano"
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="azienda@email.com"
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Telefono</label>
              <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+39 ..."
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>Note</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Note interne..."
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none resize-none"
              style={{ background: 'var(--panel2)', border: '1px solid var(--line)', color: 'var(--text)' }} />
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--red2)' }}>{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-white/5"
            style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
            Annulla
          </button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white', boxShadow: 'var(--shadow-red)' }}>
            {saving ? 'Salvataggio...' : isEdit ? 'Salva modifiche' : 'Crea azienda'}
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
          <button onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5"
            style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
            Annulla
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--red2)', color: 'white' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

interface CompanyDetailProps {
  client: Client
  referenti: Referente[]
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onRefresh: () => void
  events: import('@/data/events').Event[]
}

function CompanyDetail({ client, referenti, onBack, onEdit, onDelete, onRefresh, events }: CompanyDetailProps) {
  const [activeTab, setActiveTab] = useState<'referenti' | 'overview' | 'storico' | 'eventi' | 'materiali'>('referenti')
  const [clientCreative, setClientCreative] = useState<CreativeProject[]>([])
  const [clientSocial, setClientSocial] = useState<SocialContent[]>([])
  const [clientPresentations, setClientPresentations] = useState<{ id: string; template_name: string; status: string; created_at: string }[]>([])
  const [clientContatti, setClientContatti] = useState<Contatto[]>([])
  const [referenteForm, setReferenteForm] = useState<Partial<Referente> | null>(null)
  const [referenteSearch, setReferenteSearch] = useState('')
  const [deleteRefTarget, setDeleteRefTarget] = useState<Referente | null>(null)

  const loadReferenti = useCallback(() => {
    onRefresh()
  }, [onRefresh])

  useEffect(() => {
    fetchCreativeProjects().then(all => setClientCreative(all.filter(p => p.client_id === client.id)))
    fetchSocialContents().then(all => setClientSocial(all.filter(c => c.client_id === client.id)))
    supabase.from('presentation_versions').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setClientPresentations(data)
    })
    fetchContacts(client.id).then(setClientContatti)
  }, [client.id])

  useRealtimeTable('referenti', loadReferenti)

  const clientEvents = events.filter(e => e.cliente === client.id)

  const tabs = [
    { id: 'referenti' as const, label: `Referenti (${referenti.length})` },
    { id: 'overview' as const, label: 'Panoramica' },
    { id: 'storico' as const, label: `Storico (${clientContatti.length})` },
    { id: 'eventi' as const, label: `Eventi (${clientEvents.length})` },
    { id: 'materiali' as const, label: `Materiali (${clientCreative.length + clientSocial.length + clientPresentations.length})` },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm transition-all hover:opacity-80"
          style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="w-4 h-4" /> Torna alle aziende
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onEdit}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-white/5"
            style={{ color: 'var(--text)', border: '1px solid var(--line)' }}>
            <Pencil className="w-4 h-4" /> Modifica
          </button>
          <button onClick={onDelete}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:bg-red-500/10"
            style={{ color: 'var(--red2)', border: '1px solid var(--line)' }}>
            <Trash2 className="w-4 h-4" /> Elimina
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="panel p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ background: `linear-gradient(135deg, ${statoColor(client.stato)} 0%, transparent 60%)` }} />
        <div className="relative flex flex-wrap items-start gap-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl font-bold"
            style={{ background: `${statoColor(client.stato)}18`, color: statoColor(client.stato) }}>
            <Building2 className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{ background: `${statoColor(client.stato)}18`, color: statoColor(client.stato), border: `1px solid ${statoColor(client.stato)}35` }}>
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
            <div className="flex flex-wrap items-center gap-4 mt-2">
              {client.citta && (
                <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                  <MapPin className="w-3.5 h-3.5" /> {client.citta}
                </span>
              )}
              <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                <Users className="w-3.5 h-3.5" /> {referenti.length} referent{referenti.length !== 1 ? 'i' : 'e'}
              </span>
              {client.email && (
                <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                  <Mail className="w-3.5 h-3.5" /> {client.email}
                </span>
              )}
            </div>
            <div className="mt-3">
              <FasePipeline fase={client.faseTrattativa} />
            </div>
          </div>
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
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap px-3"
            style={{
              background: activeTab === tab.id ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : 'transparent',
              color: activeTab === tab.id ? 'white' : 'var(--muted)',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === 'referenti' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted)' }} />
                <input type="text" placeholder="Cerca referente..."
                  value={referenteSearch} onChange={e => setReferenteSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm bg-transparent"
                  style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
              </div>
              <button
                onClick={() => setReferenteForm({ client_id: client.id, nome: '', cognome: '', reparto: '', ruolo: '', email: '', telefono: '', cellulare: '', note: '', is_principale: false })}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
                style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
                <Plus className="w-4 h-4" /> Aggiungi
              </button>
            </div>

            {referenti.length === 0 ? (
              <div className="panel p-10 text-center" style={{ color: 'var(--muted)' }}>
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Nessun referente</p>
                <p className="text-xs mt-1">Aggiungi il primo referente per questa azienda</p>
              </div>
            ) : (
              <div className="space-y-2">
                {referenti
                  .filter(r => {
                    if (!referenteSearch.trim()) return true
                    const q = referenteSearch.toLowerCase()
                    return `${r.nome} ${r.cognome}`.toLowerCase().includes(q) ||
                      r.email.toLowerCase().includes(q) ||
                      r.ruolo.toLowerCase().includes(q) ||
                      r.reparto.toLowerCase().includes(q)
                  })
                  .map(ref => (
                    <div key={ref.id}
                      className="panel p-4 flex items-start gap-4 group hover:border-opacity-60 transition-all"
                      style={{ border: ref.is_principale ? '1px solid var(--green)' : '1px solid var(--line)' }}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                        style={{ background: ref.is_principale ? 'rgba(34,197,94,0.15)' : 'var(--panel2)', color: ref.is_principale ? 'var(--green)' : 'var(--muted)' }}>
                        {ref.nome.charAt(0)}{ref.cognome.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                            {ref.nome} {ref.cognome}
                          </span>
                          {ref.is_principale && (
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold"
                              style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--green)' }}>
                              Principale
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {ref.ruolo && <span className="text-xs" style={{ color: 'var(--muted)' }}>{ref.ruolo}</span>}
                          {ref.reparto && <span className="text-xs" style={{ color: 'var(--muted)' }}>| {ref.reparto}</span>}
                        </div>
                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                          {ref.email && (
                            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--blue)' }}>
                              <Mail className="w-3 h-3" /> {ref.email}
                            </span>
                          )}
                          {ref.telefono && (
                            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                              <Phone className="w-3 h-3" /> {ref.telefono}
                            </span>
                          )}
                          {ref.cellulare && (
                            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                              <Phone className="w-3 h-3" /> {ref.cellulare}
                            </span>
                          )}
                        </div>
                        {ref.note && <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>{ref.note}</p>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {!ref.is_principale && (
                          <button
                            onClick={() => setReferentePrincipale(client.id, ref.id).then(ok => { if (ok) loadReferenti() })}
                            className="p-1.5 rounded-lg hover:bg-white/10" title="Imposta come principale">
                            <Star className="w-3.5 h-3.5" style={{ color: 'var(--yellow)' }} />
                          </button>
                        )}
                        <button onClick={() => setReferenteForm(ref)}
                          className="p-1.5 rounded-lg hover:bg-white/10" title="Modifica">
                          <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
                        </button>
                        <button onClick={() => setDeleteRefTarget(ref)}
                          className="p-1.5 rounded-lg hover:bg-white/10" title="Elimina">
                          <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--red2)' }} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {referenteForm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
                onClick={() => setReferenteForm(null)}>
                <div className="w-full max-w-lg rounded-2xl overflow-hidden"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
                  onClick={e => e.stopPropagation()}>
                  <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--line)' }}>
                    <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                      {referenteForm.id ? 'Modifica Referente' : 'Nuovo Referente'}
                    </h3>
                    <button onClick={() => setReferenteForm(null)} className="p-1.5 rounded-lg hover:bg-white/10">
                      <X className="w-4 h-4" style={{ color: 'var(--muted)' }} />
                    </button>
                  </div>
                  <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Nome *</label>
                        <input type="text" value={referenteForm.nome ?? ''} onChange={e => setReferenteForm({ ...referenteForm, nome: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Cognome *</label>
                        <input type="text" value={referenteForm.cognome ?? ''} onChange={e => setReferenteForm({ ...referenteForm, cognome: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Reparto</label>
                        <input type="text" value={referenteForm.reparto ?? ''} onChange={e => setReferenteForm({ ...referenteForm, reparto: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Ruolo</label>
                        <input type="text" value={referenteForm.ruolo ?? ''} onChange={e => setReferenteForm({ ...referenteForm, ruolo: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Email</label>
                      <input type="email" value={referenteForm.email ?? ''} onChange={e => setReferenteForm({ ...referenteForm, email: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Telefono</label>
                        <input type="tel" value={referenteForm.telefono ?? ''} onChange={e => setReferenteForm({ ...referenteForm, telefono: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
                      </div>
                      <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Cellulare</label>
                        <input type="tel" value={referenteForm.cellulare ?? ''} onChange={e => setReferenteForm({ ...referenteForm, cellulare: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg text-sm bg-transparent" style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>Note</label>
                      <textarea value={referenteForm.note ?? ''} onChange={e => setReferenteForm({ ...referenteForm, note: e.target.value })}
                        rows={3} className="w-full px-3 py-2 rounded-lg text-sm bg-transparent resize-none" style={{ border: '1px solid var(--line)', color: 'var(--text)' }} />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={referenteForm.is_principale ?? false}
                        onChange={e => setReferenteForm({ ...referenteForm, is_principale: e.target.checked })} className="rounded" />
                      <span className="text-sm" style={{ color: 'var(--text)' }}>Referente principale</span>
                    </label>
                  </div>
                  <div className="p-5 flex justify-end gap-3" style={{ borderTop: '1px solid var(--line)' }}>
                    <button onClick={() => setReferenteForm(null)}
                      className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
                      Annulla
                    </button>
                    <button
                      onClick={async () => {
                        if (!referenteForm.nome?.trim() || !referenteForm.cognome?.trim()) return
                        const payload = {
                          id: referenteForm.id || crypto.randomUUID(),
                          client_id: client.id,
                          nome: referenteForm.nome?.trim() ?? '',
                          cognome: referenteForm.cognome?.trim() ?? '',
                          reparto: referenteForm.reparto?.trim() ?? '',
                          ruolo: referenteForm.ruolo?.trim() ?? '',
                          email: referenteForm.email?.trim() ?? '',
                          telefono: referenteForm.telefono?.trim() ?? '',
                          cellulare: referenteForm.cellulare?.trim() ?? '',
                          note: referenteForm.note?.trim() ?? '',
                          is_principale: referenteForm.is_principale ?? false,
                        }
                        if (payload.is_principale) {
                          await setReferentePrincipale(client.id, payload.id)
                          payload.is_principale = true
                        }
                        await upsertReferente(payload)
                        loadReferenti()
                        setReferenteForm(null)
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' }}>
                      {referenteForm.id ? 'Salva' : 'Crea'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {deleteRefTarget && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
                onClick={() => setDeleteRefTarget(null)}>
                <div className="w-full max-w-sm rounded-2xl p-6"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
                  onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>Elimina referente</h3>
                  <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
                    Sei sicuro di voler eliminare <strong>{deleteRefTarget.nome} {deleteRefTarget.cognome}</strong>?
                  </p>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setDeleteRefTarget(null)}
                      className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
                      Annulla
                    </button>
                    <button
                      onClick={async () => {
                        await deleteReferente(deleteRefTarget.id)
                        loadReferenti()
                        setDeleteRefTarget(null)
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ background: 'var(--red2)' }}>
                      Elimina
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>Referenti</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{referenti.length}</span>
                </div>
              </div>
            </div>
            {client.note && (
              <div className="panel p-5 md:col-span-2">
                <p className="text-xs uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Note</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{client.note}</p>
              </div>
            )}
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
                  <div className="absolute left-5 top-0 bottom-0 w-0.5" style={{ background: 'var(--line)' }} />
                  <div className="space-y-5">
                    {clientContatti.map((cnt, i) => {
                      const Icon = contattoIcon(cnt.tipo)
                      const color = contattoColor(cnt.tipo)
                      return (
                        <div key={cnt.id} className="flex gap-5 relative animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                          <div className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: `${color}18`, border: `1.5px solid ${color}40` }}>
                            <Icon className="w-4 h-4" style={{ color }} />
                          </div>
                          <div className="flex-1 pb-5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{cnt.titolo}</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{cnt.note}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span className="text-xs px-2 py-0.5 rounded capitalize" style={{ background: `${color}15`, color }}>
                                  {cnt.tipo}
                                </span>
                                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{formatDate(cnt.data)}</p>
                              </div>
                            </div>
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
                const statoEvtColor = { in_corso: 'var(--red2)', pianificazione: 'var(--blue)', completato: 'var(--green)', bozza: 'var(--yellow)' }[evt.stato]
                const statoEvtLabel = { in_corso: 'In Corso', pianificazione: 'Pianificazione', completato: 'Completato', bozza: 'Bozza' }[evt.stato]
                return (
                  <div key={evt.id} className="panel p-5 flex items-start gap-4">
                    <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ background: statoEvtColor }} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${statoEvtColor}15`, color: statoEvtColor }}>
                        {statoEvtLabel}
                      </span>
                      <p className="font-semibold mt-1" style={{ color: 'var(--text)' }}>{evt.nome}</p>
                      <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--muted)' }}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(evt.dataInizio).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
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
                    </div>
                  ))}
                </div>
              </div>
            )}
            {clientCreative.length === 0 && clientSocial.length === 0 && clientPresentations.length === 0 && (
              <div className="panel p-8 text-center">
                <Palette className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--muted)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Nessun materiale collegato</p>
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
  const [allReferenti, setAllReferenti] = useState<Record<string, Referente[]>>({})

  const refresh = useCallback(async () => {
    const [list, evs, allRefs] = await Promise.all([fetchClients(), fetchEvents(), fetchAllReferenti()])
    setClientList(list)
    setEvents(evs)
    const refMap: Record<string, Referente[]> = {}
    for (const ref of allRefs) {
      if (!refMap[ref.client_id]) refMap[ref.client_id] = []
      refMap[ref.client_id].push(ref)
    }
    setAllReferenti(refMap)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useRealtimeTable('clients', refresh)
  useRealtimeTable('referenti', refresh)

  const filtered = useMemo(() => {
    return clientList.filter(c => {
      const matchFilter = filter === 'Tutti' || c.stato === filter
      const q = search.trim().toLowerCase()
      if (!q) return matchFilter
      const refs = allReferenti[c.id] ?? []
      const matchSearch =
        c.nome.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.citta.toLowerCase().includes(q) ||
        c.settore.toLowerCase().includes(q) ||
        refs.some(r =>
          `${r.nome} ${r.cognome}`.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q)
        )
      return matchFilter && matchSearch
    })
  }, [clientList, filter, search, allReferenti])

  const handleSaved = async (saved: Client) => {
    setShowForm(false)
    setEditTarget(null)
    await refresh()
    if (selected && selected.id === saved.id) setSelected(saved)
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
        <CompanyDetail
          client={selected}
          referenti={allReferenti[selected.id] ?? []}
          onBack={() => setSelected(null)}
          onEdit={() => setEditTarget(selected)}
          onDelete={() => setDeleteTarget(selected)}
          onRefresh={refresh}
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
            title="Eliminare l'azienda?"
            message={`Vuoi eliminare definitivamente "${deleteTarget.nome}"? I referenti collegati verranno rimossi.`}
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
            {filtered.length} aziend{filtered.length !== 1 ? 'e' : 'a'}
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)', color: 'white', boxShadow: 'var(--shadow-red)' }}>
          <Plus className="w-4 h-4" /> Nuova azienda
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl flex-1 min-w-[200px]"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          <input type="text" placeholder="Cerca azienda, referente, email..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
            style={{ color: 'var(--text)' }} />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: filter === f.id ? (f.id === 'Tutti' ? 'linear-gradient(135deg, var(--red) 0%, var(--red2) 100%)' : `${f.color}18`) : 'transparent',
                color: filter === f.id ? (f.id === 'Tutti' ? 'white' : f.color) : 'var(--muted)',
                border: filter === f.id && f.id !== 'Tutti' ? `1px solid ${f.color}35` : '1px solid transparent',
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Company cards grid */}
      {filtered.length === 0 ? (
        <div className="panel p-12 text-center" style={{ color: 'var(--muted)' }}>
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nessuna azienda trovata</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((client, i) => {
            const refs = allReferenti[client.id] ?? []
            return (
              <div
                key={client.id}
                className="panel hover-card p-5 cursor-pointer animate-fade-in relative overflow-hidden"
                style={{ animationDelay: `${i * 40}ms` }}
                onClick={() => setSelected(client)}
              >
                <div className="absolute top-0 right-0 w-24 h-24 opacity-[0.06] rounded-bl-full"
                  style={{ background: statoColor(client.stato) }} />

                <div className="flex items-start gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-bold"
                    style={{ background: `${statoColor(client.stato)}15`, color: statoColor(client.stato) }}>
                    {client.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>
                      {client.nome}
                    </h3>
                    {client.citta && (
                      <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--muted)' }}>
                        <MapPin className="w-3 h-3" /> {client.citta}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: 'var(--muted)' }} />
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: `${statoColor(client.stato)}15`, color: statoColor(client.stato), border: `1px solid ${statoColor(client.stato)}30` }}>
                    {client.stato === 'vip' && <Star className="w-3 h-3 inline mr-0.5 -mt-0.5" />}
                    {statoLabel(client.stato)}
                  </span>
                  {client.settore && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>
                      {client.settore}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
                    <Users className="w-3.5 h-3.5" />
                    {refs.length} referent{refs.length !== 1 ? 'i' : 'e'}
                  </div>
                  <div className="flex items-center gap-1">
                    <FasePipeline fase={client.faseTrattativa} />
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
          title="Eliminare l'azienda?"
          message={`Vuoi eliminare definitivamente "${deleteTarget.nome}"? I referenti collegati verranno rimossi.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
