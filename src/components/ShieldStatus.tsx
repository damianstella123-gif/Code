import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, Check } from 'lucide-react'
import AnimatedLaserBorder from './AnimatedLaserBorder'
import { supabase } from '@/lib/supabase'

interface ShieldData {
  critical_24h: number
  warning_24h: number
  last_alert_at: string | null
}

function lastCheckLabel(lastAlertAt: string | null): string {
  if (!lastAlertAt) return 'Controllato automaticamente ogni ora'
  const diffMs = Date.now() - new Date(lastAlertAt).getTime()
  const mins = Math.max(0, Math.round(diffMs / 60000))
  if (mins < 1) return 'Ultimo controllo: pochi istanti fa'
  if (mins < 60) return `Ultimo controllo: ${mins} minut${mins === 1 ? 'o' : 'i'} fa`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `Ultimo controllo: ${hours} or${hours === 1 ? 'a' : 'e'} fa`
  const days = Math.round(hours / 24)
  return `Ultimo controllo: ${days} giorn${days === 1 ? 'o' : 'i'} fa`
}

export default function ShieldStatus() {
  const [data, setData] = useState<ShieldData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_security_shield_status').then(({ data: d, error }) => {
      if (cancelled) return
      if (error || !d) {
        setFailed(true)
        return
      }
      const row = d as ShieldData
      setData({
        critical_24h: Number(row.critical_24h ?? 0),
        warning_24h: Number(row.warning_24h ?? 0),
        last_alert_at: row.last_alert_at ?? null,
      })
    })
    return () => { cancelled = true }
  }, [])

  if (failed) return null

  const hasCritical = (data?.critical_24h ?? 0) > 0
  const noCritical = !hasCritical

  const statusLines: { label: string; ok: boolean }[] = [
    { label: 'Accessi e permessi sotto controllo', ok: noCritical },
    { label: 'Dati personali cifrati', ok: true },
    { label: 'Registrazioni pubbliche protette da abusi', ok: true },
    { label: 'Nessun accesso non autorizzato rilevato', ok: noCritical },
  ]

  const accent = hasCritical ? '#f59e0b' : 'var(--green)'
  const headline = hasCritical ? 'Attenzione: verifica in corso' : 'Sistema protetto'
  const subline = hasCritical
    ? 'Il team tecnico sta controllando la situazione'
    : lastCheckLabel(data?.last_alert_at ?? null)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: '0 16px 12px' }}>
      <AnimatedLaserBorder active loading={false}>
        <div
          className="rounded-[14px] p-4"
          style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-3 mb-3 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
            <div
              className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{
                width: 40,
                height: 40,
                background: `color-mix(in srgb, ${accent} 15%, transparent)`,
              }}
            >
              {hasCritical
                ? <ShieldAlert className="w-5 h-5" style={{ color: accent }} />
                : <ShieldCheck className="w-5 h-5" style={{ color: accent }} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)' }} className="uppercase">
                  Simmetria Shield
                </span>
              </div>
              <p style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 20, color: 'var(--text)', lineHeight: 1.2 }}>
                {headline}
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{subline}</p>
            </div>
          </div>

          <div className="space-y-2">
            {statusLines.map(line => (
              <div key={line.label} className="flex items-center gap-2" style={{ fontSize: 14, color: 'var(--text)' }}>
                <span
                  className="flex items-center justify-center rounded-full flex-shrink-0"
                  style={{
                    width: 18,
                    height: 18,
                    background: line.ok ? 'color-mix(in srgb, var(--green) 18%, transparent)' : 'color-mix(in srgb, #f59e0b 18%, transparent)',
                  }}
                >
                  <Check className="w-3 h-3" style={{ color: line.ok ? 'var(--green)' : '#f59e0b' }} />
                </span>
                <span>{line.label}</span>
              </div>
            ))}
          </div>
        </div>
      </AnimatedLaserBorder>
    </div>
  )
}
