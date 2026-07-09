import { MapPin } from 'lucide-react'
import type { Supplier } from '@/data/suppliers'

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function DistanceLogistics({ linkedSuppliers, eventLocation }: { linkedSuppliers: Supplier[]; eventLocation: string }) {
  const geoSuppliers = linkedSuppliers.filter(s => s.latitude && s.longitude)
  if (geoSuppliers.length < 2) return null

  const pairs: { from: Supplier; to: Supplier; km: number }[] = []
  for (let i = 0; i < geoSuppliers.length; i++) {
    for (let j = i + 1; j < geoSuppliers.length; j++) {
      const a = geoSuppliers[i]
      const b = geoSuppliers[j]
      const km = haversineKm(a.latitude!, a.longitude!, b.latitude!, b.longitude!)
      pairs.push({ from: a, to: b, km })
    }
  }
  pairs.sort((a, b) => a.km - b.km)

  return (
    <div className="panel p-5 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--blue) 10%, transparent)' }}>
          <MapPin className="w-4 h-4" style={{ color: 'var(--blue)' }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Distanze e logistica</p>
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Distanze approssimative tra i fornitori con coordinate ({geoSuppliers.length} su {linkedSuppliers.length})
            {eventLocation && <> · Evento: {eventLocation}</>}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--line)' }}>
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ background: 'var(--panel2)' }}>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Da</th>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>A</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Distanza</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: 'var(--muted)' }}>Tempo stimato</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => {
              const driveMin = Math.round((p.km / 60) * 60)
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>
                    <span>{p.from.nome}</span>
                    <span className="ml-1 text-[10px]" style={{ color: 'var(--muted)' }}>({p.from.city || p.from.location})</span>
                  </td>
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--text)' }}>
                    <span>{p.to.nome}</span>
                    <span className="ml-1 text-[10px]" style={{ color: 'var(--muted)' }}>({p.to.city || p.to.location})</span>
                  </td>
                  <td className="text-right px-3 py-2 font-semibold" style={{ color: p.km < 10 ? 'var(--green)' : p.km < 50 ? 'var(--blue)' : 'var(--red2)' }}>
                    {p.km < 1 ? `${Math.round(p.km * 1000)} m` : `${p.km.toFixed(1)} km`}
                  </td>
                  <td className="text-right px-3 py-2" style={{ color: 'var(--muted)' }}>
                    {driveMin < 60 ? `~${driveMin} min` : `~${Math.floor(driveMin / 60)}h ${driveMin % 60}min`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {geoSuppliers.length < linkedSuppliers.length && (
        <p className="text-[10px] mt-2" style={{ color: 'var(--muted)' }}>
          {linkedSuppliers.length - geoSuppliers.length} fornitori senza coordinate non sono inclusi nel calcolo.
          Aggiungi latitudine/longitudine nella scheda fornitore per includerli.
        </p>
      )}
    </div>
  )
}
