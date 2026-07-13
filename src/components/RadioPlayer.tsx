import { useState, useEffect, useRef } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'

const STATIONS = [
  { id: 'capital', name: 'Capital', color: '#FF6B6B', stream: 'https://streamcdnb10-dd67e65685984f298c56ae58aedf3b53.msvdn.net/webradio/Capital' },
  { id: 'deejay', name: 'DeeJay', color: '#4ECDC4', stream: 'https://streamcdnb10-dd67e65685984f298c56ae58aedf3b53.msvdn.net/webradio/deejay' },
  { id: 'rtl', name: 'RTL', color: '#FFE66D', stream: 'https://streamcdnb10-dd67e65685984f298c56ae58aedf3b53.msvdn.net/webradio/rtl1025' },
  { id: 'rds', name: 'RDS', color: '#95E1D3', stream: 'https://stream3.rds.it:8000/rds64k' },
  { id: 'virgin', name: 'Virgin', color: '#C7CEEA', stream: 'https://streamcdnb10-dd67e65685984f298c56ae58aedf3b53.msvdn.net/webradio/virginradio' },
  { id: 'radio24', name: 'Radio24', color: '#F38181', stream: 'https://shoutcast.radio24.it:8000/;' },
]

const LS_STATION = 'radio_station'
const LS_VOLUME = 'radio_volume'

export function RadioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null)
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
    if (playing) audioRef.current.play().catch(() => setPlaying(false))
  }, [currentStation])

  useEffect(() => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.play().catch(() => setPlaying(false))
    } else {
      audioRef.current.pause()
    }
  }, [playing])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : volume
    }
  }, [volume, muted])

  const switchStation = (station: typeof STATIONS[0]) => {
    setCurrentStation(station)
    if (!playing) setPlaying(true)
  }

  const nextStation = () => {
    const idx = STATIONS.findIndex(s => s.id === currentStation.id)
    switchStation(STATIONS[(idx + 1) % STATIONS.length])
  }

  return (
    <>
      <audio ref={audioRef} />
      <div
        onClick={() => { if (!expanded) setExpanded(true) }}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 999,
          background: 'var(--panel-solid)',
          border: `1.5px solid ${playing ? currentStation.color : 'var(--line)'}`,
          borderRadius: expanded ? 12 : 99,
          maxWidth: expanded ? 500 : 44,
          overflow: 'hidden',
          padding: expanded ? '12px 16px' : '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: expanded ? 10 : 0,
          cursor: expanded ? 'default' : 'pointer',
          boxShadow: `0 4px 20px rgba(0,0,0,0.15)${playing ? `, 0 0 12px ${currentStation.color}30` : ''}`,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          whiteSpace: 'nowrap',
        }}
      >
        {/* Collapsed: just the mic emoji with pulse */}
        {!expanded && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20 }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>🎙️</span>
            {playing && (
              <div style={{
                position: 'absolute',
                inset: -4,
                borderRadius: '50%',
                border: `2px solid ${currentStation.color}`,
                animation: 'radio-pill-pulse 1.5s ease-in-out infinite',
                pointerEvents: 'none',
              }} />
            )}
          </div>
        )}

        {/* Expanded controls */}
        {expanded && (
          <>
            {/* Live dot + station name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 60 }}>
              {playing && (
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: currentStation.color,
                  animation: 'radio-pill-pulse 1.5s infinite',
                  flexShrink: 0,
                }} />
              )}
              <span
                onClick={nextStation}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  color: playing ? currentStation.color : 'var(--muted)',
                  letterSpacing: '.04em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
                title="Cambia stazione"
              >
                {currentStation.name}
              </span>
            </div>

            {/* Play/Pause */}
            <button
              onClick={() => setPlaying(!playing)}
              style={{
                background: currentStation.color, border: 'none', borderRadius: 8,
                color: '#fff', width: 30, height: 30,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, transition: 'transform 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
            >
              {playing ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 1 }} />}
            </button>

            {/* Stations */}
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {STATIONS.map(station => (
                <button
                  key={station.id}
                  onClick={() => switchStation(station)}
                  style={{
                    padding: '4px 8px', borderRadius: 6,
                    border: currentStation.id === station.id ? `1.5px solid ${station.color}` : '1px solid var(--line)',
                    background: currentStation.id === station.id ? `${station.color}15` : 'transparent',
                    color: currentStation.id === station.id ? station.color : 'var(--muted)',
                    cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                    transition: 'all 0.15s',
                  }}
                >
                  {station.name}
                </button>
              ))}
            </div>

            {/* Volume */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => setMuted(!muted)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted ? 'var(--red2)' : 'var(--muted)', display: 'flex', alignItems: 'center', padding: 2 }}
              >
                {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <input
                type="range" min="0" max="1" step="0.05"
                value={muted ? 0 : volume}
                onChange={e => { setVolume(Number(e.target.value)); setMuted(Number(e.target.value) === 0) }}
                style={{ width: 44, height: 3, borderRadius: 2, outline: 'none', cursor: 'pointer', accentColor: currentStation.color }}
              />
            </div>

            {/* Close / Collapse */}
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--muted)', fontSize: 14, padding: '2px 4px',
                lineHeight: 1, display: 'flex', alignItems: 'center',
              }}
              title="Chiudi"
            >
              ✕
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes radio-pill-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
      `}</style>
    </>
  )
}
