import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Event } from '@/data/events'
import type { Task } from '@/data/tasks'
import type { Client } from '@/data/clients'

interface CommandBarProps {
  events: Event[]
  tasks: Task[]
  clients: Client[]
  onFilter?: (filter: string) => void
}

export default function CommandBar({ events, tasks, clients, onFilter }: CommandBarProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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

  const suggestions = [
    { label: 'cosa scade oggi?', filter: 'scade_oggi' },
    { label: 'eventi in corso', filter: 'eventi_in_corso' },
    { label: 'clienti attivi', filter: 'clienti_attivi' },
  ]

  const showDropdown = focused && (results || !query.trim())

  return (
    <div ref={containerRef} className="cmd-bar-wrapper">
      <div className="cmd-bar">
        <div className="cmd-bar-dot" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Chiedi o cerca qualsiasi cosa..."
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
          ) : results ? (
            <div className="cmd-results">
              {results.events.length > 0 && (
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
              {results.tasks.length > 0 && (
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
              {results.clients.length > 0 && (
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
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
