import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, X, Calendar, Users, Briefcase, CheckSquare, PawPrint, Check, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Client } from '@/data/clients'

interface CommandBarProps {
  events: Event[]
  tasks: Task[]
  clients: Client[]
  onFilter?: (filter: string) => void
}

interface FlyEntity {
  type: 'event' | 'supplier' | 'task' | 'client'
  id: string
  nome?: string
  data?: string
  stato?: string
  categoria?: string
  citta?: string
  scadenza?: string
  priorita?: string
  [key: string]: unknown
}

interface FlyProposal {
  action: string
  params: Record<string, unknown>
}

interface FlyMessage {
  role: 'user' | 'assistant'
  content: string
  entities?: FlyEntity[]
  proposal?: FlyProposal | null
  proposalStatus?: 'pending' | 'confirmed' | 'rejected' | 'executing' | 'done' | 'failed'
}

// ─── Entity Card ──────────────────────────────────────────────────────────────

function getCountdown(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const now = new Date()
  const diff = Math.ceil((target.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return `T+${Math.abs(diff)}`
  if (diff === 0) return 'OGGI'
  return `T-${diff}`
}

const ENTITY_ICONS: Record<string, typeof Calendar> = {
  event: Calendar,
  supplier: Briefcase,
  task: CheckSquare,
  client: Users,
}

const STATO_COLORS: Record<string, string> = {
  pianificazione: 'var(--blue)',
  in_corso: 'var(--green)',
  completato: 'var(--muted)',
  bozza: 'var(--yellow)',
  attivo: 'var(--green)',
  lead: 'var(--blue)',
  da_fare: 'var(--yellow)',
  in_lavorazione: 'var(--blue)',
  completata: 'var(--green)',
}

function EntityCard({ entity, navigate }: { entity: FlyEntity; navigate: (path: string) => void }) {
  const Icon = ENTITY_ICONS[entity.type] || Calendar
  const countdown = entity.type === 'event' ? getCountdown(entity.data as string) : null
  const statoColor = STATO_COLORS[(entity.stato || '').toLowerCase()] || 'var(--muted)'

  function handleClick() {
    switch (entity.type) {
      case 'event': navigate(`/eventi?id=${entity.id}`); break
      case 'supplier': navigate('/fornitori'); break
      case 'task': navigate('/task'); break
      case 'client': navigate(`/crm?client=${entity.id}`); break
    }
  }

  return (
    <button
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid var(--line)',
        background: 'var(--panel2)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 150ms, background 150ms',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--red2)'
        ;(e.currentTarget as HTMLElement).style.background = 'rgba(208,0,58,0.04)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--line)'
        ;(e.currentTarget as HTMLElement).style.background = 'var(--panel2)'
      }}
    >
      <Icon style={{ width: 14, height: 14, color: 'var(--muted)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {entity.nome || entity.id}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 2,
        }}>
          {entity.stato && (
            <span style={{
              padding: '1px 5px',
              borderRadius: 3,
              background: `${statoColor}18`,
              color: statoColor,
              fontWeight: 600,
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}>
              {entity.stato}
            </span>
          )}
          {entity.data && <span>{entity.data}</span>}
          {entity.categoria && <span>{entity.categoria}</span>}
          {entity.citta && <span>{entity.citta}</span>}
          {entity.scadenza && <span>{entity.scadenza}</span>}
        </div>
      </div>
      {countdown && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          fontWeight: 700,
          color: countdown.startsWith('T+') ? 'var(--red2)' : countdown === 'OGGI' ? 'var(--yellow)' : 'var(--green)',
          flexShrink: 0,
        }}>
          {countdown}
        </span>
      )}
    </button>
  )
}

// ─── Main CommandBar ──────────────────────────────────────────────────────────

export default function CommandBar({ events, tasks, clients, onFilter }: CommandBarProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [flyOpen, setFlyOpen] = useState(false)
  const [flyHistory, setFlyHistory] = useState<FlyMessage[]>([])
  const [flyLoading, setFlyLoading] = useState(false)
  const [flyInput, setFlyInput] = useState('')
  const [flyError, setFlyError] = useState<string | null>(null)
  const flyEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    flyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [flyHistory, flyLoading])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null

    const matchedEvents = events
      .filter(e => e.nome.toLowerCase().includes(q) || e.location.toLowerCase().includes(q))
      .slice(0, 5)

    const matchedTasks = tasks
      .filter(t => t.titolo.toLowerCase().includes(q))
      .slice(0, 5)

    const matchedClients = clients
      .filter(c => c.nome.toLowerCase().includes(q))
      .slice(0, 5)

    if (matchedEvents.length === 0 && matchedTasks.length === 0 && matchedClients.length === 0) {
      return null
    }

    return { events: matchedEvents, tasks: matchedTasks, clients: matchedClients }
  }, [query, events, tasks, clients])

  const handleSelect = useCallback((type: 'event' | 'task' | 'client', id: string) => {
    setQuery('')
    setFocused(false)
    if (type === 'event') navigate(`/eventi?id=${id}`)
    else if (type === 'task') navigate('/task')
    else navigate('/crm')
  }, [navigate])

  const [flyStreaming, setFlyStreaming] = useState(false)

  const askFly = useCallback(async (text: string) => {
    if (!text.trim() || flyLoading) return

    const userMsg: FlyMessage = { role: 'user', content: text.trim() }
    const newHistory = [...flyHistory, userMsg]
    setFlyHistory(newHistory)
    setFlyInput('')
    setFlyError(null)
    setFlyLoading(true)
    setFlyStreaming(true)

    // Add a placeholder assistant message for streaming
    const assistantIdx = newHistory.length
    const streamingHistory = [...newHistory, { role: 'assistant' as const, content: '' }]
    setFlyHistory(streamingHistory)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Non autenticato')

      const res = await fetch('https://vbsligpuwjzvywkpkhdn.supabase.co/functions/v1/fly-gateway', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZic2xpZ3B1d2p6dnl3a3BraGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDIyNDAsImV4cCI6MjA5NjgxODI0MH0.YaHlfxvKtht8WSg9xWxT3nrFxsJAmC4HcgunLqZwiOQ',
        },
        body: JSON.stringify({ message: text.trim(), history: flyHistory }),
      })

      if (!res.ok) {
        const errBody = await res.text()
        let errMsg = 'Errore di connessione'
        try { errMsg = JSON.parse(errBody).error || errMsg } catch {}
        throw new Error(errMsg)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('Stream non disponibile')

      const decoder = new TextDecoder()
      let accumulated = ''
      let entities: FlyEntity[] = []
      let proposal: FlyProposal | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') break

          try {
            const parsed = JSON.parse(payload)
            if (parsed.type === 'text') {
              accumulated += parsed.content
              setFlyHistory(prev => {
                const updated = [...prev]
                updated[assistantIdx] = { ...updated[assistantIdx], content: accumulated }
                return updated
              })
            } else if (parsed.type === 'meta') {
              entities = Array.isArray(parsed.entities) ? parsed.entities : []
              proposal = parsed.proposal || null
            }
          } catch {}
        }
      }

      // Finalize with entities and proposal
      setFlyHistory(prev => {
        const updated = [...prev]
        updated[assistantIdx] = {
          ...updated[assistantIdx],
          content: accumulated || '(nessuna risposta)',
          entities,
          proposal,
          proposalStatus: proposal ? 'pending' : undefined,
        }
        return updated
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore imprevisto'
      setFlyError(msg)
      // Remove the empty assistant placeholder on error
      setFlyHistory(newHistory)
    } finally {
      setFlyLoading(false)
      setFlyStreaming(false)
    }
  }, [flyHistory, flyLoading])

  const confirmProposal = useCallback(async (msgIndex: number) => {
    const msg = flyHistory[msgIndex]
    if (!msg?.proposal || msg.proposalStatus !== 'pending') return

    const updated = [...flyHistory]
    updated[msgIndex] = { ...msg, proposalStatus: 'executing' }
    setFlyHistory(updated)

    try {
      const { data, error } = await supabase.functions.invoke('fly-gateway', {
        body: { action: 'execute', proposal: msg.proposal },
      })

      if (error) throw new Error(error.message)
      if (!data?.success) throw new Error(data?.message || 'Errore esecuzione')

      const final = [...updated]
      final[msgIndex] = { ...msg, proposalStatus: 'done' }
      final.push({ role: 'assistant', content: `Fatto. ${data.message}` })
      setFlyHistory(final)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Errore'
      const final = [...updated]
      final[msgIndex] = { ...msg, proposalStatus: 'failed' }
      final.push({ role: 'assistant', content: `Errore: ${errMsg}` })
      setFlyHistory(final)
    }
  }, [flyHistory])

  const rejectProposal = useCallback((msgIndex: number) => {
    const msg = flyHistory[msgIndex]
    if (!msg?.proposal || msg.proposalStatus !== 'pending') return

    const updated = [...flyHistory]
    updated[msgIndex] = { ...msg, proposalStatus: 'rejected' }
    updated.push({ role: 'assistant', content: 'Ok, azione annullata.' })
    setFlyHistory(updated)
  }, [flyHistory])

  const openFlyWithQuery = useCallback((text: string) => {
    setFlyOpen(true)
    setFocused(false)
    setQuery('')
    if (text.trim()) {
      setFlyInput(text.trim())
      askFly(text.trim())
    }
  }, [askFly])

  const handleFlyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      askFly(flyInput)
    }
  }

  const handleBarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      openFlyWithQuery(query)
    }
  }

  const suggestions = [
    { label: 'cosa scade oggi?', filter: 'scade_oggi' },
    { label: 'eventi in corso', filter: 'eventi_in_corso' },
    { label: 'clienti attivi', filter: 'clienti_attivi' },
  ]

  const showDropdown = focused

  return (
    <div ref={containerRef} className="cmd-bar-wrapper">
      <div className="cmd-bar">
        <PawPrint style={{ width: 16, height: 16, color: 'var(--muted)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleBarKeyDown}
          placeholder="Chiedi a Fly o cerca qualsiasi cosa..."
          className="cmd-bar-input"
        />
      </div>

      {showDropdown && (
        <div className="cmd-dropdown">
          {!query.trim() ? (
            <div className="cmd-suggestions">
              {suggestions.map(s => (
                <button
                  key={s.filter}
                  className="cmd-suggestion-pill"
                  onClick={() => {
                    onFilter?.(s.filter)
                    setFocused(false)
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="cmd-results">
              {results && results.events.length > 0 && (
                <div className="cmd-group">
                  <span className="cmd-group-label">EVENTI</span>
                  {results.events.map(e => (
                    <button key={e.id} className="cmd-result" onClick={() => handleSelect('event', e.id)}>
                      <span className="cmd-result-name">{e.nome}</span>
                      <span className="cmd-result-ctx">{e.location} · {e.stato}</span>
                    </button>
                  ))}
                </div>
              )}
              {results && results.tasks.length > 0 && (
                <div className="cmd-group">
                  <span className="cmd-group-label">TASK</span>
                  {results.tasks.map(t => (
                    <button key={t.id} className="cmd-result" onClick={() => handleSelect('task', t.id)}>
                      <span className="cmd-result-name">{t.titolo}</span>
                      <span className="cmd-result-ctx">{t.stato} · {t.assegnatario || 'non assegnato'}</span>
                    </button>
                  ))}
                </div>
              )}
              {results && results.clients.length > 0 && (
                <div className="cmd-group">
                  <span className="cmd-group-label">CLIENTI</span>
                  {results.clients.map(c => (
                    <button key={c.id} className="cmd-result" onClick={() => handleSelect('client', c.id)}>
                      <span className="cmd-result-name">{c.nome}</span>
                      <span className="cmd-result-ctx">{c.settore} · {c.stato}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Ask Fly - always at the bottom */}
              <div className="cmd-group" style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4 }}>
                <button className="cmd-result" onClick={() => openFlyWithQuery(query)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PawPrint style={{ width: 12, height: 12, color: 'var(--muted)', flexShrink: 0 }} />
                  <span className="cmd-result-name" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    CHIEDI A FLY
                  </span>
                  <span className="cmd-result-ctx">"{query}"</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fly Conversation Panel */}
      {flyOpen && (
        <div className="fly-panel">
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--line)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PawPrint style={{
                width: 14, height: 14, color: 'var(--muted)',
                transition: 'opacity 0.8s ease',
                opacity: flyLoading ? undefined : 1,
                animation: flyLoading ? 'fly-paw-pulse 1.6s ease-in-out infinite' : 'none',
              }} />
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: 'var(--muted)',
              }}>
                FLY
              </span>
              {flyLoading && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>
                  sta cercando...
                </span>
              )}
            </div>
            <button onClick={() => setFlyOpen(false)} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
          }}>
            {flyHistory.length === 0 && !flyLoading && (
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Chiedi qualsiasi cosa sui tuoi dati
                </p>
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  {['Cosa scade questa settimana?', 'Eventi di questo mese', 'Fornitori categoria hotel'].map(s => (
                    <button key={s} onClick={() => askFly(s)} style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: '1px solid var(--line)',
                      background: 'transparent',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {flyHistory.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                width: msg.role === 'assistant' ? '100%' : undefined,
              }}>
                {msg.role === 'user' ? (
                  <div style={{
                    background: 'var(--panel2)',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: 'var(--text)',
                  }}>
                    {msg.content}
                  </div>
                ) : (
                  <div>
                    <div style={{
                      borderLeft: '2px solid var(--red2)',
                      paddingLeft: 12,
                      fontSize: '12px',
                      lineHeight: '1.6',
                      color: 'var(--text)',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {msg.content}
                      {flyStreaming && i === flyHistory.length - 1 && msg.role === 'assistant' && (
                        <span className="fly-cursor" />
                      )}
                    </div>
                    {msg.entities && msg.entities.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                        {msg.entities.slice(0, 5).map((ent, ei) => (
                          <EntityCard key={ei} entity={ent} navigate={navigate} />
                        ))}
                      </div>
                    )}
                    {msg.proposal && msg.proposalStatus === 'pending' && (
                      <div style={{
                        display: 'flex', gap: 8, marginTop: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(208,0,58,0.04)',
                        border: '1px solid rgba(208,0,58,0.15)',
                      }}>
                        <button
                          onClick={() => confirmProposal(i)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '5px 12px', borderRadius: 6,
                            background: 'var(--green)', color: '#fff',
                            border: 'none', cursor: 'pointer',
                            fontFamily: 'var(--font-mono)', fontSize: '10px',
                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}
                        >
                          <Check style={{ width: 12, height: 12 }} />
                          Conferma
                        </button>
                        <button
                          onClick={() => rejectProposal(i)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '5px 12px', borderRadius: 6,
                            background: 'transparent', color: 'var(--muted)',
                            border: '1px solid var(--line)', cursor: 'pointer',
                            fontFamily: 'var(--font-mono)', fontSize: '10px',
                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                          }}
                        >
                          <XCircle style={{ width: 12, height: 12 }} />
                          Annulla
                        </button>
                      </div>
                    )}
                    {msg.proposal && msg.proposalStatus === 'executing' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <PawPrint style={{ width: 12, height: 12, color: 'var(--muted)', animation: 'fly-paw-pulse 1.6s ease-in-out infinite' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>Esecuzione...</span>
                      </div>
                    )}
                    {msg.proposal && msg.proposalStatus === 'done' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <Check style={{ width: 12, height: 12, color: 'var(--green)' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--green)' }}>Eseguita</span>
                      </div>
                    )}
                    {msg.proposal && msg.proposalStatus === 'failed' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <XCircle style={{ width: 12, height: 12, color: 'var(--red2)' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--red2)' }}>Non riuscita</span>
                      </div>
                    )}
                    {msg.proposal && msg.proposalStatus === 'rejected' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                        <XCircle style={{ width: 12, height: 12, color: 'var(--muted)' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>Annullata</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {flyLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PawPrint className="w-3.5 h-3.5" style={{ color: 'var(--muted)', animation: 'fly-paw-pulse 1.6s ease-in-out infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)' }}>
                  Fly sta cercando...
                </span>
              </div>
            )}

            {flyError && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 6,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                fontSize: '11px',
                color: 'var(--red2)',
                fontFamily: 'var(--font-mono)',
              }}>
                {flyError}
              </div>
            )}

            <div ref={flyEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 16px',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <input
              type="text"
              value={flyInput}
              onChange={e => setFlyInput(e.target.value)}
              onKeyDown={handleFlyKeyDown}
              placeholder="Scrivi a Fly..."
              disabled={flyLoading}
              autoFocus
              style={{
                flex: 1,
                background: 'var(--panel2)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: '12px',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => askFly(flyInput)}
              disabled={flyLoading || !flyInput.trim()}
              style={{
                background: 'var(--red2)',
                border: 'none',
                borderRadius: 8,
                padding: '8px 10px',
                cursor: flyLoading || !flyInput.trim() ? 'not-allowed' : 'pointer',
                opacity: flyLoading || !flyInput.trim() ? 0.4 : 1,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Send className="w-3.5 h-3.5" style={{ color: 'white' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
