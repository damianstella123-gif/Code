import Wellness from '@/pages/Wellness'

export default function AreaPersonaleWellness() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '12px 20px',
        background: 'var(--panel2)',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)', flexShrink: 0 }}>
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '0.02em' }}>
          Questi dati sono privati e visibili solo a te. Nessuno in azienda può vederli, nemmeno gli amministratori.
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Wellness />
      </div>
    </div>
  )
}
