import { useState, useEffect, useRef } from 'react'
import { checkEventPermission } from '@/lib/event-members-service'
import OnsiteQrScanner from '@/components/OnsiteQrScanner'

interface Props {
  eventId: string
  eventName: string
  isArchived?: boolean
}

type PermState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'granted' }

export default function EventOnsitePanel({ eventId, eventName, isArchived }: Props) {
  const [perm, setPerm] = useState<PermState>({ kind: 'loading' })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function check() {
      setPerm({ kind: 'loading' })
      const [canOnsite, canRegistration] = await Promise.all([
        checkEventPermission(eventId, 'can_access_onsite'),
        checkEventPermission(eventId, 'can_manage_registration'),
      ])
      if (cancelled || !mountedRef.current) return
      setPerm(canOnsite || canRegistration ? { kind: 'granted' } : { kind: 'denied' })
    }

    check()
    return () => { cancelled = true }
  }, [eventId])

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto px-4 py-6 gap-5" style={{ fontSize: '14px' }}>
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-gray-900">On Site</h2>
        <p className="text-sm text-gray-500 truncate max-w-xs">{eventName}</p>
      </div>

      {perm.kind === 'loading' && (
        <p className="text-gray-500 py-8" role="status">Caricamento...</p>
      )}

      {perm.kind === 'denied' && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-orange-800 text-sm text-center">
          Non hai i permessi per accedere alle operazioni On Site.
        </div>
      )}

      {perm.kind === 'granted' && isArchived && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-gray-600 text-sm text-center">
          Evento archiviato: operazioni On Site non disponibili.
        </div>
      )}

      {perm.kind === 'granted' && !isArchived && (
        <>
          <p className="text-sm text-gray-600 text-center leading-relaxed">
            Scansiona il pass del partecipante per verificare la registrazione ed effettuare il check-in.
          </p>
          <OnsiteQrScanner eventId={eventId} />
        </>
      )}
    </div>
  )
}
