export default function BrandE({ size = 14, className = '' }: { size?: number; className?: string }) {
  const gap = size * 0.18
  const barH = size * 0.12
  const barW = size * 0.55
  const fullW = size * 0.65
  return (
    <span className={className} style={{
      display: 'inline-flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: `${gap}px`,
      width: `${size * 0.5}px`,
      height: `${size}px`,
      verticalAlign: 'middle',
      marginBottom: `${size * 0.04}px`,
    }}>
      <span style={{ width: `${fullW}px`, height: `${barH}px`, background: 'var(--red2)', borderRadius: '1px' }} />
      <span style={{ width: `${barW}px`, height: `${barH}px`, background: 'var(--red2)', borderRadius: '1px' }} />
      <span style={{ width: `${fullW}px`, height: `${barH}px`, background: 'var(--red2)', borderRadius: '1px' }} />
    </span>
  )
}
