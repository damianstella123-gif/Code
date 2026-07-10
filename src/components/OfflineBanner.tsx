import { useEffect, useState } from 'react'

export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const goOn = () => {
      setOnline(true)
      setShow(true)
      setTimeout(() => setShow(false), 4000)
    }
    const goOff = () => {
      setOnline(false)
      setShow(true)
    }
    window.addEventListener('online', goOn)
    window.addEventListener('offline', goOff)
    return () => {
      window.removeEventListener('online', goOn)
      window.removeEventListener('offline', goOff)
    }
  }, [])

  if (!show && online) return null

  return (
    <div style={{
      position: 'fixed', top: 52,
      left: 0, right: 0, zIndex: 200,
      padding: '6px 0',
      background: online ? '#2fa86b' : '#EF9F27',
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: 8
    }}>
      <span style={{ fontSize: 14 }}>
        {online ? '\u2713' : '\u26A0\uFE0F'}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11, color: 'white',
        letterSpacing: '.08em'
      }}>
        {online
          ? 'CONNESSIONE RIPRISTINATA'
          : 'OFFLINE \u2014 i dati gi\u00E0 visitati restano disponibili. Fly non disponibile.'}
      </span>
    </div>
  )
}
