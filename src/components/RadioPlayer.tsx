import { useState, useEffect, useRef } from 'react'
import { Play, Pause, Volume2, VolumeX, ChevronDown } from 'lucide-react'

const STATIONS = [
  { id: 'capital', name: 'Capital', color: '#FF6B6B', stream: 'https://radiocapital-lh.akamaihd.net/i/RadioCapital_Live_1@196312/master.m3u8' },
  { id: 'deejay', name: 'DeeJay', color: '#4ECDC4', stream: 'https://radiodeejay-lh.akamaihd.net/i/RadioDeejay_Live_1@189857/master.m3u8' },
  { id: 'rtl', name: 'RTL', color: '#FFE66D', stream: 'https://streamingv2.shoutcast.com/rtl-1025' },
  { id: 'rds', name: 'RDS', color: '#95E1D3', stream: 'https://icstream.rds.radio/rds' },
  { id: 'virgin', name: 'Virgin', color: '#C7CEEA', stream: 'https://icecast.unitedradio.it/Virgin.mp3' },
  { id: 'radio105', name: 'Radio105', color: '#F38181', stream: 'https://icecast.unitedradio.it/Radio105.mp3' },
]

const LS_STATION = 'radio_station'
const LS_VOLUME = 'radio_volume'

export function RadioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentStation, setCurrentStation] = useState(STATIONS[0])
  const [volume, setVolume] = useState(0.7)
  const [muted, setMuted] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const savedStation = localStorage.getItem(LS_STATION)
    const savedVolume = localStorage.getItem(LS_VOLUME)
    if (savedStation) {
      const station = STATIONS.find(s => s.id === savedStation)
      if (station) setCurrentStation(station)
    }
    if (savedVolume) setVolume(Number(savedVolume))
  }, [])

  useEffect(() => {
    localStorage.setItem(LS_STATION, currentStation.id)
  }, [currentStation])

  useEffect(() => {
    localStorage.setItem(LS_VOLUME, String(volume))
  }, [volume])

  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.src = currentStation.stream
    if (playing) audioRef.current.play().catch((err) => {
      console.warn('[Radio] Play failed on station switch:', currentStation.name, err.message)
      setPlaying(false)
    })
  }, [currentStation])

  useEffect(() => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.play().catch((err) => {
        console.warn('[Radio] Play failed:', currentStation.name, err.message)
        setPlaying(false)
      })
    } else {
      audioRef.current.pause()
    }
  }, [playing])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume
    }
  }, [volume, muted])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onError = () => {
      const code = audio.error?.code
      const msg = audio.error?.message || 'unknown'
      console.error('[Radio] Audio error:', currentStation.name, `code=${code}`, msg)
      setPlaying(false)
    }
    const onPlaying = () => {
      console.log('[Radio] Now playing:', currentStation.name)
    }
    audio.addEventListener('error', onError)
    audio.addEventListener('playing', onPlaying)
    return () => {
      audio.removeEventListener('error', onError)
      audio.removeEventListener('playing', onPlaying)
    }
  }, [currentStation])

  useEffect(() => {
    if (!expanded) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [expanded])

  const switchStation = (station: typeof STATIONS[0]) => {
    setCurrentStation(station)
    if (!playing) setPlaying(true)
  }

  return (
    <div ref={containerRef} className="relative hidden sm:block">
      <audio ref={audioRef} crossOrigin="anonymous" />

      {/* Collapsed pill trigger */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 rounded-full transition-all hover:bg-white/5"
        style={{
          padding: '6px 10px',
          border: `1.5px solid ${playing ? currentStation.color : 'var(--line)'}`,
          background: playing ? `${currentStation.color}10` : 'transparent',
        }}
      >
        <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14 }}>
          <span style={{ fontSize: 12, lineHeight: 1 }}>🎙️</span>
          {playing && (
            <span style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              border: `1.5px solid ${currentStation.color}`,
              animation: 'radio-pill-pulse 1.5s ease-in-out infinite',
              pointerEvents: 'none',
            }} />
          )}
        </span>
        {playing && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: currentStation.color, letterSpacing: '.04em' }}>
            {currentStation.name.slice(0, 3).toUpperCase()}
          </span>
        )}
        <ChevronDown size={10} style={{ color: 'var(--muted)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* Expanded dropdown */}
      {expanded && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 60,
            background: 'var(--panel-solid)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: 14,
            minWidth: 260,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}
        >
          {/* Now playing + controls */}
          <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
            {/* Play/Pause */}
            <button
              onClick={() => setPlaying(!playing)}
              style={{
                background: currentStation.color, border: 'none', borderRadius: 8,
                color: '#fff', width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, transition: 'transform 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
            >
              {playing ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 1 }} />}
            </button>

            {/* Station name + live */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="flex items-center gap-2">
                {playing && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: currentStation.color,
                    animation: 'radio-pill-pulse 1.5s infinite',
                    flexShrink: 0,
                  }} />
                )}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: playing ? currentStation.color : 'var(--text)', letterSpacing: '.02em' }}>
                  {currentStation.name}
                </span>
                {playing && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: currentStation.color, background: `${currentStation.color}15`, padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>
                    LIVE
                  </span>
                )}
              </div>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
              <button
                onClick={() => setMuted(!muted)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted ? 'var(--red2)' : 'var(--muted)', display: 'flex', alignItems: 'center', padding: 2 }}
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <input
                type="range" min="0" max="1" step="0.05"
                value={muted ? 0 : volume}
                onChange={e => { setVolume(Number(e.target.value)); setMuted(Number(e.target.value) === 0) }}
                style={{ width: 48, height: 3, borderRadius: 2, outline: 'none', cursor: 'pointer', accentColor: currentStation.color }}
              />
            </div>
          </div>

          {/* Station grid */}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Stazioni</p>
            <div className="grid grid-cols-3 gap-2">
              {STATIONS.map(station => (
                <button
                  key={station.id}
                  onClick={() => switchStation(station)}
                  className="transition-all"
                  style={{
                    padding: '6px 8px', borderRadius: 8,
                    border: currentStation.id === station.id ? `1.5px solid ${station.color}` : '1px solid var(--line)',
                    background: currentStation.id === station.id ? `${station.color}12` : 'transparent',
                    color: currentStation.id === station.id ? station.color : 'var(--muted)',
                    cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    fontSize: 10, fontWeight: 600, textAlign: 'center',
                  }}
                >
                  {station.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes radio-pill-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}
