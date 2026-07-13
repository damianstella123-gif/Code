import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, RotateCcw, Calendar } from 'lucide-react'
import { fetchArchivedEvents, restoreEvent, type ArchivedEvent } from '@/lib/events-service'
import { fetchAllProfiles, type Profile } from '@/lib/profiles'
import { loadUser } from '@/lib/auth'
import { fmtShort } from '@/lib/format'
import { useToast } from '@/lib/toast'

export default function Archivio() {
  const [events, setEvents] = useState<ArchivedEvent[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()
  const navigate = useNavigate()
  const user = loadUser()

  useEffect(() => {
    Promise.all([fetchArchivedEvents(), fetchAllProfiles()])
      .then(([evts, profs]) => {
        setEvents(evts)
        setProfiles(profs)
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return events
    const q = search.toLowerCase()
    return events.filter(e =>
      e.nome.toLowerCase().includes(q) || e.location.toLowerCase().includes(q)
    )
  }, [events, search])

  const grouped = useMemo(() => {
    const map: Record<number, ArchivedEvent[]> = {}
    for (const e of filtered) {
      const year = new Date(e.dataFine).getFullYear()
      if (!map[year]) map[year] = []
      map[year].push(e)
    }
    return Object.entries(map)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, items]) => ({ year: Number(year), items }))
  }, [filtered])

  async function handleRestore(eventId: string) {
    await restoreEvent(eventId)
    setEvents(prev => prev.filter(e => e.id !== eventId))
    showToast('Evento ripristinato', 'success')
  }

  function getArchivedByName(event: ArchivedEvent): string {
    const p = profiles.find(pr => pr.id === event.archiviato_da)
    return p ? `${p.first_name} ${p.last_name}` : ''
  }

  const allowedRoles = ['Project Manager', 'Senior PM', 'Admin', 'Super Admin']
  const canRestore = user && allowedRoles.includes(user.role)

  return (
    <div className="p-4 md:p-6 animate-fade-in" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px 0' }}>
          Archivio Eventi
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
          {events.length} eventi archiviati
        </p>
      </div>

      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search className="w-4 h-4" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome o location..."
          style={{
            width: '100%', padding: '10px 36px', borderRadius: 8,
            border: '1.5px solid var(--line)', background: 'var(--panel-solid)',
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)',
            outline: 'none',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="w-2.5 h-2.5 rounded-full animate-pulse mx-auto" style={{ background: 'var(--red2)' }} />
        </div>
      ) : grouped.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>
          {search ? 'Nessun risultato' : 'Nessun evento archiviato'}
        </p>
      ) : (
        grouped.map(({ year, items }) => (
          <div key={year} style={{ marginBottom: 28 }}>
            <div className="wire-section-title" style={{ marginTop: 0 }}>{year}</div>
            <div className="wire-list-container">
              {items.map(evt => (
                <div key={evt.id} className="wire-card-flat" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {evt.nome}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                      {evt.location} &middot; {fmtShort(evt.dataInizio)} - {fmtShort(evt.dataFine)}
                      {getArchivedByName(evt) && <> &middot; Archiviato da {getArchivedByName(evt)}</>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => navigate(`/eventi?event=${evt.id}`)}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Apri
                    </button>
                    {canRestore && (
                      <button
                        onClick={() => handleRestore(evt.id)}
                        title="Ripristina"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', transition: 'color 0.12s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--green)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
