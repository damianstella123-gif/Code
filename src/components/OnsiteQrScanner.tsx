import { useState, useRef, useCallback, useEffect } from 'react'
import {
  lookupOnsiteRegistration,
  checkInOnsiteRegistration,
  undoOnsiteRegistrationCheckIn,
  OnsiteRegistration,
} from '@/lib/onsite-registration-service'

interface Props {
  eventId: string
  disabled?: boolean
}

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'participant'; data: OnsiteRegistration }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

export default function OnsiteQrScanner({ eventId, disabled }: Props) {
  const [view, setView] = useState<ViewState>({ kind: 'idle' })
  const [cameraActive, setCameraActive] = useState(false)
  const [manualToken, setManualToken] = useState('')
  const [undoConfirm, setUndoConfirm] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const scannerRef = useRef<any>(null)
  const lastScannedRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const containerIdRef = useRef(`qr-reader-${Math.random().toString(36).slice(2, 10)}`)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState?.()
        if (state === 2) {
          await scannerRef.current.stop()
        }
        scannerRef.current.clear()
      } catch { /* safe cleanup */ }
      scannerRef.current = null
    }
    if (mountedRef.current) setCameraActive(false)
  }, [])

  useEffect(() => {
    return () => { stopCamera() }
  }, [stopCamera])

  const handleScanResult = useCallback(async (token: string) => {
    if (!token || token === lastScannedRef.current) return
    lastScannedRef.current = token
    await stopCamera()
    await performLookup(token)
  }, [eventId, stopCamera])

  const startCamera = useCallback(async () => {
    if (disabled) return
    lastScannedRef.current = null
    setView({ kind: 'idle' })

    const { Html5Qrcode } = await import('html5-qrcode')
    const scanner = new Html5Qrcode(containerIdRef.current)
    scannerRef.current = scanner

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded: string) => { handleScanResult(decoded) },
        () => {}
      )
      if (mountedRef.current) setCameraActive(true)
    } catch (err: any) {
      if (mountedRef.current) {
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
  }, [disabled, handleScanResult])

  async function performLookup(token: string) {
    if (!mountedRef.current) return
    setView({ kind: 'loading' })
    try {
      const data = await lookupOnsiteRegistration(eventId, token)
      if (mountedRef.current) setView({ kind: 'participant', data })
    } catch (err: any) {
      if (mountedRef.current) setView({ kind: 'error', message: err?.message || 'Codice QR non valido.' })
    }
  }

  async function handleManualSubmit() {
    const trimmed = manualToken.trim()
    if (!trimmed || disabled) return
    lastScannedRef.current = trimmed
    setManualToken('')
    await stopCamera()
    await performLookup(trimmed)
  }

  async function handleCheckIn() {
    if (actionLoading || disabled || view.kind !== 'participant') return
    const token = lastScannedRef.current
    if (!token) return
    setActionLoading(true)
    try {
      await checkInOnsiteRegistration(eventId, token)
      if (navigator.vibrate) navigator.vibrate(120)
      if (mountedRef.current) setView({ kind: 'success' })
    } catch (err: any) {
      if (mountedRef.current) setView({ kind: 'error', message: err?.message || 'Errore imprevisto.' })
    } finally {
      if (mountedRef.current) setActionLoading(false)
    }
  }

  async function handleUndoCheckIn() {
    if (actionLoading || disabled || view.kind !== 'participant') return
    setActionLoading(true)
    try {
      await undoOnsiteRegistrationCheckIn(view.data.registration_id)
      if (mountedRef.current) {
        setUndoConfirm(false)
        resetToScan()
      }
    } catch (err: any) {
      if (mountedRef.current) setView({ kind: 'error', message: err?.message || 'Errore imprevisto.' })
    } finally {
      if (mountedRef.current) setActionLoading(false)
    }
  }

  function resetToScan() {
    lastScannedRef.current = null
    setUndoConfirm(false)
    setView({ kind: 'idle' })
    startCamera()
  }

  const isConfirmed = view.kind === 'participant' && view.data.registration_status === 'confirmed'
  const isCheckedIn = view.kind === 'participant' && !!view.data.checked_in_at

  return (
    <div className="flex flex-col gap-4 w-full max-w-md mx-auto" style={{ fontSize: '14px' }}>
      {/* Camera viewport */}
      <div
        id={containerIdRef.current}
        className="w-full rounded-lg overflow-hidden bg-gray-900"
        style={{ minHeight: cameraActive ? 280 : 0, display: cameraActive ? 'block' : 'none' }}
      />

      {/* Camera controls */}
      {view.kind === 'idle' || view.kind === 'error' ? (
        <div className="flex gap-2">
          {!cameraActive ? (
            <button
              type="button"
              onClick={startCamera}
              disabled={disabled}
              className="flex-1 py-3 px-4 rounded-lg font-medium text-white bg-blue-600 disabled:opacity-50 transition-opacity"
              aria-label="Avvia fotocamera"
            >
              Avvia fotocamera
            </button>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              disabled={disabled}
              className="flex-1 py-3 px-4 rounded-lg font-medium text-white bg-gray-600 disabled:opacity-50 transition-opacity"
              aria-label="Ferma fotocamera"
            >
              Ferma fotocamera
            </button>
          )}
        </div>
      ) : null}

      {/* Manual fallback */}
      {(view.kind === 'idle' || view.kind === 'error') && (
        <div className="flex gap-2">
          <input
            type="password"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit() }}
            placeholder="Inserisci codice manualmente"
            autoComplete="off"
            disabled={disabled}
            aria-label="Codice QR manuale"
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleManualSubmit}
            disabled={disabled || !manualToken.trim()}
            className="px-4 py-2.5 rounded-lg font-medium text-white bg-blue-600 disabled:opacity-50 transition-opacity text-sm"
          >
            Verifica codice
          </button>
        </div>
      )}

      {/* Loading */}
      {view.kind === 'loading' && (
        <div className="text-center py-8 text-gray-500" role="status" aria-live="polite">
          Verifica in corso...
        </div>
      )}

      {/* Error */}
      {view.kind === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm" role="alert">
          {view.message}
        </div>
      )}

      {/* Participant card */}
      {view.kind === 'participant' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">
            {[view.data.first_name, view.data.last_name].filter(Boolean).join(' ') || '—'}
          </h3>
          {view.data.company && <p className="text-sm text-gray-600">{view.data.company}</p>}
          {view.data.job_title && <p className="text-sm text-gray-500">{view.data.job_title}</p>}

          <div className="flex flex-wrap gap-2 mt-2">
            <span
              className="inline-block px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ fontSize: '12px' }}
            >
              {view.data.registration_status === 'confirmed' ? (
                <span className="bg-green-100 text-green-800 px-2.5 py-1 rounded-full">Confermato</span>
              ) : view.data.registration_status === 'waitlist' ? (
                <span className="bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-full">Lista d'attesa</span>
              ) : (
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{view.data.registration_status}</span>
              )}
            </span>
          </div>

          {isCheckedIn && view.data.checked_in_at && (
            <p className="text-sm text-green-700 font-medium">
              Check-in: {new Date(view.data.checked_in_at).toLocaleString('it-IT')}
            </p>
          )}

          {/* Alerts */}
          {view.data.dietary_requirements && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800" style={{ fontSize: '12px' }}>
              <strong>Dieta:</strong> {view.data.dietary_requirements}
            </div>
          )}
          {view.data.accessibility_requirements && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800" style={{ fontSize: '12px' }}>
              <strong>Accessibilità:</strong> {view.data.accessibility_requirements}
            </div>
          )}

          {/* Actions */}
          {!isConfirmed && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
              Registrazione non confermata. Check-in non disponibile.
            </div>
          )}

          {isConfirmed && !isCheckedIn && (
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={actionLoading || disabled}
              className="w-full py-3 px-4 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors text-base"
            >
              {actionLoading ? 'In corso...' : 'Conferma check-in'}
            </button>
          )}

          {isConfirmed && isCheckedIn && !undoConfirm && (
            <button
              type="button"
              onClick={() => setUndoConfirm(true)}
              disabled={actionLoading || disabled}
              className="w-full py-3 px-4 rounded-lg font-medium text-red-700 border border-red-300 hover:bg-red-50 disabled:opacity-50 transition-colors text-sm"
            >
              Annulla check-in
            </button>
          )}

          {undoConfirm && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <p className="text-sm text-red-800">Confermi di voler annullare il check-in?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleUndoCheckIn}
                  disabled={actionLoading || disabled}
                  className="flex-1 py-2 px-3 rounded-lg font-medium text-white bg-red-600 disabled:opacity-50 text-sm"
                >
                  {actionLoading ? 'In corso...' : 'Conferma annullamento'}
                </button>
                <button
                  type="button"
                  onClick={() => setUndoConfirm(false)}
                  disabled={actionLoading}
                  className="flex-1 py-2 px-3 rounded-lg font-medium text-gray-700 bg-gray-100 disabled:opacity-50 text-sm"
                >
                  Annulla
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success state */}
      {view.kind === 'success' && (
        <div className="bg-green-50 border-2 border-green-400 rounded-xl p-8 text-center">
          <div className="text-5xl mb-3">&#10003;</div>
          <h3 className="text-xl font-bold text-green-800">Check-in completato</h3>
        </div>
      )}

      {/* Reset button */}
      {(view.kind === 'participant' || view.kind === 'success') && (
        <button
          type="button"
          onClick={resetToScan}
          disabled={disabled}
          className="w-full py-3 px-4 rounded-lg font-medium text-blue-700 border border-blue-300 hover:bg-blue-50 disabled:opacity-50 transition-colors text-sm"
        >
          Scansiona un altro partecipante
        </button>
      )}
    </div>
  )
}
