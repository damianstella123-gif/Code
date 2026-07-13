import { useState, useEffect, useRef } from 'react'
import { Play, Pause, Volume2, VolumeX, Radio } from 'lucide-react'

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
  const [collapsed, setCollapsed] = useState(true)

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
    setCollapsed(false)
  }

  // Collapsed mini-bar
  if (collapsed && !playing) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        className="radio-bar radio-bar--collapsed"
        style={{
          position: 'fixed', bottom: 72, right: 16,
          background: 'var(--panel-solid)', border: '1px solid var(--line)',
          borderRadius: 10, padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          zIndex: 48, cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          transition: 'all 0.2s',
        }}
      >
        <Radio style={{ width: 14, height: 14, color: 'var(--muted)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '.06em' }}>RADIO</span>
        <audio ref={audioRef} />
      </div>
    )
  }

  return (
    <div
      className="radio-bar"
      style={{
        position: 'fixed', bottom: 72, left: 0, right: 0,
        background: 'var(--panel-solid)',
        borderTop: `2px solid ${currentStation.color}`,
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        zIndex: 48,
        backdropFilter: 'blur(12px)',
        boxShadow: '0 -2px 16px rgba(0,0,0,0.1)',
      }}
    >
      <audio ref={audioRef} />

      {/* Live dot + station name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 72 }}>
        {playing && (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: currentStation.color, animation: 'radio-pulse 1.5s infinite', flexShrink: 0 }} />
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: playing ? currentStation.color : 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
          {playing ? currentStation.name : 'RADIO'}
        </span>
      </div>

      {/* Play/Pause */}
      <button
        onClick={() => setPlaying(!playing)}
        style={{
          background: currentStation.color, border: 'none', borderRadius: 8,
          color: '#fff', width: 34, height: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, transition: 'transform 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
      >
        {playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
      </button>

      {/* Stations */}
      <div style={{ display: 'flex', gap: 5, flex: 1, overflowX: 'auto', minWidth: 0, scrollbarWidth: 'none' }}>
        {STATIONS.map(station => (
          <button
            key={station.id}
            onClick={() => switchStation(station)}
            style={{
              padding: '5px 10px', borderRadius: 6,
              border: currentStation.id === station.id ? `1.5px solid ${station.color}` : '1px solid var(--line)',
              background: currentStation.id === station.id ? `${station.color}15` : 'transparent',
              color: currentStation.id === station.id ? station.color : 'var(--muted)',
              cursor: 'pointer', fontFamily: 'var(--font-mono)',
              fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {station.name}
          </button>
        ))}
      </div>

      {/* Volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
          style={{ width: 50, height: 3, borderRadius: 2, outline: 'none', cursor: 'pointer', accentColor: currentStation.color }}
        />
      </div>

      {/* Collapse */}
      <button
        onClick={() => { setCollapsed(true); setPlaying(false) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 6px' }}
        title="Chiudi radio"
      >
        X
      </button>

      <style>{`
        @keyframes radio-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        .radio-bar::-webkit-scrollbar { display: none; }
        @media (min-width: 1024px) {
          .radio-bar { bottom: 0 !important; }
          .radio-bar--collapsed { bottom: 16px !important; }
        }
      `}</style>
    </div>
  )
}
