import { useState, useEffect } from 'react'
import { Heart, Send, Award } from 'lucide-react'
import { giveRecognition, getTeamRecognitionFeed } from '@/lib/wellness-service'
import { supabase } from '@/lib/supabase'
import { loadUser } from '@/lib/auth'

const RECOGNITION_TYPES = [
  { tipo: 'star', emoji: '\u{2B50}', label: 'Star' },
  { tipo: 'teamwork', emoji: '\u{1F91D}', label: 'Team' },
  { tipo: 'creative', emoji: '\u{1F4A1}', label: 'Idea' },
  { tipo: 'resilience', emoji: '\u{1F4AA}', label: 'Forza' },
  { tipo: 'heart', emoji: '\u{2764}\u{FE0F}', label: 'Cuore' },
]

interface TeamMember {
  id: string
  first_name: string
  last_name: string
}

export default function RecognitionWall() {
  const [feed, setFeed] = useState<{
    id: string
    given_by: string
    given_to: string
    tipo: string
    message: string
    created_at: string
  }[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [showModal, setShowModal] = useState(false)
  const [selectedMember, setSelectedMember] = useState('')
  const [selectedType, setSelectedType] = useState('star')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const user = loadUser()

  useEffect(() => {
    loadFeed()
    loadTeam()
  }, [])

  async function loadFeed() {
    const data = await getTeamRecognitionFeed()
    setFeed(data)

    const ids = new Set<string>()
    data.forEach(r => { ids.add(r.given_by); ids.add(r.given_to) })
    if (ids.size > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', Array.from(ids))
      if (profs) {
        const map: Record<string, string> = {}
        profs.forEach(p => { map[p.id] = `${p.first_name} ${p.last_name}`.trim() })
        setProfiles(map)
      }
    }
  }

  async function loadTeam() {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('attivo', true)
      .order('first_name')
    if (data) setTeamMembers(data)
  }

  async function handleSend() {
    if (!selectedMember || !message.trim()) return
    setSending(true)
    await giveRecognition(selectedMember, selectedType, message.trim())
    setSending(false)
    setShowModal(false)
    setMessage('')
    setSelectedMember('')
    await loadFeed()
  }

  const getTypeEmoji = (tipo: string) => {
    return RECOGNITION_TYPES.find(t => t.tipo === tipo)?.emoji || '\u{2B50}'
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m fa`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h fa`
    return `${Math.floor(hours / 24)}g fa`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5" style={{ color: '#f59e0b' }} />
          <h3 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
            Hype Wall
          </h3>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-95"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}
        >
          <Heart className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Applaudi</span>
        </button>
      </div>

      {feed.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Nessun applauso ancora. Sii il primo!
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[320px] overflow-y-auto">
          {feed.map(item => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: 'var(--secondary)' }}
            >
              <span className="text-lg shrink-0 mt-0.5">{getTypeEmoji(item.tipo)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs" style={{ color: 'var(--foreground)' }}>
                  <span className="font-semibold">{profiles[item.given_by] || 'Someone'}</span>
                  {' \u{2192} '}
                  <span className="font-semibold">{profiles[item.given_to] || 'Someone'}</span>
                </p>
                <p className="text-xs mt-0.5 break-words" style={{ color: 'var(--muted)' }}>
                  {item.message}
                </p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--muted)', opacity: 0.7 }}>
                  {timeAgo(item.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div
            className="relative w-full sm:w-[400px] sm:max-w-[90vw] rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
            style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
          >
            <h4 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
              Dai un applauso
            </h4>

            <div className="mb-3">
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>A chi?</label>
              <select
                value={selectedMember}
                onChange={e => setSelectedMember(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{ background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--line)' }}
              >
                <option value="">Seleziona...</option>
                {teamMembers.filter(m => m.id !== user?.id).map(m => (
                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Tipo</label>
              <div className="flex gap-2">
                {RECOGNITION_TYPES.map(t => (
                  <button
                    key={t.tipo}
                    onClick={() => setSelectedType(t.tipo)}
                    className="flex-1 py-2 rounded-xl text-center transition-all active:scale-95"
                    style={{
                      background: selectedType === t.tipo ? 'rgba(245,158,11,0.15)' : 'var(--secondary)',
                      border: selectedType === t.tipo ? '1px solid #f59e0b' : '1px solid transparent',
                    }}
                  >
                    <span className="text-lg">{t.emoji}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Messaggio</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Scrivi qualcosa di carino..."
                className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
                style={{ background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--line)', minHeight: 80 }}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'var(--secondary)', color: 'var(--muted)' }}
              >
                Annulla
              </button>
              <button
                onClick={handleSend}
                disabled={!selectedMember || !message.trim() || sending}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-opacity disabled:opacity-50"
                style={{ background: '#f59e0b', color: '#fff' }}
              >
                <Send className="w-3.5 h-3.5" />
                Invia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
