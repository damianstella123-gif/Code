import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, CameraOff, Keyboard, Loader2, AlertCircle, CheckCircle2, ScanLine } from 'lucide-react'
import { useToast } from '@/lib/toast'
import { boardTransportParticipantByQr, type TransportOperationResult } from '@/lib/transport-service'

interface Props {
  movementId: string
  disabled?: boolean
  onBoarded?: () => void
}

type ViewState =
  | { kind: 'idle' }
  | { kind: 'processing' }
  | { kind: 'success'; result: TransportOperationResult }
  | { kind: 'error'; message: string }

export default function TransportBoardingScanner({ movementId, disabled, onBoarded }: Props) {
  const { showToast } = useToast()
  const [view, setView] = useState<ViewState>({ kind: 'idle' })
  const [cameraActive, setCameraActive] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manualToken, setManualToken] = useState('')

  const scannerRef = useRef<any>(null)
  const startingRef = useRef(false)
  const lastScannedRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const containerIdRef = useRef(`transport-qr-${Math.random().toString(36).slice(2, 10)}`)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ─── Camera Control ──────────────────────────────────────────────────

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    startingRef.current = false
    if (scanner) {
      try {
        const scanning = typeof scanner.isScanning === 'boolean'
          ? scanner.isScanning
          : scanner.getState?.() === 2
        if (scanning) await scanner.stop()
      } catch { /* safe */ }
      try { scanner.clear() } catch { /* safe */ }
    }
    if (mountedRef.current) setCameraActive(false)
  }, [])

  useEffect(() => {
    return () => { stopCamera() }
  }, [stopCamera])

  useEffect(() => {
    if (disabled && cameraActive) stopCamera()
  }, [disabled, cameraActive, stopCamera])

  useEffect(() => {
    stopCamera()
    setView({ kind: 'idle' })
    lastScannedRef.current = null
  }, [movementId, stopCamera])

  const startCamera = useCallback(async () => {
    if (disabled || startingRef.current || scannerRef.current) return
    startingRef.current = true
    lastScannedRef.current = null
    setView({ kind: 'idle' })
    setCameraActive(true)

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      if (!mountedRef.current) return
      const scanner = new Html5Qrcode(containerIdRef.current)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded: string) => { handleScanResult(decoded) },
        () => {},
      )
      startingRef.current = false
    } catch (err: any) {
      const scanner = scannerRef.current
      scannerRef.current = null
      startingRef.current = false
      if (scanner) {
        try { if (scanner.isScanning) await scanner.stop() } catch { /* safe */ }
        try { scanner.clear() } catch { /* safe */ }
      }
      if (mountedRef.current) {
        setCameraActive(false)
        const msg = err?.message?.toLowerCase?.() ?? ''
        if (msg.includes('permission') || msg.includes('denied')) {
          setView({ kind: 'error', message: 'Permesso fotocamera negato. Consenti l\'accesso nelle impostazioni del browser.' })
        } else if (msg.includes('not found') || msg.includes('unavailable') || msg.includes('device')) {
          setView({ kind: 'error', message: 'Fotocamera non disponibile su questo dispositivo.' })
        } else {
          setView({ kind: 'error', message: 'Impossibile avviare la fotocamera.' })
        }
      }
    }
  }, [disabled, movementId])

  // ─── Scan Handling ──────────────────────────────────────────────────

  const handleScanResult = useCallback(async (token: string) => {
    if (!token || token === lastScannedRef.current) return
    lastScannedRef.current = token
    await stopCamera()
    await performBoarding(token)
  }, [stopCamera, movementId])

  async function performBoarding(token: string) {
    if (!mountedRef.current) return
    setView({ kind: 'processing' })
    try {
      const result = await boardTransportParticipantByQr(movementId, token)
      if (!mountedRef.current) return
      if (navigator.vibrate) navigator.vibrate(150)
      setView({ kind: 'success', result })
      showToast('Imbarco registrato.', 'success')
      onBoarded?.()
    } catch (err: any) {
      if (!mountedRef.current) return
      const msg = err?.message ?? ''
      if (msg.includes('ALREADY_BOARDED') || msg.toLowerCase().includes('già')) {
        setView({ kind: 'error', message: 'Questo partecipante è già stato imbarcato.' })
      } else {
        setView({ kind: 'error', message: msg || 'Errore durante l\'imbarco.' })
      }
    }
  }

  // ─── Manual Input ──────────────────────────────────────────────────

  function handleManualSubmit() {
    const trimmed = manualToken.trim()
    if (!trimmed || disabled) return
    lastScannedRef.current = trimmed
    setManualToken('')
    stopCamera()
    performBoarding(trimmed)
  }

  // ─── Reset ─────────────────────────────────────────────────────────

  function resetToScan() {
    lastScannedRef.current = null
    setView({ kind: 'idle' })
    setShowManual(false)
    startCamera()
  }

  // ─── Render ────────────────────────────────────────────────────────

  if (disabled) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          <CameraOff size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p style={{ margin: 0 }}>Scanner non disponibile in modalità di sola lettura.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {/* Camera viewport */}
      <div
        id={containerIdRef.current}
        style={{
          width: '100%',
          minHeight: cameraActive ? 280 : 0,
          height: cameraActive ? 'auto' : 0,
          overflow: 'hidden',
          borderRadius: 'var(--radius-sm)',
          background: cameraActive ? '#111' : 'transparent',
        }}
      />

      {/* ─── IDLE / ERROR: camera controls ─── */}
      {(view.kind === 'idle' || view.kind === 'error') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!cameraActive ? (
            <button onClick={startCamera} style={primaryBtnStyle} aria-label="Avvia fotocamera">
              <Camera size={18} />
              Avvia scansione QR
            </button>
          ) : (
            <button onClick={stopCamera} style={secondaryBtnStyle} aria-label="Ferma fotocamera">
              <CameraOff size={16} />
              Ferma fotocamera
            </button>
          )}

          {/* Error message */}
          {view.kind === 'error' && (
            <div style={errorBoxStyle} role="alert">
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{view.message}</span>
            </div>
          )}

          {/* Retry after error */}
          {view.kind === 'error' && (
            <button onClick={() => { setView({ kind: 'idle' }); startCamera() }} style={secondaryBtnStyle}>
              <ScanLine size={16} />
              Riprova scansione
            </button>
          )}

          {/* Manual fallback toggle */}
          {!showManual ? (
            <button onClick={() => setShowManual(true)} style={linkBtnStyle} aria-label="Inserimento manuale codice">
              <Keyboard size={14} />
              Inserimento manuale codice
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={manualToken}
                onChange={e => setManualToken(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleManualSubmit() }}
                placeholder="Inserisci codice"
                autoComplete="off"
                aria-label="Codice QR manuale"
                style={inputStyle}
              />
              <button
                onClick={handleManualSubmit}
                disabled={!manualToken.trim()}
                style={{ ...primaryBtnStyle, padding: '10px 16px', opacity: manualToken.trim() ? 1 : 0.5 }}
              >
                Verifica
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── PROCESSING ─── */}
      {view.kind === 'processing' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--muted)' }} />
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>Imbarco in corso...</span>
        </div>
      )}

      {/* ─── SUCCESS ─── */}
      {view.kind === 'success' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={successCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <CheckCircle2 size={22} style={{ color: 'var(--green)' }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>Imbarcato</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                {view.result.first_name ?? ''} {view.result.last_name ?? ''}
              </span>
              {view.result.company && (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{view.result.company}</span>
              )}
              {view.result.vehicle_label && (
                <span style={{ fontSize: 13, color: 'var(--text)' }}>
                  Mezzo: <strong>{view.result.vehicle_label}</strong>
                </span>
              )}
              {view.result.boarded_at && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Ora: {formatTime(view.result.boarded_at)}
                </span>
              )}
            </div>
          </div>

          <button onClick={resetToScan} style={primaryBtnStyle}>
            <ScanLine size={16} />
            Scansiona un'altra persona
          </button>
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return '—' }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  width: '100%',
  maxWidth: 420,
  margin: '0 auto',
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 48,
  padding: '12px 14px',
  fontSize: 14,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel)',
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
}

const primaryBtnStyle: React.CSSProperties = {
  minHeight: 48,
  padding: '12px 20px',
  fontSize: 14,
  fontWeight: 600,
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--green)',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
}

const secondaryBtnStyle: React.CSSProperties = {
  minHeight: 48,
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 500,
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--panel-solid)',
  color: 'var(--text)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
}

const linkBtnStyle: React.CSSProperties = {
  minHeight: 48,
  padding: '12px 16px',
  fontSize: 13,
  color: 'var(--muted)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  textDecoration: 'underline',
}

const errorBoxStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: 14,
  borderRadius: 'var(--radius-sm)',
  background: 'rgba(211, 28, 48, 0.08)',
  border: '1px solid rgba(211, 28, 48, 0.2)',
  color: 'var(--red)',
  fontSize: 14,
}

const successCardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 'var(--radius-sm)',
  border: '2px solid var(--green)',
  background: 'var(--panel-solid)',
}
